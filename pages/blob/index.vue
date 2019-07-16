<template>
  <div class="wrap">
    <canvas id="scene" @mousemove="onMousemove"></canvas>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import * as THREE from 'three'
import { Power3 } from 'gsap/EasePack'
import * as TweenMax from 'gsap/umd/TweenMax'
import math from '~/assets/js/math'
import { Simplex3 } from '~/assets/js/noise'

interface Data {
  radius: number
  mouse: {
    x: number
    y: number
    force: THREE.Vector2 | null
  }
  width: number
  height: number
  shape: THREE.Mesh | null
  frame: number
  renderer: THREE.WebGLRenderer | null
  camera: THREE.PerspectiveCamera | null
  geometry: THREE.IcosahedronGeometry | null
  scene: THREE.Scene | null
  canvas: HTMLCanvasElement | null
  resizeId: NodeJS.Timeout | null
  animId: number
}

export default Vue.extend({
  components: {
    // DummyItems,
  },
  data(): Data {
    return {
      radius: 0,
      mouse: {
        x: 0,
        y: 0,
        force: null,
      },
      width: 0,
      height: 0,
      shape: null,
      frame: 0,
      renderer: null,
      camera: null,
      geometry: null,
      scene: null,
      canvas: null,
      resizeId: null,
      animId: 0,
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.initCanvas()
    })
  },
  updated() {
    this.$nextTick(() => {
      // this.scrollManager.parallaxEventDetach()
      // this.scrollManager.parallaxEventAttach()
    })
  },
  beforeDestroy() {
    this.canvas && this.destroyCanvas()
  },
  methods: {
    initCanvas() {
      this.canvas = document.querySelector('#scene') as HTMLCanvasElement
      this.width = this.canvas.offsetWidth
      this.height = this.canvas.offsetHeight

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
      })

      // this.renderer.setPixelRatio(window.devicePixelRatio)
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(this.width, this.height)

      // this.renderer.setClearColor(new THREE.Color().setStyle(`hsl(180, 80%, 85%)`))

      this.scene = new THREE.Scene()

      this.camera = new THREE.PerspectiveCamera(
        100,
        this.width / this.height,
        0.1,
        10000,
      )
      this.camera.position.set(120, 0, 300)

      /**
       * 屋外太陽光のライティング
       */
      const light = new THREE.HemisphereLight(0xffffff, 0x0c056d, 0.35)
      this.scene.add(light)

      const light2 = light.clone()
      light2.position.set(-200, 300, 400)
      this.scene.add(light2)

      /**
       * 減衰しない光
       */
      const light3 = new THREE.DirectionalLight(0x590d82, 0.5)
      light3.position.set(-200, 300, 400)
      this.scene.add(light3)

      /**
       * モーフィングをつくる
       * 20面体のジオメトリ
       * IcosahedronGeometr(r, detail)
       */
      this.geometry = new THREE.IcosahedronGeometry(100, 4)

      for (let i = 0; i < this.geometry.vertices.length; i++) {
        const vector = this.geometry.vertices[i] as any
        vector._copy = vector.clone()
      }

      /**
       * 光沢のあるマテリアル
       */
      const material = new THREE.MeshPhongMaterial({
        emissive: new THREE.Color().setStyle(`hsla(170, 60%, 80%)`),
        emissiveIntensity: 0.3,
        shininess: 25,
      })
      //
      this.shape = new THREE.Mesh(this.geometry, material)
      this.scene.add(this.shape)

      this.mouse.force = new THREE.Vector2(0.8, 0.5)

      this.animId = requestAnimationFrame(this.render)

      window.addEventListener('resize', this.resizeTimer)
      window.addEventListener('mousemove', this.onMousemove)
    },

    /**
     * dispose
     */
    destroyCanvas() {
      cancelAnimationFrame(this.animId)
      window.removeEventListener('resize', this.resizeTimer)
      // window.removeEventListener('mousemove', this.onMousemove)
    },

    /**
     * アニメーション
     * @param time {Number} requestAnimationFrame の経過時間
     */
    updateVertices(time) {
      let perlin = 0

      if (this.geometry) {
        for (let i = 0; i < this.geometry.vertices.length; i++) {
          const vector = this.geometry.vertices[i] as any
          vector.copy(vector._copy)
          // vector.copy(vector._copy)

          // 3Dノイズ
          perlin = Simplex3(
            vector.x * 0.006 + time * 0.0002,
            vector.y * 0.006 + time * 0.0003,
            vector.z * 0.006,
          )

          // 変形係数
          if (this.mouse.force) {
            const ratio = perlin * 0.2 * (this.mouse.force.y + 0.1) + 0.8
            vector.multiplyScalar(ratio * 2)
          }
        }
        this.geometry.verticesNeedUpdate = true
      }

      // 回転
      if (this.shape) {
        this.shape.rotation.x += 0.01
        this.shape.rotation.y += 0.01
      }

      // マウスの位置の値を角度に変換
      const targetR = (this.mouse.x / this.width) * 360

      // イージング
      this.radius += (targetR - this.radius) * 0.01

      // ラジアンに変換する
      const radian = (this.radius * Math.PI) / 180

      // 角度に応じてカメラの位置を設定
      if (this.camera) {
        this.camera.position.x = 400 * Math.sin(radian)
        this.camera.position.z = 400 * Math.cos(radian)
        // 原点方向を見る
        this.camera.lookAt(new THREE.Vector3(0, 0, 0))
      }
    },

    /**
     * レンダリング
     * @param time {number} 経過時間
     */
    render(time) {
      this.animId = requestAnimationFrame(this.render)

      this.frame++
      if (this.frame % 2 === 0) {
        return
      }
      this.updateVertices(time)
      this.renderer &&
        this.scene &&
        this.camera &&
        this.renderer.render(this.scene, this.camera)
    },

    /**
     * mouse event
     */
    onMousemove(e) {
      TweenMax.to(this.mouse.force, 0.3, {
        y: e.clientY / this.height,
        x: e.clientX / this.width,
        ease: Power3.easeOut,
      })

      this.mouse.x = e.clientX
      this.mouse.y = e.clientY

      // 移動
      this.shape &&
        TweenMax.to(this.shape.position, 2, {
          x: math.map(e.clientX, 0, this.width, -100, 100),
          y: math.map(e.clientY, 0, this.height, -100, 100),
          ease: Power3.easeOut,
        })
    },

    /**
     * リサイズイベント
     */
    onResize() {
      if (this.canvas && this.camera && this.renderer) {
        this.canvas.style.width = ''
        this.canvas.style.height = ''
        this.width = this.canvas.offsetWidth
        this.height = this.canvas.offsetHeight

        this.camera.aspect = this.width / this.height
        this.camera.updateProjectionMatrix()

        this.renderer.setSize(this.width, this.height)
      }
    },

    /**
     * タイマー処理
     */
    resizeTimer() {
      this.resizeId && clearTimeout(this.resizeId)
      this.resizeId = setTimeout(this.onResize, 200)
    },
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
  overflow: hidden;
  //
  canvas {
    width: 100%;
    height: 100%;
  }
}

canvas {
  position: fixed;
  z-index: 10;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
}
</style>
