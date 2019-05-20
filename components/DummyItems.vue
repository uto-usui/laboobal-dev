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

<script>
import DummyItem from './DummyItem'

export default {
  components: { DummyItem },
}
</script>
