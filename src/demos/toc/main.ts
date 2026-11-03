import { prefersReducedMotion } from '../../shared/dom'

const article = document.querySelector<HTMLElement>('.toc-demo .article')!

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (Node | string)[]
) => {
  const node = document.createElement(tag)
  node.className = className
  node.append(...children)
  return node
}

const link = (heading: HTMLElement) => {
  const a = document.createElement('a')
  a.href = `#${heading.id}`
  a.textContent = heading.textContent
  return a
}

/** h2 ごとに、次の h2 までにある h3 を子にした入れ子のリストを作る。見出しに id も振る */
const buildList = () => {
  const list = el('ul', 'toc-list')
  let item: HTMLLIElement | undefined
  let children: HTMLUListElement | undefined
  let h2Count = 0
  let h3Count = 0
  for (const heading of article.querySelectorAll<HTMLElement>('h2, h3')) {
    if (heading.tagName === 'H2') {
      heading.id = `section${h2Count++}`
      h3Count = 0
      children = el('ul', 'toc-children')
      item = el('li', 'toc-item', link(heading), children)
      list.append(item)
    } else if (children) {
      // 最初の h2 より前の h3 は、つなぐ先がないので目次に入れない
      heading.id = `section${h2Count - 1}-${h3Count++}`
      children.append(el('li', 'toc-child', link(heading)))
    }
  }
  return list
}

const list = buildList()
// 項目が 1 つだけなら、目次はなくてよい
if (list.querySelectorAll('li').length > 1) {
  const toggle = el(
    'button',
    'toc-toggle',
    'toc',
    document.createElement('br'),
    'ー',
  )
  toggle.type = 'button'
  toggle.setAttribute('aria-expanded', 'false')
  const body = el('div', 'toc-body', list)
  body.inert = true
  const toc = el('nav', 'toc', toggle, body)
  toc.setAttribute('aria-label', '目次')

  toggle.addEventListener('click', () => {
    const open = toc.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
    // 閉じている間は、見えない項目に Tab で入らないようにする
    body.inert = !open
  })

  list.addEventListener('click', (event) => {
    const a = (event.target as Element).closest('a')
    if (!a) return
    event.preventDefault()
    const target = document.getElementById(a.hash.slice(1))!
    // scrollIntoView は、iframe の外の記事のページまでスクロールさせることがあるので使わない
    const top =
      target.getBoundingClientRect().top +
      scrollY -
      parseFloat(getComputedStyle(target).scrollMarginTop)
    scrollTo({ top, behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
    history.replaceState(null, '', a.hash)
  })

  article.before(toc)
}
