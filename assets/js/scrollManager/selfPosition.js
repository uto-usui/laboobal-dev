import EventManager from '../eventManager'

class selfPosition {
  constructor(target) {
    this.element = target
    this.info = {
      crt: 0,
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
    this.scrollTop =
      e || document.documentElement.scrollTop || document.body.scrollTop
    this.contentTop = this.scrollTop + window.innerHeight - this.offset.top
    this.info.crt =
      this.contentTop / (this.element.clientHeight + window.innerHeight)
    this.info.topPosView = this.contentTop / window.innerHeight
    this.info.crt >= -0.1 && this.info.crt <= 1.1
      ? (this.isInViewport = true)
      : (this.isInViewport = false)
    this.info.old = this.info.crt
  }

  eventAttach() {
    const handleResize = e => this.resize(e)
    this._eventList.push(new EventManager(window, 'resize', handleResize))
    this.resize()
  }

  eventDetach() {
    this._eventList.forEach(event => event.destroy())
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
