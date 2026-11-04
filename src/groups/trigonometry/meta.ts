import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'trigonometry',
  title: '三角関数の動き',
  description:
    'sin と cos で、行き来する動き、波、円、奥行きのある回転、でたらめな漂いを作る。',
  variants: [
    'smooth-movement-using-sin-wave',
    'createjs-beat-motion-trigonometric',
    'create-js-line-motion-trigonometric-sin',
    'createjs-round-motion-trigonometric',
    'createjs-revolution-trigonometric',
    'move-an-object-while-drawing-a-circle',
    'circular-motion-with-depth',
    'rotate-elements-arranged-on-the-circumference',
    'give-speed-and-angle-as-separate-random-values',
    'trigonometry-random-floating',
  ],
  default: 'rotate-elements-arranged-on-the-circumference',
})
