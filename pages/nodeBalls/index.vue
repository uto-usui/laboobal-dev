<template>
  <div class="wrap">
    <canvas id="canvas" ref="canvas"></canvas>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { NodeBalls } from '~/assets/js/nodeBall/NodeBall'

interface data {
  nodeBalls: any
}

export default Vue.extend({
  components: {
    // DummyItems,
  },
  data(): data {
    return {
      //
      nodeBalls: null,
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.init()
    })
  },
  updated() {
    this.$nextTick(() => {
      // this.scrollManager.parallaxEventDetach()
      // this.scrollManager.parallaxEventAttach()
    })
  },
  beforeDestroy() {
    this.nodeBalls && this.nodeBalls.destroy()
    this.nodeBalls = null
  },
  methods: {
    init() {
      this.nodeBalls = new NodeBalls({
        canvas: this.$refs.canvas as HTMLCanvasElement,
      })
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
</style>
