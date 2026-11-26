import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import fs from 'node:fs/promises'
import { createDinosaur } from '../../.work/toy-character/dino3/dinosaurs-experiment.ts'
const result = []
for (const [name, length] of [
  ['Triceratops', 8.5],
  ['Stegosaurus', 8.5],
  ['Apatosaurus', 22],
  ['Parasaurolophus', 9.5],
]) {
  const bytes = await fs.readFile(`src/demos/toy-figure/assets/${name}.glb`)
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  const a = createDinosaur(gltf, name, length)
  const raw = createDinosaur(gltf, name, length)
  const mix = new T.AnimationMixer(raw.model),
    clip = gltf.animations.find((c) => c.name === 'Walk')
  mix.clipAction(clip).play()
  const bones = []
  raw.model.traverse((o) => {
    if (o.isBone && /Foot/.test(o.name)) bones.push(o.name)
  })
  const sample = (o) =>
    bones.map((name) => {
      const foot = o.model.getObjectByName(name),
        upper = o.model.getObjectByName(name.replace('Foot', 'UpLeg')),
        lower = o.model.getObjectByName(name.replace('Foot', 'LowLeg'))
      const p = foot.getWorldPosition(new T.Vector3()),
        u = upper.getWorldPosition(new T.Vector3()),
        l = lower.getWorldPosition(new T.Vector3()),
        axis = p.clone().sub(u),
        bend = l
          .clone()
          .sub(u)
          .addScaledVector(axis, -l.clone().sub(u).dot(axis) / axis.lengthSq())
      return {
        name,
        p: p.toArray(),
        stretch: u.distanceTo(p) / (u.distanceTo(l) + l.distanceTo(p)),
        bendZ: bend.z,
      }
    })
  a.start(new T.Vector3(), 0)
  const rows = []
  for (let i = 0; i <= 480; i++) {
    const t = (i * clip.duration) / 480
    mix.setTime(t)
    raw.root.updateMatrixWorld(true)
    if (i) a.update(clip.duration / 480 / (name === 'Apatosaurus' ? 0.5 : 0.65))
    rows.push({ t, raw: sample(raw), current: sample(a) })
  }
  const stats = bones.map((name, k) => {
    const r = rows.map((r) => r.raw[k])
    let total = 0
    for (let i = 1; i < r.length; i++)
      if (
        r[i].p[1] <
          Math.min(...r.map((x) => x.p[1])) + a.inspect().height * 0.018 &&
        r[i].p[2] < r[i - 1].p[2]
      )
        total += r[i - 1].p[2] - r[i].p[2]
    return {
      name,
      minY: Math.min(...r.map((x) => x.p[1])),
      stanceRetreatM: total,
      rawStretchMax: Math.max(...r.map((x) => x.stretch)),
      currentStretchMax: Math.max(...rows.map((x) => x.current[k].stretch)),
      rawBendZ: [
        Math.min(...r.map((x) => x.bendZ)),
        Math.max(...r.map((x) => x.bendZ)),
      ],
      currentBendZ: [
        Math.min(...rows.map((x) => x.current[k].bendZ)),
        Math.max(...rows.map((x) => x.current[k].bendZ)),
      ],
    }
  })
  result.push({ name, duration: clip.duration, stats, rows })
  console.log(name, clip.duration, stats)
}
await fs.writeFile(
  '.work/toy-character/dino3/probe-experiment.json',
  JSON.stringify(result, null, 2),
)
