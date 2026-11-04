import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { compareBy } from '../src/lib/top-list'

interface Demo {
  slug: string
  created?: string
  interaction: string
  pick: boolean
}

// demos.spec.ts と同じく meta.ts を文字として読む（Playwright は import.meta.glob を通せない）
const demos: Demo[] = readdirSync('src/demos', { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(`src/demos/${entry.name}/meta.ts`),
  )
  .map((entry) => {
    const source = readFileSync(`src/demos/${entry.name}/meta.ts`, 'utf8')
    const string = (key: string) =>
      source.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1]
    return {
      slug: entry.name,
      created: string('created'),
      interaction: string('interaction') ?? 'none',
      pick: /\bpick:\s*true\b/.test(source),
    }
  })

const byNew = demos.toSorted(compareBy('new')).map((demo) => demo.slug)
const byName = demos.toSorted(compareBy('name')).map((demo) => demo.slug)
const picks = demos.filter((demo) => demo.pick).map((demo) => demo.slug)

const shownSlugs = (page: Page) =>
  page
    .locator('.list .item:not([hidden])')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.slug),
    )

test('初期は新しい順で、名前順に替えると並びと URL が変わる', async ({
  page,
}) => {
  await page.goto('/')
  expect(await shownSlugs(page)).toEqual(byNew)
  await expect(page.locator('.sorts [data-sort="new"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.locator('.sorts [data-sort="name"]').click()
  await expect.poll(() => shownSlugs(page)).toEqual(byName)
  expect(new URL(page.url()).searchParams.get('sort')).toBe('name')

  // 初期の値に戻したら、URL から消える
  await page.locator('.sorts [data-sort="new"]').click()
  await expect.poll(() => shownSlugs(page)).toEqual(byNew)
  expect(new URL(page.url()).search).toBe('')
})

test('JS がなくても新しい順で並ぶ', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  expect(await shownSlugs(page)).toEqual(byNew)
  await context.close()
})

test('URL の ?filter=&sort= から同じ並びに戻る', async ({ page }) => {
  await page.goto('/?filter=hover&sort=name')
  const expected = byName.filter(
    (slug) => demos.find((demo) => demo.slug === slug)!.interaction === 'hover',
  )
  await expect.poll(() => shownSlugs(page)).toEqual(expected)
  await expect(page.locator('.filters [data-filter="hover"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.sorts [data-sort="name"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('ピックアップに pick のデモが並び、pick! で絞れる', async ({ page }) => {
  test.skip(picks.length === 0, 'pick: true のデモがまだない')
  await page.goto('/')
  const pickSlugs = await page
    .locator('.picks .pick-link')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLElement).dataset.slug),
    )
  expect(pickSlugs.toSorted()).toEqual(picks.toSorted())

  await page.locator('.filters [data-filter="pick"]').click()
  await expect
    .poll(async () => (await shownSlugs(page)).toSorted())
    .toEqual(picks.toSorted())
  expect(new URL(page.url()).searchParams.get('filter')).toBe('pick')
})

test('一覧とピックアップのリンクは /<slug>/ へ行く', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page
    .locator('.list .link, .picks .pick-link')
    .evaluateAll((links) =>
      links.map((link) => [
        (link as HTMLElement).dataset.slug,
        link.getAttribute('href'),
      ]),
    )
  expect(hrefs.length).toBe(demos.length + picks.length)
  for (const [slug, href] of hrefs) expect(href).toBe(`/${slug}/`)

  const first = picks[0] ?? byNew[0]
  await page
    .locator(
      picks.length > 0
        ? `.picks .pick-link[data-slug="${first}"]`
        : `.list .link[data-slug="${first}"]`,
    )
    .click()
  await page.waitForURL(`**/${first}/`)
})
