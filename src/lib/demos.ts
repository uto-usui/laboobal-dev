import type { AstroComponentFactory } from 'astro/runtime/server/index.js'

export type Batch = 'current' | 'A' | 'B1' | 'B2' | 'F6'
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
  /** テストでマウスをどう動かすか */
  interaction: Interaction
}

export const defineDemo = (meta: DemoMeta) => meta

const BATCHES: Batch[] = ['current', 'A', 'B1', 'B2', 'F6']
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
const components = import.meta.glob<AstroComponentFactory>(
  '../demos/*/Demo.astro',
  { import: 'default' },
)

const folderOf = (path: string) => path.split('/').at(-2)!

/**
 * meta.ts を集めて確かめる。決まりに合わないものがあればビルドを落とす（docs/plan.md の 5 章）
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
  const seen = new Set<string>()
  const noteFolders = new Set(Object.keys(notes).map(folderOf))
  const componentFolders = new Set(Object.keys(components).map(folderOf))

  const list = Object.entries(metas).map(([path, meta]) => {
    const folder = folderOf(path)
    const where = `src/demos/${folder}/meta.ts`
    if (!meta) {
      errors.push(`${where}: defineDemo(...) を default export していない`)
      return meta
    }
    for (const key of ['slug', 'title', 'category', 'origin'] as const) {
      if (!meta[key]) errors.push(`${where}: ${key} がない`)
    }
    if (!Array.isArray(meta.credits)) errors.push(`${where}: credits がない`)
    if (typeof meta.webgl !== 'boolean') errors.push(`${where}: webgl がない`)
    if (!BATCHES.includes(meta.batch))
      errors.push(`${where}: batch が ${BATCHES.join(' | ')} のどれでもない`)
    if (!INTERACTIONS.includes(meta.interaction))
      errors.push(
        `${where}: interaction が ${INTERACTIONS.join(' | ')} のどれでもない`,
      )
    if (meta.slug !== folder)
      errors.push(`${where}: slug "${meta.slug}" がフォルダ名と違う`)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folder))
      errors.push(`${where}: フォルダ名が小文字のケバブケースでない`)
    if (seen.has(meta.slug)) errors.push(`${where}: slug が重なっている`)
    seen.add(meta.slug)
    if (!noteFolders.has(folder))
      errors.push(`src/demos/${folder}/notes.md がない`)
    if (!componentFolders.has(folder))
      errors.push(`src/demos/${folder}/Demo.astro がない`)
    return meta
  })

  for (const folder of new Set([...noteFolders, ...componentFolders])) {
    if (!Object.keys(metas).some((path) => folderOf(path) === folder))
      errors.push(`src/demos/${folder}/meta.ts がない`)
  }

  if (errors.length > 0) {
    throw new Error(
      `デモの決まりに合わないものがある:\n- ${errors.join('\n- ')}`,
    )
  }
  return list.sort(
    (a, b) =>
      BATCHES.indexOf(a.batch) - BATCHES.indexOf(b.batch) ||
      a.slug.localeCompare(b.slug),
  )
}

let cache: Promise<DemoMeta[]> | undefined

/** 全デモの一覧。batch の順、その中は slug の順 */
export const getDemos = () => (cache ??= collect())

export const loadDemoComponent = (slug: string) =>
  components[`../demos/${slug}/Demo.astro`]()
