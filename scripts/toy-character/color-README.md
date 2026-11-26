# 工程8の色投影

入力は `hair4/character-hair4.blend`。形・UV・ウェイト・材質の条件を変えず、ベースカラー画像だけを差し替える。出力は `.work/toy-character/color/`。

## 再実行

リポジトリのルートで実行する。

```sh
UV_CACHE_DIR="$PWD/.work/toy-character/uv-cache" uv venv --python 3.11 .work/toy-character/venv-color
UV_CACHE_DIR="$PWD/.work/toy-character/uv-cache" uv pip install --python .work/toy-character/venv-color/bin/python -r scripts/toy-character/color-requirements.txt
.work/toy-character/venv-color/bin/python scripts/toy-character/color_intrinsics.py
blender -b --factory-startup -P scripts/toy-character/build.py -- --stage color
```

Marigold は文書に指定されたモデル、MPS / float32、768px、4ステップ、3アンサンブル、seed 0で推定する。取得した重み・推定結果を作業用フォルダに残す。同じ推定を再利用するため、推定NPZがあれば再推定しない。

`COLOR_PHASE` を指定すると `export`、`raster`、`albedo`、`visibility`、`project`、`install`、`render`、`report`、`measure`、`verify` から再開できる。順番はこのとおりで、前の段の出力が必要。

## 判断と測定

- 投影座標は固定された正面の対応点と同じ1254px座標。原画を生成形状に自動で動かさない。背面は左右反転した対向座標。横は頭とリュックだけ。
- 形の生成時の三角形単位の部位ラベルは、色の境目がぎざぎざになっている。色は原画の画素単位のマスクで分類し、隣接する服の色を三角形のラベルだけで分けない。部位ラベルやメッシュ自体は変更しない。
- 正面・背面の原画、眼鏡なし版、横図を `color_process.py` の固定マスクで扱う。眼鏡なし版は目の周りの肌だけに使う。既存の目・眉の画素は今回の投影対象から外す。
- 入力の頭には内向きのカスタム法線がある。投影の面の向きの検査では頭中心に対して外向きに解釈する。保存する法線には手を触れない。遮蔽は全3メッシュを通した最初のレイ交差で確かめる。
- 未観測面には、投影できた対応色から求めた部位別のLab線形変換をかける。古い陰影の増幅を避けるため、変換の特異値を制限する。投影部分との混合は線形RGBで行う。
- bodyの色画像は8192px、髪は2048px。UVは入力と同じ。共有アトラスの細かい島に色を入れるため、bodyだけ画像を大きくする。
- 色差の主集計は、保存した画像をEmissionでレンダーし、原画と同じ座標の同じ表面色の領域で測る。原画の陰影付きRGBと直接比較しない。眼・眉とマスク境界を除外する。投影計算中の転写誤差も別の値として残す。
- `projection_by_part` は元の部位ラベル、`projection_by_surface` は肌や布の表面色の分類ごとの面積割合。投影が少しでも混じる割合と、全面投影の割合を分ける。見えない内面も分母に含む。
- `metrics.json` の色ゲートと目視のゲートは別。合否と残りは `review-notes.md` に書き、実行の段ごとの記録は `log.md` に書き足す。

リュックの形は生成したままにする。眼球・まぶた・眼鏡の制作は工程9に残す。コミットや公開はこの処理に含めない。
