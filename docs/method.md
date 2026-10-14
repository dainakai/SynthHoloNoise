# SHN: method and scope

[日本語](method.ja.md) · [README](../README.md) · [Browser demo](https://dainakai.github.io/SynthHoloNoise/)

SHN (SynthHoloNoise) summarizes the patterns and fluctuations that remain in experimental holograms after background removal, generates new realizations with random numbers, and adds them to a clean image.
This document defines both the extraction of presets from experimental images and the application of noise to a user's images.
The original implementation was named `addnoise4`; the saved model was named `experimental_variation_residual_v1`.

## Inputs, outputs, and settings

The input is a two-dimensional hologram **intensity image** produced by the user's own generator.
It is neither a complex optical field nor a list of particle positions.
SHN does not recompute particle scattering or light propagation: it generates an additive field whose amplitude does not depend on the input signal's brightness.

The main controls are `preset`, which selects the noise structure and reference amplitudes, and `strength`, which scales all components together.
The random `seed` controls reproducibility.
The source `camera` and temporal segment `variant` are advanced settings.
Each preset contains four templates (two cameras × two segments), so preset and strength alone do not uniquely determine a random realization.

IDs `001` through `011` replace the original dates in chronological order.
They do not rank noise strength.
Source dates remain in the metadata for traceability.
For the same template within a preset, strength 0.5 halves the coefficients, 1 uses them unchanged, and 2 doubles them.
Strength 0 returns an image identical to the input at every pixel.

## Selecting experimental images

The original survey considered sequences with a configuration file and at least 10,000 BMP frames.
After excluding duplicate copies, there were 170 sequences, forming 85 camera pairs across 11 acquisition dates.
One representative scene was selected per date: the camera pair whose image mean and image standard deviation were closest to that day's medians.
Specifically, the two features were centered by their within-day medians and divided by their interquartile ranges, with a denominator floor of 0.25.
The scene with the smallest root mean square of the two standardized features was selected.
This chooses a typical scene; it does not cover every extreme condition within a day.

For each of the two cameras in each scene, two segments of 256 frames were sampled from positions near one-third and two-thirds of a 10,917-frame sequence.
Segment starts were aligned with the background-estimation grid of 32 frames described below.
For example, the segments for 2026-07-03 were `[3520, 3776)` and `[7136, 7392)` in zero-based indexing.
The total is 11 dates × 2 cameras × 2 temporal segments = 44 templates.

The common acquisition conditions were a FASTCAM Mini UX100, 1024 × 1024 pixels, 4000 fps, shutter setting 32000, Mono 8-bit storage, and pixel gain mode 1.
The model empirically includes variation across these dates; it does not contain calibration data for other imaging systems.

## Background removal before preset extraction

At each background-estimation position, the pixelwise temporal median is taken over 129 frames: the current frame and 64 frames on either side.
Backgrounds are estimated every 32 frames and linearly interpolated between those positions.
The estimated background is subtracted from each raw image, followed by these corrections in order:

1. Subtract the median over all pixels of the residual image.
2. Calculate the median of each row, subtract the median of that row profile, smooth it with a one-dimensional Gaussian filter with a standard deviation of 3 pixels, and subtract the resulting value from each row.
3. Calculate the median of each column after row correction; center, smooth, and subtract the column profile in the same way.
4. Restore a uniform reference brightness determined from the mean background level, round, and clip to 0–255. No additional two-dimensional low-pass removal is applied.

For segment processing, the reference brightness is the median of the mean brightnesses at the background-estimation positions needed by the two segments.
An existing comparison with processing of the full sequence found a maximum difference of 1 gray level and a mean absolute difference of 0.1146 gray levels, due to the different ranges used to estimate that reference brightness.
SHN learns residual statistics from these corrected 8-bit images.
Users do not need the raw experimental images: the distributed presets are sufficient for generation.

## Decomposition into five components

Let `x` be the horizontal pixel index, `y` the vertical pixel index, and `t` the frame index within a segment.
Write the background-corrected image as `B_t(y,x)`.
Let `M(y,x)` be the pixelwise temporal median of the 256 frames.
Subtracting the median over all pixels of `M` gives the temporally persistent pattern `P(y,x)`:

```text
M(y,x) = median over t of B_t(y,x)
P(y,x) = M(y,x) − median over all pixels of M
```

The original code calculates the temporal median with `torch.median`.
For an even sample count of 256, it returns the lower of the two central values.
A reimplementation of extraction must preserve this distinction from a median that averages the two central values.

| Component | Operation used to extract the source array |
|---|---|
| Low-frequency variation | Two-dimensional Gaussian smoothing of `P`, with a standard deviation of 32 pixels |
| Row bias | Median of each row of `P − low-frequency variation`, smoothed with a standard deviation of 3 pixels |
| Column bias | Median of each column after also removing row bias, smoothed with a standard deviation of 3 pixels |
| Fixed pattern | What remains of `P` after subtracting the three components above |
| Dynamic fluctuation | `B_t − M` for each frame |

A row bias is added to every column in the same row, producing horizontal bands.
A column bias is added to every row in the same column, producing vertical bands.
This decomposition depends on the order of the operations.
It does not uniquely separate the components into individual physical causes.

## Extracting the dynamic component and estimating its amplitude

For each pixel, calculate the median absolute deviation from its temporal median across the 256 frames.
Call this the **temporal MAD**.
Divide the image into 128 × 128-pixel tiles and select the eight tiles with the lowest median temporal MAD.
Extract `B_t − M` from those tiles at eight evenly spaced frame indices within the segment, giving 64 patches.
Before storage, clip values to −127–127 and convert them to signed 8-bit integers.

This procedure favors regions with fewer passing particles.
It does not completely remove weak interference fringes or nearly stationary particles.

The dynamic amplitude coefficient is estimated separately, rather than simply taking the standard deviation of those patches.
Sample pixels at an interval of eight pixels in each spatial direction, then retain the half with the lowest temporal MAD.
Collect adjacent-frame differences `d = B_t − B_(t−1)` at those pixels and calculate:

```text
σD = median(|d − median(d)|) / (0.67448975 × √2)
```

Here, `σD` is the stored dynamic coefficient, measured in 8-bit digital numbers (DN), where 1 DN is one gray level.
For independent Gaussian noise, the standard deviation of adjacent-frame differences is √2 times the standard deviation of a single frame.
For a Gaussian distribution, the MAD is approximately 0.67449 times its standard deviation.
The formula uses these two relationships.

The actual data are temporally correlated and not exactly Gaussian.
Consequently, `σD` is a **reference coefficient inferred from adjacent-frame differences**, not an exact measurement of the experimental dynamic standard deviation or sensor read noise.
For example, for Gaussian noise with adjacent-frame correlation `ρ`, this difference-based estimate is approximately `√(1−ρ)` times the original standard deviation.
The original code does not correct the coefficient using that correlation.

Temporal correlation is calculated from vectors of the same quiet pixels after subtracting their pixelwise temporal medians.
Let `v` and `w` contain adjacent-frame values, concatenated across all adjacent-frame pairs.
The estimator is the normalized inner product `dot(v,w)/sqrt(dot(v,v)dot(w,w))`.
Its definition is not exactly the same as a Pearson correlation that separately centers each vector by its mean.

## What a preset stores

To separate amplitude from structure, the low-frequency, row, column, and fixed components are each normalized to mean 0 and standard deviation 1.
Their original four standard deviations are stored as separate coefficients.

| Stored array | Shape per template | Purpose |
|---|---|---|
| Low-frequency field | 128 × 128 | Source 1024 × 1024 field reduced with area interpolation |
| Row profile | 1024 | Horizontal band structure |
| Column profile | 1024 | Vertical band structure |
| Fixed Fourier amplitude | 1024 × 513 | Absolute value of the two-dimensional real FFT of the fixed pattern |
| Dynamic Fourier amplitude | 128 × 65 | Mean amplitude from the 64 patches |
| Dynamic quantiles | 257 | Pixel values at probabilities 0, 1/256, …, 1 |

Each dynamic patch is centered by its own mean, then all 64 patches are divided by their pooled standard deviation.
A two-dimensional Hann window is applied to each patch before the FFT, and the **mean of the amplitudes** is calculated.
This is not the same as averaging power spectra.
The quantiles are calculated over all normalized patches before windowing.
The fixed and dynamic amplitude spectra are each scaled to a maximum of 1.
Most arrays are stored as float16; the shared quantile probabilities are float32.

The denominator floor for normalization is `1e-4` during model construction and `1e-5` during synthesis.
These floors prevent division by zero for nearly constant arrays.

The SHN distribution splits the original arrays into 44 files without re-estimating their values.
The total is approximately 41 MB, or about 1 MB per template.
The distribution does not include the original experimental residual images, particle coordinates, or absolute filesystem paths.

## Synthesizing new patterns

In the following, `U(A)` means subtracting the mean of array `A` and dividing by its standard deviation:

```text
U(A) = (A − mean(A)) / max(std(A), 1e−5)
```

**Low-frequency variation `L(y,x)`** is generated by bicubically interpolating the 128 × 128 template to the input image size, then rotating it by a randomly selected 0, 90, 180, or 270 degrees.
It is flipped vertically and horizontally, each with probability 0.5, and randomly shifted circularly in both directions.
A circular shift wraps values that pass one edge back around from the opposite edge.
Finally, `U` is applied.

**Row bias `R(y)` and column bias `C(x)`** are generated by independently shifting the stored one-dimensional profiles circularly, then applying `U`.
`R(y)` adds the same value to every pixel of row `y`; `C(x)` adds the same value to every pixel of column `x`.

**The fixed pattern `F(y,x)`** is generated from the stored amplitude spectrum `AF` and new random phases.
Let `W` be an image of independent standard normal random values, and let `FFT(W)` denote its two-dimensional real FFT.
The phase-only array `phase` and the fixed pattern are:

```text
phase = FFT(W) / max(|FFT(W)|, 1e−12)  # evaluated at each frequency
F = U(inverse_real_FFT(AF × phase))
```

The stored amplitude describes how strongly different spatial scales and directions contribute to the pattern.
Using new phases avoids pasting the original fixed image directly onto an input.
Within a sequence, the generated `L,R,C,F` are retained.

**The dynamic component** begins with a standardized field `G_t`, generated from the dynamic amplitude spectrum `AD` and new random phases.
Before use, `AD` is shifted to center its vertical frequency axis, linearly interpolated onto the output real-FFT grid, then shifted back.
Although phases derived from Gaussian random values produce a Gaussian-like field, its pixel distribution is not guaranteed to be exactly Gaussian.

Next, apply the standard normal cumulative distribution function `Φ`.
For example, `Φ(0)=0.5` and `Φ(1.645)≈0.95`.
Pass the resulting probabilities to the stored quantile function `QD`, linearly interpolating between its 257 points.
For example, 0.95 maps to the 95th percentile of the experimental patches.

```text
G_t = U(inverse_real_FFT(AD × new random phases))
E_t = U(QD(Φ(G_t)))
```

`E_t` is the newly generated dynamic pattern for that frame.
The first frame uses `D_0=E_0`.
Subsequent frames mix it with the preceding dynamic field `D_(t−1)`:

```text
ρ = clip(stored adjacent-frame correlation, 0, 0.9)
D_t = U(ρ D_(t−1) + √(1−ρ²) E_t)
```

This is an AR(1)-type update.
Larger `ρ` retains more of the preceding pattern.
Negative measured correlations are clipped to 0 and are therefore not reproduced.
The coefficient is defined per frame and is not automatically converted for a different frame rate.
The original code resets the dynamic state when the template changes.
In SHN, each generator owns one template; changing templates means creating a new generator.

## Combining components and saving the image

Each zero-mean, unit-standard-deviation pattern is multiplied by its stored coefficient.
Let the coefficients be `σL,σR,σC,σF,σD`, the user-selected strength be `s`, and the clean image be `I_t`.
The addition `N_t` and the 8-bit output `J_t` are:

```text
N_t(y,x) = s [σL L(y,x) + σR R(y) + σC C(x) + σF F(y,x) + σD D_t(y,x)]
J_t(y,x) = clip(round(I_t(y,x) + N_t(y,x)), 0, 255)
```

Rounding uses NumPy's `rint`: values exactly halfway between integers are rounded to the nearest even integer.
`N_t` is the addition before rounding.
The displayed difference `J_t − I_t` includes the effects of integer conversion and clipping.
Because the five components can be correlated, the standard deviation of their sum is not the simple sum of their coefficients.

The original code also had four additional component multipliers: low-frequency variation, rows and columns together, fixed pattern, and dynamic fluctuation.
All were 1 in the reference benchmark.
The standard SHN 1.0 API preserves those relative weights and can return the individual component arrays.

## Numerical example from the reference image

The referenced wide350 image used 2026-07-03, camera C002, the first temporal segment, original template ID 42, and strength 0.5.
In SHN, these correspond to preset `011`, camera `C002`, variant `001`, and template `043`.

| Component | Stored coefficient (DN) | Coefficient at strength 0.5 (DN) |
|---|---:|---:|
| Low-frequency variation | 0.08533808 | 0.04266904 |
| Row | 0.01471724 | 0.00735862 |
| Column | 0.02018261 | 0.01009131 |
| Fixed | 0.54449898 | 0.27224949 |
| Dynamic | 8.38686466 | 4.19343233 |

The adjacent-frame correlation is `ρ=0.43130368`.
The dynamic component accounts for most of the amplitude under these settings.
The difference in the first saved reference image had a mean of approximately `0.00001144 DN`, standard deviation `4.21282769 DN`, minimum `−28 DN`, and maximum `31 DN`.

Centering the 64 dynamic patches from the same source segment by their individual means gives a pooled pixel standard deviation of `12.1299 DN`.
This differs from the stored coefficient, `8.3869 DN`.
This measured example also shows why strength 1 cannot be described as reproducing the experimental dynamic standard deviation directly.
SHN leaves this coefficient unchanged to maintain compatibility with the reference benchmark.

## Still images, sequences, and camera pairs

A still image only requires the initial dynamic component `D_0`.
For video, retain the same preset and template and process all frames in order.
Selecting widely separated frames first and treating them as consecutive changes the temporal relationship represented by the model.
Even at strength 0, an SHN generator advances its random and temporal states to preserve alignment with the next frame.

The original training script had both a mode that sampled the 11 dates with equal probability and a fixed-date mode.
It could additionally resample date and strength either per sequence or per frame.
Camera pairs with matching filenames were assigned the same date and strength, but each camera used its own template and separately generated random fields.
Measured pixelwise noise correlations between cameras are not modeled.

In SHN, camera pairs can be handled by creating two generators with the same preset and strength but different cameras and seeds.
For independent training images, sample the 11 presets uniformly when randomizing the source date.
Changing presets within a sequence also changes its fixed pattern; keep the preset fixed per sequence when simulating a stable imaging system.

The original benchmark used a single random number generator to process all 3000 C001 images, followed by all 3000 C002 images.
Calling SHN on one C002 image with the same seed does not reproduce that saved image pixel for pixel, because the random numbers are consumed in a different order.
Reproduction requires matching the library, model, seed, settings, and input order.
Small floating-point differences across numerical library versions or CPU/WASM execution may affect integer rounding, so record versions as well.

## Checks performed and limitations

The original model evaluation compared 12 standardized residual features.
The median between-date distance was 1.331, while the within-date distance was 0.430: a ratio of approximately 3.10.
This supports retaining multiple acquisition dates; it does not mean a threefold improvement in detection accuracy.
A comparison of 24 images with only strength varied gave a coefficient of determination of 0.999993 for the linear relation between strength and added-residual RMS.
All 24 images at strength 0 were identical to their inputs at every pixel.
These checks verify strength control, not effectiveness on another instrument or downstream detection performance.

During extraction into SHN, the original experimental statistics arrays were verified to be unchanged, and the first C001 benchmark image from the original code was reproduced with every pixel matching.
At the native image size, the new API's unrounded addition also matched the original code exactly in that check.
The public tests include comparison against an independently generated numerical reference from the original code, zero strength, proportional scaling, temporal correlation, and pixel-value unit conversion.

The following limits apply:

1. The model represents additive residuals after background removal. It does not generate the full illumination of raw images or the physics of photon detection.
2. Noise amplitude does not depend on the local brightness of the clean image. Shot noise and signal-dependent multiplicative noise require separate models.
3. Each component has mean 0. Stored experimental mean brightness is retained for provenance and is not used in synthesis.
4. Weak particle fringes may remain in temporal medians or quiet patches. The method does not completely separate pure sensor noise.
5. Randomizing phase does not preserve the locations of source defects or nonstationary structures. Low-frequency, row, and column components use transformed experimental patterns.
6. Quantile mapping and temporal mixing do not guarantee an exact simultaneous match to both the spectrum and pixel-value distribution.
7. There is one representative scene per day. Extreme within-day conditions are not exhaustively represented.
8. Interpolation to arbitrary image sizes is an approximation in pixel space. It does not automatically recalibrate for physical pixel size, field of view, frame rate, or exposure changes.
9. Converting from 8-bit DN to another range changes amplitude units. It does not constitute learning the quantization properties of a 12-bit or 16-bit sensor.

## Computation on GitHub Pages

GitHub Pages serves static files such as HTML, CSS, and JavaScript.
The demo uses Pyodide's WebAssembly Python runtime to execute the same NumPy, SciPy, and OpenCV operations as the distributed package in the browser.
Computation runs in a Web Worker, separate from the interface.
Only the required template file is downloaded; the input image is read from the user's device memory.

Device performance, the initial Python runtime download, and available memory affect use of the demo.
It accepts images up to 2048 pixels on either side and 32 MB per file; use the Python package for large image sequences.
Although the site is static, the visitor's computer can perform random generation and FFTs, so this demo requires no server-side computation.

Official documentation: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Pyodide Web Workers](https://pyodide.org/en/stable/usage/webworker.html), and [packages available in Pyodide](https://pyodide.org/en/stable/usage/packages-in-pyodide.html).
