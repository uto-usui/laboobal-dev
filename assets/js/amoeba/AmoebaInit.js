// import * as THREE from 'three'

import { Mesh } from 'three'
import { CanvasManager } from './CanvasManager'
import { AmoebaCircleTexture } from './AmoebaCircleTexture'
import { AmoebaCreateRenderer } from './AmoebaCreateRenderer'

export class AmoebaInit extends AmoebaCreateRenderer {
  /**
   * constructor
   *
   * @param {wrap} {HTMLCanvasElement}
   *
   * @returns {AmoebaInit}
   */
  constructor({ wrap }) {
    super({ wrap })
    // resolve this
    this.resizeFunction = this.resize.bind(this)

    this.circle = new AmoebaCircleTexture()
    // create mesh
    this.circleMeth = new Mesh(this.circle.geometry, this.circle.material)
    // add scene
    this.scene.add(this.circleMeth)
    console.log('this.circle', this.circle)

    return this
  }

  /**
   * canvas start
   */
  start() {
    CanvasManager.add(this.resizeFunction, true)
  }

  /**
   * canvas end
   */
  finish() {
    this.needsStopUpdate = true
    //
    CanvasManager.remove(this.resizeFunction)
    CanvasManager.disposeThreeObjects(this.scene, this.renderer)
    CanvasManager.destroy()
    //
    this.container.width = 1
    this.container.height = 1
  }

  /** s
   * resize handler
   *
   * @param width
   * @param height
   */
  resize(width, height) {
    this.needsStopUpdate = true
    this.setConfig(width, height)
    this.circle.resize()
    this.resizeScene()
    this.needsStopUpdate = false
    //
    console.log('🔥 AmoebaInit resize')
  }

  /**
   * ref animation
   */
  update() {
    if (!this.needsStopUpdate) {
      const time = 0.001 * performance.now()
      this.circle.update(time)
      //
      this.renderer.render(this.scene, this.camera)
    }
  }
}
