<template>
  <ul class="contents-list">
    <li
      v-for="(item, index) in list"
      ref="target"
      :key="`list${index}`"
      class="cl__item"
    >
      <n-link class="cl__target" :to="`/${item}`" v-text="item" />
    </li>
  </ul>
</template>

<script lang="ts">
import Vue from 'vue'
// import { TweenMax, Power0 } from 'gsap/umd/TweenMax'

// list data josn
import list from '~/data/page.json'

interface data {
  list: String[]
}

export default Vue.extend({
  name: 'ContentsList',
  data() {
    return {
      list,
    }
  },
  mounted() {
    this.$nextTick(() => {
      // this.animation()
    })
  },
  methods: {
    // animation(): void {
    //   TweenMax.to(this.$refs.target, 5, {
    //     repeat: -1,
    //     rotationY: 360,
    //     ease: Power0.easeIn,
    //   })
    // },
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
