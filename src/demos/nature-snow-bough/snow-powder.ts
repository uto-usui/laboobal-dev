import { SNOW_STRIDE, STEP } from './scene'

// 核が画面外で眠っても煙だけは消え切るまで残す。物理へ力や質量を返さない。
export class SnowPowder {
  readonly data: Float32Array<ArrayBuffer>
  private readonly emitted: Uint8Array
  private readonly velocity: Float32Array

  constructor(count: number) {
    this.data = new Float32Array(count * 3 * 8)
    this.emitted = new Uint8Array(count * 3)
    this.velocity = new Float32Array(count * 3 * 3)
    this.reset()
  }

  reset() {
    this.data.fill(0)
    this.emitted.fill(0)
    this.velocity.fill(0)
    for (let i = 0; i < this.emitted.length; i++) this.data[i * 8 + 3] = -1
  }

  advance(poses: Float32Array, dt: number) {
    for (let card = 0; card < this.emitted.length; card++) {
      const body = Math.floor(card / 3) * SNOW_STRIDE
      const layer = card % 3
      const at = card * 8
      if (poses[body + 8] > 0.5) this.emitted[card] = 0
      const falling = poses[body + 8] < 0.5 && poses[body + 10] < 0.5
      if (
        falling &&
        !this.emitted[card] &&
        poses[body + 9] / 0.26 > 0.08 + layer * 0.15
      ) {
        this.emitted[card] = 1
        this.data.set(
          [poses[body + 16], poses[body + 17], poses[body + 18], 0],
          at,
        )
        for (let k = 0; k < 3; k++) {
          this.velocity[card * 3 + k] = Math.max(
            -1.2,
            Math.min(
              1.2,
              ((poses[body + 16 + k] - poses[body + 32 + k]) / STEP) * 0.12,
            ),
          )
        }
        this.data[at + 4] = Math.sin(card * 17.31) * 0.5 * 0.35
        this.data[at + 5] = 0.3 + layer * 0.055
        this.data[at + 6] = 0.24 + layer * 0.035
      }
      if (this.data[at + 3] < 0) continue
      this.data[at + 3] += dt
      for (let k = 0; k < 3; k++) {
        this.data[at + k] += this.velocity[card * 3 + k] * dt
        this.velocity[card * 3 + k] *= Math.exp(-dt * 1.8)
      }
      this.data[at] += this.data[at + 4] * dt
      this.data[at + 1] -= dt * 0.12
      if (this.data[at + 3] > 2.1) this.data[at + 3] = -1
    }
  }
}
