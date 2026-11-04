import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'createjs-gravity-and-friction',
  title: '重力と摩擦で弾む丸',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/createjs-gravity-and-friction/',
  origin: 'https://jsfiddle.net/yutousui/omnrhpx0/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-06-26',
  added: '2026-11-04',
  description:
    '上から落ちた丸が床で弾み、摩擦で弾みが小さくなって止まると、また上から落ちる。',
  tags: ['physics'],
  tech: ['canvas2d'],
})
