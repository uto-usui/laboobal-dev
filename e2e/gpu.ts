import type { Page } from '@playwright/test'

/**
 * GPU がないと遅すぎるデモ。toy-figure はキャラだけで 40 万三角形あり、CI のソフトウェア描画では 1 コマに 0.4 秒以上かかる。
 * 時間で動きを見るテストは、GPU のない環境では飛ばし、手元の Chrome（GPU）で見る
 */
export const GPU_ONLY = ['toy-figure']

export const softwareGl = (page: Page) =>
  page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''
    return !gl || /swiftshader|llvmpipe|software/i.test(String(name))
  })
