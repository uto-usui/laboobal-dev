import type { APIRoute } from 'astro'
import { getDemos } from '../lib/demos'
import { byAdded, escapeXml, isFullDate } from '../lib/feeds'

const LIMIT = 30

export const GET: APIRoute = async ({ site }) => {
  const demos = byAdded(await getDemos())
    .filter((demo) => isFullDate(demo.added))
    .slice(0, LIMIT)
  const href = (path: string) => escapeXml(new URL(path, site).href)
  const items = demos
    .map((demo) => {
      const link = href(`/${demo.slug}/`)
      const description = demo.description
        ? `\n      <description>${escapeXml(demo.description)}</description>`
        : ''
      // added は日本の日付。時刻はないので、その日の 0 時（日本時間）にする
      const pubDate = new Date(`${demo.added}T00:00:00+09:00`).toUTCString()
      return `    <item>
      <title>${escapeXml(demo.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>${description}
    </item>`
    })
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>labobal.dev</title>
    <link>${href('/')}</link>
    <description>動きの実験のデモ</description>
    <language>ja</language>
    <atom:link href="${href('/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`
  return new Response(xml)
}
