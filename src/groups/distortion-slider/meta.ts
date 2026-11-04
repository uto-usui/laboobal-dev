import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'distortion-slider',
  title: 'ゆがんで切り替わる写真',
  description:
    '写真をシェーダーの模様でゆがませながら、次の写真へ入れ替える。ゆがませる向きが 4 とおりある。',
  variants: [
    'distortion-slider-a',
    'distortion-slider-b',
    'distortion-slider-c',
    'distortion-slider-d',
  ],
  default: 'distortion-slider-a',
})
