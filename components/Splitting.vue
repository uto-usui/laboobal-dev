<template>
  <div class="split-title">
    <h1 class="st__inner" v-html="$splitting({ content: text })"></h1>
  </div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api'

export default defineComponent({
  props: {
    text: {
      type: String,
      default: '',
    },
  },
})
</script>

<style lang="scss" scoped>
.split-title {
  font-size: 10vw;
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
