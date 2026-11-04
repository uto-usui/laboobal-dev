import type { DemoMeta } from './demos'

export const escapeXml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/**
 * added の新しい順。同じ日のものは getDemos の順のまま（sort は安定）。added のないものは後ろに回す。
 * sitemap、RSS、/log/ で同じ並びにする
 */
export const byAdded = (demos: DemoMeta[]) =>
  [...demos].sort((a, b) => (b.added ?? '').localeCompare(a.added ?? ''))

/** added は YYYY-MM もありうる。日のないものは lastmod や pubDate に使わない */
export const isFullDate = (value?: string): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
