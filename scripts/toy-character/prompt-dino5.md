# 依頼: 恐竜が何頭もいるときにコマが飛ぶのを直す

`scripts/toy-character/prompt-dino4.md` の続きです（記録は `.work/toy-character/dino4/`、最終回答は `.work/toy-character/codex-dino4-out.md`）。四足の恐竜の歩幅をそろえた Walk は、作者が「ものすごく良くなった」と言っています。見た目と動きは何も変えないでください。キャラの歩きと、そのほかの守ること（`prompt-dino3.md` の冒頭）も今までどおりです。

最終回答は、ファイルへのリンクでなく本文そのものを書いてください。

## 直すこと

前回の計測で、恐竜が何頭も画面にいる 150 秒あたりから 10 秒測ると、CPU を 4 倍遅くした条件でフレーム時間の P95 が 33.3 ms、最大が 50 ms でした（`.work/toy-character/dino4/performance-late.json`）。読み込みの直後は P95 16.8 ms です。

呼び出し側の見当: `src/demos/toy-figure/dinosaurs.ts` の `update` は、1 フレームを 1/120 秒の刻みに分け、刻みごとに `sample()` を何度も呼んでいます（`current`、`raw`、脚ごとの IK 3 回、`actual`）。`sample()` は模型全体の `updateMatrixWorld(true)` と `skeleton.update()` をし、足裏の頂点を `getVertexPosition` で CPU でスキニングし直しています。`solve` も 1 回ごとに `updateMatrixWorld(true)` を 2 回呼びます。恐竜 1 頭・1 フレームあたり数十回の行列の更新と頂点のスキニングになっているはずです。

- まず、Chrome の performance trace か `performance.now()` の計測で、恐竜の更新・キャラの歩き・景色・描画のどれに何 ms かかっているかを数字で確かめる（恐竜の頭数ごと）
- 直し方の候補: 足裏の点を、読み込み時に足の骨の座標系での位置として 1 回だけ求めておき、毎回の頂点のスキニングをやめる。行列の更新を、必要な骨の枝だけに絞る。IK の反復や刻みの数を、結果が変わらない範囲で減らす。画面の外にいる恐竜や、遠くて足元が数 px にしかならない恐竜は、計算を軽くする
- 直したあとも、足の滑り（4 本とも）、伸び率、肘と膝の向き、体の進む速さが前回と同じ値になること。前回の値と並べて書く
- 計測と開発用の記録（`inspect` の値など）のための計算が、本番でも毎フレーム走っていないかも見る。走っているなら、開発のとき（`?walk-inspect`）だけにする

## 確かめること

`.work/toy-character/dino5/` に出力する。開発サーバーは http://localhost:4410 （末尾の `/` が要る。止めない）。Playwright は Chrome（`channel: 'chrome'`、GPU）。

- 速さ: 1440×900（dpr 2）と 390×844（dpr 3）、CPU throttling 4 倍で、読み込み直後と、恐竜が 2 頭以上いる区間の 10 秒ずつ。フレーム時間の中央値・P95・最大と、恐竜の更新にかかった時間（1 フレームの中央値と P95）。直す前と後を並べる。`pnpm build` のあとの `pnpm preview` でも測る（開発用のコードを除いた本番の速さ）
- 見た目が変わっていないこと: 前回の `legs-compare.png` と同じ撮り方の (c) の段を、直したあとで撮り、前回と並べた `legs-same.png`
- 3 分の記録（30°）: 前回と同じ項目
- `pnpm verify` を通す（`.work/toy-character/walk/chrome.config.ts` を使ってよい）

## 決まり

前提が曖昧なところは妥当な仮定を置いて最後まで進め、置いた仮定は最終回答に書いてください。書き込むのは `src/demos/toy-figure/`、`e2e/toy-figure.spec.ts`、`scripts/toy-character/`、`.work/toy-character/` の中だけ。`src/shared/`、キャラの GLB、恐竜と景色の GLB は変えない。ブラウザの MCP は使わず、撮影と計測は Playwright のスクリプトで行う。コミットはしない。コードのコメントは、その行を見ただけでは分からない理由だけを短く書く。

## 最終回答

日本語で、結論から。重かった原因（数字つき）、直し方、直す前と後の速さの表（開発と本番）、足の滑りなどが前回と同じか、3 分の記録の値、`pnpm verify` の結果、まだ足りないところ、置いた仮定。前置きと繰り返しは削る。
