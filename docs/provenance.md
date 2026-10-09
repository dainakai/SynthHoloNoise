# Provenance and compatibility

SHN 1.0.0 is extracted from the author's historical **addnoise4**, also named `experimental_variation_residual_v1`. It packages the residual generator independently of hologram rendering, particle labels, reconstruction, and experiment storage.

The source bank consists of 44 templates from 11 acquisition dates, two cameras, and two time segments. Its original compressed NPZ SHA-256 is:

```text
db45a7f239d398f7f6e6e0549e0b7253f1d9aa8271fe4d2a0ab7b042a638c5c2
```

The arrays were split into individual template archives without changing values. `src/synthholonoise/data/catalog.json` contains source dates, original template IDs, current IDs, amplitudes, measured and clipped temporal correlation, file sizes, and individual SHA-256 hashes. Source filesystem paths and experimental image frames are excluded.

The original procedural sources inspected during extraction were:

- `process_raw_adaptive_samples.py`: representative spans, adaptive preprocessing, residual decomposition, quiet-patch selection, difference-MAD coefficient, and normalized lag-one inner product.
- `build_generalized_noise_model.py`: normalization, Fourier amplitudes, Hann-window patch averaging, quantiles, and half-precision packing.
- `apply_generalized_noise.py`: random phase synthesis, quantile mapping, AR(1) update, component addition, rounding, and clipping.
- `backrem_adaptive.py`: the background-removal operators used before model fitting.

The native 1024 × 1024 formula and the stored coefficients are retained. A first-camera historical benchmark image (C001, source template 40, strength 0.5, seed 260628) was reproduced pixel-for-pixel during extraction. The new generator with `camera='C001', variant=None, seed=260628` produced exactly the same additive field in that native-size audit. The checked-in tests include numerical samples produced independently from the historical code. Cross-library and cross-platform floating-point results are tested with a small numerical tolerance; byte identity across arbitrary dependency versions is not promised.

The default browser example uses a clean synthetic image from the wide350 data, seed 260628, C002, first frame. The browser creates a **new** realization from the published API. The historical C002 noise image consumed RNG state after 3000 C001 frames, so a new single-image call with the same integer seed is not a claim to reproduce that historical realization.

Intentional API changes:

1. Stable public preset IDs `001`–`011` replace date strings. Dates remain provenance; source template 42 becomes template `043`.
2. Camera and segment selection is explicit. The default is C002/001. A new generator has its own RNG; camera processing order does not implicitly change another generator's results.
3. Arbitrary rectangular image shapes are supported by resampling row/column profiles and correcting dimensions after quarter-turns. Such shapes are marked as resampled and are not newly calibrated physical models.
4. Input dtype and value range are validated. RGB is not silently converted; floating-point units must be explicit.
5. Zero-strength frames still advance state, so a zero setting does not alter subsequent RNG or temporal progression. The optimized historical dataset script skipped this work on zero frames.
6. The default component multipliers remain 1. The API returns component arrays for custom composition instead of silently altering the measured ratios.
7. The original CLI's domain-mixture convenience is expressed through user-side preset sampling. For camera pairs, share preset/strength but use separate source cameras and independent seeds.

The robust adjacent-difference coefficient is not corrected for temporal correlation in SHN 1.0. Changing that coefficient would change the historical model, so any recalibration should receive a new model version. The source-mean field is retained as metadata but does not enter synthesis.

The package code, derived template assets, and included synthetic example are distributed under the repository MIT license. No raw experimental frames or particle labels are included.
