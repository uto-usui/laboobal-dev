/**
 * シールのめくれ方の形。座標はシールの左上を原点にした px（シールの中の座標）。
 *
 * めくった角 P0 から引いた向き d に折り目を置き、折り目から P0 の側を筒（半径 R）に巻きつける。
 * 巻くのは π - BETA まで。その先は筒の終わりの向きのまままっすぐ伸ばすので、めくれた所は BETA の角度で持ち上がる。
 * 同じ式を頂点シェーダー（render.ts）でも使う
 */

/** 筒の半径（px） */
export const R = 13
/** めくれた所が机から持ち上がる角度 */
export const BETA = 0.38

const WRAP = Math.PI - BETA

/**
 * 折り目が P0 から a だけ進んだとき、P0 が画面の上で動いて見える距離。
 * 筒に巻きついている間はほとんど上へ持ち上がるだけで、横へはあまり動かない
 */
export const travel = (a: number) =>
  a < WRAP * R
    ? a - R * Math.sin(a / R)
    : a - R * Math.sin(BETA) + Math.cos(BETA) * (a - WRAP * R)

/** 指が動いた距離 L から、折り目の位置 a を逆に求める。travel は増えるだけなので二分法で足りる */
export const foldFor = (L: number) => {
  if (L <= 0) return 0
  let lo = 0
  let hi = L * 2 + R * 4
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (travel(mid) < L) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface Shape {
  w: number
  h: number
  round: boolean
}

/** 押した所からいちばん近い角。丸いシールは、中心から押した所へ伸ばした先の縁 */
export const cornerNear = (shape: Shape, x: number, y: number) => {
  const { w, h } = shape
  if (shape.round) {
    const cx = w / 2
    const cy = h / 2
    const r = w / 2
    const len = Math.hypot(x - cx, y - cy)
    // ちょうど中心を押したときは、上の縁からめくる
    if (len < 1e-6) return [cx, cy - r]
    return [cx + ((x - cx) / len) * r, cy + ((y - cy) / len) * r]
  }
  return [x < w / 2 ? 0 : w, y < h / 2 ? 0 : h]
}

/** P0 から d の向きに、シールがどこまで続いているか */
export const extent = (
  shape: Shape,
  px: number,
  py: number,
  dx: number,
  dy: number,
) => {
  const { w, h } = shape
  if (shape.round) return (w / 2 - px) * dx + (h / 2 - py) * dy + w / 2
  let most = 0
  for (const [qx, qy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ])
    most = Math.max(most, (qx - px) * dx + (qy - py) * dy)
  return most
}

/** 引いた向きを、角から中心へ向かう向き（cx, cy）の左右 limit の中に収める */
const withinCone = (
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  limit: number,
) => {
  const len = Math.hypot(dx, dy)
  if (len < 1e-3) return [cx, cy]
  const ux = dx / len
  const uy = dy / len
  const angle = Math.atan2(cx * uy - cy * ux, cx * ux + cy * uy)
  if (Math.abs(angle) <= limit) return [ux, uy]
  const t = Math.sign(angle) * limit
  return [
    cx * Math.cos(t) - cy * Math.sin(t),
    cx * Math.sin(t) + cy * Math.cos(t),
  ]
}

/**
 * めくる起点と向きを、起点が「向きに沿っていちばん手前の点」になるように合わせる。
 * こうしないと、引き始めた瞬間に、つまんだ角より先に別の縁がめくれる。
 * 四角は角を動かさず、向きを角から内側の 90° に収める。丸は向きを左右 CONE に収め、起点をその向きの反対側の縁へ動かす。
 * inX, inY は角から中心へ向かう向き。外へ引いても、シールは内側へめくれていく
 */
export const aim = (
  shape: Shape,
  p0x: number,
  p0y: number,
  inX: number,
  inY: number,
  dx: number,
  dy: number,
  cone: number,
) => {
  if (shape.round) {
    const [ux, uy] = withinCone(dx, dy, inX, inY, cone)
    const r = shape.w / 2
    return { p0x: r - ux * r, p0y: shape.h / 2 - uy * r, dx: ux, dy: uy }
  }
  const sx = Math.sign(inX)
  const sy = Math.sign(inY)
  let ux = sx * Math.max(0, dx * sx)
  let uy = sy * Math.max(0, dy * sy)
  const len = Math.hypot(ux, uy)
  if (len < 1e-3) {
    ux = inX
    uy = inY
  } else {
    ux /= len
    uy /= len
  }
  return { p0x, p0y, dx: ux, dy: uy }
}
