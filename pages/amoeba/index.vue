<template>
  <div class="wrap">
    <canvas id="canvas" ref="canvas" class="canvas" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { AmoebaInit } from '~/assets/js/amoeba/AmoebaInit'
// import { pause } from '~/assets/js/animation'

interface Data {
  canvas: AmoebaInit | null
  frameID: number | null
}

export default Vue.extend({
  components: {
    //
  },
  data(): Data {
    return {
      canvas: null,
      frameID: null,
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.init()
    })
  },
  updated() {
    //
  },
  beforeDestroy() {
    this.frameID && window.cancelAnimationFrame(this.frameID)
    this.canvas && this.canvas.finish()
  },
  methods: {
    init() {
      const canvasEl = this.$refs.canvas as HTMLCanvasElement
      this.canvas = new AmoebaInit({ wrap: canvasEl })
      this.canvas && this.canvas.start()
      this.update()
    },
    update() {
      this.frameID = window.requestAnimationFrame(this.update)
      this.canvas && this.canvas.update()
    },
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow: hidden;
}

.canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
}
</style>
