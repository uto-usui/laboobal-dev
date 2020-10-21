<template>
  <div class="dummy-image" :style="{ height, width }">
    <img loading="lazy" class="di__img" :src="src" alt="example image" />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  name: 'DummyItem',
  props: {
    width: {
      type: String,
      default: '65vw',
    },
    height: {
      type: String,
      default: '65vh',
    },
    src: {
      type: String,
      default: require('Images/test/01.jpg'),
    },
  },
})
</script>

<style scoped lang="scss">
.dummy-image {
  position: relative;
  display: inline-block;
  overflow: hidden;
}

.di__img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  object-fit: cover;
  overflow: hidden;
}
</style>
