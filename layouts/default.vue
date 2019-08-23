<template>
  <div>
    <nuxt />
    <Debug />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Debug from '~/components/layout/Debug.vue'

export type Data = {
  animationID: number
}

export default Vue.extend({
  components: {
    Debug,
  },
  data: (): Data => ({
    animationID: 0,
  }),
  computed: {
    //
  },
  mounted() {
    this.$dispatch('global/setScrollY', window.pageYOffset)
    this.$dispatch('global/setWindow', {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    //
    this.eventAttach()
  },
  updated() {
    //
  },
  beforeDestroy() {
    this.eventDetach()
  },
  methods: {
    /**
     * resize function
     */
    handleResize() {
      this.$dispatch('global/setWindow', {
        w: window.innerWidth,
        h: window.innerHeight,
      })
    },

    /**
     * scroll function -> requestAnimationFrame
     */
    handleScroll() {
      this.$dispatch('global/setScrollY', window.pageYOffset)
      this.animationID = requestAnimationFrame(this.handleScroll)
    },

    /**
     * on event
     */
    eventAttach() {
      window.addEventListener('resize', this.handleResize, false)
      //
      this.handleScroll()
    },

    /**
     * off event
     */
    eventDetach() {
      window.removeEventListener('resize', this.handleResize)
      cancelAnimationFrame(this.animationID)
    },
  },
})
</script>

<style scoped lang="scss">
//
</style>

<style lang="scss">
@import '~Sass/foundation/_reset';
@import '~Sass/foundation/base/_base';
@import '~Sass/animation/_keyframes';
@import '~Sass/object/utility/_utility';

@font-face {
  font-family: 'MyYuGothicM';
  font-weight: normal;
  src: local('YuGothic-Medium'), local('Yu Gothic Medium'),
    local('YuGothic-Regular');
}

@font-face {
  font-family: 'MyYuGothicM';
  font-weight: bold;
  src: local('YuGothic-Bold'), local('Yu Gothic');
}
</style>
