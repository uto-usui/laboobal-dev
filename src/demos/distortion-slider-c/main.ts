import { createDistortionSlider } from '../../shared/a/distortion-slider'
import photo1 from './assets/01.jpg'
import photo2 from './assets/02.jpg'
import photo3 from './assets/03.jpg'
import fragment from './assets/frag.glsl?raw'

createDistortionSlider({
  root: document.querySelector<HTMLElement>('.slider')!,
  photos: [photo1, photo2, photo3],
  intensity: 0.5,
  fragment,
})
