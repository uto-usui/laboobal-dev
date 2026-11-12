import { devices, expect, test, type Page } from '@playwright/test'

/**
 * 動きを減らす設定（docs/demo-guide.md の 5 章）と、指でのスクロールを奪わないこと（src/shared/touch.ts）を見る
 */

// ひとりでに動き続けるデモ。動きを減らす設定では止まった絵になる
const AUTOPLAY = [
  'amoeba',
  'blob',
  'blobradius',
  'canvas-draw-image',
  'canvas-fill-text',
  'canvas-glitch-image',
  'circular-motion-with-depth',
  'create-js-line-motion-trigonometric-sin',
  'createjs-beat-motion-trigonometric',
  'createjs-gravity-and-friction',
  'createjs-node-motion',
  'createjs-revolution-trigonometric',
  'createjs-round-motion-trigonometric',
  'css-embed-images-scroll-the-screen-iphone6-outline-mockup',
  'distortion-slider-a',
  'effects-to-youtube-videos',
  'give-speed-and-angle-as-separate-random-values',
  'gsap-motion-path',
  'gsap-random-repeat',
  'gsap-stagger',
  'html-emaki',
  'html-takiage',
  'marquee',
  'move-a-node-with-springiness',
  'move-an-object-while-drawing-a-circle',
  'nodeballs',
  'processing-js-draw-countless-circles-draw-function',
  'processing-js-random-walk',
  'rotate-elements-arranged-on-the-circumference',
  'rotate3d-xyz',
  'smooth-movement-using-sin-wave',
  'splitting',
  'three-typo',
  'three-video',
  'trigonometry-random-floating',
  'tweenmax-easing-of-scroll-parallax',
  'vhs-rewind',
]

// WebGL を使わないデモ。GPU のない CI でも、ふだんは動いていることまで見られる
const AUTOPLAY_WITHOUT_GL = [
  'circular-motion-with-depth',
  'create-js-line-motion-trigonometric-sin',
  'createjs-beat-motion-trigonometric',
  'createjs-gravity-and-friction',
  'createjs-node-motion',
  'createjs-revolution-trigonometric',
  'createjs-round-motion-trigonometric',
  'effects-to-youtube-videos',
  'give-speed-and-angle-as-separate-random-values',
  'marquee',
  'move-a-node-with-springiness',
  'move-an-object-while-drawing-a-circle',
  'nodeballs',
  'processing-js-draw-countless-circles-draw-function',
  'processing-js-random-walk',
  'rotate-elements-arranged-on-the-circumference',
  'smooth-movement-using-sin-wave',
  'splitting',
  'trigonometry-random-floating',
  'vhs-rewind',
]

/** gap ミリ秒あけた 2 枚のスクショが同じか */
const isStill = async (page: Page, gap = 500) => {
  const a = await page.screenshot()
  await page.waitForTimeout(gap)
  const b = await page.screenshot()
  return a.equals(b)
}

const watchErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('動きを減らす設定', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const slug of AUTOPLAY) {
    test(`${slug} は止まった絵になる`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.goto(`/${slug}/`)
      // 写真やフォントを読み終えて絵が落ち着くまで待ち、そのあと 3.5 秒（自動で進むスライダーの間隔より長い）止まっているかを見る
      await expect.poll(() => isStill(page), { timeout: 15_000 }).toBe(true)
      expect(await isStill(page, 3500)).toBe(true)
      expect(errors).toEqual([])
    })
  }
})

test.describe('開いている途中で設定を変える', () => {
  for (const slug of AUTOPLAY_WITHOUT_GL) {
    test(`${slug} はその場で止まる`, async ({ page }) => {
      await page.goto(`/${slug}/`)
      await expect.poll(() => isStill(page), { timeout: 10_000 }).toBe(false)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => isStill(page), { timeout: 10_000 }).toBe(true)
    })
  }
})

test.describe('指でのスクロールを奪わない', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    devices['iPhone 13']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })
  // 本物のタッチは CDP で送る。ページの中で作ったイベントでは、ブラウザはスクロールしない
  test.skip(({ browserName }) => browserName !== 'chromium')

  const HOST = '/__touch-host__'
  const DRAG = [
    'drag-pinch-simple',
    'drag-pinch-friction',
    'drag-pinch-lines',
    'drag-pinch-word',
    'html-cloth',
    'html-emaki',
    'html-takiage',
  ]
  // HTML-in-Canvas（Chrome 157〜）のデモ。使えないブラウザではふつうの HTML を置くだけで touchGate を呼ばないので、
  // タップしてからの所は、使えるブラウザでだけ見る（Playwright の Chromium 156 では飛ばす）
  const HTML_IN_CANVAS = ['html-cloth', 'html-emaki', 'html-takiage']

  for (const slug of DRAG) {
    test(`${slug} を iframe に入れても、縦になぞると記事がスクロールする`, async ({
      page,
      context,
    }) => {
      // デモと同じオリジンの記事のページ。中の iframe の touch-action を読めるよう、同じオリジンで返す
      await page.route(HOST, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta name="viewport" content="width=device-width">
            <body style="margin:0"><p style="height:120px">article</p>
            <iframe src="/${slug}/" style="display:block;width:100%;height:500px;border:0"></iframe>
            <div style="height:2000px"></div></body>`,
        }),
      )
      await page.goto(HOST)
      const frame = page.frameLocator('iframe')
      await expect(frame.locator('.stage')).toBeVisible()
      const touchAction = () =>
        frame
          .locator('.stage')
          .evaluate((el) => getComputedStyle(el).touchAction)
      await expect.poll(touchAction).toBe('pan-y')

      const cdp = await context.newCDPSession(page)
      const touch = (type: string, x = 0, y = 0) =>
        cdp.send('Input.dispatchTouchEvent', {
          type: type as 'touchStart',
          touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        })
      const swipeUp = async (x: number, y: number) => {
        await touch('touchStart', x, y)
        for (let i = 1; i <= 10; i++) await touch('touchMove', x, y - i * 20)
        await touch('touchEnd')
      }
      const scrollY = () => page.evaluate(() => scrollY)

      // 縦になぞると、記事のページがスクロールする
      await swipeUp(190, 450)
      await expect.poll(scrollY).toBeGreaterThan(0)

      // タップすると none になり、縦に引っぱってもページは動かない。先のスクロールの慣性が止まってから測る
      const settled = async () => {
        const before = await scrollY()
        await page.waitForTimeout(300)
        return before === (await scrollY())
      }
      await expect.poll(settled).toBe(true)
      const drawable = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.setAttribute('content', 'drawable')
        return (canvas as { content?: string }).content === 'drawable'
      })
      if (HTML_IN_CANVAS.includes(slug) && !drawable) return
      await page.evaluate(() => scrollTo(0, 0))
      await touch('touchStart', 190, 300)
      await touch('touchEnd')
      await expect.poll(touchAction).toBe('none')
      const before = await scrollY()
      await swipeUp(190, 450)
      await page.waitForTimeout(500)
      expect(await scrollY()).toBe(before)
    })
  }
})
