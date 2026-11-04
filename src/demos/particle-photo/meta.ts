import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'particle-photo',
  title: '写真を粒にして次の写真へ運ぶ',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [{ label: '写真 Unsplash', url: 'https://unsplash.com/license' }],
  webgl: false,
  webgpu: true,
  interaction: 'drag',
  created: '2026-11-02',
  added: '2026-11-02',
  description:
    '写真を数十万の粒で油絵のように描き、粒が波のように飛んで次の写真へ集まる。ドラッグで吹き飛ぶ。',
  tags: ['particles', 'image', 'drag'],
  tech: ['webgpu', 'wgsl'],
  pick: true,
})
