import { createDistortionSlider } from '../../shared/a/distortion-slider'
import photo1 from './assets/01.webp'
import photo2 from './assets/02.webp'
import photo3 from './assets/03.webp'
import fragment from './assets/frag.glsl?raw'

createDistortionSlider({
  root: document.querySelector<HTMLElement>('.slider')!,
  photos: [photo1, photo2, photo3],
  intensity: 0.25,
  fragment,
})
