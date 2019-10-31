import { ShaderMaterial, PlaneGeometry } from 'three'

import vs from './AmoebaCircleTexture.vs'
import fs from './AmoebaCircleTexture.fs'
import { CanvasManager } from './CanvasManager'

export class AmoebaCircleTexture {
  /**
   *
   * @returns {AmoebaCircleTexture}
   */
  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        time: {
          type: 'f',
          value: 0,
        },
        aspectRatio: {
          type: 'f',
          value: CanvasManager.aspectRatio(),
        },
      },
      vertexShader: vs,
      fragmentShader: fs,
      transparent: true,
    })

    this.resize()

    return this
  }

  init() {
    //
  }

  /**
   * resize handler
   */
  resize() {
    this.geometry = new PlaneGeometry(
      CanvasManager.sceneWidth(),
      CanvasManager.sceneHeight(),
      1,
      1,
    )
    this.material.uniforms.aspectRatio.value = CanvasManager.aspectRatio()
  }

  /**
   * ref animation
   * @param time
   */
  update(time = 0.1) {
    //    console.log('🔥 this.material', this.material.uniforms.time.value)
    this.material.uniforms.time.value = time
  }
}
