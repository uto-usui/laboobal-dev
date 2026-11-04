---

name: capture-preview
description: labobal.dev のデモ 1 本の、トップの一覧と webmanab の記事ページで使う短い動画とポスター（public/previews/<slug>.jpg、.webm、.webp）を撮り直す。新しいデモを足したとき、デモの見た目が大きく変わってプレビューと合わなくなったとき、「プレビューを撮って」「サムネを撮り直して」と言われたときに使う。全デモをまとめて撮り直すことはしない。
---

# capture-preview

`scripts/capture-previews.mjs` で、デモ 1 本のプレビューを撮ります。

## 先に知っておくこと

- `public/previews/<slug>.jpg` と `.webm` は、webmanab の lab の記事ページが `https://labobal.dev/previews/<slug>.webm` の URL で直接読んでいます。名前、形式（jpg と webm）、大きさ（480×300）を変えません。webp はトップだけが使います
- 撮り直すと、そのデモを埋め込んでいる記事の動画も変わります。撮るのは頼まれたデモか、新しく足したデモだけにします
- slug を付けずに `node scripts/capture-previews.mjs` を動かすと、全デモを撮り直します。やらない
- 撮るのに GPU と ffmpeg と cwebp が要るので、Netlify のビルドでは作れません。手元で撮ってコミットします

## 手順

1. ビルドして、空いているポートでプレビューを立てる。`astro preview` はエージェントの環境では裏で動き続けるので、終わったら止める

   ```sh
   pnpm build
   pnpm preview --port 4322
   ```

2. 撮る。ポートを変えたときは `PREVIEW_BASE_URL` で渡す

   ```sh
   PREVIEW_BASE_URL=http://localhost:4322 node scripts/capture-previews.mjs <slug>
   ```

   - 触って動くデモは、meta の `interaction`（hover、drag、scroll、click）に合わせてマウスを動かしながら撮る
   - 動き出すまで時間がかかるデモや、決まった時刻だと字が消えているデモは、スクリプトの `TUNE` に `warmup`（待つミリ秒）や `poster: 'brightest'`（いちばん明るいコマをポスターにする）を足す
   - 隅のリンクや lil-gui は隠して撮る。ページに UI を足したら、スクリプトの隠す一覧に足す

3. できたものを確かめる

   ```sh
   ffprobe -v error -show_entries stream=width,height -of csv=p=0 public/previews/<slug>.jpg
   ffprobe -v error -show_entries stream=width,height,codec_name -show_entries format=duration -of csv=p=0 public/previews/<slug>.webm
   ```

   - jpg と webm が 480×300、webm が vp9 でおよそ 3.6 秒なら合っている
   - jpg を開いて目で見る。真っ黒、真っ白、ぼやけたまま、字が消えたところになっていないか
   - webm も開いて、動きが映っているかを見る
   - `pnpm build && pnpm check:budget` を通す（previews の 1 ファイルの上限を見ている）。検査は dist/ を読むので、撮ったあとにビルドし直さないと前のファイルを測ってしまう

4. 止めて、コミットする

   ```sh
   pnpm exec astro preview stop
   git add public/previews/<slug>.jpg public/previews/<slug>.webm public/previews/<slug>.webp
   ```

   ほかのデモのファイルが変わっていたら、コミットに入れない。コミットは `/contextual-commit` で、撮り直した理由を書く。

## 撮り直したあと

- 記事を埋め込んでいるデモ（meta に `article` があるもの）は、webmanab の記事ページの動画も変わる。報告にそう書く
- 見た目の変わる撮り直しは、jpg を作者に見せてからマージする
