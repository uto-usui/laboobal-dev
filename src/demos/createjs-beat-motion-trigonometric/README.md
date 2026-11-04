# sin で脈打つ丸

## 何をしているか

真ん中の灰色の丸が、大きくなったり小さくなったりをくり返し、脈打つように見える。

## 大事なところ

大きさの倍率を `centerScale + Math.sin(angle) * range` で決めている。真ん中の倍率 1 から 0.5 ずつ上下するので、0.5 倍から 1.5 倍のあいだを行き来する。sin なので、いちばん大きいところと小さいところでゆっくりになり、真ん中を速く通り過ぎる。この緩急が、一定の速さで伸び縮みするのとちがう「拍」に見える。

角度は 1 フレームに 0.1 ラジアン進むので、1 拍は約 63 フレーム（60fps で 1 秒ほど）。

## 作り方

CreateJS の `scaleX` と `scaleY` の代わりに、丸の半径に倍率を掛けて描いている。もとの canvas（250×250）の座標のまま描き、入れ物に収まる大きさまで canvas を広げる（もとの 2 倍まで）。

## もとのデモから変えたこと

記事の本文には、CreateJS の `Stage`、`Shape`、`Ticker` を使ったコードが載っている。違いは次のとおり。

- CreateJS をやめ、canvas 2D で描き、共有の `loop` で回している。速さは 60fps のときの 1 フレームあたりの量のまま、前のフレームからの秒数で進める
- 速さは記事のコードの 0.1 にした。fiddle は 0.05 で、拍が半分の速さだった
- 見出しの「create.js」を、fiddle の題名の「beat」にした。CreateJS を使わなくなったため
- canvas の点線の枠は `border` から `outline` にした。`border` だと canvas の大きさに入り、座標がずれる
- canvas を 250×250 の固定から、入れ物に合わせた大きさにした
- 動きを減らす設定では、倍率 1 の大きさで止める
- SCSS を普通の CSS にした

## もと

- https://jsfiddle.net/yutousui/swsha6gf/
- 記事: https://webmanab.com/lab/createjs-beat-motion-trigonometric/
