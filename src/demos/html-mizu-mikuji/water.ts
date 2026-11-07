/**
 * 水盤の水。真上から見た水盤の横方向（x、px）に列を並べ、列ごとの水の深さを 1 次元の浅水方程式で動かす。
 * 底はゆるい椀の形（真ん中がいちばん低い）なので、平らに置くと水は真ん中に溜まり、傾けると低い側へ寄る。
 * 量は列のあいだの流れでしか動かさないので、揺らしても変わらない
 */
export class Water {
  readonly n: number
  /** 列ごとの水の深さ（px） */
  readonly h: Float64Array
  /** 列ごとの底の高さ（px） */
  readonly bed: Float64Array
  /** 列のあいだの流れの速さ（px/s）。u[0] と u[n] は壁なので 0 のまま */
  readonly u: Float64Array
  /** 底の石の濡れ（0〜1）。水が引くとゆっくり乾く */
  readonly wet: Float64Array
  width = 0
  dx = 0
  g = 0
  damping = 1.6
  private flux: Float64Array
  private scale: Float64Array

  constructor(n: number) {
    this.n = n
    this.h = new Float64Array(n)
    this.bed = new Float64Array(n)
    this.u = new Float64Array(n + 1)
    this.wet = new Float64Array(n)
    this.flux = new Float64Array(n + 1)
    this.scale = new Float64Array(n)
  }

  /**
   * 幅 width の椀を作り、平らに置いたときに真ん中から左右 rest（幅に対する割合）まで水が届く量を張る
   */
  resize(width: number, rest: number) {
    this.width = width
    this.dx = width / this.n
    // 揺れの周期が水盤の大きさによらないよう、重力を幅に比例させる
    this.g = 12000 * (width / 600)
    // 椀の縁の高さ。いちばん傾けたとき、水の中心が端の札の上まで行く深さにしている
    const depth = width * 0.1
    const level = depth * (rest * 2) ** 2
    for (let i = 0; i < this.n; i++) {
      const t = ((i + 0.5) / this.n) * 2 - 1
      this.bed[i] = depth * t * t
      this.h[i] = Math.max(0, level - this.bed[i])
      this.wet[i] = this.h[i] > 0 ? 1 : 0
    }
    this.u.fill(0)
  }

  get volume() {
    let v = 0
    for (let i = 0; i < this.n; i++) v += this.h[i]
    return v * this.dx
  }

  /** 揺れの大きさの目安。止まったかどうかを見る */
  get energy() {
    let e = 0
    for (let i = 1; i < this.n; i++) e += this.u[i] * this.u[i]
    return Math.sqrt(e / this.n)
  }

  /** 1 ステップの間に波が列を飛び越えないための、時間の刻みの上限（CFL 条件） */
  get maxStep() {
    let deepest = 1
    for (let i = 0; i < this.n; i++) deepest = Math.max(deepest, this.h[i])
    return (0.5 * this.dx) / Math.sqrt(this.g * deepest)
  }

  /** 傾き roll（ラジアン、正なら右が下がる）のときに dt 秒すすめる */
  step(dt: number, roll: number) {
    const { n, h, bed, u, flux, scale, dx } = this
    const gx = this.g * Math.sin(roll)
    const gy = this.g * Math.cos(roll)
    // 小さなさざ波は早めに消す。大きな揺れの余韻は残し、静まるまでを数秒に収める
    const calm = Math.exp(-this.energy / 4)
    const keep = Math.exp(-(this.damping + 2.8 * calm) * dt)
    const DRY = 0.01
    for (let i = 1; i < n; i++) {
      const a = i - 1
      const ea = h[a] + bed[a]
      const eb = h[i] + bed[i]
      // 乾いた側の底が水面より高ければ、そこは壁と同じ。水のない所から押す力を作らない
      if ((h[a] < DRY && eb <= bed[a]) || (h[i] < DRY && ea <= bed[i])) {
        u[i] = 0
        continue
      }
      u[i] = (u[i] + dt * (gx - (gy * (eb - ea)) / dx)) * keep
    }
    // 格子 1 つおきのぎざぎざが育たないよう、流れを隣とならす
    for (let i = 1; i < n; i++) {
      flux[i] = 0.06 * (u[i - 1] - 2 * u[i] + u[i + 1])
    }
    for (let i = 1; i < n; i++) u[i] += flux[i]

    for (let i = 1; i < n; i++) {
      const donor = u[i] > 0 ? h[i - 1] : h[i]
      flux[i] = (u[i] * donor * dt) / dx
    }
    flux[0] = 0
    flux[n] = 0
    // 出ていく量が今ある量を超えないように縮める。深さが負にならず、量も保たれる
    for (let i = 0; i < n; i++) {
      const out = Math.max(flux[i + 1], 0) + Math.max(-flux[i], 0)
      scale[i] = out > h[i] ? h[i] / out : 1
    }
    for (let i = 1; i < n; i++) {
      flux[i] *= flux[i] > 0 ? scale[i - 1] : scale[i]
    }
    for (let i = 0; i < n; i++) h[i] = Math.max(0, h[i] - flux[i + 1] + flux[i])
  }

  /** 底の石の濡れを dt 秒すすめる */
  dry(dt: number, time = 3) {
    for (let i = 0; i < this.n; i++) {
      this.wet[i] = this.h[i] > 0.3 ? 1 : Math.max(0, this.wet[i] - dt / time)
    }
  }

  private sample(arr: Float64Array, x: number) {
    const f = Math.min(Math.max(x / this.dx - 0.5, 0), this.n - 1)
    const i = Math.min(Math.floor(f), this.n - 2)
    const t = f - i
    return arr[i] * (1 - t) + arr[i + 1] * t
  }

  /** x での水の深さ */
  depth(x: number) {
    return this.sample(this.h, x)
  }

  /** x での水面の高さの傾き */
  slope(x: number) {
    const e = this.dx
    const s = (p: number) => this.sample(this.h, p) + this.sample(this.bed, p)
    return (s(x + e) - s(x - e)) / (2 * e)
  }

  /** x での流れの速さ */
  flow(x: number) {
    const f = Math.min(Math.max(x / this.dx, 0), this.n)
    const i = Math.min(Math.floor(f), this.n - 1)
    const t = f - i
    return this.u[i] * (1 - t) + this.u[i + 1] * t
  }
}
