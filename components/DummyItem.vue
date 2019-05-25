<template>
  <div class="dummy-item js_parallaxItem">
    <div class="di__inner js_parallaxItem-image">
      <div v-lazy-container="{ selector: 'img' }">
        <img
          :data-src="require('Images/test/01.jpg')"
          :data-loading="require('Images/test/01.jpg?sqip')"
          class="di__img"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  name: 'DummyItem',
})
</script>

<style scoped lang="scss">
.dummy-item {
  width: 65vw;
  height: 30vw;
  margin-left: auto;
  margin-right: auto;
  overflow: hidden;
  //
  + .dummy-item {
    margin-top: 20vw;
  }
}

.di__img {
  width: 100%;
  max-width: 100%;
  transition: filter 1s $easeOutSine;
  //
  &[lazy='loading'] {
    filter: blur(5px);
  }
}
</style>
