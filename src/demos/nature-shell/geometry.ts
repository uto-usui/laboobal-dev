export const START_SIZE = 0.035
export const TURNS = 4
export const EXPANSION = -Math.log(START_SIZE) / (TURNS * Math.PI * 2)
export const SECTIONS = 256
export const GROWTH_STEPS = 1536
const TILT = -0.3
const PITCH = -0.12
// 成長する向き（螺旋の接線）がカメラ側を向き、古い体層の後ろへ殻口が隠れない位相。
const PHASE = Math.PI - 0.38

export type Vec3 = [number, number, number]

// 断面を拡大しながら巻き、過去の断面を残す。単に完成形を拡大する処理ではない。
export const shellPoint = (size: number, v: number, growth = 1): Vec3 => {
  const a = v * Math.PI * 2
  const along = (1 - Math.cos(a)) * 0.5
  const bodyRadius =
    0.09 +
    0.77 * along +
    0.16 * Math.sin(Math.PI * along) +
    Math.sin(a) * (0.12 + 0.28 * Math.sqrt(along))
  const blend = Math.max(0, Math.min(1, (along - 0.025) / 0.16))
  const radius =
    (0.16 + 0.32 * Math.sin(a)) * (1 - blend * blend * (3 - 2 * blend)) +
    bodyRadius * blend * blend * (3 - 2 * blend)
  const y = 1.4 + size * (-3.22 + 2.39 * along)
  const phi = -Math.log(Math.max(0.0001, size) / growth) / EXPANSION + PHASE
  const x = size * radius * Math.cos(phi)
  const z = size * radius * Math.sin(phi)
  const yy = y * Math.cos(PITCH) - z * Math.sin(PITCH)
  return [
    x * Math.cos(TILT) - yy * Math.sin(TILT),
    x * Math.sin(TILT) + yy * Math.cos(TILT),
    y * Math.sin(PITCH) + z * Math.cos(PITCH),
  ]
}

// 完成形から一度だけ距離を決める。成長や視点の回転では引き直さない。
export const frameShell = (aspect: number) => {
  const growth = 1
  const points: Vec3[] = []
  for (let j = 0; j <= 128; j++)
    for (let i = 0; i <= 64; i++)
      points.push(
        shellPoint(
          START_SIZE * (growth / START_SIZE) ** (j / 128),
          i / 64,
          growth,
        ),
      )
  let x =
    (Math.min(...points.map((p) => p[0])) +
      Math.max(...points.map((p) => p[0]))) /
    2
  let y =
    (Math.min(...points.map((p) => p[1])) +
      Math.max(...points.map((p) => p[1]))) /
    2
  const tangent = Math.tan(Math.PI / 10)
  const padding = growth * 0.016
  let distance = 0
  for (let iteration = 0; iteration < 5; iteration++) {
    distance = 0
    for (const p of points)
      distance = Math.max(
        distance,
        p[2] + (Math.abs(p[0] - x) + padding) / (tangent * aspect * 0.76),
        p[2] + (Math.abs(p[1] - y) + padding) / (tangent * 0.66),
      )
    if (iteration === 4) break
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of points) {
      const scale = 1 / (distance - p[2])
      minX = Math.min(minX, (p[0] - x) * scale)
      maxX = Math.max(maxX, (p[0] - x) * scale)
      minY = Math.min(minY, (p[1] - y) * scale)
      maxY = Math.max(maxY, (p[1] - y) * scale)
    }
    x += ((minX + maxX) * distance) / 2
    y += ((minY + maxY) * distance) / 2
  }
  return { eye: [x, y, distance] as Vec3, target: [x, y, 0] as Vec3 }
}

// 正面の投影外接矩形の中心だけを追う。距離と回転角には触れない。
export const followShell = (
  growth: number,
  aspect: number,
  distance: number,
): Vec3 => {
  const points: Vec3[] = []
  for (let j = 0; j <= 128; j++)
    for (let i = 0; i <= 64; i++)
      points.push(
        shellPoint(
          START_SIZE + ((growth - START_SIZE) * j) / 128,
          i / 64,
          growth,
        ),
      )
  let x = 0
  let y = 0
  const tangent = Math.tan(Math.PI / 10)
  // 唇の最大変位（厚みの2倍）も含め、透視投影での余白を左右上下に足す。
  const padding = 0.024 * growth
  for (let iteration = 0; iteration < 8; iteration++) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of points) {
      const scale = 1 / (distance - p[2])
      minX = Math.min(minX, (p[0] - x - padding) * scale)
      maxX = Math.max(maxX, (p[0] - x + padding) * scale)
      minY = Math.min(minY, (p[1] - y - padding) * scale)
      maxY = Math.max(maxY, (p[1] - y + padding) * scale)
    }
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    if (
      Math.abs(centerX) / (tangent * aspect) < 0.0001 &&
      Math.abs(centerY) / tangent < 0.0001
    )
      break
    x += centerX * distance
    y += centerY * distance
  }
  return [x, y, 0]
}

