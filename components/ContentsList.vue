<template>
  <ul class="contents-list" data-scroll-section>
    <li
      v-for="(item, index) in list"
      ref="target"
      :key="`list${index}`"
      class="cl__item"
      data-scroll
      data-scroll-repeat
    >
      <n-link class="cl__target" :to="`/${item}/`" v-text="item" />
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'
import listJson from '~/data/page.json'

export default defineComponent({
  name: 'ContentsList',
  setup(_props, _ctx) {
    const list = ref(listJson as string[])

    return {
      list,
    }
  },
})
</script>

<style lang="scss" scoped>
.contents-list {
  padding-top: 25vh;
  padding-bottom: 25vh;
}

.cl__item {
  //
}

.cl__target {
  display: inline-block;
  font-size: 15vw;
  color: transparent;
  text-transform: lowercase;
  letter-spacing: -0.04em;
  -webkit-text-stroke: 1px $color-primary;
  transition: color 1.25s $easeOutCirc;

  @include desktop {
    font-size: 10vw;
  }
  //
  &:hover {
    color: $color-primary-light;
    text-transform: capitalize;
    transition: color 0.2s $easeFadeIn;
  }
}
</style>
