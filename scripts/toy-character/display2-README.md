# display2 の再実行

採用済みの `display/400000/character-display.blend` を入力にする。再減面、頭の形の変形、骨の作り直し、面の作り足しはしない。追加のパッケージはない。

```sh
blender -b --python-exit-code 1 --factory-startup -P scripts/toy-character/build.py -- --stage display2
```

`.work/toy-character/display2/` に部品を色分けした検査画像、位置・UVの検査用データ、辺でつながる面の成分、首と髪の切除記録、元のGLB、2048pxと3072pxの比較候補、採用版の `final/character.glb` と `character.glb` を作る。`DISPLAY2_PHASE=inspect/build/compress` で再開できる。入力の面と検査用データが一致することを `build` の最初に確認する。

首は体の元の肌の上端にある折り重なった面を、正規化済みモデルの高さ0.675mで切る。襟の赤い面を色と位置で選択対象から外し、元の肌の面だけをBMeshで切る。切り口をふさぐ面は足さない。切る前からあるUV・ウェイト・法線の層を保持し、切断位置のUVとウェイトは補間する。

髪はUVの継ぎ目を同じ位置として調べ、辺を共有する面を一成分と数える。頭と髪の主成分、内側のキャップは残す。下端にある小さい独立成分のうち、主成分から離れ、正面・上10°・左右と上下の組み合わせから見えるものを除く。体と内側のキャップに隠れる成分は数えない。削除した面のIDと各成分の位置・面数・距離は `hair-edit.json` と `.npy` に残る。

画像はWebP。比較候補は全4枚2048px／3072px・品質75。採用版は頭の色3072px・品質80、体の色2048px・品質75、粗さと金属度2048px・品質40。目のアトラスと黒目・開口は解像度を保ち、可逆WebPにする。meshoptの圧縮前後で属性・三角形の接続・骨を照合し、圧縮版と展開版の両方をglTF Validatorで検査する。

```sh
blender -b --python-exit-code 1 --factory-startup -P scripts/toy-character/display2_verify.py
cp .work/toy-character/display2/final/character.glb src/demos/toy-figure/assets/character.glb
```

Web撮影は `display` と同じ開発サーバー、Chrome／Metal、同じ画角と切り出し位置を使う。検査用の参照とポーズ指定はブラウザの応答だけに挿入する。

```sh
.work/toy-character/venv-geo/bin/python scripts/toy-character/display2_web.py baseline 2048-q75 3072-q75 installed
.work/toy-character/venv-geo/bin/python scripts/toy-character/display2_report.py
```

`TOY_WEB_URL` でURLを変えられる。`installed` は応答を差し替えず、デモへ置いた実ファイルを読む。全身、顔、胴、首5姿勢、四隅追従、首の組み合わせ4姿勢、スマホ相当の画像を保存する。Web側は正のpitchで下を向くため、上10°の指定値は-10。検査結果は各フォルダの `poses.json` に記録する。

フレーム時間の測定中はBlender、圧縮、ほかのブラウザテストを止める。デスクトップ1440×900・DPR2、スマホ相当390×844・DPR3・CPU4倍、各5秒、同じMac GPU、ローカルHTTP。実スマホのGPUやネットワークは再現しない。読み込み開始から最初の描画までと、ページ遷移から最初の描画までを分けて記録する。

`pnpm verify` の生成物も指定範囲に収めるため、`.work` 内にソースと依存の複製を作って実行する。今回の標準Chromiumの結果と、Chrome／Metal・4ワーカーにした検証用設定での結果は、それぞれ `verify.log` と `verify-metal.log` に残す。元のリポジトリのPlaywright設定は変更しない。
