# WebGPU の土台（`src/shared/gpu/`）

自然のシミュレーションのシリーズ（`nature-*`）で使う、WebGPU の共通の部品です。three は使わず、WebGPU を直に書きます。

- `device.ts`: adapter と device を取り、canvas に結ぶ。CPU で描く代わりのアダプタは断る（`Unsupported` を投げる）。device を失ったときとエラーを 1 か所に集める。WGSL のコンパイルのエラーを行つきで出す。storage のバッファと、2 枚を交互に使うバッファ
- `uniform.ts`: uniform の構造体を 1 か所に書き、WGSL の struct と JS から書き込む口を作る。並びと詰め物を手で合わせない
- `stepper.ts`: 固定の刻みで進める。60Hz でも 120Hz でも同じ速さにする
- `wgsl.ts`: 乱数、画面いっぱいの三角形、透視のカメラ（WebGPU の深度 0〜1 に合わせた行列と、画面の点を通る光線）
- `webgpu.d.ts`: TypeScript の lib.dom にない、WebGPU のフラグの定数の型

## 決まり

- WebGPU が使えないときは、デモの中に一行の案内を出す（`.is-unsupported`）。`showFallback` の `.demo-fallback` は使わない。CI には GPU がなく、`e2e/demos.spec.ts` は `.demo-fallback` が出ていないことを見るため
- 同じ理由で、`e2e/motion.spec.ts` の `AUTOPLAY` には入れない。画素は手元でだけ見る
- 動きを減らす設定のときは、見えないところで何百歩か進めてから 1 枚描いて止める。開いた直後の、まだ形のできていない絵を止まった絵にしない
- 大きさの上限: このフォルダは gsap や three のような別のチャンクにならないので、デモは「ライブラリなし」の段で測られる。今はデモごとに `scripts/check-budget.mjs` の `demoOverride` に書いている

## 先に作る予定の部品

シリーズの次のデモを作るときに足します。

- 2 枚を交互に使うテクスチャ（セル・オートマトン）
- 残像のテクスチャと、HDR の色を画面の色に落とす処理
- simplex ノイズと curl
- 全部と全部をタイルで当てる n 体の計算
