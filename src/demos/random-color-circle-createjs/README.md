# でたらめな色の円

## 何をしているか

塗りの円と、太さ 3 の線の円を 1 つずつ描く。色はどちらも開くたびにでたらめに決まる。動きはない。

## 大事なところ

色は `Math.floor(Math.random() * 0xFFFFFF)` で 0〜16777214 の整数を作り、それを 16 進の 6 桁にして `#rrggbb` にしている。赤、緑、青の 3 つの 0〜255 を 1 つの整数にまとめたものなので、整数をでたらめに選べば色もでたらめになる。CreateJS では `Graphics.getRGB` がこの整数を `rgb(r, g, b)` に直していた。

図形の位置は 2 段で決まる。図形（`Shape`）を (50, 50) に置き、その中の (50, 50) と (100, 100) を中心に円を描くので、canvas の上では (100, 100) と (150, 150) になる。

## 作り方

canvas 2D の `arc` で円を描き、塗りは `fill`、線は `stroke` にしている。`Shape` を置く位置は `translate(50, 50)` にあたる。もとの canvas（300×260）の座標のまま描き、入れ物に収まる大きさまで canvas を広げる（もとの 2 倍まで）。

## もとのデモから変えたこと

記事の本文には、CreateJS の `Stage`、`Shape`、`Graphics` を使ったコードが載っている。違いは次のとおり。

- CreateJS をやめ、canvas 2D で描いている
- 見出しの「create.js」を、fiddle の題名の「circle」にした。CreateJS を使わなくなったため
- canvas の点線の枠は `border` から `outline` にした。`border` だと canvas の大きさに入り、座標がずれる
- canvas を 300×260 の固定から、入れ物に合わせた大きさにした。大きさが変わったら同じ色で描き直す
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/vjj3xuam/
- 記事: https://webmanab.com/lab/random-color-circle-createjs/
