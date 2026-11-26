import { readFileSync, statSync } from 'node:fs'
const assetBytes = JSON.parse(
  readFileSync(
    new URL('../src/demos/toy-figure/asset-bytes.json', import.meta.url),
    'utf8',
  ),
) as Record<string, number>
import { devices, expect, test, type Page } from '@playwright/test'

test.setTimeout(60_000)
test.use({ channel: 'chrome' })

const ready = async (page: Page) => {
  await page.goto('/toy-figure/')
  await expect(page.locator('.toy-figure')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 15_000 },
  )
  await expect(page.locator('.loading')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('読み込みが完了しました')
}
const still = async (page: Page) => {
  const before = await page.screenshot()
  await page.waitForTimeout(500)
  return before.equals(await page.screenshot())
}

test('toy-figure は歩き続け、押すと足をそろえて見てから再開する', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await ready(page)
  const stage = page.locator('.toy-figure')
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  const before = await page.screenshot()
  await page.waitForTimeout(1600)
  expect(before.equals(await page.screenshot())).toBe(false)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await page.mouse.move(1100, 350)
  await page.mouse.click(1100, 350)
  await expect(stage).toHaveAttribute('data-walk-state', 'look', {
    timeout: 2500,
  })
  await expect(stage).toHaveAttribute('data-walking', 'idle')
  await page.waitForTimeout(400)
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
  await expect(stage).toHaveAttribute('data-walk-state', 'walk', {
    timeout: 3000,
  })
  await page.waitForTimeout(1000)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  expect(errors).toEqual([])
})

test('toy-figure は8pxからドラッグを判定し、離した角度で歩き続ける', async ({
  page,
}) => {
  await ready(page)
  const stage = page.locator('.toy-figure')
  const angle = (degrees: number) =>
    expect(stage).toHaveAttribute('data-camera-angle', String(degrees))
  await angle(30)
  await page.mouse.move(400, 400)
  await page.mouse.down()
  await page.mouse.move(407, 400)
  await page.mouse.up()
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
  await angle(30)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')

  await page.mouse.move(400, 400)
  await page.mouse.down()
  await page.mouse.move(408, 400)
  await page.mouse.up()
  await page.waitForTimeout(450)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await angle(30)

  await page.mouse.move(400, 400)
  await page.mouse.down()
  await page.mouse.move(500, 400, { steps: 10 })
  await angle(43.8)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await page.mouse.move(800, 400)
  await angle(50)
  await page.mouse.move(790, 400)
  await angle(48.5)
  await page.mouse.move(500, 400)
  await angle(15)
  await page.mouse.move(510, 400)
  await angle(16.5)
  await page.mouse.up()
  await page.waitForTimeout(500)
  await angle(16.5)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await page.mouse.click(1000, 400)
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
  await angle(16.5)
})

test('toy-figure は縦始まり、キャンセル、キャンバス外の操作を取り消す', async ({
  page,
}) => {
  await ready(page)
  const stage = page.locator('.toy-figure')
  const canvas = stage.locator('canvas')
  await page.mouse.move(400, 400)
  await page.mouse.down()
  await page.mouse.move(402, 412)
  await page.mouse.move(500, 412)
  await page.mouse.up()
  await expect(stage).toHaveAttribute('data-camera-angle', '30')

  await canvas.evaluate((el) => {
    el.addEventListener(
      'pointerdown',
      (event) => {
        const id = (event as PointerEvent).pointerId
        el.addEventListener(
          'pointermove',
          () => {
            el.dispatchEvent(
              new PointerEvent('pointercancel', { pointerId: id }),
            )
          },
          { once: true },
        )
      },
      { once: true },
    )
  })
  await page.mouse.move(500, 400)
  await page.mouse.down()
  await page.mouse.move(620, 400)
  await page.mouse.up()
  await expect(stage).toHaveAttribute('data-camera-angle', '30')

  await page.mouse.move(2, 400)
  await page.mouse.down()
  await page.mouse.move(-2, 400)
  await page.mouse.up()
  await page.waitForTimeout(450)
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await expect(stage).toHaveAttribute('data-camera-angle', '30')
})

