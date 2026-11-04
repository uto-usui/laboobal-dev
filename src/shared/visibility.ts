/**
 * デモを動かしてよいか。記事に iframe で埋め込まれたとき、画面の外にある間やタブが裏にある間は止める。
 *
 * - IntersectionObserver の root は指定しない。iframe の中でも、一番上のページの表示領域で測られる
 * - 最初の判定が来る前は「動いている」として扱う。先に止めると、lazy の iframe や headless のテストで描き始めない
 * - 画面の外とタブが裏のときは html に data-offscreen を付ける。CSS のアニメーションは base.css がこれで止める
 * - WebGL の context を失ったとき（gl.ts）も、ここで止める。こちらは data-offscreen を付けない
 */

type Reason = 'offscreen' | 'hidden' | 'context-lost'

const reasons = new Set<Reason>()
const listeners = new Set<(running: boolean) => void>()
/** 最初の判定が来るまでは undefined。whenVisible は true になるのを待つ */
let intersecting: boolean | undefined

export const isRunning = () => reasons.size === 0

/** 止まったときと動き出したときに呼ぶ。戻り値で外す */
export const onRunningChange = (listener: (running: boolean) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const visibleListeners = new Set<() => void>()

const flushVisible = () => {
  if (intersecting !== true || document.hidden) return
  for (const listener of visibleListeners) listener()
  visibleListeners.clear()
}

/** 理由ごとに止める・戻す。どれか 1 つでも残っていれば止まったまま */
export const setPaused = (reason: Reason, paused: boolean) => {
  const before = isRunning()
  if (paused) reasons.add(reason)
  else reasons.delete(reason)
  document.documentElement.toggleAttribute(
    'data-offscreen',
    reasons.has('offscreen') || reasons.has('hidden'),
  )
  const after = isRunning()
  if (before !== after) for (const listener of listeners) listener(after)
}

/**
 * 画面に入ってタブが表に出ているときに 1 回だけ呼ぶ。読み込んだ時点で見えていれば、最初の判定のあとすぐに呼ぶ。
 * 1 回だけ再生するデモが、画面の外で再生を終えてしまわないようにする。戻り値で、まだ呼んでいなければ取りやめる
 */
export const whenVisible = (callback: () => void) => {
  visibleListeners.add(callback)
  flushVisible()
  return () => {
    visibleListeners.delete(callback)
  }
}

const watch = (el: Element) => {
  new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1].isIntersecting
    setPaused('offscreen', !intersecting)
    flushVisible()
  }).observe(el)
  document.addEventListener('visibilitychange', () => {
    setPaused('hidden', document.hidden)
    flushVisible()
  })
}

// デモのページでだけ見張る。トップのページが dom.ts 経由で読んでも何もしない。
// main.demo は組の中でバリエーションを切り替えても入れ替えないので、ページを閉じるまで見張り続ける
const main = document.querySelector('main.demo')
if (main) watch(main)
