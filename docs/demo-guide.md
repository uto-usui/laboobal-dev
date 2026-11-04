# デモの作り方

labobal.dev に新しいデモを足すときの決まりです。出すまでの順番（ブランチ、PR、本番の確認）は [release.md](release.md) にあります。見本は `src/demos/marquee/`（CSS だけ）と `src/demos/drag-pinch-simple/`（script あり、指で引っぱる）です。

## 1. 置くファイル

```
src/demos/<slug>/
  meta.ts       デモの情報（2 章）
  Demo.astro    マークアップと style
  main.ts       動かす script（なくてもよい）
  README.md     考え方のメモ（3 章）
  assets/       このデモだけが使う画像、動画、シェーダー
src/pages/<slug>.astro
```

`src/pages/<slug>.astro` は次の中身で、`<slug>` のところだけを替えます。ページを 1 つの動的ルート（`[slug].astro`）にまとめないのは、まとめると全デモの CSS がどのページにも付くためです。

```astro
---
import DemoLayout from '../layouts/DemoLayout.astro'
import Demo from '../demos/<slug>/Demo.astro'
import meta from '../demos/<slug>/meta'
---

<DemoLayout demo={meta}>
  <Demo />
</DemoLayout>
```

- slug は小文字のケバブケースで、フォルダ名と同じにする。そのまま URL（`/<slug>/`）になる。lab の記事があるなら、記事の slug にそろえる
- 一度出した slug は変えない。lab の記事の iframe と webmanab の記事ページが URL で読んでいる
- 一覧は `src/lib/demos.ts` がフォルダから集めるので、ほかの共有のファイルに足すものはない。ファイルが欠けている、別のデモを読んでいる、meta が決まりに合わない、のどれかがあるとビルドが落ち、置くべき中身がエラーに出る（開発サーバーでは、そのデモだけ外して警告にする）

## 2. meta.ts

```ts
import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-simple',
  title: 'つまんで離す',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [],
  webgl: false,
  interaction: 'drag',
  created: '2026-11-10',
  added: '2026-11-10',
  description: '丸をつまんで引っぱり、離すと真ん中へ戻る。',
  tags: ['drag', 'physics'],
  tech: ['js'],
})
```

| 項目 | 要るか | 中身 |
| --- | --- | --- |
| `slug` | 要る | フォルダ名と同じ |
| `title` | 要る | 日本語の短い名前。ページの title と info のパネルに出る |
| `category` | 要る | おおまかな分け方（drag、hover、webgl など）。今の一覧は `rg "category:" src/demos` で見る |
| `batch` | 要る | 新しく作るデモは `'new'`。ほかの値は作り直しのときの担当の区切り |
| `article` | 省略可 | lab の記事の URL。記事が出てから入れる（`.claude/skills/link-lab-article/`） |
| `origin` | 要る | もとのデモの場所。ここで新しく作ったなら、そう書く（particle-photo の形） |
| `credits` | 要る | ほかの人のコードや素材をもとにしたときの `{ label, url }`。なければ `[]`。ページには出さない（3 章のクレジットの節に書く） |
| `webgl` | 要る | WebGL を使うか |
| `webgpu` | 省略可 | WebGPU で描くなら `true` |
| `interaction` | 要る | `'drag'`、`'hover'`、`'scroll'`、`'click'`、`'none'`。E2E とプレビューと SNS の動画を撮るときのマウスの動かし方と、トップの絞り込みに使う |
| `created` | 要る | もとのデモを作った日。YYYY-MM-DD（日が分からなければ YYYY-MM）。日本時間の日付にする（jsfiddle の dateCreated は UTC なので直す）。トップの latest はこれで並ぶ |
| `added` | 要る | labobal.dev に出した日。YYYY-MM-DD。RSS（`/rss.xml`）、更新履歴（`/log/`）、新着はこれで決まる |
| `description` | 要る | 何が起きるかを一文で。ページの description、OGP、info のパネルに出る |
| `tags` | 要る | 何を見せるデモか。`src/lib/demos.ts` の `TAGS` の中から選ぶ |
| `tech` | 要る | 何で作ったか。`src/lib/demos.ts` の `TECH` の中から選ぶ |
| `pick` | 省略可 | `true` にするとトップのピックアップに出る。どれを出すかは作者が決める |

