import { existsSync, readdirSync, readFileSync } from 'node:fs'

/**
 * src/demos/<slug>/meta.ts と src/groups/<group>/meta.ts を文字として読む。
 * Playwright は Vite を通らないので import.meta.glob が使えず、dist/demos.json を読むとビルドし直すまで新しいデモが入らない
 */

export interface DemoText {
  slug: string
  title: string
  created?: string
  interaction: string
  pick: boolean
  webgl: boolean
  group?: string
  variant?: string
}

export interface GroupText {
  name: string
  default: string
  variants: string[]
}

const string = (source: string, key: string) =>
  source.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1]

export const loadDemos = (): DemoText[] =>
  readdirSync('src/demos', { withFileTypes: true })
    // 作りかけで meta.ts がまだないフォルダは飛ばす
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(`src/demos/${entry.name}/meta.ts`),
    )
    .map((entry) => {
      const source = readFileSync(`src/demos/${entry.name}/meta.ts`, 'utf8')
      return {
        slug: entry.name,
        title: string(source, 'title') ?? '',
        created: string(source, 'created'),
        interaction: string(source, 'interaction') ?? 'none',
        pick: /\bpick:\s*true\b/.test(source),
        webgl: /\bwebgl:\s*true\b/.test(source),
        group: string(source, 'group'),
        variant: string(source, 'variant'),
      }
    })

export const loadGroups = (): GroupText[] =>
  existsSync('src/groups')
    ? readdirSync('src/groups', { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            existsSync(`src/groups/${entry.name}/meta.ts`),
        )
        .map((entry) => {
          const source = readFileSync(
            `src/groups/${entry.name}/meta.ts`,
            'utf8',
          )
          const list = source.match(/\bvariants:\s*\[([^\]]*)\]/)?.[1] ?? ''
          return {
            name: entry.name,
            default: string(source, 'default') ?? '',
            variants: [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]),
          }
        })
    : []
