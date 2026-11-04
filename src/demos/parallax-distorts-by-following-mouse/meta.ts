import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'parallax-distorts-by-following-mouse',
  title: 'マウスに合わせて傾けるパララックス',
  category: 'parallax',
  batch: 'F6',
  article: 'https://webmanab.com/lab/parallax-distorts-by-following-mouse/',
  origin: 'https://jsfiddle.net/yutousui/vxmrkkyd/',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2017-11-30',
  added: '2026-11-01',
  description:
    '重ねた写真と見出しの箱が、マウスの方へずれながら斜めに傾く。外に出るとゆっくり戻る。',
  tags: ['parallax', 'cursor', 'image'],
  tech: ['gsap'],
  group: 'mouse-image',
  variant: '重ねてゆがませる',
})
