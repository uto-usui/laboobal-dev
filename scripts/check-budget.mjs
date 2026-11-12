// dist/ の大きさを測り、上限を超えたものがあれば落とす。`pnpm build` のあとに `pnpm check:budget`。
// `--report` を付けると、全デモの表を出す（上限を見直すときに使う）。
// 測るもの:
// - トップと各デモのページで、開いた直後に読む HTML、CSS、JS の合計（brotli で圧縮した大きさ）。
//   JS は <script src> から静的な import をたどった全部。import() で後から読むものと、<template> の中の script
//   （組の切り替えのしくみ。設定のボタンを押したときに読む）は入れない
// - トップで読みうるフォント（woff2）の合計。unicode-range がトップの HTML の文字に当たる @font-face だけを数える
// - public/previews の 1 ファイルあたりの大きさ（拡張子ごと）
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// 上限。単位は KB（1000 バイト）。2026-11-04 に、そのとき測った値に 2〜3 割の余裕を足して決めた。
// コメントの数字は、2026-11-04 にデモを 21 本下げたあとのビルドで測り直した値（`--report` で見られる）。
// 上げるときは、何が増えたのかをコミットに書く
const BUDGET = {
  // 7.3 → 12.7（並び替え・ピックアップ・スマホの主役・板の遷移・長い slug で 3.5、一覧のデモ 35 本で 1.7）→ 12.9（組の行）→ 12.0（デモを 21 本下げた）
  top: 15,
  // 33.1（montserrat-ascii-400、montserrat-latin-700、molle-mark の 3 個）
  topFonts: 42,
  // デモは、読むライブラリで 3 つに分ける。gsap と three の本体は別のチャンクになるので、その名前で見分ける
  demo: {
    // ライブラリなし。最大 7.3（processing-js-circle-at-the-mouse-position。組の切り替えで 1.3 増えた）
    plain: 8,
    // gsap を読む。最大 31.7（tweenmax-easing-of-scroll-parallax）
    gsap: 36,
    // three を読む。最大 144.1（distortion-slider-b）
    three: 170,
  },
  // 上の分け方に収まらないデモ。ライブラリがデモのチャンクに入っているもの
  demoOverride: {
    // ScrollTrigger。45.3
    'tweenmax-visual-range-animation-class': 52,
    // MotionPathPlugin。37.8
    'gsap-motion-path': 44,
    // lil-gui と WebGPU のシェーダー。24.4
    'particle-photo': 27,
    // locomotive-scroll。15.1
    scrollmanager: 17,
    // HTML-in-Canvas の作例。three を使わず、WebGL とシェーダーのコードをデモのチャンクにそのまま入れている（2026-11-07）
    // 20.7（絵巻 8 枚の HTML と SVG が大きい）
    'html-emaki': 25,
    // 17.2
    'html-mizu-mikuji': 21,
    // 16.4
    'html-takiage': 20,
    // 8.7
    'html-cloth': 11,
    // 11.2（2026-11-12）
    'html-sticker': 14,
  },
  // 1 ファイルの最大。jpg 36.4、webm 324.1、webp 25.8
  previews: { jpg: 45, webm: 400, webp: 40 },
}

const DIST = 'dist'
const report = process.argv.includes('--report')

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html がない。先に pnpm build をする')
  process.exit(1)
}

const kb = (bytes) => (bytes / 1000).toFixed(1)
const cache = new Map()
/** dist の中のファイルの大きさ（生、gzip、brotli）。同じファイルは 1 回だけ圧縮する */
const sizeOf = (path) => {
  if (!cache.has(path)) {
    const body = readFileSync(path)
    cache.set(path, {
      raw: body.length,
      gzip: gzipSync(body, { level: 9 }).length,
      br: brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    })
  }
  return cache.get(path)
}

