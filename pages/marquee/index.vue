<template>
  <div class="wrap">
    <marqueeAnimation />
    <marqueeAnimation class="marquee-animation--tb" />
    <marqueeAnimation class="marquee-animation--bt" />
    <marqueeAnimation class="marquee-animation--diag" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import MarqueeAnimation from '@/components/MarqueeAnimation.vue'

interface Data {
  //
}

export default Vue.extend({
  components: {
    MarqueeAnimation,
  },
  data(): Data {
    return {
      //
    }
  },
  mounted() {
    this.$nextTick(() => {
      //
    })
  },
  updated() {
    //
  },
  beforeDestroy() {
    //
  },
  methods: {
    //
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
</style>
