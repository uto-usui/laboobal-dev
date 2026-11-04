# sin と cos で公転する丸

## 何をしているか

小さな灰色の丸が、薄い灰色の円の上をゆっくり回り続ける。惑星が公転するような動き。

## 大事なところ

横の位置を `centerX + Math.cos(angle) * radius`、縦の位置を `centerY + Math.sin(angle) * radius` で決めている。同じ角度の cos と sin を組にすると、中心から `radius`（100）離れた円の上の点になる。角度を少しずつ進めれば、その点が円の上を回る。

角度は 1 フレームに 0.01 ラジアン進むので、1 周（2π ラジアン）は約 628 フレーム（60fps で 10 秒ほど）。canvas は下向きが y のプラスなので、右から下へ、時計回りに回る。

## 作り方

CreateJS の `Shape` の `x` と `y` を書き換える代わりに、毎フレーム canvas を消して、軌道の円と丸を描き直している。もとの canvas（250×250）の座標のまま描き、入れ物に収まる大きさまで canvas を広げる（もとの 2 倍まで）。

## もとのデモから変えたこと

記事の本文には、CreateJS の `Stage`、`Shape`、`Ticker` を使ったコードが載っている。違いは次のとおり。

- CreateJS をやめ、canvas 2D で描き、共有の `loop` で回している。速さは 60fps のときの 1 フレームあたりの量のまま、前のフレームからの秒数で進める
- 軌道の円は、もとは別の `Shape` を `addChildAt(bg, 0)` で後ろに置いていた。ここでは毎フレーム、丸より先に描く
- 見出しの「create.js」を、fiddle の題名の「planet」にした。CreateJS を使わなくなったため
- canvas の点線の枠は `border` から `outline` にした。`border` だと canvas の大きさに入り、座標がずれる
- canvas を 250×250 の固定から、入れ物に合わせた大きさにした
- 動きを減らす設定では、回り始めの位置（円の右の端）で止める
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/74yzsoyj/
- 記事: https://webmanab.com/lab/createjs-revolution-trigonometric/
