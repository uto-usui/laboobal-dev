import { expect, test } from '@playwright/test'
import { loadDemos, loadGroups } from './meta'

/**
 * mouse-image の組。groups.spec.ts の 3 周はマウスを動かさないので、quickTo の tween が動いている最中に切り替えて、
 * 落ち着いたあとに前のバリエーションの tween、listener、ticker の listener が rAF を回していないかを見る
 */

const group = loadGroups().find((g) => g.name === 'mouse-image')!
const demos = loadDemos()
const labelOf = (slug: string) => demos.find((d) => d.slug === slug)!.variant!

test('mouse-image はマウスで動かしている最中に切り替えても、前の動きが残らない', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number }
    const raf = window.requestAnimationFrame.bind(window)
    w.__raf = 0
    window.requestAnimationFrame = (callback) => {
      w.__raf++
      return raf(callback)
    }
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const loops = async () => {
    const read = () =>
      page.evaluate(() => (window as unknown as { __raf: number }).__raf)
    const before = await read()
    await page.waitForTimeout(500)
    return (await read()) - before
  }
  const [first] = group.variants
  await page.goto(`/${first}/`)
  await page.locator('.variant-toggle').click()
  for (const slug of [...group.variants.slice(1), first]) {
    for (const [x, y] of [
      [300, 200],
      [900, 600],
      [1000, 150],
    ])
      await page.mouse.move(x, y, { steps: 5 })
    await page
      .locator('.variant-gui select')
      .selectOption({ label: labelOf(slug) })
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector<HTMLElement>('main.demo')!.dataset.slug,
        ),
      )
      .toBe(slug)
    // 写真が読めている（切り替えで足した img の src がそのまま使える）
    for (const ok of await page
      .locator('main.demo img')
      .evaluateAll((list) =>
        list.map((img) => (img as HTMLImageElement).naturalWidth > 0),
      ))
      expect(ok, `${slug} の写真`).toBe(true)
  }

  // 最後は first（帯の版。window の pointermove と ticker の listener を足す）。ほかへ移ってマウスを動かしても、
  // それらを外していれば今のバリエーションの tween が終わったあと GSAP の ticker が眠り、rAF が止まる
  await page
    .locator('.variant-gui select')
    .selectOption({ label: labelOf(group.variants[1]) })
  await page.mouse.move(600, 300, { steps: 5 })
  await page.mouse.move(5, 795, { steps: 5 })
  await expect
    .poll(loops, {
      message: '前のバリエーションの動きが rAF を回している',
      timeout: 8000,
    })
    .toBe(0)
  expect(errors).toEqual([])
})
