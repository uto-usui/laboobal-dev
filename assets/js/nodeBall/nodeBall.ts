/**
 * reference
 *   - https://codepen.io/mnmxmx/pen/mEVxeg
 *   @author Misaki Nakano
 *
 *
 */
import math from '../math'
import Particle from './Particle'

type Options = {
  canvas: HTMLCanvasElement
}

const densityX = 140
const densityY = 160
const size = {
  largeSize: [24, 18, 16],
  middleSize: [14, 12],
  smallSize: [10, 6],
}
const colorPallet1 = ['#4ECCA3', '#5A81E5', '#E5754A', '#A98BF3']
const colorPallet2 = ['#3b9372', '#3e549b', '#6a519b']
const colorPallet3 = ['#235542', '#463b5f']
const originSpeed = 0.5
const speed = 18.8

const largeParticles: Particle[] = []
const middleParticles: Particle[] = []
const smallParticles: Particle[] = []

let collision = false

/**
 * NodeBalls Class
 * 衝突判定を持った縁を動かして線でつなぐ
 */
class NodeBalls {
  //
  /** requestAnimationFrame id */
  private animationID: number

  /** target canvas element */
  private canvas: HTMLCanvasElement

  /** canvas context */
  private context: CanvasRenderingContext2D

  /** content wrapper size */
  private width: number
  private height: number

  /** each particle divide space */
  private divideX: number
  private divideY: number

  /** dat params */
  private params: { speed: number }

  /* aa **/
  private gui: any

  /** dat.gui */
  // private gui: dat.GUI
  //
  constructor({ canvas }: Options) {
    this.canvas = canvas
    this.context = this.canvas.getContext('2d') as CanvasRenderingContext2D

    this.width = window.innerWidth * 2
    this.height = window.innerHeight * 2

    this.canvas.width = this.width
    this.canvas.height = this.height

    this.divideX = Math.floor(this.width / densityX)
    this.divideY = Math.floor(this.height / densityY)

    this.animationID = 0

    // Parameter object
    this.params = {
      speed: 5.5,
    }

    this.init()
  }

  public init(): void {
    this.createParticles()
    this.render()
    this.dat()
  }

  private dat(): void {
    this.gui = new window.dat.GUI()
    this.gui.add(this.params, 'speed', 0.5, 100)
  }

  /**
   * パーティクルを追加します。
   */
  private createParticles() {
    // loop for grid
    for (let h = 0; h < this.divideY; h += 1) {
      for (let w = 0; w < this.divideX; w += 1) {
        // avoid collision
        // place in grid and then random shift
        const x = densityX * w + 80 + (densityX - 160) * Math.random()
        const y = densityY * h + 80 + (densityY - 160) * Math.random()

        // create random size particle
        // 数を大きくすれば省かれるので、グリッド状に穴ができて自然に見える
        const randomNum = Math.floor(Math.random() * 5.5)
        if (randomNum === 0 || randomNum === 2) {
          const num = Math.floor(Math.random() * size.largeSize.length)
          largeParticles.push(
            new Particle({
              x,
              y,
              size: size.largeSize[num],
              color:
                colorPallet1[Math.floor(Math.random() * colorPallet1.length)],
              originSpeed,
            }),
          )
        }
        if (randomNum === 0 || randomNum === 1) {
          const num = Math.floor(Math.random() * size.middleSize.length)
          middleParticles.push(
            new Particle({
              x,
              y,
              size: size.middleSize[num],
              color:
                colorPallet2[Math.floor(Math.random() * colorPallet2.length)],
              originSpeed,
            }),
          )
        }
        if (randomNum === 1 || randomNum === 2) {
          const num = Math.floor(Math.random() * size.smallSize.length)
          smallParticles.push(
            new Particle({
              x,
              y,
              size: size.smallSize[num],
              color:
                colorPallet3[Math.floor(Math.random() * colorPallet3.length)],
              originSpeed,
            }),
          )
        }
      }
    }
  }

  /**
   * パーティクルを更新します。
   */
  private draw(array: Particle[]): void {
    this.checkDistance(array)

    for (let i = 0, len = array.length; i < len; i++) {
      const p = array[i]

      !collision ? p.update() : p.updateWithCollision()
      //
      this.context.globalAlpha = 1
      this.context.fillStyle = p.color
      this.context.beginPath()
      this.context.arc(p.x, p.y, p.size, 0, Math.PI * 2, false)
      this.context.fill()
    }
  }

  /**
   * フレーム毎に更新する
   */
  private render(): void {
    // 残像効果
    // this.context.globalAlpha = 0.25
    // this.context.fillStyle = '#232931'
    // this.context.fillRect(0, 0, this.width, this.height)
    // this.context.globalAlpha = 1

    // 画面初期化
    this.context.clearRect(0, 0, this.width, this.height)
    this.draw(smallParticles)
    this.draw(middleParticles)
    this.draw(largeParticles)
    this.animationID = requestAnimationFrame(() => {
      this.render()
    })
  }

  /**
   * check particle distance from each other
   * @param array Particle[]
   */
  private checkDistance(array: Particle[]): void {
    // 自分と全てのParticleとの距離を調べる
    for (let i = 0, len = array.length; i < len - 1; i++) {
      for (let j = i + 1; j < len; j++) {
        const p0 = array[i]
        const p1 = array[j]

        // オブジェクト同士の距離
        const pDistance = math.distance(p0.x, p0.y, p1.x, p1.y)

        // オブジェクト同士の角度
        const pAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x)

        // オブジェクト同士の距離が近ければ線を結ぶ
        if (
          (pDistance < 200 && array === largeParticles) ||
          (pDistance < 150 && array === middleParticles) ||
          (pDistance < 90 && array === smallParticles)
        ) {
          this.context.globalAlpha = 0.6

          if (array === largeParticles) {
            this.context.strokeStyle = '#fff'
          } else if (array === middleParticles) {
            this.context.strokeStyle = '#666'
          } else if (array === smallParticles) {
            this.context.strokeStyle = '#333'
          }

          this.context.beginPath()
          this.context.moveTo(p0.x, p0.y)
          this.context.lineTo(p1.x, p1.y)
          this.context.stroke()
        }

        // オブジェクト同士が衝突したら反転させて加速させる
        if (pDistance < p0.size + p1.size) {
          collision = true
          p1.vx = Math.cos(pAngle) * this.params.speed
          p1.vy = Math.sin(pAngle) * this.params.speed
          p0.vx = -Math.cos(pAngle) * this.params.speed
          p0.vy = -Math.sin(pAngle) * this.params.speed
        } else {
          collision = false
        }
      }
    }
  }

  /**
   * 破棄します。
   */
  public destroy(): void {
    this.gui && this.gui.destroy()
    cancelAnimationFrame(this.animationID)
  }
}

export { NodeBalls }
