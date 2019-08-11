<template>
  <div class="dummy-item js-parallax-item">
    <div class="di__inner js-zoom">
      <LazyImage
        class="di__img"
        :src="require('Images/test/01.jpg')"
      ></LazyImage>
      <img :src="require('Images/test/01.jpg?sqip')" class="di__dummy" />
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import LazyImage from '~/components/util/LazyImage.vue'

export default Vue.extend({
  name: 'DummyItem',
  components: { LazyImage },
})
</script>

<style scoped lang="scss">
.dummy-item {
  position: relative;
  width: 65vw;
  height: 30vw;
  margin-right: auto;
  margin-left: auto;
  overflow: hidden;
  //
  + .dummy-item {
    margin-top: 20vw;
  }
}

.di__inner {
  @include overlay;
}

.di__img {
  width: 100%;
  max-width: 100%;
  //
}

.di__dummy {
  transition: opacity 1s $easeFadeIn;
  //
  @include overlay;
}

.di__img[lazy='loaded'] {
  + .di__dummy {
    opacity: 0;
  }
}
</style>
