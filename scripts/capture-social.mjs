// SNS に載せる短い動画（mp4）を撮る。正方形 1080×1080 と縦長 1080×1920。
// 手元で `pnpm build && pnpm preview --port 4322` を立ててから `node scripts/capture-social.mjs <slug...>`。
//   --seconds 8          撮る長さ（秒）。既定 6
//   --formats square     撮る形をしぼる（square、vertical をカンマで）
//   --hide ".foo,.bar"   この回だけ隠すものを足す
// 出力は social/<slug>-<形>.mp4（.gitignore 済み。コミットしない）。
// ページの CSS の大きさは 540×540 と 540×960 で、それを 2 倍の解像度で撮る。iframe と同じくらいの大きさで組まれた
// デモが、スマホの画面で見たときと同じ詰まり具合になるため
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.SOCIAL_BASE_URL ?? 'http://localhost:4322'
const OUT = 'social'
const TMP = 'node_modules/.cache/social'
const SCALE = 2
const FORMATS = {
  square: { width: 540, height: 540 },
  vertical: { width: 540, height: 960 },
}
// 動画に映さないもの。デモのページに UI を足したら、ここに足す。
// ページの側で data-capture-hide を付けた要素も隠す
const HIDE = ['.links', '.lil-gui', '[data-capture-hide]']
// 読み込んで動き出すまで待つ長さ（ミリ秒）。デモごとに変えたいときは WARMUP_BY_SLUG に書く
const WARMUP = 1500
const WARMUP_BY_SLUG = { 'particle-photo': 2600, 'reveal-clip': 2600 }

const option = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const seconds = Number(option('seconds') ?? 6)
const formats = (option('formats') ?? Object.keys(FORMATS).join(','))
  .split(',')
  .filter((name) => FORMATS[name])
const hide = [...HIDE, ...(option('hide')?.split(',') ?? [])]
const slugs = process.argv
  .slice(2)
  .filter(
    (arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'),
  )

if (!slugs.length) {
  console.error(
    '撮るデモの slug を渡す: node scripts/capture-social.mjs amoeba',
  )
  process.exit(1)
}

const interactionOf = (slug) => {
  const path = `src/demos/${slug}/meta.ts`
  if (!existsSync(path)) throw new Error(`${path} がない`)
  return (
    readFileSync(path, 'utf8').match(/interaction:\s*'([^']+)'/)?.[1] ?? 'none'
  )
}

const wait = (page, ms) => page.waitForTimeout(ms)

/**
 * points（0〜1 の割合）の上を、duration ミリ秒かけてなめらかにたどる。
 * 動かす 1 回ごとに数ミリ秒かかるので、回数ではなく経った時間で位置を決める（回数で決めると撮る長さが伸びる）
 */
const glide = async (page, size, points, duration) => {
  const start = Date.now()
  for (let done = false; !done;) {
    const progress = Math.min((Date.now() - start) / duration, 1)
    done = progress === 1
    const t = progress * (points.length - 1)
    const k = Math.min(Math.floor(t), points.length - 2)
    const f = t - k
    const [x0, y0] = points[k]
    const [x1, y1] = points[k + 1]
    await page.mouse.move(
      (x0 + (x1 - x0) * f) * size.width,
      (y0 + (y1 - y0) * f) * size.height,
    )
    await wait(page, 16)
  }
}

/** 触って動くデモは、動きが見えるようにマウスを動かす */
const act = async (page, size, interaction, length) => {
  const center = [size.width / 2, size.height / 2]
  switch (interaction) {
    case 'hover':
      await glide(
        page,
        size,
        [
          [0.2, 0.3],
          [0.75, 0.25],
          [0.7, 0.75],
          [0.3, 0.7],
          [0.5, 0.45],
        ],
        length,
      )
      break
    case 'drag':
      await page.mouse.move(...center)
      await page.mouse.down()
      await glide(
        page,
        size,
        [
          [0.5, 0.5],
          [0.8, 0.3],
          [0.25, 0.7],
        ],
        length * 0.4,
      )
      await page.mouse.up()
      await wait(page, length * 0.6)
      break
    case 'scroll': {
      await page.mouse.move(...center)
      // 進み続けると空の画面ばかり映るデモがあるので、半分進んだら戻す
      const ticks = Math.round(length / 100)
      for (let i = 0; i < ticks; i++) {
        await page.mouse.wheel(0, i < ticks / 2 ? 40 : -40)
        await wait(page, 100)
      }
      break
    }
    case 'click':
      for (let i = 0; i < 3; i++) {
        await page.mouse.click(...center)
        await wait(page, length / 3)
      }
      break
    default:
      await wait(page, length)
  }
}

/**
 * CDP の screencast でコマを受け取る。Playwright の recordVideo は画質が粗く、SNS では見劣りするため。
 * コマは画面が変わったときだけ届くので、届いた時刻を持っておき、mp4 にするときにその長さで並べる
 */
const record = async (page, run) => {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, time: metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  const started = Date.now() / 1000
  await run()
  const stopped = Date.now() / 1000
  await cdp.send('Page.stopScreencast')
  return { frames, started, stopped }
}

const toMp4 = ({ frames, stopped }, size, dir, out) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const lines = []
  frames.forEach((frame, i) => {
    const name = `${String(i).padStart(5, '0')}.png`
    writeFileSync(join(dir, name), Buffer.from(frame.data, 'base64'))
    const next = frames[i + 1]?.time ?? stopped
    lines.push(
      `file '${name}'`,
      `duration ${Math.max(next - frame.time, 0.001)}`,
    )
  })
  // concat は最後のコマの duration を使わないので、もう一度並べる
  lines.push(lines.at(-2))
  writeFileSync(join(dir, 'list.txt'), lines.join('\n'))
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(dir, 'list.txt'),
    '-vf',
    `fps=30,scale=${size.width * SCALE}:${size.height * SCALE}:flags=lanczos,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    '-an',
    out,
  ])
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=metal', '--enable-unsafe-webgpu'],
})

for (const slug of slugs) {
  const interaction = interactionOf(slug)
  for (const name of formats) {
    const size = FORMATS[name]
    const context = await browser.newContext({
      viewport: size,
      deviceScaleFactor: SCALE,
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/${slug}/`)
    await page.addStyleTag({
      content: `${hide.join(', ')} { display: none !important }`,
    })
    await wait(page, WARMUP_BY_SLUG[slug] ?? WARMUP)
    const recording = await record(page, () =>
      act(page, size, interaction, seconds * 1000),
    )
    await context.close()
    const out = join(OUT, `${slug}-${name}.mp4`)
    toMp4(recording, size, join(TMP, `${slug}-${name}`), out)
    console.log(
      `${resolve(out)}（${interaction}、${recording.frames.length} コマ）`,
    )
  }
}

await browser.close()
