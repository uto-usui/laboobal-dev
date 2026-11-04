import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'gsap-stagger',
  title: '真ん中から広がる波',
  category: 'gsap',
  batch: 'B1',
  article: undefined,
  origin: 'laboobal/docs/basic/gsap.md（basic/gsap/Stagger）',
  credits: [
    {
      label: 'Advanced staggers in GSAP 3',
      url: 'https://codepen.io/GreenSock/pen/vYBRPbO',
    },
  ],
  webgl: false,
  interaction: 'none',
  created: '2019-11-19',
  added: '2026-11-01',
  description:
    '斜めに倒した 10×10 のマス目が、真ん中から順に浮き沈みして波紋のように広がる。',
  tags: ['3d'],
  tech: ['gsap', 'css'],
})
