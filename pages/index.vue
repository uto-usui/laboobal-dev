<template>
  <div class="wrap js_parallaxWrap">
    <section class="container">
      <div>
        <logo />
        <h1 class="title">
          laboobal-dev
        </h1>
        <h2 class="subtitle">
          My phenomenal Nuxt.js project
        </h2>
        <div class="links">
          <a href="https://nuxtjs.org/" target="_blank" class="button--green"
            >Documentation</a
          >
          <a
            href="https://github.com/nuxt/nuxt.js"
            target="_blank"
            class="button--grey"
            >GitHub</a
          >
        </div>
        <p>message: {{ message }}</p>
      </div>
    </section>
    <DummyItems />
  </div>
</template>

<script>
// import { Component, Vue } from 'nuxt-property-decorator'
import Logo from '~/components/Logo'
import DummyItems from '~/components/DummyItems'
import ScrollManager from 'Js/scrollManager/scrollManager'

export default {
  components: {
    Logo,
    DummyItems,
  },
  data() {
    return {
      message: 'Hello world !',
      scrollManager: null,
    }
  },
  mounted() {
    this.scrollManager = new ScrollManager(this.$ua)
    // eslint-disable-next-line no-console
    console.log(this.scrollManager)
    this.$nextTick(() => {
      this.scrollManager.scrollEventAttach()
      this.scrollManager.parallaxEventAttach()
    })
  },
  updated() {
    // eslint-disable-next-line no-console
    console.log('pages updated')
    this.scrollManager.parallaxEventDetach()
    this.scrollManager.parallaxEventAttach()
  },
  beforeDestroy() {
    this.scrollManager.scrollEventDetach()
  },
}
</script>

<style>
.wrap {
  width: 100%;
  overflow: hidden;
}

.container {
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.title {
  font-family: 'Quicksand', 'Source Sans Pro', -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  display: block;
  font-weight: 300;
  font-size: 100px;
  color: #35495e;
  letter-spacing: 1px;
}

.subtitle {
  font-weight: 300;
  font-size: 42px;
  color: #526488;
  word-spacing: 5px;
  padding-bottom: 15px;
}

.links {
  padding-top: 15px;
}
</style>
