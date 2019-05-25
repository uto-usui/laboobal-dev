import EventManager from '../eventManager'
import selfPosition from './selfPosition'

class parallax {
  //
  constructor(targets, options) {
    this.list = []
    this.total = 0
    this.$selector = [...document.querySelectorAll(targets)]
    this.config = {
      degree: 0,
      speed: 0.1,
      zoom: 100,
      fadeAcc: false,
      fadeAccOffset: 300,
      showUpEase(e, c, n, i, r) {
        const _c = c / r - 1
        return -i * (_c * _c * _c * _c - 1) + n
      },
    }
    // merge
    this.config = Object.assign({ ...options }, this.config)

    this._scroll = 0
    this.scrollOld = 0
    this.scrollAccOffset = {
      acc: 0,
      accOld: 0,
      max: 50,
    }
    this.total = this.$selector.length
    this.setList(this.$selector)

    this._eventList = []
  }

  setList(targets, options) {
    targets.forEach((el, i) => {
      const target = el
      this.list[i] = {
        dom: target,
        child: target.children,
        img: target.querySelector('.js_parallaxItem-image'),
        // eslint-disable-next-line new-cap
        selfPosition: new selfPosition(el),
        offset: {
          x: 0,
          y: 150 * Math.random() + 150,
          z: 0,
        },
        speed: {
          x: 0,
          y: 0.1 + 0.1 * Math.random(),
          z: 0,
        },
        sizeUnit: {
          x: 'px',
          y: 'px',
          z: 'px',
        },
        pos: {
          x: 0,
          y: 0,
          z: 0,
        },
        acc: {
          x: 0,
          y: 0,
          z: 0,
        },
        isShow: false,
      }
    })

    options && (this.config = Object.assign({ ...options }, this.config))
  }

  update(y = 0) {
    y === 0
      ? (this._scroll +=
          (document.documentElement.scrollTop || document.body.scrollTop) -
          this._scroll)
      : (this._scroll = y)

    this.scrollAccOffset.acc +=
      ((this._scroll - this.scrollOld) / this.scrollAccOffset.max -
        this.scrollAccOffset.acc) *
      this.config.speed

    this.scrollAccOffset.acc < -1 && (this.scrollAccOffset.acc = -1)
    this.scrollAccOffset.acc > 1 && (this.scrollAccOffset.acc = 1)

    this.list.forEach(el => {
      const target = el

      target.selfPosition.update(this._scroll)
      target.img &&
        (target.selfPosition.isInViewport
          ? this.zoom(
              target.img,
              Math.abs(this.scrollAccOffset.acc) * this.config.zoom,
            )
          : this.zoom(target.img, 0))

      const topPosView = target.selfPosition.info.topPosView
      if (topPosView > 0.1 && !target.isShow) {
        target.isShow = true
        target.dom.classList.add('is-show')

        return true
      }

      if (topPosView < 0.05 && target.isShow) {
        target.isShow = false
        target.dom.classList.remove('is-show')

        return true
      }

      if (this.config.fadeAcc) {
        let n = target.selfPosition.info.showUpHalf

        if (n <= 1 && n >= 0) {
          n = this.config.showUpEase(0, n, 0, 1, 1)
          target.acc.y = this.config.fadeAccOffset * (1 - n)

          if (
            target.selfPosition.info.crt > -0.5 &&
            target.selfPosition.info.crt < 1.5
          ) {
            let y = target.acc.y
            if (y < 0.8) {
              y = 0
              this.translate3d(target.child, 0, y + 'px', 0)
            }
          }
        }
      }
    })
    this.scrollOld = this._scroll
  }

  eventAttach() {
    for (let e = 0; e < this.total; e++) {
      this.list[e].selfPosition.eventAttach()
    }

    const handleResize = e => this.resize(e)
    this._eventList.push(new EventManager(window, 'resize', handleResize))
    this.resize()
  }

  eventDetach() {
    this.list.forEach(el => {
      el.selfPosition.eventDetach()
      // eslint-disable-next-line no-param-reassign
      delete el.selfPosition
    })
    this.list = []
    this._eventList.forEach(event => event.destroy())
  }

  resize() {
    this.list.forEach(el => {
      el.selfPosition.update()
    })
  }

  translate3d(e, x, y, z) {
    e.style.transform = `perspective(1000px) translate3d(${x},${y},${z}px)`
  }

  rotate(e, rotate, y) {
    if (y < 0.8) {
      // eslint-disable-next-line
      y = 0
    }
    e.style.transform = `perspective(1000px) translate3d(0,0,${y}px) rotate(${rotate}deg)`
  }

  zoom(e, z) {
    if (z < 0.8) {
      // eslint-disable-next-line
      z = 0
    }
    e.style.transform = `perspective(1000px) translate3d(0,0,${z}px)`
  }
}

export default parallax
