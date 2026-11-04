import { expect, test, type Page } from '@playwright/test'

/**
 * 動きを減らす設定（src/shared/motion.ts の決まり）を見る
 */

// ひとりでに動き続けるデモ。動きを減らす設定では止まった絵になる
const AUTOPLAY = [
  'amoeba',
  'blob',
  'blobradius',
  'canvas-draw-image',
  'canvas-fill-text',
  'canvas-glitch-image',
  'css-embed-images-scroll-the-screen-iphone6-outline-mockup',
  'distortion-slider-a',
  'gsap-motion-path',
  'gsap-random-repeat',
  'gsap-stagger',
  'marquee',
  'nodeballs',
  'rotate3d-xyz',
  'splitting',
  'styling-input',
  'three-typo',
  'three-video',
  'trigonometry-random-floating',
  'tweenmax-easing-of-scroll-parallax',
]

// WebGL を使わないデモ。GPU のない CI でも、ふだんは動いていることまで見られる
const AUTOPLAY_WITHOUT_GL = [
  'marquee',
  'nodeballs',
  'splitting',
  'trigonometry-random-floating',
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
