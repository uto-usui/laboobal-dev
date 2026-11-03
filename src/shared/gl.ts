import * as THREE from 'three'
import { pixelRatio, showFallback } from './dom'
import { setPaused } from './visibility'

interface GlStageOptions extends THREE.WebGLRendererParameters {
  /** context を失って取り戻したときに呼ぶ。毎フレーム描かないデモは、ここで描き直す */
  onRestore?: () => void
}

/**
 * three の WebGLRenderer を作る入口。WebGL が使えなければ一行の案内を出して undefined を返す。
 *
 * - three は context が取れないと console.error を出してから投げる。その前に three と同じ名前と属性で context を取ってみる。
 *   取れたら three は同じ context を使う（getContext は 2 回目から同じものを返す）
 * - context を失っている間は loop() と GSAP を止め、取り戻したら動かし直す。three は lost のときに preventDefault して、取り戻すと作り直す
 * - 画素比は 2 で止める
 */
export const createGlStage = (
  canvas: HTMLCanvasElement,
  { onRestore, ...options }: GlStageOptions = {},
) => {
  // three の WebGLRenderer の初期値と同じ。alpha は three がいつも true で作り、描くときに透かすかを決める
  const context = canvas.getContext('webgl2', {
    alpha: true,
    depth: options.depth ?? true,
    stencil: options.stencil ?? false,
    antialias: options.antialias ?? false,
    premultipliedAlpha: options.premultipliedAlpha ?? true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    powerPreference: options.powerPreference ?? 'default',
    failIfMajorPerformanceCaveat: options.failIfMajorPerformanceCaveat ?? false,
  })
  if (!context) {
    showFallback('このブラウザでは WebGL を使えません')
    return undefined
  }

  const renderer = new THREE.WebGLRenderer({ canvas, ...options })
  renderer.setPixelRatio(pixelRatio())

  // three の listener より後に足す。取り戻したときは three が作り直してから描く
  canvas.addEventListener('webglcontextlost', () =>
    setPaused('context-lost', true),
  )
  canvas.addEventListener('webglcontextrestored', () => {
    setPaused('context-lost', false)
    onRestore?.()
  })
  return renderer
}
