<template>
  <div class="dummy-item js_parallaxItem">
    <div class="di__inner">
      <img
        class="di__img js_parallaxItem-image"
        src="~/Images/test/01.jpg"
        alt="a"
      />
    </div>
  </div>
</template>

<script>
export default {
  name: 'DummyItem',
}
</script>

<style scoped lang="scss">
.dummy-item {
  width: 65vw;
  height: 30vw;
  margin-left: auto;
  margin-right: auto;
  overflow: hidden;
  background-color: mediumaquamarine;
  //
  + .dummy-item {
    margin-top: 20vw;
  }
}

.di__img {
  max-width: 100%;
}
</style>
