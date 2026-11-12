# デモの作り方

labobal.dev に新しいデモを足すときの決まりです。出すまでの順番（ブランチ、PR、本番の確認）は [release.md](release.md) にあります。見本は `src/demos/marquee/`（CSS だけ）と `src/demos/drag-pinch-simple/`（script あり、指で引っぱる）です。drag-pinch-simple は組のバリエーションなので、main.ts を `mount` の形で書いています。組でないデモは、mount の中身をそのままモジュールの top-level に書き、戻り値を受けなくてかまいません（4 章の共有の部品の節）。ほかのデモとパラメーターや作りだけが違うデモは、組に入れて 1 ページで切り替えられるようにします（12 章。見本は `src/groups/nodes/`）。

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
- 一覧は `src/lib/demos.ts` がフォルダから集めるので、ほかの共有のファイルに足すものはない。ファイルが欠けている、別のデモを読んでいる、meta が決まりに合わない、組の決まり（12 章）に合わない、のどれかがあるとビルドが落ち、置くべき中身がエラーに出る（開発サーバーでは、そのデモだけ外して警告にする）

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
| `group` | 省略可 | 入っている組の名前（`src/groups/<組>/` のフォルダ名）。組に入れるときだけ（12 章） |
| `variant` | 組なら要る | 組の中での短い呼び名。日本語でよい。切り替えの欄とトップの組の行に出る |

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
- ほかの人のコードを写したときは、写したファイルにも上流の LICENSE をそのまま写す（`src/demos/scrollmanager/Demo.astro`、`src/demos/particle-photo/shaders.ts` が例）
- ほかのデモにも通じる考え方が出てきたら、[ideas.md](ideas.md) にも書き足す

## 4. Demo.astro と main.ts

### 大きさ

- `main.demo` を画面いっぱいに使う。lab の記事の iframe（幅 100%、高さ 400〜500px）でも、スマホの幅でも見られるようにする
- 寸法は `vw` や `vh` ではなく、入れ物を基準にする（`cqw`、`cqh`、%）。`vw` は iframe の中でもスクロールバーの分だけはみ出す
- 大きさが変わったら描き直す。`window` の resize ではなく `onResize`（`src/shared/dom.ts`）を使う。iframe の高さが変わったときも拾える

### 素材

- 画像、動画、フォント、シェーダーは `assets/` に置いて import する。実行時に外のサーバーから読まない（`source.unsplash.com` が止まって、旧デモが 4 本壊れた）
- 写真は軽い形式で出す。Demo.astro の `<img>` は Astro の `<Picture>` で AVIF と WebP にし、`loading="eager"` にする（写真がデモそのものなので。例は reveal-clip）。CSS の背景は `getImage` で WebP にする。JS で読んで WebGL のテクスチャや canvas に使う写真は、WebP にしてリポジトリに置く（AVIF は Safari の古い版で読めず、JS の側では代わりを出せない）
- ほかのデモの写真を使い回すときは、写したあとに書き出し直して中身を変える。中身がまったく同じファイルが 2 つあると、ビルドで 1 つにまとめられ、片方のデモが読むファイルが出力されずに 404 になる（vhs-rewind で particle-photo の写真を写したときに起きた）

### 共有の部品（`src/shared/`）

始めたものを止める部品は、どれも止める関数か `dispose` を返します。組でないデモは、今までどおりモジュールの top-level で呼んで、戻り値を受けなくてかまいません（ページを閉じれば終わるため）。組のバリエーションは、戻り値を全部受けて、mount が返す関数の中で呼びます（12 章）。

