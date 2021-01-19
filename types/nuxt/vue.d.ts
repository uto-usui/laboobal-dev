import { UA } from 'nuxt-user-agent/lib/types'
import locomotiveScroll from 'locomotive-scroll'
import { Gtag } from '@/types/gtag'
import Vuex from 'vuex'

declare module '@nuxt/vue-app' {
  interface Context {
    $ua: UA
    $gtag: Gtag
    $locomotiveScroll: locomotiveScroll

    $exStore: Vuex.ExStore
    $state: Vuex.ExStore['state']
    $getters: Vuex.ExStore['getters']
    $commit: Vuex.ExStore['commit']
    $dispatch: Vuex.ExStore['dispatch']
  }
}

declare module '@nuxt/types' {
  interface Context {
    $ua: UA
    $gtag: Gtag
    $locomotiveScroll: locomotiveScroll

    $exStore: Vuex.ExStore
    $state: Vuex.ExStore['state']
    $getters: Vuex.ExStore['getters']
    $commit: Vuex.ExStore['commit']
    $dispatch: Vuex.ExStore['dispatch']
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $ua: UA
    $gtag: Gtag
    $locomotiveScroll: locomotiveScroll

    $exStore: Vuex.ExStore
    $state: Vuex.ExStore['state']
    $getters: Vuex.ExStore['getters']
    $commit: Vuex.ExStore['commit']
    $dispatch: Vuex.ExStore['dispatch']
  }
}

declare module 'vuex' {
  interface Store<S> {
    $ua: UA
    $gtag: Gtag
    $locomotiveScroll: locomotiveScroll

    $exStore: Vuex.ExStore
    $state: Vuex.ExStore['state']
    $getters: Vuex.ExStore['getters']
    $commit: Vuex.ExStore['commit']
    $dispatch: Vuex.ExStore['dispatch']
  }
}

declare module '@vue/composition-api' {
  interface SetupContext {
    readonly refs: { [key: string]: Vue | Element | Vue[] | Element[] }
  }
}
