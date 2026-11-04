# デモを出す流れ

新しいデモを作ってから、本番（labobal.dev）に出し、lab の記事からつなぐまでの順番です。デモの作り方そのものは、ルートの [README.md](../README.md) の「デモを足す」にあります。

## 1. ブランチを切る

```sh
git switch master && git pull --ff-only
git switch -c feat/<slug>
```

master に入ると、そのまま本番のビルドが動きます。master に直接コミットしません。

## 2. 作って確かめる

- meta の `added` に、本番に出す日（YYYY-MM-DD）を入れる。トップの新着と RSS はこの日付で決まる。もとのデモがあるなら、それを作った日を `created` に入れる
- 手元のチェックをまとめて通す。ポートはほかの作業とぶつからないものにする

  ```sh
  E2E_PORT=4399 pnpm verify
  ```

  lint、整形、型、ビルド、大きさの上限（`pnpm check:budget`）、E2E を順に見ます。大きさの上限で落ちたら、出てきた一覧で何が大きいかを見て、減らすか、理由に納得できるなら `scripts/check-budget.mjs` の上限を上げます（理由をコミットに書く）

- ブラウザで開いて、canvas が描かれていること、触って動くこと、コンソールにエラーがないことを見る。lab の記事の iframe と同じくらいの大きさ（幅 800px、高さ 500px）とスマホの幅でも見る。E2E は GPU のない環境では canvas の中身まで見ないので、ここは目で見ます

## 3. プレビューを撮る

トップの一覧と lab の記事ページで使う動画とポスターを撮って、コミットします。手順は `.claude/skills/capture-preview/SKILL.md` です。撮るのはそのデモ 1 本だけにします。

## 4. PR を作る

- 本文に、何のデモか、確かめたこと（`pnpm verify` の結果、開いたブラウザ）、もとにしたコードや素材を書く
- デモのスクショとプレビューの jpg を貼る。トップの見た目が変わるものは、作者に見てもらってからマージする
- CI（lint、整形、型、ビルド、大きさの上限、E2E、`pnpm audit`）が通るのを待つ。PR では Netlify のデプロイプレビューは動かないので、確かめるのは手元と CI です

## 5. マージする

マージコミットでマージします（スカッシュしない）。マージすると Netlify の本番のビルドが 1 回動きます。docs やテストだけの変更では、`scripts/netlify-ignore.sh` がビルドを止めます。

## 6. 本番を確かめる

ビルドが終わるまで数分かかります。

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://labobal.dev/<slug>/
curl -s -o /dev/null -w '%{http_code}\n' https://labobal.dev/previews/<slug>.webm
curl -s https://labobal.dev/demos.json | grep -c '"slug":"<slug>"'
curl -sI https://labobal.dev/<slug>/ | grep -i content-security-policy
```

- ページとプレビューが 200、`/demos.json` に slug が 1 件ある、`frame-ancestors` のヘッダーが付いている、なら出ています
- ページを足さない変更（デモの直しなど）は、手元の master のビルドと本番で、読んでいる JS の名前が同じかで見ます。`curl -s https://labobal.dev/<slug>/ | grep -o '/_astro/[^"]*\.js'` と `grep -o '/_astro/[^"]*\.js' dist/<slug>/index.html` を比べる
- ブラウザで本番のページとトップを開き、デモが描かれていること、トップの一覧に出ていること、触れたときにプレビューの動画が出ることを見る
- RSS と更新履歴に新しいデモが出ていることを見る（meta の `added` から作る）

## 7. lab の記事からつなぐ

記事があるデモは、記事からデモを埋め込み、デモの meta の `article` に記事の URL を入れます。記事を出すのはデモが本番に出たあとです。手順は `.claude/skills/link-lab-article/SKILL.md` です。記事の原稿は作者が書くので、エージェントは入れる中身（`demoUrl` と iframe）を作者に渡します。

## 8. SNS に載せるとき

正方形（1080×1080）と縦長（1080×1920）の短い動画を撮れます。隅のリンクなどの UI は隠して撮ります。

```sh
pnpm build && pnpm preview --port 4322
node scripts/capture-social.mjs <slug>             # social/<slug>-square.mp4 と -vertical.mp4
node scripts/capture-social.mjs <slug> --seconds 8 --formats vertical
```

`social/` はコミットしません。