| 部品 | 使うとき | 戻り値 |
| --- | --- | --- |
| `loop(callback)`（dom.ts） | 毎フレーム動かす。dt は 0〜0.1 秒に収まる。画面の外やタブが裏にある間は回らない。requestAnimationFrame を直に使わない | 止める関数 |
| `autoplayLoop(callback, still)`（motion.ts） | ひとりでに動き続けるループ。動きを減らす設定の間は回さず `still` で止まった絵を描く（5 章） | 止める関数（設定の見張りとループの両方） |
| `onReducedMotion(listener)`（motion.ts） | 動きを減らす設定が変わったときに切り替える（5 章）。登録した時点で 1 回呼ぶ | 外す関数 |
| `pixelRatio()`、`fitCanvas(canvas, ctx)`（dom.ts） | canvas の解像度。devicePixelRatio は 2 で止める。2D は CSS の px の座標のまま書ける | `fitCanvas` は `{ width, height, dpr }` |
| `onResize(el, callback)`（dom.ts） | 大きさが変わったとき。登録した時点で 1 回呼ぶ | 止める関数 |
| `changeGate()`（dom.ts） | 追いつきかけて動きが小さくなったフレームで style を書かない | 比べる関数（止めるものはない） |
| `trackPointer(el, options)`、`pointerOrWander()`（pointer.ts） | ポインターの位置。マウスのない端末で、マウスの代わりにゆっくり動かす。同じページで作り直したとき（組の切り替えやパラメーターの変更）は、最後のポインターの位置から始める | `trackPointer` は位置と `.dispose()` |
| `trackPull(el)`（a/pull.ts） | 画面のどこを押しても、押した点からどれだけ引っぱったか | 量と `.dispose()` |
| `touchGate(el)`（touch.ts） | 指で引っぱるデモ（6 章） | 止める関数（listener、timer、「tap to drag」の添え書きを外す） |
| `hoverControl(el, over, out)`（a/hover-control.ts） | ホバーの動きを途中で止めずに最後まで動かす | 止める関数 |
| `createGlStage(canvas, options)`（gl.ts） | three の WebGLRenderer を作る入口。WebGL が使えなければ一行の案内を出して `undefined` を返す。context を失ったら止め、取り戻したら動かし直す。`new THREE.WebGLRenderer` を直に作らない | renderer。片付けは `renderer.dispose()`（three の後片付けに加え、context を手放す） |
| `showFallback(message)`（dom.ts） | 使えない機能があるときの一行の案内（WebGPU など） | 消す関数 |
| `gsap`、`autoplay(animation, still)`（gsap.ts） | GSAP は `'gsap'` からではなく `src/shared/gsap` から読む。画面の外にいる間、GSAP の動きをまとめて止めるため。ひとりでに動き続ける tween や timeline は `autoplay` に渡す | `autoplay` は止める関数（見張りを外し、animation を kill する） |
| `whenVisible(callback)`（visibility.ts） | 1 回だけ再生するもの。画面の外で再生を終えてしまわないよう、見えてから始める | 取りやめる関数（まだ呼んでいなければ） |
| `onRunningChange(listener)`（visibility.ts） | 画面の外やタブが裏に回って止まったとき、戻ったとき | 外す関数 |
| `fiddleCanvas(canvas, width, height, draw)`（fiddle-canvas.ts） | CreateJS で書いていた fiddle のデモ。もとの固定の大きさの座標のまま描く | `{ ctx, dispose }` |
| `sketch(canvas, width, height, draw)`（processing.ts） | Processing.js で書いていたスケッチ（processing-js-* のデモ） | `{ ctx, redraw, dispose }` |
| `lerp`、`damp`、`clamp`、`map` など（math.ts）、`splitText`（split-text.ts）、`createNoise`（noise.ts）、`simplex-noise.glsl`（glsl/） | 数の補間、文字を 1 文字ずつの span に分ける、ノイズ | |

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
- 組のバリエーションのページは、右上に「設定」のボタンが出る（`DemoLayout` が置く。押すと lil-gui で切り替えの欄とパラメーターが開く）。組のバリエーションは自分で lil-gui を出さず、欄は `params` に書く（12 章）
- デモの上に UI を足したら、プレビューと SNS の動画から隠す。`scripts/capture-previews.mjs` の隠す一覧（今は `.links, .info, .variant-toggle, .lil-gui`）に足すか、SNS の動画なら要素に `data-capture-hide` を付ける

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
- `e2e/groups.spec.ts`: 組ごとに、バリエーションを 3 周切り替えても前のもの（rAF のループ、WebGL の context、listener）が残らないこと、動きを減らす設定で切り替えても止まった絵になること、iframe の中でも切り替えられて画面の外では止まること。組の定義（`src/groups/*/meta.ts`）から自動でできる。組に固有の確かめ（引っぱる組の縦なぞりなど）は `e2e/groups-<組>.spec.ts` に足す（12 章）
- `e2e/panel.spec.ts`、`e2e/top.spec.ts`、`e2e/seo.spec.ts`: パネル、トップの並びとピックアップ、OGP、sitemap、RSS、`/log/`

