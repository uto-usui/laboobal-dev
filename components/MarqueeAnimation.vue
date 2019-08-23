<template>
  <div class="marquee-animation">
    <div class="ma__inner">
      <div class="ma__item">
        <span v-for="index in 4" :key="index" class="ma__text"
          >marquee infinite animation</span
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'MarqueeAnimation',
}
</script>

<style lang="scss" scoped>
.marquee-animation {
  position: absolute;
  top: 50%;
  width: 100vw;
  height: 1em;
  margin-top: -0.5em;
  font-size: 10vw;
  letter-spacing: 0.1em;
  //
  &--tb {
    transform: translateX(0.5em) rotate(-90deg);
  }
  //
  &--bt {
    transform: translateX(-0.5em) rotate(90deg);
  }
  //
  &--diag {
    transform: translateX(2em) rotate(210deg);
  }
}

.ma__inner {
  position: relative;
  z-index: 0;
  width: 100%;
}

.ma__item {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 9;
  font-size: 0;
  white-space: nowrap;
  transform: translate3d(-50%, 0, 0);
  will-change: transfomrm;
  backface-visibility: hidden;
  animation: marquee 15s linear infinite;
}

.ma__text {
  padding-right: 0.5em;
  font-size: 10vw;
  font-weight: bold;
  line-height: 1;
  color: rgba($color-white, 0.15);
  text-transform: uppercase;
}

@keyframes marquee {
  from {
    transform: translate3d(-50%, 0, 0);
  }
  //
  to {
    transform: translate3d(-75%, 0, 0);
  }
}
</style>
