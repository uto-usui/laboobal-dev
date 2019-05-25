import EventManager from '../eventManager'

class fakeScroll {
  constructor(target, speed = 0.1) {
    this.targetH = 0
    this.scroll = {
      y: 0,
      power: 0,
    }
    this.position = {
      x: 0,
      y: 0,
      oldX: 0,
      oldY: 0,
    }
    this.$target = document.querySelector(target)
    this.$body = document.body
    this.speed = speed
    this.ticking = false
    this.$target.style.position = 'fixed'

    this._eventList = []
  }

  onScroll() {
    this.scroll.power += 100
    this.scroll.y = window.pageYOffset || document.documentElement.scrollTop

    this.ticking ||
      window.requestAnimationFrame(() => {
        this.update()
      })
    this.ticking = true
  }

  update() {
    this.position.y += (this.scroll.y - this.position.y) * this.speed
    this.position.y = Number(this.position.y.toFixed(1))
    // console.log(this.position.y)

    const y = this.scroll.y - this.position.y

    if (y < 1 && y > -1) {
      this.positionUpdate()
      this.ticking = false
    } else {
      window.requestAnimationFrame(() => {
        this.update()
      })
    }
    this.positionUpdate()
    this.position.oldY = this.position.y
  }

  sizeUpdate() {
    this.targetH = this.$target.offsetHeight
    this.$body.style.height = `${this.targetH}px`
    this.positionUpdate()
  }

  positionUpdate() {
    this.$target.style.transform = `perspective(1000px) translate3d(0px,${-this
      .position.y}px,0)`
  }

  eventAttach() {
    const handleResize = e => this.resize(e)
    this._eventList.push(new EventManager(window, 'resize', handleResize))
    const handleOnScroll = e => this.onScroll(e)
    this._eventList.push(new EventManager(window, 'scroll', handleOnScroll))
    this.resize()
  }

  eventDetach() {
    this._eventList.forEach(event => event.destroy())
  }

  destroyStyle() {
    this.$body.style.height = ''
    this.$target.style.transform = ''
  }

  resize() {
    this.sizeUpdate()
  }
}

export default fakeScroll
