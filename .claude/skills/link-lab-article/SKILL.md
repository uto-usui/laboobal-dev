---
name: link-lab-article
description: labobal.dev のデモと、それを説明する webmanab の lab の記事をつなぐ。デモの meta.article に記事の URL を入れ、記事の側に要る demoUrl と iframe を作者に渡し、webmanab の pnpm check:demos で食い違いがないかを見る。「記事とつないで」「記事のリンクを入れて」「lab の記事に埋め込みたい」「jsfiddle から labobal.dev に差し替えて」と言われたときに使う。
---

# link-lab-article

デモは labobal.dev（このリポジトリ）、説明は webmanab の lab の記事が受け持ちます。つなぐのは次の 2 か所です。

| どこ                                                    | 何を書く                                                                                            | 誰が書く     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| このリポジトリ: `src/demos/<slug>/meta.ts` の `article` | lab の記事の URL。ページの隅に「記事」のリンクが出る。`/demos.json` にも出て、webmanab の検査が読む | エージェント |
| 記事: frontmatter の `demoUrl` と、本文の `<iframe>`    | labobal.dev のデモの URL                                                                            | 作者         |

記事の原稿は、非公開の場所で書かれて webmanab に写されます。webmanab の `src/content/` を直しても、次に写したときに上書きされます。記事の側は直さず、入れる中身を作者に渡します。その場所の名前や中身は、このリポジトリにも webmanab にも書きません。

## 順番

デモを先に本番に出し、それから記事を出します。逆にすると、記事の iframe が空になります。

1. デモが本番に出ているかを見る

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://labobal.dev/<slug>/
   ```

   200 でなければ、先にデモを出す（docs/release.md）。

2. 記事の側に入れるものを作者に渡す。iframe の `title` は、何のデモか分かる日本語にする（iframe には名前が要る）

   ```yaml
   demoUrl: https://labobal.dev/<slug>/
   ```

   ```html
   <p>
     <iframe
       src="https://labobal.dev/<slug>/"
       width="100%"
       height="500"
       loading="lazy"
       title="<何のデモか>"
       allow="fullscreen"
     ></iframe>
   </p>

   [別のタブで開く](https://labobal.dev/<slug>/)</slug>
   ```

   - `loading="lazy"` を付ける。WebGL のデモを 1 本の記事に置くのは 4 つまで（描画のコンテキストを同時にいくつも作らないため）
   - jsfiddle から移したデモは、iframe の `src` と `demoUrl` だけを替える。fiddle は消さない。記事の本文のコードの抜粋は古いまま残す

3. 記事が出たら、meta に URL を入れる。記事が出る前に入れると、隅のリンクが 404 になる

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://webmanab.com/lab/<記事の slug>/
   ```

   ```ts
   article: 'https://webmanab.com/lab/<記事の slug>/',
   ```

   `pnpm build` を通し、`dist/<slug>/index.html` に記事へのリンクが出ていること、`/demos.json` の `article` に入っていることを見る。

4. webmanab で食い違いを見る。webmanab の手元のリポジトリを最新の master にしてから（`check:demos` は新しいスクリプトなので、古いままだと無い）

   ```sh
   pnpm check:demos
   ```

   本番の `https://labobal.dev/demos.json` と記事を突き合わせます。まだ本番に出していないときは、このリポジトリで `pnpm build && pnpm preview --port 4322` を立てて `pnpm check:demos --demos http://localhost:4322/demos.json` にします。出てくるのは次のものです。

   - meta の `article` が指す記事が、まだ jsfiddle を埋め込んでいる → 作者に記事の差し替えを頼む
   - meta の `article` が指す記事が見つからない → URL の打ち間違いか、記事がまだ写されていない
   - `demoUrl` と本文の iframe が別のデモを指している → 作者に知らせる
   - 記事が指す labobal.dev の slug が `/demos.json` にない → slug の打ち間違いか、デモがまだ出ていない
   - jsfiddle のままの記事の残り → 移す候補（issue #22）

   合否はなく、一覧が出るだけです。今回つないだデモが出てこなければよい。

## 報告

- 入れた `article` の URL と、ビルドで確かめたこと
- 作者に渡した `demoUrl` と iframe
- `pnpm check:demos` の結果のうち、今回のデモに関わるもの
