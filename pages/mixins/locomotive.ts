import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRefs,
  onUpdated,
  nextTick,
  getCurrentInstance,
} from '@vue/composition-api'
import locomotiveScroll from 'locomotive-scroll'

interface LsType {
  background?: boolean | undefined
}

export const locomotiveInit = ({ background }: LsType) => {
  /**
   * current component instance
   */
  const instance = getCurrentInstance()
  /**
   * locomotive-scroll instance
   */
  const Ls = instance?.$store.$locomotiveScroll

  /**
   * locomotive-scroll instance
   */
  const ls = ref(null) as null | locomotiveScroll

  /**
   * scroll progress for hue
   */
  const progress = reactive({
    hue: 0,
  })

  /**
   * scroll event prams
   */
  const scrollObj = reactive({
    delta: 0,
    direction: '',
    limit: 0,
    scroll: {
      x: 0,
      y: 0,
    },
    speed: 0,
  })

  /**
   * resize function
   */
  const resizeHandler = () => {
    ls.value.update()
    // console.log('resize')
  }

  /**
   * elements of bg interaction
   */
  const backgrounds = [] as { id: number; el: HTMLElement }[]

  const colorHue = 175

  /**
   * call handler functions
   */
  const callFunctions = {
    exFunc(params, way, obj) {
      console.log(params, way, obj)
    },
    background(_params, way, obj) {
      if (way === 'enter') {
        // add item
        backgrounds.push({
          id: obj.id,
          el: obj.el,
        })
      } else {
        // remove item
        for (let i = 0; i < backgrounds.length; i++) {
          if (obj.id === backgrounds[i].id) {
            backgrounds.splice(i, 1)
          }
        }
      }
    },
  }

  /**
   * scroll function
   */
  const scrollHandler = ({ direction, limit, scroll, speed }) => {
    scrollObj.direction = direction
    scrollObj.limit = limit
    scrollObj.scroll = {
      x: scroll.x,
      y: scroll.y,
    }
    scrollObj.speed = speed
    if (instance) {
      instance.$dispatch('ls/setDirection', direction)
      instance.$dispatch('ls/setScroll', {
        x: scroll.x,
        y: scroll.y,
      })
      instance.$dispatch('ls/setLimit', limit)
      instance.$dispatch('ls/setSpeed', speed)
    }

    // 1 for color hue - `hsla(${progress.hue}, 50%, 50%, 0.1)`
    if (background) {
      progress.hue = (360 * scroll.y) / limit

      ls.value.el.style.backgroundColor = `hsla(${
        progress.hue * 2 + colorHue
      }, 4%, 61%, 1)`
      backgrounds.forEach(({ el }) => {
        el.style.backgroundColor = `hsla(${
          progress.hue * 2 + colorHue
        }, 4%, 61%, 1)`
      })
    }

    // set direction
    document.documentElement.setAttribute('data-direction', direction)
  }

  /**
   * call function
   *
   * ex.) <div data-scroll data-scroll-call="funcName, param1, param2" />
   * call funcName function registered in callFunctions
   */
  const callHandler = ([funcName, ...params], way, obj) => {
    callFunctions[funcName] && callFunctions[funcName](params, way, obj)
  }

  // create
  onMounted(() => {
    console.log('onMounted _ locomotive')

    /**
     * create locomotive-scroll instance
     */
    ls.value = new Ls({
      el: document.querySelector('[data-scroll-container]'),
      smooth: true,
      getSpeed: true,
      getDirection: true,
    })
    instance?.$dispatch('ls/setLs', (el) => ls.value.scrollTo(el))

    if (background)
      ls.value.el.style.backgroundColor = `hsla(${colorHue}, 4%, 61%, 1)`
    // console.log(ls.value)

    // set event
    window.addEventListener('resize', resizeHandler)
    ls.value && ls.value.on('call', callHandler)
    ls.value && ls.value.on('scroll', scrollHandler)
  })

  // destroy
  onBeforeUnmount(() => {
    console.log('onBeforeUnmount _ locomotive')

    ls.value.destroy()

    resizeHandler()

    // remove event
    window.removeEventListener('resize', resizeHandler)
    ls.value.off('call', callHandler)
    ls.value.off('scroll', scrollHandler)

    ls.value = null
  })

  // update
  onUpdated(() => {
    nextTick(() => {
      console.log('onUpdated _ locomotive')

      ls.value && ls.value.update()
    })
  })

  return { ls, ...toRefs(progress), ...toRefs(scrollObj) }
}
