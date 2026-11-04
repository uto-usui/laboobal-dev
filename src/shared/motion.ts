import { loop } from './dom'

/**
 * 動きを減らす設定（CSS の prefers-reduced-motion: reduce）への対応。
 * 何を止めて何を残すかの決まりは docs/demo-guide.md の 5 章。どのデモもそれに従う
 */
const query = matchMedia('(prefers-reduced-motion: reduce)')

/** 今の設定ですぐに 1 回呼び、設定が変わるたびにまた呼ぶ。戻り値で外す */
export const onReducedMotion = (listener: (reduced: boolean) => void) => {
  const onChange = (event: MediaQueryListEvent) => listener(event.matches)
  query.addEventListener('change', onChange)
  listener(query.matches)
  return () => query.removeEventListener('change', onChange)
}

/**
 * ひとりでに動き続ける loop()。動きを減らす設定の間は回さず、代わりに still を 1 回呼んで止まった絵を描く。
 * 設定が戻ったら loop を始め直す（elapsed は 0 から数え直す）。戻り値で、設定の見張りとループの両方を止める
 */
export const autoplayLoop = (
  callback: (dt: number, elapsed: number) => void,
  still?: () => void,
) => {
  let stop: (() => void) | undefined
  const off = onReducedMotion((reduced) => {
    stop?.()
    stop = undefined
    if (reduced) still?.()
    else stop = loop(callback)
  })
  return () => {
    off()
    stop?.()
    stop = undefined
  }
}
