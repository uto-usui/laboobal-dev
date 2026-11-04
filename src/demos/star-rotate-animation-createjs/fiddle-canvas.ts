import { fitCanvas, onResize } from '../../shared/dom'

/**
 * もとの fiddle の canvas（width × height の固定の大きさ）の座標のまま描けるようにする。
 * 入れ物に収まる大きさまで canvas を広げ（もとの 2 倍まで）、2D の文脈をその倍率で拡大しておく。
 * 大きさが変わるたびに draw を呼ぶので、止まっている間も絵が消えない
 */
export const fiddleCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) => {
  const ctx = canvas.getContext('2d')!
  // 枠の点線（outline）の分をあけておく
  const gap = 8
  onResize(canvas.parentElement!, (size) => {
    const scale = Math.max(
      0,
      Math.min((size.width - gap) / width, (size.height - gap) / height, 2),
    )
    canvas.style.width = `${width * scale}px`
    canvas.style.height = `${height * scale}px`
    fitCanvas(canvas, ctx)
    ctx.scale(scale, scale)
    draw(ctx)
  })
  return ctx
}
