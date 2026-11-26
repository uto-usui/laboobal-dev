# 依頼: 生成したままのきれいな面を、骨で動かせるようにして Web に出す

`docs/toy-character/README.md` の 2026-11-19 の最後の行で決めたとおり、見せる面を、生成したままの高密度の体と頭に戻します。並べた画像は `.work/toy-character/demo/zoom/separate.png`（左が体、中が頭、右が組み合わせたもの）と `.work/toy-character/demo/zoom/stages.png` です。作者は右の見た目（色も生成のまま）でよいとしました。工程 6〜11 で作った曲げられる体と骨は、ウェイトの元として使います。髪はなびかせません。

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。書き込むのは `scripts/toy-character/`、`.work/toy-character/`、`src/demos/toy-figure/` の中だけ。コミットはしないでください。Blender の処理は `build.py` に新しい段 `display` として足し（今ある段は残す）、`.work/toy-character/display/` に出力してください。Blender の外の処理は `.work/toy-character/venv-geo/` の環境を使い、足した依存と版を `log.md` に書いてください。`log.md` は段ごとに書き足してください。頂点の位置を数値で書いて形を作ることはしません。

## 入力

- 体: 元の GLB（`.work/toy-character/img3d/out/v4-noglasses.glb`）を全高 1 m にそろえたもの（`fidelity` 段と同じ）。古い頭の部分（部位ラベル 0、1）を外す
- 頭: seed 42 の頭とキャップを、位置と大きさだけ合わせたもの（`fidelity` 段の `body-with-head` と同じ組み合わせ）
- 骨とウェイトの元: `--stage export` の `character-export.blend` の骨（20 本）と、曲げられる体（`body`）
- 目と眼鏡: `--stage eyes` と `--stage export` の目の画像（3 コマのアトラス、黒目、開口のマスク）、投影のカメラ（`eyes/projection-camera.json`）、眼鏡

## やること

1. **面を減らす（UV と色を保つ）**: 体と頭それぞれを、UV の継ぎ目を守ったまま減らす。生成した GLB は UV の継ぎ目で頂点が分かれているので、位置だけで溶接すると継ぎ目が崩れる（前に、溶接せずに Collapse したら面が砕け、位置だけで溶接したら UV が崩れた）。UV 付きの減らし方（pymeshlab の `meshing_decimation_quadric_edge_collapse_with_texture` など）を使う。色の画像は元のものをそのまま使う（焼き直さない）
2. **どこまで減らすかを測って決める**: 全体（体＋頭）で 10 万・20 万・40 万三角形の 3 段を作り、それぞれで次を測る。
   - 元の高密度と同じ画角・同じ光のレンダとの差（顔の拡大と全身。髪の毛束のカクつきが見えないか）
   - GLB の大きさ（工程 11 と同じ meshopt と WebP で圧縮したもの）
   - Web での描画の速さ（下の「Web で確かめること」の測り方）
     見た目の差が目で分からず、GLB が 15 MiB 以内で、スマホ相当の条件で 30fps を保てる、いちばん少ない段を採る。どれも満たさないときは、満たさない項目と値を書いて、見た目を優先した段を採る
3. **ウェイトを写す**: 体の各頂点に、曲げられる体の最も近い面からウェイトを写す（Data Transfer、Nearest Face Interpolated）。表と裏の二重の皮、袖の中の腕、ズボンの中の脚も、近くの外側の面と同じウェイトになるようにする。1 頂点の影響は 4 本まで、正規化する。頭・髪・キャップは head に 1.0
4. **首のつなぎ目**: `fidelity` の `body-with-head` と同じ重ね方にする。首のポーズ（左右 25°、上下 10°）でつなぎ目のすき間や段が見えないかを確かめる。見える場合は、場所と大きさを書く（直し方は報告してから決める）
5. **目と眼鏡**: 工程 9 の目の画像を、同じカメラで新しい頭の目のまわりへ投影し、まぶたの 3 コマと黒目の層を作り直す（工程 9 と同じ方法、同じ部品名とマテリアル名 `eye_lids`、`eye_iris`）。顔に描かれている元の黒目は、目の範囲だけ消す。眼鏡は工程 11 のもの（`glasses_frame`、`glasses_lens`）を head の子にする
6. **書き出し**: 工程 11 と同じ部品名（`body`、`head_face`、`hair`、`eye_lids`、`eye_iris`、`glasses_frame`、`glasses_lens`。髪と顔が 1 つの部品なら、そう書いて名前をそろえる）、骨、圧縮で GLB にし、glTF Validator でエラー 0。`src/demos/toy-figure/assets/character.glb` を置き換える。`main.ts` が部品名や AO に依存しているところは、新しい GLB に合わせて直す（元の色の画像には陰が描き込まれているので、AO は付けないか弱くする）

## Web で確かめること

`pnpm dev` か `pnpm preview` で `/toy-figure/` を開き、Playwright（Chrome、GPU）で撮る。

- `web-desktop.png`（1440×900、devicePixelRatio 2）の全身と、顔・胴の拡大（`.work/toy-character/demo/zoom/` の face.png、body.png と同じ範囲で並べる）
- `web-follow.png`: マウスを四隅に置いたときの 4 枚（首・上半身の曲がり、つなぎ目、袖や胴の皮の突き抜けがないか）
- `web-blink.png`: まばたきの途中
- 速さ: デスクトップ（1440×900、dpr 2）と、スマホ相当（390×844、dpr 3、CDP の CPU throttling 4 倍）で、5 秒間のフレーム時間の中央値と P95。読み込み開始から最初の描画まで

## 最終回答

日本語で、結論から。3 段の比較（見た目の差、GLB の大きさ、速さ）と採った段、ウェイトの写し方と、ポーズでの皮の突き抜けやつなぎ目の様子、目と眼鏡の作り直し、Validator の結果、変えた `main.ts` の箇所、まだ足りないところ、置いた仮定。前置きと繰り返しは削る。
