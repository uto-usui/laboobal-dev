import { onResize } from '../../shared/dom'
import { gsap } from '../../shared/gsap'
import { map, toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// 大きさと回転を、要素ごとにこの角度ずつずらす。もとは半径（画面の高さの 1/4）の px をそのまま角度に足していた。
// 画面の大きさで見え方が変わらないよう、高さ 300px の iframe のときの値に決めた
const PHASE = 75
const sin = (degree: number) => Math.sin(toRadian(degree))
const cos = (degree: number) => Math.cos(toRadian(degree))

export const params = {
  // もとは 1 フレームに 2 度（60fps で 120 度）
  speed: { label: '1 秒に進む角度', value: 120, min: 0, max: 360, step: 1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  const wrap = stage.querySelector<HTMLElement>('[data-stage]')!
  const targets = [...stage.querySelectorAll<HTMLElement>('[data-target]')]

  let angle = 0
  let center = { x: 0, y: 0 }
  let radius = 0

  const draw = () => {
    targets.forEach((el, i) => {
      // 円周を等分した位置に置き、全体で同じ角度だけ回す
      const around = angle + (360 / targets.length) * i
      const phase = angle + i * PHASE
      gsap.set(el, {
        x: center.x + sin(around) * radius,
        y: center.y + cos(around) * radius,
        // 輪が丸ごと奥と手前を行き来する
        z: sin(angle) * radius * 2,
        scale: map(sin(phase), -1, 1, 1, 1.5),
        rotationY: map(cos(phase), -1, 1, 1, 360),
        rotationZ: map(sin(phase), -1, 1, 1, 360),
        backgroundColor: `hsl(${around} 80% 70%)`,
      })
    })
  }

  const offResize = onResize(wrap, ({ width, height }) => {
    const size = targets[0].offsetWidth
    center = { x: width / 2 - size / 2, y: height / 2 - size / 2 }
    radius = height / 4
    // 手前で perspective を越えると要素が消えるので、大きな画面では perspective を広げる
    wrap.style.perspective = `${Math.max(500, radius * 4)}px`
    draw()
  })

  const stop = autoplayLoop((dt) => {
    angle += speed * dt
    draw()
  }, draw)
  return () => {
    stop()
    offResize()
  }
}
