# 頭の制作スクリプト

リポジトリのルートで実行します。Blender 5.2.2、ImageMagickの`magick`、`python3`を使います。外部のPythonパッケージは不要です。

```sh
blender -b --factory-startup -P scripts/toy-character/build.py -- --stage head --out .work/toy-character/head
```

Blenderの既存のシーンや保存済みのモデルを入力にせず、毎回すべて組み立てます。乱数は使いません。出力先は`.work/toy-character/`内に制限しています。失敗を終了コードで扱う場合は、Blenderの引数に`--python-exit-code 1`を加えます。

同じ環境で2回作り直し、頂点・面・シェイプキー・頂点色を含む形状ハッシュが一致することを確認しています。EEVEEのレンダには、正規化RMSEで最大約0.000015の画素差が残ります。PNGの画素まで完全に一致することは保証しません。

## ファイルの役割

- `build.py`: 段階の選択、シーンの初期化、スタジオの光、カメラ、レンダ、保存を扱います。
- `geometry.py`: 四角面のパッチ、球、線、マテリアルなどの共通の道具です。
- `head.py`: 顔、目、まぶた、眉、髪、眼鏡、首を組みます。全身やリグの段を足すときも、この頭の生成は独立して呼べます。
- `compare.py`: ImageMagickで下絵を切り出し、横並び、50%重ね合わせ、まばたきの一覧を作ります。
- `validate.py`: 四角面、眼球の原点、顔とまぶたの縁、21状態のまばたきの干渉、形状のハッシュ、面数を記録します。

## 寸法と部品

全高1mに対して、正面の頭頂からあごまで354px、頭頂から靴底まで1177pxと読み取り、頭を約0.301mにしました。+Zが上、顔は-Y、Lはキャラクターから見た左（+X）です。

`head_skin`は四角面のみで、鼻と頬は同じ面の変形で作ります。眼窩には四角面の境界を設け、別オブジェクトの`eyelid_L`と`eyelid_R`につなぎます。頭はSubdivision Surfaceのレベル2、まぶたはレベル1です。首は胴体へつなぐ下端を開いてあります。

眼球の原点は球の中心です。虹彩、瞳、ハイライトは眼球の子です。まぶたのシェイプキー`blink_L`と`blink_R`は0で開き、1で閉じます。眼鏡にはレンズを入れていません。

肌の赤みと虹彩の細かい色は頂点色です。マテリアルはPrincipled BSDFと頂点色のみで、SSSには頼っていません。glTFへの書き出し・three.jsでの再現は次の工程で確認します。眼鏡と眉・口の線はCurveなので、書き出す段でメッシュへ変換します。

## 出力と比較の読み方

出力先に`head.blend`と次の画像を作ります。単独のレンダは1024×1024pxです。

| ファイル                                      | 内容                               |
| --------------------------------------------- | ---------------------------------- |
| `front.png`, `side.png`                       | 下絵の切り出しと同じ範囲の平行投影 |
| `reference-front.png`, `reference-side.png`   | 下絵の頭の切り出し                 |
| `compare-front.png`, `compare-side.png`       | 左が下絵、右がレンダ               |
| `overlay-front.png`, `overlay-side.png`       | 下絵とレンダを50%ずつ重ねた画像    |
| `lookdev-front.png`, `lookdev-3q.png`         | 同じ光での正面と水平45度の斜め     |
| `lookdev-compare.png`                         | 下絵、正面、斜めの順               |
| `blink-0.png`, `blink-0.5.png`, `blink-1.png` | まばたきの各状態                   |
| `blink.png`                                   | 左から0、0.5、1                    |
| `validation.json`                             | 形の検査結果                       |

正面は元画像の(397,10)から460×420px、横は(370,10)から同じ大きさで切り出します。上下20pxずつ足して正方形にし、1024pxへ拡大します。カメラの幅は460/1177mで固定し、比較のたびに輪郭を合わせる加工はしません。

