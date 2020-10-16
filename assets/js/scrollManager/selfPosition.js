import EventManager from '../eventManager'

class selfPosition {
  constructor(target) {
    this.element = target
    this.info = {
      ratio: 0,
      old: 0,
      topPosView: 0,
    }
    this.isInViewport = false
    this.stageInOffset = {
      min: 0,
      max: 1,
    }
    this.scrollTop = 0
    this.dir = 0
    this.rect = this.element.getBoundingClientRect()
    this.offset = this.getOffset(this.element)
    this._eventList = []
  }

  getOffset(target) {
    const rect = target.getBoundingClientRect()

    const scrollTop =
      scrollY || document.documentElement.scrollTop || document.body.scrollTop
    return {
      top: rect.top + scrollTop - document.documentElement.clientTop,
    }
  }

  update(e) {
    // scroll position
    this.scrollTop =
      e || document.documentElement.scrollTop || document.body.scrollTop

    // dist - from window bottom to content top
    this.contentTop = this.scrollTop + window.innerHeight - this.offset.top

    // ratio - Until the element is visible and then invisible 0 ~ 1
    this.info.ratio =
      this.contentTop / (this.element.clientHeight + window.innerHeight)

    // ratio - Until the element top is visible and then invisible 0 ~ 1
    this.info.topPosView = this.contentTop / window.innerHeight

    // set viewport enable
    this.info.ratio >= -0.1 && this.info.ratio <= 1.1
      ? (this.isInViewport = true)
      : (this.isInViewport = false)
    this.info.old = this.info.ratio
  }

  eventAttach() {
    const handleResize = (e) => this.resize(e)
    this._eventList.push(new EventManager(window, 'resize', handleResize))
    this.resize()
  }

  eventDetach() {
    this._eventList.forEach((event) => event.destroy())
  }

  resize() {
    setTimeout(() => {
      this.rect = this.element.getBoundingClientRect()
      this.offset = this.getOffset(this.element)
      this.update()
    }, 1000 / 30)
  }
}

export default selfPosition