`tags` と `tech` に合う言葉がないときは、先に `src/lib/demos.ts` の `TAGS` か `TECH` に足し、上のコメントに意味を一言書きます。ないものを書くとビルドが落ちます。

## 3. README.md（考え方のメモ）

どのデモにも付けます。GitHub でフォルダを開くと出て、info のパネルの「コード」からも来られます。lab の記事を書くときの材料にもなります。

```markdown
# つまんで離す

## 何をしているか

（見えていることを短く）

## 大事なところ

（この動きの気持ちよさがどこから来るか。何を真似すればこの動きになるか。コードを読まなくても分かるように）

## 作り方

（使った API とライブラリ、選んだ理由。ネイティブの API にしなかったならその理由）

## もとのデモから変えたこと

（もとがあるときだけ）

## もと

- （もとのデモの場所）

## クレジット

- codrops TileScroll: https://github.com/codrops/TileScroll （MIT License）
```

- 「大事なところ」がいちばん大事な節です。一般論で済ませない
- 文は平易な日本語で、です・ます にしなくてよい
- 「クレジット」は、ほかの人のコードや素材を使ったときだけ置く。1 行に 1 つ、`- <名前>: <URL> （<ライセンス>）`。ライセンスは上流で確かめたものだけを書く。写真が何枚もあるときは、上に「写真」の節を作って 1 枚ずつ出どころを書き、クレジットからはそこを指す
- ほかの人のコードを写したときは、写したファイルにも上流の LICENSE をそのまま写す（`src/demos/scrollmanager/Demo.astro`、`src/demos/particle-photo/shaders.ts` が例）。ルートの [README.md](../README.md) の「第三者のコードと素材」にも足す
- ほかのデモにも通じる考え方が出てきたら、[ideas.md](ideas.md) にも書き足す

## 4. Demo.astro と main.ts

### 大きさ

- `main.demo` を画面いっぱいに使う。lab の記事の iframe（幅 100%、高さ 400〜500px）でも、スマホの幅でも見られるようにする
- 寸法は `vw` や `vh` ではなく、入れ物を基準にする（`cqw`、`cqh`、%）。`vw` は iframe の中でもスクロールバーの分だけはみ出す
- 大きさが変わったら描き直す。`window` の resize ではなく `onResize`（`src/shared/dom.ts`）を使う。iframe の高さが変わったときも拾える

### 素材

- 画像、動画、フォント、シェーダーは `assets/` に置いて import する。実行時に外のサーバーから読まない（`source.unsplash.com` が止まって、旧デモが 4 本壊れた）
- 写真は軽い形式で出す。Demo.astro の `<img>` は Astro の `<Picture>` で AVIF と WebP にし、`loading="eager"` にする（写真がデモそのものなので。例は reveal-clip）。CSS の背景は `getImage` で WebP にする。JS で読んで WebGL のテクスチャや canvas に使う写真は、WebP にしてリポジトリに置く（AVIF は Safari の古い版で読めず、JS の側では代わりを出せない）

### 共有の部品（`src/shared/`）

