export interface SplitResult {
  words: HTMLSpanElement[]
  chars: HTMLSpanElement[]
}

/**
 * 要素のテキストを単語と文字の span に分ける（splitting.js の代わり）。
 * 単語は `.word`、文字は `.char` で、それぞれ `--word-index` / `--char-index` を持つ。
 * 親には `--word-total` / `--char-total` を付ける。CSS だけで時間差を付けられるようにするため。
 * 読み上げは元の文のままにしたいので、親に aria-label を付け、span 側は aria-hidden にする
 */
export const splitText = (el: HTMLElement): SplitResult => {
  const text = el.textContent ?? ''
  const words: HTMLSpanElement[] = []
  const chars: HTMLSpanElement[] = []

  el.setAttribute('aria-label', text.trim())
  el.textContent = ''

  for (const part of text.split(/(\s+)/)) {
    if (part === '') continue
    if (/^\s+$/.test(part)) {
      el.append(document.createTextNode(' '))
      continue
    }
    const word = document.createElement('span')
    word.className = 'word'
    word.setAttribute('aria-hidden', 'true')
    word.style.setProperty('--word-index', String(words.length))
    for (const c of part) {
      const char = document.createElement('span')
      char.className = 'char'
      char.dataset.char = c
      char.textContent = c
      char.style.setProperty('--char-index', String(chars.length))
      word.append(char)
      chars.push(char)
    }
    el.append(word)
    words.push(word)
  }

  el.style.setProperty('--word-total', String(words.length))
  el.style.setProperty('--char-total', String(chars.length))
  return { words, chars }
}
