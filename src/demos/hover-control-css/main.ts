import type { Mount } from '../../shared/variants'

// 動きは Demo.astro の CSS（:hover と transition）だけで書いている。組で切り替えるために、何もしない mount を置く
export const mount: Mount = () => () => {}