| 部品 | 使うとき |
| --- | --- |
| `loop(callback)`（dom.ts） | 毎フレーム動かす。dt は 0〜0.1 秒に収まる。画面の外やタブが裏にある間は回らない。requestAnimationFrame を直に使わない |
| `autoplayLoop(callback, still)`（motion.ts） | ひとりでに動き続けるループ。動きを減らす設定の間は回さず `still` で止まった絵を描く（5 章） |
| `pixelRatio()`、`fitCanvas(canvas, ctx)`（dom.ts） | canvas の解像度。devicePixelRatio は 2 で止める。2D は CSS の px の座標のまま書ける |
| `onResize(el, callback)`（dom.ts） | 大きさが変わったとき。登録した時点で 1 回呼ぶ |
| `changeGate()`（dom.ts） | 追いつきかけて動きが小さくなったフレームで style を書かない |
| `trackPointer(el, options)`、`pointerOrWander()`（pointer.ts） | ポインターの位置。マウスのない端末で、マウスの代わりにゆっくり動かす |
| `touchGate(el)`（touch.ts） | 指で引っぱるデモ（6 章） |
| `createGlStage(canvas, options)`（gl.ts） | three の WebGLRenderer を作る入口。WebGL が使えなければ一行の案内を出して `undefined` を返す。context を失ったら止め、取り戻したら動かし直す。`new THREE.WebGLRenderer` を直に作らない |
| `showFallback(message)`（dom.ts） | 使えない機能があるときの一行の案内（WebGPU など） |
| `gsap`、`autoplay(animation, still)`（gsap.ts） | GSAP は `'gsap'` からではなく `src/shared/gsap` から読む。画面の外にいる間、GSAP の動きをまとめて止めるため。ひとりでに動き続ける tween や timeline は `autoplay` に渡す |
| `whenVisible(callback)`（visibility.ts） | 1 回だけ再生するもの。画面の外で再生を終えてしまわないよう、見えてから始める |
| `lerp`、`damp`、`clamp`、`map` など（math.ts）、`splitText`（split-text.ts）、`createNoise`（noise.ts）、`simplex-noise.glsl`（glsl/） | 数の補間、文字を 1 文字ずつの span に分ける、ノイズ |

- 画面の外やタブが裏にある間は、`loop()` と `src/shared/gsap` と CSS の animation（`html[data-offscreen]`）が止まる。自前で requestAnimationFrame や setInterval を回すと止まらない
- 1 本の lab の記事に WebGL のデモを置くのは 4 つまで。重いデモを作るときは、それを前提にする

## 5. 動きを減らす設定

OS の「視差効果を減らす」など（CSS の `prefers-reduced-motion: reduce`）への対応です。どのデモもこの決まりに従います。設定がないときの見た目と動きは変えません。

1. ひとりでに動き続けるもの（ループ、くり返すアニメーション、自動で次へ進むスライダー、動画）は止め、止まった 1 枚の絵を見せる。絵は最初のコマか、何のデモか分かる 1 コマ
2. 開いたときや画面に入ったときに 1 回だけ再生するもの（reveal など）は、再生せずに終わりの姿を見せる
3. 読む人の操作にそのままついてくる動き（マウスや指に追いつく、ドラッグ、ホバー、スクロールに合わせて動く）は残す。クリックや replay のボタンで読む人が始める再生も残す。マウスのない端末で、マウスの代わりに自動で動かす分は止める
4. スクロールを滑らかにする処理（ホイールを奪って慣性を付ける、ページの中のリンクで滑らかに移る）は外し、ふつうのスクロールにする
5. 点滅するものは止める
6. 開いている途中で設定を変えても、読み直さずにその場で切り替わる。ただし数秒で終わる 1 回きりの再生は、始まっていれば最後まで動く

書き方:

- script のループは `autoplayLoop`、GSAP は `autoplay`、そのほかは `onReducedMotion`（`src/shared/motion.ts`）で切り替える。イベントのたびに今の設定を見るだけなら `prefersReducedMotion()`（dom.ts）でよい
- CSS の animation は、ひとりでに動くものの要素に `data-motion="auto"` を付ける。`src/styles/base.css` がその要素だけを止める（スクロールに合わせて動く `animation-timeline` の animation まで止めないため）
- ひとりでに動き続けるデモは、`e2e/motion.spec.ts` の `AUTOPLAY` に足す（WebGL を使わないなら `AUTOPLAY_WITHOUT_GL` にも）。設定を入れたら止まった絵になるか、途中で替えたらその場で止まるかを見る

## 6. タッチ

lab の記事に iframe で埋め込んだとき、デモの上を指で縦になぞっても記事を読み進められるようにします。

