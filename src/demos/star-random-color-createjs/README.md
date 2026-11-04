# でたらめな色の星

## 何をしているか

頂点が 5 つの星を 1 つ描き、開くたびに変わるでたらめな色で塗る。動きはない。

## 大事なところ

星は CreateJS の `drawPolyStar(x, y, 半径, 頂点の数, 谷の深さ, 起点の角度)` で描いていた。記事のコードは `drawPolyStar(50, 50, 50, 5, .5, -90)`。

- 外の頂点は中心から半径 50 の円の上に、谷は半径 50 × (1 - 0.5) = 25 の円の上に置く。谷の深さを 0 にすると正五角形、1 に近づけるほど細い星になる
- 頂点と谷を、360 ÷ 5 ÷ 2 = 36 度ずつ交互に結ぶ
- 起点の角度 -90 度は真上。canvas は下向きが y のプラスなので、0 度が右、-90 度が上になる。1 つめの頂点が真上に来る

色は `Math.floor(Math.random() * 0xFFFFFF)` の整数を 16 進の 6 桁にした `#rrggbb`。

## 作り方

`drawPolyStar` と同じ形を、`polyStar` という小さな関数で作っている。外の頂点から始めて、角度を 36 度ずつ進めながら谷と頂点を交互に `lineTo` で結び、`closePath` で閉じる。もとの canvas（300×260）の座標のまま描き、入れ物に収まる大きさまで canvas を広げる（もとの 2 倍まで）。

## もとのデモから変えたこと

記事の本文には、CreateJS の `Stage`、`Shape`、`Graphics` を使ったコードが載っている。違いは次のとおり。

- CreateJS をやめ、canvas 2D で描いている。`drawPolyStar` は同じ計算を自分で書いた
- 見出しの「create.js」を、fiddle の題名の「star」にした。CreateJS を使わなくなったため
- canvas の点線の枠は `border` から `outline` にした。`border` だと canvas の大きさに入り、座標がずれる
- canvas を 300×260 の固定から、入れ物に合わせた大きさにした。大きさが変わったら同じ色で描き直す
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/b31yvc1u/
- 記事: https://webmanab.com/lab/star-random-color-createjs/
