/** 画面の上の板。中心の位置、大きさ、傾き（rad） */
export interface Plate {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

// 広げ始めてからページを移るまで（ms）。移るのを待たせすぎない長さにし、残りは次のページが出るまで続ける
const NAVIGATE_AFTER = 150
const DURATION = 450

/** 要素の今の位置から板を作る。傾きは rotated の transform から読む（ピックアップは li が傾いている） */
export const plateOf = (el: HTMLElement, rotated: Element = el): Plate => {
  const rect = el.getBoundingClientRect()
  const transform = getComputedStyle(rotated).transform
  const matrix = new DOMMatrix(transform === 'none' ? undefined : transform)
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: el.offsetWidth || rect.width,
    height: el.offsetHeight || rect.height,
    angle: Math.atan2(matrix.b, matrix.a),
  }
}

let overlay: HTMLElement | undefined

/** 板にポスターを貼って画面いっぱいまで広げ、そのあいだにデモのページへ移る */
export const enterDemo = (href: string, poster: string, from: Plate) => {
  overlay?.remove()
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '10',
    margin: '0',
    pointerEvents: 'none',
    // 色は付けない。ポスターを描くまでの 1 コマは、下の板がそのまま見える
    background: `url("${poster}") center / cover no-repeat`,
  })
  document.body.append(el)
  overlay = el

  el.animate(
    [
      {
        left: `${from.x - from.width / 2}px`,
        top: `${from.y - from.height / 2}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        transform: `rotate(${from.angle}rad)`,
        filter: 'brightness(1)',
      },
      { filter: 'brightness(1.5)', offset: 0.3 },
      {
        left: '0px',
        top: '0px',
        width: `${innerWidth}px`,
        height: `${innerHeight}px`,
        transform: 'rotate(0rad)',
        filter: 'brightness(1)',
      },
    ],
    {
      duration: DURATION,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    },
  )
  setTimeout(() => location.assign(href), NAVIGATE_AFTER)
}

// 戻るボタンで bfcache から戻ったとき、広げた板が残らないように
addEventListener('pageshow', (event) => {
  if (event.persisted) {
    overlay?.remove()
    overlay = undefined
  }
})
