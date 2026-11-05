# CLAUDE.md

コーディングエージェント向けの入口です。`AGENTS.md` はこのファイルへのシンボリックリンクです。

このリポジトリは [labobal.dev](https://labobal.dev) のコードで、作者の動きの実験の動くデモを置いています。説明は webmanab の lab の記事が受け持ちます。作業の前に [docs/context.md](docs/context.md)（まわりのリポジトリとの関係、決まっていること、今の状態）を読んでください。

## 文書とスキル

- [docs/demo-guide.md](docs/demo-guide.md): デモの作り方の決まり
- [docs/release.md](docs/release.md): デモを本番に出し、lab の記事からつなぐまでの順番
- [docs/ideas.md](docs/ideas.md): デモをまたいだ考え方
- [docs/history/](docs/history/): 作り直し（2026-11）の計画と、下げたデモの記録。今の決まりではない
- スキル（`.claude/skills/`）: `new-demo`（デモを足す）、`check-demo`（デモを確かめる）、`capture-preview`（プレビューを 1 本撮り直す）、`link-lab-article`（デモと lab の記事をつなぐ）、`deps-update`（依存の更新）

## 守ること

- 公開リポジトリです。vault の名前や中身、claude.ai の URL（`Claude-Session:` 行を含む）、手元の絶対パス、勤務先のこと、アカウント ID やトークンを書かない（docs/context.md の 7 章）
- Netlify のサイトとのつながり、ドメイン、DNS は触らない
- 公開したデモの URL（`/<slug>/`。前からある 7 本の `/amoeba/` などの小文字のパスも含む）と、プレビュー（`public/previews/<slug>.webm` と `.jpg`、480×300）の名前と大きさを変えない。lab の記事と webmanab のページが直接読んでいる。作者が下げたデモは、ページとプレビューを消し、URL を `netlify.toml` の `[[redirects]]` でトップへ 301 する（[docs/history/dropped/B3.md](docs/history/dropped/B3.md)）
- 決まったことは [webmanab#53](https://github.com/uto-usui/webmanab/issues/53) にある。計画書と食い違ったら #53 に従う
- 見た目（トップの見た目など）は作者が決める。案を作り、スクショで見てもらってから入れる
- パッケージマネージャは pnpm。PR はマージコミットでマージする（スカッシュしない）
- 「動いた」「直った」と言う前に、ブラウザで開いて確かめる。デモは canvas が描かれていることまで見る
- 文書は平易な日本語で書く
