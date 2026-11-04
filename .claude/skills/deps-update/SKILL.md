---
name: deps-update
description: labobal.dev（このリポジトリ）の依存を pnpm で更新する。上げる版を決め、変更履歴を読み、pnpm verify を通し、いくつかのデモをブラウザで開いて描かれていることを見てから 1 本の PR にする。three、gsap、locomotive-scroll（中は Lenis）、lil-gui、Astro を上げるときの注意もここにある。「依存を更新して」「パッケージを上げて」「脆弱性を直して」と言われたとき、pnpm audit が落ちたときに使う。
---

# deps-update

Dependabot の PR は作らせていません。依存はこのスキルで、手元で上げて確かめてから 1 本の PR にします。やり方は webmanab の `.claude/skills/deps-update/SKILL.md` とそろえています。

## 手順

1. 最新の master からブランチを切る

   ```sh
   git switch master && git pull --ff-only
   git switch -c deps-update/$(date +%Y-%m-%d)
   pnpm install --frozen-lockfile
   ```

2. 上げるものを決める

   ```sh
   pnpm outdated
   pnpm audit
   ```

   - 公開から 14 日たっていない版は、まだ上げない（公開直後の版に紛れ込む悪意のあるコードを避けるため）。`npm view <名前> time --json` で公開日を見る
   - `@playwright/test` は webmanab と同じ版にそろえている。webmanab が上げたときに合わせて上げる
   - Node（`.nvmrc`、`engines`）と pnpm（`packageManager`）も webmanab とそろえる
   - major を上げるもの（TypeScript の 6 → 7 など）は 1 つずつ別のコミットにする

3. 変更履歴を読んでから上げる。版は固定で書く（`^` を付けない）

   ```sh
   pnpm add <名前>@<版>        # devDependencies は -D
   ```

   脆弱性の直しで、間接の依存だけを上げたいときは `pnpm update --depth Infinity <名前>`。範囲の中で直らなければ、親のパッケージを上げて直るかを試す。

4. 確かめる

   ```sh
   E2E_PORT=4399 pnpm verify     # lint、整形、型、ビルド、大きさの上限、E2E
   pnpm audit --audit-level high
   ```

   - `pnpm check:budget` が落ちたら、出てきた一覧で大きくなったチャンクを見る。ライブラリが大きくなっただけで納得できるなら、`scripts/check-budget.mjs` の上限を上げ、何が増えたかをコミットに書く
   - E2E は GPU のない環境では canvas の中身まで見ない。下の 5 で目で見る

5. ブラウザで開いて見る。`pnpm build && pnpm preview --port 4322` を立て、上げたライブラリを使うデモを開いて、canvas が描かれていること、動くこと、コンソールにエラーや警告が出ていないことを見る（agent-browser なら `--session deps`、WebGPU のデモは `--webgpu`）

   | 上げたもの        | 開くデモ                                                                                                                                                                    |
   | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | three             | blob、amoeba、three-scale、three-video、distortion-slider-a、canvas-fake3d                                                                                                  |
   | gsap              | gsap-motion-path（MotionPathPlugin）、tweenmax-visual-range-animation-class（ScrollTrigger）、tweenmax-easing-of-scroll-parallax（ScrollToPlugin）、gsap-stagger、splitting |
   | locomotive-scroll | scrollmanager                                                                                                                                                               |
   | lil-gui           | nodeballs、particle-photo                                                                                                                                                   |
   | Astro、Vite       | トップと、上のどれか 2 本。トップでプレビューの動画が出ること                                                                                                               |
   | @fontsource       | トップ（Montserrat と Molle の字の形）と scrollmanager                                                                                                                      |

   見終わったらプレビューを止める（`pnpm exec astro preview stop`）。

6. `/contextual-commit` でコミットし、PR を作る。コミットは「版を上げたもの」と「それに合わせて直したコード」を分ける。PR の本文に、上げたもの（前 → 後）、直したコード、上げずに残したものと理由、走らせたチェックと開いたデモを書く

7. CI が通ったら、マージコミットでマージする（スカッシュしない）。見た目や動きが変わる更新は、マージの前に作者にスクショか録画を見せる

8. 本番を確かめる（docs/release.md の「本番を確かめる」）

## ライブラリごとの注意

### three

- 毎月のように版が上がり、そのたびに消える API がある。上げる前に three.js の GitHub の wiki の「Migration Guide」で、今の版から上げる版までの節を読む
- `@types/three` も同じ版に上げる
- 消える予定の API は、コンソールに警告が出る。ブラウザで見るときに警告も見る
- 色の扱い（`SRGBColorSpace`、光の強さの単位）が変わると、エラーなしで色や明るさだけが変わる。前の版のスクショと並べて比べる
- WebGPU（particle-photo）は three を使わず、自前の WGSL で描いている。three の更新では変わらない

### gsap

- プラグイン（ScrollTrigger、MotionPathPlugin、ScrollToPlugin）は gsap のパッケージに入っている。`gsap/<プラグイン名>` の import の名前が変わっていないかを見る
- 古い ease の名前（`Power1.inOut` など）は、エラーを出さずに既定の ease で動く。名前が変わったときに気づきにくい

### locomotive-scroll（中は Lenis）

- 5 系は中で Lenis を使っている。locomotive-scroll を上げると Lenis も変わる
- scrollmanager が `data-scroll-speed`、`data-scroll-offset`、`data-scroll-css-progress` の属性と、子に受け継がれる `--progress` に頼っている。属性の名前や意味が変わっていないかを変更履歴で見る
- 慣性の重さや遅れ方が変わることがある。前の版と並べて、スクロールの手ざわりを比べる

### lil-gui

- パネルの見た目と、値を変えたときの呼ばれ方を見る。プレビューの撮影（`scripts/capture-previews.mjs`）は `.lil-gui` を隠しているので、クラス名が変わったら直す

### Astro

- `pnpm check`（astro check）と `pnpm build` のログの警告を見る
- デモごとにページを分けているので、CSS が全ページに付いていないか（`pnpm check:budget` の数字）を見る
- `astro preview` はエージェントの環境では裏で動き続ける。終わったら `pnpm exec astro preview stop` で止める

## 報告

- 上げたパッケージと版（前 → 後）、直った advisory
- それに合わせて直したコード
- 上げずに残したものと理由
- 走らせたチェックの結果、開いたデモと見たこと、PR とマージのコミット、本番の確認
