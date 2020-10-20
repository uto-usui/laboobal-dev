import { UA } from 'nuxt-user-agent/lib/types'
import locomotiveScroll from 'locomotive-scroll'

declare module '@nuxt/vue-app' {
  interface Context {
    $ua: UA
    $locomotiveScroll: locomotiveScroll
  }
}

declare module '@nuxt/types' {
  interface Context {
    $ua: UA
    $locomotiveScroll: locomotiveScroll
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $ua: UA
    $locomotiveScroll: locomotiveScroll
  }
}

declare module 'vuex' {
  interface Store<S> {
    $ua: UA
    $locomotiveScroll: locomotiveScroll
  }
}

declare module '@vue/composition-api' {
  interface SetupContext {
    readonly refs: { [key: string]: Vue | Element | Vue[] | Element[] }
  }
}
