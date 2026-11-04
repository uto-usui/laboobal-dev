import { loop } from '../../shared/dom'
import { random } from '../../shared/math'
import { pointerOrWander, trackPointer } from '../../shared/pointer'
import { hsb, paint, sketch } from '../../shared/processing'
import type { Mount } from '../../shared/variants'

const width = 320
const height = 320
const DIAMETER = 60
// background(320) と background(200)。colorMode(HSB, 360, ...) の中では、1 つだけの数は 360 を白とする灰色になる
const LIGHT = 'rgb(227 227 227)'
const DARK = 'rgb(142 142 142)'
/** 描き直しのために覚えておく円の数。10% の円がこれだけ重なれば、古い円はほとんど見えない */
const KEEP = 3000

export const mount: Mount = (stage) => {
  const canvas = stage.querySelector('canvas')!
  let background = LIGHT
  const stamps: { x: number; y: number; color: string }[] = []

  const stamp = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ) => {
    ctx.beginPath()
    ctx.arc(x, y, DIAMETER / 2, 0, Math.PI * 2)
    paint(ctx, color, null)
  }

  const s = sketch(canvas, width, height, (ctx) => {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
    for (const p of stamps) stamp(ctx, p.x, p.y, p.color)
  })

  /** background() で塗りつぶす。それまでの円は消える */
  const reset = (color: string) => {
    background = color
    stamps.length = 0
    s.redraw()
  }

  const pointer = trackPointer(canvas, { units: 'unit' })

  // draw() にあたる。マウスが止まっていても、毎フレームその位置に円を重ねるので、止めた所ほど濃くなる
  const stop = loop((_, elapsed) => {
    // マウスのない端末では、触れていない間は 8 の字をなぞって描く。マウスが外にある間は描かない
    const p = pointerOrWander(pointer, elapsed)
    if (p === pointer && !pointer.inside) return
    const next = {
      x: ((p.x + 1) / 2) * width,
      y: ((p.y + 1) / 2) * height,
      color: hsb(random(170, 220), 60, 80, 10),
    }
    stamps.push(next)
    if (stamps.length > KEEP) stamps.splice(0, stamps.length - KEEP)
    stamp(s.ctx, next.x, next.y, next.color)
  })

  // 押している間は暗い背景、離すと明るい背景に戻る。どちらも、それまでの円を消す
  const press = () => reset(DARK)
  const release = () => {
    if (background === DARK) reset(LIGHT)
  }
  canvas.addEventListener('pointerdown', press)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)

  return () => {
    stop()
    pointer.dispose()
    s.dispose()
    canvas.removeEventListener('pointerdown', press)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
  }
}
