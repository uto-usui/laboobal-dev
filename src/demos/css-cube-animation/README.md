# CSS で立方体をつくって回転のアニメーションをあたえる

## 何をしているか

青い立方体が 3 つ並んでいる。マウスを乗せると、その立方体が手前に飛び出しながら、縦の軸と奥行きの軸で 1 回ずつ回る。マウスを外すと、逆にたどって元の位置に戻る。JavaScript は使っていない。

## 大事なところ

立方体は、100px の正方形 6 枚でできている。正方形を、立方体の面の位置へ `transform` で動かす。

- 前と後ろ: `translateZ(±50px)` で、手前と奥へ 50px ずつ押し出す
- 上と下: 上下に 50px ずらしてから `rotateX(±90deg)` で倒す
- 左と右: 左右に 50px ずらしてから `rotateY(±90deg)` で立てる

6 枚をまとめる箱に `transform-style: preserve-3d` を付けると、子の 3D の位置がそのまま残り、箱を回すと立方体として回る。並びの親に `perspective: 400px` を付けて、遠近が付いて見えるようにしている。

前後左右の面は半分透けた青、上と下はうすい桃色にしている。回ると、透けた面の向こうに別の面の文字が見える。

## 作り方

回転は `:hover` で `transform` を変え、`transition: transform 2s` でつないでいるだけ。`translate3d(0, 0, 200px) rotateY(360deg) rotateZ(360deg)` へ 2 秒かけて動く。

マウスを乗せて始まる動きなので、動きを減らす設定のときもそのまま動く（src/shared/motion.ts の決まりの 3）。

## もとのデモから変えたこと

記事の本文には SCSS が載っている。違いは次のとおり。

- `perspective: 400` に単位がなかった。今のブラウザでは無効になり、遠近が付かない。`400px` にした
- `-webkit-` の付いた書き方を外した
- SCSS の入れ子と `//` のコメントを、素の CSS にした
- `transition: 2s` を、`transition: transform 2s` にした
- 色を `hsla(…, 1.00)` から `hsl(…)` にした
- 並びを、上から 5em の位置ではなく、画面の真ん中に置いた
- 6 枚の面の HTML を、Astro の繰り返しで作った

## もと

- https://jsfiddle.net/yutousui/gre2a7tm/
- 記事: https://webmanab.com/lab/css-cube-animation/
