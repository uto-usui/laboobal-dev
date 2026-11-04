import { fitCanvas, onResize } from '../../shared/dom'
import { random } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// 数字はもとの new _node('canvas', 1, 50, 1) と同じ。長さは CSS ピクセル、速さと加速は 60fps のときの 1 フレームあたり
const size = 1
const speed = 1
const weight = 1
const ratio = 1 / 50000
const STEP = 1 / 60

export const params = {
  count: { label: '点の数', value: 50, min: 2, max: 200, step: 1 },
  max: { label: '線で結ぶ距離', value: 100, min: 10, max: 300, step: 1 },
} satisfies Params

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
}

export const mount: Mount<typeof params> = (stage, { count, max }) => {
  const limit = max * max
  const wrap = stage.querySelector<HTMLElement>('[data-springiness]')!
  const canvas = wrap.querySelector('canvas')!
  const ctx = canvas.getContext('2d')!

  const hue = random(0, 360)
  const color = (alpha: number) => `hsl(${hue} 90% 55% / ${alpha})`

  let width = 0
  let height = 0
  const particles: Particle[] = []

  // 壁に触れているか。触れている点は向きを変えるだけで、引き合う力を受けない
  const atEdgeX = (x: number) => x >= width - size * 2 || x <= size * 2
  const atEdgeY = (y: number) => y >= height - size * 2 || y <= size * 2

  const step = () => {
    for (const p of particles) {
      if (atEdgeX(p.x)) p.vx *= -1
      if (atEdgeY(p.y)) p.vy *= -1
      p.x += p.vx
      p.y += p.vy
    }
    // 近い 2 点を、距離に比例した強さで引き寄せ合う。引き合うたびに速さが増していく
    for (let i = 0; i < particles.length - 1; i++) {
      const a = particles[i]
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (dx * dx + dy * dy < limit) {
          const ax = dx * ratio
          const ay = dy * ratio
          if (!atEdgeX(a.x)) a.vx += ax
          if (!atEdgeY(a.y)) a.vy += ay
          if (!atEdgeX(b.x)) b.vx -= ax
          if (!atEdgeY(b.y)) b.vy -= ay
        }
      }
    }
  }

  const draw = () => {
    ctx.clearRect(0, 0, width, height)
    // 近いほど濃い線で結ぶ
    ctx.lineWidth = weight
    for (let i = 0; i < particles.length - 1; i++) {
      const a = particles[i]
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]
        const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
        if (d2 < limit) {
          ctx.strokeStyle = color((max - Math.sqrt(d2)) / max)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }
    ctx.fillStyle = color(1)
    for (const p of particles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const stopResize = onResize(wrap, () => {
    const before = { width, height }
    ;({ width, height } = fitCanvas(canvas, ctx))
    if (width === 0 || height === 0) return
    if (particles.length === 0 || before.width === 0 || before.height === 0) {
      particles.length = 0
      // 壁からはみ出さない位置に置く
      for (let i = 0; i < count; i++)
        particles.push({
          x: random(size * 2, width - size * 2),
          y: random(size * 2, height - size * 2),
          vx: random(-0.5, 0.5) * speed,
          vy: random(-0.5, 0.5) * speed,
        })
    } else {
      // 大きさが変わったら、同じ割合の位置へ移す。壁の外に取り残されると、向きを変え続けて出られなくなる
      for (const p of particles) {
        p.x = (p.x / before.width) * width
        p.y = (p.y / before.height) * height
      }
    }
    draw()
  })

  let rest = 0
  // 動きを減らす設定では、置いたばかりの点と線を止めたまま見せる
  const stop = autoplayLoop(
    (dt) => {
      rest += dt
      while (rest >= STEP) {
        step()
        rest -= STEP
      }
      draw()
    },
    () => draw(),
  )

  return () => {
    stop()
    stopResize()
  }
}
