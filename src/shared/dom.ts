import { isRunning, onRunningChange } from './visibility'

/** タッチが主な端末か（ismobilejs の代わり）。ホバーを前提にした動きを切り替えるときに使う */
export const isCoarsePointer = () => matchMedia('(pointer: coarse)').matches

/** マウスを重ねられない端末か。タッチ画面付きの PC は、マウスがあるので false になる */
export const isHoverless = () => matchMedia('(hover: none)').matches

export const prefersReducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 要素の大きさが変わるたびに呼ぶ。iframe の高さが変わったときも拾えるよう、window の resize ではなく ResizeObserver を使う。
 * 登録した時点で 1 回呼ぶ。戻り値で止める
 */
export const onResize = (
  el: Element,
  callback: (size: { width: number; height: number }) => void,
) => {
  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    callback({ width, height })
  })
  observer.observe(el)
  return () => observer.disconnect()
}

/** 描画の解像度に使う devicePixelRatio。重くなりすぎないよう 2 で止める */
export const pixelRatio = () => Math.min(window.devicePixelRatio, 2)

/**
 * canvas の描画の解像度を、表示の大きさと devicePixelRatio に合わせる。
 * 2D の描画は CSS ピクセルの座標で書けるよう、変換も合わせて設定する
 */
export const fitCanvas = (
  canvas: HTMLCanvasElement,
  ctx?: CanvasRenderingContext2D | null,
) => {
  const dpr = pixelRatio()
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { width, height, dpr }
}

/**
 * requestAnimationFrame のループ。callback には前のフレームからの秒数（dt）と、始めてからの秒数を渡す。
 * タブが裏に回って間が空いたときに動きが飛ばないよう、dt は 0〜0.1 秒に収める。戻り値で止める。
 * 画面の外やタブが裏にある間（visibility.ts）は rAF を回さない。戻ったら時刻を取り直し、止まっていた間は elapsed にも数えない
 */
export const loop = (callback: (dt: number, elapsed: number) => void) => {
  let id = 0
  let last = performance.now()
  let start = last
  let pausedAt = last
  const tick = (now: number) => {
    // 最初のフレームの時刻は、ループを作った時刻より前になることがある。マイナスにしない
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1))
    last = now
    callback(dt, Math.max(0, (now - start) / 1000))
    id = requestAnimationFrame(tick)
  }
  const off = onRunningChange((running) => {
    const now = performance.now()
    if (running) {
      start += now - pausedAt
      last = now
      id = requestAnimationFrame(tick)
    } else {
      pausedAt = now
      cancelAnimationFrame(id)
    }
  })
  if (isRunning()) id = requestAnimationFrame(tick)
  return () => {
    off()
    cancelAnimationFrame(id)
  }
}

/**
 * 前に通したときから、どれかの値が eps 以上変わったかを返す関数を作る。
 * 追いつきかけて動きがとても小さくなったフレームで style を書かず、レイアウトを走らせないために使う。
 * 比べる相手は最後に true を返したときの値なので、少しずつの変化も積もれば書く
 */
export const changeGate = (eps = 0.001) => {
  let last: number[] = []
  return (...values: number[]) => {
    if (
      values.length === last.length &&
      values.every((value, i) => Math.abs(value - last[i]) < eps)
    )
      return false
    last = values
    return true
  }
}

/**
 * デモの上に一行の案内を出す（WebGL が使えないときなど）。見た目は particle-photo の WebGPU の案内に合わせ、
 * デモの中身を覆う。形は base.css の .demo-fallback
 */
export const showFallback = (message: string) => {
  const note = document.createElement('p')
  note.className = 'demo-fallback'
  note.textContent = message
  ;(document.querySelector('main.demo') ?? document.body).append(note)
}
