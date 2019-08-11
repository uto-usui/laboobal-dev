import { map, orgTrunc } from 'Js/math'
import EventManager from '../eventManager'
import SelfPosition from './selfPosition'

class parallax {
  /**
   * create constructor
   *
   * @param targets {string}
   * @param options {Object}
   * @param browser {Object}
   */
  constructor(targets, options, browser) {
    this.list = []
    this.total = 0
    this.$selector = [...document.querySelectorAll(targets)]
    this.config = {
      degree: 0,
      speed: 0.1,
      zoom: 100,
      scale: 1.125,
    }
    this.browser = browser

    this.init = false

    // merge
    this.config = Object.assign(this.config, { ...options })

    this._scroll = 0
    this.scrollOld = 0
    this.scrollAccOffset = {
      acc: 0,
      accOld: 0,
      max: 50,
    }
    this.setList(this.$selector)

    this._eventList = []
  }

  /**
   * create list object
   *
   * @param targets {Element[]}
   */
  setList(targets) {
    targets.forEach((el, i) => {
      this.list[i] = {
        dom: el,
        child: el.children,
        moveImage: {
          el: el.querySelector('.js-move-image'),
          amount: 0,
        },
        translateZoomEl: el.querySelector('.js-zoom'),
        translate: {
          x: {
            speed: el.dataset.translateXSpeed || 1,
            amount: el.dataset.translateX || 0,
          },
          y: {
            speed: el.dataset.translateYSpeed || 1,
            amount: el.dataset.translateY || 0,
          },
        },
        translatePos: [0, 0],
        // eslint-disable-next-line new-cap
        selfPosition: new SelfPosition(el),
        isShow: false,
      }
    })
  }

  /**
   * frame update
   *
   * @param y {number}
   */
  update(y = 0) {
    y === 0
      ? (this._scroll +=
          (document.documentElement.scrollTop || document.body.scrollTop) -
          this._scroll)
      : (this._scroll = y)

    // update scrollAccOffset.acc
    this.updateAccelerator()

    // reset old scroll value
    this.scrollOld = this._scroll

    // update list item
    this.list.forEach((el, i) => {
      el.selfPosition.update(this._scroll)

      // ratio - Until the element is visible and then invisible 0 ~ 1
      const ratio = el.selfPosition.info.ratio

      // add class
      this.addClass(el, ratio)

      if (this.browser.isFromPc() && ratio > 0 && ratio < 1) {
        // image parallax move
        el.moveImage.el && this.playMoveImage(el, ratio)
        // translate
        if (el.translate.y.amount || el.translate.x.amount) {
          this.playTranslate(el, i, ratio, el.translate)
        }
      }

      // zoom
      this.browser.isFromPc() && this.playZoom(el)
    })
    this.init = true
  }

  /**
   * update scrollAccOffset position
   */
  updateAccelerator() {
    this.scrollAccOffset.acc +=
      ((this._scroll - this.scrollOld) / this.scrollAccOffset.max -
        this.scrollAccOffset.acc) *
      this.config.speed

    // this.scrollAccOffset.acc =
    //   Math.round(this.scrollAccOffset.acc * 1000) / 1000

    this.scrollAccOffset.acc < -1 && (this.scrollAccOffset.acc = -1)
    this.scrollAccOffset.acc > 1 && (this.scrollAccOffset.acc = 1)
  }

  /**
   * translate element
   * @param target
   * @param i
   * @param ratio
   * @param translate
   */
  playTranslate(target, i, ratio, translate) {
    const x = orgTrunc(map(ratio, 0, 1, 0, translate.x.amount), 10)
    const y = orgTrunc(map(ratio, 0, 1, 0, translate.y.amount), 10)
    target.translatePos[0] +=
      (x - target.translatePos[0]) * translate.x.speed * 0.9
    target.translatePos[1] +=
      (y - target.translatePos[1]) * translate.y.speed * 0.9
    this.translate3d(
      target.dom,
      `${target.translatePos[0]}px`,
      `${target.translatePos[1]}px`,
      0,
    )
  }

  /**
   * zoom (translateZ) transition - trigger scroll Acceleration
   *
   * @param target {Element}
   */
  playZoom(target) {
    if (target.translateZoomEl) {
      if (target.selfPosition.isInViewport) {
        this.zoom(
          target.translateZoomEl,
          Math.abs(this.scrollAccOffset.acc) * this.config.zoom,
        )
      } else {
        this.zoom(target.translateZoomEl, 0)
      }
    }
  }

  /**
   * parallax move image func
   *
   * @param target {Element}
   * @param ratio {Number}
   */
  playMoveImage(target, ratio) {
    const height = target.moveImage.el.getBoundingClientRect().height
    // 移動量
    const space = (height * this.config.scale - height) / 2
    const y = map(ratio, 0, 1, -space, space)
    const speed = 0.1
    target.moveImage.val += (y - target.moveImage.amount) * speed
    //
    this.translate3d(
      target.moveImage.el,
      0,
      target.moveImage.amount + 'px',
      0,
      this.config.scale,
    )
  }

  /**
   * toggle class
   *
   * @param target
   * @param ratio
   * @returns {boolean}
   */
  addClass(target, ratio) {
    if (ratio > 0 && !this.init) {
      target.dom.classList.add('is-first-view')
    }

    if (ratio > 0 && ratio < 1 && !target.isShow) {
      target.isShow = true
      target.dom.classList.add('is-show', 'is-viewport-in')

      return true
    }

    if ((ratio < 0 || ratio > 1) && target.isShow) {
      target.isShow = false
      target.dom.classList.remove('is-viewport-in')

      return true
    }
  }

  /**
   * attach event
   */
  eventAttach() {
    for (let e = 0; e < this.total; e++) {
      this.list[e].selfPosition.eventAttach()
    }

    const handleResize = e => this.resize(e)
    this._eventList.push(new EventManager(window, 'resize', handleResize))
    this.resize()
  }

  /**
   * detach event
   */
  eventDetach() {
    this.list.forEach(el => {
      el.selfPosition.eventDetach()
      // eslint-disable-next-line no-param-reassign
      delete el.selfPosition
    })
    this.list = []
    this._eventList.forEach(event => event.destroy())
  }

  /**
   * resize handle
   */
  resize() {
    this.list.forEach(el => {
      el.selfPosition.update()
    })
  }

  /**
   * set style translate3d
   *
   * @param e {Element}
   * @param x {number}
   * @param y {number}
   * @param z {number}
   * @param scale {number}
   */
  translate3d(e, x, y, z, scale = 1) {
    e.style.transform = `perspective(1000px) scale(${scale}) translate3d(${x},${y},${z})`
  }

  /**
   * set style translateZ
   *
   * @param e {Element}
   * @param z {number}
   */
  zoom(e, z) {
    if (z < 0.8) {
      // eslint-disable-next-line
      z = 0
    }
    e.style.transform = `perspective(1000px) translate3d(0,0,${z}px)`
  }
}

export default parallax
