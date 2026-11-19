import { touchGate } from '../../shared/touch'
import { DISK_RADIUS } from './appearance'
import { COMPANION_SCALE, SOFTENING, STEP } from './initial'
import {
  add,
  sub,
  mul,
  dot,
  appendSample,
  sampleVelocity,
  CAMERA_FOLLOW_TIME,
  releaseVelocity,
  returnAcceleration,
  REAL_STEP,
  CAMERA_INERTIA_TIME,
  type Vec3,
  type Sample,
} from './interaction'

export const createControls = (
  canvas: HTMLCanvasElement,
  path: SVGPolylineElement,
  seed: Float32Array,
  changed: () => void,
) => {
  const offTouch = touchGate(canvas)
  const abort = new AbortController()
  const options = { signal: abort.signal }
  let cores = [
    Array.from(seed.slice(0, 8)),
    Array.from(seed.slice(seed.length / 2, seed.length / 2 + 8)),
  ]
  let yaw = -0.42
  let tilt = 0.35
  let angularVelocity: Vec3 = [0, 0, 0]
  let right: Vec3 = [1, 0, 0]
  let up: Vec3 = [0, 1, 0]
  let center: Vec3 = [0, 0, 0]
  let extent: [number, number] = [8, 6]
  let initialized = false
  let width = 800
  let height = 450
  let pointer: [number, number] | undefined
  let hovered = false
  let highlight = 0
  let pendingRelease: Vec3 | undefined
  let reducedShift: Vec3 = [0, 0, 0]
  let reducedMode = false
  let settling = false
  let gesture:
    | {
        id: number
        mode: 'galaxy' | 'camera'
        active: boolean
        x: number
        y: number
        last: Vec3
        target: Vec3
        samples: Sample[]
      }
    | undefined
  const position = (g: number): Vec3 => cores[g].slice(0, 3) as Vec3
  const project = (p: Vec3) => {
    const d = sub(p, center)
    return [
      (0.5 + dot(d, right) / extent[0] / 2) * width,
      (0.5 - dot(d, up) / extent[1] / 2) * height,
    ]
  }
  const unproject = (x: number, y: number) =>
    add(
      center,
      add(
        mul(right, ((x / width) * 2 - 1) * extent[0]),
        mul(up, (1 - (y / height) * 2) * extent[1]),
      ),
    )
  const coordinates = (e: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }
  const hit = (x: number, y: number) => {
    const core = project(position(1))
    // 真横でもつかめるよう、円盤の長軸に相当する円形の範囲を確保する。
    const radius = Math.max(
      60,
      DISK_RADIUS *
        COMPANION_SCALE *
        Math.max(width / (2 * extent[0]), height / (2 * extent[1])),
    )
    return Math.hypot(core[0] - x, core[1] - y) <= radius
  }
  const refreshHover = () => {
    hovered = !gesture && !!pointer && hit(...pointer)
    canvas.style.cursor = gesture ? 'grabbing' : hovered ? 'grab' : 'move'
  }
  const showPath = () => {
    if (gesture?.mode !== 'galaxy' || !gesture.active) {
      path.parentElement!.classList.add('is-hidden')
      return
    }
    let p = position(1)
    const rate = STEP / REAL_STEP
    let v = mul(
      releaseVelocity(sampleVelocity(gesture.samples, performance.now())),
      1 / rate,
    )
    const primary = position(0)
    const points: string[] = []
    // 今離した場合の芯の速度。主銀河を固定した近似で、実際は全標本の重力に従う。
    for (let i = 0; i < 48; i++) {
      points.push(project(p).join(','))
      const d = sub(primary, p)
      v = add(
        v,
        mul(
          add(
            mul(d, 1 / (dot(d, d) + SOFTENING ** 2) ** 1.5),
            mul(returnAcceleration(p, mul(v, rate)), 1 / (rate * rate)),
          ),
          0.06,
        ),
      )
      p = add(p, mul(v, 0.06))
    }
    path.setAttribute('points', points.join(' '))
    path.parentElement!.setAttribute('viewBox', `0 0 ${width} ${height}`)
    path.parentElement!.classList.remove('is-hidden')
  }
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.isPrimary || e.button !== 0 || gesture) return
      const [x, y] = coordinates(e)
      const mode = hit(x, y) ? 'galaxy' : 'camera'
      angularVelocity = [0, 0, 0]
      gesture = {
        id: e.pointerId,
        mode,
        active: e.pointerType !== 'touch',
        x,
        y,
        last: unproject(x, y),
        target: position(1),
        samples: [
          {
            p: mode === 'galaxy' ? position(1) : [yaw, tilt, 0],
            t: e.timeStamp,
          },
        ],
      }
      pointer = e.pointerType === 'touch' ? undefined : [x, y]
      canvas.setPointerCapture(e.pointerId)
      refreshHover()
      changed()
    },
    options,
  )
  const movePointer = (e: PointerEvent) => {
    if (gesture?.id !== e.pointerId) return
    const [x, y] = coordinates(e)
    if (!gesture.active) {
      if (Math.hypot(x - gesture.x, y - gesture.y) < 10) return
      // pan-y の縦始まりはブラウザへ任せ、pointercancel で終える。
      if (
        canvas.style.touchAction !== 'none' &&
        Math.abs(y - gesture.y) > Math.abs(x - gesture.x)
      )
        return
      gesture.active = true
    }
    if (gesture.mode === 'camera') {
      yaw -= (x - gesture.x) * 0.006
      tilt = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, tilt + (y - gesture.y) * 0.006),
      )
      appendSample(gesture.samples, [yaw, tilt, 0], e.timeStamp)
    } else {
      const p = unproject(x, y)
      const delta = sub(p, gesture.last)
      gesture.target = add(gesture.target, delta)
      if (reducedMode) reducedShift = add(reducedShift, delta)
      gesture.last = p
      appendSample(gesture.samples, gesture.target, e.timeStamp)
    }
    gesture.x = x
    gesture.y = y
    changed()
  }
  canvas.addEventListener(
    'pointermove',
    (e) => {
      pointer = e.pointerType === 'touch' ? undefined : coordinates(e)
      if (gesture) movePointer(e)
      refreshHover()
      changed()
    },
    options,
  )
  canvas.addEventListener(
    'pointerleave',
    () => {
      pointer = undefined
      refreshHover()
      changed()
    },
    options,
  )
  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (gesture?.id !== e.pointerId) return
    if (!cancelled && gesture.active) movePointer(e)
    if (gesture.mode === 'camera' && gesture.active && !cancelled)
      angularVelocity = sampleVelocity(gesture.samples, e.timeStamp)
    if (gesture.mode === 'galaxy' && gesture.active && !reducedMode)
      pendingRelease = cancelled
        ? [0, 0, 0]
        : releaseVelocity(sampleVelocity(gesture.samples, e.timeStamp))
    gesture = undefined
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId)
    refreshHover()
    showPath()
    changed()
  }
  canvas.addEventListener('pointerup', (e) => finish(e, false), options)
  canvas.addEventListener('pointercancel', (e) => finish(e, true), options)
  canvas.addEventListener('lostpointercapture', (e) => finish(e, true), options)
  return {
    get active() {
      return gesture?.active === true
    },
    get settling() {
      return settling
    },
    frame(w: number, h: number, dt = 0, reduced = false) {
      width = w
      height = h
      reducedMode = reduced
      if (!reduced) reducedShift = [0, 0, 0]
      settling = false
      if (reduced) angularVelocity = [0, 0, 0]
      if (!gesture && dt > 0) {
        const decay = Math.exp(-dt / CAMERA_INERTIA_TIME)
        const turn = mul(angularVelocity, CAMERA_INERTIA_TIME * (1 - decay))
        yaw += turn[0]
        const nextTilt = tilt + turn[1]
        tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, nextTilt))
        angularVelocity = mul(angularVelocity, decay)
        if (tilt !== nextTilt) angularVelocity[1] = 0
        if (Math.hypot(...angularVelocity) < 0.001) angularVelocity = [0, 0, 0]
      }
      right = [Math.cos(yaw), Math.sin(yaw), 0]
      up = [
        -Math.sin(yaw) * Math.cos(tilt),
        Math.cos(yaw) * Math.cos(tilt),
        Math.sin(tilt),
      ]
      if (!gesture || !initialized) {
        const targetCenter = mul(add(position(0), position(1)), 0.5)
        const separation = sub(position(1), position(0))
        const scale = Math.min(
          w / 16,
          h / 12,
          w / (Math.abs(dot(separation, right)) + 7),
          h / (Math.abs(dot(separation, up)) + 7),
        )
        const blend = initialized ? 1 - Math.exp(-dt / CAMERA_FOLLOW_TIME) : 1
        settling =
          Math.hypot(...sub(targetCenter, center)) > 0.0001 ||
          extent.some((v, i) => Math.abs(v - [w, h][i] / (2 * scale)) > 0.0001)
        center = add(center, mul(sub(targetCenter, center), blend))
        extent = extent.map(
          (v, i) => v + ([w, h][i] / (2 * scale) - v) * blend,
        ) as [number, number]
        initialized = true
      }
      refreshHover()
      const targetHighlight =
        gesture?.mode === 'galaxy' ? 0.18 : hovered ? 0.12 : 0
      settling ||=
        Math.hypot(...angularVelocity) > 0 ||
        Math.abs(targetHighlight - highlight) > 0.0001
      highlight += (targetHighlight - highlight) * (1 - Math.exp(-dt / 0.08))
      showPath()
      return {
        center: [...center, 0],
        right: [...right, 0],
        up: [...up, 0],
        extent,
        highlight,
      }
    },
    snapshot(data: Float32Array) {
      // 操作中も実際に動く芯を読み、手元の仮の位置では上書きしない。
      cores = [Array.from(data.slice(0, 8)), Array.from(data.slice(8, 16))]
    },
    force() {
      const active = gesture?.mode === 'galaxy' && gesture.active
      return {
        anchor: [...(gesture?.target ?? position(1)), active ? 1 : 0],
      }
    },
    consumeRelease() {
      const velocity = pendingRelease
      pendingRelease = undefined
      return velocity
    },
    consumeReducedShift() {
      // 動きを減らす設定では入力の位置変更だけを描き、自動の追従運動は起こさない。
      const shift = reducedShift
      reducedShift = [0, 0, 0]
      if (Math.hypot(...shift) > 0) return [...shift, 0]
      return undefined
    },
    destroy() {
      abort.abort()
      offTouch()
    },
  }
}
