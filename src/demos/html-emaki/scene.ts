import { createProgram } from '../../shared/html-canvas'
import {
  FACE_FS,
  FACE_VS,
  PAPER_FS,
  PAPER_VS,
  ROD_FS,
  ROD_VS,
  SHADOW_FS,
  SHADOW_VS,
} from './shaders'

/** 紙 1 枚の大きさ（設計の px）。Demo.astro の .sheet と同じ */
export const SHEET_W = 900
export const PAPER_H = 360
/** 紙の厚み。1 巻きで半径がこれだけ増える。本物より厚くして、木口の渦が見えるようにしている */
export const THICK = 0.9
/** 左の軸（巻物の終わりに付く）と、右の八双（始まりの細い竹）の半径 */
export const CORE_L = 9
export const CORE_R = 3.5
/** 軸首が紙の天地から出る長さ */
export const KNOB = 11
/** z を画面の上へずらす割合 */
export const KY = 0.42

export interface Rolls {
  /** 右の巻き。中心の x、外の半径、芯の半径、平らな所との境目の s */
  right: [number, number, number, number]
  left: [number, number, number, number]
}

export interface View {
  width: number
  height: number
  dpr: number
  k: number
  ox: number
  oy: number
}

export const rollRadius = (core: number, length: number) =>
  Math.sqrt(core * core + (THICK * length) / Math.PI)

export const createScene = (gl: WebGL2RenderingContext, sheetCount: number) => {
  const LEN = sheetCount * SHEET_W
  const paper = createProgram(gl, PAPER_VS, PAPER_FS)
  const face = createProgram(gl, FACE_VS, FACE_FS)
  const rod = createProgram(gl, ROD_VS, ROD_FS)
  const shadow = createProgram(gl, SHADOW_VS, SHADOW_FS)

  const vao = (data: Float32Array, size: number) => {
    const v = gl.createVertexArray()
    gl.bindVertexArray(v)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    return v
  }

  // 紙は s の向きに 2px ごとの帯。天と地の 2 点ずつ。巻きの形は頂点シェーダーが決めるので、中身は変えない
  const STEP = 2
  const columns = Math.ceil(LEN / STEP) + 1
  const strip = new Float32Array(columns * 4)
  for (let i = 0; i < columns; i++) {
    const s = Math.min(LEN, i * STEP)
    strip.set([s, 0, s, PAPER_H], i * 4)
  }
  const paperVao = vao(strip, 2)
  const quadVao = vao(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2)

  // 円柱の胴（帯）とふた（扇）
  const SEG = 32
  const rodData: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2
    rodData.push(a, 0, 0, a, 1, 0)
  }
  rodData.push(0, 0, 1)
  for (let i = 0; i <= SEG; i++) rodData.push((i / SEG) * Math.PI * 2, 1, 1)
  const rodVao = vao(new Float32Array(rodData), 3)

  // 紙を写す atlas。1 枚ぶんの大きさは getElementImageDefaultSize（canvas の解像度の px）
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const atlas = { tw: 0, th: 0, cols: 1, rows: 1 }
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number

  /** 大きさが変わったら atlas を取り直す。取り直したら true（全部を写し直す） */
  const allocate = (tw: number, th: number) => {
    if (tw === atlas.tw && th === atlas.th) return false
    atlas.tw = tw
    atlas.th = th
    atlas.cols = Math.max(1, Math.min(sheetCount, Math.floor(maxSize / tw)))
    atlas.rows = Math.ceil(sheetCount / atlas.cols)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      atlas.cols * tw,
      atlas.rows * th,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    return true
  }

  const upload = (index: number, el: Element) => {
    const col = atlas.cols - 1 - (index % atlas.cols)
    const row = Math.floor(index / atlas.cols)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texElementSubImage2D(
      gl.TEXTURE_2D,
      0,
      col * atlas.tw,
      row * atlas.th,
      el,
    )
  }

  const setView = (
    program: ReturnType<typeof createProgram>,
    view: View,
    rolls: Rolls,
  ) => {
    gl.useProgram(program.program)
    gl.uniform2f(program.u('uView'), view.width, view.height)
    gl.uniform2f(program.u('uOrigin'), view.ox, view.oy)
    gl.uniform1f(program.u('uK'), view.k)
    gl.uniform1f(program.u('uKy'), KY)
    gl.uniform4fv(program.u('uRollR'), rolls.right)
    gl.uniform4fv(program.u('uRollL'), rolls.left)
    gl.uniform1f(program.u('uPH'), PAPER_H)
  }

  const drawRod = (
    view: View,
    rolls: Rolls,
    x: number,
    z: number,
    r: number,
    y0: number,
    y1: number,
    color: [number, number, number],
    band = -1,
  ) => {
    setView(rod, view, rolls)
    gl.uniform3f(rod.u('uRod'), x, z, r)
    gl.uniform2f(rod.u('uSpan'), y0, y1)
    gl.uniform3fv(rod.u('uColor'), color)
    gl.uniform1f(rod.u('uBand'), band)
    gl.bindVertexArray(rodVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2)
    gl.drawArrays(gl.TRIANGLE_FAN, (SEG + 1) * 2, SEG + 2)
  }

  const render = (view: View, rolls: Rolls, lift: number) => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    setView(shadow, view, rolls)
    gl.uniform1f(shadow.u('uDpr'), view.dpr)
    gl.bindVertexArray(quadVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.BLEND)

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    setView(paper, view, rolls)
    gl.uniform1f(paper.u('uLen'), LEN)
    gl.uniform1f(paper.u('uThick'), THICK)
    gl.uniform1f(paper.u('uLift'), lift)
    gl.uniform1f(paper.u('uSheetW'), SHEET_W)
    gl.uniform4f(
      paper.u('uAtlas'),
      1 / atlas.cols,
      1 / atlas.rows,
      atlas.cols,
      sheetCount,
    )
    gl.uniform1i(paper.u('uTex'), 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.bindVertexArray(paperVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, columns * 2)

    // 木口。地の側（手前）だけが見える
    const [rx, rR, rc] = rolls.right
    const [lx, lR, lc] = rolls.left
    setView(face, view, rolls)
    gl.uniform1f(face.u('uThick'), THICK)
    gl.uniform1f(face.u('uFaceY'), PAPER_H - 1)
    gl.bindVertexArray(quadVao)
    gl.uniform4f(face.u('uRoll'), lx, lR, lc, 1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.uniform4f(face.u('uRoll'), rx, rR, rc, -1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // 左は軸と軸首（黒漆に金の帯）、右は八双の竹
    const lacquer: [number, number, number] = [0.13, 0.06, 0.05]
    drawRod(view, rolls, lx, lR, lc, -2, PAPER_H + 2, [0.32, 0.2, 0.12])
    drawRod(view, rolls, lx, lR, lc * 1.3, -KNOB, 0, lacquer, 0.25)
    drawRod(
      view,
      rolls,
      lx,
      lR,
      lc * 1.3,
      PAPER_H,
      PAPER_H + KNOB,
      lacquer,
      0.75,
    )
    drawRod(view, rolls, rx, rR, rc, -3, PAPER_H + 3, [0.55, 0.45, 0.25])
  }

  return { LEN, allocate, upload, render }
}
