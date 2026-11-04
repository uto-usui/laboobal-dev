# laboobal-dev

[labobal.dev](https://labobal.dev) のコードです。uto-usui の動きの実験のデモを 55 本置いています。

- 触る: [labobal.dev](https://labobal.dev)
- なぜそう動くか: [webmanab の lab](https://webmanab.com/lab/) の記事。記事からデモを埋め込んでいます
- コードと考え方のメモ: [`src/demos/<slug>/`](src/demos/)。メモは各フォルダの `README.md` です

コードは [MIT License](LICENSE) です。ほかの人のコードや写真、フォントを使っているところは、下の「ライセンス」にまとめています。

2026-11-02 に Astro で作り直し、[laboobal](https://github.com/uto-usui/laboobal) のデモもここに移しました（[webmanab#53](https://github.com/uto-usui/webmanab/issues/53)）。まわりのリポジトリとの関係は [docs/context.md](docs/context.md)、作り直しの記録は [docs/history/](docs/history/) にあります。作り直す前の Nuxt 2 のコードはタグ `nuxt2-final` にあります。

## ライセンス

このリポジトリのコードは [MIT License](LICENSE) です。

### 第三者のコードと素材

もとにしたコードと、使っている写真とフォントです。条件は、上流のリポジトリやページで確かめたものだけを書いています。

コード:

- [stegu/webgl-noise](https://github.com/stegu/webgl-noise)（Ashima Arts、Stefan Gustavson）: MIT License。`src/shared/glsl/simplex-noise.glsl` に取り込み、amoeba、three-typo、canvas-glitch-image、distortion-slider-a〜d で使う。particle-photo の 3D simplex noise は、これの `src/noise3D.glsl` を WGSL に書き直したもの（`src/demos/particle-photo/shaders.ts`。上流の LICENSE を写してある）
- [josephg/noisejs](https://github.com/josephg/noisejs)（Joseph Gentle）: ISC License。もとの Stefan Gustavson のコードはパブリックドメインと書かれている。`src/shared/noise.ts` はこれをもとに書き直したもので、blob で使う
- [codrops/TileScroll](https://github.com/codrops/TileScroll): MIT License。scrollmanager のタイルの並べ方の CSS は、これの `src/css/base.css` の `.tiles` をもとにしたもの（`src/demos/scrollmanager/Demo.astro`。上流の LICENSE を写してある）
- [CodePen mnmxmx/mEVxeg](https://codepen.io/mnmxmx/pen/mEVxeg)（Misaki Nakano）: CodePen の公開 Pen は MIT License（[CodePen の Licensing](https://blog.codepen.io/documentation/licensing/)）。nodeballs のもと（旧デモのコードがこれをもとにしていた。`src/demos/nodeballs/README.md` のクレジットにもある）
- [CodePen GreenSock/vYBRPbO](https://codepen.io/GreenSock/pen/vYBRPbO)（Advanced staggers in GSAP 3）: 同上。gsap-stagger の旧デモが参考に挙げていたもの
- [ykob/sketch-threejs](https://github.com/ykob/sketch-threejs): MIT License。canvas-glitch-image のシェーダーは、これの glitch をもとにしている
- [The Coding Train の Coding Challenge #50](https://thecodingtrain.com/challenges/50-animated-circle-packing): [CodingTrain/thecodingtrain.com](https://github.com/CodingTrain/thecodingtrain.com) のコードは MIT License（ロゴや画像は除く）。canvas-fill-text の、円を置いて膨らませる形がこれと同じ
- [Anemolo/GridToFullscreenAnimations](https://github.com/Anemolo/GridToFullscreenAnimations)（Codrops の記事 [Creating Grid-to-Fullscreen Animations with Three.js](https://tympanus.net/codrops/2019/05/22/creating-grid-to-fullscreen-animations-with-three-js/)、Daniel Velasquez）: LICENSE のファイルはない。README の License の節に Codrops の利用条件がある（作品に組み込むのは自由。そのまま再配布や販売をするのは不可）。three-scale の、頂点ごとに動き出す時刻をずらす考え方とシェーダーの形
- [akella/fake3d](https://github.com/akella/fake3d): LICENSE のファイルはない。README の License の節に、上と同じ Codrops の利用条件がある。canvas-fake3d は旧デモを参考に作り直したもので、深度で uv をずらすシェーダーはこれをもとにしている
- [josdirksen/learning-threejs-third](https://github.com/josdirksen/learning-threejs-third)（『Learning Three.js』第 3 版のサンプル）: 上流にライセンスの表記がない。LICENSE のファイルはなく、README にも書かれていない（`package.json` の `license` 欄だけが `ISC`）。three-video は旧デモを参考に作り直したもので、カメラ、地面、光の組み方がこれのもの

写真とフォント:

- Unsplash の写真: [Unsplash License](https://unsplash.com/license)。canvas-draw-image、canvas-glitch-image、canvas-shift-image、css-embed-images-scroll-the-screen-iphone6-outline-mockup、distortion-slider-a〜d、follow-mouse-spotlight、mouse-skew、mouse-tilt、parallax-distorts-by-following-mouse、parallax-shifting-divided-background-by-mouse、particle-photo、reveal-clip、reveal-curtain、tweenmax-visual-range-animation-class で使う。写真ごとの出どころは各デモの `README.md` にある
- Montserrat（The Montserrat Project Authors）と Molle（Sorkin Type Co）: SIL Open Font License 1.1。[Fontsource](https://fontsource.org/) のパッケージから入れている。Montserrat は全ページ、Molle は jsfiddle から移したデモの一部と scrollmanager で使う

scrollmanager の写真、three-video の動画、canvas-fake3d の絵は、このリポジトリで作ったものです。npm の依存（three、gsap など）は、それぞれのパッケージのライセンスに従います。

## 手元で動かす

Node 26 と pnpm 10 が要ります（`.nvmrc` と `package.json` の `packageManager`）。

```sh
pnpm install
pnpm dev          # localhost:4321
pnpm build        # dist/ に静的な HTML を出す
pnpm test:e2e     # dist/ を開いて全デモを確かめる。先に pnpm build が要る
pnpm check:budget # ビルドの結果の大きさが上限に収まっているか。先に pnpm build が要る
pnpm verify       # lint、整形、型、ビルド、大きさ、E2E をまとめて
```

## 文書

- [docs/demo-guide.md](docs/demo-guide.md): デモの作り方（置くファイル、meta、メモ、共有の部品、動きを減らす設定、タッチ、ページの UI、大きさ、E2E）
- [docs/release.md](docs/release.md): デモを出す流れ（ブランチ、確かめ方、プレビュー、PR、本番の確認、lab の記事とのつなぎ、SNS 用の動画）
- [docs/context.md](docs/context.md): まわりのリポジトリとの関係、決まっていること、今の状態
- [docs/ideas.md](docs/ideas.md): デモをまたいだ考え方
- [docs/history/](docs/history/): 作り直しのときの計画と、下げたデモの記録
- [.claude/skills/](.claude/skills/): コーディングエージェント向けの手順（デモを足す、デモを確かめる、プレビューの撮り直し、lab の記事とのつなぎ、依存の更新）

## デモを足す

`src/demos/<slug>/` に `meta.ts`、`Demo.astro`、`README.md` を置き、`src/pages/<slug>.astro` にページを置くと、`/<slug>/` のページとトップの一覧に出ます。meta の項目、共有の部品、動きを減らす設定やタッチの決まり、テストは [docs/demo-guide.md](docs/demo-guide.md) にあります。見本は `src/demos/marquee/` と `src/pages/marquee.astro` です。出すまでの流れは [docs/release.md](docs/release.md) です。
