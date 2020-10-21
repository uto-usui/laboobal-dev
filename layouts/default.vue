<template>
  <div>
    <main>
      <nuxt />
    </main>
    <Debug />
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from '@vue/composition-api'
import Debug from '~/components/layout/Debug.vue'

export default defineComponent({
  components: {
    Debug,
  },
  setup(_props, ctx) {
    const animationID = ref(0)

    const handleResize = () => {
      ctx.root.$store.dispatch('global/setWindow', {
        w: window.innerWidth,
        h: window.innerHeight,
      })
    }

    const isOpen = computed(() => {
      return ctx.root.$store.getters['global/getIsMenuOpen']
    })

    /**
     * scroll function -> requestAnimationFrame
     */
    const handleScroll = () => {
      ctx.root.$store.dispatch('global/setScrollY', window.pageYOffset)
      animationID.value = requestAnimationFrame(handleScroll)
    }

    /**
     * on event
     */
    const eventAttach = () => {
      window.addEventListener('resize', handleResize, false)
      //
      handleScroll()
    }

    /**
     * off event
     */
    const eventDetach = () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationID.value)
    }

    /**
     * life cycle
     */
    onMounted(() => {
      ctx.root.$store.dispatch('global/setScrollY', window.pageYOffset)
      ctx.root.$store.dispatch('global/setWindow', {
        w: window.innerWidth,
        h: window.innerHeight,
      })
      //
      eventAttach()
    })
    onBeforeUnmount(() => {
      eventDetach()
    })

    return {
      isOpen,
    }
  },
})
</script>

<style lang="scss">
@import '~Sass/foundation/_reset';
@import '~Sass/foundation/base/_base';
@import '~Sass/animation/_keyframes';
@import '~Sass/object/utility/_utility';

html.has-scroll-smooth {
  overflow: hidden;

  > body {
    overflow: hidden;
  }
}

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

:root {
  --fz-fluid-step--2: clamp(0.6944rem, calc(0.6573rem + 0.1856vw), 0.88rem);
  --fz-fluid-step--1: clamp(0.8331rem, calc(0.7798rem + 0.2669vw), 1.1rem);
  --fz-fluid-step-0: clamp(1rem, calc(0.925rem + 0.375vw), 1.375rem);
  --fz-fluid-step-1: clamp(1.2rem, calc(1.0963rem + 0.5188vw), 1.7188rem);
  --fz-fluid-step-2: clamp(1.44rem, calc(1.2983rem + 0.7088vw), 2.1488rem);
  --fz-fluid-step-3: clamp(1.7281rem, calc(1.5366rem + 0.9575vw), 2.6856rem);
  --fz-fluid-step-4: clamp(2.0738rem, calc(1.8171rem + 1.2831vw), 3.3569rem);
  --fz-fluid-step-5: clamp(2.4881rem, calc(2.1465rem + 1.7081vw), 4.1963rem);
}
</style>
