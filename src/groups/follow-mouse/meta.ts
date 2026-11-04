import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'follow-mouse',
  title: 'マウスを追いかける',
  description:
    '玉がマウスに少し遅れてついてくる。遅れ方をばねにしたり、遅れた分だけふくらませたり、写真を照らす光にしたりする。',
  variants: [
    'follow-mouse',
    'follow-mouse-spring',
    'follow-mouse-transform',
    'follow-mouse-spotlight',
  ],
  default: 'follow-mouse-spotlight',
})