テストの名前は `@<batch> <slug>` なので、1 本だけなら `pnpm test:e2e --grep <slug>` で回せます。組のテストの名前には組の名前が入るので、`pnpm test:e2e e2e/groups.spec.ts --grep <組>` で回せます。ほかの作業と同時に回すときは、`E2E_PORT` でポートを、`--output test-results/<名前>` で出力先を分けます。Playwright は始めに出力先を消すので、同じフォルダだとほかの人の結果を消します。

`/demos.json` は webmanab の `pnpm check:demos` が読む一覧です（slug、article など）。項目は足すだけにし、名前を変えたり消したりしません。

## 11. 確かめる

「動いた」と言う前に、ブラウザで開いて canvas が描かれていることまで見ます。手順は `.claude/skills/check-demo/SKILL.md` にまとめてあります。

## 12. 組（似たデモを 1 ページで切り替える）

パラメーターの値や作りの一部だけが違うデモ（色だけ違う、形だけ違う、同じ動きを別の書き方で書いた、など）は、組にまとめます。組のどのデモのページでも、右上の「設定」を押すと、組のほかのデモ（バリエーション）へ切り替えたり、パラメーターを動かしたりできます。トップでは組を 1 行にまとめ、名前の下に各バリエーションへのリンクを並べます。

- URL は今までどおりバリエーションごと（`/<slug>/`）で、組だけのページは作らない。プレビュー（`public/previews/<slug>.*`）も slug ごと。切り替えると URL、`document.title`、info のパネルが、切り替えた先のものに替わる。OGP と canonical は開いたページのまま
- バリエーションのコードは `src/demos/<slug>/` に置く。`src/groups/<組>/` に置くのは、組の定義と、全バリエーションで同じマークアップや style、コードだけ
- 切り替えると、しくみ（`src/shared/variants.ts`、`src/shared/variant-switcher.ts`）が次のバリエーションのページを読み、head の CSS を足し、そのページの script を import して mount する。ほかのバリエーションのコードと CSS は、切り替えたときにだけ読む
- 組でないデモは今の書き方のままでよい。mount の形に書き直すのは、組に入れるときだけ

### 組の定義 `src/groups/<組>/meta.ts`

```ts
import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'nodes', // フォルダ名と同じ
  title: '力で動く点', // トップの組の行に出る
  description:
    '玉や点を、ぶつかって弾く力、ばねのように引き合う力、重力と摩擦で動かす。近い点どうしは線で結ぶ。',
  variants: [
    'nodeballs',
    'move-a-node-with-springiness',
    'createjs-node-motion',
    'createjs-gravity-and-friction',
  ], // 切り替えの欄とトップの行はこの順
  default: 'nodeballs', // トップの組の名前から開くバリエーション
})
```

variants は 2 本以上で、同じ slug を 2 回書かない。default は variants の中から選ぶ。

### バリエーションの meta.ts

2 章の項目に、`group: '<組>'` と `variant: '<短い呼び名>'` を足します。呼び名は切り替えの欄とトップのリンクの字になるので、日本語の短い言葉にします（nodes なら「弾く玉」「ばね」）。`/demos.json` にはこの 2 つが増えるだけで、ほかの項目は変わりません。

### バリエーションの main.ts

