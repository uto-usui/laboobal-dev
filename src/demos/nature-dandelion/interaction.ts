import { FLIGHT, limitVelocity } from './flight.ts'

export const variation = (key: number) => {
  const value = Math.sin(key * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

export const rootDirection = (i: number, count: number) => {
  const y = 1 - (2 * (i + 0.5 + (variation(i * 47) - 0.5) * 0.7)) / count
  const ring = Math.sqrt(1 - y * y)
  const angle = i * 2.399963229728653 + (variation(i * 59) - 0.5) * 0.32
  return {
    direction: [Math.cos(angle) * ring, y, Math.sin(angle) * ring],
    angle,
  }
}

// マウスの hover は primary の印を必要としない。複数の指からは先頭の入力だけを受け取る。
export const acceptsPointer = (pointerType: string, isPrimary: boolean) =>
  pointerType !== 'touch' || isPrimary

type Point = { x: number; y: number; at: number }
export type Stroke = {
  from: Point
  to: Point
  distance: number
  strength: number
  velocity: number[]
  amount: number
}

export const createBreathInput = () => {
  let previous: Point | undefined
  let credit = 0
  return {
    reset() {
      previous = undefined
      credit = 0
    },
    move(
      x: number,
      y: number,
      at: number,
      height: number,
      head: number[],
      power: number,
    ): Stroke | undefined {
      const from = previous
      previous = { x, y, at }
      if (!from || at - from.at > 0.2) {
        credit = 0
        return
      }
      const dx = x - from.x
      const dy = y - from.y
      const distance = Math.hypot(dx, dy)
      const dt = Math.max(1 / 240, at - from.at)
      const speed = (distance * height) / (2 * dt)
      // 同じ CSS px/秒の操作なら、縦長でも埋め込みでも同じ本数になるようにする。
      const strength = Math.min(2.4, speed / 600) * power
      if (speed < 40 || strength <= 0) return
      const midX = (x + from.x) / 2
      const midY = (y + from.y) / 2
      const reach = Math.exp(
        -((midX - head[0]) ** 2 + (midY - head[1]) ** 2) / 0.09,
      )
      // 1 本分の蓄積を短いイベント間でも持ち越し、普通の一なぞりで数本を外す。
      credit += distance * reach * strength * 10
      const amount = Math.min(5, Math.floor(credit))
      credit -= amount
      // 本数に使う強さは保ち、流体の目標速度だけを見本の数倍までに抑える。
      const flowSpeed = (speed / 4800) * power
      return {
        from,
        to: previous,
        distance,
        strength,
        velocity: limitVelocity(
          [
            (dx / distance) * flowSpeed,
            (dy / distance) * flowSpeed,
            0.02 * strength,
          ],
          FLIGHT.breath,
        ),
        amount,
      }
    },
  }
}

export const selectNearbySeeds = (
  state: Uint8Array,
  roots: Float32Array,
  head: number[],
  stroke: Stroke,
) => {
  const dx = stroke.to.x - stroke.from.x
  const dy = stroke.to.y - stroke.from.y
  const scores = Array.from(state, (value, i) => {
    if (value !== 0) return { i, distance: Infinity }
    const scale = 1 / (1 + roots[i * 8 + 2] * 0.265 * 0.22)
    const x = (head[0] + roots[i * 8] * 0.265) * scale
    const y = (head[1] + roots[i * 8 + 1] * 0.265) * scale
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - stroke.from.x) * dx + (y - stroke.from.y) * dy) /
          stroke.distance ** 2,
      ),
    )
    return {
      i,
      distance: Math.hypot(
        x - stroke.from.x - t * dx,
        y - stroke.from.y - t * dy,
      ),
    }
  })
  // 点の間もなぞった範囲に含め、反対側の種まで外すことを避ける。
  return scores
    .filter(({ distance }) => distance <= 0.14)
    .sort((a, b) => a.distance - b.distance)
    .map(({ i }) => i)
}

export const detachSeeds = (
  state: Uint8Array,
  candidates: number[],
  amount: number,
  maxFlying: number,
) => {
  let active = 0
  for (const value of state) if (value === 1) active++
  const selected = candidates
    .filter((i) => state[i] === 0)
    .slice(0, Math.max(0, Math.min(amount, maxFlying - active)))
  for (const i of selected) state[i] = 1
  return selected
}

export const createRenewal = (count: number) => {
  let startedAt: number | undefined
  let resetDone = false
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value))
    return t * t * (3 - 2 * t)
  }
  return {
    get active() {
      return startedAt !== undefined
    },
    advance(time: number, attached: number) {
      if (startedAt === undefined && attached <= count / 4)
        startedAt = time + 2.5
      // 待っている間に種が戻った場合は、不要になった入れ替えを取り消す。
      if (startedAt !== undefined && time < startedAt && attached > count / 4)
        startedAt = undefined
      if (startedAt === undefined)
        return { y: -0.27, alpha: 1, reset: false, completed: false }
      const elapsed = time - startedAt
      if (elapsed < 0)
        return { y: -0.27, alpha: 1, reset: false, completed: false }
      const reset = elapsed >= 2 && !resetDone
      if (reset) resetDone = true
      const alpha =
        elapsed < 2 ? 1 - smooth(elapsed / 2) : smooth((elapsed - 2) / 3.5)
      const y =
        elapsed < 2 ? -0.27 - smooth(elapsed / 2) * 0.9 : -1.17 + alpha * 0.9
      const completed = elapsed >= 5.5
      if (completed) {
        startedAt = undefined
        resetDone = false
      }
      return { y, alpha, reset, completed }
    },
  }
}
