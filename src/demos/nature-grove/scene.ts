import { camera } from '../../shared/gpu/wgsl'
import { GROUND_Y } from './terrain'
import { add, clamp, mul, STRIDE, type V3 } from './tree'

export const INITIAL_ROOTS: V3[] = [
  [-1.45, GROUND_Y, -2.5],
  [1.45, GROUND_Y, -3.3],
  [-0.1, GROUND_Y, 0.65],
]
export const FOV = 0.66
/** 成長や追加では動かさず、リサイズ時だけ既存の根元も画面へ収める。 */
export const sceneCamera = (aspect: number, roots: V3[] = []) => {
  let distance = Math.max(9.5, 9.2 / aspect)
  for (;;) {
    const cam = camera(
      [0, 5.6, distance],
      [0, 1.65, -1.2],
      FOV,
      aspect,
      0.1,
      Math.max(150, distance + 120),
    )
    const m = cam.viewProj
    const inside = roots.every((root) => {
      const clip = (row: number) =>
        m[row] * root[0] +
        m[row + 4] * root[1] +
        m[row + 8] * root[2] +
        m[row + 12]
      const w = clip(3)
      return (
        w > 0 && Math.abs(clip(0) / w) <= 0.9 && Math.abs(clip(1) / w) <= 0.78
      )
    })
    if (inside) return cam
    distance *= 1.1
  }
}
type Camera = ReturnType<typeof sceneCamera>
export const groundPoint = (
  cam: Camera,
  x: number,
  y: number,
): V3 | undefined => {
  // 空は植樹の対象にしない。地面の端では根元と冠の余白を残す。
  if (cam.ray(x, y)[1] >= -0.001) return
  const direction = cam.ray(clamp(x, -0.9, 0.9), Math.max(y, -0.78))
  const distance = (GROUND_Y - cam.eye[1]) / direction[1]
  const point = add(cam.eye, mul(direction, distance))
  return [point[0], GROUND_Y, point[2]]
}

/** 完成した枝葉を全て照合し、根元を動かさず同じ比率で画面内へ収める。 */
export const treeScale = (cam: Camera, root: V3, vertices: Float32Array) => {
  const m = cam.viewProj
  const clip = (p: V3) =>
    [0, 1, 3].map(
      (row) =>
        m[row] * p[0] + m[row + 4] * p[1] + m[row + 8] * p[2] + m[row + 12],
    )
  const origin = clip(root)
  let scale = 1
  for (let i = 0; i < vertices.length; i += STRIDE) {
    const end = clip([vertices[i], vertices[i + 1], vertices[i + 2]])
    // 葉の面と個別の葉の両方を含める。成長途中も起点との内分なので収まる。
    for (const [axis, margin] of [
      [0, 0.96],
      [1, 0.9],
    ])
      for (const sign of [-1, 1]) {
        const start = margin * origin[2] + sign * origin[axis]
        const finish = margin * end[2] + sign * end[axis]
        if (finish < start) scale = Math.min(scale, start / (start - finish))
      }
  }
  return clamp(scale)
}
