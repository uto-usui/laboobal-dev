import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'tweenmax-easing-of-scroll-parallax',
  title: 'ホイールのスクロールをゆっくりにしてパララックス',
  category: 'parallax',
  batch: 'F6',
  article: 'https://webmanab.com/lab/tweenmax-easing-of-scroll-parallax/',
  origin: 'https://jsfiddle.net/yutousui/ab42k442/',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2017-02-19',
  added: '2026-11-02',
  description:
    'ホイールのスクロールがゆっくり止まり、枠の中の 5 つの点が違う速さで上下にずれる。',
  tags: ['scroll', 'parallax'],
  tech: ['gsap'],
})
