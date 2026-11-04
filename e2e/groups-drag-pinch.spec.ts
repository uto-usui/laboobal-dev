import { devices, expect, type Frame, test } from '@playwright/test'
import { loadDemos, loadGroups } from './meta'

/**
 * drag-pinch の組だけの確かめ。記事の iframe の中でバリエーションを切り替えたあとも、touchGate（src/shared/touch.ts）が効くこと。
 * 縦になぞるとページがスクロールし、「tap to drag」の添え書きは 1 つだけ出て、タップのあとは引っぱれる。
 * 前のバリエーションの添え書きと pointer の listener が残っていないことも見る
 */

const demos = loadDemos()
const group = loadGroups().find((g) => g.name === 'drag-pinch')!
const labelOf = (slug: string) => demos.find((d) => d.slug === slug)!.variant!

interface Listeners {
  __detachedPointerListeners: () => number
}
/** 要素に付いた pointer の listener を数える。外したあとの要素（切り替えで入れ替わった .stage）に残っている数を返す */
const instrument = () => {
  const live: { target: EventTarget; type: string; listener: unknown }[] = []
  const proto = EventTarget.prototype
  const add = proto.addEventListener
  const remove = proto.removeEventListener
  proto.addEventListener = function (type, listener, options) {
    if (this instanceof Element && type.startsWith('pointer'))
      live.push({ target: this, type, listener })
    return add.call(this, type, listener, options)
  }
  proto.removeEventListener = function (type, listener, options) {
    const i = live.findIndex(
      (l) => l.target === this && l.type === type && l.listener === listener,
    )
    if (i >= 0) live.splice(i, 1)
    return remove.call(this, type, listener, options)
  }
  ;(window as unknown as Listeners).__detachedPointerListeners = () =>
    live.filter((l) => !(l.target as Element).isConnected).length
}

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
  devices['iPhone 13']
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })
// 本物のタッチは CDP で送る。ページの中で作ったイベントでは、ブラウザはスクロールしない
test.skip(({ browserName }) => browserName !== 'chromium')

test('drag-pinch を iframe の中で切り替えても、縦になぞるとスクロールし、タップのあとは引っぱれる', async ({
  page,
  context,
}) => {
  test.setTimeout(30_000 + group.variants.length * 10_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(instrument)

  const [first] = group.variants
  await page.route('/__touch-host__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta name="viewport" content="width=device-width">
        <body style="margin:0"><p style="height:120px">article</p>
        <iframe src="/${first}/" style="display:block;width:100%;height:500px;border:0"></iframe>
        <div style="height:2000px"></div></body>`,
    }),
  )
  await page.goto('/__touch-host__')
  const frame: Frame = (await (await page
    .locator('iframe')
    .elementHandle())!.contentFrame())!
  await expect(frame.locator('.stage')).toBeVisible()

  const cdp = await context.newCDPSession(page)
  const touch = (type: string, x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    })
  // 設定の欄（右上、幅 245px）に当たらないよう、左寄りを触る
  const X = 60
  const moveUp = async (y: number) => {
    for (let i = 1; i <= 10; i++) await touch('touchMove', X, y - i * 20)
  }
  const scrollY = () => page.evaluate(() => scrollY)
  const settled = async () => {
    const before = await scrollY()
    await page.waitForTimeout(300)
    return before === (await scrollY())
  }
  const touchAction = () =>
    frame.locator('.stage').evaluate((el) => getComputedStyle(el).touchAction)
  /** .stage の中の要素の style。引っぱると変わる */
  const styles = () =>
    frame
      .locator('.stage')
      .evaluate((stage) =>
        [...stage.querySelectorAll<HTMLElement>('*')]
          .map((el) => el.style.cssText)
          .join('\n'),
      )

  await frame.locator('.variant-toggle').click()
  await expect(frame.locator('.variant-gui select')).toBeVisible()

  for (const slug of [...group.variants.slice(1), first]) {
    // 前の周でデモを触ったので、設定の欄は閉じている（欄の外を押すと閉じる）。開き直す
    if (await frame.locator('.variant-gui.lil-closed').count())
      await frame.locator('.variant-gui > .lil-title').click()
    await frame.locator('.variant-gui select').selectOption({
      label: labelOf(slug),
    })
    await expect
      .poll(() =>
        frame.evaluate(
          () => document.querySelector<HTMLElement>('main.demo')!.dataset.slug,
        ),
      )
      .toBe(slug)

    // 添え書きは 1 つだけで、前のバリエーションの .stage に pointer の listener が残っていない
    await expect(frame.locator('.demo-hint-touch'), slug).toHaveCount(1)
    await expect(frame.locator('.demo-hint-touch'), slug).toBeVisible()
    await expect(frame.locator('.demo-hint-touch')).toHaveText('tap to drag')
    expect(
      await frame.evaluate(() =>
        (window as unknown as Listeners).__detachedPointerListeners(),
      ),
      slug,
    ).toBe(0)
    await expect.poll(touchAction, slug).toBe('pan-y')

    // 縦になぞると、記事のページがスクロールする
    await page.evaluate(() => scrollTo(0, 0))
    await touch('touchStart', X, 450)
    await moveUp(450)
    await touch('touchEnd')
    await expect.poll(scrollY, slug).toBeGreaterThan(0)
    await expect.poll(settled).toBe(true)

    // タップすると添え書きが消えて none になり、縦に引っぱるとデモが動いて、ページは動かない
    await page.evaluate(() => scrollTo(0, 0))
    await touch('touchStart', X, 300)
    await touch('touchEnd')
    await expect.poll(touchAction, slug).toBe('none')
    await expect(frame.locator('.demo-hint-touch'), slug).toBeHidden()
    // 欄の外を触ったので、設定の欄は閉じている（触った操作はデモにも届いている）
    await expect(frame.locator('.variant-gui'), slug).toHaveClass(/lil-closed/)
    const still = await styles()
    const before = await scrollY()
    await touch('touchStart', X, 450)
    await moveUp(450)
    await expect.poll(styles, { message: `${slug} が動かない` }).not.toBe(still)
    await touch('touchEnd')
    await page.waitForTimeout(300)
    expect(await scrollY(), slug).toBe(before)
  }
  expect(errors).toEqual([])
})
