interface Todo {
  text: string
  done: boolean
}

const root = document.querySelector<HTMLElement>('[data-todo]')!
const list = root.querySelector<HTMLUListElement>('[data-list]')!
const form = root.querySelector<HTMLFormElement>('[data-form]')!
const field = form.querySelector<HTMLInputElement>('input')!
const template = root.querySelector<HTMLTemplateElement>('[data-item]')!
const remaining = root.querySelector<HTMLElement>('[data-remaining]')!
const total = root.querySelector<HTMLElement>('[data-total]')!

const todos: Todo[] = [
  { text: 'task A', done: true },
  { text: 'task B', done: false },
]

/** 数を数え直す。Vue の computed の remaining にあたる */
const count = () => {
  remaining.textContent = String(todos.filter((todo) => !todo.done).length)
  total.textContent = String(todos.length)
}

/** 1 件分の li を作る。チェックを切り替えたら、データを書き換えて数え直す */
const render = (todo: Todo) => {
  const item = template.content.firstElementChild!.cloneNode(
    true,
  ) as HTMLLIElement
  const checkbox = item.querySelector('input')!
  checkbox.checked = todo.done
  checkbox.addEventListener('change', () => {
    todo.done = checkbox.checked
    count()
  })
  item.querySelector('span')!.textContent = todo.text
  list.append(item)
}

todos.forEach(render)
count()

// Vue の methods の addTodo にあたる。空白だけのものは足さない
form.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = field.value.trim()
  if (!text) return
  const todo = { text, done: false }
  todos.push(todo)
  render(todo)
  count()
  field.value = ''
})
