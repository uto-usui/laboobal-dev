import { pointAt, screenToWorld, type Bounds } from './projection'
import { pickBranchSite } from './picking'
import type { Scene } from './scene'

// DOM と Node 検査で、選択・投影・つかんだ位置のずれ・入力上限を共通にする。
export const startDrag = (
  scene: Scene,
  nodes: Float32Array,
  snow: Float32Array,
  position: number[],
  view: number[],
  bounds: Bounds,
  interpolation = 1,
) => {
  const site = pickBranchSite(
    scene,
    nodes,
    snow,
    position,
    view,
    bounds,
    interpolation,
  )
  if (!site) return
  const origin = screenToWorld(position, view, bounds)
  const a = pointAt(nodes, scene.segments[site.edge * 4], interpolation)
  const b = pointAt(nodes, scene.segments[site.edge * 4 + 1], interpolation)
  const offset = [0, 1].map(
    (k) => a[k] * (1 - site.t) + b[k] * site.t - origin[k],
  )
  return { ...site, origin, offset }
}
export type Drag = NonNullable<ReturnType<typeof startDrag>>
export const dragGrip = (
  drag: Drag,
  position: number[],
  view: number[],
  bounds: Bounds,
) => {
  const target = screenToWorld(position, view, bounds)
  const dx = target[0] - drag.origin[0],
    dy = target[1] - drag.origin[1]
  const limit = Math.min(1, 2.8 / Math.max(Math.hypot(dx, dy), 0.0001))
  return [
    drag.origin[0] + dx * limit,
    drag.origin[1] + dy * limit,
    ...drag.offset,
  ]
}
