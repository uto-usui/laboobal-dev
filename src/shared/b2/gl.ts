import * as THREE from 'three'

/** 頂点シェーダーで position をそのまま出す、画面いっぱいの板。カメラの行列を使わない */
export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** 画面いっぱいの板を 1 枚だけ置いたシーン。描くときのカメラは何でもよい */
export const createFullscreenScene = (material: THREE.Material) => {
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  scene.add(mesh)
  return { scene, camera: new THREE.Camera() }
}

/**
 * 画像を画面いっぱいに切り取って貼るとき（CSS の object-fit: cover）の uv の倍率。
 * シェーダーで `(vUv - 0.5) * scale + 0.5` に使う
 */
export const coverScale = (
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
  target = new THREE.Vector2(),
) => {
  const view = viewWidth / viewHeight
  const image = imageWidth / imageHeight
  return view > image
    ? target.set(1, image / view)
    : target.set(view / image, 1)
}

export const loadTexture = (src: string) =>
  new THREE.TextureLoader().loadAsync(src)
