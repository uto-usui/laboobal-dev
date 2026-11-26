# 依頼: 工程 10〜11（骨の仕上げ、陰の焼き込み、GLB の書き出しと圧縮）

`docs/toy-character/README.md` の工程 10 と 11 です。入力は `--stage eyes` の出力（`.work/toy-character/eyes/character-eyes.blend`）。形・UV・色は変えません。Web のデモ（工程 12）はこの工程ではやりません。

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。書き込むのは `scripts/toy-character/` と `.work/toy-character/` の中だけ。コミットはしないでください。Blender の処理は `build.py` に新しい段 `export` として足し（今ある段は残す）、`.work/toy-character/export/` に出力してください。Node のツールは pnpm で動かす（`pnpm dlx` を使い、npm・npx・yarn は使わない）。`log.md` は段ごとに書き足してください。

## やること

1. **骨を仕上げる**: 仮の骨（`temporary_rig`）を本番の骨にする。親子は root → spine.lower → spine.upper → spine.chest → neck → head、腕と脚は今のまま。名前は今のまま使う。眼鏡のフレームとレンズは head の子のまま。動かすのは Web 側なので、アニメーションは書き出さない。デモで動かす骨（head、neck、spine.upper、spine.chest）の回転の中心と軸が、工程 6 の 10 回目で確かめた値と同じであることを書く
2. **眼鏡のフレームを太くする**: v4 の眼鏡のフレームの太さを、デザイン画の対応点の尺度で測り、管の直径をそれに合わせる（今は 1.56 mm。v4 ではもっと太く見える）。形と位置は変えない
3. **陰を焼く**: 高密度のメッシュ（体・頭・髪）から ambient occlusion を焼き、glTF の occlusion として使えるようにする。粗さ・金属と合わせて 1 枚の画像（R に AO、G に粗さ、B に金属）にする。照明付きのレンダ（工程 8 で白く淡く見えたもの）が、AO でどう変わるかを並べて見る
4. **画像の大きさをそろえる**: 体の色の画像（工程 8 で 8192 px）など、すべての画像を 2048 px 以下にする。顔の目まわりの画像（まぶたのアトラス、黒目、開口のマスク）は見え方を保つ大きさにする。大きさを書く
5. **GLB を書き出す**: 体・頭（顔）・髪・目のまぶた・黒目・眼鏡のフレーム・レンズの部品、骨とウェイト、マテリアル。目の部品は Web 側で UV をずらすので、部品とマテリアルの名前を決めて書く（例: `eye_lids`、`eye_iris`、`glasses_frame`、`glasses_lens`）
6. **圧縮**: glTF Transform（`pnpm dlx @gltf-transform/cli`）で、メッシュは meshopt、画像は KTX2（KTX-Software の `toktx` が使える場合。ない場合は WebP にして理由を書く）。圧縮の前後で、骨の数と名前、ウェイト、部品の数、三角形数が同じであることを確かめる
7. **検査**: glTF Validator（`pnpm dlx gltf-validator`）でエラー 0。GLB の大きさ（目標 5〜8 MiB、上限 10 MiB）

## 確かめること（レンダは自分で開いて見ること）

- `export-check.png`: 書き出した GLB を Blender に読み戻し、デモの画角（工程 6 と同じ）で、立ち姿・首左 25° ＋ 上半身左 8°・閉じた目を、照明付きでレンダしたもの（AO あり）。工程 9 のレンダと並べる
- `ao-compare.png`: AO なし・ありの照明付きの顔と全身
- `glasses-thickness.png`: 太さを変えた眼鏡と v4 の顔を並べたもの
- `metrics.json`: 骨の名前と親子、部品と三角形数、画像の大きさ、GLB の大きさ（圧縮前・後）、Validator の結果

## 最終回答

日本語で、結論から。骨の構成、眼鏡の太さ（v4 で測った値）、AO の効き方、画像の大きさ、GLB の大きさ、圧縮の方式と理由、Validator の結果、部品とマテリアルの名前、まだ足りないところ、置いた仮定。前置きと繰り返しは削る。
