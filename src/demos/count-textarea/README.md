# テキストエリアの文字数を数える

## 何をしているか

入力欄に書いた文字の数を、欄の右下に「12／2000文字」の形で出す。書くたび、消すたび、貼り付けるたびに数が変わる。

## 大事なところ

数えるきっかけを `input` イベント 1 つにしている。もとは `keydown keyup keypress change` の 4 つを見ていたが、これだと右クリックからの貼り付けやドラッグでの入力では、欄から出るまで数が変わらなかった。`input` は、中身が変わったときならどの方法でも来る。

数え方も変えた。JavaScript の `length` は UTF-16 の単位で数えるので、絵文字が 2、家族の絵文字のように合わせて 1 字に見えるものは 5 や 7 になる。`Intl.Segmenter` で見た目の 1 文字ごとに区切って数えると、人が数える数と同じになる。

## 作り方

`Intl.Segmenter('ja', { granularity: 'grapheme' })` で区切り、その数を `<output>` の中の `<strong>` に入れている。ライブラリは使っていない。

## もとのデモから変えたこと

記事の本文には jQuery のコードが載っている。違いは次のとおり。

- jQuery をやめて、`addEventListener` と `textContent` にした。`.html(length)` は数を HTML として入れていたので、`textContent` にした
- 見るイベントを `keydown keyup keypress change` から `input` 1 つにした
- 数え方を `length` から `Intl.Segmenter` に変えた。かなと漢字だけなら数は変わらない
- 数を `<output>` に入れ、入力欄と `for` でつないだ
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の JS を読んでいたのをやめた（使っていなかった）
- SCSS の `rgba(white, .65)` などを、普通の CSS の `rgb(255 255 255 / 65%)` にした

## もと

- https://jsfiddle.net/yutousui/58v2d54d/
- 記事: https://webmanab.com/lab/count-textarea/
