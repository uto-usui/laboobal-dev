# 作業の前提

このリポジトリで作業する人（エージェントを含む）向けに、まわりのリポジトリとの関係、決まっていること、今の状態、作業の流れ、参考にするものをまとめます。2026-11-05 時点の内容です。

## 1. 場所と役割

作者の動きの実験は、laboobal、laboobal-dev、webmanab の lab の 3 か所に分かれていました。これを「説明は webmanab の lab、動くデモは labobal.dev」の 2 か所にまとめました（[webmanab#53](https://github.com/uto-usui/webmanab/issues/53)）。

| 場所 | 役割 | 公開先 | 今の状態 |
| --- | --- | --- | --- |
| `uto-usui/laboobal-dev`（ここ） | 動くデモ。1 デモ 1 ページ。説明は書かず、lab の記事へのリンクだけ置く | [labobal.dev](https://labobal.dev) | Astro。2026-11-02 に作り直した |
| [`uto-usui/webmanab`](https://github.com/uto-usui/webmanab) | ブログ webmanab.com のサイトのコード。lab の記事がデモを `<iframe>` で埋め込む | [webmanab.com](https://webmanab.com) | Astro 7。動いている |
| 作者の Obsidian の vault（非公開） | webmanab の記事の原稿。lab の記事もここで書く | なし。push すると webmanab に写る | 動いている |
| [`uto-usui/laboobal`](https://github.com/uto-usui/laboobal) | もとのデモ置き場。デモは移し終えた。アーカイブはせず、そのまま置く | GitHub Pages（uto-usui.github.io/laboobal/）。Netlify のサイトは消した | 2021-05 から止まっている |

つながりの向きは次のとおりです。

```
vault ──push で写す──▶ webmanab ──iframe で埋め込む──▶ labobal.dev（このリポジトリ）
laboobal ──デモは labobal.dev、説明は webmanab の lab へ移した（laboobal はそのまま置く）
```

- このリポジトリの作業で vault や webmanab のファイルを書き換えることはありません。埋め込みを試すときも、webmanab のファイルは変えずに、作業用のフォルダに置いた HTML で確かめます。lab の記事を書くのは vault、記事のページの見た目は webmanab です
- vault は非公開です。名前、場所、中身をこのリポジトリに書きません。記事の書き方のうち公開してよい範囲は、webmanab の README の「記事」の章にあります

## 2. 決まっていること

webmanab#53 で 2026-10-27 に作者と決めたことです。

- 役割は 1 章のとおり
- リポジトリはこのまま使う。Netlify のサイト（`labobal-dev`）とドメインのつながりは触らない
- 今の 7 デモの URL は残す（3 章の小文字のパス）
- lab の記事からは `<iframe>` で埋め込む。埋め込んでよい相手は labobal.dev 側の `frame-ancestors` で webmanab に絞る
- lab の記事の frontmatter の `demoUrl` に labobal.dev の URL を入れ、lab のページで `demoUrl` を出す。lab のページでは webmanab の `EntryDemo` が `demoUrl` を出す（webmanab#74 で入った）。labobal.dev の URL のときは、`https://labobal.dev/previews/<slug>.webm` と `.jpg` を読んで動画を付ける
- 新しく書く lab の記事は 7 本（drag、follow、hover、scroll、マウスで傾ける、reveal、distortion）。下書きは Claude が書き、1 本目を作者に見てもらってから残りに進む
- laboobal の画像（`docs/.vuepress/public/images/girl`、3MB）はフリー素材。規約を確かめてから移す
- `polyfill.io` の読み込みは作り直しを待たずに外した（[#9](https://github.com/uto-usui/laboobal-dev/issues/9)）
- laboobal の GitHub Pages は、移し終えたら止めてアーカイブする。その前に Service Worker を解除する版を出す（あとでやめた。下を参照）
- `laboobal.work` は取り直さない。誰も持っていない
- jsfiddle のデモ（F6）: 壊れている 4 本は、説明文があればそれをもとに作り直し、なければ下げる。tip の jsfiddle 25 本はあとで確かめる
- `labobal.dev` のドメインは Cloudflare への移管が済み、自動更新が有効なことを確かめた（2026-11-01）

2026-11-01 に作者と会話で決めたこと（[作り直しの計画](history/rebuild-plan.md) の 1 章）:

- どのデモも、最新版のライブラリで作り直す。壊れているものも同じ
- そっくり移さず、旧デモの雰囲気をつかんで再現する
- ネイティブの API に置き換えるのは、もとの動きを同じ質で出せるときだけ。たとえばスクロールは、アニメーションが単純なら CSS の scroll-driven animations などで書き、慣性や遅れて追いつく視差が肝なら locomotive-scroll の最新版か Lenis を使う
- 価値の薄いものは下げてよい
- laboobal は、Service Worker を解除する版を出し、GitHub Pages を止めてからアーカイブする。ページごとの 301 は作らない（あとでやめた。下を参照）
- デモごとに、何が大事なのかという考え方をメモに残す。下げたデモも考え方は書き残す。あとで見返すため

あとで変えたこと:

- 2026-11-04 に、laboobal はアーカイブしないことにした（[#23](https://github.com/uto-usui/laboobal-dev/issues/23)）。リポジトリと GitHub Pages はそのまま置き、Netlify のサイトは消した。GitHub Pages が出ていても、リポジトリが見られても困らないため

このリポジトリで決めること（webmanab#53 では決めていません）:

- 記事のないデモの見せ方
- トップの見た目。見た目は作者が決めるので、案を作ってスクショで見てもらう
- 計測を入れるか。[作り直しの計画](history/rebuild-plan.md) の 3 章では「入れない」と決めた。ただ、記事のないデモやトップの読まれ方は webmanab の側からは見えないので、見直すかを考えている

## 3. 今の状態（2026-11-05）

### コードとビルド

- Astro 7.4（静的出力）、TypeScript、GLSL、pnpm 10。Node は 26（`.nvmrc`）
- 作り直す前の Nuxt 2 のコードは、タグ `nuxt2-final` に残しています
- デモは 69 本です。`src/demos/<slug>/` に 1 本ずつあり、`/<slug>/` のページとトップの一覧に出ます。下げたデモと、その理由と残しておきたい考え方は [`docs/history/dropped/`](history/dropped/) にあります。2026-11-04 に下げた 21 本の URL はトップへ 301 します（`netlify.toml`）
- 移すのではなく、ここで新しく作ったデモは `batch: 'new'` にします。今は particle-photo（WebGPU）の 1 本です。WebGPU のデモは meta に `webgpu: true` を付けます。今はどこからも読んでいない目印で、使えないブラウザで一行の案内を出すのはデモの側の処理です
- 似たデモは組にまとめています（[#31](https://github.com/uto-usui/laboobal-dev/issues/31)）。URL は今までどおりバリエーションごとで、ページの右上の「設定」から組のほかのバリエーションへ切り替えられます。トップでは組を 1 行にまとめます。組の定義は `src/groups/<組>/meta.ts`、作り方は [demo-guide.md](demo-guide.md) の 12 章にあります
- `public/previews/<slug>.webm` と `.jpg`（480×300）は、トップの一覧と webmanab の記事のページの両方が使います。webmanab は URL で直接読むので、名前と大きさを変えません
- 前からある 7 本は、パスを変えずに作り直しました

| デモ | 公開中のパス |
| --- | --- |
| amoeba | `/amoeba/` |
| blob | `/blob/` |
| blobRadius | `/blobradius/` |
| marquee | `/marquee/` |
| nodeBalls | `/nodeballs/` |
| scrollManager | `/scrollmanager/` |
| splitting | `/splitting/` |

大文字のパス（`/nodeBalls/` など）は、Netlify が小文字へ 301 しています。`netlify.toml` にルールは書いていません。理由は `netlify.toml` のコメントにあります。

### 公開中のもの

- `/sw.js` は、自分の登録を解除してキャッシュを消す Service Worker です。旧サイトを開いたことのあるブラウザで、1 回開くと登録とキャッシュが消えて新しいページが出ます。まだ来ていない人のために、消さずに置いておきます
- 全ページが `Content-Security-Policy: frame-ancestors 'self' https://webmanab.com http://localhost:*` を返します。埋め込めるのは、webmanab と手元の開発サーバーだけです

### Netlify

- サイト `labobal-dev` は、このリポジトリの master につながっています。ビルドの設定は `netlify.toml` にあります（`pnpm build`、公開フォルダは `dist`）
- master に入ると本番のビルドが動き、そのまま公開されます
- PR のデプロイプレビューは止めています（Netlify の Branches and deploy contexts で「Don't deploy pull requests」）。PR のたびにビルド時間を使わないためです。PR は CI と手元のビルド（`pnpm build && pnpm preview`）で確かめます。[作り直しの計画](history/rebuild-plan.md) の中のデプロイプレビューで確かめる手順は、作り直しのときのものです
- docs やテストだけの変更では、`scripts/netlify-ignore.sh` がビルドを止めます。キャッシュがないビルドでは前のコミットと比べられないので、止めずにビルドします（#11）
- Netlify の無料枠のビルド時間は、webmanab と同じアカウントで分け合っています

### ドメイン

- `labobal.dev` は 2026-10-30 に Cloudflare Registrar へ移管しました。自動更新が有効で、期限は 2028-03-05 です
- DNS は Cloudflare にあり、apex と `www` を Netlify に向けています（プロキシは使っていない）。`www` は apex に 301 します。証明書は Netlify が発行しています
- DNS とドメインの設定は触りません

### そのほか

- GitHub Actions の CI が、lint、整形、型、ビルド、E2E（全デモのページが開けるか）、`pnpm audit` を見ます。canvas が描かれたかの確かめは、GPU のない CI では飛ばし、手元で見ます

## 4. 作業の流れ

### デモを作る

デモの作り方の決まり（ファイル、meta、メモとクレジット、素材、ページの UI）は [demo-guide.md](demo-guide.md)、出すまでの順番は [release.md](release.md) にあります。info のパネルは、lab の記事に埋め込まれているとき（iframe の中）は記事へのリンクを出しません。

### lab の記事から埋め込む（vault と webmanab の作業）

このリポジトリの外の作業ですが、デモの作りに関わるので書いておきます。手順は `.claude/skills/link-lab-article/SKILL.md` にあります。

- 記事は vault で書きます。webmanab で `pnpm new lab <slug>` を動かすと、vault に下書きができます。vault を push すると webmanab に写り、webmanab の本番に出ます
- 本文には次の形で埋め込みます

```html
<p><iframe src="https://labobal.dev/drag-pinch-simple/" width="100%" height="500" loading="lazy" title="つまんで離す（ドラッグのデモ）" allow="fullscreen"></iframe></p>

[別のタブで開く](https://labobal.dev/drag-pinch-simple/)
```

- `loading="lazy"` を付けます。WebGL のデモを 1 本の記事にいくつも置くと、描画のコンテキストを同時にいくつも作ることになるためです。1 本の記事の WebGL のデモは 4 つまでにします
- `title` を付けます。iframe には名前が要ります（webmanab の a11y の方針）
- frontmatter の `demoUrl` にも同じ URL を入れます
- デモを先に labobal.dev に出してから記事を出します。逆にすると、記事の iframe が空になります
- 新しい記事の id は 3000 から振ります。3000 より小さい id は旧 WordPress の記事です

### laboobal と jsfiddle から移したデモ

2026-11 に移し終えました。laboobal のページは、lab の新しい記事にしてデモを移すもの（A）、デモだけ移すもの（B）、移さないものに分け、jsfiddle を埋め込んでいた lab の記事のデモ（F6）と合わせて作り直しました。meta の `batch` は、そのときの区切りです。どれをどう分けたかは [作り直しの計画](history/rebuild-plan.md)、下げたものは [`docs/history/dropped/`](history/dropped/) にあります。

- URL は 1 つの平らな並びです。laboobal から移したものは `/<何のデモか分かる小文字のケバブケース>/`（例: `/drag-pinch-simple/`）、jsfiddle から移したものは `/<webmanab の lab の記事の slug>/` です。同じ slug が 2 つあったらビルドで落とします
- laboobal はアーカイブしません（2 章の「あとで変えたこと」）。laboobal の master には、移った先の案内ページと自分を解除する Service Worker を出すコミット（uto-usui/laboobal@89b4ff7）があり、Actions の `github pages` のワークフローは止めてあります
- jsfiddle から移したデモは、記事の iframe の `src` と `demoUrl` だけを書き換えます。fiddle は消しません。記事の差し替えは作者の側の作業で、[#24](https://github.com/uto-usui/laboobal-dev/issues/24) で進めています
- jQuery や TweenMax、Processing.js、CreateJS は使わず、最新の書き方で、記事の説明にある動きを再現しました。記事の本文のコードの抜粋は古い書き方のまま残るので、違いはデモのメモに書きます
- fiddle のソースは、ブラウザで `https://jsfiddle.net/yutousui/<id>/` を開き、エディタの `<form>` の `code_html`、`code_css`、`code_js`、`js_lib`、`panel_css`（1 なら SCSS）を読んで取り出します。`curl` には 403 を返します。tip の jsfiddle 25 本を確かめるときにも使えます

## 5. 道具と設定

今のデモの作り方（ファイルの置き方、meta、共有の部品、テスト）は [demo-guide.md](demo-guide.md) にあります。作り直しのときに決めた道具と使うライブラリは [作り直しの計画](history/rebuild-plan.md) の 3 章、`netlify.toml` と応答ヘッダーは 6 章の段階 1 にあります。

ほかに知っておくこと:

- webmanab とそろえるもの: Node 26（`.nvmrc`）、pnpm 10（`packageManager`）、Playwright 1.64.1、依存の更新のやり方（webmanab の `.claude/skills/deps-update/SKILL.md`）。lint と整形は、2026-11-04 からこのリポジトリだけ Biome（`biome.json`）にしている
- ビルドの設定は `netlify.toml` に書きます。管理画面の設定より優先されます
- webmanab の `Permissions-Policy` は camera、microphone、geolocation、payment、usb を止めています。埋め込んだ iframe の中でもこれらは使えません。使うデモを作るときは webmanab 側のヘッダーを変える必要があります

## 6. 参考にするもの

| もの | 何が書いてあるか |
| --- | --- |
| [webmanab#53](https://github.com/uto-usui/webmanab/issues/53) | 決まったこと。計画書より新しいので、食い違ったらこちらに従う |
| [計画書 laboobal.md](https://github.com/uto-usui/webmanab/blob/21a66ee/docs/operations/plans/laboobal.md) | 2026-10-25 に調べた事実、ページごとの扱いと理由、デモの置き方、F6 の表、手間とリスク。webmanab からは消えていて、このコミットにだけ残っている |
| [webmanab#68](https://github.com/uto-usui/webmanab/issues/68) | webmanab 全体の運用の方針と機能の順番 |
| webmanab の `README.md` | 記事の書き方（vault、`pnpm new`、sync）、自動で動いているもの |
| webmanab の `src/lib/schema.ts` | 記事の frontmatter の形（`demoUrl` など） |
| webmanab の `src/pages/lab/[slug].astro`、`src/components/EntryDemo.astro` | lab のページと、tip のページで `demoUrl` を出している部品 |
| webmanab の `netlify.toml` | CSP、`Permissions-Policy` |
| webmanab の `scripts/netlify-ignore.sh`、`playwright.config.ts` | ビルドの止め方、テストの設定 |
| `uto-usui/laboobal` の `docs/` | 移したデモのもと（`.vue` と `*Script.js`） |
| このリポジトリの 9e996ba のコミット本文 | Nuxt 2 のまま本番を直したやり方 |

## 7. 公開リポジトリなので書かないもの

このリポジトリは公開です。コード、コミット、PR、issue、docs に次のものを書きません。

- vault の名前、場所、中身
- claude.ai の URL（セッション、Artifact、Docs。コミット末尾の `Claude-Session:` 行も付けない）
- 手元の絶対パス（`/Users/...` など）
- 勤務先のこと
- アカウント ID、トークン、API キー

このルールを決める前のコミット（9e996ba など）には `Claude-Session:` 行が残っています。履歴は書き換えず、これから書くものに守ります。
