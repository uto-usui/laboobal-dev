<template>
  <div class="wrap">
    <canvas id="canvas" ref="canvas" />
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from '@vue/composition-api'
import { NodeBalls } from '~/assets/js/nodeBall/nodeBall.ts'

export default defineComponent({
  components: {
    // DummyItems,
  },
  setup(_props, _ctx) {
    let nodeBalls = null as null | NodeBalls
    const canvas = ref<HTMLCanvasElement>()

    const init = () => {
      if (!canvas.value) return
      nodeBalls = new NodeBalls({
        canvas: canvas.value,
      })
    }

    onMounted(() => {
      nextTick(() => {
        init()
      })
    })

    onBeforeUnmount(() => {
      nodeBalls && nodeBalls.destroy()
      nodeBalls = null
    })

    return {
      canvas,
    }
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
