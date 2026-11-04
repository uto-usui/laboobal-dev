import { autoplayLoop } from '../../shared/motion'

const ticker = document.querySelector<HTMLElement>('.ticker')!
const list = ticker.querySelector<HTMLElement>('ul')!
/** もとは 16ms ごとに 1px。1 秒に 62.5px */
const SPEED = 62.5
/** 流しきったとみなすまでに、最後の項目のあとに空ける幅 */
const MARGIN = 30

// 右の端の外から入ってくる
let left = ticker.clientWidth

const place = () => {
  list.style.transform = `translateX(${left}px)`
}
place()

autoplayLoop(
  (dt) => {
    left -= SPEED * dt
    // 全部が左の端の外へ出たら、右の端の外に戻す。幅は毎回測るので、画面の大きさや字の読み込みで変わっても合う
    if (left < -(list.offsetWidth + MARGIN)) left = ticker.clientWidth
    place()
  },
  // 動きを減らす設定では流さず、先頭から読める位置に止める
  () => {
    left = 0
    place()
  },
)
