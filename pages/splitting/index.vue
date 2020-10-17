<template>
  <div id="main" class="wrap">
    <client-only>
      <Splitting :text="'Animate split text'" />
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

<style scoped lang="scss">
.wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
