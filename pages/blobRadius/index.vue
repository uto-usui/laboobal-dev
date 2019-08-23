<template>
  <div class="wrap">
    <div class="blob-radius blob-radius--01">
      <div class="br__inner br__inner--01"></div>
    </div>
    <div class="blob-radius blob-radius--02">
      <div class="br__inner br__inner--02"></div>
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
  width: 100%;
  overflow: hidden;
}

.blob-radius {
  position: absolute;
  top: calc(50% - 30vw / 2);
  width: 30vw;
  height: 30vw;
  //
  &--01 {
    left: calc(10vw);
  }
  //
  &--02 {
    right: calc(10vw);
  }
}

.br__inner {
  background-image: linear-gradient($color-primary, rgba($color-primary, 0.1));
  opacity: 0.8;
  //
  @include overlay;
  //
  &--01 {
    animation: blobRadius 30s ease-in-out infinite both alternate,
      blobTrans 20s ease-in-out infinite both alternate;
  }
  //
  &--02 {
    animation: blobRadius 30s ease-in-out infinite both alternate-reverse,
      blobTrans02 20s ease-in-out infinite both;
  }
}

@keyframes blobRadius {
  0%,
  100% {
    border-radius: 33% 67% 70% 30% / 30% 30% 70% 70%;
  }
  //
  10% {
    border-radius: 37% 63% 51% 49% / 37% 65% 35% 63%;
  }
  //
  20% {
    border-radius: 36% 64% 64% 36% / 64% 48% 52% 36%;
  }
  //
  30% {
    border-radius: 37% 63% 51% 49% / 30% 30% 70% 70%;
  }
  //
  40% {
    border-radius: 40% 60% 42% 58% / 41% 51% 49% 59%;
  }
  //
  50% {
    border-radius: 50% 50% 22% 78% / 36% 29% 71% 64%;
  }
  ///
  60% {
    border-radius: 64% 36% 78% 22% / 56% 33% 67% 44%;
  }
  //
  70% {
    border-radius: 39% 61% 33% 67% / 70% 67% 33% 30%;
  }
  //
  80% {
    border-radius: 73% 27% 79% 21% / 37% 40% 60% 63%;
  }
  //
  90% {
    border-radius: 40% 60% 42% 58% / 41% 51% 49% 59%;
  }
}

@keyframes blobTrans01 {
  0%,
  100% {
    transform: none;
  }
  //
  50% {
    transform: translate(50%, 20%) rotateY(10deg) scale(1.2);
  }
}

@keyframes blobTrans02 {
  0%,
  100% {
    transform: none;
  }
  //
  50% {
    transform: translate(50%, 20%) rotate(-200deg) scale(1.2);
  }
}
</style>
