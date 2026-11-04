/** 'new' は移植ではなく、ここで新しく作ったデモ */
export type Batch = 'current' | 'A' | 'B1' | 'B2' | 'F6' | 'new'
export type Interaction = 'drag' | 'hover' | 'scroll' | 'click' | 'none'

/**
 * tags に使える言葉。何を見せるデモか。増やすときはここに足す
 * - text 文字 / image 写真や絵 / video 動画
 * - scroll スクロール / parallax 視差 / cursor マウスの位置 / drag 引っぱる / hover マウスを乗せる
 * - noise ノイズ / particles たくさんの粒 / 3d 奥行き / shape 形が変わる / physics ばね・摩擦・衝突 / random 乱数
 * - trigonometry sin・cos で動かす
 * - slider 写真の切り替え / distortion ゆがみ / reveal 現れ方
 * - layout 組み方 / form 入力欄 / ui 目次などの部品
 */
export const TAGS = [
  'text',
  'image',
  'video',
  'scroll',
  'parallax',
  'cursor',
  'drag',
  'hover',
  'noise',
  'particles',
  '3d',
  'shape',
  'physics',
  'random',
  'trigonometry',
  'slider',
  'distortion',
  'reveal',
  'layout',
  'form',
  'ui',
] as const
export type Tag = (typeof TAGS)[number]

/**
 * tech に使える言葉。何で作ったか
 * - js はライブラリを使わずに DOM を動かすもの。css は CSS が動きの主役のもの
 * - locomotive-scroll は中で Lenis を動かしている
 */
export const TECH = [
  'three',
  'glsl',
  'webgpu',
  'wgsl',
  'canvas2d',
  'gsap',
  'locomotive-scroll',
  'svg',
  'css',
  'js',
] as const
export type Tech = (typeof TECH)[number]

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
  /** もとのデモを作った日（YYYY-MM-DD、日が分からなければ YYYY-MM）。トップの「新しい順」はこれで並べる */
  created: string
  /** labobal.dev に出した日（YYYY-MM-DD）。RSS と新着はこれで決める */
  added: string
  /** 一文の説明。ページの description と OGP、詳細のパネルに出す */
  description: string
  /** トップのピックアップに出す */
  pick?: boolean
  /** 何を見せるデモか。TAGS の中から選ぶ */
  tags: Tag[]
  /** 使っている技術。TECH の中から選ぶ */
  tech: Tech[]
  /** 入っている組の名前（src/groups/<group>/）。組に入れるときは variant も書く */
  group?: string
  /** 組の中での短い呼び名。切り替えの欄とトップの行に出る */
  variant?: string
}

export const defineDemo = (meta: DemoMeta) => meta

/**
 * 似たデモの組（#31）。ページは今までどおりバリエーションの slug ごとにあり、その中で組のほかのバリエーションへ切り替えられる。
 * 置き方と切り替えのしくみは src/shared/variants.ts
 */
export interface GroupMeta {
  /** フォルダ名と同じ。各バリエーションの meta.ts の group に書く */
  name: string
  title: string
  /** 一文の説明。トップの組の行に出る */
  description: string
  /** バリエーションの slug。切り替えの欄とトップの行はこの順に並ぶ */
  variants: string[]
  /** トップの組の名前から開くバリエーション */
  default: string
}

export const defineGroup = (meta: GroupMeta) => meta

const BATCHES: Batch[] = ['current', 'A', 'B1', 'B2', 'F6', 'new']
const INTERACTIONS: Interaction[] = ['drag', 'hover', 'scroll', 'click', 'none']

