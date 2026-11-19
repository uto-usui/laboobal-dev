export type Vec3 = [number, number, number]
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3
export const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
export const mul = (a: Vec3, k: number): Vec3 => a.map((v) => v * k) as Vec3
export const dot = (a: Vec3, b: Vec3) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0)

export const REAL_STEP = 1 / 120
// 一次の指数追従にして、手を止めた後にばねの速度を持ち越さない。
export const GRAB_TIME = 0.0125
export const RELEASE_RATIO = 0.35
export const MAX_RELEASE_SPEED = 1.4
export const FREE_RADIUS = 3.5
export const RETURN_STRENGTH = 0.9
export const BULK_DRAG = 0.12
export const OUTWARD_DRAG = 0.9

export const releaseVelocity = (hand: Vec3): Vec3 =>
  mul(
    hand,
    Math.min(
      RELEASE_RATIO,
      MAX_RELEASE_SPEED / Math.max(Math.hypot(...hand), 0.000001),
    ),
  )

// 芯の並進だけに加える。円盤内部の相対速度は減衰させない。
export const returnAcceleration = (p: Vec3, v: Vec3): Vec3 => {
  const radius = Math.hypot(...p)
  const direction = mul(p, 1 / Math.max(radius, 0.000001))
  const outside = Math.max(0, radius - FREE_RADIUS)
  const outward = Math.max(0, dot(v, direction))
  const edge = Math.min(1, outside / 1.5)
  return sub(
    mul(v, -BULK_DRAG),
    mul(direction, RETURN_STRENGTH * outside + OUTWARD_DRAG * edge * outward),
  )
}
export const CAMERA_FOLLOW_TIME = 0.4
export const CAMERA_INERTIA_TIME = 0.25

export type Sample = { p: Vec3; t: number }
export const sampleVelocity = (samples: Sample[], now: number): Vec3 => {
  const last = samples.at(-1)!
  // 止めて持っている間も窓を進め、最後の移動速度を残し続けない。
  const end = Math.max(now, last.t)
  const start = Math.max(samples[0].t, end - 100)
  if (end - start < 8 || start >= last.t) return [0, 0, 0]
  let index = 0
  while (index + 1 < samples.length && samples[index + 1].t <= start) index++
  const a = samples[index]
  const b = samples[index + 1]
  const first = b
    ? add(a.p, mul(sub(b.p, a.p), (start - a.t) / (b.t - a.t)))
    : a.p
  return mul(sub(last.p, first), 1000 / (end - start))
}

export const appendSample = (samples: Sample[], p: Vec3, t: number) => {
  if (t > samples.at(-1)!.t) samples.push({ p, t })
  while (samples.length > 2 && samples[1].t <= t - 100) samples.shift()
}
