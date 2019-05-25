<template>
  <div class="dummy-items">
    <DummyItem v-for="item in 10" :key="`dummy${item}`" />
  </div>
</template>

<style scoped lang="scss">
.dummy-items {
  //
}
</style>

<script lang="ts">
import Vue from 'vue'
import DummyItem from '~/components/DummyItem.vue'

export default Vue.extend({
  name: 'DummyItems',
  components: { DummyItem },
  computed: {
    // todos() {
    //   return this.$getters['sample/getTodos']
    // },
  },
})
</script>
