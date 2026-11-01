/**
 * 写真の代わりに、絵と深度の画像の組を canvas で作る。
 * 球を重ねて描き、絵には陰影を、深度の画像には同じ球の表面の高さを書く。どちらも同じ計算から出すので、ぴったり重なる
 */

export const WIDTH = 1600
export const HEIGHT = 1000

interface Ball {
  x: number
  y: number
  /** 奥行き。大きいほど手前 */
  z: number
  r: number
  hue: number
  light: number
}

/** 毎回同じ絵になるよう、seed から作る乱数 */
const createRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const createBalls = (random: () => number): Ball[] => {
  const count = 34
  const balls: Ball[] = []
  for (let i = 0; i < count; i++) {
    // ひまわりの種の並び（黄金角）で外へ広げる。真ん中ほど大きく、手前に置く
    const t = i / count
    const angle = i * 2.39996
    const radius = 420 * Math.sqrt(t) * (0.9 + random() * 0.2)
    balls.push({
      x: WIDTH / 2 + Math.cos(angle) * radius * 1.15,
      y: HEIGHT / 2 + Math.sin(angle) * radius * 0.85,
      z: 260 * (1 - t) ** 1.5,
      r: 150 - 95 * t + random() * 20,
      hue: 345 + random() * 25,
      light: 0.62 + random() * 0.12,
    })
  }
  return balls
}

const hslToRgb = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

const paintBackground = (
  ctx: CanvasRenderingContext2D,
  random: () => number,
) => {
  const gradient = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    100,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.7,
  )
  gradient.addColorStop(0, '#1d3d3f')
  gradient.addColorStop(1, '#0b1719')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // ぼけた葉や光の粒。奥にあるものとして、深度の画像には書かない
  ctx.filter = 'blur(18px)'
  for (let i = 0; i < 40; i++) {
    const leaf = random() < 0.7
    ctx.fillStyle = leaf
      ? `hsl(${160 + random() * 30} 45% ${18 + random() * 18}% / 0.8)`
      : `hsl(${40 + random() * 30} 60% 85% / 0.5)`
    ctx.beginPath()
    ctx.ellipse(
      random() * WIDTH,
      random() * HEIGHT,
      40 + random() * 70,
      25 + random() * 40,
      random() * Math.PI,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  // 球の固まりが落とす影
  ctx.filter = 'blur(60px)'
  ctx.fillStyle = 'rgb(0 0 0 / 0.55)'
  ctx.beginPath()
  ctx.ellipse(WIDTH / 2 + 60, HEIGHT / 2 + 70, 500, 380, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.filter = 'none'
}

export const paintScene = (seed = 3) => {
  const random = createRandom(seed)
  const color = document.createElement('canvas')
  const depth = document.createElement('canvas')
  color.width = depth.width = WIDTH
  color.height = depth.height = HEIGHT
  const colorCtx = color.getContext('2d')!
  paintBackground(colorCtx, random)

  const image = colorCtx.getImageData(0, 0, WIDTH, HEIGHT)
  const zbuffer = new Float32Array(WIDTH * HEIGHT)
  let zMax = 0

  // 光は左上の手前から
  const light = [-0.45, -0.55, 0.7]
  const length = Math.hypot(...light)
  const [lx, ly, lz] = light.map((v) => v / length)

  // 奥のものから描き、手前のもので上書きする
  const balls = createBalls(random).sort((a, b) => a.z - b.z)
  for (const ball of balls) {
    const [br, bg, bb] = hslToRgb(ball.hue, 0.62, ball.light)
    const x0 = Math.max(0, Math.floor(ball.x - ball.r))
    const x1 = Math.min(WIDTH - 1, Math.ceil(ball.x + ball.r))
    const y0 = Math.max(0, Math.floor(ball.y - ball.r))
    const y1 = Math.min(HEIGHT - 1, Math.ceil(ball.y + ball.r))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - ball.x) / ball.r
        const dy = (y - ball.y) / ball.r
        const d2 = dx * dx + dy * dy
        if (d2 > 1) continue
        const dz = Math.sqrt(1 - d2)
        const z = ball.z + dz * ball.r
        const i = y * WIDTH + x
        if (z <= zbuffer[i]) continue
        zbuffer[i] = z
        zMax = Math.max(zMax, z)

        const diffuse = Math.max(0, dx * lx + dy * ly + dz * lz)
        // 反射した光が目（真正面）に向かう量
        const reflect = 2 * diffuse * dz - lz
        const specular = Math.max(0, reflect) ** 30
        // 縁ほど暗くして、球が重なったところに影ができたように見せる
        const rim = 0.45 + 0.55 * Math.sqrt(dz)
        const shade = (0.3 + 0.75 * diffuse) * rim
        const p = i * 4
        image.data[p] = Math.min(255, (br * shade + specular * 0.5) * 255)
        image.data[p + 1] = Math.min(255, (bg * shade + specular * 0.5) * 255)
        image.data[p + 2] = Math.min(255, (bb * shade + specular * 0.5) * 255)
      }
    }
  }
  colorCtx.putImageData(image, 0, 0)

  // 深度: 奥が黒、手前が白。球は 0.3〜1、背景は 0
  const raw = document.createElement('canvas')
  raw.width = WIDTH
  raw.height = HEIGHT
  const rawCtx = raw.getContext('2d')!
  const depthImage = rawCtx.createImageData(WIDTH, HEIGHT)
  for (let i = 0; i < zbuffer.length; i++) {
    const v = zbuffer[i] > 0 ? 0.3 + 0.7 * (zbuffer[i] / zMax) : 0
    const p = i * 4
    depthImage.data[p] =
      depthImage.data[p + 1] =
      depthImage.data[p + 2] =
        v * 255
    depthImage.data[p + 3] = 255
  }
  rawCtx.putImageData(depthImage, 0, 0)

  // 深度の段差をぼかす。段差のまま使うと、ずらしたときに輪郭が裂ける
  const depthCtx = depth.getContext('2d')!
  depthCtx.filter = 'blur(6px)'
  depthCtx.drawImage(raw, 0, 0)

  return { color, depth }
}
