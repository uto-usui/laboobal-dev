import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
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

/** console.error と、捕まえられなかった例外を集める */
const watchErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/**
 * canvas が 1 色で塗りつぶされていないか。WebGL は描いたあとに中身を読めないことがあるので、
 * 画面のスクショを canvas の範囲で切り出し、ページの中で画素を見る
 */
const isCanvasBlank = async (page: Page, index: number) => {
  const canvas = page.locator('canvas').nth(index)
  // 隅のリンクが canvas に重なると 1 色にならないので、写すときだけ隠す
  const png = await canvas.screenshot({
    style: '.links { visibility: hidden }',
  })
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext(
      '2d',
    )!
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    for (let i = 4; i < data.length; i += 4) {
      if (
        data[i] !== data[0] ||
        data[i + 1] !== data[1] ||
        data[i + 2] !== data[2]
      )
        return false
    }
    return true
  }, png.toString('base64'))
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

test('トップに全デモが並ぶ', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  for (const demo of demos) {
    await expect(page.locator(`a[href="/${demo.slug}/"]`)).toHaveCount(1)
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

    const canvasCount = await page.locator('canvas').count()
    for (let i = 0; i < canvasCount; i++) {
      expect(await isCanvasBlank(page, i), `canvas ${i} が 1 色のまま`).toBe(
        false,
      )
    }

    await interact(page, demo)

    // webmanab の iframe くらいの大きさに縮めても、横にはみ出さない
    await page.setViewportSize({ width: 800, height: 500 })
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, '横にはみ出している').toBeLessThanOrEqual(0)
    for (let i = 0; i < canvasCount; i++) {
      expect(
        await isCanvasBlank(page, i),
        `縮めたあと canvas ${i} が 1 色のまま`,
      ).toBe(false)
    }

    expect(errors).toEqual([])
  })
}