`mount(stage, params)` を export し、始めたものを全部止める関数（dispose）を返します。型は `src/shared/variants.ts` の `Mount` と `Params` です。下は短くした例で、実物は `src/demos/createjs-beat-motion-trigonometric/main.ts`（trigonometry の組）です。

```ts
import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

const SIZE = 250

// あれば。lil-gui の欄になる。数（min、max、step）、真偽、選択（options）が使える
export const params = {
  speed: { label: '進む角度', value: 0.1, min: 0, max: 0.5, step: 0.01 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  let angle = 0
  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, 30 * (1 + Math.sin(angle) * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
  // 要素は stage（main.demo）の中から探す
  const canvas = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
    SIZE,
    SIZE,
    draw,
  )
  const stop = autoplayLoop(
    (dt) => {
      angle += speed * 60 * dt
      draw(canvas.ctx)
    },
    // 動きを減らす設定では、もとの大きさで止める
    () => {
      angle = 0
      draw(canvas.ctx)
    },
  )
  return () => {
    stop()
    canvas.dispose()
  }
}
```

- import しただけでは何も動かさない。ほかのページから import されるので、モジュールの top-level には定数と関数だけを置く。top-level で要素を探すと、ほかのページで落ちる
- 要素は `document.querySelector` ではなく `stage.querySelector` で探す
- 共有の部品の戻り値（4 章の表）を全部受け、返す関数の中で呼ぶ。`window` や `document` に足した listener、`setTimeout`、GSAP の tween や timeline（`gsap.context()` で作って `revert()` するか、持っておいて `kill()`）も止める。three は `renderer.dispose()` まで呼ぶ（呼ばないと、切り替えるたびに WebGL の context が増える）
- 写真の読み込みなど後から来る処理は、片付けたあとに描かない（`src/groups/distortion-slider/slider.ts` の `disposed` の印）
- `let` の状態（角度、色など）は mount の中に置く。外に置くと、切り替えて戻ったときに前の値が残る
- パラメーターを出すなら、もとの値を `value` にする。値を替えると、スライダーを離したときに dispose → マークアップを戻す → mount し直す、の順で作り直す
- 自分で lil-gui を出さない。右上の「設定」と重なるので、欄は `params` に移す
- dispose のあと、stage そのものの class と style はしくみが元に戻す。切り替えや作り直しのときは、stage の中身もそのページを開いたときのマークアップに入れ替わる

### バリエーションの Demo.astro

マークアップと `<style>` はいつもどおり書きます。script だけ次の 3 行にします（ビルドがこの形かを見る）。`is:inline` にしない（切り替えのしくみは `src` のある module の script を読む）。

```astro
<script>
  import { start } from '../../shared/variants'
  import * as variant from './main'
  start(variant)
</script>
```

`src/pages/<slug>.astro` は 1 章の形のままです。

### 書いてはいけないもの

切り替えて足した CSS はページに残り、切り替えのたびに script を import します。そのため、次のものはビルドで落ちます。

- バリエーションの Demo.astro と、組の共通の部品の `<style is:global>`
- バリエーションの Demo.astro と組の共通の部品で、行の頭が `:global(` で始まる規則。ほかのバリエーションにもかかる。`.stage :global(canvas)` のように、自分の要素の下に絞ったものはよい
- 組の共通の部品（`src/groups/<組>/` の `.astro`）の `<script>`。main.demo の中に出て、切り替えたときにバリエーションの script と一緒に import される。HTML のコメントの中に書いた `<script` でも落ちる。動かす処理はバリエーションの main.ts に書き、共通のコードは `src/groups/<組>/*.ts` に置いて main.ts から import する
- 同じ組の中で、別のファイルに同じ名前の `@keyframes` や `@property` を書く。Astro はこの 2 つの名前を scoped にしないので、切り替えたあとは後から足したほうが効く。名前に slug を付ける。バリエーションの Demo.astro の `<style>`、組の共通の部品、相対パスで読む `.css` を見る。パッケージの CSS は中を見られないので、バリエーションでは読まず、組の共通の部品で読む

