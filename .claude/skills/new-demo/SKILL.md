---

name: new-demo
description: labobal.dev に新しいデモを 1 本足す。slug を決め、src/demos/<slug>/ の meta.ts、Demo.astro、main.ts、README.md と src/pages/<slug>.astro を docs/demo-guide.md の決まりで置き、動きを減らす設定とタッチに対応させ、check-demo で確かめ、プレビューを撮るところまでやる。「デモを足して」「新しいデモを作って」「この動きをデモにして」「jsfiddle のデモを移して」と言われたときに使う。
---

# new-demo

決まりの正本は `docs/demo-guide.md` です。このスキルは順番だけを書きます。迷ったら demo-guide.md を読みます。出すまでの流れ（PR、本番の確認）は `docs/release.md` です。

## 0. 先に決める

- slug: 小文字のケバブケース。lab の記事があるなら記事の slug と同じ。`ls src/demos` で重なりがないかを見る。一度出したら変えない
- 何が気持ちいいのか: もとのデモがあるなら、先に動かして見て、速さ、遅れ方、手ざわりを言葉にしてから作る。コードの形は合わせない
- 組に入れるか: 似たデモがすでにあるかを見る（`ls src/groups`、`rg -n "group:" src/demos/*/meta.ts`、トップの組の行）。ある組とパラメーターの値や作りの一部だけが違うなら、別のデモにせず、その組のバリエーションとして足すかを考える。足すなら demo-guide.md の 12 章の「新しいデモを組に足す」の順で作る。迷ったら、組に入れる案と入れない案を作者に見せる
- 使うもの: ネイティブの API で同じ質が出せるならそれ、出せないならライブラリ（three、gsap、locomotive-scroll、lil-gui は入っている）。新しい依存は足す前に作者に聞く（大きさの上限にも関わる）
- 見た目が変わる大きな判断（色、レイアウト、トップでの見え方）は、案を作ってスクショで作者に見てもらう

## 1. ブランチ

```sh
git switch master && git pull --ff-only
git switch -c feat/<slug>
```

## 2. ファイルを置く

見本は `src/demos/marquee/`（CSS だけ）と `src/demos/drag-pinch-simple/`（script あり）。

1. `src/demos/<slug>/meta.ts`: demo-guide.md の 2 章の表の「要る」をすべて埋める
   - `batch: 'new'`、`article: undefined`（記事はあとで link-lab-article スキル）
   - `created` と `added` は YYYY-MM-DD。新しく作ったなら両方とも出す日
   - `description` は何が起きるかを一文で
   - `tags` と `tech` は `src/lib/demos.ts` の `TAGS` と `TECH` から。合うものがなければ、先にそこへ足してコメントに意味を書く
   - `pick` は付けない（ピックアップは作者が決める）
2. `src/demos/<slug>/Demo.astro`: マークアップと style。寸法は `cqw`、`%` など入れ物の基準で。右の端（とくに右下）には何も置かない（info のボタンがある）
3. `src/demos/<slug>/main.ts`: 動かす script。`src/shared/` の部品を使う（demo-guide.md の 4 章）。組でないデモは今までどおり top-level に書いてよい。組のバリエーションは `mount(stage, params)` を export して dispose を返し、Demo.astro の script を 3 行の形にする（demo-guide.md の 12 章）
   - 毎フレームは `loop`、ひとりでに動き続けるものは `autoplayLoop`
   - GSAP は `src/shared/gsap` から読む
   - three は `createGlStage` で renderer を作る
   - 大きさの変化は `onResize`、canvas は `fitCanvas`
4. 素材は `src/demos/<slug>/assets/` に置いて import する。外のサーバーから読まない
5. `src/pages/<slug>.astro`: demo-guide.md の 1 章の形をそのまま写し、slug だけ替える
6. `src/demos/<slug>/README.md`: demo-guide.md の 3 章の節で書く。「大事なところ」は一般論にしない。ほかの人のコードや素材を使ったら「クレジット」の節、写したファイルへの LICENSE、ルートの README の「第三者のコードと素材」も

## 3. 動きを減らす設定とタッチ

- demo-guide.md の 5 章の 6 つの決まりに合わせる。ひとりでに動き続けるなら `e2e/motion.spec.ts` の `AUTOPLAY` に slug を足す（WebGL なしなら `AUTOPLAY_WITHOUT_GL` にも）
- 指で引っぱるなら CSS で `touch-action: pan-y`、main.ts で `touchGate(el)`、`e2e/motion.spec.ts` の `DRAG` に足す。ホバーで動くだけなら `touch-action: pan-y` だけ。`touch-action: none` は書かない
- ページの上に UI を足したら、`scripts/capture-previews.mjs` の隠す一覧に足すか、要素に `data-capture-hide` を付ける

## 4. 確かめる

`.claude/skills/check-demo/SKILL.md` の手順を全部やる。ビルド、E2E、大きさ、ブラウザで canvas が描かれていること、iframe の大きさ、スマホの幅、動きを減らす設定。

## 5. プレビューを撮る

`.claude/skills/capture-preview/SKILL.md` で、この slug だけを撮る。

## 6. ほかのデモにも通じる考え方

作りながら見つけた、1 つのデモに閉じない考え方は `docs/ideas.md` に書き足す。リンクは `../src/demos/<slug>/README.md`。

## 7. コミットと PR

- `/contextual-commit` でコミットし、push する。コミットはまとまりごとに（デモ本体、プレビュー、ideas.md）
- PR の本文に、何のデモか、確かめたこと（check-demo の結果）、スクショとプレビューの jpg を貼る。作者が見てからマージする（マージコミット）
- 本番に出たあとの確認は `docs/release.md` の 6 章

## 報告

- slug、URL、meta の主な値（description、tags、tech、created、added）
- check-demo の結果（数字と出力）、撮ったスクショとプレビューの場所
- 作者に決めてほしいこと（pick にするか、見た目の案など）
