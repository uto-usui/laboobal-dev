import { defineVariants } from '../../shared/variants'

export default defineVariants({
  'random-color-circle-createjs': () =>
    import('../../demos/random-color-circle-createjs/main'),
  'random-color-square-createjs': () =>
    import('../../demos/random-color-square-createjs/main'),
  'star-random-color-createjs': () =>
    import('../../demos/star-random-color-createjs/main'),
  'star-rotate-animation-createjs': () =>
    import('../../demos/star-rotate-animation-createjs/main'),
})
