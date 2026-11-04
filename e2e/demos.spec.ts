import { existsSync, readdirSync, readFileSync } from 'node:fs'
import {
  expect,
  test,
  type Frame,
  type Locator,
  type Page,
} from '@playwright/test'
import type { Batch, DemoMeta, Interaction } from '../src/lib/demos'

type Demo = Pick<DemoMeta, 'slug' | 'batch' | 'interaction'>

/**
 * 一覧は src/demos/<slug>/meta.ts を文字として読んで作る。Playwright は Vite を通らないので import.meta.glob が使えず、
 * dist/demos.json を読むと、ビルドし直すまで担当の新しいデモが入らない（担当は dev サーバーに向けて回す）
 */
const loadDemos = (): Demo[] =>
  readdirSync('src/demos', { withFileTypes: true })
    // 作りかけで meta.ts がまだないフォルダは飛ばす
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(`src/demos/${entry.name}/meta.ts`),
    )
    .map((entry) => {
      const source = readFileSync(`src/demos/${entry.name}/meta.ts`, 'utf8')
      const pick = (key: string) =>
        source.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1]
      return {
        slug: entry.name,
        batch: pick('batch') as Batch,
        interaction: (pick('interaction') ?? 'none') as Interaction,
      }
    })
const demos = loadDemos()

/** console.error と、捕まえられなかった例外を集める。iframe の中のものも入る */
const watchErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/**
 * 描けていることを、画素の運に頼らずに確かめる。
 * - WebGL が使えないときの案内（showFallback の .demo-fallback）が出ていない
 * - どの canvas も描画の大きさが 0 でない（onResize と context の用意が済んでいる）
 * - WebGL の context を失っていない（数は addInitScript の __contextLost）
 * シェーダーの間違いや画像の読み込みの失敗は、three や top-level await が console.error か例外を出すので watchErrors で落ちる
 */
const expectReady = async (target: Page | Frame) => {
  await expect(target.locator('.demo-fallback')).toHaveCount(0)
  const state = await target.evaluate(() => ({
    sizes: [...document.querySelectorAll('canvas')].map((c) => [
      c.width,
      c.height,
    ]),
    lost: (window as unknown as { __contextLost: number }).__contextLost,
  }))
  for (const [width, height] of state.sizes) {
    expect(width * height, 'canvas の描画の大きさが 0').toBeGreaterThan(0)
  }
  expect(state.lost, 'WebGL の context を失った').toBe(0)
}

/**
 * 写した範囲が 1 色で塗りつぶされていないか。WebGL は描いたあとに中身を読めないことがあるので、画面のスクショで見る。
 * 1 回を軽くしておく。重いシェーダーをソフトウェアで描いていて CPU が詰まると、1280×800 の PNG を写してページの中で
 * 100 万画素を比べるのに 10 秒かかり、expect.poll が 1 回目の答えを待たずに時間切れになっていた（canvas-glitch-image）。
 * JPEG で写し、160×100 に縮めてから、少しの差（JPEG のにじみ）は同じ色とみなして比べる
 */
const isBlank = async (page: Page, target: Locator) => {
  const jpeg = await target.screenshot({
    type: 'jpeg',
    quality: 60,
    // 隅のリンクや組の切り替えが重なると 1 色にならないので、写すときだけ隠す
    style: '.links, .variant-toggle, .lil-gui { visibility: hidden }',
  })
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const ctx = new OffscreenCanvas(160, 100).getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, 160, 100)
    const { data } = ctx.getImageData(0, 0, 160, 100)
    for (let i = 4; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        if (Math.abs(data[i + c] - data[c]) > 8) return false
      }
    }
    return true
  }, jpeg.toString('base64'))
}

/**
 * 1 枚だけで決めない。写真を読み終えるまでや、押して画面いっぱいに 1 色で広がる途中（three-scale）は 1 色になりうる。
 * CI のマシンには GPU がなく、WebGL をソフトウェアで描くので遅すぎて当てにならない。画素は手元でだけ見る
 */