形の検査に通ることと、下絵の質に届くことは別です。今回の観察と修正は出力先の`log.md`、途中の画像とその時点の主要スクリプトは`iterations/`に残しています。これらは制作時の記録で、build.pyが過去の観察を書き換えることはありません。

## 生成メッシュの計測と顔の修正（工程 4・5）

```sh
blender -b --factory-startup -P scripts/toy-character/build.py -- --stage prepare
blender -b --factory-startup -P scripts/toy-character/build.py -- --stage face
```

どちらも `img3d/out/v4-noglasses.glb` を読み直して作ります。保存済みの `.blend` は制作の入力にしません。`head` 段は従来どおり使えます。比較画像の組み立てには、実行環境にある Python の Pillow も使います。

- `generated_mesh.py`: インポート変換を適用し、原点を足元の中央に移し、1 µm 以内の同位置頂点をつなぎます。全高は変えず、UV は面の角に保持します。結合で落ちた重複面と潰れた面を別々に数えます。
- `prepare.py`: `part_id`（面の整数属性）を付けます。色・輪郭・面の向きから境界の候補を置き、面の隣接関係で境界付近だけを調整します。物理切断や減面はしません。設計図、全境界の頂点番号、問題の辺ごとの判定根拠を残します。
- `face.py`: 高密度の複製に、顔のラベルと前面の位置で限定した C2 連続の減衰変位を加えます。元メッシュ、UV、三角形の接続を残します。顔の旧分割法線は新しい形から計算し直します。
- `review_images.py`: レンダとデザイン画の固定した切り出しを並べます。比較のために輪郭を変形したり、左右で画角を変えたりしません。

`prepare/` には `source.blend`、`parts.png`、`parts-legend.png`、`landmarks.png`、`landmarks.json`、`parts.json`、`surface-labels.npz`、`topology.json`、`topology-edges.json` を出します。`surface-labels.npz` は面番号順のラベル、色、部位境界の辺を含みます。

非多様体辺は、境界、重複面、面積がほぼゼロの面、局所の両側遮蔽、残る分岐の順に分類します。最後の 2 種は、内部面・本来ない接続の候補です。局所の遮蔽だけで内外を完全に証明したとは扱いません。面を持たない辺も数え、境界は自動で塞ぎません。関節の設計値と推定誤差は JSON に明記しています。癒着した指の関節は、生成メッシュから観測できないため推定です。

`face/` には `face.blend`、`compare-face.png`、`clay-face.png`、`body-face.png` と、個別レンダ、変位量を記録した `measurements.json` を出します。`REVIEW ONLY` コレクションの眼球・まぶた・眼鏡は確認用です。眼窩はこの段では閉じた受け皿で、最終の開口とまぶたは次の工程で作ります。元の目の絵は確認用のマテリアルで肌色に置き換え、埋め込みテクスチャ自体は変更しません。

`--face-pass 1`、`2`、`3` で調整段階を指定できます。既定は 3 です。例えば 1 回目は `--face-pass 1 --out .work/toy-character/face/iterations/01` に残します。実行時のスクリプトも出力先の `script-snapshot/` に保存します。観察は `face/log.md` に手で追記し、自動実行で過去の記録を上書きしません。

45 度のデザイン画は入力にないため、比較シートの 2 段目でも正面 v4 を「FRONT reference」と明記して再掲します。元画像の照明は変更せず、3D の修正前後には同じスタジオとカメラを使います。

保存した `.blend` の検査は `--stage audit` で行います。工程 4・5 の元データ、面の接続・UV・ラベル、顔の範囲外の不変、仮まぶたと球の距離、画像の埋め込みを読み直して確かめ、`audit/validation.json` に書きます。仮の白目には、未加工のこめかみから球が見えないよう、開口内だけを表示する確認用シェーダーも使っています。

## 原画への忠実度を確かめる（fidelity-method.md 手順1〜4）

```sh
zsh scripts/toy-character/fidelity_run.zsh
```