const toFile = (url, from) => {
  const path = url.startsWith('/')
    ? url
    : posix.join(posix.dirname(from.slice(DIST.length)), url)
  return join(DIST, path.split(/[?#]/)[0])
}

/** JS から静的な import をたどる。`import("...")` は後から読むので入れない */
const collectJs = (file, seen) => {
  if (seen.has(file) || !existsSync(file)) return
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  const specs = [
    ...source.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+\.js)["']/g),
  ].map((m) => m[1])
  for (const spec of specs) collectJs(toFile(spec, file), seen)
}

/** ページを開いた直後に読むファイル（HTML 自身、CSS、JS） */
const initialFiles = (html) => {
  const source = readFileSync(html, 'utf8').replace(
    /<template[\s\S]*?<\/template>/g,
    '',
  )
  const files = new Set([html])
  for (const m of source.matchAll(
    /<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>/g,
  )) {
    const href = m[0].match(/href="([^"]+)"/)?.[1]
    if (href && !href.startsWith('http')) files.add(toFile(href, html))
  }
  const js = new Set()
  for (const m of source.matchAll(/<script[^>]+src="([^"]+)"/g))
    if (!m[1].startsWith('http')) collectJs(toFile(m[1], html), js)
  for (const file of js) files.add(file)
  return [...files]
}

const measurePage = (html) => {
  const files = initialFiles(html).map((file) => ({ file, ...sizeOf(file) }))
  const sum = (key) => files.reduce((total, f) => total + f[key], 0)
  return { files, raw: sum('raw'), gzip: sum('gzip'), br: sum('br') }
}

const failures = []
/** 上限を超えたら、中身の大きい順の一覧を付けて記録する。何が増えたのかを見るため */
const check = (label, value, limit, files = []) => {
  if (value <= limit * 1000) return
  failures.push(
    [
      `${label}: ${kb(value)} KB（上限 ${limit} KB、${kb(value - limit * 1000)} KB 超えている）`,
      ...files
        .toSorted((a, b) => b.size - a.size)
        .slice(0, 8)
        .map((f) => `    ${kb(f.size).padStart(7)} KB  ${f.name}`),
    ].join('\n'),
  )
}
const listOf = (page) =>
  page.files.map((f) => ({ name: f.file.slice(DIST.length), size: f.br }))

// トップ
const top = measurePage(join(DIST, 'index.html'))
check('トップの HTML+CSS+JS（brotli）', top.br, BUDGET.top, listOf(top))

const topHtml = readFileSync(join(DIST, 'index.html'), 'utf8')
const topCss = top.files
  .filter((f) => f.file.endsWith('.css'))
  .map((f) => readFileSync(f.file, 'utf8'))
  .concat(topHtml)
  .join('\n')
// HTML の文字（タグを除く）。script で後から足す文字は見ていない
const topChars = new Set(
  [...topHtml.replace(/<(script|style)[\s\S]*?<\/\1>|<[^>]+>/g, '')].map((c) =>
    c.codePointAt(0),
  ),
)
/** unicode-range（U+41、U+30-39、U+4??）がページの文字に当たるか。書いていなければ当たるとみなす */
const usesRange = (range) =>
  !range ||
  range.split(',').some((part) => {
    const body = part.trim().replace(/^U\+/i, '')
    const [from, to] = body.includes('-')
      ? body.split('-').map((v) => parseInt(v, 16))
      : [body.replace(/\?/g, '0'), body.replace(/\?/g, 'F')].map((v) =>
          parseInt(v, 16),
        )
    for (const c of topChars) if (c >= from && c <= to) return true
    return false
  })
const fonts = [
  ...new Set(
    [...topCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
      .filter((m) => usesRange(m[1].match(/unicode-range:([^;}]+)/)?.[1]))
      .flatMap((m) =>
        [...m[1].matchAll(/url\(["']?([^)"']+\.woff2)["']?\)/g)].map((u) =>
          toFile(u[1], join(DIST, 'index.html')),
        ),
      ),
  ),
].map((file) => ({ name: file.slice(DIST.length), size: statSync(file).size }))
const fontTotal = fonts.reduce((total, f) => total + f.size, 0)
check('トップのフォント（woff2 の合計）', fontTotal, BUDGET.topFonts, fonts)

// デモのページ
const demoPages = readdirSync('src/demos')
  .filter((slug) => existsSync(join(DIST, slug, 'index.html')))
  .map((slug) => {
    const page = measurePage(join(DIST, slug, 'index.html'))
    const has = (name) =>
      page.files.some((f) =>
        new RegExp(`/${name}\\.[\\w.-]+\\.js$`).test(f.file),
      )
    const tier = has('three') ? 'three' : has('gsap') ? 'gsap' : 'plain'
    return { slug, tier, ...page }
  })

for (const page of demoPages) {
  const limit = BUDGET.demoOverride[page.slug] ?? BUDGET.demo[page.tier]
  check(
    `/${page.slug}/ の HTML+CSS+JS（brotli、${page.tier}）`,
    page.br,
    limit,
    listOf(page),
  )
}

// previews
const previewDir = join(DIST, 'previews')
const previews = existsSync(previewDir)
  ? readdirSync(previewDir).map((name) => ({
      name,
      ext: name.split('.').pop(),
      size: statSync(join(previewDir, name)).size,
    }))
  : []
for (const p of previews) {
  const limit = BUDGET.previews[p.ext]
  if (limit) check(`previews/${p.name}`, p.size, limit)
}

// 表示
const tiers = Object.keys(BUDGET.demo).map((tier) => {
  const list = demoPages.filter(
    (p) => p.tier === tier && !(p.slug in BUDGET.demoOverride),
  )
  const max = list.toSorted((a, b) => b.br - a.br)[0]
  return max
    ? `デモ（${tier}）${list.length} 本: 最大 ${kb(max.br)} KB（${max.slug}）/ 上限 ${BUDGET.demo[tier]}`
    : `デモ（${tier}）0 本`
})
console.log(
  [
    `トップ: ${kb(top.br)} KB（gzip ${kb(top.gzip)}、生 ${kb(top.raw)}）/ 上限 ${BUDGET.top}`,
    `トップのフォント: ${kb(fontTotal)} KB（${fonts.length} 個）/ 上限 ${BUDGET.topFonts}`,
    ...tiers,
    `デモ（例外）${Object.keys(BUDGET.demoOverride).length} 本: 個別の上限`,
    ...Object.keys(BUDGET.previews).map((ext) => {
      const list = previews.filter((p) => p.ext === ext)
      const max = Math.max(0, ...list.map((p) => p.size))
      return `previews の ${ext} ${list.length} 個: 最大 ${kb(max)} KB / 上限 ${BUDGET.previews[ext]}`
    }),
  ].join('\n'),
)

if (report) {
  console.log(`\nフォント: ${fonts.map((f) => f.name).join('、')}`)
  console.log('\nslug, brotli KB, gzip KB, 生 KB, 分け方')
  for (const p of demoPages.toSorted((a, b) => b.br - a.br))
    console.log(
      `${p.slug}, ${kb(p.br)}, ${kb(p.gzip)}, ${kb(p.raw)}, ${p.tier}`,
    )
}

if (failures.length) {
  console.error(
    `\n上限を超えたもの（${failures.length} 件）。中身は大きい順:\n\n${failures.join('\n\n')}\n\n` +
      '上限は scripts/check-budget.mjs の BUDGET にある。増えた理由に納得できるときだけ上げる',
  )
  process.exit(1)
}
