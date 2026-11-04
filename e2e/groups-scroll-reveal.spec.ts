import { expect, type Frame, type Page, test } from '@playwright/test'
import { loadDemos, loadGroups } from './meta'

/**
 * scroll-reveal の組に固有の確かめ。groups.spec.ts はスクロールしないので、切り替えたあとにスクロールで進むこと、
 * 先頭に戻ること、前のバリエーションの scroll と resize の listener が window に残らないことをここで見る
 */

const group = loadGroups().find((g) => g.name === 'scroll-reveal')!
const demos = loadDemos()
const labelOf = (slug: string) =>
  demos.find((demo) => demo.slug === slug)!.variant!

/** window に付いている scroll と resize の listener を数える。iframe の中にも入る */
const instrument = () => {
  const live = { scroll: new Set<unknown>(), resize: new Set<unknown>() }
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  window.addEventListener = ((
    type: string,
    listener: unknown,
    options?: unknown,
  ) => {
    if (type === 'scroll' || type === 'resize') live[type].add(listener)
    add(type, listener as EventListener, options as AddEventListenerOptions)
  }) as typeof window.addEventListener
  window.removeEventListener = ((
    type: string,
    listener: unknown,
    options?: unknown,
  ) => {
    if (type === 'scroll' || type === 'resize') live[type].delete(listener)
    remove(type, listener as EventListener, options as EventListenerOptions)
  }) as typeof window.removeEventListener
  ;(window as unknown as { __listeners: () => number }).__listeners = () =>
    live.scroll.size + live.resize.size
}

const listeners = (target: Page | Frame) =>
  target.evaluate(() =>
    (window as unknown as { __listeners: () => number }).__listeners(),
  )

/** 箱の姿。数、背景の色、transform のどれかが進み具合で変わる */
const look = (target: Page | Frame) =>
  target.locator('main.demo .target').evaluate((el) => {
    const value = el.querySelector('.value')?.textContent ?? ''
    return `${value}|${getComputedStyle(el).backgroundColor}|${(el as HTMLElement).style.transform}`
  })

/** ホイールのなめらかなスクロールが止まったか。動いている間に先頭へ戻しても、残りの分だけまた進む */
const settled = async (target: Page | Frame) => {
  const before = await target.evaluate(() => scrollY)
  await new Promise((resolve) => setTimeout(resolve, 300))
  return before === (await target.evaluate(() => scrollY))
}

const switchTo = async (target: Page | Frame, slug: string) => {
  await target
    .locator('.variant-gui select')
    .selectOption({ label: labelOf(slug) })
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

test('scroll-reveal は切り替えると先頭に戻り、スクロールで進み、listener が残らない', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const baseline = new Map<string, number>()
  for (const slug of group.variants) {
    await page.goto(`/${slug}/`)
    baseline.set(slug, await listeners(page))
  }

  const [first] = group.variants
  await page.goto(`/${first}/`)
  await page.locator('.variant-toggle').click()
  await expect(page.locator('.variant-gui select')).toBeVisible()
  await page.mouse.move(640, 400)

  for (let round = 0; round < 3; round++) {
    for (const slug of [...group.variants.slice(1), first]) {
      const where = `${round + 1} 周目の ${slug}`
      // 前のバリエーションで下までスクロールしてから切り替える
      await page.mouse.wheel(0, 1200)
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
      await expect.poll(() => settled(page)).toBe(true)
      await switchTo(page, slug)

      await expect
        .poll(() => page.evaluate(() => scrollY), { message: where })
        .toBe(0)
      expect(await listeners(page), `${where} の listener`).toBe(
        baseline.get(slug),
      )
      const before = await look(page)
      await page.mouse.wheel(0, 400)
      await expect
        .poll(() => look(page), { message: `${where} がスクロールで進まない` })
        .not.toBe(before)
    }
  }
  expect(errors).toEqual([])
})

test('scroll-reveal は iframe の中でも、切り替えたあとにスクロールで進む', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const [first] = group.variants
  await page.route('/__scroll-host__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><body style="margin:0">
        <iframe src="/${first}/" style="display:block;width:800px;height:500px;border:0"></iframe>
        <div style="height:3000px"></div></body>`,
    }),
  )
  await page.goto('/__scroll-host__')
  const frame = (await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame())!
  await frame.locator('.variant-toggle').click()
  await expect(frame.locator('.variant-gui select')).toBeVisible()
  await page.mouse.move(400, 250)

  for (const slug of [...group.variants.slice(1), first]) {
    await switchTo(frame, slug)
    const before = await look(frame)
    await page.mouse.wheel(0, 300)
    await expect
      .poll(() => frame.evaluate(() => scrollY), { message: slug })
      .toBeGreaterThan(0)
    await expect
      .poll(() => look(frame), { message: `${slug} がスクロールで進まない` })
      .not.toBe(before)
  }
  expect(errors).toEqual([])
})