const expectNotBlank = async (page: Page, target: Locator, label: string) => {
  if (process.env.CI) return
  await expect
    .poll(() => isBlank(page, target), {
      message: `${label} が 1 色のまま`,
      timeout: 10000,
    })
    .toBe(false)
}

const interact = async (page: Page, demo: Demo) => {
  const { width, height } = page.viewportSize()!
  const cx = width / 2
  const cy = height / 2
  switch (demo.interaction) {
    case 'drag':
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 150, cy + 60, { steps: 10 })
      await page.mouse.up()
      break
    case 'hover':
      await page.mouse.move(width * 0.2, height * 0.2)
      await page.mouse.move(width * 0.8, height * 0.7, { steps: 20 })
      break
    case 'scroll':
      await page.mouse.move(cx, cy)
      for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 400)
      break
    case 'click':
      await page.mouse.click(cx, cy)
      break
    case 'none':
      break
  }
  await page.waitForTimeout(500)
}

test.beforeEach(async ({ page }) => {
  // iframe の中にも入る。context を失ったまま 1 色の画面を写していても、画素の確かめより先にここで分かる
  await page.addInitScript(() => {
    const counter = window as unknown as { __contextLost: number }
    counter.__contextLost = 0
    document.addEventListener(
      'webglcontextlost',
      () => counter.__contextLost++,
      true,
    )
  })
})

test('トップに全デモが並ぶ', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  for (const demo of demos) {
    await expect(page.locator(`.list a[href="/${demo.slug}/"]`)).toHaveCount(1)
  }
  expect(errors).toEqual([])
})

for (const demo of demos) {
  test(`@${demo.batch} ${demo.slug}`, async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto(`/${demo.slug}/`)
    expect(response?.status()).toBe(200)
    // 動き出すまで少し待つ
    await page.waitForTimeout(1000)

    const expectDrawn = async (when: string) => {
      await expectReady(page)
      const canvases = page.locator('canvas')
      const count = await canvases.count()
      for (let i = 0; i < count; i++) {
        await expectNotBlank(page, canvases.nth(i), `${when}canvas ${i}`)
      }
    }

    await expectDrawn('')

    await interact(page, demo)

    // 開いたまま縮めても、横にはみ出さない
    await page.setViewportSize({ width: 800, height: 500 })
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, '横にはみ出している').toBeLessThanOrEqual(0)
    await expectDrawn('縮めたあと ')

    expect(errors).toEqual([])
  })

  // webmanab の lab の記事は、別のオリジンのページから iframe で埋め込む。
  // preview は netlify.toml のヘッダー（frame-ancestors）を付けないので、ここで見るのは「埋め込まれても動くか」だけ
  test(`@${demo.batch} ${demo.slug} を iframe で開く`, async ({
    page,
    baseURL,
  }) => {
    const errors = watchErrors(page)
    const src = new URL(`/${demo.slug}/`, baseURL).href
    // 親のページは 127.0.0.1 に置く（localhost とは別のオリジン）。中身は route で返すので、サーバーには届かない
    const host = new URL('/__embed/', src.replace('//localhost', '//127.0.0.1'))
      .href
    await page.route(host, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0;background:#fff"><iframe src="${src}" width="800" height="500" style="border:0;display:block"></iframe></body>`,
      }),
    )
    // route で返したページはどのネットワークのものか分からず、localhost の iframe を読むには Chrome の
    // Local Network Access の許可が要る。本番は webmanab.com から labobal.dev を読むので、この許可は関係しない
    await page.context().grantPermissions(['local-network-access'])
    // load は iframe の load も待つ
    await page.goto(host)
    const iframe = page.locator('iframe')
    const frame = await (await iframe.elementHandle())!.contentFrame()
    // 読めなかったときは chrome-error:// のページが入る。404 は console のエラーで落ちる
    expect(frame?.url(), 'iframe にデモが読めていない').toBe(src)
    await page.waitForTimeout(1000)

    await expectReady(frame!)
    const overflow = await frame!.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, 'iframe の中で横にはみ出している').toBeLessThanOrEqual(0)
    await expectNotBlank(page, iframe, 'iframe')

    expect(errors).toEqual([])
  })
}
