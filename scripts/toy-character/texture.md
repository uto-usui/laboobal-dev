# 色のまだらを切り分ける段

`build.py --stage texture` は、display2 の形と骨を使い、4案だけを実際のデモで比較する。出力は `.work/toy-character/texture/`。コミットはしない。

```sh
blender -b --factory-startup --python-exit-code 1 -t 16 -P scripts/toy-character/build.py -- --stage texture
```

デモの開発サーバーを4410番で起動しておく。既存の `venv-geo` の NumPy、SciPy、OpenCV、Pillow、Playwright と xatlas 0.0.11、インストール済みの Chrome を使う。xatlas がない場合は `uv pip install --python .work/toy-character/venv-geo/bin/python xatlas==0.0.11` で作業用の環境だけに足す。GLBの処理は従来と同じglTF Transform 4.5.1とglTF Validatorをpnpm dlxで読む。

段の一部だけを再実行するときは `TEXTURE_PHASE` に `bake`、`process`、`export`、`compress`、`web`、`measure`、`finish` を指定する。`finish` は採用したGLBの配置と、作業用コピーでの `pnpm verify` まで行う。測った値による選択は `selection.json` に残す。画像を見た判断で変える場合は `TEXTURE_SELECTED=2` などを指定する。

## 比較条件

0は配置されていたdisplay2のGLB。1は体の色だけ4096pxの生成元に戻し、可逆WebPにする。0には2048pxへの縮小と品質75のWebP圧縮が入っているため、0と1は解像度だけの厳密な一因子比較ではない。2は同じ面から新UVへEmissionを4096pxで焼き、2048pxへ縮めたもの。3は2へ色の境目をまたがないbilateralを加えたもの。2と3の色画像は品質85のWebP、写し直した粗さ・金属度は品質40で保存する。

UV計算用コピーの同位置の頂点をつなぎ、微細な凹凸だけをならしてから [xatlas](https://github.com/jpcy/xatlas) で展開する。実物の面と位置は動かさない。襟の切断で残った多角形もそのまま保ち、UVだけを別の帯に平面展開する。元UVからのEmissionベイクは [BlenderのRender Baking](https://docs.blender.org/manual/en/3.6/render/cycles/baking.html) に従い、照明を加えず、周囲へ32px広げる。粗さ・金属度も同じ元画像からEmissionで新UVへ写し、色と共通のUVを使う。値をならすフィルターは加えない。元UVを残して容量を増やさずに済む。

フィルターは2048pxで、直径21のbilateralを2回使う。HSVの赤・橙・黄・緑・青・紫・無彩色を互いに重ならないマスクにし、各画素へ別マスクの色を混ぜない。マスク外側の参照値は同じマスクの最寄りの値で埋める。顔と髪を含む頭の画像は、暗く彩度の低い部分をならす。対象は主に髪で、顔の暗い陰も一部含む。明るい肌と、別部品の目の画像・面・UVは変えない。

撮影は実際の `main.ts` に計測用の値をHTTP応答上だけで足す。照明、Neutralトーンマッピング、露出1、1440×900、DPR2、Chrome/Metalをそろえる。呼吸とまばたきを止め、正面の静止姿勢を使う。拡大は `camera.setViewOffset(1440,900,500,300,440,275)`。元の作者スクリーンショットは添付されていないので、説明に従って胸・両袖・手が入る範囲を採る。

高周波成分と小さな点は、同じ画像座標の服の内側を測る。点の数は小さく色が違う連結領域の数で、面そのものを数えた値ではない。範囲としきい値は `measurements.json` に残し、測った範囲の画像も各案へ出す。大きなしわの帯域の値も残す。数値に加え、`compare-sleeve.png`、`uv-before-after.png`、`web-desktop.png` を実際に開いて見る。

形・法線・ウェイトはBlender内と、書き出したGLBの各三角形の隅の値で比較する。UVによる頂点の分割やmeshoptによる並べ替えを除き、元の面が同じかを確かめる。骨と逆バインド行列、圧縮版と展開版のValidatorも確認する。

`pnpm verify` は書き込みを作業用フォルダーの中へ収めるため、ソースをコピーして走らせる。コピーだけChrome/Metalと4ワーカーを指定する。元のPlaywright設定と4410番の開発サーバーは変えない。結果、コピーしたソースとの一致、配置したGLBのハッシュは `metrics.json` に記録する。
