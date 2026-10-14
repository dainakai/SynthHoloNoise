export const messages = {
  en: {
    pageTitle: 'SynthHoloNoise — Noise simulator',
    navigation: 'Main navigation', methodLink: 'Detailed method', title: 'Noise simulator',
    description: 'Apply experimental residual noise to a synthetic hologram and compare the result.',
    parameters: 'Parameters', preset: 'Preset', presetOption: 'Preset {id}',
    presetHelp: 'Selects structure and reference amplitudes. IDs do not rank strength.',
    strength: 'Strength', strengthValue: 'Strength value', strengthHelp: '0: no addition. 1: stored coefficients.',
    seed: 'Random seed', newSeed: 'New', newSeedTitle: 'Choose a new random seed', seedHelp: 'Keep the seed to reproduce a realization.',
    advanced: 'Advanced settings', camera: 'Source camera', variant: 'Temporal segment', valueRange: 'Input value range',
    rangeAuto: 'Auto (integer dtype)', rangeFloat: '0–1 (float)',
    rangeHelp: 'Float inputs need an explicit range. Amplitudes are scaled by the range width ÷ 255.',
    resizeHelp: 'Templates are interpolated for sizes other than 1024 × 1024; this does not recalibrate the model for another instrument.',
    calculate: 'Calculate', nextFrame: 'Next frame',
    autoHelp: 'Settings apply automatically. Calculate restarts at frame 0; Next frame advances the noise on the same input.',
    comparison: 'Image comparison', sampleName: 'Sample hologram', sample: 'Use sample', openImage: 'Open image',
    fileHelp: 'Grayscale PNG, TIFF, BMP or NPY · Up to 2048 × 2048 px / 32 MB',
    clean: 'Clean', noisy: 'Noisy', difference: 'Difference', inputCaption: 'Input', outputCaption: 'With SHN', differenceCaption: 'Noisy − Clean',
    cleanAlt: 'Input hologram', noisyAlt: 'Hologram with SHN added', noisyPendingAlt: 'Input image; the first result is being prepared',
    differenceAlt: 'Pixel differences after rounding and clipping', placeholder: 'Waiting for the first result',
    displayPending: 'Clean and Noisy share the same display scale.', differencePending: 'Blue: decrease · Red: increase',
    displayRange: 'Shared display range: {range} (preview only)', differenceRange: '−{limit} ← 0 → +{limit}',
    differenceRangeTitle: 'Blue: decrease · Red: increase',
    statistics: 'Difference statistics', mean: 'Mean', std: 'Standard deviation', minimum: 'Minimum', maximum: 'Maximum',
    framePending: 'Frame 0', frame: 'Frame {frame} · Template {template}',
    statsPending: "Differences use the input's units and include rounding and clipping.",
    statsRange: 'Input units · Value range {range} · Clipped pixels: {clipped}%',
    download: 'Download', saveNoisy: 'Noisy image', saveNoisyFormat: 'Noisy {format}', saveSettings: 'Settings JSON', saveAddition: 'Addition NPY',
    exportHelp: 'Downloads keep the original value scale. Addition NPY contains the noise before rounding and clipping.',
    privacy: 'Images stay in this browser. Python libraries are fetched from jsDelivr; presets are fetched from this site.',
    documentation: 'Method and Python usage', methodTitle: 'Model and scope',
    methodDescription: 'SHN combines low-frequency variation, row and column bias, a fixed pattern, and temporally correlated fluctuations. Its 44 templates come from 11 acquisition dates, two cameras, and two time segments.',
    scope: 'This is an additive model of residuals after background removal. Strength 1 uses the stored coefficients; it does not guarantee the full experimental standard deviation. Signal-dependent shot noise and changes in mean brightness are outside its scope.',
    methodFull: 'Extraction, equations, numerical examples, and limitations', pythonTitle: 'Python usage',
    pythonDescription: 'Use one NoiseGenerator instance for a sequence to retain fixed patterns and temporal correlation.',
    pythonLink: 'Installation and API', license: 'MIT license',
    engineLoading: 'Loading engine…', engineReady: 'Ready', engineBusy: 'Computing…', engineError: 'Engine unavailable',
    initial: 'Preparing Python. The first visit requires downloading the numerical libraries.',
    loadingPython: 'Loading Python. The runtime is downloaded on the first visit.',
    loadingPackages: 'Loading numerical libraries. Your image stays in this browser.',
    loadingTemplate: 'Loading Preset {preset} ({size} MB).', computing: 'Computing noise…',
    complete: 'Complete · {elapsed} s · Preset {preset} / strength {strength} / seed {seed}',
    resampled: 'Templates were interpolated to the input size.', checkingInput: 'Reading image dimensions and dtype…',
    invalidStrength: 'Set strength to a number between 0 and 2.', invalidSeed: 'Set the seed to an integer between 0 and 4294967295.',
    fileTooLarge: 'The browser demo accepts files up to 32 MB. Use the Python package for larger images.',
    sampleFailed: 'The sample image could not be loaded. Check your connection and try again.',
    fileFailed: 'The selected file could not be read. Try opening it again.',
    engineFailed: 'The computation engine could not be loaded. Check your connection and reload this page.',
    errorDetails: 'Technical details', computationFailed: 'The image could not be processed. Check its format and the input value range.',
    invalidDimensions: 'Choose a two-dimensional grayscale image. RGB images are not converted automatically.',
    invalidSize: 'Each image dimension must be between 2 and 2048 pixels. Use the Python package for larger images.',
    rangeRequired: 'Choose an explicit input value range in Advanced settings for this image type.',
    invalidDtype: 'Use uint8, uint16, or a real-valued floating-point image. RGB and complex arrays are not supported.',
    nonfiniteInput: 'The image contains NaN or infinite values. Replace them with finite values before loading it.',
    inputOutOfRange: 'Some image values are outside the selected range. Choose a range that contains every input value.',
    invalidFile: 'This file could not be decoded. Choose a grayscale PNG, TIFF, BMP, or a numeric NPY array.',
    templateFailed: 'The template could not be downloaded. Check your connection and select Calculate to retry.',
  },
  ja: {
    pageTitle: 'SynthHoloNoise — ノイズ生成',
    navigation: 'メインナビゲーション', methodLink: '手法の詳細', title: 'ノイズ生成',
    description: '合成ホログラムに実験由来の残差ノイズを加え、画像と差分を比較します。',
    parameters: 'パラメータ', preset: 'プリセット', presetOption: 'プリセット {id}',
    presetHelp: '模様と基準振幅を選びます。番号は強さの順ではありません。',
    strength: '強度', strengthValue: 'ノイズ強度の数値', strengthHelp: '0：追加なし。1：保存係数を使用。',
    seed: '乱数シード', newSeed: '変更', newSeedTitle: '新しい乱数シードを選ぶ', seedHelp: '同じシードで同じ乱数実現を再現できます。',
    advanced: '詳細設定', camera: '元のカメラ', variant: '元の時間区間', valueRange: '入力の値域',
    rangeAuto: '自動（整数の型から決定）', rangeFloat: '0–1（浮動小数点）',
    rangeHelp: '浮動小数点画像では値域を指定してください。振幅には値域の幅 ÷ 255 を掛けます。',
    resizeHelp: '1024 × 1024以外ではテンプレートを補間します。別の撮影装置に合わせた校正ではありません。',
    calculate: '計算', nextFrame: '次のフレーム',
    autoHelp: '設定変更は自動で反映します。「計算」はフレーム0から再生成し、「次のフレーム」は同じ入力のままノイズの時間を進めます。',
    comparison: '画像比較', sampleName: 'サンプルホログラム', sample: 'サンプルに戻す', openImage: '画像を開く',
    fileHelp: '濃淡画像のPNG・TIFF・BMP・NPY · 各辺2048画素 / 32 MBまで',
    clean: 'Clean', noisy: 'Noisy', difference: '差分', inputCaption: '入力画像', outputCaption: 'SHNを追加', differenceCaption: 'Noisy − Clean',
    cleanAlt: '入力ホログラム', noisyAlt: 'SHNを追加したホログラム', noisyPendingAlt: '初回計算前の入力画像',
    differenceAlt: '丸めとクリッピング後の画素差分', placeholder: '最初の計算結果を待っています',
    displayPending: 'CleanとNoisyは同じ表示スケールで比較します。', differencePending: '青：減少 · 赤：増加',
    displayRange: '共通の表示範囲：{range}（プレビューのみ）', differenceRange: '−{limit} ← 0 → +{limit}',
    differenceRangeTitle: '青：減少 · 赤：増加',
    statistics: '差分の統計', mean: '平均', std: '標準偏差', minimum: '最小', maximum: '最大',
    framePending: 'フレーム 0', frame: 'フレーム {frame} · テンプレート {template}',
    statsPending: '差分は入力と同じ単位で、丸めとクリッピングの影響を含みます。',
    statsRange: '入力と同じ単位 · 値域 {range} · クリッピングされた画素：{clipped}%',
    download: '保存', saveNoisy: 'Noisy画像', saveNoisyFormat: 'Noisy {format}', saveSettings: '設定JSON', saveAddition: '追加量NPY',
    exportHelp: '保存データの値域は変更しません。追加量NPYは丸めとクリッピング前のノイズです。',
    privacy: '画像はこのブラウザ内で処理します。PythonライブラリはjsDelivr、プリセットはこのサイトから取得します。',
    documentation: '手法とPythonでの使い方', methodTitle: 'モデルと適用範囲',
    methodDescription: '広い明暗むら、行と列の偏り、固定模様、時間相関を持つ揺らぎを合成します。11撮影日・2台のカメラ・2つの時間区間から得た44テンプレートを使います。',
    scope: '背景除去後の残差を表す加算モデルです。強度1は保存係数を使う意味で、実験画像全体の標準偏差との一致を保証しません。信号に依存するショットノイズや平均輝度の変化は対象外です。',
    methodFull: '抽出手順・数式・数値例・制限を読む', pythonTitle: 'Pythonでの使い方',
    pythonDescription: '連続画像では同じNoiseGeneratorを使い、固定模様と時間相関を保持します。',
    pythonLink: 'インストールとAPI', license: 'MITライセンス',
    engineLoading: '準備中…', engineReady: '実行可能', engineBusy: '計算中…', engineError: '実行環境を利用できません',
    initial: 'Pythonを準備しています。初回は数値計算ライブラリのダウンロードが必要です。',
    loadingPython: 'Pythonを読み込んでいます。初回は実行環境をダウンロードします。',
    loadingPackages: '数値計算ライブラリを読み込んでいます。画像はブラウザ内に保持します。',
    loadingTemplate: 'プリセット {preset} を読み込んでいます（{size} MB）。', computing: 'ノイズを計算しています…',
    complete: '計算完了 · {elapsed}秒 · プリセット {preset} / 強度 {strength} / シード {seed}',
    resampled: '入力サイズに合わせてテンプレートを補間しました。', checkingInput: '画像サイズとデータ型を確認しています…',
    invalidStrength: '強度は0〜2の数値で指定してください。', invalidSeed: 'シードは0〜4294967295の整数で指定してください。',
    fileTooLarge: 'ブラウザ版の入力上限は32 MBです。大きな画像にはPython版を使ってください。',
    sampleFailed: 'サンプル画像を読み込めませんでした。接続を確認して、もう一度試してください。',
    fileFailed: 'ファイルを読み込めませんでした。もう一度開いてください。',
    engineFailed: '計算環境を読み込めませんでした。接続を確認し、ページを再読み込みしてください。',
    errorDetails: '技術的な詳細', computationFailed: '画像を処理できませんでした。ファイル形式と入力の値域を確認してください。',
    invalidDimensions: '2次元の濃淡画像を選んでください。RGB画像の自動変換は行いません。',
    invalidSize: '各辺2〜2048画素の画像を選んでください。大きな画像にはPython版を使ってください。',
    rangeRequired: 'このデータ型では「詳細設定」で入力の値域を指定してください。',
    invalidDtype: 'uint8・uint16・実数の浮動小数点画像を使ってください。RGB画像や複素数配列は扱えません。',
    nonfiniteInput: '画像にNaNまたは無限大が含まれています。有限の値に修正して読み込んでください。',
    inputOutOfRange: '選択した値域を外れる画素があります。すべての入力値を含む値域を指定してください。',
    invalidFile: 'ファイルを画像として読み込めませんでした。濃淡のPNG・TIFF・BMPまたは数値のNPY配列を選んでください。',
    templateFailed: 'テンプレートを取得できませんでした。接続を確認し、「計算」で再試行してください。',
  },
};

