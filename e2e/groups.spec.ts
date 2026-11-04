import { expect, type Frame, type Page, test } from '@playwright/test'
import { loadDemos, loadGroups } from './meta'

/**
 * 組の中の切り替え（src/shared/variants.ts）。組ごとに、バリエーションを a→b→…→a と 3 周切り替えて、
 * 前のバリエーションが何も残していないこと（rAF のループ、WebGL の context、エラー）と、URL・題・パネルが替わることを見る
 */

const demos = loadDemos()
const groups = loadGroups()
const demoOf = (slug: string) => demos.find((demo) => demo.slug === slug)!

interface Counters {
  __raf: number
  __rawRaf: (callback: FrameRequestCallback) => number
  __liveGl: () => number
}
/** rAF の呼び出しと、生きている WebGL の context を数える。iframe の中にも入る */
const instrument = () => {
  const w = window as unknown as Counters
  const raf = window.requestAnimationFrame.bind(window)
  w.__rawRaf = raf
  w.__raf = 0
  window.requestAnimationFrame = (callback) => {
    w.__raf++
    return raf(callback)
  }
  const contexts: WebGLRenderingContext[] = []
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (...args: unknown[]) => unknown
  }
  const getContext = proto.getContext
  proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const context = getContext.apply(this, args)
    if (
      context &&
      String(args[0]).startsWith('webgl') &&
      !contexts.includes(context as WebGLRenderingContext)
    )
      contexts.push(context as WebGLRenderingContext)
    return context
  }
  w.__liveGl = () => contexts.filter((c) => !c.isContextLost()).length
}

/** 1 フレームに rAF が何回呼ばれたか。動いているループの数になる（GSAP の ticker も 1 つに数える） */
const loopsPerFrame = (target: Page | Frame) =>
  target.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as Counters
        const start = w.__raf
        let frames = 0
        const tick = () => {
          if (++frames === 30) resolve((w.__raf - start) / frames)
          else w.__rawRaf(tick)
        }
        w.__rawRaf(tick)
      }),
  )

const watchErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** demos.spec.ts の isBlank と同じ見方。切り替えの欄と隅のリンクは隠して写す */
const isBlank = async (page: Page) => {
  const jpeg = await page.locator('main.demo').screenshot({
    type: 'jpeg',
    quality: 60,
    style: '.links, .variant-toggle, .lil-gui { visibility: hidden }',
  })
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const ctx = new OffscreenCanvas(160, 100).getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, 160, 100)
    const { data } = ctx.getImageData(0, 0, 160, 100)
    for (let i = 4; i < data.length; i += 4)
      for (let c = 0; c < 3; c++)
        if (Math.abs(data[i + c] - data[c]) > 8) return false
    return true
  }, jpeg.toString('base64'))
}

const isStill = async (page: Page, gap = 500) => {
  const a = await page.screenshot()
  await page.waitForTimeout(gap)
  return a.equals(await page.screenshot())
}

/** 切り替えの欄を開く（lil-gui はここで読まれる） */
const openSwitcher = async (target: Page | Frame) => {
  await target.locator('.variant-toggle').click()
  await expect(target.locator('.variant-gui select')).toBeVisible()
}

const switchTo = async (target: Page | Frame, slug: string) => {
  await target
    .locator('.variant-gui select')
    .selectOption({ label: demoOf(slug).variant! })
  await expect
    .poll(() =>
      target.evaluate(
        () => document.querySelector<HTMLElement>('main.demo')!.dataset.slug,
      ),
    )
    .toBe(slug)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(instrument)
})

