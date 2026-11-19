// 帯全体で連続する非周期の厚みを、独立して落とせる四つの小塊から読む。
const hash = (x: number, z: number, seed: number) => {
  let n =
    Math.imul(x, 374761393) ^
    Math.imul(z, 668265263) ^
    Math.imul(seed, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
const noise = (x: number, z: number, seed: number) => {
  const ix = Math.floor(x),
    iz = Math.floor(z)
  const fx = x - ix,
    fz = z - iz
  const sx = fx * fx * (3 - 2 * fx),
    sz = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz, seed),
    b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed),
    d = hash(ix + 1, iz + 1, seed)
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz
}
export const snowShape = (
  u: number,
  v: number,
  w: number,
  phase: number,
  growth = 1,
  erosion = 0,
) => {
  const band = Math.floor(phase / 4),
    part = phase - band * 4
  const along = (u + part * 2 - 3) / 4
  const broad = noise(along * 2.3 + 7, w * 1.7, band + 1)
  const small = noise(along * 13.7, w * 5.9 + 11, band + 9)
  const thickness = 0.93 + 0.09 * (broad - 0.5) + 0.026 * (small - 0.5)
  // 側縁と帯の両端だけを丸める。内部の境目で丸みを繰り返すと卵パックになる。
  const end = (part === 0 && u < -0.72) || (part === 3 && u > 0.72)
  const coreX = end ? Math.sign(u) * 0.72 : u
  const coreZ = Math.max(-0.62, Math.min(0.62, w))
  const dx = (u - coreX) / 0.28,
    dz = (w - coreZ) / 0.38
  const length = Math.max(1, Math.hypot(dx, v, dz))
  const x = coreX + (u - coreX) / length
  const z = coreZ + (w - coreZ) / length
  const level = (v / length + 1) * 0.5
  const footprint = Math.sqrt(Math.max(0, growth))
  const chip =
    1 - erosion * (0.14 + 0.07 * (Math.abs(x) ** 3 + Math.abs(z) ** 3))
  const bed = 0.08 * noise(along * 5 + 3, w * 3.7, band + 19)
  const height = Math.max(0, growth * thickness - (1 - growth) * bed) * chip
  return [
    x * 0.998 * footprint * chip,
    level * height,
    z * (0.96 + 0.035 * (broad - 0.5)) * footprint * chip,
  ]
}
export const snowVolume = (phase: number, growth = 1, erosion = 0) => {
  // 丸い側面では上面だけの積分が体積にならないため、閉じた六面の発散定理を使う。
  const n = 12
  let volume = 0
  const facePoint = (face: number, a: number, b: number) => {
    if (face < 2) return snowShape(face ? 1 : -1, a, b, phase, growth, erosion)
    if (face < 4)
      return snowShape(a, face === 3 ? 1 : -1, b, phase, growth, erosion)
    return snowShape(a, b, face === 5 ? 1 : -1, phase, growth, erosion)
  }
  const triangle = (a: number[], b: number[], c: number[]) =>
    (a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])) /
    6
  for (let face = 0; face < 6; face++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = (i * 2) / n - 1,
          b = (j * 2) / n - 1,
          step = 2 / n
        const p = facePoint(face, a, b),
          q = facePoint(face, a + step, b)
        const r = facePoint(face, a, b + step),
          s = facePoint(face, a + step, b + step)
        const sign = [-1, 1, 1, -1, -1, 1][face]
        volume += sign * (triangle(p, q, r) + triangle(r, q, s))
      }
  return volume
}
export const snowFrame = (slope: number) => {
  const length = Math.hypot(1, slope)
  return [1 / length, slope / length]
}
export const SNOW_SHAPE_WGSL = /* wgsl */ `
fn snowHash(p: vec2f, seed: f32) -> f32 {
  let i=bitcast<vec2u>(vec2i(p));
  var h=(i.x*374761393u) ^ (i.y*668265263u) ^ (u32(seed)*1442695041u);
  h=(h ^ (h >> 13u))*1274126177u;
  return f32(h ^ (h >> 16u))/4294967296.0;
}
fn snowNoise(p: vec2f, seed: f32) -> f32 {
  let i=floor(p); let f=fract(p); let s=f*f*(3.0-2.0*f);
  return mix(mix(snowHash(i,seed),snowHash(i+vec2f(1,0),seed),s.x),
    mix(snowHash(i+vec2f(0,1),seed),snowHash(i+vec2f(1,1),seed),s.x),s.y);
}
fn shape(q: vec3f, phase: f32, growth: f32, erosion: f32) -> vec3f {
  let band=floor(phase/4.0); let part=phase-band*4.0;
  let along=(q.x+part*2.0-3.0)/4.0;
  let broad=snowNoise(vec2f(along*2.3+7.0,q.z*1.7),band+1.0);
  let small=snowNoise(vec2f(along*13.7,q.z*5.9+11.0),band+9.0);
  let thickness=0.93+0.09*(broad-0.5)+0.026*(small-0.5);
  let roundEnd=(part==0.0 && q.x < -0.72)||(part==3.0 && q.x > 0.72);
  let coreX=select(q.x,sign(q.x)*0.72,roundEnd);
  let coreZ=clamp(q.z,-0.62,0.62);
  let delta=vec3f((q.x-coreX)/0.28,q.y,(q.z-coreZ)/0.38);
  let span=max(1.0,length(delta));
  let x=coreX+(q.x-coreX)/span; let z=coreZ+(q.z-coreZ)/span;
  let level=(q.y/span+1.0)*0.5;
  let footprint=sqrt(max(0.0,growth));
  let chip=1.0-erosion*(0.14+0.07*(pow(abs(x),3.0)+pow(abs(z),3.0)));
  let bed=0.08*snowNoise(vec2f(along*5.0+3.0,q.z*3.7),band+19.0);
  let height=max(0.0,growth*thickness-(1.0-growth)*bed)*chip;
  return vec3f(x*0.998*footprint*chip,level*height,z*(0.96+0.035*(broad-0.5))*footprint*chip);
}
`
