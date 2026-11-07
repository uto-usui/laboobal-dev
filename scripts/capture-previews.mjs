// トップの一覧で、触れたときに出す短い動画とポスター画像を作る。
// 手元で `pnpm build && pnpm preview --port 4322` を立ててから `node scripts/capture-previews.mjs [slug...]`。
// `--webp-only` を付けると撮らずに、今ある jpg から webp だけ作る。
// Netlify のビルドには GPU も ffmpeg もないので、ここで作ったものを public/previews/ にコミットする。
// jpg と webm（480×300）は webmanab の記事ページも URL で読んでいる。名前・形式・大きさを変えない。webp はトップだけが使う
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.PREVIEW_BASE_URL ?? 'http://localhost:4322'
const OUT = 'public/previews'
const TMP = 'node_modules/.cache/previews'
const VIEW = { width: 800, height: 500 }
// 読み込んで動き出すまで待ってから、この長さだけ切り出す
const WARMUP = 1200
const LENGTH = 3600
// デモごとに撮り方を変えるもの。poster: 'brightest' は、切り出した中でいちばん明るいコマをポスターにする。
// 暗い背景に字や写真が出たり消えたりするデモで、出そろったところを選ぶため。
// poster: 'late' は、切り出しの終わりの 0.4 秒前のコマにする。描き足していくデモで、始めのコマではほとんど何も映らないため。
// poster に数を書くと、切り出しの始めからその秒数のコマにする
const TUNE = {
  // 写真を読み終えてから開く。開ききったところから撮り始める
  'reveal-clip': { warmup: 2600, poster: 'brightest' },
  // 字が上へ抜けて消え、戻ってくるのを繰り返す。決まった時刻だと字が消えたところに当たりやすい
  splitting: { poster: 'brightest' },
  // 粒が集まって写真になるまで 1 秒ほどかかる。ぼやけたままのポスターにならないよう待つ
  'particle-photo': { warmup: 2400 },
  'processing-js-circle-at-the-mouse-position': { poster: 'late' },
  'processing-js-random-walk': { poster: 'late' },
  // スクロールで箱の色が緑から青へ変わる。始めのコマは緑のままなので、少し進んで色が変わりかけたところにする
  'scroll-reveal-color': { poster: 0.8 },
  // HTML-in-Canvas（Chrome 157〜）のデモ。Playwright の Chromium にはまだないので、手元の Google Chrome で撮る（chrome: true）
  'html-cloth': { chrome: true },
  // 開くときの再生が終わってから撮る
  'html-emaki': { chrome: true, warmup: 4200 },
  'html-mizu-mikuji': { chrome: true, warmup: 1800 },
  // 短冊に書いて、キーボードでくべる。燃えているところをポスターにする
  'html-takiage': {
    chrome: true,
    poster: 2.6,
    act: async (page) => {
      await page.evaluate(() =>
        [...document.querySelectorAll('canvas textarea')]
          .find((t) => !t.readOnly)
          ?.focus(),
      )
      await page.keyboard.type('夜ふかしの癖', { delay: 70 })
      await page.keyboard.press('Control+Enter')
      await wait(page, LENGTH - 500)
    },
  },
}

const demos = readdirSync('src/demos')
  .filter((slug) => existsSync(`src/demos/${slug}/meta.ts`))
  .map((slug) => {
    const source = readFileSync(`src/demos/${slug}/meta.ts`, 'utf8')
    return {
      slug,
      interaction: source.match(/interaction:\s*'([^']+)'/)?.[1] ?? 'none',
    }
  })
const webpOnly = process.argv.includes('--webp-only')
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const targets = only.length ? demos.filter((d) => only.includes(d.slug)) : demos

const wait = (page, ms) => page.waitForTimeout(ms)

/** points の上を、duration ミリ秒かけてなめらかにたどる。録画に映るよう 1 フレームずつ動かす */
const glide = async (page, points, duration) => {
  const steps = Math.round(duration / 16)
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (points.length - 1)
    const k = Math.min(Math.floor(t), points.length - 2)
    const f = t - k
    const [x0, y0] = points[k]
    const [x1, y1] = points[k + 1]
    await page.mouse.move(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
    await wait(page, 16)
  }
}

