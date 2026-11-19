import { POINT_STRIDE } from './scene'

export interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

export const viewForSize = (width: number, height: number) => {
  const aspect = Math.max(1, width) / Math.max(1, height)
  const halfWidth = width < 600 ? 4.05 : Math.max(7.2, aspect * 3.5)
  return [0, 0.5, halfWidth, halfWidth / aspect]
}

const DEPTH_X = 0.1
const DEPTH_Y = 0.06

export const pointAt = (nodes: Float32Array, id: number, interpolation = 1) => {
  const offset = id * POINT_STRIDE
  return [0, 1, 2].map(
    (k) =>
      nodes[offset + 4 + k] +
      (nodes[offset + k] - nodes[offset + 4 + k]) * interpolation,
  )
}

export const projectToScreen = (
  point: number[],
  view: number[],
  bounds: Bounds,
) => [
  bounds.left +
    ((point[0] + point[2] * DEPTH_X - view[0]) / view[2] + 1) *
      bounds.width *
      0.5,
  bounds.top +
    (1 - (point[1] + point[2] * DEPTH_Y - view[1]) / view[3]) *
      bounds.height *
      0.5,
]

// 入力と許容幅は描画バッファの解像度ではなく、表示中の CSS ピクセルで測る。
export const screenToWorld = (
  position: number[],
  view: number[],
  bounds: Bounds,
) => [
  view[0] +
    ((position[0] - bounds.left) / Math.max(1, bounds.width) - 0.5) *
      view[2] *
      2,
  view[1] +
    (0.5 - (position[1] - bounds.top) / Math.max(1, bounds.height)) *
      view[3] *
      2,
]

export const PROJECTION_WGSL = /* wgsl */ `
fn project(p: vec3f) -> vec4f {
  return vec4f((p.x + p.z * ${DEPTH_X} - u.view.x) / u.view.z,
    (p.y + p.z * ${DEPTH_Y} - u.view.y) / u.view.w, 0.5 - p.z * 0.025, 1.0);
}
`