既存の `img3d/env.sh` とローカルの生成モデルが必要です。既定は seed 42 だけです。生成・検査の各入口では `--seeds` で対象を明示できます。今回追加した髪の補修は42専用で、ほかのseedは補修前に停止します。入力・生成条件・GLBのハッシュを照合し、生成済みのものは再生成しません。記録が欠けたり一致しなかったりする場合は、既存出力を保持して停止します。生成の設定は解像度1024、12 steps、gss=10、gsh=7.5、FOV=20°です。

生成を呼ばず、生成済みの頭だけを検査する場合は `zsh scripts/toy-character/fidelity_run.zsh --skip-generation --seeds 42` とします。まず共通カメラの正面・斜め・側面・背面と無地レンダを作ります。実際に開いて検査し、`fidelity_annotations.json` にGLBのハッシュ、穴・二重の耳・髪の欠けの有無、観察を書きます。検査の記録がない場合、別のGLBの記録だった場合、候補がすべて除外された場合は、位置合わせへ進まず停止します。一本だけの場合は順位を付けません。

- `fidelity_input.py`: v4の手動対応点、部位マスク、比較カメラを固定し、眼鏡なしの頭をRGBAで切り出します。原画のRGBへ描き足しません。
- `fidelity_generate.py`: 指定したseedだけを順番に生成し、実行コマンド・入力ハッシュ・所要時間・終了コードを保存します。
- `fidelity_blender.py`: `build.py` の `fidelity-base`、`fidelity-seeds`、`fidelity-inspect`、`fidelity-repair`、`fidelity-rank`、`fidelity-fit` 段です。元GLBを読み直し、作業コピーだけを正規化・変形します。既存の制作段は変更しません。
- `fidelity_inspect.py`: 6方向の無地レンダと、UVの分離頂点を診断用コピーで結合した境界の集計を出します。境界数だけでは欠損と判定せず、レンダで確認します。
- `fidelity_repair.py`: seed 42 の毛束を動かさず、既存の髪の外側の形から約1mm内側に、髪色の連続したキャップを作ります。肌色の面を拾った方向は周囲の髪から補間します。低い後側の赤い襟片を除き、境界の混色面は顔の後ろ・首の外側だけ髪色で隠します。補修前の検査画像は残し、色付きと白い材質の6方向を `repair-review.png` に出します。補修処理のハッシュを記した再検査がない場合は先へ進みません。
- `fidelity_annotations.json`: 各seedの破綻の検査結果と根拠です。検査に通った頭だけに、正面レンダの手動対応点を追加します。
- `fidelity_review.py`: 共通縮尺の比較シート、50%重ね合わせ、対応点・寸法・輪郭の誤差を出します。照明付きと表面色だけの表示を分けます。

出力は `.work/toy-character/fidelity/` です。手動の対応点は、原画1254px座標で管理します。正面レンダの920pxは、原画の460px幅の固定範囲に対応します。目視注釈の不確かさは約1.5pxです。2pxの目標近くの差を、注釈より精密な測定として扱いません。

「小さい残差」の未指定部分は原画12pxを上限とし、それ以上は強制的に合わせません。制御用の低密度メッシュへLaplacian Deformをかけ、首・後頭部・動かさない髪際を固定します。選択したseedは位置合わせの対象であり、基準を外れた結果を採用済みとは扱いません。首は体へ接続せず、眼球・眼鏡の別制作と色の再投影も後工程に残します。

制御用メッシュは、詳細の多い髪へ頂点が偏らないよう、生成頭へ放射方向のレイを当てた4,402頂点の面にします。Laplacian Deformの出力へ固定点と制御点の位置を厳密に適用し、最近傍の制御三角形の重心座標で高密度面へ変位だけを移します。首・後頭部・動かさない髪は高密度面でも固定します。元のUVは残します。

目は開口の左右端・上下端と、その4点の平均で定義した中心を測ります。眼球・まぶたを別に作るため、虹彩の位置・径はこの段の合否へ含めません。頭の輪郭は首を除外し、あごより下の中央100px幅を首として集計から外します。左右の毛先は残します。最終レンダを開いて観察した記録は `fit-visual-review.json` に置き、対象画像のハッシュが一致するときだけ `metrics.json` に反映します。数値の合格、目視の合格、必要ファイルの出力確認は別々に記録します。

