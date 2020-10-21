<template>
  <div id="main" class="wrap scroll-manager" data-scroll-container>
    <header class="sm__header" data-scroll-section>
      <div class="sm__title-wrap">
        <h1 class="sm__title">
          <span
            class="is-inline-block"
            data-scroll
            data-scroll-speed="4"
            data-scroll-position="top"
            >scroll</span
          ><span
            class="is-inline-block"
            data-scroll
            data-scroll-speed="2"
            data-scroll-position="top"
            >manager</span
          >
        </h1>
        <p
          class="sm__sub"
          data-scroll
          data-scroll-speed="1"
          data-scroll-position="top"
        >
          ex-1
        </p>
      </div>
    </header>

    <section class="sm__section" data-scroll-section>
      <div
        class="sm__figure-wrap"
        data-scroll-delay="0.05"
        data-scroll-speed="2"
      >
        <figure
          class="sm__figure"
          data-scroll
          data-scroll-repeat
          data-scroll-call="background, null"
        >
          <div class="sm__figure-inner" data-scroll data-scroll-speed="-1.5">
            <DummyImage
              :src="require(`Images/test/01.jpg`)"
              width="50vw"
              height="100vh"
            />
          </div>
        </figure>
      </div>
      <div class="sm__caption" data-scroll data-scroll-speed="-4">
        <div>
          <div class="sm__caption-inner" data-scroll data-scroll-offset="200">
            <h2 class="sm__hed">data-scroll-section</h2>
            <p class="sm__text">
              * Add `data-scroll-section` prop to every section content * Do not
              specify transform prop in section * Splitting your page into
              sections may improve performance
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, getCurrentInstance } from '@vue/composition-api'
import DummyImage from '@/components/DummyImage.vue'
import { locomotiveInit } from '@/pages/mixins/locomotive'

export default defineComponent({
  components: {
    DummyImage,
  },
  setup(_props, _ctx) {
    /**
     * locomotive-scroll instance
     */
    const Ls = getCurrentInstance()?.$store.$locomotiveScroll
    /**
     * init locomotive
     */
    locomotiveInit({ Ls, background: true })

    return {}
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
  overflow: hidden;
}

.scroll-manager {
  padding: 50vh 5vw;
}

.sm__header {
  //
}

.sm__title-wrap {
  position: relative;
  font-family: $font-Molle;
  text-align: right;
  text-transform: uppercase;
  transform: translateY(-50%);
}

.sm__title {
  font-size: 12.5vw;
}

.sm__sub {
  position: absolute;
  top: 100%;
  right: 0;
  font-size: 5vw;
  opacity: 0.45;
}

.sm__section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-top: 35vh;
}

.sm__figure {
  display: inline-block;
  overflow: hidden;
  background-color: $color-black;
}

.sm__figure-inner {
  filter: grayscale(0.2);
  mix-blend-mode: multiply;
  opacity: 0.8;
}

.sm__caption {
  width: 33vw;
  padding-top: 35vh;
  line-height: 1.5;
  text-align: left;
}

.sm__caption-inner {
  opacity: 0;
  transition: 0.6s $easeInOutSine;
  transform: translateY(15vh);

  &.is-inview {
    opacity: 1;
    transform: translateX(0);
  }
}

.sm__hed {
  font-family: $font-Montserrat;
  font-size: var(--fz-fluid-step-1);
  font-weight: $font-weight-Montserrat-bold;
  text-transform: capitalize;
}

.sm__text {
  margin-top: 0.5em;
  font-size: var(--fz-fluid-step--1);
}

.ps__item {
  padding-top: 10vh;
  padding-bottom: 10vh;
}
</style>
