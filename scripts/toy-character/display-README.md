# 生成した面を表示に使う段

既存の段を残し、`build.py --stage display` に加えた。中間データは `.work/toy-character/display/` に置く。骨を作り直したり、数値で頂点を並べて形を作ったりはしない。

## 再実行

リポジトリのルートで実行する。Blender の外の Python は既存の `venv-geo` を使う。

```sh
blender -b --factory-startup -P scripts/toy-character/build.py -- --stage display
```

このコマンドで入力の準備、3段の減面、目の素材、骨への取り付け、同じ条件のレンダまで作る。各処理は `DISPLAY_PHASE=prepare/simplify/eye-reference/assets/build/render` と `DISPLAY_LEVEL=100000/200000/400000` で再開できる。`render` では `DISPLAY_LEVEL=source` も使える。

次に同じ出力フォルダの各段を圧縮する。

```sh
source .work/toy-character/venv-geo/bin/activate
for level in 100000 200000 400000; do
  export TOY_EXPORT_OUT="$PWD/.work/toy-character/display/$level"
  export TOY_DISPLAY_SCRIPT="$PWD/scripts/toy-character/display_compress.mjs"
  pnpm dlx --package=@gltf-transform/cli@4.5.1 --package=gltf-validator -c 'node "$TOY_DISPLAY_SCRIPT"'
done
```

元の GLB の WebP 画像は符号化済みのデータを保持する。目のアトラスだけ可逆 WebP にし、ジオメトリは量子化せず meshopt で圧縮する。アクセサ、骨、三角形の接続と画像の一致、および展開した GLB の Validator も確かめる。

開発サーバーで `/toy-figure/` を開ける状態にしてから測る。`TOY_WEB_URL` で URL を指定できる。

```sh
.work/toy-character/venv-geo/bin/python scripts/toy-character/display_web.py
.work/toy-character/venv-geo/bin/python scripts/toy-character/display_report.py
```

測定は Chrome の Metal GPU、5秒間。スマホ相当は390×844・DPR3・CPU4倍であり、実スマホのGPUやネットワークは再現しない。測定中はBlenderなどの重い処理を止める。体と頭の配分は元の三角形数の比率による。キャップも頭側の予算に含める。重複・退化面の除去と目・眼鏡の追加により、GLBの実際の面数は目標値と少し異なる。

採る段が決まったら、その GLB をデモの `assets/character.glb` にコピーする。`display_web.py 400000 --capture --installed` はコピー後の実際のファイルで四隅とまばたきを撮る。検査の参照はレスポンスにだけ挿入し、デモに検査用APIを残さない。

```sh
DISPLAY_PHASE=verify DISPLAY_LEVEL=400000 blender -b --factory-startup -P scripts/toy-character/build.py -- --stage display
DISPLAY_PHASE=poses DISPLAY_LEVEL=400000 blender -b --factory-startup -P scripts/toy-character/build.py -- --stage display
```

頭と見える髪は `head_face` の同じ面で、`hair` は内側のキャップ。両方とも `head` に1.0。体は工程11の `body` から最も近い面で補間し、骨に対応する重みの上位4本を正規化する。首の形と重なりは元の相似変換を保ち、この段ではつなぎ目を直さない。
