<template>
  <span v-if="text" class="chop-text">
    <span
      class="ct__inner"
      :style="{
        animationDelay: `${Math.floor(delay * 100) / 100}s`,
        animationDuration: `${duration}s`,
      }"
      v-text="text"
    />
  </span>
</template>

<script>
/**
 * text を span で囲う
 * delay と duration を付与できる
 */
export default {
  name: 'ChopText',
  props: {
    text: {
      type: String,
      default: '',
    },
    delay: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    show: {
      type: Boolean,
      default: false,
    },
  },
}
</script>

<style lang="scss" scoped>
.chop-text {
  display: inline-block;
  // overflow: hidden;
  // visibility: hidden;
  //
  &.is-show {
    // visibility: visible;
  }
}

.ct__inner {
  display: inline-block;
  // white-space: nowrap;
  // backface-visibility: hidden;
  //
  .chop-text.is-show & {
    // animation: transformTextYIn 1 $easeFadeIn both;
  }
}
</style>
