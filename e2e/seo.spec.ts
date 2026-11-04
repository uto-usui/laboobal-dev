import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// demos.spec.ts と同じく、一覧は src/demos から読む（Playwright は Vite を通らない）
const slugs = readdirSync('src/demos', { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(`src/demos/${entry.name}/meta.ts`),
  )
  .map((entry) => entry.name)
// added がまだどのデモにも入っていないうちは、RSS の項目は空になる
const hasAdded = slugs.some((slug) =>
  /\badded:\s*'\d{4}-\d{2}-\d{2}'/.test(
    readFileSync(`src/demos/${slug}/meta.ts`, 'utf8'),
  ),
)

const meta = (page: Page, key: string) =>
  page
    .locator(`meta[property="${key}"], meta[name="${key}"]`)
    .getAttribute('content')

/** ブラウザの DOMParser で XML として読めるかを見る。読めなければ parsererror の中身を返す */
const parseXml = (page: Page, xml: string, selector: string) =>
  page.evaluate(
    ([text, sel]) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      const error = doc.querySelector('parsererror')
      return {
        error: error?.textContent ?? null,
        values: [...doc.querySelectorAll(sel)].map((el) => el.textContent),
      }
    },
    [xml, selector] as const,
  )

test('トップの OGP', async ({ page }) => {
  await page.goto('/')
  expect(await meta(page, 'og:title')).toBe('labobal.dev')
  expect(await meta(page, 'og:url')).toBe('https://labobal.dev/')
  expect(await meta(page, 'og:type')).toBe('website')
  expect(await meta(page, 'og:image')).toBe('https://labobal.dev/og.png')
  expect(await meta(page, 'og:image:width')).toBe('1200')
  expect(await meta(page, 'og:image:height')).toBe('630')
  expect(await meta(page, 'twitter:card')).toBe('summary_large_image')
  expect(await meta(page, 'og:description')).toBeTruthy()
  await expect(
    page.locator('link[rel="alternate"][type="application/rss+xml"]'),
  ).toHaveAttribute('href', 'https://labobal.dev/rss.xml')
  // og:image がちゃんと配られているか
  expect((await page.request.get('/og.png')).status()).toBe(200)
})

test('デモのページの OGP', async ({ page }) => {
  const slug = slugs[0]
  await page.goto(`/${slug}/`)
  expect(await meta(page, 'og:url')).toBe(`https://labobal.dev/${slug}/`)
  expect(await meta(page, 'og:type')).toBe('article')
  expect(await meta(page, 'og:image')).toBe(
    `https://labobal.dev/previews/${slug}.jpg`,
  )
  expect(await meta(page, 'og:image:width')).toBe('480')
  expect(await meta(page, 'og:image:height')).toBe('300')
  expect(await meta(page, 'og:title')).toContain('labobal.dev')
  expect((await page.request.get(`/previews/${slug}.jpg`)).status()).toBe(200)
})

test('sitemap に全デモが並ぶ', async ({ page }) => {
  const response = await page.request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const { error, values } = await parseXml(page, await response.text(), 'loc')
  expect(error).toBeNull()
  expect(values).toContain('https://labobal.dev/')
  expect(values).toContain('https://labobal.dev/log/')
  for (const slug of slugs)
    expect(values).toContain(`https://labobal.dev/${slug}/`)
})

test('RSS が XML として読める', async ({ page }) => {
  const response = await page.request.get('/rss.xml')
  expect(response.status()).toBe(200)
  const { error, values } = await parseXml(
    page,
    await response.text(),
    'item > link',
  )
  expect(error).toBeNull()
  if (hasAdded) expect(values.length).toBeGreaterThan(0)
  for (const link of values)
    expect(slugs.map((slug) => `https://labobal.dev/${slug}/`)).toContain(link)
})

test('robots.txt が sitemap を指す', async ({ page }) => {
  const text = await (await page.request.get('/robots.txt')).text()
  expect(text).toContain('Sitemap: https://labobal.dev/sitemap.xml')
})

test('/log/ に全デモが並ぶ', async ({ page }) => {
  await page.goto('/log/')
  for (const slug of slugs)
    await expect(page.locator(`a[href="/${slug}/"]`)).toHaveCount(1)
})

test('ないページは 404 を返し、トップへのリンクを出す', async ({ page }) => {
  const response = await page.goto('/no-such-demo/')
  expect(response?.status()).toBe(404)
  await expect(page.locator('h1')).toHaveText('404')
  await expect(page.locator('a[href="/"]')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex',
  )
})
