import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// 記事のあるデモを 1 本選ぶ。meta.ts は demos.spec.ts と同じく文字として読む
const withArticle = readdirSync('src/demos').find((slug) =>
  /article:\s*'https:/.test(
    readFileSync(`src/demos/${slug}/meta.ts`, 'utf8').replace(/\s+/g, ' '),
  ),
)

test('info のボタンでパネルを開け閉めできる。Esc で閉じてボタンに戻る', async ({
  page,
}) => {
  await page.goto('/amoeba/')
  const toggle = page.getByRole('button', { name: 'info' })
  const panel = page.locator('#demo-info')

  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAttribute('aria-controls', 'demo-info')
  await expect(panel).toBeHidden()
  // 閉じている間は、右の真ん中に触れてもデモに届く
  const { width, height } = page.viewportSize()!
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('.info') === null,
    [width - 100, height / 2],
  )
  expect(hit).toBe(true)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('うごめくアメーバ')

  // パネルの中に focus があっても、Esc で閉じてボタンに戻る
  await panel.getByRole('link', { name: 'コード' }).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()

  // キーボードだけで開ける
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'close' }).click()
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()
})

test('パネルのリンク', async ({ page }) => {
  await page.goto('/amoeba/')
  await page.getByRole('button', { name: 'info' }).click()
  const panel = page.locator('#demo-info')
  // リポジトリの名前は laboobal-dev。ドメインの labobal.dev とつづりが違う
  await expect(panel.getByRole('link', { name: 'コード' })).toHaveAttribute(
    'href',
    'https://github.com/uto-usui/laboobal-dev/tree/master/src/demos/amoeba/',
  )
  await expect(
    panel.getByRole('link', { name: 'labobal.dev' }),
  ).toHaveAttribute('href', '/')
  for (const link of await panel.getByRole('link').all())
    await expect(link).toHaveAttribute('target', '_top')
})

test('記事のあるデモは「記事」を出し、iframe の中では出さない', async ({
  page,
}) => {
  test.skip(!withArticle, '記事のあるデモがない')
  await page.goto(`/${withArticle}/`)
  await page.getByRole('button', { name: 'info' }).click()
  await expect(page.getByRole('link', { name: '記事' })).toHaveAttribute(
    'href',
    /^https:\/\/webmanab\.com\/lab\//,
  )

  // 親を同じオリジンにする（frame-ancestors で弾かれないように）
  await page.goto('/')
  await page.evaluate((slug) => {
    const iframe = document.createElement('iframe')
    iframe.src = `/${slug}/`
    iframe.style.cssText = 'width:800px;height:500px;border:0'
    document.body.replaceChildren(iframe)
  }, withArticle)
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: 'info' }).click()
  await expect(frame.locator('#demo-info')).toBeVisible()
  await expect(frame.getByRole('link', { name: 'コード' })).toBeVisible()
  await expect(frame.getByRole('link', { name: '記事' })).toHaveCount(0)
})