top-level で動かすこと（上の main.ts の節）はビルドでは見ていません。E2E の 3 周で見ます。

### 組で気をつけること

- パラメーターの `label` は全角 7 字くらいまでにする。lil-gui の名前の欄は幅 245px のうち 4 割ほどで、それより長いとスライダーが潰れる（スマホの幅でも同じ幅で出る）。言い足りないことは main.ts のコメントか README に書く
- CSS だけのデモを組に入れるときも、何もしない mount を置いた main.ts を作る（ビルドが Demo.astro の script の形を見るため）。例は `src/demos/hover-control-css/main.ts` の `export const mount: Mount = () => () => {}`
- scroll-driven animations（`animation-timeline: view()` など）は、`animation` の一括指定と並べず、`animation-name`、`animation-timing-function`、`animation-fill-mode`、`animation-timeline` を 1 つずつ書く。ビルドで CSS を縮めると一括指定に `view()` がまとめられ、Chrome はその宣言ごと捨てる（`src/demos/scroll-reveal-color/Demo.astro`）。組かどうかにかかわらず同じ
- ページ全体をスクロールさせる組は、dispose でページの先頭に戻す。切り替えのしくみはスクロールの位置に触らないので、下までスクロールしたまま切り替えると、次のバリエーションの始まりが見えない。例は `src/groups/scroll-reveal/scroll.ts` の `scrollToTop`（mount では戻さない。読み直したときにブラウザが戻す位置を消さないため）
- 3 周のテスト（`e2e/groups.spec.ts`）はマウスもタッチもスクロールもしない。入力で始まる tween や listener（ホバーの tween、引っぱっている間の listener、スクロールの listener）の片付けは、組ごとの `e2e/groups-<組>.spec.ts` で、入力をしてから切り替えて見る。例は `groups-drag-pinch.spec.ts`、`groups-mouse-image.spec.ts`、`groups-scroll-reveal.spec.ts`

### 新しいデモを組に足す

新しく作るデモが、ある組とパラメーターや作りの一部だけしか違わないなら、別のデモにせず、その組のバリエーションとして足すかを考えます。足すなら次の順です。

1. 1 章のとおりにファイルを置く（meta.ts、Demo.astro、main.ts、README.md、`src/pages/<slug>.astro`）
2. meta.ts に `group` と `variant` を書く
3. `src/groups/<組>/meta.ts` の `variants` に slug を足す。並びが切り替えの欄とトップの順になる
4. main.ts を上の mount の形で書き、Demo.astro の script を 3 行にする。組の共通の部品やコード（`src/groups/<組>/`）があれば使う
5. 下の「確かめる」をやり、プレビューを撮る（8 章）

今あるデモを組へ移すときも同じ順です。もとの main.ts の top-level の処理を mount の中へ移し、`Math.random` を呼ぶ順を変えないようにします（次の節の RMSE で比べるため）。

### 確かめる

- `pnpm build`。組の決まりに合わないと、ここで落ちる。メッセージのとおりに直す
- `pnpm check:budget`。組のページには、切り替えのしくみの最初の部分と組の一覧の JSON が増える（1 KB ほど）
- `E2E_PORT=<ポート> pnpm test:e2e --output test-results/<名前> e2e/groups.spec.ts --grep <組>`。3 周の切り替え、動きを減らす設定、iframe の 3 本が回る（組の名前が別の組の名前に含まれていると、両方回る）。ほかに `--grep <slug>` で demos.spec と motion.spec も
- ブラウザで開き、「設定」を押して全部のバリエーションに切り替え、それぞれ canvas が描かれているかを見る。パラメーターも動かしてみる。iframe の中でも 1 回切り替える
- 今あるデモを組へ移したときだけ、移す前（master）のビルドと移したあとのビルドを同じ大きさで撮り、画素の差（RMSE）を比べる。「設定」のボタンを隠して 0 になるか、差が出たら理由があるかを見る。新しく足すバリエーションには比べる相手がないので要らない
