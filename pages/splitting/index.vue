<template>
  <div id="main" class="wrap">
    <client-only>
      <Splitting :text="'abc abc abc abc abc abc'" />
    </client-only>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  onBeforeUnmount,
  onMounted,
} from '@vue/composition-api'

import Splitting from '~/components/Splitting.vue'

export default defineComponent({
  components: { Splitting },

  setup(_props, _ctx) {
    onMounted(() => {
      console.log('mounted')
    })
    onBeforeUnmount(() => {
      console.log('unmounted')
    })

    return {
      //
    }
  },
})
</script>

<style>
.wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
