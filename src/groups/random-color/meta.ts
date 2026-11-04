import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'random-color',
  title: 'でたらめな色の図形',
  description:
    '円、四角、星を、開くたびに変わるでたらめな色で塗る。星は回すこともできる。',
  variants: [
    'random-color-circle-createjs',
    'random-color-square-createjs',
    'star-random-color-createjs',
    'star-rotate-animation-createjs',
  ],
  default: 'random-color-circle-createjs',
})
