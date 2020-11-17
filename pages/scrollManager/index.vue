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
        data-scroll
        data-scroll-delay="0.05"
        data-scroll-speed="2"
      >
        <figure
          class="sm__figure"
          data-scroll
          data-scroll-repeat
          data-scroll-call="background, null"
        >
          <div
            class="sm__figure-inner sm__filter"
            data-scroll
            data-scroll-speed="-1.5"
          >
            <DummyImage
              :src="require(`Images/test/04.jpg`)"
              width="50vw"
              height="100vh"
            />
          </div>
        </figure>
      </div>
      <div class="sm__caption space-a" data-scroll data-scroll-speed="-4">
        <div class="sm__caption-inner" data-scroll data-scroll-offset="200">
          <h2 class="sm__hed">data-scroll-section</h2>
          <p class="sm__text">
            * Add `data-scroll-section` prop to every section content * Do not
            specify transform prop in section * Splitting your page into
            sections may improve performance
          </p>
        </div>
      </div>
    </section>

    <section class="sm__section" data-scroll-section>
      <div
        class="sm__figure-wrap"
        data-scroll
        data-scroll-delay="0.05"
        data-scroll-speed="1"
      >
        <figure
          class="sm__figure"
          data-scroll
          data-scroll-repeat
          data-scroll-call="background, null"
        >
          <div
            class="sm__figure-inner sm__filter"
            data-scroll
            data-scroll-speed="-1"
          >
            <DummyImage
              :src="require(`Images/test/06.jpg`)"
              width="90vw"
              height="25vh"
            />
          </div>
        </figure>
      </div>
      <div
        class="sm__figure-wrap spacer-b"
        data-scroll
        data-scroll-delay="0.05"
        data-scroll-speed="4"
      >
        <figure
          class="sm__figure"
          data-scroll
          data-scroll-repeat
          data-scroll-call="background, null"
        >
          <div
            class="sm__figure-inner sm__filter"
            data-scroll
            data-scroll-speed="-1.5"
          >
            <DummyImage
              :src="require(`Images/test/05.jpg`)"
              width="50vw"
              height="50vw"
            />
          </div>
        </figure>
      </div>
      <div
        class="sm__figure-wrap spacer-a"
        data-scroll
        data-scroll-delay="0.05"
        data-scroll-speed="6"
      >
        <figure
          class="sm__figure"
          data-scroll
          data-scroll-repeat
          data-scroll-call="background, null"
        >
          <div
            class="sm__figure-inner sm__filter"
            data-scroll
            data-scroll-speed="-2"
          >
            <DummyImage
              :src="require(`Images/test/05.jpg`)"
              width="15vw"
              height="30vw"
            />
          </div>
        </figure>
      </div>
    </section>

    <section class="sm__section" data-scroll-section>
      <div class="sm__caption" data-scroll data-scroll-speed="3">
        <div class="sm__caption-inner" data-scroll>
          <h2 class="sm__hed">data-scroll-direction</h2>
          <p class="sm__text">
            * Invert the direction with positive and negative, and specify
            vertical / horizontal with `data-scroll-direction` value * The
            default value is vertical
          </p>
        </div>
      </div>

      <div class="sm__tiles sm__tiles--rotated">
        <div class="sm__tiles-wrap">
          <div
            v-for="index in 5"
            :key="`line${index}`"
            class="sm__tiles-line"
            data-scroll
            :data-scroll-speed="index % 2 === 0 ? 1 : -1"
            data-scroll-direction="horizontal"
          >
            <div
              v-for="_index in 6"
              :key="`tile${_index}`"
              class="sm__tiles-line-inner"
              data-scroll
              data-scroll-repeat
              data-scroll-call="background, null"
            >
              <div
                class="sm__tiles-img sm__filter"
                :style="{
                  backgroundImage: `url(${require(`Images/test/06.jpg`)})`,
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sm__section" data-scroll-section>
      <div class="sm__caption space-a" data-scroll data-scroll-speed="3">
        <div class="sm__caption-inner" data-scroll data-scroll-offset="200">
          <h2 class="sm__hed">data-scroll-target</h2>
          <p class="sm__text">
            * Apply effects to multiple objects by triggering the scrolling
            position of a specified section
          </p>
        </div>
      </div>

      <div id="tiles2" class="sm__tiles sm__tiles--row">
        <div class="sm__tiles-wrap">
          <div
            v-for="index in 3"
            :key="`line${index}`"
            class="sm__tiles-line"
            data-scroll
            data-scroll-target="#tiles2"
            :data-scroll-speed="index % 2 === 0 ? 3 : 1"
            data-scroll-direction="horizontal"
          >
            <div
              v-for="_index in 6"
              :key="`tile${_index}`"
              class="sm__tiles-line-inner"
              data-scroll
              data-scroll-repeat
              data-scroll-call="background, null"
            >
              <div
                class="sm__tiles-img sm__filter"
                :style="{
                  backgroundImage: `url(${require(`Images/test/06.jpg`)})`,
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        class="sm__lead"
        data-scroll
        data-scroll-speed="3"
        data-scroll-direction="horizontal"
      >
        this is a conventional, boring lead text.
      </div>
    </section>

    <section class="sm__section" data-scroll-section>
      <div id="tiles3" class="sm__tiles sm__tiles--column">
        <div class="sm__tiles-wrap">
          <div
            v-for="index in 4"
            :key="`line${index}`"
            class="sm__tiles-line"
            data-scroll
            data-scroll-target="#tiles3"
            :data-scroll-speed="index % 2 === 0 ? 1 : -1"
            data-scroll-direction="vertical"
          >
            <div
              v-for="_index in 3"
              :key="`tile${_index}`"
              class="sm__tiles-line-inner"
              data-scroll
              data-scroll-repeat
              data-scroll-call="background, null"
            >
              <div
                class="sm__tiles-img sm__filter"
                :style="{
                  backgroundImage: `url(${require(`Images/test/05.jpg`)})`,
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sm__section" data-scroll-section data-persistent>
      <div id="fixed-elements" class="sm__fixed">
        <div class="sm__fixed-figure-wrap">
          <div
            class="sm__fixed-figure"
            data-scroll
            data-scroll-repeat
            data-scroll-call="background, null"
          >
            <div id="fixed-target" class="sm__fixed-target" />
            <figure
              data-scroll
              data-scroll-sticky
              data-scroll-target="#fixed-target"
              class="sm__fixed-bg sm__filter"
              :style="{
                backgroundImage: `url(${require(`Images/test/05.jpg`)})`,
              }"
            />
          </div>
        </div>

        <div
          class="sm__caption space-a"
          data-scroll
          data-scroll-sticky
          data-scroll-target="#fixed-elements"
        >
          <div class="sm__caption-inner" data-scroll>
            <h2 class="sm__hed">data-scroll-sticky</h2>
            <p class="sm__text">
              * Starts and stops at data-scroll-target position
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="sm__section" data-scroll-section>
      <div class="sm__pagetop-wrap">
        <a class="sm__pagetop" data-scroll @click="ls && ls.scrollTo('#main')">
          <span
            v-for="(item, index) in 'Back To Page Top'"
            :key="`text${index}`"
            class="sm__pagetop-text"
            :class="[{ whitespace: item === ' ' }]"
            data-scroll
            data-scroll-speed="6"
            :data-scroll-delay="0.18 - index * 0.01"
            v-text="item"
          />
        </a>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import DummyImage from '@/components/DummyImage.vue'
