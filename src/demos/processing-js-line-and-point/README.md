# 点と線を描く

## 何をしているか

灰色の横長の画面に、小さな点を 3 つと、交わる細い直線を 3 本描く。左下には太さ 20 の短い線を 3 本、端の形を変えて並べる。processing.js の入門の記事の 1 本。

## 大事なところ

`point(x, y)` は 1 つの位置、`line(x1, y1, x2, y2)` は 2 つの位置で決まる。線の太さを上げると、端の形の違いが見えてくる。

- 上: `ROUND`。端が丸い
- 真ん中: `SQUARE`。端の位置でちょうど切る。3 本のうちいちばん短い
- 下: `PROJECT`。太さの半分だけ端を伸ばして四角く切る

3 本とも同じ `x = 20` から `80` までの線なので、長さの違いがそのまま端の形の違い。

## 作り方

canvas 2D の `lineCap` が `strokeCap` にあたる。名前が違うので注意する。`ROUND` は `round`、`SQUARE` は `butt`、`PROJECT` は `square`。点は 1×1 の `fillRect` で描いている。座標は記事と同じ 480×320 のまま書き、表示の大きさに合わせて拡大している（`sketch.ts`）。

## もとのデモから変えたこと

記事の本文には processing.js のコードが載っている。違いは次のとおり。

- processing.js をやめて、canvas 2D で描いた
- 480×320 の固定の大きさをやめて、画面の大きさに合わせて同じ比のまま拡大・縮小するようにした（もとの 2 倍まで）。点の大きさと線の太さも同じ割合で変わる
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた。見出しの大きさと余白は自分で書いた
- 枠の点線は canvas ではなく、外の箱に付けた。canvas に付けると、描く大きさが線の分だけずれるため

## もと

- https://jsfiddle.net/yutousui/d2y41xkn/
- 記事: https://webmanab.com/lab/processing-js-line-and-point/
