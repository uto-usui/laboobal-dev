<template>
  <section class="wrap">
    <h1 class="title">laboobal.dev</h1>
    <ContentsList />
  </section>
</template>

<script lang="ts">
import ContentsList from '@/components/ContentsList.vue'
import { defineComponent } from '@vue/composition-api'

export default defineComponent({
  components: {
    ContentsList,
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  width: 100%;
}

.title {
  position: fixed;
  top: 50%;
  left: 50%;
  display: block;
  font-family: 'Molle', cursive;
  font-size: 18vw;
  color: $color-white;
  pointer-events: none;
  opacity: 0.05;
  transform: translate(-50%, -50%);
}
</style>
