# 波線が流れる入力欄

## 何をしているか

入力欄の下線を「〜〜〜」の波線にして、横に流し続ける。欄を選んで書き始めると、波が止まる。

## 大事なところ

波は、波 1 つ分（18 × 10px）だけを描いた小さな画像を、`repeat-x` で横に並べたもの。`@keyframes` で `background-position` を 0 から 18px まで 0.4 秒で動かし、くり返す。画像 1 枚分ずらすと元と同じ見た目に戻るので、継ぎ目なく流れ続けて見える。

`:focus` のときに `animation: none` にして止めている。流れている線が止まることで、どの欄に書いているかが分かる。

## 作り方

CSS だけで、script はない。波の画像は、もとのデモの PNG を data URL のまま使っている。

`prefers-reduced-motion` が有効なときは、はじめから流さない。

## もとのデモから変えたこと

- `focus` で止めるのを `animation: 0` と書いていた。`0` は値として正しくないので、`animation: none` にした
- `::-webkit-input-placeholder` を、今の書き方の `::placeholder` にした
- 入力欄に `aria-label` を付けた。placeholder だけでは、書き始めると何の欄か分からなくなる
- 選んだときにブラウザが出す枠線を消した。止まった波が枠線のかわりになる
- 見出しと入力の文字は Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/0j1qxgmL/
- 記事: https://webmanab.com/lab/styling-input/
