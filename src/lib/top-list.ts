/** トップの一覧の並べ方。ページを組み立てるときとブラウザで並べ替えるときの両方で使う。
 * 言葉は隣の絞り込み（hover、drag など）に合わせて英語。new は NEW の印と紛れるので latest */
export const SORTS = [
  { key: 'new', label: 'latest' },
  { key: 'name', label: 'a–z' },
] as const
export type SortKey = (typeof SORTS)[number]['key']
export const DEFAULT_SORT: SortKey = 'new'

export const isSortKey = (value: unknown): value is SortKey =>
  SORTS.some((sort) => sort.key === value)

interface Sortable {
  slug: string
  created?: string
}

/**
 * 新しい順は created（YYYY-MM-DD か YYYY-MM）の新しいものから。文字のまま比べてよい。
 * created がないものは最後に回す。同じ日やどちらもないときは名前順
 */
export const compareBy =
  (sort: SortKey) =>
  (a: Sortable, b: Sortable): number =>
    (sort === 'new' ? (b.created ?? '').localeCompare(a.created ?? '') : 0) ||
    a.slug.localeCompare(b.slug)

export const yearOf = (created?: string) => created?.slice(0, 4) ?? ''
