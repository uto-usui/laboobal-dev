import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'mouse-image',
  title: 'マウスで動く写真',
  description:
    'マウスの位置に合わせて、写真を帯に切ってずらしたり、傾けたり、ゆがませたりする。',
  variants: [
    'parallax-shifting-divided-background-by-mouse',
    'mouse-tilt',
    'mouse-skew',
    'parallax-distorts-by-following-mouse',
  ],
  default: 'parallax-shifting-divided-background-by-mouse',
})