for (const group of groups) {
  const gl = group.variants.some((slug) => demoOf(slug).webgl)

  test(`${group.name} を 3 周切り替えても前のバリエーションが残らない`, async ({
    page,
  }) => {
    test.setTimeout(60_000 + group.variants.length * 15_000)
    const errors = watchErrors(page)

    // それぞれのページを直に開いたときのループの数。GSAP の ticker は動きがなくなって 2 秒たつと眠るので、それより待つ
    const baseline = new Map<string, number>()
    for (const slug of group.variants) {
      await page.goto(`/${slug}/`)
      await page.waitForTimeout(2500)
      baseline.set(slug, await loopsPerFrame(page))
    }

    const [first] = group.variants
    await page.goto(`/${first}/`)
    // 切り替えの欄は閉じて始まり、開くまで lil-gui を読まない
    await expect(page.locator('.variant-toggle')).toBeVisible()
    await expect(page.locator('.lil-gui')).toHaveCount(0)
    await openSwitcher(page)

    const order = [...group.variants.slice(1), first]
    for (let round = 0; round < 3; round++) {
      for (const slug of order) {
        const demo = demoOf(slug)
        await switchTo(page, slug)
        const where = `${round + 1} 周目の ${slug}`

        expect(new URL(page.url()).pathname, where).toBe(`/${slug}/`)
        await expect(page).toHaveTitle(`${demo.title} | labobal.dev`)
        await expect(page.locator('.info-title')).toHaveText(demo.title)
        await expect(page.locator('.info-slug')).toHaveText(slug)
        await expect(page.locator('.info-code a')).toHaveAttribute(
          'href',
          new RegExp(`/src/demos/${slug}/$`),
        )

        // 描けている（canvas の大きさが 0 でなく、案内が出ていない）。画素は GPU のない CI では見ない
        await expect(page.locator('.demo-fallback')).toHaveCount(0)
        for (const [width, height] of await page
          .locator('main.demo canvas')
          .evaluateAll((list) =>
            list.map((c) => [
              (c as HTMLCanvasElement).width,
              (c as HTMLCanvasElement).height,
            ]),
          ))
          expect(width * height, `${where} の canvas`).toBeGreaterThan(0)
        if (!process.env.CI)
          await expect
            .poll(() => isBlank(page), {
              message: `${where} が 1 色のまま`,
              timeout: 10_000,
            })
            .toBe(false)

        // 前のバリエーションのループが残っていない。context を失ったという知らせは後から届くので待つ
        await expect
          .poll(() => loopsPerFrame(page), {
            message: `${where} の rAF のループの数`,
            timeout: 5000,
          })
          .toBeCloseTo(baseline.get(slug)!, 0)
        if (gl)
          await expect
            .poll(
              () =>
                page.evaluate(() => (window as unknown as Counters).__liveGl()),
              {
                message: `${where} の WebGL の context の数`,
              },
            )
            .toBe(demo.webgl ? 1 : 0)
      }
    }
    expect(errors).toEqual([])
  })

  test.describe('動きを減らす設定', () => {
    test.use({ reducedMotion: 'reduce' })

    test(`${group.name} は切り替えたあとも止まった絵になる`, async ({
      page,
    }) => {
      test.setTimeout(30_000 + group.variants.length * 10_000)
      const errors = watchErrors(page)
      await page.goto(`/${group.variants[0]}/`)
      await openSwitcher(page)
      for (const slug of [...group.variants.slice(1), group.variants[0]]) {
        await switchTo(page, slug)
        // 写真を読み終えて落ち着くまで待ち、そのあと 1.5 秒止まっているか
        await expect.poll(() => isStill(page), { timeout: 10_000 }).toBe(true)
        expect(await isStill(page, 1500), slug).toBe(true)
      }
      expect(errors).toEqual([])
    })
  })

  test(`${group.name} を iframe に入れても切り替えられ、画面の外では止まる`, async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const [first, second] = group.variants
    // 記事のページの代わり。iframe の中の値を読めるよう、デモと同じオリジンで返す
    await page.route('/__group-host__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0">
          <iframe src="/${first}/" style="display:block;width:800px;height:500px;border:0"></iframe>
          <div style="height:3000px"></div></body>`,
      }),
    )
    await page.goto('/__group-host__')
    const frame = (await (await page
      .locator('iframe')
      .elementHandle())!.contentFrame())!
    await expect(frame.locator('.variant-toggle')).toBeVisible()
    await expect(frame.locator('.lil-gui')).toHaveCount(0)

    await openSwitcher(frame)
    await switchTo(frame, second)
    expect(new URL(frame.url()).pathname).toBe(`/${second}/`)
    // 記事の中では「記事」のリンクを出さない
    await expect(frame.locator('.info-article')).toBeHidden()

    // 画面の外に出したら止まり、戻したら動き出す
    await page.evaluate(() => scrollTo(0, 2500))
    await expect
      .poll(() =>
        frame.evaluate(() =>
          document.documentElement.hasAttribute('data-offscreen'),
        ),
      )
      .toBe(true)
    const calls = () =>
      frame.evaluate(() => (window as unknown as Counters).__raf)
    const before = await calls()
    await page.waitForTimeout(600)
    expect(await calls(), '画面の外で rAF が回っている').toBe(before)
    await page.evaluate(() => scrollTo(0, 0))
    await expect
      .poll(() =>
        frame.evaluate(() =>
          document.documentElement.hasAttribute('data-offscreen'),
        ),
      )
      .toBe(false)
    expect(errors).toEqual([])
  })
}
