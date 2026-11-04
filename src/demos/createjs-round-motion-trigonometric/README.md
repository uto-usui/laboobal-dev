# sin の波に乗って進む丸

## 何をしているか

灰色の丸が右へ一定の速さで進みながら、sin で上下に揺れる。右の端を越えると左の端から出直す。

## 大事なところ

横は `x += xSpeed` で一定の速さで進むだけ。縦は `centerY + Math.sin(angle) * range` で、真ん中の高さ（100）から上下に 50 ずつ揺れる。角度は 1 フレームに 0.05 ラジアン進むので、波 1 つ分（2π ラジアン）は約 126 フレーム、横に約 126 進むあいだに 1 回上下する。

横と縦を別々の式で決めているのが要。横の動きに縦の揺れを重ねるだけで、丸が波の上をなぞる。

## 作り方

CreateJS の `Shape` の `x` と `y` を書き換える代わりに、毎フレーム canvas を消して丸を描き直している。もとの canvas（250×250）の座標のまま描き、入れ物に収まる大きさまで canvas を広げる（もとの 2 倍まで）。

## もとのデモから変えたこと

記事の本文には、CreateJS の `Stage`、`Shape`、`Ticker` を使ったコードが載っている。違いは次のとおり。

- CreateJS をやめ、canvas 2D で描き、共有の `loop` で回している。速さは 60fps のときの 1 フレームあたりの量のまま、前のフレームからの秒数で進める
- 見出しの「create.js」を、fiddle の題名の「circular motion」にした。CreateJS を使わなくなったため
- canvas の点線の枠は `border` から `outline` にした。`border` だと canvas の大きさに入り、座標がずれる
- canvas を 250×250 の固定から、入れ物に合わせた大きさにした
- 動きを減らす設定では、真ん中（x が 125）を通るところで止める
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/4dL339yw/
- 記事: https://webmanab.com/lab/createjs-round-motion-trigonometric/
