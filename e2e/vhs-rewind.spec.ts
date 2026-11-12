import { expect, test, type Page } from '@playwright/test'

/**
 * vhs-rewind の巻き戻しの乱れが、勢いよく、長く上へ戻したときだけ出るか。
 * ホイールではなく 1 フレームごとに scrollBy で動かし、毎フレーム .screen の data-rewind を見る
 */

/**
 * frames フレームのあいだ、1 フレームに step px ずつ動かす。乱れが出たフレームがあれば、そのときの表示（REC か ◀◀ REW）を返す。
 * 乱れは止まると引くので、表示はあとから見ずに、出たフレームで読む
 */
const scrollFrames = (page: Page, step: number, frames: number) =>
  page.evaluate(
    ([step, frames]) =>
      new Promise<string | null>((resolve) => {
        const screen = document.querySelector('.screen')!
        const mode = document.querySelector('[data-mode]')!
        let seen: string | null = null
        const look = () => {
          if (seen === null && screen.hasAttribute('data-rewind'))
            seen = mode.textContent
        }
        let left = frames
        const tick = () => {
          scrollBy(0, step)
          look()
          if (--left > 0) requestAnimationFrame(tick)
          // 動かし終えた次のフレームまで見る
          else
            requestAnimationFrame(() => {
              look()
              resolve(seen)
            })
        }
        requestAnimationFrame(tick)
      }),
    [step, frames],
  )

const toBottom = async (page: Page) => {
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  // 止まって戻した量が数え直され、乱れも引くまで待つ
  await expect(page.locator('.screen')).not.toHaveAttribute('data-rewind', '')
  await page.waitForTimeout(300)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.goto('/vhs-rewind/')
  await page.waitForTimeout(1500)
})

test('ゆっくり戻すと乱れない', async ({ page }) => {
  await toBottom(page)
  // 1 フレームに 6px は 1 秒に画面 0.6 枚。速さが足りない
  expect(await scrollFrames(page, -6, 150)).toBeNull()
})

test('速くても、戻した量が少なければ乱れない', async ({ page }) => {
  await toBottom(page)
  // 画面 0.5 枚ぶんだけ速く戻す
  expect(await scrollFrames(page, -30, 10)).toBeNull()
})

test('速く長く戻すと乱れ、止まると引く', async ({ page }) => {
  await toBottom(page)
  // 1 フレームに 60px を 20 フレーム。重くて 20fps に落ちても、1 秒に画面 2 枚の速さになる
  expect(await scrollFrames(page, -60, 20)).toBe('◀◀ REW')
  await expect(page.locator('.screen')).not.toHaveAttribute('data-rewind', '', {
    timeout: 3000,
  })
  await expect(page.locator('.picture')).toHaveAttribute(
    'style',
    /^(?!.*filter)/,
  )
})

test('ゆっくり進めると再生のまま', async ({ page }) => {
  expect(await scrollFrames(page, 6, 150)).toBeNull()
  await expect(page.locator('[data-mode]')).toHaveText('▶ PLAY')
})

test('速く長く下へ送ると早送りになる', async ({ page }) => {
  const mode = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const el = document.querySelector('[data-mode]')!
        let left = 20
        let seen = ''
        const tick = () => {
          scrollBy(0, 60)
          if (el.textContent !== '▶ PLAY') seen ||= el.textContent!
          if (--left > 0) requestAnimationFrame(tick)
          else requestAnimationFrame(() => resolve(seen))
        }
        requestAnimationFrame(tick)
      }),
  )
  expect(mode).toBe('▶▶ FF')
})

test('下へ動くと、戻した量は数え直す', async ({ page }) => {
  await toBottom(page)
  // 画面 0.5 枚戻し、少し下へ進めて、また 0.5 枚戻す。続けて 0.8 枚を超えていないので乱れない
  expect(await scrollFrames(page, -30, 10)).toBeNull()
  expect(await scrollFrames(page, 30, 2)).toBeNull()
  expect(await scrollFrames(page, -30, 10)).toBeNull()
})

test.describe('動きを減らす設定', () => {
  test.use({ reducedMotion: 'reduce' })

  test('乱れは出るが、帯は入れ替わらない', async ({ page }) => {
    await toBottom(page)
    const seed = await page.locator('feTurbulence').getAttribute('seed')
    expect(await scrollFrames(page, -60, 20)).toBe('◀◀ REW')
    expect(await page.locator('feTurbulence').getAttribute('seed')).toBe(seed)
  })
})
