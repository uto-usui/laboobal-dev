<template>
  <div class="split-title">
    <h1 class="st__inner" v-html="$splitting({ content: text })"></h1>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted } from '@vue/composition-api'
import { gsap } from 'gsap'

export default defineComponent({
  props: {
    text: {
      type: String,
      default: '',
    },
  },

  setup(_props, _ctx) {
    onMounted(() => {
      const el = document.querySelectorAll('.char')

      const timeline = gsap
        .timeline({
          paused: true,
          repeat: -1,
          yoyo: true,
        })
        .addLabel('start')
        .to(
          el,
          {
            ease: 'Power3.easeIn',
            y: '-100%',
            opacity: 0,
            stagger: {
              amount: 1,
              each: 0.1,
            },
          },
          'start',
        )

      timeline.play()
    })

    return {
      //
    }
  },
})
</script>

<style lang="scss" scoped>
.split-title {
  font-size: 10vw;
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
