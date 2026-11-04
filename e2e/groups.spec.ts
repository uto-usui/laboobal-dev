import { expect, type Frame, type Page, test } from '@playwright/test'
import { loadDemos, loadGroups } from './meta'

/**
 * 組の中の切り替え（src/shared/variants.ts）。組ごとに、バリエーションを a→b→…→a と 3 周切り替えて、
 * 前のバリエーションが何も残していないこと（rAF のループ、WebGL の context、listener、エラー）と、URL・題・パネルが替わることを見る
 * 入力（マウス、タッチ、スクロール）はしないので、入力で始まる tween や listener の片付けは組ごとの spec（groups-<組>.spec.ts）で見る
 */

const demos = loadDemos()
const groups = loadGroups()
const demoOf = (slug: string) => demos.find((demo) => demo.slug === slug)!

interface Counters {
  __raf: number
  __rawRaf: (callback: FrameRequestCallback) => number
  __liveGl: () => number
  __globalListeners: () => number
  __markStage: () => void
  __detachedListeners: () => string[]
}
/**
 * rAF の呼び出し、生きている WebGL の context、付いている listener を数える。iframe の中にも入る。
 * listener は addEventListener と removeEventListener を (target, type, listener, capture) で突き合わせる。once は数えない
 */
const instrument = () => {
  const w = window as unknown as Counters
  const live: {
    target: EventTarget
    type: string
    listener: unknown
    capture: boolean
  }[] = []
  const captureOf = (options?: boolean | EventListenerOptions) =>
    typeof options === 'boolean' ? options : !!options?.capture
  const events = EventTarget.prototype
  const add = events.addEventListener
  const remove = events.removeEventListener
  const indexOf = (
    target: EventTarget,
    type: string,
    listener: unknown,
    capture: boolean,
  ) =>
    live.findIndex(
      (l) =>
        l.target === target &&
        l.type === type &&
        l.listener === listener &&
        l.capture === capture,
    )
  events.addEventListener = function (type, listener, options) {
    const capture = captureOf(options)
    if (
      listener &&
      // Playwright も window に listener を足す（クリックの当たり判定やスクショ）。サイトの script が足したものだけ数える
      (!(this === window || this === document) ||
        new Error().stack?.includes(location.origin)) &&
      !(typeof options === 'object' && options.once) &&
      indexOf(this, type, listener, capture) < 0
    )
      live.push({ target: this, type, listener, capture })
    return add.call(this, type, listener, options)
  }
  events.removeEventListener = function (type, listener, options) {
    const i = indexOf(this, type, listener, captureOf(options))
    if (i >= 0) live.splice(i, 1)
    return remove.call(this, type, listener, options)
  }
  w.__globalListeners = () =>
    live.filter((l) => l.target === window || l.target === document).length
  // 切り替える前の main.demo の中の要素。切り替えると main.demo から外れる
  let previous = new WeakSet<EventTarget>()
  w.__markStage = () => {
    previous = new WeakSet(document.querySelectorAll('main.demo *'))
  }
  w.__detachedListeners = () =>
    live
      .filter((l) => previous.has(l.target) && !(l.target as Node).isConnected)
      .map(
        (l) =>
          `${(l.target as Element).getAttribute('class') || (l.target as Element).tagName} の ${l.type}`,
      )
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
  await target.evaluate(() => (window as unknown as Counters).__markStage())
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

    // それぞれのページを直に開いたときのループの数。GSAP の ticker は動きがなくなって 2 秒たつと眠るので、それより待つ。
    // window と document の listener の数は、切り替えの欄を開いたあとに数える（欄も document に listener を足す）
    const baseline = new Map<string, number>()
    const listenerBaseline = new Map<string, number>()
    const globalListeners = () =>
      page.evaluate(() => (window as unknown as Counters).__globalListeners())
    for (const slug of group.variants) {
      await page.goto(`/${slug}/`)
      await page.waitForTimeout(2500)
      baseline.set(slug, await loopsPerFrame(page))
      await openSwitcher(page)
      listenerBaseline.set(slug, await globalListeners())
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

        // 前のバリエーションの要素にも、window と document にも、listener が残っていない
        expect(
          await page.evaluate(() =>
            (window as unknown as Counters).__detachedListeners(),
          ),
          `${where} で、外れた要素に残った listener`,
        ).toEqual([])
        if (round === 2)
          expect(
            await globalListeners(),
            `${where} の window と document の listener の数`,
          ).toBe(listenerBaseline.get(slug))
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

/** 切り替えのしくみそのもの。follow-mouse の組で見る（DOM で描くので軽く、バリエーションが 4 本ある） */
test.describe('切り替えのしくみ', () => {
  const group = groups.find((g) => g.name === 'follow-mouse')!
  const [a, b, c, d] = group.variants

  /** 読み終わるのを待たずに選ぶ。読み込みの途中で選び直す流れを作るため */
  const pick = (page: Page, slug: string) =>
    page
      .locator('.variant-gui select')
      .selectOption({ label: demoOf(slug).variant! })
  /** /<slug>/ の応答を、slug ごとに決めた長さだけ遅らせる */
  const delayPages = async (page: Page, delays: Map<string, number>) => {
    for (const [slug, ms] of delays)
      await page.route(`/${slug}/`, async (route) => {
        const response = await route.fetch()
        await new Promise((resolve) => setTimeout(resolve, ms))
        await route.fulfill({ response })
      })
  }
  const shown = (page: Page) =>
    page.evaluate(() => ({
      slug: document.querySelector<HTMLElement>('main.demo')!.dataset.slug,
      path: location.pathname,
      select: (({ options, selectedIndex }) => options[selectedIndex].text)(
        document.querySelector<HTMLSelectElement>('.variant-gui select')!,
      ),
    }))
  const expected = (slug: string) => ({
    slug,
    path: `/${slug}/`,
    select: demoOf(slug).variant,
  })

  test('B を選んで、読み込みが終わる前に A に戻すと A のまま', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(`/${a}/`)
    await openSwitcher(page)
    await delayPages(page, new Map([[b, 1000]]))
    await pick(page, b)
    await page.waitForTimeout(100)
    await pick(page, a)
    await page.waitForTimeout(2000)
    expect(await shown(page)).toEqual(expected(a))
    expect(errors).toEqual([])
  })

  test('速く続けて選ぶと最後に選んだものになり、ループは 1 本', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(`/${a}/`)
    await page.waitForTimeout(2500)
    const baseline = await loopsPerFrame(page)
    await openSwitcher(page)
    // どれも選び終えたあとに、選んだ順とは違う順で届く。最後は今のもの（a）を選ぶ
    await delayPages(
      page,
      new Map([
        [b, 1600],
        [c, 1000],
        [d, 1300],
      ]),
    )
    for (const slug of [b, c, d, a, c, b, d, c, b, a]) {
      await pick(page, slug)
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(2500)
    expect(await shown(page)).toEqual(expected(a))
    expect(await loopsPerFrame(page)).toBeCloseTo(baseline, 0)
    expect(errors).toEqual([])
  })
})
