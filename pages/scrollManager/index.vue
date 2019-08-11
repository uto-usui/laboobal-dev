<template>
  <div id="main" class="wrap">
    <DummyItems />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import DummyItems from '~/components/DummyItems.vue'
import ScrollManager from '~/assets/js/scrollManager/scrollManager'

interface data {
  scrollManager: any
}

export default Vue.extend({
  components: {
    DummyItems,
  },
  data(): data {
    return {
      //
      scrollManager: null,
    }
  },
  mounted() {
    this.scrollManager = new ScrollManager(this.$ua)
    this.$nextTick(() => {
      this.scrollManager.scrollEventAttach()
      this.scrollManager.parallaxEventAttach()
    })
  },
  updated() {
    this.$nextTick(() => {
      this.scrollManager.parallaxEventDetach()
      this.scrollManager.parallaxEventAttach()
    })
  },
  beforeDestroy() {
    this.scrollManager.parallaxEventDetach()
    this.scrollManager.scrollEventDetach()
  },
})
</script>

<style>
.wrap {
  width: 100%;
  overflow: hidden;
}
</style>
