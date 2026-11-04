import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'circular-motion-with-depth',
  title: '奥行きのある円運動',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/circular-motion-with-depth/',
  origin: 'https://jsfiddle.net/yutousui/91zjtj4g/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-12',
  added: '2026-11-04',
  description:
    '灰色の箱が左右に揺れながら奥と手前を行き来し、上から見ると円を描くように回り続ける。',
  tags: ['3d', 'trigonometry'],
  tech: ['gsap'],
  group: 'trigonometry',
  variant: '奥行きのある円',
})
