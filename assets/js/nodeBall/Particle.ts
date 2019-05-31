type Options = {
  x: number
  y: number
  size: number
  color: string
  originSpeed: number
  contentW?: number
  contentH?: number
}

class Particle {
  /** x / y position */
  public x: number
  public y: number

  /**
   * x / y vector
   * ベクトル
   * Particle 同士が衝突した時に更新される
   */
  public vx: number
  public vy: number

  /** size */
  readonly size: number

  /** angle */
  private angle: number

  /** origin speed */
  private originSpeed: number

  /** color name hex */
  readonly color: string

  /** wrapper content size */
  private contentH: number
  private contentW: number

  constructor({
    x = 0,
    y = 0,
    size = 0,
    color = '',
    originSpeed = 0,
    contentW = window.innerWidth * 2,
    contentH = window.innerHeight * 2,
  }: Options) {
    this.x = x
    this.y = y
    this.size = size
    this.color = color
    this.originSpeed = originSpeed
    this.contentW = contentW
    this.contentH = contentH
    this.angle = Math.random() * Math.PI * 2
    this.vx = originSpeed * Math.cos(this.angle)
    this.vy = originSpeed * Math.sin(this.angle)
  }

  /**
   * フレーム毎に更新する
   */
  update(): void {
    this.checkScreenEdge()

    // ベクトル
    const cv = { s: this.currentSpeed(), a: this.currentAngle() }

    // ease-out してだんだん遅くなるように
    if (this.originSpeed < cv.s) {
      this.vx -= Math.cos(cv.a) * (cv.s - this.originSpeed) * 0.1
      this.vy -= Math.sin(cv.a) * (cv.s - this.originSpeed) * 0.1
    }

    this.updatePosition()
  }

  /**
   * 衝突した瞬間のフレーム
   */
  updateWithCollision(): void {
    this.checkScreenEdge()
    this.updatePosition()
  }

  /**
   * 座標のアップデート
   */
  updatePosition(): void {
    this.x += this.vx
    this.y += this.vy
  }

  /**
   * 画面端の処理
   */
  checkScreenEdge(): void {
    if (this.x - this.size < 0 || this.x + this.size > this.contentW) {
      this.vx *= -1
    } else if (this.y - this.size < 0 || this.y + this.size > this.contentH) {
      this.vy *= -1
    }
  }

  /**
   * ベクトルの強さを求める
   */
  currentSpeed(): number {
    return Math.hypot(this.vx, this.vy)
  }

  /**
   * Calculate vector direction
   * // ベクトルの向きを求める
   */
  currentAngle(): number {
    return Math.atan2(this.vy, this.vx)
  }
}

export default Particle
