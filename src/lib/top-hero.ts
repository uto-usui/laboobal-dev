/** 中身を替えるときに横線までつぶす時間（ms）。top-preview.ts の切り替えに似せる */
const SQUEEZE = 140

/**
 * スマホで、画面の縦の真ん中を通る名前を主役にする。その項目に is-hero を付け、後ろの板にポスターを出す。
 * ポスターは真ん中に来た項目の分だけ読む
 */
export const watchHero = (list: HTMLElement, plate: HTMLElement) => {
  const img = plate.querySelector('img')!
  let hero: HTMLElement | undefined
  let timer = 0

  const show = (item: HTMLElement | undefined) => {
    if (item === hero) return
    hero?.classList.remove('is-hero')
    hero = item
    clearTimeout(timer)
    if (!item) {
      plate.classList.remove('is-active')
      return
    }
    item.classList.add('is-hero')
    const src = `/previews/${item.dataset.slug}.webp`
    // 読み終えてから替える。読んでいる間に次の項目へ移ったら捨てる
    const next = new Image()
    next.src = src
    next.decode().then(
      () => {
        if (hero !== item) return
        plate.classList.add('is-swapping')
        timer = window.setTimeout(() => {
          img.src = src
          plate.classList.remove('is-swapping')
          plate.classList.add('is-active')
        }, SQUEEZE)
      },
      () => {},
    )
  }

  // 高さ 0 の線を画面の真ん中に引き、そこにかかった項目を主役にする
  const crossing = new Set<HTMLElement>()
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const item = entry.target as HTMLElement
        if (entry.isIntersecting) crossing.add(item)
        else crossing.delete(item)
      })
      show([...crossing].find((item) => !item.hidden))
    },
    { rootMargin: '-50% 0px -50% 0px' },
  )
  list
    .querySelectorAll<HTMLElement>('.item')
    .forEach((item) => observer.observe(item))
}
