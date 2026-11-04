import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'reveal',
  title: '写真を隠して見せる',
  description:
    '写真を、緑の幕で覆ってから見せたり、切り抜きを広げて見せたりする。クリックでもう一度。',
  variants: ['reveal-curtain', 'reveal-clip'],
  default: 'reveal-curtain',
})
