import { expect, type Page, test } from '@playwright/test'
import { compareBy, type SortKey } from '../src/lib/top-list'
import { type DemoText, loadDemos, loadGroups } from './meta'

const demos = loadDemos()
const groups = loadGroups()

// 一覧の行。index.astro と同じく、組は 1 行にまとめ、並べ替えは組の名前と、組の中でいちばん新しい created で決める
interface Row {
  key: string
  created?: string
  members: DemoText[]
}
const grouped = new Set(groups.flatMap((group) => group.variants))
const rows: Row[] = [
  ...demos
    .filter((demo) => !grouped.has(demo.slug))
    .map((demo) => ({
      key: demo.slug,
      created: demo.created,
      members: [demo],
    })),
  ...groups.map((group) => {
    const members = group.variants.map(
      (slug) => demos.find((demo) => demo.slug === slug)!,
    )
    return {
      key: group.name,
      created: members
        .map((demo) => demo.created ?? '')
        .toSorted()
        .at(-1),
      members,
    }
  }),
]
const keysBy = (sort: SortKey, list = rows) =>
  list
    .toSorted((a, b) =>
      compareBy(sort)(
        { slug: a.key, created: a.created },
        { slug: b.key, created: b.created },
      ),
    )
    .map((row) => row.key)
const byNew = keysBy('new')
const byName = keysBy('name')
const picks = demos.filter((demo) => demo.pick).map((demo) => demo.slug)

/** 出ている行の名前。組の行は data-key に組の名前、ほかは slug */
const shownKeys = (page: Page) =>
  page
    .locator('.list .item:not([hidden])')
    .evaluateAll((items) =>
      items.map(
        (item) =>
          (item as HTMLElement).dataset.key ??
          (item as HTMLElement).dataset.slug,
      ),
    )

/** 一覧に出ているデモの slug。組の行は、出ているバリエーションのリンクの分 */
const shownDemos = (page: Page) =>
  page.locator('.list .item:not([hidden])').evaluateAll((items) =>
    items
      .flatMap((item) => {
        const variants = item.querySelectorAll<HTMLElement>(
          '.variant:not([hidden]) .variant-link',
        )
        return item.querySelector('.variant')
          ? [...variants].map((link) => link.dataset.slug)
          : [(item as HTMLElement).dataset.slug]
      })
      .toSorted(),
  )

test('初期は新しい順で、名前順に替えると並びと URL が変わる', async ({
  page,
}) => {
  await page.goto('/')
  expect(await shownKeys(page)).toEqual(byNew)
  await expect(page.locator('.sorts [data-sort="new"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.locator('.sorts [data-sort="name"]').click()
  await expect.poll(() => shownKeys(page)).toEqual(byName)
  expect(new URL(page.url()).searchParams.get('sort')).toBe('name')

  // 初期の値に戻したら、URL から消える
  await page.locator('.sorts [data-sort="new"]').click()
  await expect.poll(() => shownKeys(page)).toEqual(byNew)
  expect(new URL(page.url()).search).toBe('')
})

test('JS がなくても新しい順で並ぶ', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  expect(await shownKeys(page)).toEqual(byNew)
  await context.close()
})

test('URL の ?filter=&sort= から同じ並びに戻る', async ({ page }) => {
  await page.goto('/?filter=hover&sort=name')
  const expected = keysBy(
    'name',
    rows.filter((row) => row.members.some((d) => d.interaction === 'hover')),
  )
  await expect.poll(() => shownKeys(page)).toEqual(expected)
  await expect(page.locator('.filters [data-filter="hover"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.sorts [data-sort="name"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('絞り込みの数はデモの本数で、押すとその本数のデモが出る', async ({
  page,
}) => {
  await page.goto('/')
  for (const button of await page.locator('.filters button').all()) {
    const count = Number(await button.locator('sup').textContent())
    await button.click()
    const filter = await button.getAttribute('data-filter')
    const expected = demos
      .filter((demo) =>
        filter === 'all'
          ? true
          : filter === 'pick'
            ? demo.pick
            : demo.interaction === filter,
      )
      .map((demo) => demo.slug)
      .toSorted()
    await expect.poll(() => shownDemos(page)).toEqual(expected)
    expect(count, `${filter} の数`).toBe(expected.length)
  }
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
  await expect.poll(() => shownDemos(page)).toEqual(picks.toSorted())
  expect(new URL(page.url()).searchParams.get('filter')).toBe('pick')
})

test('組は 1 行にまとまり、名前の下に各バリエーションへのリンクが並ぶ', async ({
  page,
}) => {
  test.skip(groups.length === 0, '組がまだない')
  await page.goto('/')
  for (const group of groups) {
    const row = page.locator(`.list .item[data-key="${group.name}"]`)
    await expect(row).toHaveCount(1)
    await expect(row.locator('.link')).toHaveAttribute(
      'href',
      `/${group.default}/`,
    )
    expect(
      await row
        .locator('.variant-link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toEqual(group.variants.map((slug) => `/${slug}/`))
    // バリエーションは組の行にだけ出る
    for (const slug of group.variants)
      await expect(
        page.locator(`.list .item:not([data-key])[data-slug="${slug}"]`),
      ).toHaveCount(0)
  }
})

test('絞り込んだときは、組の名前から絞り込みに合うバリエーションが開く', async ({
  page,
}) => {
  test.skip(groups.length === 0, '組がまだない')
  await page.goto('/')
  const filters = await page
    .locator('.filters [data-filter]')
    .evaluateAll((buttons) =>
      buttons.map((button) => (button as HTMLElement).dataset.filter!),
    )
  for (const filter of [...filters.filter((f) => f !== 'all'), 'all']) {
    await page.locator(`.filters [data-filter="${filter}"]`).click()
    for (const group of groups) {
      const matching = group.variants.filter((slug) => {
        const demo = demos.find((d) => d.slug === slug)!
        return filter === 'all'
          ? true
          : filter === 'pick'
            ? demo.pick
            : demo.interaction === filter
      })
      if (matching.length === 0) continue
      // 初めに開くもの（default）が合えばそのまま。合わなければ、合う最初のもの
      const slug = matching.includes(group.default)
        ? group.default
        : matching[0]
      const link = page.locator(`.list .item[data-key="${group.name}"] .link`)
      await expect(link, `${filter} の ${group.name}`).toHaveAttribute(
        'href',
        `/${slug}/`,
      )
      await expect(link).toHaveAttribute('data-slug', slug)
    }
  }
})

test('一覧とピックアップのリンクは /<slug>/ へ行く', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page
    .locator('.list .link, .list .variant-link, .picks .pick-link')
    .evaluateAll((links) =>
      links.map((link) => [
        (link as HTMLElement).dataset.slug,
        link.getAttribute('href'),
      ]),
    )
  expect(hrefs.length).toBe(rows.length + grouped.size + picks.length)
  for (const [slug, href] of hrefs) expect(href).toBe(`/${slug}/`)

  const first = picks[0] ?? demos[0].slug
  await page
    .locator(
      picks.length > 0
        ? `.picks .pick-link[data-slug="${first}"]`
        : `.list .link[data-slug="${first}"]`,
    )
    .click()
  await page.waitForURL(`**/${first}/`)
})
