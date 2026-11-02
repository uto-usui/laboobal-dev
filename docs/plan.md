# labobal.dev 作り直しの計画

labobal.dev を Astro で作り直し、laboobal と jsfiddle のデモを移す作業の進め方です。前提（まわりのリポジトリとの関係、決まっていること、今の状態）は [context.md](context.md) にあります。[webmanab#53](https://github.com/uto-usui/webmanab/issues/53) と食い違ったら #53 に従います。2026-11-01 時点の計画です。

## 1. 作り直しの考え方

2026-11-01 に作者と決めたことです。この計画のほかの章は、すべてこの考え方に合わせます。

- 最新版のライブラリで作り直す。古いコードを今のライブラリで動くように直すのではなく、今の書き方で書き直す。壊れているデモも同じ
- そっくり移さない。旧デモを動かして見て、何が気持ちいいのか（動きの速さや遅れ方、手触り、見え方）をつかみ、それを再現する。コードの形は合わせない。見た目もそっくり同じでなくてよい
- ネイティブの API に置き換えるのは、もとの動きを同じ質で出せるときだけ。出せないなら、ライブラリの最新版を使う（3 章）
- 価値の薄いものは下げる。基準は 3 章にある
- 考え方を残す。どのデモにも、何が大事なのかを書いたメモを付ける。下げたデモも、考え方だけは書き残す。あとで見返すためで、lab の記事を書くときの材料にもなる

## 2. この PR でやること

### 範囲

- Nuxt 2 のコードを Astro に入れ替える
- デモを作り直す。対象は最大 65 個で、内訳は今の 7 本、laboobal の A 22 個と B 32 個、jsfiddle の壊れている 4 本（F6 の 1 番目）。B のうち価値の薄いものは下げる
- デモごとのメモ、下げたデモの記録、デモをまたいだ考え方のまとめを書く（4 章）
- `netlify.toml`、応答ヘッダー、大文字のパスの 301、自分を解除する `sw.js`、CI、テストを置く
- トップを作り直す。見た目は作者に見てもらってから決める

### 範囲の外（この PR のあとに、ほかのリポジトリでやる）

| 作業 | 場所 |
| --- | --- |
| lab のページで `demoUrl` を出す | webmanab |
| A の記事 7 本を書いて出す。デモのメモを材料にする | vault |
| F6 の 4 本の記事の iframe と `demoUrl` を labobal.dev に書き換える | vault |
| laboobal のアーカイブ（context.md の 4 章） | laboobal |
| F6 の 2〜4 番目（jsfiddle の残り 43 本） | このリポジトリの次の PR |

### 終わったと言える条件

- 残すと決めたデモが、すべて `pnpm build` で `dist/<slug>/index.html` に書き出される
- そのすべてが、コンソールにエラーを出さずに開ける。canvas を使うデモは真っ白でない
- 7 章の 65 個の slug が、どれも「`src/demos/<slug>/` があり `notes.md` が付いている」か「`docs/dropped/` に記録がある」のどちらか一方だけに当たる。どちらにもないもの、両方にあるものがない
- 下げたデモの記録には、すべて「残しておきたい考え方」が書いてある。`docs/ideas.md` がある
- 今の 7 デモの URL（`/amoeba/`、`/blob/`、`/blobradius/`、`/marquee/`、`/nodeballs/`、`/scrollmanager/`、`/splitting/`）が 200 を返す
- `/blobRadius/`、`/nodeBalls/`、`/scrollManager/` が小文字のパスへ 301 を返す
- `/sw.js` が、自分を解除してキャッシュを消す中身を 200 で返す。マージのあと、旧サイトを開いたことのあるブラウザで、登録とキャッシュが消えて新しいページが出る（6 章の段階 4）
- 全ページが `Content-Security-Policy: frame-ancestors 'self' https://webmanab.com http://localhost:*` を返す
- 実行時に外のサーバーから画像、動画、スクリプトを読まない
- PR の Netlify のデプロイプレビューでビルドが通り、プレビューの URL で上の確認がすべて通る
- 手元の webmanab から、プレビューの URL を `<iframe>` で埋め込んで表示できる
- トップの見た目を作者が見て、了承している
- 新旧のスクショを並べた表と、下げたデモの一覧を PR に載せている

## 3. 着手の前に決めておくこと

### 道具などの決定

このリポジトリで決めることになっている 4 つは、次のようにします。

| 項目 | 決めたこと | 理由 |
| --- | --- | --- |
| 道具 | Astro（静的出力）。版は webmanab と同じ 7.4 系 | webmanab と道具をそろえられる。デモの一覧とページを同じ情報から作れる |
| デモだけのもの（記事がないもの）の見せ方 | トップの一覧に、ほかのデモと同じように並べる。記事へのリンクは出さない | 記事がないことのほかに、扱いを変える理由がない |
| トップの見た目 | 今の雰囲気（暗い背景、Molle と Montserrat）を残し、一覧を素のスクロールにした案を作る。スクショで作者に見てもらう | 見た目は作者が決める |
| 計測 | 入れない | 読まれ方は webmanab の lab の記事の側で見れば足りる |

### 使うライブラリ

どれも入れた時点の最新版にし、その版に固定します（`^` を付けない）。依存を足すのは統合役だけです。

| 旧デモで使っていたもの | 作り直しで使うもの |
| --- | --- |
| three.js r103〜r120 | three.js の最新版。消えた API（`Geometry`、`PlaneBufferGeometry` など）を書き換えるのではなく、今の書き方で書く |
| GSAP 2 の `TweenMax`、`TimelineMax`、GSAP 3 の初期 | GSAP の最新版（`gsap.to`、`gsap.timeline`、プラグイン） |
| locomotive-scroll 4 | デモごとに決める（下の「スクロールの扱い」） |
| splitting | 文字を `span` に分ける短い関数を `src/shared/` に置く |
| chroma-js | CSS の `oklch()` と `color-mix()`。JS で色を計算する必要があるときだけ chroma-js の最新版 |
| ismobilejs | `matchMedia('(pointer: coarse)')` |
| dat.gui、tweakpane | lil-gui の最新版 |
| glslify、glsl-noise | シェーダーは `?raw` で読む。ノイズの関数は `src/shared/` にシェーダーとして置く |
| jQuery、TweenMax（jsfiddle） | DOM の API と GSAP の最新版 |
| Processing.js、CreateJS（jsfiddle、次の PR） | Canvas 2D。必要なら p5.js の最新版 |
| `cdn.polyfill.io` | 使わない |

ネイティブの API に置き換えるのは、もとの動きを同じ質で出せるときだけです。出せないなら、ライブラリの最新版を使います。jQuery をなくすことや、アニメーションを GSAP で書くことは、いつ選んでもかまいません。

### スクロールの扱い

CSS の scroll-driven animations は、locomotive-scroll と同じことができるわけではありません。スクロールで動くデモは、1 つずつ次のように決めます。

- アニメーションが単純なとき（要素が見えたら出す、スクロール量に合わせて動かすだけ）は、CSS の scroll-driven animations か IntersectionObserver で書く
- 慣性のあるスクロール、遅れて追いつく視差（locomotive-scroll の `data-scroll-delay`）、横向きのスクロール、要素の固定など、ライブラリならではの動きがデモの肝なときは、locomotive-scroll の最新版か Lenis を使う
- どちらにしたかと理由を、`notes.md` の「作り方」に書く

今わかっているところでは、scrollmanager は肝の部分でライブラリの機能を使っています（`data-scroll-speed` 19 か所、`data-scroll-direction` 6 か所、`data-scroll-delay` 5 か所、`data-scroll-sticky` 3 か所）。まず locomotive-scroll の最新版で作り直し、使っていた属性がまだあるかを確かめます。A の scroll-reveal の 3 個と F6 の tweenmax-visual-range-animation-class は、旧デモを見てから決めます。

### 下げるかどうかの基準

次のどれかに当たるデモは下げてよいとします。旧デモを動かして見てから、担当が決めます。

- MDN や公式ドキュメントに同じものがある、基本の使い方だけのもの
- ほかのデモや webmanab の lab と tip の記事と、ほとんど重なるもの
- 試しに置いただけで、見せたい動きがないもの

今の 7 本、A の 22 個、F6 の 4 本は下げません。今の 7 本は URL を残すと決めていて、A は lab の記事の題材で、F6 は記事が埋め込んでいるためです。

下げる候補は 7 章の表に印を付けています。印のないものでも、見て価値が薄ければ下げてかまいません。

### 素材の権利

移す素材のうち、出どころを確かめるものです。分からないものは、自分で作った素材か Unsplash の写真に差し替えます。laboobal の素材は、リポジトリの `docs/.vuepress/public/` の下にあります（旧サイトでは `/images/...` の URL で出ていた）。

| 素材 | 使うデモ | 扱い |
| --- | --- | --- |
| laboobal の `docs/.vuepress/public/images/logo/vogue.svg`（Vogue Japan のロゴ） | canvas-draw-svg | 商標なので使わない |
| laboobal の `docs/.vuepress/public/images/girl/01.jpg` | canvas-shift-image | フリー素材（#53）。規約を確かめてから使う |
| laboobal の `docs/.vuepress/public/images/texture/*`（ゆがませるための模様） | distortion-slider-a〜d | 出どころを作者に確かめる |
| laboobal の `docs/.vuepress/public/images/canvas/rose.jpg`、`rose-map.jpg` | canvas-fake3d | 同上 |
| laboobal の `docs/.vuepress/public/video/sky.mp4`（3.9MB） | three-video | 同上 |
| laboobal-dev の `assets/images/test/*` | scrollmanager | 同上 |
| `images.unsplash.com` の写真（重なりを除いて 13 枚） | distortion-slider-a〜d、follow-mouse-spotlight、canvas-draw-image、canvas-glitch-image | 落としてリポジトリに置く。Unsplash のライセンスで使える。今は直リンクで、200 が返っている |
| `source.unsplash.com` のランダム画像 | mouse-tilt、mouse-skew、reveal-curtain、reveal-clip、canvas-cross-origin | サービスが止まっていて（503）画像が出ない。Unsplash の写真を選んで置く |

作者への確認は、土台の作業と並べて進めます。答えを待つ素材のデモは、仮の画像で作っておき、答えが出たら差し替えます。

## 4. 考え方の残し方

### デモごとのメモ（`src/demos/<slug>/notes.md`）

残したデモには、すべてこのメモを付けます。担当がデモを作りながら書きます。次は書き方の例で、中身は旧デモを見て書きます。

```markdown
# つまんで離す

## 何をしているか

ドラッグしている要素を、指を離した位置から勢いのまま滑らせて止める。

## 大事なところ

気持ちよさは、離したときの速さを引き継ぐことと、止まるまでの減り方で決まる。
速さは直前の数フレームの移動量から取る。1 フレームだけだと手の震えを拾う。
（このデモの肝になる考え方を、言葉で書く。コードを読まなくても分かるように）

## 作り方

GSAP の Inertia プラグインは使わず、requestAnimationFrame で毎フレーム速さに係数を掛けている。
（使った API と、選んだ理由）

## もとのデモから変えたこと

旧デモは TweenMax と自前の慣性。見た目の速さはそろえ、係数だけ調べ直した。

## もと

- laboobal/docs/basic/drag.md
```

- 「大事なところ」がいちばん大事な節です。何を真似すればこの動きになるのかを書きます
- 旧デモのコードの日本語のコメントにある考え方は、ここに拾います
- 文は平易な日本語で、です・ます にしなくてよい（メモなので）

### 下げたデモの記録（`docs/dropped/<batch>.md`）

下げたデモは、担当ごとのファイルに 1 つずつ書きます。担当ごとに分けるのは、同じファイルを別々の担当が書き換えないためです。次は書き方の例です。

```markdown
## rotate3d-x

- もと: laboobal/docs/basic/rotate3d.md（`basic/Rotate3dX`）
- 何だったか: 要素を X 軸のまわりに回し続ける
- 下げた理由: rotate3d-xyz に含まれる
- 残しておきたい考え方: 奥行きが見えるかどうかは、回す要素ではなく親に付ける perspective の値で決まる。値が小さいほど手前に迫って見える
```

- 「残しておきたい考え方」は必ず書きます。下げた理由とは別に、そのデモを動かして分かった大事なことを書きます。一般論（「Canvas で線が描ける」など）で済ませません
- どうしても考え方がないとき（試しに置いただけのページなど）は、「なし」と、なしと判断した理由を書きます
- 統合役は、ここに書いた考え方も `docs/ideas.md` に拾います

### デモをまたいだ考え方（`docs/ideas.md`）

統合役が、各担当の `notes.md` と `docs/dropped/` から、ほかのデモにも通じる考え方を集めてまとめます。例えば「マウスに遅れてついてくる動きは、毎フレーム差の一部だけ近づける」のような、1 つのデモに閉じないものです。それぞれ、その考え方を使っているデモへのリンクを付けます。見返すときの入り口になる文書です。

## 5. 全員が守る決まり

ここで決めた形に、土台の担当と各デモの担当が合わせます。並べて作業しても衝突しないための決まりです。

### ファイルの置き方

```
src/
  demos/<slug>/
    meta.ts         デモの情報（下の形）
    Demo.astro      マークアップと style
    main.ts         動かす script
    notes.md        考え方のメモ（4 章）
    assets/         このデモだけが使う画像、動画、シェーダー
  shared/           複数のデモで使う関数（math、noise、文字の分割など）。統合役だけが触る
  shared/<batch>/   その担当の中だけで使い回す関数（batch を小文字にした名前のフォルダ）
  lib/demos.ts      demos/*/meta.ts を import.meta.glob で集めて一覧にする
  layouts/DemoLayout.astro
  pages/index.astro
  pages/[slug].astro
docs/
  ideas.md          デモをまたいだ考え方。統合役が書く
  dropped/<batch>.md  下げたデモの記録。担当ごと
public/
  sw.js             自分を解除してキャッシュを消す
e2e/
  demos.spec.ts     一覧から全デモを開く
netlify.toml
```

- デモの担当が触るのは、自分の `src/demos/<slug>/`、`src/shared/<batch>/`、`docs/dropped/<batch>.md` だけです
- 一覧は `lib/demos.ts` がフォルダから集めるので、デモを足すときに共有のファイルを書き換えません
- `src/shared/` の直下は統合役だけが触ります。ほかの担当とも使い回したい関数や、直下のファイルを変えたいときは、統合役に頼みます。同じ名前のファイルを別々の担当が作って上書きし合うのを防ぐためです
- `package.json` と `pnpm-lock.yaml` は統合役だけが触ります。足りない依存があれば統合役に頼みます

### meta.ts の形

```ts
import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-simple',        // フォルダ名と同じ。URL になる
  title: 'つまんで離す',
  category: 'drag',                 // トップの一覧での分け方
  batch: 'A',                       // 担当の区切り。'current' | 'A' | 'B1' | 'B2' | 'F6'（6 章の 2-1〜2-5）
  article: undefined,               // lab の記事の URL。記事が出るまでは空
  origin: 'laboobal/docs/basic/drag.md',
  credits: [],                      // ほかの人のコードや素材をもとにしたときの { label, url }
  webgl: false,
  interaction: 'drag',              // 'drag' | 'hover' | 'scroll' | 'click' | 'none'。テストで使う
})
```

`defineDemo` は、slug がフォルダ名と違うとき、同じ slug が 2 つあるとき、必須の項目が欠けているとき、`notes.md` がないときに、ビルドを落とします。

### デモのページ

- `DemoLayout` は画面いっぱいの入れ物と、隅の小さなリンク（`article` があれば記事、いつも labobal.dev のトップ）を出します。デモの側でリンクを作りません
- iframe の大きさ（webmanab では幅 100%、高さ 400〜500px）で見られるように作り、大きさが変わったら描き直します
- スクロールで動くデモは、iframe の中でスクロールさせます
- 画像、動画、フォント、シェーダーは `assets/` に置いて import します。実行時に外のサーバーから読みません
- ほかの人のコードをもとにしたデモは、`credits` に書き、`notes.md` の「もと」にもリンクを残します

### コミット

- 1 つのブランチ（`rebuild/astro`）に、全員がコミットします。作業ディレクトリも 1 つです（worktree は作らない）
- コミットは自分のパスだけに絞ります。`git commit --only -- <自分のパス>` を使い、`git add -A`、`git stash`、ほかの人のファイルへの `git checkout` や `git restore` はしません
- `index.lock` で失敗したら、数秒待ってやり直します。lock のファイルを消しません
- コミットはデモのまとまりごとに切ります（例: drag の 4 個で 1 コミット）。Conventional Commits の形で、本文に意図を書きます
- `Claude-Session:` 行や claude.ai の URL を付けません（context.md の 7 章）
- PR は 1 本にします。大きくなっても分けません

### 確かめ方

- 開発サーバーは統合役が 1 つだけ動かします（`pnpm dev`、`localhost:4321`）。各担当はそこで自分のデモを開きます
- 依存の追加（`pnpm install`）、開発サーバーの再起動、`pnpm build` は、統合役だけが行います。どれも、行う前に各担当へ知らせ、終わったらまた知らせます。その間に担当のテストが落ちたら、知らせのあとでやり直します
- 各担当は、自分のデモだけを Playwright で確かめます（`pnpm test:e2e --grep @<batch> --output test-results/<batch>`）。`--grep` はテストの名前で絞るので、`e2e/demos.spec.ts` はデモごとのテストの名前を `@<batch> <slug>`（例: `@A drag-pinch-simple`）にして作ります。`--output` を担当ごとに分けるのは、Playwright が実行を始めるときに出力先のフォルダを消すためです。同じフォルダを使うと、ほかの担当の結果やスクショを消してしまいます。HTML のレポートは出さず、`list` の表示にします
- テストで見るのは、コンソールのエラーがないこと、canvas が真っ白でないこと、`interaction` に合わせてマウスを動かしてもエラーが出ないこと、幅 800px と高さ 500px に縮めても崩れないことです
- 動きは、旧デモ（labobal.dev、laboobal.netlify.app、jsfiddle）と新しいページを並べて動かし、1 章でつかんだ気持ちよさが出ているかを目で比べます。ぴったり同じかどうかは見ません。比べたスクショや短い録画はコミットせず、統合役に渡します

## 6. 担当と順番

```
段階 0  準備（統合役）
  │
段階 1  土台（統合役）
  │
  ├─ 段階 2-1  今の 7 デモ                    batch: current
  ├─ 段階 2-2  A の 22 個                     batch: A
  ├─ 段階 2-3  B の 14 個（basic と gsap）      batch: B1
  ├─ 段階 2-4  B の 18 個（canvas、three、UI）  batch: B2
  └─ 段階 2-5  F6 の 4 本                     batch: F6
  │
段階 3  統合、考え方のまとめ、トップ（統合役）
  │
段階 4  マージのあと（統合役）
```

統合役は、この作業を任されたメインのエージェントです。段階 2 の 5 つは並べて別のエージェントに任せます。段階 2 の担当どうしは、互いを待ちません。

### 段階 0 準備（統合役）

1. 今の master に `nuxt2-final` のタグを付けて push する
2. `rebuild/astro` のブランチを切る
3. 3 章の素材の権利を作者に聞く（答えを待たずに段階 1 に進む）

### 段階 1 土台（統合役）

1. Nuxt のファイルを消し、Astro の雛形を置く。`.nvmrc` を 26 にし、`packageManager` を pnpm 10 にする
2. 3 章の表の依存を最新版で入れ、版を固定する。three、gsap、lil-gui は必ず入れる。locomotive-scroll（scrollmanager で使う見込み）、Lenis、chroma-js は、使うデモの担当から頼まれてから足す
3. ESLint、Prettier、TypeScript の設定を webmanab から写す
4. `lib/demos.ts`（`defineDemo` と一覧）、`DemoLayout.astro`、`pages/[slug].astro`、仮のトップ（一覧だけ）を作る。`[slug].astro` は、`lib/demos.ts` の一覧から `getStaticPaths()` を返す（静的出力の動的ルートに必須。webmanab の `src/pages/lab/[slug].astro` と同じ形）。デモの本体は slug から `src/demos/<slug>/Demo.astro` を `import.meta.glob` で引く
5. `src/shared/` に、複数のデモで使う関数（数の補間、ノイズ、文字の分割など）を今の書き方で置く。旧コードの `utility/`、`math.js`、`assets/js/math.ts`、`noise.js`、`animation.ts` は中身を読む材料にし、写さない
6. `netlify.toml` を書く。ビルドのコマンド、公開フォルダ、Node の版、応答ヘッダー、大文字のパスの 301、使わないファイルだけの変更でビルドを止める設定（webmanab の `scripts/netlify-ignore.sh` と同じやり方）
7. `public/sw.js` に、自分を解除してキャッシュを消す Service Worker を置く
8. Playwright のテスト（`e2e/demos.spec.ts`）と、GitHub Actions の CI（lint、型、ビルド、E2E）を置く。Playwright は webmanab と同じ 1.64.1
9. `docs/ideas.md` の見出しだけを置き、`docs/dropped/` を作る
10. 見本として marquee（いちばん小さい）を作り直し、`notes.md` も書いて、5 章の決まりで 1 本作れることを確かめる。各担当はこれを手本にする
11. ここまでを push し、PR を下書き（draft）で開く。Netlify のデプロイプレビューでビルドが通ることを確かめる

段階 1 が終わったら、段階 2 の担当に、この計画書と担当の表（7 章）を渡して始めてもらいます。

### 段階 2 デモを作り直す（5 つを並べる）

担当ごとのデモは 7 章の表のとおりです。各担当は、デモ 1 つずつ次の順で進めます。

1. 旧デモを動かして見る。旧サイトがないものは旧コードを読む。何が気持ちいいのかを言葉にする
2. 残すか下げるかを、3 章の基準で決める。下げるなら `docs/dropped/<batch>.md` に、下げた理由と残しておきたい考え方を書いて、そのデモは終わり
3. 最新版のライブラリで、1 でつかんだ気持ちよさを再現する
4. `notes.md` を書く
5. テストを通し、旧デモと並べて比べる
6. デモのまとまりごとにコミットする

全部終わったら、統合役に次のことを伝えます。残したデモと下げたデモ、各デモの「大事なところ」の要点、ほかのデモにも通じそうな考え方、気になったこと（雰囲気が出しきれなかったもの、仮の画像のままのものなど）。

担当ごとの注意:

- 2-1 今の 7 デモ: URL は今のまま（小文字）にする。下げない。scrollmanager は 3 章の「スクロールの扱い」のとおり、まず locomotive-scroll の最新版で作り直す（依存は統合役に頼む）。scrollmanager は codrops の TileScroll、nodeballs は CodePen の mnmxmx/mEVxeg が元なので、`credits` に書く
- 2-2 A の 22 個: lab の記事 7 本の題材なので下げない。`notes.md` が記事の下書きの材料になるので、「大事なところ」を厚めに書く。reveal と mouse の 4 個は、止まった `source.unsplash.com` の代わりの画像を置く
- 2-3 B の 14 個: 下げる候補が多い。重なっている lab と tip の記事は、webmanab.com で読んで比べる
- 2-4 B の 18 個: Canvas 2D の基本のものは下げる候補。WebGL のもの 6 個は three の最新版で書き直す。canvas-draw-svg を残すなら、Vogue Japan のロゴは使わない。three-video は動画の出どころの答えを待つ
- 2-5 F6 の 4 本: jsfiddle のエディタの画面からソースを取り出して読む（context.md の 4 章）。記事の説明にある動きを、jQuery と TweenMax を使わずに再現する。止まった画像の代わりを置く。`article` に lab の記事の URL を入れる。記事の本文のコードの抜粋は古い書き方のまま残る（旧記事は一括で書き直さない方針）ので、`notes.md` の「もとのデモから変えたこと」に、記事のコードとの違いを書く

### 段階 3 統合、考え方のまとめ、トップ（統合役）

1. 7 章の 65 個の slug を、`src/demos/` と `docs/dropped/` に照らし合わせる。どちらにもない slug、両方にある slug があれば担当に戻す。照らし合わせは短いスクリプトで行い、結果を PR に貼る
2. 各担当の報告を見て、旧デモと並べて雰囲気が出ていないものを直す（担当に戻してもよい）。下げたデモの理由と考え方も見て、下げすぎていないか、考え方が一般論になっていないかを確かめる
3. 各担当の `notes.md`、`docs/dropped/`、報告から、デモをまたいだ考え方を `docs/ideas.md` にまとめる
4. トップを作る。3 章の方針で案を作り、スクショを作者に見せる。直しを受けて仕上げる
5. `pnpm build` と全体のテストを通す
6. デプロイプレビューで 2 章の「終わったと言える条件」を順に確かめる。`curl` でパス、301、ヘッダー、`/sw.js` の中身を見る
7. 埋め込みを確かめる。プレビューの URL を `<iframe>` で埋め込んだだけの HTML を作業用のフォルダに作り、`localhost` で開いて表示を見る。webmanab のファイルは変えない
8. 本番の Service Worker の確かめに使うブラウザを用意する。決まったプロファイルの Chrome で今の labobal.dev を開き、旧 Service Worker が登録され、`/_nuxt/` のキャッシュがあることを DevTools で確かめておく（段階 4 で使う）
9. PR の本文に、範囲、確かめたこと、slug の照らし合わせの結果、新旧のスクショの表、下げたデモの一覧と理由、仮の画像のまま残したもの、範囲の外の作業を書き、下書きを外す

### 段階 4 マージのあと（統合役）

1. マージコミットでマージする（スカッシュしない）
2. 本番（labobal.dev）で、2 章の確認をもう一度 `curl` とブラウザでする
3. 段階 3 の 8 で用意したブラウザで labobal.dev を開き直す。Service Worker の登録が消えたこと、`caches.keys()` が空になったこと、新しいページが出ることを確かめる。`/sw.js` の中身を見るだけでは、前に来た人のブラウザで解除が走った証拠にならないため
4. Dependabot の open の PR 7 本を閉じる
5. webmanab#53 に、出したこと、下げたデモ、範囲の外の作業を書く

## 7. デモの一覧と担当

slug はここで決めておきます。担当が自分で名前を付けないことで、重なりを防ぎます。「下げる候補」の列に印があるものは、3 章の基準で下げる候補です。

laboobal の「もとの部品」は `docs/.vuepress/components/` からの相対パス、ページは `docs/` からの相対パスです。laboobal-dev の「もと」はこのリポジトリのパスです。

この章の 65 個の slug が、作業の終わりに照らし合わせる基準になります（6 章の段階 3）。

### 2-1 今の 7 デモ（laboobal-dev の `pages/`）

| slug | もと | 旧デモの依存、素材 |
| --- | --- | --- |
| amoeba | `pages/amoeba` | `assets/js/amoeba`、dat.gui |
| blob | `pages/blob` | three、gsap、dat.gui |
| blobradius | `pages/blobRadius` | dat.gui |
| marquee | `pages/marquee` | 段階 1 で見本として作り直す |
| nodeballs | `pages/nodeBalls` | `assets/js/nodeBall`、tweakpane。もとは CodePen の mnmxmx/mEVxeg |
| scrollmanager | `pages/scrollManager` | locomotive-scroll、`assets/js/scrollManager`、`assets/images/test`。もとは codrops の TileScroll |
| splitting | `pages/splitting` | splitting |

marquee は段階 1 で統合役が作り直すので、2-1 の担当は残りの 6 本です。

### 2-2 laboobal の A（22 個、下げない）

| ページ | slug | もとの部品 |
| --- | --- | --- |
| basic/drag | drag-pinch-simple、drag-pinch-friction、drag-pinch-lines、drag-pinch-word | `basic/DragPinch*` |
| basic/follow | follow-mouse、follow-mouse-spring、follow-mouse-transform、follow-mouse-spotlight | `basic/FollowMouse*` |
| basic/hover | hover-control-css、hover-control、hover-rect | `basic/Hover*` |
| basic/scroll | scroll-reveal、scroll-reveal-color、scroll-reveal-transform | `basic/ScrollReveal*` |
| effects/mouse | mouse-tilt、mouse-skew | `effects/EffectsTilt`、`effects/EffectsSkew` |
| effects/reveal | reveal-curtain、reveal-clip | `effects/RevealCurtain`、`effects/RevealClip` |
| canvas/distortion、distortion2 | distortion-slider-a、distortion-slider-b、distortion-slider-c、distortion-slider-d | `Canvas/DistortionSlider*` |

### 2-3 laboobal の B のうち basic と gsap（14 個）

| slug | もとの部品 | 下げる候補 | 理由 |
| --- | --- | --- | --- |
| trigonometry-circle | `basic/TrigonometryCircle` | ○ | tip/animation-sin-cos と lab の三角関数の記事 6 本と重なる |
| trigonometry-sine | `basic/TrigonometrySine` | ○ | 同上 |
| trigonometry-random-floating | `basic/TrigonometryRandomFloating` | | ふわふわ漂う動きは、ほかにない |
| random-color | `basic/RandomColor` | ○ | tip/control-random-values と lab/random-color-* と重なる |
| random-color-rotation | `basic/RandomColorRotation` | ○ | 同上 |
| random-transform | `basic/RandomTransform` | | |
| rotate3d-x | `basic/Rotate3dX` | ○ | rotate3d-xyz に含まれる |
| rotate3d-y | `basic/Rotate3dY` | ○ | 同上 |
| rotate3d-xyz | `basic/Rotate3dXYZ` | | |
| gsap-basic | `basic/gsap/Basic` | ○ | GSAP の公式ドキュメントと同じ |
| gsap-random-repeat | `basic/gsap/RandomRepeat` | | |
| gsap-stagger | `basic/gsap/Stagger` | | |
| gsap-timeline | `basic/gsap/Timeline` | ○ | GSAP の公式ドキュメントと同じ |
| gsap-motion-path | `basic/gsap/MotionPath` | | |

### 2-4 laboobal の B のうち canvas、three、UI（18 個）

| slug | もとの部品 | 下げる候補 | 理由 |
| --- | --- | --- | --- |
| canvas-cross-origin | `Canvas/CanvasCrossOrigin` | ○ | 画像の読み込みの説明で、見せたい動きがない |
| canvas-draw-svg | `Canvas/DrawSvg` | ○ | Canvas 2D の基本。素材の Vogue Japan のロゴは使えない |
| canvas-draw-line | `Canvas/DrawLine` | ○ | Canvas 2D の基本で、MDN に同じ内容がある |
| canvas-draw-rect | `Canvas/DrawRect` | ○ | 同上 |
| canvas-draw-circle | `Canvas/DrawCircle` | ○ | 同上 |
| canvas-draw-text | `Canvas/DrawText` | ○ | 同上 |
| canvas-draw-shadow | `Canvas/DrawShadow` | ○ | 同上 |
| canvas-draw-gradient | `Canvas/DrawGradient` | ○ | 同上 |
| canvas-alpha-blending | `Canvas/AlphaBlending` | ○ | 同上 |
| canvas-fill-text | `Canvas/FillText` | | 見てから決める |
| canvas-draw-image | `Canvas/DrawImage` | | 見てから決める |
| canvas-fake3d | `Canvas/Fake3d` | | 深度の画像で立体に見せる。lab の記事の候補 |
| canvas-shift-image | `Canvas/ShiftImage*` | | |
| canvas-glitch-image | `Canvas/Glitch*` | | lab/noise-glitch と一部重なる。見てから決める |
| three-video | `Three/Video*` | | 動画の出どころの答えを待つ |
| three-typo | `Three/Typo*` | | |
| three-scale | `Three/Scale*` | | |
| virtual-scroll | `UI/VirtualScroll` | ○ | 旧ページの本文は「tes」だけ。動かして見てから決める |

WebGL を使うのは、canvas-fake3d、canvas-shift-image、canvas-glitch-image、three-video、three-typo、three-scale の 6 個と、2-2 の distortion-slider の 4 個です。

### 2-5 jsfiddle の壊れている 4 本（F6 の 1 番目、下げない）

slug は webmanab の lab の記事と同じにします。4 本とも記事に説明文があるので、#53 の決まりどおり作り直します。

| slug | fiddle | 旧デモの依存、壊れ方 |
| --- | --- | --- |
| parallax-shifting-divided-background-by-mouse | xban07vu | jQuery (edge)、TweenMax。`source.unsplash.com` が止まって画像が出ない |
| parallax-distorts-by-following-mouse | vxmrkkyd | `source.unsplash.com` が止まって画像が出ない |
| tweenmax-visual-range-animation-class | j5tp2cw2 | TweenMax。`source.unsplash.com` が止まって画像が出ない |
| css-embed-images-scroll-the-screen-iphone6-outline-mockup | 656k72Lf | `placekitten.com` が止まって画像が出ない |

### F6 の残り 43 本（次の PR、下げない）

2026-11-02 にエディタの画面から 43 本のソースを取り出しました（context.md の 4 章のやり方を Playwright で）。context.md の 4 章は数を 7、22、14 と書いていましたが、取り出したソースで依存を見直すと 8、24、11 でした。`post-1564` は Processing.js を、`move-a-node-with-springiness` は CreateJS を使っていました。

43 本とも、#53 の決まりどおり下げません。移す理由は jsfiddle のライブラリへの依存を外すことなので、動きのデモでないもの（文字数を数える、表、フォーム）も小さなページとして移します。slug は記事と同じにします。

作り直したあとにすること:

- `node scripts/capture-previews.mjs <slug>` でトップの動画とポスターを撮って、コミットする。撮らないと、トップで触れても何も出ない
- vault の記事の iframe と `demoUrl` を、F6 の 1 番目の 4 本と同じ形に書き換える

#### 2-6 jsfiddle の jQuery (edge) の 8 本（F6 の 2 番目）

jsfiddle の「jQuery (edge)」は、その時点の最新の jQuery を読みます。jQuery の版が上がると動かなくなるので、先に移します。

| slug | fiddle | 旧デモの依存 | メモ |
| --- | --- | --- | --- |
| count-textarea | 58v2d54d | jQuery (edge)、Bootstrap 4 alpha | 入力欄の文字数を数える。動きのデモではないが、小さなページとして移す |
| css-background-clip-text | tg2h1ety | jQuery (edge)、Bootstrap 4 alpha | CSS だけ |
| flex-responsive-table | pLfa203m | jQuery (edge)、Bootstrap 4 alpha | 表のレイアウト。小さなページとして移す |
| hover-effect-to-change-the-background-colo | 5b5cpyd3 | jQuery (edge)、Bootstrap 4 alpha | CSS だけ。slug は記事のまま（末尾が切れている） |
| jqueryui-simple-calender | ykqu87wo | jQuery (edge)、jQuery UI | jQuery UI のカレンダー。jQuery UI を使わずに作るか、作者と決める |
| styling-input | 0j1qxgmL | jQuery (edge)、Bootstrap 4 alpha | フォームの見た目。小さなページとして移す |
| toc | n7gr16v6 | jQuery (edge)、Bootstrap 4 alpha | 見出しから目次を作る |
| tweenmax-easing-of-scroll-parallax | ab42k442 | jQuery (edge)、TweenMax 1.19 | スクロールのパララックス |

#### 2-7 jsfiddle の Processing.js と CreateJS の 24 本（F6 の 3 番目）

Processing.js と CreateJS は、jsfiddle のライブラリの選択肢から読んでいます。選択肢から消えると動かなくなります。Canvas 2D でそのまま書けるものが多いです。

| slug | fiddle | 旧デモの依存 | メモ |
| --- | --- | --- | --- |
| processing-js-circle | zfbL36h3 | Processing.js |  |
| processing-js-circle-at-the-mouse-position | 14w0mxjx | Processing.js |  |
| processing-js-draw-countless-circles-draw-function | khdb9r0c | Processing.js |  |
| processing-js-gradation-dot | o6bfp7s1 | Processing.js |  |
| processing-js-line-and-point | d2y41xkn | Processing.js |  |
| processing-js-random-square | nyeu0bu2 | Processing.js |  |
| processing-js-random-walk | 5xfqs4a0 | Processing.js |  |
| processing-js-rect-in-a-circle | 3nLbap1g | Processing.js |  |
| processing-js-rect-spiral | 3c6v5rn5 | Processing.js |  |
| processing-js-square | qk8sc068 | Processing.js |  |
| processing-js-star | te5e6jt6 | Processing.js |  |
| processing-js-triangle | x33ezzq7 | Processing.js |  |
| news-ticker-infinite-loop | fLyu4qjs | jQuery、Processing.js | 記事は lab/post-1564（slug が「無限ループするニュースティッカー-『javascript』」）。日本語の slug は URL にできないので、この slug を新しく切る |
| create-js-line-motion-trigonometric-sin | 7s1wt0y1 | CreateJS |  |
| createjs-beat-motion-trigonometric | swsha6gf | CreateJS |  |
| createjs-gravity-and-friction | omnrhpx0 | CreateJS |  |
| createjs-node-motion | grbz1m8q | CreateJS |  |
| createjs-revolution-trigonometric | 74yzsoyj | CreateJS |  |
| createjs-round-motion-trigonometric | 4dL339yw | CreateJS |  |
| random-color-circle-createjs | vjj3xuam | CreateJS |  |
| random-color-square-createjs | gjorzf2w | CreateJS |  |
| star-random-color-createjs | b31yvc1u | CreateJS |  |
| star-rotate-animation-createjs | 6h97y09b | CreateJS |  |
| move-a-node-with-springiness | x6buvc9o | CreateJS（jsDelivr から） |  |

#### 2-8 jsfiddle の残りの 11 本（F6 の 4 番目）

| slug | fiddle | 旧デモの依存 | メモ |
| --- | --- | --- | --- |
| circular-motion-with-depth | 91zjtj4g | jQuery、TweenMax 1.20 |  |
| customize-easing-of-mouse-scroll | pkme3arj | SmoothScroll 1.4 | ホイールのスクロールを滑らかにする |
| effects-to-youtube-videos | opfs6phu | jQuery、jquery.mb.YTPlayer | YouTube の動画を背景に流してエフェクトをかける。実行時に YouTube を読むので 2 章の決まりに合わない。手元の短い動画に差し替えて、同じエフェクトをかける案 |
| give-speed-and-angle-as-separate-random-values | L4806xs6 | jQuery、TweenMax 1.20 |  |
| move-an-object-while-drawing-a-circle | 5n1a0hjy | jQuery、TweenMax 1.20 |  |
| rotate-elements-arranged-on-the-circumference | 74uzrxL6 | jQuery、TweenMax 1.20 |  |
| smooth-movement-using-sin-wave | skrxqb9j | jQuery、TweenMax 1.20 |  |
| css-cube-animation | gre2a7tm | なし | CSS だけ |
| hover-text-effect | yn1zsrvx | なし | CSS だけ |
| noise-glitch | o5pp8s9f | なし | Canvas 2D |
| vue-todo | 6t7780ua | Vue 2 | Vue の ToDo。Vue を入れずに作るか、作者と決める |

## 8. リスクと手当て

| リスク | 起きたときのこと | 手当て |
| --- | --- | --- |
| 作り直したら雰囲気が変わる | 旧デモの良さが消える | 旧デモを先に動かして、気持ちよさを言葉にしてから作る。並べて比べる。統合役が段階 3 で見る |
| 下げすぎる | 残すべき考え方が消える | 下げたデモも `docs/dropped/` に考え方を書く。統合役が理由を見る。PR に一覧を載せて作者が見る |
| メモが形だけになる | あとで見返しても役に立たない | 見本の marquee の `notes.md` を手本にする。「大事なところ」が空や一般論なら、統合役が担当に戻す |
| F6 の記事のコードとデモがずれる | 記事の抜粋は TweenMax のまま、デモは新しい書き方になる | 記事は一括で書き直さない方針なので受け入れる。違いは `notes.md` に書く |
| 同じ作業ディレクトリでの衝突 | ほかの人の変更を巻き込んだり消したりする | 5 章のコミットの決まり。触るのは自分のフォルダとファイルだけにする。テストの出力先も担当ごとに分ける |
| 依存の追加が担当ごとにばらばらに入る | `pnpm-lock.yaml` がぶつかる | 依存は統合役だけが足す |
| 素材の権利の答えが出ない | 仮の画像のまま出すことになる | 仮の画像を自分で作った素材か Unsplash の写真にしておけば、そのまま出せる。PR に残したものを書く |
| Service Worker の解除が効かない | 前に来た人に Nuxt のページが出続ける | デプロイプレビューと本番で `/sw.js` の中身を確かめる。旧サイトを開いたことのあるブラウザで、新しいページが出ることも見る |
| Netlify のビルド時間 | デプロイプレビューで webmanab と分け合う無料枠を使う | push はまとまりごとにする。使わないファイルだけの変更ではビルドを止める |
| PR が大きくてレビューしにくい | 見落としが出る | コミットをデモのまとまりごとに切る。PR の本文に担当ごとの節を作り、スクショの表を付ける |
