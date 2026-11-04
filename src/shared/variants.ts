/**
 * 似たデモの組（#31）で、ページの中でバリエーションを切り替えるしくみ。見本は src/groups/random-color/。
 *
 * 置くもの
 * - src/groups/<group>/meta.ts  組の題、説明、並び順、トップから開くバリエーション（defineGroup）。ビルドだけが読む
 * - src/groups/<group>/main.ts  slug ごとの main.ts の読み込み（defineVariants）。ブラウザだけが読む
 * - src/demos/<slug>/main.ts    mount と、あれば params を export する。import しただけでは何も動かさない
 * - src/demos/<slug>/Demo.astro マークアップと、group.start(variant) を呼ぶ script。<style> は書かない
 *
 * 切り替えの流れ
 * 1. 次の main.ts を動的 import し、同時に /<slug>/ の HTML を読んで main.demo の中身（script を除く）をマークアップにする
 * 2. 今の dispose を呼び、main.demo の中身を入れ替えて、次の mount を呼ぶ
 * 3. URL（replaceState）、document.title、info のパネルを替える。中身は DemoLayout が埋め込んだ JSON（#demo-group）
 *
 * mount の決まり
 * - stage は main.demo。要素は stage の中から探す。stage そのものの class と style は dispose のあとに戻す
 * - 始めたものは全部 dispose で止める。共有の部品（loop、autoplayLoop、onResize、trackPointer、touchGate、createGlStage など）は
 *   どれも止める関数か dispose を返す。window や document に足した listener も外す
 * - dispose のあとに、後から来る処理（写真の読み込みの完了、await の続き）で描かない
 * - バリエーションだけの CSS は main.ts から import し、[data-slug='<slug>'] の中に書く。切り替えても前の CSS は残るため
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

type Loaders = Record<string, () => Promise<Variant>>

/** DemoLayout が #demo-group に埋め込む、組のバリエーションの情報 */
interface VariantInfo {
  slug: string
  /** 切り替えの欄の名前（meta の variant） */
  label: string
  /** document.title */
  title: string
  /** info のパネルの題（meta の title） */
  heading: string
  description: string
  rows: { key: string; value: string }[]
  article?: string
  code: string
}

/**
 * 組の main.ts で、slug ごとの読み込みを並べる。並び順は meta.ts の variants が決める。
 * 書き方は `'<slug>': () => import('../../demos/<slug>/main')` だけにする（ビルドがこの形で数えて確かめる）
 */
export const defineVariants = (loaders: Loaders) => ({
  /** バリエーションの Demo.astro の script から 1 回だけ呼ぶ。variant はそのページの slug の main.ts */
  start: (variant: Variant) => start(loaders, variant),
})

const noop = () => {}

/** main.demo の中身を、マークアップとして取っておく。script はもう 1 回動かさないよう除く */
const snapshot = (main: HTMLElement) => {
  const template = document.createElement('template')
  template.innerHTML = main.innerHTML
  for (const script of template.content.querySelectorAll('script'))
    script.remove()
  return template
}

const defaultsOf = (params: Params = {}) =>
  Object.fromEntries(
    Object.entries(params).map(([key, param]) => [key, param.value]),
  )