`fidelity_run.zsh --skip-generation --seeds 42` は、元GLBから補修用の `repaired-head.blend` を作り直してから位置合わせします。この `.blend` は工程間の中間ファイルで、手作業で変更した `.blend` を制作の正本にはしません。

## 工程7: UVとベイク

```sh
blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage bake
```

入力は `lowpoly10/character-lowpoly10.blend`、元の体のGLB、`fidelity/repaired-head.blend` です。出力は `.work/toy-character/bake/` に置きます。既存の段はそのまま残しています。形・三角形・スムーズ法線・ウェイト・仮骨はハッシュで照合し、UV・縫い目・材質だけを追加します。

`bake.py` が Blender の処理、`bake_images.py` が UV の厳密な重なりと間隔の測定、同部位の未対応画素の補間、縮小、比較画像の組み立てを受け持ちます。既存の `.work/toy-character/venv-geo/`（NumPy、SciPy、Pillow）と、出力先の `vendor/` に置いた Shapely 2.2.0 を使います。Shapely がなければ、作業用の出力先に入れます。

```sh
mkdir -p .work/toy-character/bake/tmp
UV_CACHE_DIR="$PWD/.work/toy-character/bake/cache" TMPDIR="$PWD/.work/toy-character/bake/tmp" \
  uv pip install --python .work/toy-character/venv-geo/bin/python \
  --target .work/toy-character/bake/vendor --no-deps shapely==2.2.0
```

`BAKE_PHASE=prepare|transfer|finish|render|verify` で途中から実行できます。`transfer` は入力と設定の記録が一致する場合だけ保存済みの部位画像を再使用します。入力が違えば再ベイクします。`log.md` は追記し、測定値は `metrics.json`、入力保持の再検査は `saved-verification.json` に残します。

部位を限定した短い光線を使うため、明示的な cage は使いません。`cage_extrusion` は3mm、`max_ray_distance` は部位ごとに4–5mmです。UVの島間を実測で2048px相当40pxにするため、packの片側余白は40/4096です。ベイク自体は余白なしで対応マスクも取り、島内の未対応画素を埋めてから片側32pxの余白を作ります。同部位でも接線法線のZが負になる内向きの殻の法線は未対応に含め、外向きの面で補います。色はヒットを保持し、未対応の色は同じ部位の3D上の近傍で埋めます。頭のキャップは元から画像を持たない黒の定数材質なので、その値を焼きます。

最終の `character-bake.blend` は色・接線法線（+Y）・粗さの2048px画像を同梱します。`metallic-roughness.png` は1024px、G=粗さ・B=元のmetallic値です。首は体側の首ラベルだけを、頭の首元の肌の中央値で埋めます。元のキャップのSpecular IOR Level=0も別材質で保持します。デザイン画からの投影、目の部品やボーンの変更は行いません。

## 工程10〜11: 骨の確定、AO、GLB

```sh
blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage export
```

入力は `eyes/character-eyes.blend` です。出力は `.work/toy-character/export/` に置きます。`EXPORT_PHASE=prepare|ao|install|compress|render|verify` で再開できます。各段は `log.md` へ追記します。`prepare` は入力を読み直し、`ao` は工程7の高密度チェックポイントを参照します。`export_stage.py` が Blender、`export_images.py` が画像、`export_glb.mjs` が圧縮と検査、`export_verify.py` が保存後の検査を受け持ちます。

骨は `character_rig` の20本です。root → spine.lower → spine.upper → spine.chest → neck → head、腕と脚は入力のままです。工程6の10回目のBlendを直接読み、全骨の親子・頭尾・軸行列が一致することを検査します。首の左右はBlender世界Z、上下は世界Xで、親とrest軸を通して回します。glTFでは世界Yが上です。上半身左8度は `spine.upper` と `spine.chest` に4度ずつ配ります。アニメーションとモーフは書き出しません。

