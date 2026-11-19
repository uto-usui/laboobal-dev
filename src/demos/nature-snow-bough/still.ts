import { pixelRatio } from '../../shared/dom'
import { type Scene, snowShape } from './scene'
import { snowFrame } from './snow-shape'

// GPU を使えないときも、写真を借りずに同じ枝と積雪を描く。
export const drawStill = (
  canvas: HTMLCanvasElement,
  scene: Scene,
  view: number[],
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas.getBoundingClientRect()
  const dpr = pixelRatio()
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sky = ctx.createLinearGradient(0, 0, width * 0.3, height)
  sky.addColorStop(0, '#e3ebef')
  sky.addColorStop(1, '#cddbe3')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  for (let layer = 0; layer < 3; layer++) {
    ctx.save()
    ctx.filter = `blur(${12 - layer * 3}px)`
    ctx.strokeStyle = ['#c4d1d9', '#b1c1ca', '#98adb7'][layer]
    for (let i = 0; i < 9; i++) {
      const hash = (salt: number) => {
        const value = Math.sin(i * 127.1 + layer * 311.7 + salt) * 43758.5453
        return value - Math.floor(value)
      }
      const x = hash(3.7) * (width + 100) - 50
      ctx.globalAlpha = 0.2 + hash(7.3) * 0.5
      const ground = height * (0.66 + layer * 0.13)
      ctx.lineWidth = 2 + layer * 3 + hash(17.9) * 11
      ctx.beginPath()
      ctx.moveTo(x, ground)
      ctx.lineTo(x + (hash(39.1) - 0.5) * 40, -30)
      ctx.stroke()
      for (let limb = 0; limb < 3; limb++) {
        const side = (i + limb) % 2 ? 1 : -1
        const y = ground - 100 - limb * 135
        ctx.lineWidth = 2 + layer
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + side * (60 + layer * 30), y - 35)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  const scale = width / (view[2] * 2)
  const project = (x: number, y: number) => [
    width / 2 + (x - view[0]) * scale,
    height / 2 - (y - view[1]) * scale,
  ]
  const p = (id: number) => {
    const at = id * 20
    const x = scene.nodes[at],
      y = scene.nodes[at + 1]
    const droop =
      0.26 *
      Math.max(
        0,
        (x + (scene.compact ? 3.4 : 5.9)) / (scene.compact ? 6.6 : 11.3),
      ) **
        1.5
    return project(x, y - droop)
  }
  ctx.lineCap = 'round'
  for (const path of scene.paths) {
    for (let i = 1; i < path.length; i++) {
      const a = p(path[i - 1]),
        b = p(path[i])
      ctx.strokeStyle = '#514b38'
      ctx.lineWidth = Math.max(0.7, scene.nodes[path[i] * 20 + 7] * scale * 2)
      ctx.beginPath()
      ctx.moveTo(...(a as [number, number]))
      ctx.lineTo(...(b as [number, number]))
      ctx.stroke()
    }
  }
  for (let i = 0; i < scene.needles.length; i += 8) {
    const root = p(scene.needles[i]),
      b = p(scene.needles[i + 1])
    const t = scene.needles[i + 6]
    const a = root.map((v, k) => v + (b[k] - v) * t)
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + scene.needles[i + 5]
    const len =
      (scene.needles[i + 4] * scale) / Math.hypot(1, scene.needles[i + 7])
    const shade = ctx.createLinearGradient(
      a[0],
      a[1],
      a[0] + Math.cos(angle) * len,
      a[1] + Math.sin(angle) * len,
    )
    shade.addColorStop(0, '#183b2b')
    shade.addColorStop(1, '#42613a')
    ctx.strokeStyle = shade
    ctx.lineWidth = Math.max(0.55, scale * 0.011 * scene.needles[i + 2])
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.quadraticCurveTo(
      a[0] + Math.cos(angle) * len * 0.55,
      a[1] + Math.sin(angle) * len * 0.55,
      a[0] + Math.cos(angle) * len,
      a[1] + Math.sin(angle) * len + 3,
    )
    ctx.stroke()
  }
  for (const snow of scene.snows) {
    const [x, y] = p(snow.anchor)
    const w = snow.size[0] * scale,
      h = snow.size[1] * scale
    const [alongX, alongY] = snowFrame(snow.slope)
    const anchor = project(
      scene.nodes[snow.anchor * 20],
      scene.nodes[snow.anchor * 20 + 1],
    )
    const origin = project(snow.center[0], snow.center[1])
    const centerX = origin[0] + x - anchor[0]
    const centerY = origin[1] + y - anchor[1]
    const phase = snow.phase
    ctx.save()
    ctx.shadowColor = '#30485738'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 3
    const shade = ctx.createLinearGradient(
      x,
      centerY - h * 0.8,
      x,
      centerY + h * 0.64,
    )
    shade.addColorStop(0, '#f1f4f5')
    shade.addColorStop(0.58, '#edf1f4')
    shade.addColorStop(1, '#c8d8e3')
    ctx.fillStyle = shade
    ctx.beginPath()
    for (let i = 0; i <= 160; i++) {
      const angle = (i / 160) * Math.PI * 2
      const u = Math.cos(angle),
        v = Math.sin(angle)
      const edge = Math.max(Math.abs(u), Math.abs(v))
      const shape = snowShape(u / edge, v / edge, 0, phase)
      const sx = centerX + shape[0] * w * alongX - shape[1] * h * alongY,
        sy = centerY - shape[0] * w * alongY - shape[1] * h * alongX
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.closePath()
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.clip()
    // 低コントラストの粉の質感。細粒を黒い斑点や大きな光点にしない。
    for (let i = 0; i < 1400; i++) {
      const rx = Math.sin(i * 127.1 + phase) * 43758.5453
      const ry = Math.sin(i * 311.7 + phase) * 17538.27
      ctx.fillStyle = i % 3 ? '#ffffff0c' : '#738d9e09'
      ctx.fillRect(
        x + ((rx - Math.floor(rx)) * 2 - 1) * w,
        centerY + ((ry - Math.floor(ry)) * 1.4 - 0.9) * h,
        0.7,
        0.7,
      )
    }
    ctx.restore()
  }
}