const start = (loaders: Loaders, first: Variant) => {
  const stage = document.querySelector<HTMLElement>('main.demo')!
  const data: { variants: VariantInfo[] } = JSON.parse(
    document.getElementById('demo-group')!.textContent!,
  )
  const pristine = {
    class: stage.getAttribute('class'),
    style: stage.getAttribute('style'),
  }

  let slug = stage.dataset.slug!
  let variant = first
  /** 読み終えたマークアップ。今のバリエーションの分はいつも入っている */
  const markups = new Map([[slug, snapshot(stage)]])
  const loading = new Map<string, Promise<HTMLTemplateElement>>()
  const values = new Map<string, Record<string, unknown>>()
  const valuesOf = (key: string, of: Variant) => {
    if (!values.has(key)) values.set(key, defaultsOf(of.params))
    return values.get(key)!
  }

  const markupOf = (key: string) => {
    const ready = markups.get(key)
    if (ready) return Promise.resolve(ready)
    let promise = loading.get(key)
    if (!promise) {
      promise = fetch(`/${key}/`)
        .then((response) => {
          if (!response.ok) throw new Error(`/${key}/ を読めない`)
          return response.text()
        })
        .then((html) => {
          const main = new DOMParser()
            .parseFromString(html, 'text/html')
            .querySelector<HTMLElement>(`main.demo[data-slug="${key}"]`)
          if (!main) throw new Error(`/${key}/ に main.demo がない`)
          const template = snapshot(main)
          markups.set(key, template)
          return template
        })
        .finally(() => loading.delete(key))
      loading.set(key, promise)
    }
    return promise
  }

  /** markup を渡したときは中身を入れ替えてから mount する。最初の 1 回はページの HTML のまま */
  const run = (markup?: HTMLTemplateElement): Dispose => {
    if (markup) stage.replaceChildren(markup.content.cloneNode(true))
    stage.dataset.slug = slug
    try {
      const dispose = variant.mount(stage, valuesOf(slug, variant) as never)
      return typeof dispose === 'function' ? dispose : noop
    } catch (error) {
      console.error(error)
      return noop
    }
  }
  const restore = (name: 'class' | 'style') => {
    const value = pristine[name]
    if (value === null) stage.removeAttribute(name)
    else stage.setAttribute(name, value)
  }
  let dispose = run()
  const teardown = () => {
    try {
      dispose()
    } catch (error) {
      console.error(error)
    }
    dispose = noop
    restore('class')
    restore('style')
  }

  const panel = document.getElementById('demo-info')
  const showInfo = (info: VariantInfo) => {
    document.title = info.title
    if (!panel) return
    const text = (selector: string, value: string) => {
      const el = panel.querySelector(selector)
      if (el) el.textContent = value
    }
    text('.info-slug', info.slug)
    text('.info-title', info.heading)
    text('.info-description', info.description)
    // 行（created、tags、tech）はどのデモにもあるので、並びはそのままで値だけ替える
    for (const row of panel.querySelectorAll('.info-meta > div')) {
      const key = row.querySelector('dt')?.textContent?.trim()
      const dd = row.querySelector('dd')
      if (dd) dd.textContent = info.rows.find((r) => r.key === key)?.value ?? ''
    }
    const article = panel.querySelector<HTMLElement>('.info-article')
    if (article) {
      // lab の記事に埋め込まれているときは出さない（DemoLayout と同じ）
      article.hidden = !info.article || window.top !== window
      article.querySelector('a')?.setAttribute('href', info.article ?? '')
    }
    panel.querySelector('.info-code a')?.setAttribute('href', info.code)
  }

  /** 切り替えの欄。開くまでは作らない */
  let ui: { sync: () => void } | undefined

  // 選んだ順に読み終えるとは限らないので、最後に選んだものだけを mount する
  let ticket = 0
  const switchTo = async (next: string) => {
    if (next === slug || !loaders[next]) return
    const mine = ++ticket
    let loaded: [Variant, HTMLTemplateElement]
    try {
      loaded = await Promise.all([loaders[next](), markupOf(next)])
    } catch (error) {
      if (mine !== ticket) return
      console.error(error)
      ui?.sync()
      return
    }
    if (mine !== ticket) return
    teardown()
    slug = next
    variant = loaded[0]
    dispose = run(loaded[1])
    history.replaceState(
      history.state,
      '',
      `/${slug}/${location.search}${location.hash}`,
    )
    const info = data.variants.find((v) => v.slug === slug)
    if (info) showInfo(info)
    ui?.sync()
  }

  /** パラメーターを替えたら、同じバリエーションを最初から作り直す */
  const remount = () => {
    ticket++
    teardown()
    dispose = run(markups.get(slug))
  }

  const toggle = document.querySelector<HTMLButtonElement>('.variant-toggle')
  const openGui = async () => {
    if (!toggle || ui) return
    toggle.disabled = true
    // lil-gui は開いたときにだけ読む（読むライブラリでページの重さを分けているため。docs/demo-guide.md の 9 章）
    const GUI = await import('lil-gui').then(
      (lib) => lib.default,
      (error) => {
        console.error(error)
        toggle.disabled = false
        return undefined
      },
    )
    if (!GUI) return
    const gui = new GUI({ title: '設定' })
    gui.domElement.classList.add('variant-gui')
    gui.domElement.dataset.captureHide = ''
    const state = { slug }
    const select = gui
      .add(
        state,
        'slug',
        Object.fromEntries(data.variants.map((v) => [v.label, v.slug])),
      )
      .name('バリエーション')
      .onChange((next: string) => switchTo(next))
    let folder: InstanceType<typeof GUI> | undefined
    const showParams = () => {
      folder?.destroy()
      folder = undefined
      const params = Object.entries(variant.params ?? {})
      if (params.length === 0) return
      folder = gui.addFolder('パラメーター')
      const target = valuesOf(slug, variant)
      for (const [key, param] of params) {
        const controller =
          'options' in param
            ? folder.add(target, key, param.options)
            : 'min' in param
              ? folder.add(target, key, param.min, param.max, param.step)
              : folder.add(target, key)
        // スライダーは動かしている間ではなく、離したときに作り直す（WebGL の context を作り直すことがあるため）
        controller.name(param.label).onFinishChange(remount)
      }
    }
    ui = {
      sync: () => {
        state.slug = slug
        select.updateDisplay()
        showParams()
      },
    }
    showParams()
    toggle.remove()
    gui.$title.focus()
  }
  toggle?.addEventListener('click', openGui)
}
