import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import fs from 'node:fs/promises'
for (const n of ['Trex', 'Apatosaurus', 'Velociraptor']) {
  const b = await fs.readFile(`src/demos/toy-figure/assets/${n}.glb`)
  const g = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')
  const m = new T.AnimationMixer(g.scene)
  m.clipAction(g.animations.find((c) => c.name === 'Walk')).play()
  const rows = []
  for (let t = 0; t <= 0.7; t += 0.1) {
    m.setTime(t)
    g.scene.updateMatrixWorld(true)
    const feet = []
    g.scene.traverse((o) => {
      if (o.isBone && /Foot/.test(o.name))
        feet.push([
          o.name,
          ...o
            .getWorldPosition(new T.Vector3())
            .toArray()
            .map((x) => +x.toFixed(3)),
        ])
    })
    rows.push({ t: +t.toFixed(2), feet })
  }
  console.log(
    n,
    JSON.stringify(rows),
    new T.Box3()
      .setFromObject(g.scene, true)
      .getSize(new T.Vector3())
      .toArray(),
  )
}
