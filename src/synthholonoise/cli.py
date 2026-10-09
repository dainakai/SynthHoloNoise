"""File and sequence interface. Inputs are never overwritten."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from .core import NoiseGenerator, list_presets


def load_image(path: Path) -> np.ndarray:
    if path.suffix.lower() == '.npy':
        return np.load(path, allow_pickle=False)
    with Image.open(path) as image:
        array = np.asarray(image).copy()
        if array.ndim != 2:
            raise ValueError('Use a grayscale image; RGB images are not silently converted')
        # Some Pillow versions expose 16-bit PNG as mode I / int32.
        if array.dtype == np.int32 and image.mode == 'I' and path.suffix.lower() == '.png' and array.min() >= 0 and array.max() <= 65535:
            array = array.astype(np.uint16)
        return array


def save_image(path: Path, array: np.ndarray):
    if path.suffix.lower() == '.npy':
        np.save(path, array, allow_pickle=False)
    else:
        if array.dtype.kind == 'f' and path.suffix.lower() not in ('.tif', '.tiff'):
            raise ValueError('Save float arrays as .npy or .tiff')
        if array.dtype == np.float64:
            raise ValueError('Save float64 arrays as .npy to retain precision')
        Image.fromarray(array).save(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description='SHN residual noise for grayscale synthetic holograms')
    parser.add_argument('input', nargs='?', type=Path, help='PNG/TIFF/BMP/NPY file, or directory of ordered frames')
    parser.add_argument('output', nargs='?', type=Path, help='new output file/directory (never overwrite)')
    parser.add_argument('--preset', default='011')
    parser.add_argument('--strength', type=float, default=0.5)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--camera', choices=['C001', 'C002'], default='C002')
    parser.add_argument('--variant', choices=['001', '002', 'random'], default='001')
    parser.add_argument('--range', dest='value_range', type=float, nargs=2, metavar=('MIN','MAX'))
    parser.add_argument('--independent', action='store_true', help='treat directory frames as independent, using seed + index')
    parser.add_argument('--list-presets', action='store_true')
    args = parser.parse_args(argv)
    if args.list_presets:
        for p in list_presets():
            print(f"{p['id']}  {len(p['templates'])} templates  source date {p['source_date']}")
        return
    if args.input is None or args.output is None:
        parser.error('input and output are required unless --list-presets is used')
    try:
        if args.output.exists() or Path(str(args.output) + '.shn.json').exists():
            raise ValueError('Output or metadata already exists; choose a new destination')
        is_sequence = args.input.is_dir()
        paths = sorted(p for p in args.input.iterdir() if p.suffix.lower() in ('.png','.tif','.tiff','.bmp','.npy')) if is_sequence else [args.input]
        if not paths:
            raise ValueError('No supported frames found')
        config = dict(preset=args.preset, strength=args.strength, seed=args.seed, camera=args.camera,
                      variant=None if args.variant == 'random' else args.variant)
        generator = NoiseGenerator(**config)
        if is_sequence:
            args.output.mkdir(parents=True)
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
        records = []
        for index, path in enumerate(paths):
            if args.independent:
                generator = NoiseGenerator(**{**config, 'seed': args.seed + index})
            result = generator.apply(load_image(path), value_range=args.value_range, return_details=True)
            output = args.output / path.name if is_sequence else args.output
            save_image(output, result.image)
            records.append({'input_name': path.name, 'output_name': output.name, **result.metadata})
        metadata_path = args.output/'shn.json' if is_sequence else Path(str(args.output)+'.shn.json')
        metadata_path.write_text(json.dumps({'sequence_mode': not args.independent, 'frames': records}, indent=2)+'\n')
        print(f'Saved {len(records)} image(s) to {args.output}; metadata: {metadata_path}')
    except (ValueError, TypeError, OSError) as exc:
        parser.exit(2, f'shn: {exc}\n')


if __name__ == '__main__':
    main()
