import { loop } from './dom'

/**
 * 動きを減らす設定（OS の「視差効果を減らす」など。CSS の prefers-reduced-motion: reduce）への対応。
 * どのデモもこの決まりに従う。設定がないときの見た目と動きは変えない。
 *
 * 1. ひとりでに動き続けるもの（ループ、くり返すアニメーション、自動で次へ進むスライダー、動画）は止め、
 *    止まった 1 枚の絵を見せる。絵は最初のコマか、何のデモか分かる 1 コマ
 * 2. 開いたときや画面に入ったときに 1 回だけ再生するもの（reveal など）は、再生せずに終わりの姿を見せる
 * 3. 読む人の操作にそのままついてくる動き（マウスや指に追いつく、ドラッグ、ホバー、スクロールに合わせて動く）は残す。
 *    クリックや replay のボタンで読む人が始める再生も残す。マウスのない端末で、マウスの代わりに自動で動かす分は止める
 * 4. スクロールを滑らかにする処理（ホイールを奪って慣性を付ける、ページの中のリンクで滑らかに移る）は外し、ふつうのスクロールにする
 * 5. 点滅するものは止める
 * 6. 開いている途中で設定を変えても、読み直さずにその場で切り替わる。ただし数秒で終わる 1 回きりの再生は、始まっていれば最後まで動く
 *
 * CSS の animation は base.css が止める。止めるのは `data-motion="auto"` を付けた要素だけ
 * （スクロールに合わせて動く animation-timeline の animation まで止めないため）。
 * イベントのたびに今の設定を見るだけなら、dom.ts の prefersReducedMotion でよい
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
 * 設定が戻ったら loop を始め直す（elapsed は 0 から数え直す）
 */
export const autoplayLoop = (
  callback: (dt: number, elapsed: number) => void,
  still?: () => void,
) => {
  let stop: (() => void) | undefined
  return onReducedMotion((reduced) => {
    stop?.()
    stop = undefined
    if (reduced) still?.()
    else stop = loop(callback)
  })
}
