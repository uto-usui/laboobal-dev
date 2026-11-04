import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'scroll-reveal',
  title: 'スクロールの進み具合で動かす',
  description:
    '画面を通り過ぎる箱の進み具合を 0〜1 の数で測り、その数をそのまま見せたり、色を変えたり、箱を起き上がらせたりする。',
  variants: ['scroll-reveal', 'scroll-reveal-color', 'scroll-reveal-transform'],
  default: 'scroll-reveal-transform',
})
