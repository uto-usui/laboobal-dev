# laboobal-dev

[labobal.dev](https://labobal.dev) のコードです。uto-usui の動きの実験を、1 本 1 ページの動くデモとして置いています。なぜそう動くかは [webmanab の lab](https://webmanab.com/lab/) の記事に書き、記事からデモを埋め込んでいます。

- デモ: [labobal.dev](https://labobal.dev)
- 説明: [webmanab の lab](https://webmanab.com/lab/)
- デモのコードと考え方のメモ: [`src/demos/<slug>/`](src/demos/)（メモは各フォルダの `README.md`）

コードは [MIT License](LICENSE) です。もとにしたコードや写真、フォントのライセンスは、それを使っているファイルの先頭のコメントか、デモの `README.md` の「クレジット」に書いています。

## 手元で動かす

Node 26 と pnpm 10 を使います（`.nvmrc` と `package.json` の `packageManager`）。

```sh
pnpm install
pnpm dev     # localhost:4321
pnpm verify  # lint、整形、型、ビルド、大きさ、E2E
```

## 文書

- [docs/](docs/): デモの作り方（[demo-guide.md](docs/demo-guide.md)）、出す流れ（[release.md](docs/release.md)）、まわりとの関係と今の状態（[context.md](docs/context.md)）、デモをまたいだ考え方（[ideas.md](docs/ideas.md)）。2026-11 の作り直しの記録は [docs/history/](docs/history/) にあります
- [.claude/skills/](.claude/skills/): コーディングエージェント向けの手順（デモを足す、デモを確かめる、プレビューを撮り直す、lab の記事とつなぐ、依存を更新する）
