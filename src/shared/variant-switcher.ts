import { type Page, provideSwitcher, type Variant } from './variants'

// 設定のボタンを押したときに読む（src/layouts/VariantSwitcher.astro の script。variants.ts の start を見る）

interface Loaded {
  doc: Document
  markup: HTMLTemplateElement
  /** そのページの main.demo の中の script（バリエーションの Demo.astro の script） */
  entries: string[]
}

const absolute = (url: string) => new URL(url, location.href).href

/** /<slug>/ の HTML を読む。main.demo がなければ、組のバリエーションのページではない */
const loadPage = async (page: Page, slug: string): Promise<Loaded> => {
  const response = await fetch(`/${slug}/`)
  if (!response.ok)
    throw new Error(`/${slug}/ を読めない（${response.status}）`)
  const doc = new DOMParser().parseFromString(
    await response.text(),
    'text/html',
  )
  const main = doc.querySelector<HTMLElement>(`main.demo[data-slug="${slug}"]`)
  if (!main) throw new Error(`/${slug}/ に main.demo がない`)
  const entries = [
    ...main.querySelectorAll<HTMLScriptElement>('script[type="module"]'),
  ].map((script) => {
    const src = script.getAttribute('src')
    // ビルドが script を HTML に書き込むと、ほかのページから import できない
    if (!src) throw new Error(`/${slug}/ の script が src で読まれていない`)
    return absolute(src)
  })
  if (entries.length === 0) throw new Error(`/${slug}/ に script がない`)
  return { doc, markup: page.snapshot(main), entries }
}

/**
 * 読んだページの head の CSS のうち、まだないものを足す。同じ部品の CSS は同じ中身なので、重なっても見た目は変わらない。
 * link は読み終えるまで待つ（読む前に mount すると、大きさを測り違える）
 */
const adoptStyles = async (doc: Document) => {
  const hrefs = new Set(
    [
      ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    ].map((link) => link.href),
  )
  const texts = new Set(
    [...document.querySelectorAll('style')].map((style) => style.textContent),
  )
  const waits: Promise<unknown>[] = []
  for (const el of doc.head.querySelectorAll('link[rel="stylesheet"], style')) {
    if (el.tagName === 'STYLE') {
      if (texts.has(el.textContent)) continue
      document.head.append(document.importNode(el, true))
      continue
    }
    const href = absolute(el.getAttribute('href')!)
    if (hrefs.has(href)) continue
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    waits.push(
      new Promise((resolve, reject) => {
        link.onload = resolve
        link.onerror = () => reject(new Error(`${href} を読めない`))
      }),
    )
    document.head.append(link)
  }
  await Promise.all(waits)
}

const open = async (
  page: Page,
  ownMarkup: HTMLTemplateElement,
  toggle: HTMLButtonElement,
) => {
  const { default: GUI } = await import('lil-gui')
  const data: { variants: { slug: string; label: string }[] } = JSON.parse(
    document.getElementById('demo-group')!.textContent!,
  )

  const pages = new Map<string, Promise<Loaded>>()
  const markups = new Map([[page.slug, ownMarkup]])
  const modules = new Map<string, Variant>([[page.slug, page.variant]])
  const loadOnce = (slug: string) => {
    let promise = pages.get(slug)
    if (!promise) {
      promise = loadPage(page, slug)
      // 読めなかったときは、次に選んだときに読み直す
      promise.catch(() => pages.delete(slug))
      pages.set(slug, promise)
    }
    return promise
  }

  // ほかのページの script は、読み込みのあいだに start(variant) を呼んで mount を渡してくる。
  // どの slug のものかを取り違えないよう、1 つずつ読む。同じ script は 2 回目の import では動かないので、受け取ったら取っておく
  let importing: Promise<unknown> = Promise.resolve()
  const importVariant = (slug: string, entries: string[]) => {
    const job = importing.then(async () => {
      if (modules.has(slug)) return
      let received: Variant | undefined
      page.receive = (variant) => {
        received = variant
      }
      try {
        for (const src of entries) await import(/* @vite-ignore */ src)
      } finally {
        page.receive = undefined
      }
      if (!received)
        throw new Error(`/${slug}/ の script が start(variant) を呼んでいない`)
      modules.set(slug, received)
    })
    importing = job.catch(() => {})
    return job
  }

  const panel = document.getElementById('demo-info')
  /** パネルの中身を、読んだページのものに替える。閉じるボタンには listener があるので替えない */
  const showInfo = (doc: Document) => {
    document.title = doc.title
    if (!panel) return
    for (const selector of [
      '.info-slug',
      '.info-title',
      '.info-description',
      '.info-meta',
      '.info-links',
    ]) {
      const next = doc.querySelector(`#demo-info ${selector}`)
      const now = panel.querySelector(selector)
      if (next && now) now.replaceWith(document.importNode(next, true))
    }
    // lab の記事に埋め込まれているときは「記事」を出さない（DemoLayout と同じ）
    const article = panel.querySelector<HTMLElement>('.info-article')
    if (article && window.top !== window) article.hidden = true
  }

  const gui = new GUI({ title: '設定' })
  gui.domElement.classList.add('variant-gui')
  gui.domElement.dataset.captureHide = ''
  const state = { slug: page.slug }
  const select = gui
    .add(
      state,
      'slug',
      Object.fromEntries(data.variants.map((v) => [v.label, v.slug])),
    )
    .name('バリエーション')
  let folder: InstanceType<typeof GUI> | undefined
  const showParams = () => {
    folder?.destroy()
    folder = undefined
    const params = Object.entries(page.variant.params ?? {})
    if (params.length === 0) return
    folder = gui.addFolder('パラメーター')
    const target = page.valuesOf(page.slug, page.variant)
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
  const sync = () => {
    state.slug = page.slug
    select.updateDisplay()
    showParams()
  }

  // 選んだ順に読み終えるとは限らないので、最後に選んだものだけを mount する
  let ticket = 0
  const switchTo = async (slug: string) => {
    if (slug === page.slug) return
    const mine = ++ticket
    let loaded: Loaded
    try {
      loaded = await loadOnce(slug)
      await adoptStyles(loaded.doc)
      await importVariant(slug, loaded.entries)
    } catch (error) {
      if (mine === ticket) {
        console.error(error)
        sync()
      }
      return
    }
    if (mine !== ticket) return
    page.teardown()
    page.slug = slug
    page.variant = modules.get(slug)!
    markups.set(slug, loaded.markup)
    page.run(loaded.markup)
    history.replaceState(
      history.state,
      '',
      `/${slug}/${location.search}${location.hash}`,
    )
    showInfo(loaded.doc)
    sync()
  }
  /** パラメーターを替えたら、同じバリエーションを最初から作り直す */
  function remount() {
    page.teardown()
    page.run(markups.get(page.slug))
  }

  select.onChange((slug: string) => switchTo(slug))
  showParams()
  toggle.remove()
  gui.$title.focus()
}

provideSwitcher(open)
