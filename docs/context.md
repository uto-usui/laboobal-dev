# 作業の前提

このリポジトリで作業する人（エージェントを含む）向けに、まわりのリポジトリとの関係、決まっていること、今の状態、作業の流れ、参考にするものをまとめます。2026-11-01 時点の内容です。

## 1. 場所と役割

作者の動きの実験は、laboobal、laboobal-dev、webmanab の lab の 3 か所に分かれていました。これを「説明は webmanab の lab、動くデモは labobal.dev」の 2 か所にまとめます（[webmanab#53](https://github.com/uto-usui/webmanab/issues/53)）。

| 場所 | 役割 | 公開先 | 今の状態 |
| --- | --- | --- | --- |
| `uto-usui/laboobal-dev`（ここ） | 動くデモ。1 デモ 1 ページ。説明は書かず、lab の記事へのリンクだけ置く | [labobal.dev](https://labobal.dev) | Astro の 47 デモ（2026-11-02 に作り直した） |
| [`uto-usui/webmanab`](https://github.com/uto-usui/webmanab) | ブログ webmanab.com のサイトのコード。lab の記事がデモを `<iframe>` で埋め込む | [webmanab.com](https://webmanab.com) | Astro 7。動いている |
| 作者の Obsidian の vault（非公開） | webmanab の記事の原稿。lab の記事もここで書く | なし。push すると webmanab に写る | 動いている |
| [`uto-usui/laboobal`](https://github.com/uto-usui/laboobal) | なくす。デモを移し終えたら、リポジトリをアーカイブする | laboobal.netlify.app | 2021-05 から止まっている |

つながりの向きは次のとおりです。

```
vault ──push で写す──▶ webmanab ──iframe で埋め込む──▶ labobal.dev（このリポジトリ）
laboobal ──デモを移し終えたらアーカイブ（デモは labobal.dev、説明は webmanab の lab へ）
```

- このリポジトリの作業で vault や webmanab のファイルを書き換えることはありません。埋め込みを試すときも、webmanab のファイルは変えずに、作業用のフォルダに置いた HTML で確かめます。lab の記事を書くのは vault、記事のページの見た目は webmanab です
- vault は非公開です。名前、場所、中身をこのリポジトリに書きません。記事の書き方のうち公開してよい範囲は、webmanab の README の「記事」の章にあります

## 2. 決まっていること

webmanab#53 で 2026-10-27 に作者と決めたことです。

- 役割は 1 章のとおり
- リポジトリはこのまま使う。Netlify のサイト（`labobal-dev`）とドメインのつながりは触らない
- 今の 7 デモの URL は残す（3 章の小文字のパス）
- lab の記事からは `<iframe>` で埋め込む。埋め込んでよい相手は labobal.dev 側の `frame-ancestors` で webmanab に絞る
- lab の記事の frontmatter の `demoUrl` に labobal.dev の URL を入れ、lab のページで `demoUrl` を出す。lab のページで出す実装は webmanab 側でまだしていない
- 新しく書く lab の記事は 7 本（drag、follow、hover、scroll、マウスで傾ける、reveal、distortion）。下書きは Claude が書き、1 本目を作者に見てもらってから残りに進む
- laboobal の画像（`docs/.vuepress/public/images/girl`、3MB）はフリー素材。規約を確かめてから移す
- `polyfill.io` の読み込みは作り直しを待たずに外した（[#9](https://github.com/uto-usui/laboobal-dev/issues/9)）
- laboobal の GitHub Pages は、移し終えたら止めてアーカイブする。その前に Service Worker を解除する版を出す
- `laboobal.work` は取り直さない。誰も持っていない
- jsfiddle のデモ（F6）: 壊れている 4 本は、説明文があればそれをもとに作り直し、なければ下げる。tip の jsfiddle 25 本はあとで確かめる
- `labobal.dev` のドメインは Cloudflare への移管が済み、自動更新が有効なことを確かめた（2026-11-01）

2026-11-01 に作者と会話で決めたこと（[plan.md](plan.md) の 1 章）:

- どのデモも、最新版のライブラリで作り直す。壊れているものも同じ
- そっくり移さず、旧デモの雰囲気をつかんで再現する
- ネイティブの API に置き換えるのは、もとの動きを同じ質で出せるときだけ。たとえばスクロールは、アニメーションが単純なら CSS の scroll-driven animations などで書き、慣性や遅れて追いつく視差が肝なら locomotive-scroll の最新版か Lenis を使う
- 価値の薄いものは下げてよい
- laboobal は、Service Worker を解除する版を出し、GitHub Pages を止めてからアーカイブする。ページごとの 301 は作らない
- デモごとに、何が大事なのかという考え方をメモに残す。下げたデモも考え方は書き残す。あとで見返すため

このリポジトリで決めること（webmanab#53 では決めていません）:

- 作り直す道具。計画書は Astro を推しています。webmanab と道具をそろえられることと、デモの一覧とページを 1 つのリストから作れることが理由です
- デモだけのもの（記事を作らないもの）32 個の見せ方
- トップの見た目。見た目は作者が決めるので、案を作ってスクショで見てもらう
- 計測を入れるか

## 3. 今の状態（2026-11-02）

### コードとビルド

- Astro 7.4（静的出力）、TypeScript、GLSL、pnpm 10。Node は 26（`.nvmrc`）
- 作り直す前の Nuxt 2 のコードは、タグ `nuxt2-final` に残しています
- デモは 47 本です。`src/demos/<slug>/` に 1 本ずつあり、`/<slug>/` のページとトップの一覧に出ます。laboobal から移す候補のうち 19 本は下げました。理由は `docs/dropped/` にあります
- 移すのではなく、ここで新しく作ったデモは `batch: 'new'` にします。今は particle-photo（WebGPU）の 1 本です。WebGPU のデモは meta に `webgpu: true` を付け、使えないブラウザでは一行の案内を出します
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

- 2026-11-02 に作り直し（#10）をマージし、本番は Astro の版になりました
- `/sw.js` は、自分の登録を解除してキャッシュを消す Service Worker です。旧サイトを開いたことのあるブラウザで、1 回開くと登録とキャッシュが消えて新しいページが出ることを確かめました。まだ来ていない人のために、消さずに置いておきます
- 全ページが `Content-Security-Policy: frame-ancestors 'self' https://webmanab.com http://localhost:*` を返します。埋め込めるのは、webmanab と手元の開発サーバーだけです

### Netlify

- サイト `labobal-dev` は、このリポジトリの master につながっています。ビルドの設定は `netlify.toml` にあります（`pnpm build`、公開フォルダは `dist`）
- master に入ると本番のビルドが動き、そのまま公開されます。PR ごとにデプロイプレビューが出ます
- docs やテストだけの変更では、`scripts/netlify-ignore.sh` がビルドを止めます。キャッシュがないビルドでは前のコミットと比べられないので、止めずにビルドします（#11。これがなかったため、#10 のマージのビルドが止まりました）
- Netlify の無料枠のビルド時間は、webmanab と同じアカウントで分け合っています

### ドメイン

- `labobal.dev` は 2026-10-30 に Cloudflare Registrar へ移管しました。自動更新が有効で、期限は 2028-03-05 です
- DNS は Cloudflare にあり、apex と `www` を Netlify に向けています（プロキシは使っていない）。`www` は apex に 301 します。証明書は Netlify が発行しています
- DNS とドメインの設定は作り直しでも触りません

### そのほか

- GitHub Actions の CI が、lint、整形、型、ビルド、E2E（全デモのページが開けるか）、`pnpm audit` を見ます。canvas が描かれたかの確かめは、GPU のない CI では飛ばし、手元で見ます
- Dependabot の PR 7 本は、作り直しのマージのあとに閉じました

## 4. 作業の流れ

### 作り直しの進め方

マルチエージェントで作業を分けて進め、PR は大きくなっても 1 本にまとめます。担当の分け方、全員が守る決まり、デモごとの slug と担当、確かめ方は [plan.md](plan.md) にあります。

### デモを作る・移す（このリポジトリ）

1. 1 デモ 1 ページで作る。ページの中身はデモだけにして画面いっぱいに描き、iframe の大きさに合わせて描き直す
2. ページの隅に、lab の記事へのリンク（記事があるときだけ）と labobal.dev のトップへのリンクを置く
3. 画像、動画、フォントはリポジトリに置く。外の画像サービスに直リンクしない。`source.unsplash.com` と `placekitten.com` が止まって、lab のデモが 4 本壊れている
4. ほかの人のコードをもとにしたデモは、もとのリンクをページとリポジトリの両方に残す。今わかっているのは scrollManager（codrops の TileScroll）、nodeBalls（CodePen の mnmxmx/mEVxeg）、laboobal の three/video（learning-threejs）
5. push して labobal.dev に出たことを確かめる

### lab の記事から埋め込む（vault と webmanab の作業）

このリポジトリの外の作業ですが、デモの作りに関わるので書いておきます。

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

### laboobal から移す

laboobal の 30 ページを 3 つに分けています。

| 扱い | ページ |
| --- | --- |
| A: lab の新しい記事にし、デモをここに移す（7 本、8 ページ） | basic/drag、basic/follow、basic/hover、basic/scroll、effects/mouse、effects/reveal、canvas/distortion と distortion2（2 ページを 1 本に） |
| B: デモだけここに移し、記事は作らない（14 ページ） | basic/trigonometry、basic/random、basic/rotate3d、basic/gsap、canvas の README、canvas/fillText、drawImage、fake3d、shiftImage、glitchImage、canvas/three（video、typo、scale）、UI/virtualScroll |
| C: 移さない（8 ページ） | basic/easing、canvas/P5、README、info、目次のページ |

対象は A が 22 個、B が 32 個です。laboobal のページには本文がほとんどなく、説明はコードの中の日本語のコメントにあります。

コードはそのまま移さず、最新版のライブラリで、旧デモの雰囲気を再現するように作り直します。B のうち価値の薄いものは下げます。どのデモにも考え方のメモを残します。詳しくは [plan.md](plan.md) の 1 章と 4 章にあります。

URL は 1 つの平らな並びにします。laboobal から移すものは `/<何のデモか分かる小文字のケバブケース>/`（例: `/drag-pinch-simple/`）、jsfiddle から移すものは `/<webmanab の lab の記事の slug>/` にします。同じ slug が 2 つあったらビルドで落とします。

### laboobal のアーカイブ

デモを移し終えたら、laboobal のリポジトリをアーカイブします。アーカイブしたあとは設定も中身も変えられないので、その前に次を済ませます。

1. 自分を解除する Service Worker を出す。laboobal.netlify.app に今も Service Worker が残っていて、置かないと前に来た人には古いページが出続ける
2. GitHub Pages を止める（アーカイブしても止まらない）
3. homepage と description を、移った先（webmanab の lab と labobal.dev）が分かるものに変え、Dependabot の open の PR 20 本を閉じる

VuePress 1 と node-sass 4 は今の Netlify でビルドできないので、1 はビルドなしで出します。

### jsfiddle のデモ（F6）

webmanab の lab の記事 47 本が jsfiddle を埋め込んでいます。2026-10-25 に全部開き、47 本とも描画されました。壊れているのは画像のサービスが止まった 4 本です。

| 記事 | fiddle | 原因 |
| --- | --- | --- |
| lab/parallax-shifting-divided-background-by-mouse | xban07vu | `source.unsplash.com` が止まった |
| lab/parallax-distorts-by-following-mouse | vxmrkkyd | 同上 |
| lab/tweenmax-visual-range-animation-class | j5tp2cw2 | 同上 |
| lab/css-embed-images-scroll-the-screen-iphone6-outline-mockup | 656k72Lf | `placekitten.com` が止まった |

- ソースは、ブラウザで `https://jsfiddle.net/yutousui/<id>/` を開き、エディタの `<form>` の `code_html`、`code_css`、`code_js`、`js_lib`、`panel_css`（1 なら SCSS）を読んで取り出します。`curl` には 403 を返します
- jQuery や TweenMax、Processing.js、CreateJS は使わず、最新の書き方で、記事の説明にある動きを再現します。記事の本文のコードの抜粋は古い書き方のまま残るので、違いはデモのメモに書きます
- 作り直したら記事の iframe の `src` と `demoUrl` だけを書き換えます。fiddle は消しません
- 順番は、壊れている 4 本、jQuery (edge) を使う 7 本、Processing.js と CreateJS の 22 本、残り 14 本です。jQuery (edge) と、jsfiddle のライブラリの選択肢に頼っているものは、jsfiddle の都合で止まりうるためです

## 5. 作り直すときの設定

道具と使うライブラリは [plan.md](plan.md) の 3 章、ファイルの置き方とテストは 5 章、`netlify.toml` と応答ヘッダーは 6 章の段階 1 にあります。

ほかに知っておくこと:

- webmanab とそろえるもの: Node 26（`.nvmrc`）、pnpm 10（`packageManager`）、Playwright 1.64.1、ESLint と Prettier の設定、依存の更新のやり方（webmanab の `.claude/skills/deps-update/SKILL.md`）
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
| webmanab の `scripts/netlify-ignore.sh`、`playwright.config.ts`、`eslint.config.js` | ビルドの止め方、テストと lint の設定 |
| `uto-usui/laboobal` の `docs/` | 移すデモのもと（`.vue` と `*Script.js`） |
| このリポジトリの 9e996ba のコミット本文 | Nuxt 2 のまま本番を直したやり方 |

## 7. 公開リポジトリなので書かないもの

このリポジトリは公開です。コード、コミット、PR、issue、docs に次のものを書きません。

- vault の名前、場所、中身
- claude.ai の URL（セッション、Artifact、Docs。コミット末尾の `Claude-Session:` 行も付けない）
- 手元の絶対パス（`/Users/...` など）
- 勤務先のこと
- アカウント ID、トークン、API キー

このルールを決める前のコミット（9e996ba など）には `Claude-Session:` 行が残っています。履歴は書き換えず、これから書くものに守ります。
