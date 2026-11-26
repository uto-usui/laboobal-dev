import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import sizes from './asset-bytes.json'

export function createLoading(stage: HTMLElement, loader: GLTFLoader) {
  const panel = stage.querySelector<HTMLElement>('.loading')!
  const bar = panel.querySelector<HTMLElement>('[role="progressbar"]')!
  const number = panel.querySelector<HTMLElement>('[data-progress]')!
  const status = document.querySelector<HTMLElement>('.loading-status')!
  status.textContent = '読み込みを始めます'
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0)
  const downloaded = new Map<string, number>()
  let progress = 0
  const set = (value: number) => {
    progress = Math.max(progress, Math.min(100, Math.floor(value)))
    number.textContent = `${progress}%`
    bar.setAttribute('aria-valuenow', String(progress))
    panel.style.setProperty('--progress', String(progress / 100))
  }
  return {
    async load(url: string) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`GLB: ${response.status}`)
      const chunks: Uint8Array[] = []
      let length = 0
      const reader = response.body?.getReader()
      const received = (chunk: Uint8Array) => {
        chunks.push(chunk)
        length += chunk.byteLength
        downloaded.set(url, length)
        // fetch の本文は展開済みなので、圧縮時も元ファイルのバイト数と比較できる。
        set((90 * [...downloaded.values()].reduce((a, b) => a + b, 0)) / total)
      }
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          received(value)
        }
      } else received(new Uint8Array(await response.arrayBuffer()))
      const data = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.byteLength
      }
      return loader.parseAsync(data.buffer, '')
    },
    set,
    complete() {
      set(100)
      stage.setAttribute('aria-busy', 'false')
      status.textContent = '読み込みが完了しました'
      requestAnimationFrame(() => panel.remove())
    },
  }
}
