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

<style scoped lang="scss">
//
</style>

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
</style>
