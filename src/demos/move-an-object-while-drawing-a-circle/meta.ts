import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'move-an-object-while-drawing-a-circle',
  title: 'オブジェクトを円を描きながら動かす',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/move-an-object-while-drawing-a-circle/',
  origin: 'https://jsfiddle.net/yutousui/5n1a0hjy/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-12',
  added: '2026-11-04',
  description:
    '緑の玉が、横を sin、縦を cos で動かして、薄い線の円の上をぐるぐる回り続ける。',
  tags: ['shape', 'trigonometry'],
  tech: ['gsap'],
  group: 'trigonometry',
  variant: '円を描く玉',
})
