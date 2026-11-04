import type { APIRoute } from 'astro'
import { getDemos } from '../lib/demos'
import { byAdded, escapeXml, isFullDate } from '../lib/feeds'

export const GET: APIRoute = async ({ site }) => {
  const demos = byAdded(await getDemos())
  // トップと /log/ は、いちばん新しいデモを足した日に変わる
  const latest = demos.find((demo) => isFullDate(demo.added))?.added
  const entries = [
    { path: '/', lastmod: latest },
    { path: '/log/', lastmod: latest },
    ...demos.map((demo) => ({
      path: `/${demo.slug}/`,
      lastmod: isFullDate(demo.added) ? demo.added : undefined,
    })),
  ]
  const urls = entries
    .map(
      ({ path, lastmod }) =>
        `  <url><loc>${escapeXml(new URL(path, site).href)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  return new Response(xml)
}