test('toy-figure は動きを減らす設定でもキーとドラッグで角度を変えられる', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  const stage = page.locator('.toy-figure')
  const canvas = page.getByLabel('恐竜の野原を歩くフィギュア')
  await page.keyboard.press('ArrowRight')
  await expect(stage).toHaveAttribute('data-camera-angle', '30')
  await page.keyboard.press('Tab')
  await expect(canvas).toBeFocused()
  expect(await canvas.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect(stage).toHaveAttribute('data-camera-angle', '35')
  await page.keyboard.press('ArrowLeft')
  await expect(stage).toHaveAttribute('data-camera-angle', '30')
  await page.mouse.move(700, 400)
  await page.mouse.down()
  await page.mouse.move(600, 400)
  await page.mouse.up()
  await expect(stage).toHaveAttribute('data-camera-angle', '16.2')
  await expect(stage).toHaveAttribute('data-walk-state', 'still')
  await page.keyboard.press('Home')
  await expect(stage).toHaveAttribute('data-camera-angle', '30')
  await page.keyboard.press('Space')
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
  await expect(stage).toHaveAttribute('data-walk-state', 'still')
  await page.keyboard.press('Enter')
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
})

test('toy-figure は設定変更で静止し、視線の追従と押した反応は残る', async ({
  page,
}) => {
  await ready(page)
  const stage = page.locator('.toy-figure')
  await expect.poll(() => still(page)).toBe(false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(stage).toHaveAttribute('data-walk-state', 'still')
  await expect.poll(() => still(page)).toBe(true)
  const before = await page.screenshot()
  await page.mouse.move(20, 20)
  await page.waitForTimeout(2200)
  expect(before.equals(await page.screenshot())).toBe(false)
  // 視線の減衰が、描画の丸め誤差より小さくなるまで待つ。
  await expect.poll(() => still(page), { timeout: 12_000 }).toBe(true)
  await page.mouse.click(1000, 650)
  await expect(stage).toHaveAttribute('data-walk-state', 'look')
  await expect(stage).toHaveAttribute('data-walking', 'idle')
  await expect(stage).toHaveAttribute('data-walk-state', 'still', {
    timeout: 2500,
  })
  await page.waitForTimeout(3000)
  await expect.poll(() => still(page)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(stage).toHaveAttribute('data-walk-state', 'walk')
  await expect.poll(() => still(page)).toBe(false)
})

test('toy-figure は初めから動きを減らした場合も野原に立つ', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await expect(page.locator('.toy-figure')).toHaveAttribute(
    'data-walk-state',
    'still',
  )
  await expect.poll(() => still(page)).toBe(true)
})

test.describe('toy-figure のタッチ端末', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    devices['iPhone 13']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('toy-figure のタップと縦のスクロールを区別する', async ({
    page,
    context,
  }) => {
    await page.route('**/__toy-touch-host__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div style="height:120px">article</div><iframe title="toy" src="/toy-figure/" style="display:block;width:100%;height:500px;border:0"></iframe><div style="height:2000px"></div></body>',
      }),
    )
    await page.goto('/__toy-touch-host__')
    const frame = page.frameLocator('iframe')
    await expect(frame.locator('.toy-figure')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 15_000 },
    )
    expect(
      await frame
        .locator('.stage')
        .evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe('pan-y')
    await frame.locator('canvas').tap({ position: { x: 300, y: 250 } })
    await expect(frame.locator('.toy-figure')).toHaveAttribute(
      'data-walk-state',
      'look',
      { timeout: 2500 },
    )
    await expect(frame.locator('.toy-figure')).toHaveAttribute(
      'data-walk-state',
      'walk',
      { timeout: 3000 },
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(frame.locator('.toy-figure')).toHaveAttribute(
      'data-walk-state',
      'still',
    )
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 190, y: 450 }],
    })
    for (let i = 1; i <= 10; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 190, y: 450 - i * 20 }],
      })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await expect(frame.locator('.toy-figure')).toHaveAttribute(
      'data-walk-state',
      'still',
    )
  })
})

