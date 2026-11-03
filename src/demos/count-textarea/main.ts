const textarea = document.querySelector<HTMLTextAreaElement>(
  '.count-text textarea',
)!
const count = document.querySelector<HTMLElement>('.count-text strong')!

// 絵文字や「が」の濁点を分けて入力した字も、見た目の 1 文字を 1 と数える
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
const countChars = (text: string) => [...segmenter.segment(text)].length

// input は、キーの入力、貼り付け、切り取り、変換中の文字が変わったときのどれでも来る
textarea.addEventListener('input', () => {
  count.textContent = String(countChars(textarea.value))
})
