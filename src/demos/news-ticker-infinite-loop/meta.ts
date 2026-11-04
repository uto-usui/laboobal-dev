import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'news-ticker-infinite-loop',
  title: '無限ループするニュースティッカー',
  category: 'ui',
  batch: 'F6',
  // 記事の slug は日本語。webmanab のリンクと同じく、エンコードした形で書く
  article:
    'https://webmanab.com/lab/%E7%84%A1%E9%99%90%E3%83%AB%E3%83%BC%E3%83%97%E3%81%99%E3%82%8B%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9%E3%83%86%E3%82%A3%E3%83%83%E3%82%AB%E3%83%BC-%E3%80%8Ejavascript%E3%80%8F/',
  origin: 'https://jsfiddle.net/yutousui/fLyu4qjs/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-09-29',
  added: '2026-11-04',
  description:
    'お知らせの見出しが右から左へ流れ続け、全部が流れきると右の端からまた入ってくる。',
  tags: ['text', 'ui'],
  tech: ['js'],
})
