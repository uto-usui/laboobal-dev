import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'nodes',
  title: '力で動く点',
  description:
    '玉や点を、ぶつかって弾く力、ばねのように引き合う力、重力と摩擦で動かす。近い点どうしは線で結ぶ。',
  variants: [
    'nodeballs',
    'move-a-node-with-springiness',
    'createjs-node-motion',
    'createjs-gravity-and-friction',
  ],
  default: 'nodeballs',
})
