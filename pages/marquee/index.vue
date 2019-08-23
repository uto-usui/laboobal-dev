<template>
  <div class="wrap">
    <div class="marquee-animation">
      <div class="ma__inner">
        <div class="ma__item">
          <span v-for="index in 4" :key="index" class="ma__text">
            marquee infinite animation
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'

interface Data {
  //
}

export default Vue.extend({
  components: {
    // DummyItems,
  },
  data(): Data {
    return {
      //
    }
  },
  mounted() {
    this.$nextTick(() => {
      //
    })
  },
  updated() {
    //
  },
  beforeDestroy() {
    //
  },
  methods: {
    //
  },
})
</script>

<style lang="scss" scoped>
.wrap {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow: hidden;
}

.marquee-animation {
  position: absolute;
  top: 50%;
  width: 100vw;
  margin-top: -0.5em;
  font-size: 10vw;
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
  will-change: transfomr;
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
