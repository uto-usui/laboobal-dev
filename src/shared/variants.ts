/**
 * 似たデモの組（#31）で、ページの中でバリエーションを切り替えるしくみ。見本は src/groups/random-color/。
 *
 * 置くもの
 * - src/groups/<group>/meta.ts  組の題、説明、並び順、トップから開くバリエーション（defineGroup）
 * - src/demos/<slug>/meta.ts    group と variant（切り替えの欄の短い呼び名）を足す
 * - src/demos/<slug>/main.ts    mount と、あれば params を export する。import しただけでは何も動かさない
 * - src/demos/<slug>/Demo.astro マークアップと style と、start(variant) を呼ぶ script
 *
 * 切り替えの流れ（variant-switcher.ts。設定のボタンを押したときに読む）
 * 1. /<slug>/ の HTML を読み、head の CSS を足し、main.demo の中の script を import する。その script の start(variant) が
 *    mount を渡してくる。lil-gui と同じく、ほかのバリエーションのコードと CSS は切り替えたときにだけ読む
 * 2. 今の dispose を呼び、main.demo の中身を読んだページのもの（script を除く）に入れ替えて、mount を呼ぶ
 * 3. URL（replaceState）、document.title、info のパネルを、読んだページのものに替える
 *
 * mount の決まり
 * - stage は main.demo。要素は stage の中から探す。stage そのものの class と style は dispose のあとに戻す
 * - 始めたものは全部 dispose で止める。共有の部品（loop、autoplayLoop、onResize、trackPointer、touchGate、createGlStage など）は
 *   どれも止める関数か dispose を返す。window や document に足した listener も外す
 * - dispose のあとに、後から来る処理（写真の読み込みの完了、await の続き）で描かない
 * - CSS は切り替えたあとも残る。バリエーションの CSS は Demo.astro の <style>（scoped）に書き、:global だけの規則や
 *   <style is:global> を書かない（ほかのバリエーションにかかる）
 */

export type Dispose = () => void

interface NumberParam {
  label: string
  value: number
  min: number
  max: number
  step?: number
}
interface BooleanParam {
  label: string
  value: boolean
}
interface ChoiceParam {
  label: string
  value: string
  /** 値の並び、または { 表示の名前: 値 } */
  options: readonly string[] | Record<string, string>
}
export type Param = NumberParam | BooleanParam | ChoiceParam
/** 切り替えの欄に出すパラメーター。main.ts で `export const params = { ... } satisfies Params` と書く */
export type Params = Record<string, Param>
export type ParamValues<P extends Params> = { [K in keyof P]: P[K]['value'] }

/** `export const mount: Mount<typeof params> = (stage, params) => { ...; return dispose }` */
export type Mount<P extends Params = Record<never, Param>> = (
  stage: HTMLElement,
  params: ParamValues<P>,
) => Dispose

/** バリエーションの main.ts の形 */
export interface Variant {
  // 引数の params はバリエーションごとに形が違うので、どの形の mount も受け取れる never にする
  mount: (stage: HTMLElement, params: never) => Dispose
  params?: Params
}

/** 開いているページの状態。切り替えの側（variant-switcher.ts）と分け合う */
export interface Page {
  stage: HTMLElement
  slug: string
  variant: Variant
  /** slug ごとのパラメーターの値。切り替えて戻っても残す */
  valuesOf: (slug: string, variant: Variant) => Record<string, unknown>
  /** main.demo の中身を取っておく。script はもう 1 回動かさないよう除く */
  snapshot: (main: HTMLElement) => HTMLTemplateElement
  /** markup を渡したときは中身を入れ替えてから、今の slug と variant で mount する */
  run: (markup?: HTMLTemplateElement) => void
  teardown: () => void
  /** 切り替えの側が、ほかのページの script を import している間だけ置く */
  receive?: (variant: Variant) => void
}

let page: Page | undefined

const noop = () => {}

/**
 * バリエーションの Demo.astro の script から呼ぶ。そのページで最初に呼ばれたときは、そのバリエーションを mount する。
 * 切り替えでほかのページの script を import したときは、mount を切り替えの側に渡すだけにする
 */
export const start = (variant: Variant) => {
  if (page) {
    page.receive?.(variant)
    return
  }
  const stage = document.querySelector<HTMLElement>('main.demo')!
  const pristine = {
    class: stage.getAttribute('class'),
    style: stage.getAttribute('style'),
  }
  const restore = (name: 'class' | 'style') => {
    const value = pristine[name]
    if (value === null) stage.removeAttribute(name)
    else stage.setAttribute(name, value)
  }
  const values = new Map<string, Record<string, unknown>>()
  let dispose: Dispose = noop

  const current: Page = {
    stage,
    slug: stage.dataset.slug!,
    variant,
    valuesOf: (slug, of) => {
      if (!values.has(slug))
        values.set(
          slug,
          Object.fromEntries(
            Object.entries(of.params ?? {}).map(([key, p]) => [key, p.value]),
          ),
        )
      return values.get(slug)!
    },
    snapshot: (main) => {
      const template = document.createElement('template')
      template.innerHTML = main.innerHTML
      for (const script of template.content.querySelectorAll('script'))
        script.remove()
      return template
    },
    run: (markup) => {
      if (markup) stage.replaceChildren(markup.content.cloneNode(true))
      stage.dataset.slug = current.slug
      try {
        const result = current.variant.mount(
          stage,
          current.valuesOf(current.slug, current.variant) as never,
        )
        dispose = typeof result === 'function' ? result : noop
      } catch (error) {
        console.error(error)
        dispose = noop
      }
    },
    teardown: () => {
      try {
        dispose()
      } catch (error) {
        console.error(error)
      }
      dispose = noop
      restore('class')
      restore('style')
    },
  }
  page = current
  const markup = current.snapshot(stage)
  current.run()

  // 切り替えのしくみと lil-gui は、設定のボタンを押したときにだけ読む（ページを開いた直後の重さを増やさないため）。
  // ここに import() を書くと Vite が先読みの道具（preload-helper、0.7 KB）を付けるので、DemoLayout が <template> に
  // 入れておいた script の src を import する。その script（variant-switcher.ts）が provideSwitcher で open を渡してくる
  const toggle = document.querySelector<HTMLButtonElement>('.variant-toggle')
  const script = document
    .querySelector<HTMLTemplateElement>('#variant-switcher')
    ?.content.querySelector('script')
  toggle?.addEventListener('click', async () => {
    toggle.disabled = true
    try {
      await import(
        /* @vite-ignore */ new URL(script!.getAttribute('src')!, location.href)
          .href
      )
      await openSwitcher!(current, markup, toggle)
    } catch (error) {
      console.error(error)
      toggle.disabled = false
    }
  })
}

type Open = (
  page: Page,
  markup: HTMLTemplateElement,
  toggle: HTMLButtonElement,
) => Promise<void>
let openSwitcher: Open | undefined

/** variant-switcher.ts が読み込まれたときに呼ぶ */
export const provideSwitcher = (open: Open) => {
  openSwitcher = open
}
