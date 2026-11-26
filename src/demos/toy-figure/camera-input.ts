import { clamp } from '../../shared/math'
import { onRunningChange } from '../../shared/visibility'

export const DEFAULT_ANGLE = 30
export const MIN_ANGLE = 15
export const MAX_ANGLE = 50
const DRAG_START = 8
const AXIS_RATIO = 1.25
const DEGREES_PER_PIXEL = 0.15

type Gesture = {
  id: number
  x: number
  y: number
  previousX: number
  mode: 'press' | 'undecided' | 'vertical' | 'drag'
}

export function cameraInput(
  canvas: HTMLCanvasElement,
  angle: number,
  look: (x: number, y: number) => void,
) {
  let appliedAngle = angle
  let gesture: Gesture | undefined
  const setAngle = (value: number) => {
    angle = clamp(value, MIN_ANGLE, MAX_ANGLE)
  }
  const finish = () => {
    const id = gesture?.id
    gesture = undefined
    if (id !== undefined && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id)
  }
  const cancel = () => {
    if (gesture?.mode === 'drag') angle = appliedAngle
    finish()
  }
  const point = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((e.clientY - rect.top) / rect.height) * 2,
    }
  }
  const inside = ({ x, y }: { x: number; y: number }) =>
    Math.abs(x) <= 1 && Math.abs(y) <= 1

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (gesture && e.pointerId !== gesture.id) cancel()
    },
    { capture: true },
  )
  canvas.addEventListener('pointerdown', (e) => {
    if (canvas.tabIndex < 0 || gesture || !e.isPrimary || e.button !== 0) return
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      previousX: e.clientX,
      mode: 'press',
    }
    if (e.pointerType !== 'touch') canvas.setPointerCapture(e.pointerId)
  })
  const move = (e: PointerEvent) => {
    if (gesture?.id !== e.pointerId) return
    if (!inside(point(e))) {
      cancel()
      return
    }
    const dx = e.clientX - gesture.x
    const dy = e.clientY - gesture.y
    if (gesture.mode === 'press' && Math.hypot(dx, dy) >= DRAG_START)
      gesture.mode = 'undecided'
    if (gesture.mode === 'undecided') {
      if (
        Math.abs(dx) >= DRAG_START &&
        Math.abs(dx) >= Math.abs(dy) * AXIS_RATIO
      ) {
        gesture.mode = 'drag'
        gesture.previousX = gesture.x + Math.sign(dx) * DRAG_START
      } else if (
        Math.abs(dy) >= DRAG_START &&
        Math.abs(dy) >= Math.abs(dx) * AXIS_RATIO
      )
        gesture.mode = 'vertical'
    }
    if (gesture.mode === 'drag') {
      setAngle(angle + (e.clientX - gesture.previousX) * DEGREES_PER_PIXEL)
      gesture.previousX = e.clientX
    }
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', (e) => {
    if (gesture?.id !== e.pointerId) return
    move(e)
    if (gesture?.mode === 'press') {
      const { x, y } = point(e)
      look(x, y)
    }
    finish()
  })
  const cancelPointer = (e: PointerEvent) => {
    if (gesture?.id === e.pointerId) cancel()
  }
  canvas.addEventListener('pointercancel', cancelPointer)
  canvas.addEventListener('lostpointercapture', cancelPointer)
  canvas.addEventListener('pointerleave', cancelPointer)
  window.addEventListener('blur', cancel)
  onRunningChange((running) => {
    if (!running) cancel()
  })
  canvas.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        setAngle(angle - 5)
        break
      case 'ArrowRight':
        setAngle(angle + 5)
        break
      case 'Home':
        setAngle(DEFAULT_ANGLE)
        break
      case 'Enter':
      case ' ':
        look(0, 0)
        break
      default:
        return
    }
    e.preventDefault()
  })
  return {
    get angle() {
      return angle
    },
    get dragging() {
      return gesture?.mode === 'drag'
    },
    didRender() {
      appliedAngle = angle
    },
  }
}
