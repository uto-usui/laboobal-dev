# 要素をトグル表示するシンプルなホバーエフェクト

## 何をしているか

「hover action」の見出しの下に、黒い箱がある。ふだんは何も書かれていない。マウスを乗せると、「appa」と「appapa」の 2 行が、幅を広げながら左から出てくる。マウスを外すと、幅が縮んで隠れる。JavaScript は使っていない。

## 大事なところ

`width` を transition させて、出し入れしている。文字の行を `width: 0` と `overflow: hidden` で隠しておき、マウスを乗せたら幅を文字の長さ（3em と 4em）に広げる。幅は 0.4 秒かけて変わるので、文字が左から順に現れるように見える。

2 行の幅の行き先が違うのに、かかる時間は同じ 0.4 秒にしている。長い 2 行目のほうが速く伸びるので、2 行がそろって出きる。

## 作り方

行の幅は `.toggle:is(:hover, :focus-visible) span:nth-of-type(n)` で変えている。キーボードで箱に移ったときにも出るよう、`:focus-visible` も入れた。

マウスを乗せて始まる動きなので、動きを減らす設定のときもそのまま動く（src/shared/motion.ts の決まりの 3）。

## もとのデモから変えたこと

記事の本文にはコードがない。fiddle の SCSS との違いは次のとおり。

- SCSS の入れ子と `//` のコメントを、素の CSS にした
- 箱を `<a>`（`href` なし）から `<button>` にした。キーボードで移れるようにして、`:focus-visible` のときにも出す
- 行が折り返さないよう `white-space: nowrap` を付けた
- 字を 16px から、画面の幅に合わせて 32〜64px に大きくし、箱の幅も同じ割合（100px から 6.25em）で広げた。見出しと箱を、画面の真ん中に置いた
- `transition: .4s` を、`transition: width 0.4s` にした

## もと

- https://jsfiddle.net/yutousui/yn1zsrvx/
- 記事: https://webmanab.com/lab/hover-text-effect/
