<template>
  <section class="wrap">
    <h1 class="title">laboobal.dev</h1>
    <div ref="scrollArea" data-scroll-container class="inner">
      <ContentsList />
    </div>
  </section>
</template>

<script lang="ts">
import ContentsList from '@/components/ContentsList.vue'
import { defineComponent, getCurrentInstance, ref } from '@vue/composition-api'
import { locomotiveInit } from '@/pages/mixins/locomotive'

export default defineComponent({
  components: {
    ContentsList,
  },
  setup(_props, _ctx) {
    /**
     * current component instance
     */
    const instance = getCurrentInstance()
    /**
     * locomotive-scroll instance
     */
    const Ls = instance?.$store.$locomotiveScroll
    /**
     * dom of scroll area
     */
    const scrollArea = ref(null as null | HTMLDivElement)
    /**
     * init locomotive
     *
     * speed: {Number} wheel power
     */
    const { speed } = locomotiveInit({ Ls })

    return {
      speed,

      scrollArea,
    }
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
}

.inner {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.title {
  position: fixed;
  top: 50%;
  left: 50%;
  display: block;
  font-family: 'Molle', cursive;
  font-size: 18vw;
  color: $color-white;
  pointer-events: none;
  opacity: 0.05;
  transform: translate(-50%, -50%);
}
</style>
