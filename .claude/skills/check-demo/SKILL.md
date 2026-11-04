---
name: check-demo
description: labobal.dev のデモ 1 本が、docs/demo-guide.md の決まりどおりに動くかを確かめる。ビルドと meta の検査、E2E、大きさの上限、ブラウザで canvas が描かれていること、iframe の大きさとスマホの幅、動きを減らす設定、指のスクロール、info のパネルとの重なりを見て、結果を数字とスクショで残す。デモを足したあと・直したあと、「動いた」「直った」と言う前、「このデモを確かめて」「チェックして」と言われたときに使う。
---

# check-demo

決まりの正本は `docs/demo-guide.md` です。ここでは、それに合っているかの見方を順に書きます。どれかが落ちたら直してからやり直し、全部通るまで「動いた」と言いません。

ポートはほかの作業とぶつからないものにします（下では 4399）。スクショはリポジトリの中に置かず、作業用のフォルダに置きます。

## 1. コードの決まり

```sh
rg -n "touch-action: none" src/demos/<slug>/          # 出たら pan-y と touchGate に直す
rg -n "from 'gsap'" src/demos/<slug>/                 # 出たら src/shared/gsap から読む形に直す
rg -n "requestAnimationFrame|setInterval|new THREE.WebGLRenderer" src/demos/<slug>/   # loop、autoplayLoop、createGlStage に替えられないか見る
rg -n "https?://" src/demos/<slug>/*.ts src/demos/<slug>/Demo.astro   # 実行時に外から読んでいないか
```

meta の `tags` と `tech` が `src/lib/demos.ts` の `TAGS` と `TECH` にあるか、README.md に demo-guide.md の 3 章の節があるかも見ます。

## 2. ビルド、大きさ、E2E

```sh
E2E_PORT=4399 pnpm verify
```

- ビルドが meta やページの決まりで落ちたら、エラーに出た中身のとおりに直す
- このデモの大きさは `node scripts/check-budget.mjs --report | grep "^<slug>,"` で見る（ふつうの出力は分け方ごとの最大だけ）。上限は demo-guide.md の 9 章の表か、`scripts/check-budget.mjs` の `demoOverride`。超えたときは、そのページで読むファイルが大きい順に出る
- E2E のうち、このデモの分だけを見直すなら `E2E_PORT=4399 pnpm test:e2e --grep <slug>`。ほかの作業と同時なら `--output test-results/<名前>` を付ける
- ひとりでに動き続けるデモが `e2e/motion.spec.ts` の `AUTOPLAY` に、指で引っぱるデモが `DRAG` に入っているか

## 3. ブラウザで見る

```sh
pnpm preview --port 4399 --ignore-lock
```

agent-browser を使うときは、zsh では関数にする: `ab(){ agent-browser --session <名前> "$@"; }`。WebGPU のデモは `--webgpu` を付ける。

1. `http://localhost:4399/<slug>/` を開き、canvas が描かれていること、動いていることをスクショで見る。真っ白、真っ黒、1 色のままなら描けていない
2. `interaction` に合わせて、マウスを動かす、引っぱる、スクロールする、クリックする。動きが出て、コンソールにエラーや警告がないか
3. 大きさを変える（`ab set viewport 800 500`、`ab set viewport 390 844`）。幅 800px と高さ 500px は lab の記事の iframe の大きさ。はみ出し、切れ、描き直しの漏れがないか
4. 右の端の「info」を押してパネルを開く。デモのボタンや文字と重なっていないか、パネルに description、tags、tech が出ているか。Esc で閉じるか
5. 動きを減らす設定を入れて開き直す（`ab set media reduced-motion`。Playwright なら `reducedMotion: 'reduce'`）。demo-guide.md の 5 章のとおり、ひとりでに動くものは止まった絵に、1 回きりの再生は終わりの姿に、操作についてくる動きは残っているか
6. 指で引っぱるデモは、`e2e/motion.spec.ts` の `DRAG` のテスト（iPhone の大きさとタッチで、本物のタッチを CDP で送る）が通っていることで見る。目で見るなら Playwright の `devices['iPhone 13']` で開き、左上に「tap to drag」が出ることを見る。agent-browser の `set device` は画面の大きさが変わるだけで、タッチの端末（`pointer: coarse`）にはならない

見終わったらプレビューを止めます（`pnpm exec astro preview stop`、または立てたプロセスを止める）。

## 4. 埋め込み

E2E が別のオリジンの iframe に入れて開いています。それに加えて、lab の記事のように高さ 500px の iframe に入れたとき、info のパネルに「記事」が出ないこと（記事の中では出さない）を見ます。E2E の `panel.spec.ts` が見ているので、通っていればよいです。

## 報告

次を貼ります。

- `pnpm verify` の結果（落ちたものがあればその行）と、このデモの `check:budget` の数字
- 開いた大きさごとのスクショ（ふつう、800×500、スマホの幅、パネルを開いたところ、動きを減らす設定）の場所
- 見つけて直したことと、直していないこと
