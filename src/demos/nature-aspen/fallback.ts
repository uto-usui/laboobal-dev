import { createSettledLeaves } from './contacts'
import {
  leafPivot,
  branchRadius,
  branchSurface,
  BRANCH_SIDES,
  branchX,
  branchY,
  BRANCH_SEGMENTS,
  BUD_SEGMENTS,
  type Leaf,
  leafBasis,
  stemControls,
  stemPoint,
} from './simulation'

/** 同じ葉の配置から作る静止画。GPU が使えなくても外の画像を読まずに表示する。 */
export const fallback = (narrow: boolean) => {
  const width = narrow ? 360 : 800
  const height = 450
  const halfHeight = Math.max(3, (2.65 * height) / width)
  const scale = height / (2 * halfHeight)
  const prefix = narrow ? 'aspen-n' : 'aspen-w'
  const project = (x: number, y: number) =>
    `${(width / 2 + x * scale).toFixed(1)},${(height / 2 - y * scale).toFixed(1)}`
  const pivot = (leaf: Leaf) => leafPivot(leaf, 0)
  const point = (leaf: Leaf, s: number, t: number) => {
    const basis = leafBasis(leaf, 0)
    const x =
      s *
      0.5 *
      Math.sin(t * Math.PI) ** leaf.shape[0] *
      (1.13 - leaf.shape[1] * t) *
      leaf.width *
      (1 + 0.008 * Math.sin(t * 191 + leaf.phase))
    const y = -leaf.stem - t * leaf.length
    const z =
      leaf.z +
      0.105 * s * s * Math.sin(t * Math.PI) +
      (0.07 + leaf.bend) * t * t +
      0.025 * (1 - Math.abs(s)) * Math.sin(t * Math.PI) +
      0.022 * s * t
    return project(
      pivot(leaf)[0] + x * basis[0][0] + y * basis[1][0] + z * basis[2][0],
      pivot(leaf)[1] + x * basis[0][1] + y * basis[1][1] + z * basis[2][1],
    )
  }
  const leaves = createSettledLeaves(narrow)
  const leafShapes = [2, 3, 4, 5, 0, 1]
    .filter((i) => i < leaves.length)
    .map((i) => {
      const leaf = leaves[i]
      const edge = [
        ...Array.from({ length: 49 }, (_, j) => point(leaf, -1, j / 48)),
        ...Array.from({ length: 49 }, (_, j) => point(leaf, 1, 1 - j / 48)),
      ]
      const veins = Array.from({ length: 5 }, (_, j) => {
        const t = 0.12 + j * 0.145
        return [-1, 1]
          .map(
            (side) =>
              `<path d="M${point(leaf, 0, t)} Q${point(leaf, side * 0.48, t + 0.1)} ${point(leaf, side * 0.92, Math.min(0.97, t + 0.22))}"/>`,
          )
          .join('')
      }).join('')
      const mainVein = `M${point(leaf, 0, 0)} Q${point(leaf, 0.015, 0.5)} ${point(leaf, 0, 0.96)}`
      const [px, py] = pivot(leaf)
      const controls = stemControls(leaf)
      const control = (i: number) =>
        project(px + controls[i][0], py + controls[i][1])
      const end = stemPoint(controls, 1)
      const stem = `M${project(px, py)} C${control(1)} ${control(2)} ${project(px + end[0], py + end[1])}`
      return `<path d="${stem}" fill="none" stroke="#8a5031" stroke-width="1.6"/>
      <path d="M${edge.join('L')}Z" fill="url(#${prefix}-leaf-${i})" stroke="#82431f" stroke-width="0.6"/>
      <g fill="none" stroke="#8c691d" stroke-width="0.65" opacity="0.52">${veins}<path d="${mainVein}" stroke-width="1.15"/></g>`
    })
    .join('')
  const gradients = leaves
    .map((leaf, i) => {
      const rgb = (factor: number) => {
        const channels = leaf.color.map((v) => {
          const linear = Math.min(1, v * factor)
          return Math.round(
            255 *
              (linear <= 0.0031308
                ? 12.92 * linear
                : 1.055 * linear ** (1 / 2.4) - 0.055),
          )
        })
        return `rgb(${channels.join(',')})`
      }
      return `<radialGradient id="${prefix}-leaf-${i}">
      <stop stop-color="${rgb(1.15)}"/>
      <stop offset="0.55" stop-color="${rgb(1)}"/>
      <stop offset="1" stop-color="${rgb(0.78)}"/>
    </radialGradient>`
    })
    .join('')
  const branchEdge = (side: number) =>
    Array.from({ length: BRANCH_SEGMENTS + 1 }, (_, i) => {
      const x = branchX(i)
      const p = branchSurface(x, side > 0 ? 0 : BRANCH_SIDES / 2, leaves)
      return project(p[0], p[1])
    })
  const branch = [...branchEdge(1), ...branchEdge(-1).reverse()].join('L')
  const budEdge = (side: number) => branchEdge(side).slice(0, BUD_SEGMENTS + 1)
  const bud = [...budEdge(1), ...budEdge(-1).reverse()].join('L')
  const scars = leaves
    .map((leaf) => {
      const [x, y] = project(
        leaf.x + 0.055,
        branchY(leaf.x) +
          Math.sign(pivot(leaf)[1] - branchY(leaf.x)) *
            branchRadius(leaf.x) *
            0.55,
      ).split(',')
      return `<ellipse cx="${x}" cy="${y}" rx="${Math.max(1, scale * 0.035)}" ry="${Math.max(0.7, scale * 0.018)}" fill="#492c19" stroke="#ac824c" stroke-width="0.55" transform="rotate(-18 ${x} ${y})"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <filter id="${prefix}-blur"><feGaussianBlur stdDeviation="36"/></filter>
      <filter id="${prefix}-trunks"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="${prefix}-bokeh"><feGaussianBlur stdDeviation="10"/></filter>
      <linearGradient id="${prefix}-bark" x1="0" y1="0" x2="0.3" y2="1">
        <stop stop-color="#9a7448"/><stop offset="0.48" stop-color="#62442b"/><stop offset="1" stop-color="#352619"/>
      </linearGradient>
      ${gradients}
    </defs>
    <path fill="#8e7953" d="M0 0H${width}V${height}H0Z"/>
    <g filter="url(#${prefix}-blur)">
      <ellipse fill="#c9904b" cx="${width * 0.22}" cy="40" rx="${width * 0.46}" ry="160"/>
      <ellipse fill="#626a62" cx="${width * 0.26}" cy="380" rx="${width * 0.38}" ry="205"/>
      <ellipse fill="#d6a254" cx="${width * 0.86}" cy="240" rx="${width * 0.29}" ry="240"/>
      <ellipse fill="#a87849" cx="${width * 0.64}" cy="450" rx="${width * 0.3}" ry="130"/>
    </g>
    <g filter="url(#${prefix}-trunks)" stroke-linecap="round">
      <path d="M${width * 0.12} -40l12 540" stroke="#454432" stroke-width="28"/>
      <path d="M${width * 0.36} -40l-16 540" stroke="#56513a" stroke-width="42"/>
      <path d="M${width * 0.72} -40l14 540" stroke="#585038" stroke-width="24"/>
      <path d="M${width * 0.91} -40l-8 540" stroke="#4b4933" stroke-width="34"/>
    </g>
    <g filter="url(#${prefix}-bokeh)" fill="#ffe5a0" opacity="0.6">
      <circle cx="${width * 0.17}" cy="80" r="44"/>
      <circle cx="${width * 0.55}" cy="45" r="57"/>
      <circle cx="${width * 0.83}" cy="250" r="40"/>
      <circle cx="${width * 0.45}" cy="355" r="34"/>
    </g>
    <path d="M${branch}Z" fill="url(#${prefix}-bark)"/>
    <path d="M${bud}Z" fill="#713620"/>
    ${scars}
    ${leafShapes}
  </svg>`
}
