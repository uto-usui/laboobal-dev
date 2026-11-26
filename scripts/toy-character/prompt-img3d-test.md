# 依頼: 画像から 3D を作るツールを手元の Mac で 1 回動かし、Blender で組んだ頭と比べる

Blender の Python だけで組んだ頭（`.work/toy-character/head/`）は、8 版回してもデザイン画の質に届きませんでした。比べる相手として、デザイン画から 3D メッシュを作るツールを実際に動かし、同じ条件でレンダして並べます。採用するかは作者が決めるので、今回は比べる材料を作るところまでです。

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。ツールの取得・ビルド・モデルのダウンロードは `.work/toy-character/img3d/` の中で行い、リポジトリのほかの場所にツールを置かないでください。書き込むのは `.work/toy-character/` と `scripts/toy-character/` の中だけ。コミットはしないでください。

## 環境

Apple M5 Max、メモリ 128GB、NVIDIA GPU なし。フル Xcode 27.2 あり。Blender 5.2.2（`blender`）、`uv`、ImageMagick（`magick`）あり。システムの Python は 3.14 なので、ツールごとに `uv` で別の Python 環境を作る。

## 入力

1. `docs/toy-character/design/v4.png`（そのまま）
2. 眼鏡なし版: 内蔵の画像生成ツールに v4.png を `referenced_image_paths` で渡し、眼鏡だけを消した絵を作って `.work/toy-character/img3d/input/v4-noglasses.png` に保存する。ほかは何も変えない
   背景の除去が要るツールなら、ツールに付いている方法を使う。BRIA RMBG は非商用の条件があるので使わない。

## 試す順番（どれか 1 つが動いたら、その先は試さない）

1. Pixal3D の Mac 向け移植。AssetFurnace（https://github.com/Bingeljell/image-to-3dlab）の `scripts/bootstrap_pixal3d.py --yes` と `scripts/pixal3d_generate.py` を使う。README とスクリプトを読んでから動かす
2. 1 が 1 時間ほど詰まったら、TRELLIS.2 の MLX 移植（https://github.com/pedronaugusto/trellis2-apple）
3. それもだめなら、Hugging Face の公式 Space（`microsoft/TRELLIS.2` か `TencentARC/Pixal3D`）を `gradio_client` で匿名で 1 回だけ呼ぶ。`view_api()` で引数を確かめてから

2 つの入力それぞれで 1 回ずつ生成し、`.work/toy-character/img3d/out/` に GLB を置く。seed は固定して記録する。

## 比べる

Blender で生成した GLB を読み込み、`.work/toy-character/head/` の lookdev と同じ光・同じカメラの考え方でレンダする（`scripts/toy-character/` にある lookdev の処理を使い回してよい）。

- `.work/toy-character/img3d/compare-head.png`: 頭のあたりを、左から「デザイン画の頭」「Blender で組んだ頭（lookdev-front.png）」「生成メッシュの頭（v4）」「生成メッシュの頭（眼鏡なし）」の順に並べる。正面と斜め 45 度の 2 段
- `.work/toy-character/img3d/body-views.png`: 良かったほうの生成メッシュの全身を、正面・斜め 45 度・横・背面の 4 方向で並べる。デザイン画（正面）も左端に置く
- 白い材質（テクスチャを外した）での正面と斜めも 1 枚（`.work/toy-character/img3d/clay.png`）。形そのものの出来を見るため

レンダは自分で開いて見ること。

## 最終回答

日本語で、結論から。どのツールで動いたか（動かなかったものはエラーの要点）、セットアップと生成にかかった時間、メモリの使い方の目安、生成メッシュの三角形の数とテクスチャの有無と解像度、レンダのパス。見て分かったこと（髪・顔・目・眼鏡・服のしわ・手・靴の出来、腕や脚が胴とくっついていないか、Blender で組んだ頭と比べてどうか）。前置きと繰り返しは削る。手順は `.work/toy-character/img3d/log.md` に残す。
