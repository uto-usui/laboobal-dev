const root = document.querySelector<HTMLElement>('.calendar-demo')!

/** 2026-11-02 の形。input type="date" の value と同じ形にそろえる */
const toValue = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

// - - 開始日と終了日。片方を選んだら、もう片方の選べる範囲を狭める
const from = root.querySelector<HTMLInputElement>('.from')!
const to = root.querySelector<HTMLInputElement>('.to')!
// 終了日は開始日より前にできない。開始日は終了日より後にできない
from.addEventListener('change', () => (to.min = from.value))
to.addEventListener('change', () => (from.max = to.value))

// - - いつも出しておくカレンダー
const calendar = root.querySelector<HTMLElement>('.calendar')!
const output = root.querySelector<HTMLInputElement>('.output')!
const monthName = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
})
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const today = new Date()
let shown = new Date(today.getFullYear(), today.getMonth(), 1)
let selected = ''

const button = (label: string, onClick: () => void) => {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

const title = document.createElement('span')
title.setAttribute('aria-live', 'polite')
const head = document.createElement('div')
head.className = 'calendar-head'
head.append(
  button('Prev', () => move(-1)),
  title,
  button('Next', () => move(1)),
)
const table = document.createElement('table')
const headRow = table.createTHead().insertRow()
for (const day of DAYS) {
  const th = document.createElement('th')
  th.textContent = day
  headRow.append(th)
}
const body = table.createTBody()
calendar.append(head, table)

/** shown の月の日付を並べ直す。見出しと曜日は作り直さないので、Prev と Next の focus は残る */
const render = () => {
  const year = shown.getFullYear()
  const month = shown.getMonth()
  title.textContent = monthName.format(shown)

  body.replaceChildren()
  // 1 日が何曜日かの分だけ、前を空ける
  const blanks = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  let row = body.insertRow()
  for (let i = 0; i < blanks; i++) row.insertCell()
  for (let day = 1; day <= days; day++) {
    if (row.cells.length === 7) row = body.insertRow()
    const value = toValue(new Date(year, month, day))
    const cell = button(String(day), () => select(value))
    cell.dataset.value = value
    cell.setAttribute('aria-pressed', String(value === selected))
    row.insertCell().append(cell)
  }
  while (row.cells.length < 7) row.insertCell()
}

const select = (value: string) => {
  selected = value
  output.value = value
  for (const cell of body.querySelectorAll<HTMLElement>('[data-value]'))
    cell.setAttribute('aria-pressed', String(cell.dataset.value === value))
}

const move = (step: number) => {
  shown = new Date(shown.getFullYear(), shown.getMonth() + step, 1)
  render()
}

render()
