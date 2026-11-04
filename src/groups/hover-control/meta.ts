import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'hover-control',
  title: 'ホバーの動きを最後まで見せる',
  description:
    'マウスを乗せると塗りが伸び、すぐ外しても最後まで動いてから戻る。CSS だけで書いた、途中で戻る版と比べられる。',
  variants: ['hover-control', 'hover-control-css', 'hover-rect'],
  default: 'hover-control',
})
