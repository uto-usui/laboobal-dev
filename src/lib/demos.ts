/** 'new' は移植ではなく、ここで新しく作ったデモ */
export type Batch = 'current' | 'A' | 'B1' | 'B2' | 'F6' | 'new'
export type Interaction = 'drag' | 'hover' | 'scroll' | 'click' | 'none'

export interface DemoMeta {
  /** フォルダ名と同じ。URL になる */
  slug: string
  title: string
  /** トップの一覧での分け方 */
  category: string
  batch: Batch
  /** lab の記事の URL。記事が出るまでは空 */
  article?: string
  /** もとのデモの場所（laboobal/docs/... や laboobal-dev の pages/...、jsfiddle の URL） */
  origin: string
  /** ほかの人のコードや素材をもとにしたとき */
  credits: { label: string; url: string }[]
  webgl: boolean
  /** WebGPU で描く。対応していないブラウザでは、代わりに一行の案内を出す */
  webgpu?: boolean
  /** テストでマウスをどう動かすか */
  interaction: Interaction
}

export const defineDemo = (meta: DemoMeta) => meta

const BATCHES: Batch[] = ['current', 'A', 'B1', 'B2', 'F6', 'new']
const INTERACTIONS: Interaction[] = ['drag', 'hover', 'scroll', 'click', 'none']

// meta.ts はこのファイルの defineDemo を import するので、eager にすると循環する。読むのは collect の中で
const metaLoaders = import.meta.glob<DemoMeta>('../demos/*/meta.ts', {
  import: 'default',
})
// 中身は読まない。あるかどうかだけを見る
const notes = import.meta.glob('../demos/*/notes.md', {
  query: '?raw',
  import: 'default',
})
// Demo.astro も中身は読まない。部品として glob すると、読み込まなくても全デモの CSS がこのファイルを使うページ（トップも）に付く
const components = import.meta.glob('../demos/*/Demo.astro', {
  query: '?raw',
  import: 'default',
})
// デモのページ。デモごとに src/pages/<slug>.astro を置き、その Demo.astro を静的に import する。
// 1 つの動的ルートから引くと、どのページにも全デモの CSS が付く。中身は、別のデモを読んでいないかを見るためだけに読む
const pages = import.meta.glob<string>('../pages/*.astro', {
  query: '?raw',
  import: 'default',
})
/** src/pages の .astro のうち、デモのページでないもの */
const NON_DEMO_PAGES = ['index']

const pageTemplate = (slug: string) => `---
import DemoLayout from '../layouts/DemoLayout.astro'
import Demo from '../demos/${slug}/Demo.astro'
import meta from '../demos/${slug}/meta'
---

<DemoLayout demo={meta}>
  <Demo />
</DemoLayout>`

const folderOf = (path: string) => path.split('/').at(-2)!
const pageSlugOf = (path: string) => path.match(/([^/]+)\.astro$/)![1]

/**
 * meta.ts を集めて確かめる。決まりに合わないものがあればビルドを落とす（docs/plan.md の 5 章）。
 * 開発サーバーでは、作りかけのデモがあっても全ページが 500 にならないよう、そのデモだけ外して警告にする
 */
const collect = async () => {
  const metas = Object.fromEntries(
    await Promise.all(
      Object.entries(metaLoaders).map(
        async ([path, load]) => [path, await load()] as const,
      ),
    ),
  )
  const errors: string[] = []
  const broken = new Set<string>()
  const fail = (folder: string, message: string) => {
    errors.push(message)
    broken.add(folder)
  }
  const seen = new Set<string>()
  const noteFolders = new Set(Object.keys(notes).map(folderOf))
  const componentFolders = new Set(Object.keys(components).map(folderOf))
  const pageSources = new Map(
    await Promise.all(
      Object.entries(pages)
        .filter(([path]) => !NON_DEMO_PAGES.includes(pageSlugOf(path)))
        .map(async ([path, load]) => [pageSlugOf(path), await load()] as const),
    ),
  )

  const list = Object.entries(metas).map(([path, meta]) => {
    const folder = folderOf(path)
    const where = `src/demos/${folder}/meta.ts`
    if (!meta) {
      fail(folder, `${where}: defineDemo(...) を default export していない`)
      return meta
    }
    for (const key of ['slug', 'title', 'category', 'origin'] as const) {
      if (!meta[key]) fail(folder, `${where}: ${key} がない`)
    }
    if (!Array.isArray(meta.credits)) fail(folder, `${where}: credits がない`)
    if (typeof meta.webgl !== 'boolean') fail(folder, `${where}: webgl がない`)
    if (!BATCHES.includes(meta.batch))
      fail(folder, `${where}: batch が ${BATCHES.join(' | ')} のどれでもない`)
    if (!INTERACTIONS.includes(meta.interaction))
      fail(
        folder,
        `${where}: interaction が ${INTERACTIONS.join(' | ')} のどれでもない`,
      )
    if (meta.slug !== folder)
      fail(folder, `${where}: slug "${meta.slug}" がフォルダ名と違う`)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folder))
      fail(folder, `${where}: フォルダ名が小文字のケバブケースでない`)
    if (seen.has(meta.slug)) fail(folder, `${where}: slug が重なっている`)
    seen.add(meta.slug)
    if (!noteFolders.has(folder))
      fail(folder, `src/demos/${folder}/notes.md がない`)
    if (!componentFolders.has(folder))
      fail(folder, `src/demos/${folder}/Demo.astro がない`)
    const page = pageSources.get(folder)
    const pageRefs = new Set(
      [...(page ?? '').matchAll(/\.\.\/demos\/([^/'"]+)\//g)].map((m) => m[1]),
    )
    if (page === undefined)
      fail(
        folder,
        `src/pages/${folder}.astro がない。次の中身で置く:\n${pageTemplate(folder)}`,
      )
    else if (pageRefs.size !== 1 || !pageRefs.has(folder))
      fail(
        folder,
        `src/pages/${folder}.astro が src/demos/${folder}/ の Demo.astro と meta を読んでいない。次の中身にする:\n${pageTemplate(folder)}`,
      )
    return meta
  })

  for (const folder of new Set([...noteFolders, ...componentFolders])) {
    if (!Object.keys(metas).some((path) => folderOf(path) === folder))
      fail(folder, `src/demos/${folder}/meta.ts がない`)
  }
  for (const slug of pageSources.keys()) {
    if (!Object.keys(metas).some((path) => folderOf(path) === slug))
      fail(
        slug,
        `src/pages/${slug}.astro に合うデモがない（src/demos/${slug}/meta.ts がない）`,
      )
  }

  if (errors.length > 0) {
    const message = `デモの決まりに合わないものがある:\n- ${errors.join('\n- ')}`
    if (!import.meta.env.DEV) throw new Error(message)
    console.warn(`${message}\n（開発サーバーなので、このデモを外して続ける）`)
  }
  const folders = Object.keys(metas).map(folderOf)
  return list
    .filter((_, i) => !broken.has(folders[i]))
    .sort(
      (a, b) =>
        BATCHES.indexOf(a.batch) - BATCHES.indexOf(b.batch) ||
        a.slug.localeCompare(b.slug),
    )
}

let cache: Promise<DemoMeta[]> | undefined

/** 全デモの一覧。batch の順、その中は slug の順。開発中は meta.ts の書き換えを拾うため毎回集め直す */
export const getDemos = () =>
  import.meta.env.DEV ? collect() : (cache ??= collect())