export const SHAPE = /* wgsl */ `
fn shape(size: f32, v: f32) -> vec3f {
  let a = v * 6.2831853;
  let along = (1.0 - cos(a)) * 0.5;
  let bodyRadius = 0.09 + 0.77 * along + 0.16 * sin(3.14159265 * along)
    + sin(a) * (0.12 + 0.28 * sqrt(along));
  let radius = mix(0.16 + 0.32 * sin(a), bodyRadius, smoothstep(0.025, 0.185, along));
  let phi = -log(max(0.0001, size) / shell.growth) / ${EXPANSION} + ${PHASE};
  let x = size * radius * cos(phi);
  let z = size * radius * sin(phi);
  let y = 1.4 + size * (-3.22 + 2.39 * along);
  let yy = y * cos(${PITCH}) - z * sin(${PITCH});
  return vec3f(x * cos(${TILT}) - yy * sin(${TILT}), x * sin(${TILT}) + yy * cos(${TILT}), y * sin(${PITCH}) + z * cos(${PITCH}));
}
`

export const createMesh = () => {
  const vertices: number[] = []
  const indices: number[] = []
  const sheet = (steps: number, layer: number) => {
    const first = vertices.length / 3
    for (let j = 0; j <= steps; j++)
      for (let i = 0; i <= SECTIONS; i++)
        vertices.push(j / steps, i / SECTIONS, layer)
    for (let j = 0; j < steps; j++)
      for (let i = 0; i < SECTIONS; i++) {
        const a = first + j * (SECTIONS + 1) + i
        const b = a + SECTIONS + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
  }
  sheet(GROWTH_STEPS, 0)
  const lipOffset = indices.length
  sheet(12, 1)
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    lipOffset,
    lipCount: indices.length - lipOffset,
  }
}

export const projectPoint = (point: Vec3, matrix: Float32Array) => {
  const clip = [0, 0, 0, 0]
  for (let r = 0; r < 4; r++)
    clip[r] =
      matrix[r] * point[0] +
      matrix[r + 4] * point[1] +
      matrix[r + 8] * point[2] +
      matrix[r + 12]
  return [clip[0] / clip[3], clip[1] / clip[3]]
}

// CSSピクセルで測るので、縦横比やdevicePixelRatioが変わっても許容幅は同じ。
export const nearestRimCell = (
  x: number,
  y: number,
  width: number,
  height: number,
  growth: number,
  matrix: Float32Array,
  cells: number,
) => {
  // 投影と座標の引き算の丸めで、ちょうど40pxの入力を落とさない。
  let nearest = 40 ** 2 + 1e-8
  let selected: number | undefined
  for (let i = 0; i < cells; i++) {
    const point = projectPoint(
      shellPoint(growth, i / (cells - 1), growth),
      matrix,
    )
    const px = ((point[0] + 1) * width) / 2
    const py = ((1 - point[1]) * height) / 2
    const distance = (x - px) ** 2 + (y - py) ** 2
    if (distance <= nearest) {
      nearest = distance
      selected = i
    }
  }
  return selected
}

// 描画と同じ曲面へ光線を当て、殻の上からカメラをつかまないようにする。
export const intersectShell = (eye: Vec3, direction: Vec3, growth: number) => {
  const subtract = (a: Vec3, b: Vec3): Vec3 => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  ]
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  let nearest = Infinity
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => {
    const ab = subtract(b, a)
    const ac = subtract(c, a)
    const h = cross(direction, ac)
    const determinant = dot(ab, h)
    if (Math.abs(determinant) < 1e-10) return
    const q = subtract(eye, a)
    const u = dot(q, h) / determinant
    if (u < 0 || u > 1) return
    const k = cross(q, ab)
    const v = dot(direction, k) / determinant
    if (v < 0 || u + v > 1) return
    const distance = dot(ac, k) / determinant
    if (distance > 0) nearest = Math.min(nearest, distance)
  }
  const samples = 96
  let previous = Array.from({ length: samples + 1 }, (_, i) =>
    shellPoint(START_SIZE, i / samples, growth),
  )
  for (let j = 1; j <= samples; j++) {
    const size = START_SIZE + ((growth - START_SIZE) * j) / samples
    const current = Array.from({ length: samples + 1 }, (_, i) =>
      shellPoint(size, i / samples, growth),
    )
    for (let i = 0; i < samples; i++) {
      triangle(previous[i], current[i], previous[i + 1])
      triangle(previous[i + 1], current[i], current[i + 1])
    }
    previous = current
  }
  return nearest
}
