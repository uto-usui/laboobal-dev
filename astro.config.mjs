import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://labobal.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  prerenderConflictBehavior: 'error',
  // デモの隅に重なって邪魔なうえ、依存の事前バンドルがやり直されると 504 を返して E2E のコンソールのエラーになる
  devToolbar: { enabled: false },
  vite: {
    optimizeDeps: {
      // 開発中に誰かが初めて import したときに事前バンドルがやり直され、開いているページが古い依存を読んで 504 になる。
      // 使う見込みのものを起動時にまとめて済ませておく
      include: [
        'three',
        'gsap',
        'gsap/Draggable',
        'gsap/InertiaPlugin',
        'gsap/MotionPathPlugin',
        'gsap/ScrollTrigger',
        'gsap/SplitText',
        'gsap/Flip',
        'gsap/CustomEase',
        'lil-gui',
        'locomotive-scroll',
      ],
    },
  },
})
