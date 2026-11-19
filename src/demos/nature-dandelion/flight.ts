// 見本の初速 0.10〜0.22 を基準に、強い息でも数秒は追える相対速度に収める。
export const FLIGHT = {
  initial: 0.18,
  air: 0.2,
  seed: 0.24,
  breath: 0.6,
} as const

export const limitVelocity = (velocity: number[], maximum: number) => {
  const scale = Math.min(
    1,
    maximum / Math.max(Math.hypot(...velocity), 0.000001),
  )
  return velocity.map((value) => value * scale)
}

export const flightWGSL = /* wgsl */ `
fn limitedVelocity(velocity: vec3f, maximum: f32) -> vec3f {
  return velocity * min(1.0, maximum / max(length(velocity), 0.000001));
}
fn seedAir(velocity: vec3f) -> vec3f {
  return limitedVelocity(velocity, ${FLIGHT.air});
}
`
