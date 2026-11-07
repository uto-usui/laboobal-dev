/**
 * HTML-in-Canvas（Chrome 157〜）で、生きた HTML を WebGL のテクスチャにするデモの共通の部品。
 * 型は html-in-canvas.d.ts。使い方は src/demos/html-cloth/ が見本
 */

/** content="drawable" の canvas と WebGL2 の texElementSubImage2D が使えるか */
export const htmlCanvasGl = (
  canvas: HTMLCanvasElement,
  options?: WebGLContextAttributes,
) => {
  if (canvas.content !== 'drawable') return undefined
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    premultipliedAlpha: true,
    ...options,
  })
  if (!gl || !('texElementSubImage2D' in gl)) return undefined
  return gl
}

/**
 * 使えないブラウザでは、canvas の子は描かれない。要素を canvas の外（into）に出してふつうの HTML として置き、下に一行添える。
 * showFallback は画面を覆うので使わない。drawable を外すのは、対応している版で canvas を通さないと描かれないため
 */
export const showFlatFallback = (
  canvas: HTMLCanvasElement,
  elements: HTMLElement[],
  into: HTMLElement,
  message = 'この環境では HTML-in-Canvas が使えないので、ふつうの HTML のまま置いています',
) => {
  for (const el of elements) {
    el.removeAttribute('drawable')
    into.append(el)
  }
  canvas.remove()
  const note = document.createElement('p')
  note.textContent = message
  note.style.cssText =
    'margin: 0; padding: 0 16px; color: var(--color-muted); font-size: 12px; text-align: center'
  into.append(note)
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
) => {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? '')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? '')
  const uniforms = new Map<string, WebGLUniformLocation | null>()
  const u = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name))
    return uniforms.get(name)!
  }
  return { program: p, u }
}

/**
 * 要素を写す WebGL のテクスチャ。canvas の paint の中で upload を呼ぶ。
 * 大きさは getElementImageDefaultSize（canvas の解像度の px）で決まり、変わったら取り直す
 */
export const elementTexture = (
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  el: HTMLElement,
) => {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const state = {
    texture,
    width: 0,
    height: 0,
    /** 写し終えたか。最初の paint の前は空 */
    ready: false,
    upload() {
      const size = canvas.getElementImageDefaultSize(el)
      const w = Math.ceil(size.width)
      const h = Math.ceil(size.height)
      if (!w || !h) return false
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (w !== state.width || h !== state.height) {
        state.width = w
        state.height = h
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          w,
          h,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        )
      }
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, el)
      state.ready = true
      return true
    },
  }
  return state
}

/**
 * canvas の CSS px の座標を WebGL のクリップ座標へ写す行列。M（要素の px → canvas の px）の前に掛ける。
 * 奥行きは手前（z が大きい）ほど小さくし、depth test で手前が勝つようにする
 */
export const clipMatrix = (width: number, height: number) =>
  new DOMMatrix([
    2 / width,
    0,
    0,
    0,
    0,
    -2 / height,
    0,
    0,
    0,
    0,
    -1 / 4000,
    0,
    -1,
    1,
    0,
    1,
  ])

/** 透視（目から画面までの距離 d px）。css の perspective と同じ */
export const perspective = (d: number) =>
  new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / d, 0, 0, 0, 1])