部品とマテリアルはともに `body`、`head_face`、`hair`、`eye_lids`、`eye_iris`、`glasses_frame`、`glasses_lens` です。フレームとレンズはheadの子のままです。眼鏡の中心線は動かさず、v4の左右の縁の上端・下端付近の12断面を測り、その中央値を直径にします。対応点の1177px/mを使い、金属と肌の色差の25%を境界とします。読み取りの不確かさは原画0.5pxです。測定点と値は `glasses-measurement.json` とPNGに残します。

AOは高密度の体・頭・髪を参照し、80mmの距離、32サンプルで2048pxへ焼きます。体と顔は共通の `character-orm.png`、髪は `hair-orm.png` にR=AO、G=粗さ、B=金属をまとめます。元メッシュの細かな重なりで陰が強くなるため、glTFのocclusion強度は0.35です。体・顔の色と法線、髪の色は2048px、髪の法線とORMは1024pxです。画像を縮めてもUVは動かしません。

目の受け渡しは次のとおりです。

- `eye_lids` は元の顔の同じ1751面を分けたものです。元の `BakeUV` と `EyeProjection` を残し、3コマ用に `EyeAtlas` を加えます。`eye-lids-atlas` は1536×512px、左から開く・半分・閉じるです。baseColorTextureのUVを1/3ずつずらして切り替えます。
- `eye_iris` の色と透明度は1024×1024pxの `eye-iris` です。baseColorTextureのUVだけを視線でずらします。範囲は部品のextrasにあります。
- 固定の開口マスクは1536×512pxの `eye-aperture-orm` のRです。`eye_iris` のocclusionTextureに保存し、occlusion強度は0にします。Web側では動かした黒目のalphaに、別のUVで引いたこのRを掛けます。開口側のUVはまぶたと同じコマを選び、視線では動かしません。標準glTFの材質だけでは、この2つのUVを独立に合成できません。必要な情報はextrasにも入っています。

Nodeのツールはpnpm dlxで動かします。glTF Transform 4.5.1のCLIで可逆WebPにし、同じSDKのmeshoptエンコーダーで量子化や非可逆フィルターを使わず圧縮します。標準のmeshoptコマンドはウェイトなども量子化するため使いません。`toktx` がない環境の方式です。WebPは配信容量を減らしますが、KTX2のようなGPU上の圧縮にはなりません。KTX2を使う環境では、画像の一致判定を非可逆圧縮向けに設計し直す必要があります。

`pnpm dlx gltf-validator` はパッケージに実行ファイルがなく `ERR_PNPM_DLX_NO_BIN` になるため、pnpm dlxで同じ公式パッケージを取得し、JS/WASM APIを呼びます。圧縮前・後・復号後をそれぞれ検査します。位置・法線・UV・ウェイト・bind行列はアクセサのバイトを照合します。meshoptが三角形の頂点順を循環させる場合は、向きを保った接続で比較します。SDKが小さなTRS値を省略するのを避けるため、骨と部品のTRSは元GLBのJSON値を保持します。

Blenderはmeshoptを直接読めないため、圧縮後の `character.glb` をSDKで復号して `character-decoded.glb` を作り、これを読み戻します。レンダではglTFのAOを色へ0.35で掛け、目には上記の独立マスクを接続します。Blenderの一枚面の屈折は視線をずらすため、厚さ0のレンズは工程9と同じ透明面＋Fresnel反射（IOR 1.45、被膜係数0.2）で確認します。GLB内は薄い透過材質です。この確認用の変換とWebの照明実装は別です。

出力は `character-export.blend`、配信用の `character.glb`、読み戻した `character-roundtrip.blend`、`export-check.png`、`ao-compare.png`、`glasses-thickness.png`、`eye-downsize-check.png`、`metrics.json`、ValidatorのJSONです。`export-check.png` の工程9側の左向きは首のみ25度で、出力側には上半身8度も入るため、その違いをラベルに記します。拡大で見える髪の三角形の陰と、閉眼時の浅いくぼみは入力にもある形で、この段では形を変えません。
