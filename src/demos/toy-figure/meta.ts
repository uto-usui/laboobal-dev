import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'toy-figure',
  title: '恐竜の野原を歩くフィギュア',
  category: 'hover',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [
    {
      label: 'Quaternius Animated Dinosaur Pack (CC0)',
      url: 'https://quaternius.com/packs/animateddinosaurs.html',
    },
    {
      label: 'Quaternius Ultimate Nature Pack (CC0)',
      url: 'https://quaternius.com/packs/ultimatenature.html',
    },
    {
      label: 'Quaternius Stylized Nature MegaKit (CC0)',
      url: 'https://quaternius.com/packs/stylizednaturemegakit.html',
    },
  ],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-19',
  added: '2026-11-26',
  description:
    'おもちゃ風のキャラが恐竜のいる野原を歩き続ける。横にドラッグすると見る角度が変わり、押すと足を止めてそちらを眺める。',
  tags: ['3d', 'cursor', 'parallax', 'drag'],
  tech: ['three'],
})