import { locomotiveInit } from '@/pages/mixins/locomotive'

// tile components
// from: https://github.com/codrops/TileScroll/blob/main/src/index.html

export default defineComponent({
  components: {
    DummyImage,
  },
  setup(_props, _ctx) {
    /**
     * init locomotive
     * speed: {Number} wheel power
     */
    const { ls } = locomotiveInit({ background: true })

    return { ls }
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
  overflow: hidden;
}

.scroll-manager {
  padding: 50vh 5vw 0;
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
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  padding-top: 35vh;

  &.spacer-a {
    padding-top: 100vh;
  }
}

.sm__fixed {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.sm__figure-wrap {
  &.spacer-a {
    padding-top: 45vh;
  }

  &.spacer-b {
    padding-top: 25vh;
  }
}

.sm__figure {
  display: inline-block;
  overflow: hidden;
  background-color: $color-black;
}

.sm__figure-target {
  position: absolute;
  top: -100vh;
  right: 0;
  left: 0;
}

.sm__filter {
  filter: grayscale(0.85);
  mix-blend-mode: multiply;
  opacity: 0.78;
}

.sm__figure-inner {
  //
}

.sm__caption {
  width: 33vw;
  line-height: 1.5;
  text-align: left;

  &.space-a {
    padding-top: 35vh;
  }
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

.sm__tiles {
  --tiles-height: 52vw;

  position: relative;
  width: 100vw;
  height: var(--tiles-height);
  margin-right: -5vw;
  margin-left: -5vw;
  overflow: hidden;

  &.sm__tiles--rotated {
    --tiles-height: 52vw;
  }

  &.sm__tiles--column {
    --tiles-height: 72vw;
  }
}

.sm__tiles-wrap {
  --tileswrap-height: calc(var(--tiles-height) * 1.8);

  position: absolute;
  top: 50%;
  left: 50%;
  width: 150%;
  height: var(--tileswrap-height);
  transform: translate3d(-50%, -50%, 0);

  .sm__tiles.sm__tiles--rotated & {
    --tileswrap-height: calc(var(--tiles-height) * 1.8);

    transform: translate3d(-50%, -50%, 0) rotate(22.5deg);
  }

  .sm__tiles.sm__tiles--column & {
    --tileswrap-height: calc(var(--tiles-height) * 1.25);

    top: 50%;
    left: 0;
    display: flex;
    width: 100%;
    transform: translate3d(0, -50%, 0);
  }

  .sm__tiles.sm__tiles--row & {
    --tileswrap-height: calc(var(--tiles-height) * 1);
  }
}

.sm__tiles-line {
  display: flex;

  .sm__tiles.sm__tiles--column & {
    display: block;
    width: 25%;
    padding: 0 1rem;
  }
}

.sm__tiles-line-inner {
  --tile-margin: 1vw;

  flex: none;
  width: calc(16.6666% - var(--tile-margin) * 2);
  height: calc(var(--tileswrap-height) / 3 - (3 * var(--tile-margin) / 2));
  margin: var(--tile-margin);

  .sm__tiles.sm__tiles--rotated & {
    --tile-margin: 1vw;

    width: calc(16.6666% - var(--tile-margin) * 2);
    height: calc(var(--tileswrap-height) / 5 - (4 * var(--tile-margin) / 2));
  }

  .sm__tiles.sm__tiles--column & {
    --tile-margin: 2rem 0;

    width: 100%;
    height: calc(25vw * 1.3);
  }

  .sm__tiles.sm__tiles--row & {
    //
  }
}

.sm__tiles-img {
  flex: none;
  width: 100%;
  height: 100%;
  background-position: 50% 50%;
  background-size: cover;
}

.sm__lead {
  margin: -2vh -3em;
  font-family: $font-Molle;
  font-size: 6vw;
  text-transform: capitalize;
  white-space: nowrap;
  opacity: 0.42;
}

.sm__fixed-figure-wrap {
  width: 50%;
}

.sm__fixed-figure {
  --fixed-height: 100vh;

  position: relative;
  height: var(--fixed-height);
  overflow: hidden;
}

.sm__fixed-target {
  position: absolute;
  top: calc(var(--fixed-height) * -1);
  right: 0;
  bottom: calc(var(--fixed-height) * -1);
  left: 0;
}

.sm__fixed-bg {
  position: absolute;
  top: calc(var(--fixed-height) * -1);
  right: 0;
  bottom: calc(var(--fixed-height) * -1);
  left: 0;
  height: 100%;
  background-position: 50%;
  background-size: cover;
}

.sm__pagetop-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
}

.sm__pagetop {
  display: inline-block;
}

.sm__pagetop-text {
  display: inline-block;
  font-family: $font-Montserrat;
  font-size: 7vw;
  font-weight: $font-weight-Montserrat-bold;
  color: $color-white;

  &.whitespace {
    width: 0.25em;
  }
}
</style>
