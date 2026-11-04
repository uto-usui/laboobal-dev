import { createDistortionSlider } from '../../groups/distortion-slider/slider'
import type { Mount, Params } from '../../shared/variants'
import photo1 from './assets/01.webp'
import photo2 from './assets/02.webp'
import photo3 from './assets/03.webp'
import fragment from './assets/frag.glsl?raw'

export const params = {
  intensity: {
    label: 'ゆがみの強さ',
    value: 10,
    min: 0,
    max: 20,
    step: 0.5,
  },
  duration: {
    label: '切り替えの秒数',
    value: 2.5,
    min: 0.5,
    max: 6,
    step: 0.1,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { intensity, duration }) =>
  createDistortionSlider({
    root: stage.querySelector<HTMLElement>('.slider')!,
    photos: [photo1, photo2, photo3],
    intensity,
    duration,
    fragment,
  })
