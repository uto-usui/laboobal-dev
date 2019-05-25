<template>
  <div class="wrap js_parallaxWrap">
    <section class="container">
      <div>
        <h1 class="title">laboobal.dev</h1>
        <ContentsList />
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import ContentsList from '@/components/ContentsList.vue'

interface data {
  test: string
}

export default Vue.extend({
  components: {
    ContentsList,
  },
  data(): data {
    return {
      test: 'test text',
    }
  },
  mounted() {
    //
  },
  updated() {
    //
  },
  beforeDestroy() {
    //
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
  overflow: hidden;
}

.container {
  //
}

.title {
  display: block;
  font-family: 'Molle', cursive;
  font-size: 5vw;
  color: $color-white;
}
</style>
