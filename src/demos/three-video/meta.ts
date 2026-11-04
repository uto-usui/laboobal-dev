import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'three-video',
  title: '動画を貼った多面体',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/three/video.md',
  credits: [
    {
      label: 'learning-threejs',
      url: 'https://github.com/josdirksen/learning-threejs-third',
    },
  ],
  webgl: true,
  interaction: 'drag',
  created: '2019-08-19',
  added: '2026-11-01',
  description:
    '流れる雲の動画を貼った 20 面体が回り、白い地面に影を落とす。ドラッグで見る向きを変えられる。',
  tags: ['3d', 'video', 'drag'],
  tech: ['three'],
})
