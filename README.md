# laboobal-dev

[labobal.dev](https://labobal.dev) のコードです。動きの実験のデモを置いています。デモの説明は [webmanab](https://webmanab.com/lab/) の lab の記事に書き、記事からデモを埋め込みます。

2026-11-02 に Astro で作り直し、[laboobal](https://github.com/uto-usui/laboobal) のデモもここに移しました（[webmanab#53](https://github.com/uto-usui/webmanab/issues/53)）。まわりのリポジトリとの関係と作業の流れは [docs/context.md](docs/context.md)、作り直しの進め方は [docs/plan.md](docs/plan.md) にあります。作り直す前の Nuxt 2 のコードは、タグ `nuxt2-final` に残しています。

## 手元で動かす

Node 26 と pnpm 10 が要ります（`.nvmrc` と `package.json` の `packageManager`）。

```sh
pnpm install
pnpm dev          # localhost:4321
pnpm build        # dist/ に静的な HTML を出す
pnpm test:e2e     # dist/ を開いて全デモを確かめる。先に pnpm build が要る
pnpm verify       # lint、整形、型、ビルド、E2E をまとめて
```

## デモを足す

`src/demos/<slug>/` に `meta.ts`、`Demo.astro`、`notes.md` を置くと、`/<slug>/` のページとトップの一覧に出ます。共有のファイルは書き換えません。決まりは [docs/plan.md](docs/plan.md) の 5 章、見本は `src/demos/marquee/` です。
