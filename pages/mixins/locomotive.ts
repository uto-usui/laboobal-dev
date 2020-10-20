import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRefs,
} from '@vue/composition-api'
import locomotiveScroll from 'locomotive-scroll'

interface LsType {
  Ls: locomotiveScroll
}

export const locomotiveInit = ({ Ls }: LsType) => {
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
    scroll: 0,
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
    scrollObj.scroll = scroll
    scrollObj.speed = speed

    // 1 for color hue - `hsla(${progressHue.value}, 50%, 50%, 0.1)`
    progress.hue = (360 * scroll.y) / limit

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

  return { ls, ...toRefs(progress), ...toRefs(scrollObj) }
}