const key = 'shn-language';
let language = 'en';
try { if (localStorage.getItem(key) === 'ja') language = 'ja'; } catch { /* Storage is optional. */ }
export function getLanguage() { return language; }
export function t(id, values = {}) {
  if (!(id in messages[language])) throw new Error(`Unknown translation key: ${id}`);
  return messages[language][id].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}
export function setLanguage(next) {
  if (!(next in messages)) return;
  language = next;
  try { localStorage.setItem(key, next); } catch { /* Private browsing may block storage. */ }
  document.documentElement.lang = next;
  document.title = t('pageTitle');
  document.querySelector('meta[name="description"]').content = t('description');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attribute of ['aria-label', 'title', 'alt']) {
    for (const el of document.querySelectorAll(`[data-i18n-${attribute}]`)) el.setAttribute(attribute, t(el.getAttribute(`data-i18n-${attribute}`)));
  }
  for (const el of document.querySelectorAll('[data-language]')) el.setAttribute('aria-pressed', String(el.dataset.language === next));
  for (const el of document.querySelectorAll('[data-method-link]')) el.href = `https://github.com/dainakai/SynthHoloNoise/blob/main/docs/method${next === 'ja' ? '.ja' : ''}.md`;
  for (const el of document.querySelectorAll('[data-readme-link]')) el.href = next === 'ja' ? 'https://github.com/dainakai/SynthHoloNoise/blob/main/README.ja.md' : 'https://github.com/dainakai/SynthHoloNoise#quick-start';
  document.dispatchEvent(new Event('languagechange'));
}
