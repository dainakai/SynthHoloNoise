# SynthHoloNoise

**SHNは、実験の背景除去後に残る模様と揺らぎを合成ホログラムへ追加するPythonライブラリです。**
既存のホログラム生成器が出力した濃淡画像へ適用できます。

[ブラウザデモ](https://dainakai.github.io/SynthHoloNoise/) / [手法の詳細](docs/method.ja.md) / [全APIと利用条件（英語）](README.md)

![Clean、Noisy、差分](docs/example.png)

## インストールと最小例

```bash
python -m pip install "git+https://github.com/dainakai/SynthHoloNoise.git"
```

```python
import numpy as np
from PIL import Image
from synthholonoise import add_noise

clean = np.asarray(Image.open("clean.png"))  # 2次元のuint8濃淡画像
noisy = add_noise(clean, preset="011", strength=0.5, seed=260628)
Image.fromarray(noisy).save("noisy.png")
```

主設定は**プリセット**と**強度**です。
プリセットは模様の周波数特性、成分の大きさ、画素値分布、時間的な持続を選びます。
`001`〜`011`は強い順の番号ではありません。
強度0は追加なし、0.5は保存係数の半分、1は保存係数をそのまま使います。

乱数シードが同じなら同じ処理条件で再現できます。
詳細設定の`camera`は`C001`か`C002`、`variant`は時間区間`001`か`002`です。
既定値は`preset="011", strength=0.5, seed=0, camera="C002", variant="001"`です。

## 連続画像

```python
from synthholonoise import NoiseGenerator

generator = NoiseGenerator(preset="011", strength=0.5, seed=260628)
for clean in clean_frames:
    noisy = generator.apply(clean)
```

同じ生成器を使うことで、固定成分は同じ模様を保ち、動的成分は前のフレームと相関を持ちます。
同じシードで`add_noise`を毎回呼ぶと、同じ最初のノイズを繰り返します。
独立画像の場合はシードを変えます。

```bash
shn clean.png noisy.png --preset 011 --strength 0.5 --seed 260628
shn clean_frames/ noisy_frames/ --preset 011 --strength 0.5 --seed 260628
shn --list-presets
```

ファイルと設定JSONを保存します。
既存の出力は上書きしません。
連続画像のファイル名はゼロパディングして並び順を固定してください。

## 画素値の単位

`uint8`は0〜255、`uint16`は0〜65535を既定値域にします。
浮動小数点入力は`value_range=(0, 1)`などを明示してください。
12-bitデータを`uint16`に格納した画像には`value_range=(0, 4095)`を使います。
入力画像ごとの最小値と最大値を使った正規化は行いません。

```python
result = add_noise(clean, return_details=True)
result.image       # 丸めとクリッピング後の画像
result.noise       # 丸め前の追加量
result.difference  # 保存画像と元画像の差
result.metadata    # 再現に必要な設定と統計
```

元の計測条件は1024×1024画素です。
別サイズには模様を補間して適用しますが、別の画素ピッチや装置に合わせた校正ではありません。
RGB画像や複素数の光波面は受け付けません。

## 適用範囲

11撮影日、2台のカメラ、2つの時間区間から得た44テンプレートを使います。
同じ光学系と背景除去条件の残差を表す経験モデルです。
強度1が実験画像全体の標準偏差を再現する保証はありません。
動的成分の係数は隣接差から推定した値で、画素値分布と時間相関は近似です。
入力の明るさに依存するショットノイズや、撮影日ごとの平均輝度差は生成しません。

デモの初期言語は英語です。画面上部で日本語へ切り替えられ、選んだ言語はブラウザに保存します。
言語を切り替えても設定と計算結果は保持します。
デモも同じPythonコードをブラウザ内で実行します。
画像はサーバーへ送信せず、計算結果、設定JSON、丸め前の追加量を保存できます。
抽出の全手順、数式、制約は[手法の詳細](docs/method.ja.md)に記載しています。

[手法の詳細の英語版](docs/method.md)も用意しています。