const act = async (page, interaction) => {
  const { width: w, height: h } = VIEW
  switch (interaction) {
    case 'hover':
      await glide(
        page,
        [
          [w * 0.2, h * 0.3],
          [w * 0.75, h * 0.25],
          [w * 0.7, h * 0.75],
          [w * 0.3, h * 0.7],
          [w * 0.5, h * 0.45],
        ],
        LENGTH,
      )
      break
    case 'drag':
      await page.mouse.move(w * 0.5, h * 0.5)
      await page.mouse.down()
      await glide(
        page,
        [
          [w * 0.5, h * 0.5],
          [w * 0.75, h * 0.35],
          [w * 0.3, h * 0.65],
        ],
        1600,
      )
      await page.mouse.up()
      await wait(page, LENGTH - 1600)
      break
    case 'scroll':
      await page.mouse.move(w * 0.5, h * 0.5)
      // 要素どうしの間が広いデモが多く、進み続けると空の画面ばかり映る。半分進んだら戻して、出入りを見せる
      for (let i = 0; i < 36; i++) {
        await page.mouse.wheel(0, i < 18 ? 30 : -30)
        await wait(page, LENGTH / 36)
      }
      break
    case 'click':
      await page.mouse.click(w * 0.5, h * 0.5)
      await wait(page, LENGTH / 2)
      await page.mouse.click(w * 0.5, h * 0.5)
      await wait(page, LENGTH / 2)
      break
    default:
      await wait(page, LENGTH)
  }
}

const ffmpeg = (...args) =>
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
// トップ用。ffmpeg の webp は入っていないことが多いので cwebp で作る。
// 画質 70 は 80 と見比べて差が分からず、ピックアップの帯の 8 枚で 2 割ほど軽くなった値
const webp = (input, slug) =>
  execFileSync('cwebp', [
    '-quiet',
    '-q',
    '70',
    input,
    '-o',
    join(OUT, `${slug}.webp`),
  ])

if (webpOnly) {
  for (const demo of targets) webp(join(OUT, `${demo.slug}.jpg`), demo.slug)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
const args = ['--enable-gpu', '--use-angle=metal']
const browser = await chromium.launch({ args })
let chrome

for (const demo of targets) {
  const dir = join(TMP, demo.slug)
  rmSync(dir, { recursive: true, force: true })
  const tune = TUNE[demo.slug] ?? {}
  if (tune.chrome)
    chrome ??= await chromium.launch({
      channel: 'chrome',
      headless: false,
      args,
    })
  const context = await (tune.chrome ? chrome : browser).newContext({
    viewport: VIEW,
    recordVideo: { dir, size: VIEW },
  })
  const started = Date.now()
  const page = await context.newPage()
  await page.goto(`${BASE}/${demo.slug}/`)
  // info のボタンとパネル、組の切り替えのボタン、lil-gui のパネルは一覧のサムネイルには要らない
  await page.addStyleTag({
    content:
      '.links, .info, .variant-toggle, .lil-gui { display: none !important }',
  })
  await wait(page, tune.warmup ?? WARMUP)
  const offset = (Date.now() - started) / 1000
  await (tune.act ? tune.act(page) : act(page, demo.interaction))
  await context.close()
  const raw = join(
    dir,
    readdirSync(dir).find((f) => f.endsWith('.webm')),
  )

  ffmpeg(
    '-ss',
    String(offset),
    '-t',
    String(LENGTH / 1000),
    '-i',
    raw,
    '-vf',
    'scale=480:300,fps=30',
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '42',
    '-row-mt',
    '1',
    join(OUT, `${demo.slug}.webm`),
  )
  // ポスターは劣化のない png に 1 コマ抜いてから、jpg と webp にする
  const frame = join(dir, 'poster.png')
  let at = offset + 0.2
  if (tune.poster === 'late') at = offset + LENGTH / 1000 - 0.4
  if (typeof tune.poster === 'number') at = offset + tune.poster
  if (tune.poster === 'brightest') {
    // 0.1 秒ごとに明るさの平均（YAVG）を出し、いちばん明るいコマの時刻を取る
    const stats = join(dir, 'stats.txt')
    ffmpeg(
      '-ss',
      String(offset),
      '-t',
      String(LENGTH / 1000),
      '-i',
      raw,
      '-vf',
      `fps=10,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stats}`,
      '-f',
      'null',
      '-',
    )
    const text = readFileSync(stats, 'utf8')
    const times = [...text.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1])
    const values = [...text.matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1])
    at = offset + times[values.indexOf(Math.max(...values))]
  }
  ffmpeg(
    '-ss',
    String(at),
    '-i',
    raw,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:300',
    frame,
  )
  ffmpeg('-i', frame, '-q:v', '4', join(OUT, `${demo.slug}.jpg`))
  webp(frame, demo.slug)
  console.log(`${demo.slug} (${demo.interaction})`)
}

await browser.close()
await chrome?.close()
