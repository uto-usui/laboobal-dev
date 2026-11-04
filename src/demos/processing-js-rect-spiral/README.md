# 矩形を渦巻き状に描く

## 何をしているか

青緑から紫の半透明の小さな正方形 20 個を、画面の真ん中から外へ渦を巻くように並べる。processing.js の入門の記事の 1 本で、`pushMatrix()` と `popMatrix()` で座標をしまっておき、戻す描き方を見せる。fiddle の小見出しは「save load」。

## 大事なところ

`i` 番目の正方形は、真ん中から `i × 30` 度回した向きに、`i × 10` だけ離して描く。番号が増えるほど角度と距離が両方増えるので、渦になる。

毎回「真ん中から」測れるのは、描く前に `pushMatrix()` で真ん中の座標をしまい、描いたあと `popMatrix()` で戻しているから。戻さないと回転と移動が積み重なり、[矩形を円形に描く](../processing-js-rect-in-a-circle/) のように前の正方形からの続きになる。2 本を並べると、しまう・戻すの有無だけで形が変わるのが分かる。

## 作り方

canvas 2D の `ctx.save()` と `ctx.restore()` が `pushMatrix()` と `popMatrix()` にあたる。canvas のほうは変換に加えて塗りの色なども一緒にしまう。色は最初に 20 個分だけ乱数で決めておき、描き直しても変わらないようにしている。座標は記事と同じ 320×320 のまま書き、表示の大きさに合わせて拡大している（`src/shared/processing.ts`）。

## もとのデモから変えたこと

記事の本文にはコードがなく、fiddle のコードがもと。違いは次のとおり。

- processing.js をやめて、canvas 2D で描いた
- 320×320 の固定の大きさをやめて、画面の大きさに合わせて正方形のまま拡大・縮小するようにした（もとの 2 倍まで）
- 見出しは Google Fonts の Dancing Script を実行時に読んでいた。外から読まないよう、同梱の Molle にした
- Bootstrap 4 alpha の CSS と JS を読んでいたのをやめた。見出しの大きさと余白は自分で書いた
- 枠の点線は canvas ではなく、外の箱に付けた。canvas に付けると、描く大きさが線の分だけずれるため

## もと

- https://jsfiddle.net/yutousui/3c6v5rn5/
- 記事: https://webmanab.com/lab/processing-js-rect-spiral/
