import { STRIDE, type V3 } from './tree'

export const GROUND_Y = 0
export const meshGround = () => {
  const vertices: number[] = []
  const indices: number[] = []
  const face = (points: V3[], normal: V3, material: number) => {
    const base = vertices.length / STRIDE
    for (const p of points)
      vertices.push(...p, ...normal, 0, 0, -1, material, ...p, 1, 1, 1)
    for (let i = 1; i < points.length - 1; i++)
      indices.push(base, base + i, base + i + 1)
  }
  face(
    [
      [-100, GROUND_Y, -100],
      [-100, GROUND_Y, 100],
      [100, GROUND_Y, 100],
      [100, GROUND_Y, -100],
    ],
    [0, 1, 0],
    -1,
  )
  // 林縁の奥は大きな面にまとめる。手前の植樹とは別の、動かない遠景。
  for (let i = 0; i < 13; i++) {
    const x = -25 + i * 4.2
    const z = -23 - Math.sin(i * 1.7) * 1.5
    const height = 3.7 + Math.sin(i * 2.3) * 0.35
    face(
      [
        [x - 0.1, 0, z],
        [x + 0.1, 0, z],
        [x + 0.08, height, z],
        [x - 0.08, height, z],
      ],
      [0, 0, 1],
      0,
    )
    const crown: V3[] = [[x, height, z]]
    for (let j = 0; j < 65; j++) {
      const turn = (j / 64) * Math.PI * 2
      const lobe = 0.93 + 0.07 * Math.cos(turn * 8 + i)
      crown.push([
        x + Math.cos(turn) * 3.2 * lobe,
        height + Math.sin(turn) * 2.2 * lobe,
        z,
      ])
    }
    face(crown, [0, 0.25, 0.97], 3)
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
