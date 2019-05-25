<template>
  <ul class="contents-list">
    <li ref="target" class="cl__item">
      <n-link class="cl__target" to="/scrollManager">scrollManager</n-link>
    </li>
  </ul>
</template>

<script lang="ts">
import Vue from 'vue'
import { TweenMax, Power0 } from 'gsap/umd/TweenMax'

export default Vue.extend({
  name: 'ContentsList',
  mounted() {
    this.$nextTick(() => {
      this.animation()
    })
  },
  methods: {
    animation(): void {
      TweenMax.to(this.$refs.target, 5, {
        repeat: -1,
        rotationY: 360,
        ease: Power0.easeIn,
      })
    },
  },
})
</script>

<style lang="scss" scoped>
.contents-list {
  //
}

.cl__item {
  //
}

.cl__target {
  //
}
</style>
