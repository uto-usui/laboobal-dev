// HTML-in-Canvas（Chrome 157〜）の型。TypeScript の lib.dom にまだ入っていない分だけ書く
// https://wicg.github.io/html-in-canvas/

interface HTMLCanvasElement {
  content: 'fallback' | 'drawable'
  requestPaint(): void
  getElementImageDefaultSize(element: Element): {
    width: number
    height: number
  }
  updateElementGeometry(
    element: Element,
    options: { canvasTransform?: DOMMatrixInit; canvasClip?: DOMRectInit },
  ): void
  clearElementGeometry(element: Element): void
}

interface WebGL2RenderingContext {
  texElementSubImage2D(
    target: GLenum,
    level: GLint,
    xoffset: GLint,
    yoffset: GLint,
    element: Element,
  ): void
}

declare namespace astroHTML.JSX {
  interface CanvasHTMLAttributes {
    content?: 'fallback' | 'drawable'
  }
  interface HTMLAttributes {
    drawable?: boolean
  }
}
