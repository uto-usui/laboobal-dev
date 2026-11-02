# 見出しから目次を作る

## 何をしているか

本文の h2 と h3 を拾って、入れ子の目次を作り、左上に置く。目次の「TOC」を押すと開き、項目を押すとその見出しまでスクロールする。目次は、ふだんは薄く、マウスを乗せたときと開いたときに濃くなる。

## 大事なところ

h2 ごとに、次の h2 までにある h3 をその子にする。もとは jQuery の `nextUntil('h2').filter('h3')` でこれをしていた。ここでは h2 と h3 を出てくる順に 1 回だけ読み、h2 が来たら新しい項目を作り、h3 が来たら今の h2 の子に足す。見出しには `section0`、`section0-1` の形の id を振り、目次のリンクの先にする。

項目が 1 つしかないときは、目次を出さない。目次がなくても困らない長さだから。

目次は、ふだん `opacity: 0.3` で薄くしておき、読んでいる本文のじゃまをしない。開くと地の色と影が付き、本文の上に浮いて見える。

## 作り方

開け閉めは、`grid-template-rows` を `0fr` と `1fr` のあいだで動かしている。グリッドの行の高さは transition できるので、中身の高さを測らなくても、高さ 0 から中身の高さまでなめらかに開く。jQuery の `slideToggle(250)` にあたる。閉じている間は `inert` にして、見えない項目に Tab で入らないようにした。

項目を押したら、見出しの位置を測って `scrollTo({ behavior: 'smooth' })` で動かす。`scrollIntoView` は使わない。記事の iframe の中で使うと、外の記事のページまでスクロールさせることがあるため。見出しの上に 15px 空けるのは、`scroll-margin-top` で決めている。

## もとのデモから変えたこと

記事の本文には jQuery のコードが載っている。違いは次のとおり。

- jQuery をやめて、DOM の API で目次を作った
- 開け閉めを `slideToggle` から、`grid-template-rows` の transition にした
- 目次の見出しを `<h2>` から `<button>` にした。押せるものなので、キーボードでも押せるようにした。開いているかどうかを `aria-expanded` で伝える
- もとはリンクの `click` で `animate` を呼んでいたが、リンクの移動を止めていなかったので、すぐに見出しへ飛んでいた。アニメーションの指定（`easeOutCubic`）も引数の位置が違って効いていなかった。ここでは移動を止めて、なめらかにスクロールさせる
- `prefers-reduced-motion` が有効なときは、なめらかにせずにすぐ飛ぶ
- jQuery Easing を読んでいたのをやめた
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/n7gr16v6/
- 記事: https://webmanab.com/lab/toc/
