/** 横に流す速さ（px/秒）。とても長い名前でも 5 秒で最後まで見せる */
const SPEED = 480
const MAX_TIME = 5

/**
 * 1 行に収まらない slug に is-long を付け、はみ出した幅を --slug-over、流す時間を --slug-time に入れる。
 * 名前は 1 行のまま右で切り、触れたら左へ流して最後まで見せる（形は index.astro の CSS）。
 * 幅が変わったときとフォントを読み終えたときに測り直す
 */
export const watchLongSlugs = (list: HTMLElement) => {
  const links = [...list.querySelectorAll<HTMLElement>('.link')]
  const measure = () =>
    links.forEach((link) => {
      const slug = link.querySelector<HTMLElement>('.slug')!
      // 絞り込みで隠れている項目は 0 になるので、測り直すまで前の値のまま
      if (slug.clientWidth === 0) return
      const over = slug.scrollWidth - slug.clientWidth
      link.classList.toggle('is-long', over > 1)
      link.style.setProperty('--slug-over', `${-over}px`)
      link.style.setProperty(
        '--slug-time',
        `${Math.min(MAX_TIME, Math.max(1.2, over / SPEED))}s`,
      )
    })
  new ResizeObserver(measure).observe(list)
  document.fonts.ready.then(measure)
}
