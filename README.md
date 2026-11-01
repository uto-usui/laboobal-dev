# laboobal-dev

[labobal.dev](https://labobal.dev) のコードです。動きの実験のデモを置いています。デモの説明は [webmanab](https://webmanab.com/lab/) の lab の記事に書き、記事からデモを埋め込みます。

今は Nuxt 2 のデモが 7 本あります。webmanab と道具をそろえて作り直し、[laboobal](https://github.com/uto-usui/laboobal) のデモもここに移す予定です（[webmanab#53](https://github.com/uto-usui/webmanab/issues/53)）。まわりのリポジトリとの関係と、作業の流れは [docs/context.md](docs/context.md) にあります。

## 今の Nuxt 2 を手元で動かす

Node 12 と yarn が要ります。今の Netlify のビルド環境ではビルドできないので、master に入れるコミットには `[skip netlify]` を付けてください。

```sh
n 12.14.1
yarn install
yarn run dev:dev   # localhost:8080
yarn run generate  # dist/ に静的な HTML を出す
```