// meta.ts はこのファイルの defineDemo を import するので、eager にすると循環する。読むのは collect の中で
const metaLoaders = import.meta.glob<DemoMeta>('../demos/*/meta.ts', {
  import: 'default',
})
const groupLoaders = import.meta.glob<GroupMeta>('../groups/*/meta.ts', {
  import: 'default',
})
// 組の main.ts（バリエーションの読み込み）は、ブラウザで動的 import をするファイル。ここからは中身を文字として読むだけにする
const groupMains = import.meta.glob<string>('../groups/*/main.ts', {
  query: '?raw',
  import: 'default',
})
// 中身は読まない。あるかどうかだけを見る
const notes = import.meta.glob('../demos/*/README.md', {
  query: '?raw',
  import: 'default',
})
// Demo.astro は部品としては読まない。部品として glob すると、読み込まなくても全デモの CSS がこのファイルを使うページ（トップも）に付く。
// 中身は組のバリエーションの決まりを見るためにだけ文字として読む
const components = import.meta.glob<string>('../demos/*/Demo.astro', {
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
const NON_DEMO_PAGES = ['index', '404']

const pageTemplate = (slug: string) => `---
import DemoLayout from '../layouts/DemoLayout.astro'
import Demo from '../demos/${slug}/Demo.astro'
import meta from '../demos/${slug}/meta'
---

<DemoLayout demo={meta}>
  <Demo />
</DemoLayout>`

const variantTemplate = (group: string) => `---
// 組の共通のマークアップ（src/groups/${group}/ の部品）を使うなら、ここで import する
---

<!-- バリエーションのマークアップ。<style> は書かない。CSS は main.ts から import する -->

<script>
  import group from '../../groups/${group}/main'
  import * as variant from './main'
  group.start(variant)
</script>`

const folderOf = (path: string) => path.split('/').at(-2)!
const pageSlugOf = (path: string) => path.match(/([^/]+)\.astro$/)![1]

/**
 * meta.ts を集めて確かめる。決まりに合わないものがあればビルドを落とす（docs/demo-guide.md の 1 章と 2 章）。
 * 組（src/groups/）も確かめる。開発サーバーでは、作りかけのデモがあっても全ページが 500 にならないよう、
 * そのデモだけ外して警告にする
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
    for (const key of ['created', 'added'] as const) {
      const value = meta[key]
      if (typeof value !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(value))
        fail(folder, `${where}: ${key} が YYYY-MM-DD か YYYY-MM でない`)
    }
    if (typeof meta.description !== 'string' || !meta.description.trim())
      fail(folder, `${where}: description がない`)
    for (const [key, words] of [
      ['tags', TAGS],
      ['tech', TECH],
    ] as const) {
      const value: unknown = meta[key]
      if (!Array.isArray(value) || value.length === 0)
        fail(folder, `${where}: ${key} がない`)
      else
        for (const word of value)
          if (!(words as readonly unknown[]).includes(word))
            fail(
              folder,
              `${where}: ${key} の "${word}" が ${key.toUpperCase()} にない（src/lib/demos.ts に足す）`,
            )
    }
    if (meta.pick !== undefined && typeof meta.pick !== 'boolean')
      fail(folder, `${where}: pick が true / false でない`)
    if (meta.slug !== folder)
      fail(folder, `${where}: slug "${meta.slug}" がフォルダ名と違う`)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folder))
      fail(folder, `${where}: フォルダ名が小文字のケバブケースでない`)
    if (seen.has(meta.slug)) fail(folder, `${where}: slug が重なっている`)
    seen.add(meta.slug)
    if (!noteFolders.has(folder))
      fail(folder, `src/demos/${folder}/README.md がない`)
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

  // 組。切り替えのしくみが前提にしていること（src/shared/variants.ts）を、ここで確かめる
  const groupList = await Promise.all(
    Object.entries(groupLoaders).map(async ([path, load]) => ({
      folder: folderOf(path),
      group: await load(),
    })),
  )
  const groupMainSources = new Map(
    await Promise.all(
      Object.entries(groupMains).map(
        async ([path, load]) => [folderOf(path), await load()] as const,
      ),
    ),
  )
  const bySlug = new Map(list.filter(Boolean).map((meta) => [meta.slug, meta]))
  const groups: GroupMeta[] = []
  for (const { folder, group } of groupList) {
    const where = `src/groups/${folder}/meta.ts`
    if (!group) {
      errors.push(`${where}: defineGroup(...) を default export していない`)
      continue
    }
    const before = errors.length
    // 組が決まりに合わなければ、その組のバリエーションをまとめて外す
    const failGroup = (message: string) => {
      errors.push(message)
      for (const slug of group.variants ?? []) broken.add(slug)
    }
    if (group.name !== folder)
      failGroup(`${where}: name "${group.name}" がフォルダ名と違う`)
    for (const key of ['title', 'description'] as const)
      if (typeof group[key] !== 'string' || !group[key].trim())
        failGroup(`${where}: ${key} がない`)
    const variants = Array.isArray(group.variants) ? group.variants : []
    if (variants.length < 2)
      failGroup(`${where}: variants に slug が 2 つ以上ない`)
    if (new Set(variants).size !== variants.length)
      failGroup(`${where}: variants に同じ slug が 2 回ある`)
    if (!variants.includes(group.default))
      failGroup(`${where}: default "${group.default}" が variants にない`)
    for (const slug of variants) {
      const demo = bySlug.get(slug)
      if (!demo) failGroup(`${where}: variants の "${slug}" というデモがない`)
      else if (demo.group !== group.name)
        fail(
          slug,
          `src/demos/${slug}/meta.ts: group: '${group.name}' がない（${where} の variants にある）`,
        )
    }
    // 読み込みの一覧が variants と同じか。'<slug>': () => import('../../demos/<slug>/main') の形だけを数える
    const main = groupMainSources.get(folder)
    if (main === undefined) failGroup(`src/groups/${folder}/main.ts がない`)
    else {
      const loaders = [
        ...main.matchAll(
          /'([^']+)':\s*\(\)\s*=>\s*import\(\s*'\.\.\/\.\.\/demos\/([^/']+)\/main'\s*\)/g,
        ),
      ]
      for (const [, key, target] of loaders)
        if (key !== target)
          failGroup(
            `src/groups/${folder}/main.ts: "${key}" が別のデモ "${target}" の main を読んでいる`,
          )
      const keys = loaders.map((m) => m[1]).toSorted()
      if (keys.join() !== variants.toSorted().join())
        failGroup(
          `src/groups/${folder}/main.ts: 読み込む slug（${keys.join(', ')}）が meta.ts の variants と違う`,
        )
    }
    if (errors.length === before) groups.push(group)
  }
  for (const meta of list) {
    if (!meta) continue
    const where = `src/demos/${meta.slug}/meta.ts`
    if (meta.group === undefined) {
      if (meta.variant !== undefined)
        fail(meta.slug, `${where}: variant があるのに group がない`)
      continue
    }
    const group = groupList.find((g) => g.group?.name === meta.group)?.group
    if (!group) {
      fail(
        meta.slug,
        `${where}: group の "${meta.group}" という組がない（src/groups/${meta.group}/meta.ts）`,
      )
      continue
    }
    if (!group.variants?.includes(meta.slug))
      fail(
        meta.slug,
        `${where}: src/groups/${meta.group}/meta.ts の variants に "${meta.slug}" がない`,
      )
    if (typeof meta.variant !== 'string' || !meta.variant.trim())
      fail(meta.slug, `${where}: variant（切り替えの欄に出す短い呼び名）がない`)
    // 切り替えたときは、ほかのページから Demo.astro のマークアップだけを持ってくる。<style> は付いてこない
    const component = await components[`../demos/${meta.slug}/Demo.astro`]?.()
    if (component === undefined) continue
    if (/<style[\s>]/.test(component))
      fail(
        meta.slug,
        `src/demos/${meta.slug}/Demo.astro: 組のバリエーションに <style> を書かない（切り替えたときに付いてこない）。CSS は main.ts から import するか、組の共通の部品に置く`,
      )
    const boot = new RegExp(
      `from '\\.\\./\\.\\./groups/${meta.group}/main'[\\s\\S]*\\.start\\(`,
    )
    if (!boot.test(component))
      fail(
        meta.slug,
        `src/demos/${meta.slug}/Demo.astro が組の main.ts から始めていない。次の形にする:\n${variantTemplate(meta.group)}`,
      )
  }

  if (errors.length > 0) {
    const message = `デモの決まりに合わないものがある:\n- ${errors.join('\n- ')}`
    if (!import.meta.env.DEV) throw new Error(message)
    console.warn(`${message}\n（開発サーバーなので、このデモを外して続ける）`)
  }
  const folders = Object.keys(metas).map(folderOf)
  const demos = list
    .filter((_, i) => !broken.has(folders[i]))
    .sort(
      (a, b) =>
        BATCHES.indexOf(a.batch) - BATCHES.indexOf(b.batch) ||
        a.slug.localeCompare(b.slug),
    )
  return {
    demos,
    groups: groups
      .filter((group) => group.variants.every((slug) => !broken.has(slug)))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

let cache: ReturnType<typeof collect> | undefined
const collected = () =>
  import.meta.env.DEV ? collect() : (cache ??= collect())

/** 全デモの一覧。batch の順、その中は slug の順。開発中は meta.ts の書き換えを拾うため毎回集め直す */
export const getDemos = async () => (await collected()).demos

/** 組の一覧。名前の順 */
export const getGroups = async () => (await collected()).groups
