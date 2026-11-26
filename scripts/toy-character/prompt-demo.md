# 依頼: 工程 12（labobal.dev のデモにする）

`docs/toy-character/README.md` の工程 12 です。書き出した GLB（`.work/toy-character/export/character.glb`）を、labobal.dev のデモとして動かします。デモの決まりは `docs/demo-guide.md` と `.claude/skills/new-demo/SKILL.md` に従ってください（ブランチは今の `feat/toy-character` のまま。コミット・push・プレビューの撮影はしない）。目の作り方は `docs/toy-character/eyes-method.md`、書き出しの中身（部品とマテリアルの名前、骨、黒目の動ける範囲）は `.work/toy-character/export/metrics.json` と `.work/toy-character/eyes/metrics.json` にあります。

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。書き込むのは worktree の中だけ（`src/`、`e2e/`、`scripts/` の必要なところ、`.work/toy-character/demo/`）。依存は pnpm で入れる（`pnpm install`。npm と yarn は使わない）。新しい依存は足さない（three の examples の GLTFLoader と meshopt のデコーダーは three に入っている）。

## 決めてあること

- slug は仮に `toy-figure`（公開の前に作者に確かめる。フォルダ名と meta をそろえておけば後で替えられる）
- 見せ方: 全身を正面やや上から見せ、キャラは入れ物の高さの約 8 割。視野角 25° 前後の透視。背景はデザイン画（`docs/toy-character/design/v4.png`）に近い明るい灰色の単色
- 動き（`interaction: 'hover'`）:
  - マウスに、頭（`head` と `neck` に分けて、左右 ±25°、上下 ±10°）、上半身（`spine.upper` と `spine.chest` に半分ずつ、左右 ±8°）、黒目（`eye_iris` の UV をずらす。動ける範囲は eyes の metrics.json の値）が、なめらかに遅れて追う（`src/shared/math.ts` の `damp`）。マウスのない端末は `pointerOrWander` でゆっくり動かす
  - まばたき: 3〜6 秒おきにランダムに、開く → 半分 → 閉じる → 半分 → 開く（全体で 150 ms 前後）。`eye_lids` のアトラスのコマを切り替え、黒目は半分で開口のマスクに合わせ、閉じたら隠す
  - 呼吸: 胸がわずかに上下する（`spine.chest` の小さな回転か大きさ。4 秒前後の周期）
  - まばたきと呼吸はひとりでに動くので、動きを減らす設定では止めて立ち姿の 1 枚にする（demo-guide.md 5 章）。マウスに追う動きは残す。`e2e/motion.spec.ts` の `AUTOPLAY` に足す
- 描画: `createGlStage` で renderer を作り、`loop`、`onResize` を使う。眼鏡のレンズは eyes-method.md の three.js の注意（transmission、黒目は alphaTest で切り抜き、polygonOffset）に従う。glTF の occlusion（AO）を使う
- 照明と色の変換: デザイン画のやわらかい 3D レンダの見た目に近づける。環境光（three の `RoomEnvironment` を PMREM で）と、正面上からのやわらかい主光、横からの弱い補助光、足元の接地の影。トーンマッピングは `AgXToneMapping` と `NeutralToneMapping` を同じ画角で並べて、v4 に近いほうを採り、理由を書く。工程 8 で Blender の照明付きが白く淡く見えた点（肌・髪・袖）が、ここで v4 に近づくかを見る

## やること

1. `src/demos/toy-figure/`（meta.ts、Demo.astro、main.ts、README.md、assets/character.glb）と `src/pages/toy-figure.astro` を置く。meta は demo-guide.md 2 章の表どおり（`origin` は新しく作ったデモ、`credits: []`、`webgl: true`、`created` と `added` は 2026-11-19、`tags` と `tech` は `src/lib/demos.ts` の TAGS と TECH から）
2. README.md の「大事なところ」に、このデモの見どころ（何がマウスについてきて、どこで遅れるか、まばたきの間）を書く。作り方には、キャラの作り方の記録（`docs/toy-character/README.md`）へのリンクを書く
3. `.claude/skills/check-demo/SKILL.md` の手順をすべて行う（ビルド、meta の検査、E2E、`pnpm check:budget` と `node scripts/check-budget.mjs --report`、ブラウザで canvas が描かれていること、iframe の大きさ、スマホの幅、動きを減らす設定、指のスクロール、info のパネルとの重なり）。three を読むデモの上限（170 KB）に GLTFLoader と meshopt のデコーダーで収まらないときは、`scripts/check-budget.mjs` の `demoOverride` に理由と測った値を書いて足す

## 確かめること（スクショは自分で開いて見ること）

`.work/toy-character/demo/` に置く:
- `tonemap.png`: AgX と Neutral を同じ画角で並べ、v4 を横に置いたもの
- `desktop.png`（1280×800）、`iframe.png`（幅 800 × 高さ 450）、`mobile.png`（390×844）: 立ち姿
- `follow.png`: マウスを左上・右上・左下・右下に置いたときの 4 枚（頭・上半身・黒目の向き）
- `blink.png`: まばたきの途中（半分、閉じる）
- `reduced.png`: 動きを減らす設定の立ち姿
- check-demo の結果（コマンドと出力の要点、数字）

## 最終回答

日本語で、結論から。置いたファイル、meta の主な値、トーンマッピングの選択と理由、照明の構成、check-demo の各項目の結果（数字）、大きさの上限の結果、GLB の読み込みにかかる時間（手元）、v4 と並べて気づいたこと、作者に見てもらうこと（見た目、slug）、置いた仮定。前置きと繰り返しは削る。
