"""The same SHN implementation runs in CPython and in the browser via Pyodide.

Amplitudes are calibrated in 8-bit digital numbers (DN). Other value ranges
use an explicit linear unit conversion, never image-dependent normalization.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import copy
import hashlib
import json
import warnings

import cv2
import numpy as np
from scipy.special import ndtr

DATA = Path(__file__).parent / "data"
NATIVE_SHAPE = (1024, 1024)
MODEL_VERSION = "1.0.0"


def _catalog(data_dir: Path) -> dict:
    return json.loads((data_dir / "catalog.json").read_text(encoding="utf-8"))


def list_presets() -> list[dict]:
    """Return the eleven presets, including provenance and component amplitudes."""
    return _catalog(DATA)["presets"]


def _unit(array: np.ndarray) -> np.ndarray:
    value = array.astype(np.float32)
    value -= np.mean(value)
    return value / max(float(np.std(value)), 1e-5)


def _transform(array: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    value = np.rot90(array, int(rng.integers(0, 4)))
    if rng.random() < 0.5:
        value = np.flip(value, axis=0)
    if rng.random() < 0.5:
        value = np.flip(value, axis=1)
    return np.roll(value, (int(rng.integers(value.shape[0])), int(rng.integers(value.shape[1]))), axis=(0, 1))


def _from_amplitude(amplitude: np.ndarray, shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    height, width = shape
    amp = amplitude.astype(np.float32)
    if amp.shape != (height, width // 2 + 1):
        amp = np.fft.fftshift(amp, axes=0)
        amp = cv2.resize(amp, (width // 2 + 1, height), interpolation=cv2.INTER_LINEAR)
        amp = np.fft.ifftshift(amp, axes=0)
    phase_source = np.fft.rfft2(rng.normal(size=shape).astype(np.float32))
    phase = phase_source / np.maximum(np.abs(phase_source), 1e-12)
    field = np.fft.irfft2(amp * phase, s=shape).real.astype(np.float32)
    return _unit(field)


def _strength(value: float) -> float:
    value = float(value)
    if not np.isfinite(value) or value < 0:
        raise ValueError("strength must be finite and nonnegative")
    return value


def _validate_image(image, value_range):
    image = np.asarray(image)
    if image.ndim != 2 or min(image.shape) < 2:
        raise ValueError("image must be a 2-D grayscale array, at least 2 × 2 pixels")
    if image.dtype not in (np.dtype('uint8'), np.dtype('uint16'), np.dtype('float32'), np.dtype('float64')):
        raise TypeError("image dtype must be uint8, uint16, float32, or float64")
    if not np.isfinite(image).all():
        raise ValueError("image contains NaN or infinity")
    if value_range is None:
        if image.dtype.kind == 'f':
            raise ValueError("Floating-point images require value_range=(min, max), e.g. (0, 1)")
        value_range = (0, np.iinfo(image.dtype).max)
    if len(value_range) != 2:
        raise ValueError("value_range must contain two values")
    lo, hi = map(float, value_range)
    if not np.isfinite([lo, hi]).all() or hi <= lo:
        raise ValueError("value_range must be finite and increasing")
    if image.dtype.kind == 'u' and (lo < 0 or hi > np.iinfo(image.dtype).max):
        raise ValueError("value_range exceeds the storage dtype")
    if np.min(image) < lo or np.max(image) > hi:
        raise ValueError("image values fall outside value_range")
    return image, lo, hi


@dataclass
class NoiseResult:
    """Output, pre-quantization addition, saved-image difference, and provenance.

    All arrays are in the input image's units. Components include strength.
    metadata is JSON serializable. input is never modified.
    """
    image: np.ndarray
    noise: np.ndarray
    difference: np.ndarray
    components: dict[str, np.ndarray]
    metadata: dict


class NoiseGenerator:
    """Stateful SHN generator for a single image shape and one sequence.

    preset: '001'...'011' (chronological identifiers, not strength rankings).
    camera: source camera profile, C001 or C002; no physical camera is needed.
    variant: '001' or '002' source segment; None samples one using seed.
    seed: a nonnegative integer. Default 0 is deliberately reproducible.

    Create a new instance for an independent sequence. For consecutive frames,
    reuse an instance so the four static components and dynamic AR(1) state persist.
    """

    def __init__(self, preset: str = "011", strength: float = 0.5, seed: int = 0,
                 camera: str = "C002", variant: str | None = "001", *,
                 data_dir: str | Path | None = None):
        if isinstance(seed, bool) or not isinstance(seed, (int, np.integer)) or int(seed) < 0:
            raise ValueError("seed must be a nonnegative integer")
        self.seed = int(seed)
        self.rng = np.random.default_rng(self.seed)
        self.strength = _strength(strength)
        self.data_dir = Path(data_dir) if data_dir is not None else DATA
        catalog = _catalog(self.data_dir)
        selected = next((p for p in catalog['presets'] if p['id'] == preset), None)
        if selected is None:
            raise ValueError("Unknown preset; use a zero-padded ID from '001' to '011'")
        eligible = [p for p in selected['templates'] if p['camera'] == camera]
        if not eligible:
            raise ValueError("camera must be C001 or C002")
        if variant is None:
            profile = eligible[int(self.rng.integers(len(eligible)))]
        else:
            profile = next((p for p in eligible if p['variant'] == variant), None)
            if profile is None:
                raise ValueError("variant must be '001', '002', or None")
        self.profile = copy.deepcopy(profile)
        self.preset = preset
        self.source_date = selected['source_date']
        path = self.data_dir / profile['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != profile['sha256']:
            raise ValueError("Template checksum mismatch; reinstall the original model assets")
        with np.load(path, allow_pickle=False) as packed:
            self.arrays = {key: packed[key] for key in packed.files}
        self._shape = None
        self._static = None
        self._previous = None
        self.frame_index = 0

    def _initialize(self, shape):
        shape = tuple(shape)
        if len(shape) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, np.integer)) or n < 2 for n in shape):
            raise ValueError("shape must be (height, width), both integers >= 2")
        shape = tuple(map(int, shape))
        if self._shape is not None:
            if shape != self._shape:
                raise ValueError("Image shape changed within a sequence; create a new NoiseGenerator")
            return
        if shape != NATIVE_SHAPE:
            warnings.warn("SHN templates were calibrated at 1024 × 1024; resampling is a pixel-space approximation, not a new physical calibration.", UserWarning, stacklevel=3)
        height, width = shape
        low = cv2.resize(self.arrays['lowfield_templates'].astype(np.float32), (width, height), interpolation=cv2.INTER_CUBIC)
        low = _transform(low, self.rng)
        # A quarter-turn swaps rectangular dimensions. Restore the requested shape.
        if low.shape != shape:
            low = cv2.resize(low, (width, height), interpolation=cv2.INTER_CUBIC)
        row = self.arrays['row_profile_templates'].astype(np.float32)
        row = np.roll(row, int(self.rng.integers(len(row))))
        col = self.arrays['column_profile_templates'].astype(np.float32)
        col = np.roll(col, int(self.rng.integers(len(col))))
        if len(row) != height:
            row = cv2.resize(row[None, :], (height, 1), interpolation=cv2.INTER_LINEAR)[0]
        if len(col) != width:
            col = cv2.resize(col[None, :], (width, 1), interpolation=cv2.INTER_LINEAR)[0]
        fixed = _from_amplitude(self.arrays['fixed_amplitude_spectra'], shape, self.rng)
        self._static = {'lowfield': _unit(low), 'row': _unit(row)[:, None], 'column': _unit(col)[None, :], 'fixed': fixed}
        self._shape = shape

    def sample(self, shape=(1024, 1024), *, strength: float | None = None) -> tuple[np.ndarray, dict, dict]:
        """Advance one frame; return (noise_DN, components_DN, metadata).

        Works without a clean image. State advances even at strength zero so
        a scheduled zero-strength frame does not silently change time or RNG order.
        """
        strength = self.strength if strength is None else _strength(strength)
        self._initialize(shape)
        a = self.arrays
        gaussian = _from_amplitude(a['dynamic_amplitude_spectra'], self._shape, self.rng)
        probability = ndtr(gaussian).astype(np.float32)
        dynamic = np.interp(probability.ravel(), a['dynamic_quantile_probabilities'], a['dynamic_quantiles']).reshape(self._shape)
        dynamic = _unit(dynamic)
        rho = float(self.profile['rho'])
        if self._previous is not None:
            dynamic = _unit(rho * self._previous + np.sqrt(max(0., 1. - rho * rho)) * dynamic)
        self._previous = dynamic
        sigmas = self.profile['sigmas']
        # Match the original float32 arithmetic and component addition order.
        fields = {name: float(sigmas[name]) * value for name, value in self._static.items()}
        fields['dynamic'] = float(sigmas['dynamic']) * dynamic
        residual = fields['lowfield'] + (fields['row'] + fields['column']) + fields['fixed'] + fields['dynamic']
        noise = strength * residual
        components = {key: strength * value for key, value in fields.items()}
        metadata = {
            'method': 'SHN', 'model_version': MODEL_VERSION,
            'preset': self.preset, 'source_date': self.source_date,
            'camera': self.profile['camera'], 'variant': self.profile['variant'],
            'template_id': self.profile['id'], 'source_template_id': self.profile['source_template_id'],
            'template_sha256': self.profile['sha256'], 'seed': self.seed,
            'frame_index': self.frame_index, 'strength': strength, 'shape': list(self._shape),
            'native_shape': list(NATIVE_SHAPE), 'resampled': self._shape != NATIVE_SHAPE,
            'rho': rho, 'sigmas_dn': dict(sigmas),
            'numpy_version': np.__version__, 'opencv_version': cv2.__version__,
            'rng': 'numpy.random.PCG64',
        }
        self.frame_index += 1
        return noise, components, metadata

    def apply(self, image, *, value_range=None, strength: float | None = None,
              return_details: bool = False) -> np.ndarray | NoiseResult:
        """Add one frame of noise, clip to value_range, and preserve input dtype.

        uint8 defaults to (0,255), uint16 to (0,65535). Float inputs require
        value_range, e.g. (0,1). For 12-bit data stored in uint16 use (0,4095).
        No min/max contrast stretch or gamma conversion is performed.
        """
        image, lo, hi = _validate_image(image, value_range)
        noise, components, metadata = self.sample(image.shape, strength=strength)
        scale = (hi - lo) / 255.0
        noise = noise * scale
        work = image.astype(np.float64 if image.dtype == np.float64 else np.float32) + noise
        clipped = (work < lo) | (work > hi)
        if image.dtype.kind == 'u':
            work = np.rint(work)
        output = np.clip(work, lo, hi).astype(image.dtype)
        if metadata['strength'] == 0:
            output = image.copy()
        if not return_details:
            return output
        difference = output.astype(np.float64) - image.astype(np.float64)
        metadata.update({'dtype': str(image.dtype), 'value_range': [lo, hi], 'dn_to_input_scale': scale,
                         'clipped_fraction': float(np.mean(clipped)),
                         'difference': {'mean': float(difference.mean()), 'std': float(difference.std()),
                                        'min': float(difference.min()), 'max': float(difference.max())}})
        return NoiseResult(output, noise, difference,
                           {name: value * scale for name, value in components.items()}, metadata)


def add_noise(image, preset: str = '011', strength: float = 0.5, seed: int = 0,
              *, camera: str = 'C002', variant: str | None = '001',
              value_range=None, return_details: bool = False):
    """Add SHN to one independent image. Use NoiseGenerator for a sequence."""
    generator = NoiseGenerator(preset=preset, strength=strength, seed=seed, camera=camera, variant=variant)
    return generator.apply(image, value_range=value_range, return_details=return_details)
