# 文字の形で写真をくり抜く

## 何をしているか

「CLIP TEXT」の文字の形に、猫の写真をくり抜いて見せる。Photoshop のクリッピングマスクと同じ見え方を CSS だけで作る。

## 大事なところ

`background-clip: text` で、背景を文字の形の内側にだけ塗る。そのうえで文字の色を `transparent` にすると、文字があるところに背景の写真が見える。文字の色を残すと、写真の上に文字の色が重なって写真が見えなくなる。

文字は太く大きいほど写真がよく見える。もとの `font-weight: bold` と `8em` のまま、ここでは 900 の太さにして、入れ物に合わせて大きさを変えている。写真は文字の箱に `cover` で広げているので、どこが見えるかは文字の大きさで変わる。猫の顔が文字に入るよう、位置を `center 55%` にした。

## 作り方

CSS だけで、script はない。写真は Astro の画像として読み、URL を CSS の変数 `--photo` で渡している。

`-webkit-background-clip: text` も、今のブラウザでは要らなくなったので外した。

## もとのデモから変えたこと

- 写真は Flickr の画像を直接読んでいた。持ち主が分からず、いつ消えるかも分からないので、Unsplash の猫の写真に替えた
- 文字の大きさを `8em` から、入れ物の幅と高さで決まる大きさにした（56px〜128px）。iframe の高さが 400px ほどでも枠に収まる
- 文字を `<figure>` から `<p>` にした。図ではないため
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/tg2h1ety/
- 記事: https://webmanab.com/lab/css-background-clip-text/
- 写真: Unsplash（https://images.unsplash.com/photo-1467011582549-93cad47c167e ）。写真のページは分からない
