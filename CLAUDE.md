# CLAUDE.md

コーディングエージェント向けのガイドです。`AGENTS.md` はこのファイルへのシンボリックリンクです。

このリポジトリは [labobal.dev](https://labobal.dev) のコードです。作者の動きの実験の「動くデモ」を置く場所で、説明は webmanab の lab の記事が受け持ちます。

作業を始める前に [docs/context.md](docs/context.md) を読んでください。まわりのリポジトリ（webmanab、作者の vault、laboobal）との関係、決まっていること、今の状態、作業の流れ、参考にするものをまとめています。

## 守ること

- 公開リポジトリです。vault の名前や中身、claude.ai の URL（`Claude-Session:` 行を含む）、手元の絶対パス、勤務先のこと、アカウント ID やトークンを書かない（docs/context.md の 7 章）
- Netlify のサイトとのつながり、ドメイン、DNS は触らない
- 公開したデモの URL（`/<slug>/`。前からある 7 本の `/amoeba/` などの小文字のパスも含む）と、プレビュー（`public/previews/<slug>.webm` と `.jpg`、480×300）の名前と大きさを変えない。lab の記事と webmanab のページが直接読んでいる
- 決まったことは [webmanab#53](https://github.com/uto-usui/webmanab/issues/53) にあります。計画書と食い違ったら #53 に従う
- 見た目（トップの見た目など）は作者が決めます。案を作り、スクショで見てもらってから入れる
- パッケージマネージャは pnpm
- PR はマージコミットでマージする（スカッシュしない）
- 「動いた」「直った」と言う前に、ブラウザで開いて確かめる。デモは canvas が描かれていることまで見る
- 文書は平易な日本語で書く
