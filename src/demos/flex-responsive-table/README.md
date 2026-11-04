# flex で行と列を入れ替える表

## 何をしているか

4 行 4 列の表を、画面の幅で組み替える。幅が 769px より狭いときは普通の表で、見出しが上に横に並ぶ。広いときは行と列が入れ替わり、見出しが左に縦に並ぶ。

## 大事なところ

`<table>` も `<tr>` も、`display` を変えれば普通の箱として並べ直せる。広い画面では表と `<tbody>` を `display: flex` にして、中の `<tr>` を横に並べる。`<tr>` は `flex-direction: column` にして、中のセルを縦に積む。すると、行だった `<tr>` が 1 本の列になり、表全体が斜めに折り返したように入れ替わる。見出しの `<tr>` がいちばん左の列になる。

HTML はそのままで、CSS だけで入れ替えている。表のマークアップを 2 つ用意しなくてよい。

## 作り方

CSS だけで、script はない。`@media (width >= 769px)` の中で、表と `<tbody>` を `flex` に、`<tr>` を縦の `flex` にしている。上の線は、普通の表のときだけ使うので、入れ替えたときは消す。

記事の iframe は 769px より狭いことが多いので、記事の中では普通の表に見える。入れ替わるところは「別のタブで開く」で見られる。

## もとのデモから変えたこと

記事の本文には SCSS のコードが載っている。違いは次のとおり。

- Bootstrap 4 alpha の `.table` の見た目（セルの余白 0.75rem、上の線 `#eceeef`）を、自分の CSS に書いた。Bootstrap の CSS と JS は読まない
- クラス名（`.table`、`.table_head`、`.table_body`）をやめ、`table`、`thead`、`tbody` に直接当てた
- `th` の `border-bottom: 0 !important` は、Bootstrap の下の線を消すためだったので要らなくなった
- `.inner` の `perspective` と `transform-style` は何にも効いていなかったので外した
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/pLfa203m/
- 記事: https://webmanab.com/lab/flex-responsive-table/
