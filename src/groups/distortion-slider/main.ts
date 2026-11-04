import { defineVariants } from '../../shared/variants'

export default defineVariants({
  'distortion-slider-a': () => import('../../demos/distortion-slider-a/main'),
  'distortion-slider-b': () => import('../../demos/distortion-slider-b/main'),
  'distortion-slider-c': () => import('../../demos/distortion-slider-c/main'),
  'distortion-slider-d': () => import('../../demos/distortion-slider-d/main'),
})