- `touch-action: none` を書かない。書くと、デモの上で記事のスクロールが止まる
- ホバーで動くだけのデモ（マウスを追う、傾けるなど）は、CSS で `touch-action: pan-y` にする
- 指で引っぱるデモは、CSS で `touch-action: pan-y` にし、main.ts で `touchGate(el)`（`src/shared/touch.ts`）を呼ぶ。横に動かし始めたらデモが受け取り、タップしてからなら縦にも引っぱれる。タッチの端末では左上に「tap to drag」が出る
- 引っぱるデモは `e2e/motion.spec.ts` の `DRAG` に足す。iframe に入れて縦になぞったとき、記事がスクロールするかを見る

## 7. ページの UI

- 右の端（下寄り）に、`DemoLayout` が縦書きの「info」ボタンを置き、押すと右からパネルが出る。パネルには slug、title、description、created、tags、tech と、記事、コード、トップへのリンクが出る。右の端、とくに右下に、デモのボタンや文字を置かない
- デモの側でリンクを作らない。記事やトップへのリンクはパネルが出す
- 小さな部品は `src/styles/base.css` にある。左上の添え書き（`.demo-hint`、scroll-reveal の「scroll」など）と、左下のもう一度ボタン（`.demo-replay`、reveal の 2 本）
- lil-gui は右上に出る。使うデモは、パネルと重ならないかを見る
- デモの上に UI を足したら、プレビューと SNS の動画から隠す。`scripts/capture-previews.mjs` の隠す一覧（今は `.links, .info, .lil-gui`）に足すか、SNS の動画なら要素に `data-capture-hide` を付ける

## 8. プレビュー

トップの一覧で触れたときの動画と、lab の記事ページの動画です。`public/previews/<slug>.jpg`、`.webm`（480×300）と `.webp` を撮ってコミットします。手順は `.claude/skills/capture-preview/SKILL.md` です。jpg と webm は webmanab が URL で直接読むので、名前と大きさを変えません。

## 9. 大きさの上限

`pnpm check:budget`（`pnpm verify` と CI に入っている）が、ページを開いた直後に読む HTML、CSS、JS の大きさを見ます。デモは読むライブラリで上限が分かれます。

| 分け方 | 上限（brotli） |
| --- | --- |
| ライブラリなし | 8 KB |
| gsap を読む | 36 KB |
| three を読む | 170 KB |

ライブラリをデモのコードの中に抱えるもの（GSAP のプラグイン、lil-gui、locomotive-scroll）は収まらないことがあり、`scripts/check-budget.mjs` の `demoOverride` に、理由と測った値を書いて足します。新しいライブラリを入れるときは、その大きさに見合うかを先に考えます。

## 10. E2E

`pnpm test:e2e`（先に `pnpm build`）で、Playwright が `dist/` を開いて見ます。新しいデモのテストは、`src/demos/*/meta.ts` を読んで自動でできます。

- `e2e/demos.spec.ts`: 全デモを開き、コンソールのエラーがないこと、canvas が描ける大きさになっていること（`.demo-fallback` が出ていない）、`interaction` に合わせてマウスを動かしてもエラーが出ないこと、幅 800px と高さ 500px に縮めても横にはみ出さないこと、別のオリジンの iframe に入れても動くことを見る。canvas が 1 色のままでないかは、GPU のない CI では見ず、手元でだけ見る
- `e2e/motion.spec.ts`: 動きを減らす設定（`AUTOPLAY`）と、指のスクロール（`DRAG`）。足すのは自分で（5 章と 6 章）
- `e2e/panel.spec.ts`、`e2e/top.spec.ts`、`e2e/seo.spec.ts`: パネル、トップの並びとピックアップ、OGP、sitemap、RSS、`/log/`

テストの名前は `@<batch> <slug>` なので、1 本だけなら `pnpm test:e2e --grep <slug>` で回せます。ほかの作業と同時に回すときは、`E2E_PORT` でポートを、`--output test-results/<名前>` で出力先を分けます。Playwright は始めに出力先を消すので、同じフォルダだとほかの人の結果を消します。

`/demos.json` は webmanab の `pnpm check:demos` が読む一覧です（slug、article など）。項目は足すだけにし、名前を変えたり消したりしません。

## 11. 確かめる

「動いた」と言う前に、ブラウザで開いて canvas が描かれていることまで見ます。手順は `.claude/skills/check-demo/SKILL.md` にまとめてあります。
