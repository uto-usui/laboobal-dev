# edges 段

`texture`までの中間生成物を使って色の境目を切り分け、境目を保護して服をならした3段を作る。出力先は`.work/toy-character/edges/`で、デモ用のGLBは置き換えない。

```sh
blender -b -P scripts/toy-character/build.py -- --stage edges
```

4410番の開発サーバーを動かしておく。撮影には、既存のPython環境のPlaywrightとChrome/Metalを使う。モデルの読み替えと、視線・呼吸・まばたきの停止は撮影用ブラウザの中だけで行う。元の高密度モデルは全高1m・足元0へ等方拡大し、全候補を同じカメラで撮る。

5段に加え、元画像の違い・縮小・UV転写・画像圧縮を別々に比較する対照を作る。`diagnosis.png`、`measurements.csv`、測定線を描いた各候補の`regions.png`、生の色の読み取りを残した`profiles.json`で確認できる。照明を含む境目の幅とは別に、照明なしの色の幅も記録する。

`character-x1.glb`〜`character-x3.glb`が候補で、`compare.png`に胸から下・全身・顔を並べる。`README.md`と`metrics.json`は測定値から生成する。形・法線・UV・ウェイト・骨の照合、圧縮版と展開版のValidator、15MiB上限、デモ用GLBのハッシュ照合に失敗したら終了する。

`EDGES_PHASE`で`diagnose`、`process`、`package`、`web`、`measure`だけを実行できる。依存する前の段の生成物は必要。`measure`は測定とレポートの更新も行う。

平滑化の倍率は、4096pxでのbilateral2回の色差と空間のsigmaにかける。1倍の空間半径は`texture`の2048pxでの値を2倍したもの。3段共通で、元4096px画像の色差による保護帯を維持し、フィルターの変化からGaussian sigma3より大きい明暗の変化を引き、大きなしわを残す。

UVの継ぎ目では、同じ位置の頂点でフィルターの変化量だけを共有する。元の色の境目の保護帯に触れる頂点は除き、形・法線・UVは編集しない。継ぎ目のずれと保護帯の一致は`seams.json`に残す。
