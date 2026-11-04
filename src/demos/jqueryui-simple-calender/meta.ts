import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'jqueryui-simple-calender',
  title: '開始日と終了日を選ぶカレンダー',
  category: 'form',
  batch: 'F6',
  article: 'https://webmanab.com/lab/jqueryui-simple-calender/',
  origin: 'https://jsfiddle.net/yutousui/ykqu87wo/',
  credits: [],
  webgl: false,
  interaction: 'click',
  created: '2017-02-07',
  added: '2026-11-02',
  description:
    '開始日と終了日を選ぶ欄と、押した日が下の欄に入るカレンダー。選べる日の範囲が互いに縛られる。',
  tags: ['form', 'ui'],
  tech: ['js'],
})