test('toy-figure は恐竜6体と植物を読み、野原の説明を表示する', async ({
  page,
}) => {
  for (const [name, bytes] of Object.entries(assetBytes))
    expect(
      statSync(
        new URL(`../src/demos/toy-figure/assets/${name}.glb`, import.meta.url),
      ).size,
      `${name}: regenerate asset-bytes.json`,
    ).toBe(bytes)
  const sceneryBytes = Object.entries(assetBytes)
    .filter(([name]) => name !== 'character')
    .reduce((total, [, bytes]) => total + bytes, 0)
  expect(sceneryBytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  await page.setViewportSize({ width: 800, height: 500 })
  await ready(page)
  const assets = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((url) => url.includes('.glb')),
  )
  for (const name of [
    'Trex',
    'Velociraptor',
    'Triceratops-balanced',
    'Parasaurolophus',
    'Stegosaurus-balanced',
    'Apatosaurus-balanced',
    'PalmTree_1',
    'PalmTree_3',
    'Fern_1',
    'Grass_Common_Short',
    'Rock_Medium_1',
    'Rock_Medium_2',
    'Pebble_Round_2',
    'Bush_Common',
    'Grass_Wispy_Short',
    'Grass_Common_Tall',
  ])
    expect(assets.some((url) => url.includes(name))).toBe(true)
  expect(assets.some((url) => /Zebra|Elephant|tree_plateau/.test(url))).toBe(
    false,
  )
  await page.getByRole('button', { name: 'info', exact: true }).click()
  await expect(page.locator('#demo-info')).toContainText('恐竜のいる野原')
  await page.keyboard.press('Escape')
  await expect(page.locator('#demo-info')).toBeHidden()
})

test('toy-figure はバイト数の進捗を表示し、最初の描画で読み込みを終える', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const samples: number[] = []
    Object.assign(window, { __loadingSamples: samples })
    new MutationObserver((changes) => {
      for (const change of changes) {
        if (
          change.type !== 'attributes' ||
          change.attributeName !== 'aria-valuenow'
        )
          continue
        const value = Number(
          (change.target as Element).getAttribute('aria-valuenow'),
        )
        if (samples.at(-1) !== value) samples.push(value)
      }
    }).observe(document, { subtree: true, attributes: true })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: 500_000,
    uploadThroughput: 500_000,
  })
  await page.goto('/toy-figure/')
  const bar = page.getByRole('progressbar', { name: 'now loading' })
  await expect(bar).toBeVisible()
  await expect(page.locator('.loading')).toContainText(/now loading \d+%/)
  await expect(bar).not.toHaveAttribute('aria-live')
  await expect(page.locator('.toy-figure')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 55_000 },
  )
  await expect(page.locator('.loading')).toHaveCount(0)
  const samples = await page.evaluate(
    () =>
      (window as unknown as { __loadingSamples: number[] }).__loadingSamples,
  )
  expect(samples.length).toBeGreaterThan(10)
  expect(samples.at(-1)).toBe(100)
  expect(
    samples.every(
      (n, i) => n >= 0 && n <= 100 && (i === 0 || n >= samples[i - 1]),
    ),
  ).toBe(true)
  expect(samples.some((n) => n > 0 && n < 90)).toBe(true)
  expect(samples.some((n) => n >= 90 && n < 100)).toBe(true)
})

test('toy-figure は GLB の読み込みに失敗したとき案内を残す', async ({
  page,
}) => {
  await page.route('**/*character*.glb', (route) => route.abort())
  await page.goto('/toy-figure/')
  await expect(page.getByRole('alert')).toHaveText(
    'キャラを読み込めませんでした。ページを開き直してください。',
  )
  await expect(page.locator('.toy-figure')).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})
