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
})
