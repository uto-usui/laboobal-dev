import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { dinosaurFeet } from '../../src/demos/toy-figure/dinosaur-feet.ts'
import { createDinosaur } from '../../src/demos/toy-figure/dinosaurs.ts'

const assets = 'src/demos/toy-figure/assets'
const source = process.argv[2] ?? assets
const tooling = createRequire(
  path.resolve('.work/toy-character/savanna/tooling/package.json'),
)
const loadTool = (name) => import(pathToFileURL(tooling.resolve(name)).href)
const { NodeIO } = await loadTool('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await loadTool(
  '@gltf-transform/extensions',
)
const { MeshoptEncoder } = await loadTool('meshoptimizer')
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const species = [
  { name: 'Triceratops', length: 8.5, speed: 1.03, front: 1.65, back: 0.66 },
  { name: 'Stegosaurus', length: 8.5, speed: 0.94, front: 1.62, back: 0.66 },
  { name: 'Apatosaurus', length: 22, speed: 0.94, front: 1.7, back: 0.63 },
]
const maxReach = 0.947
const world = (bone) => bone.getWorldPosition(new T.Vector3())
const angle = (a, b) => a.angleTo(b)
const modulo = (i, n) => ((i % n) + n) % n

function readLeg(model, bone) {
  const named = (part) => model.getObjectByName(bone.name.replace('Foot', part))
  const upper = named('UpLeg')
  return {
    foot: bone,
    hip: upper.parent,
    upper,
    lower: named('LowLeg'),
    front: bone.name.startsWith('Front'),
  }
}

function frame(leg, sole) {
  const hip = world(leg.upper)
  const knee = world(leg.lower)
  const ankle = world(leg.foot)
  return {
    ankle,
    hip,
    knee,
    sole,
    rotation: leg.hip.quaternion.clone(),
    hipPosition: leg.hip.position.clone(),
    upperRotation: leg.upper.quaternion.clone(),
    lowerRotation: leg.lower.quaternion.clone(),
    footPosition: leg.foot.position.clone(),
  }
}

function averageRotation(frames) {
  const average = frames[0].rotation.clone()
  for (let i = 1; i < frames.length; i++)
    average.slerp(frames[i].rotation, 1 / (i + 1))
  return average
}

function contactRange(frames, step, scale) {
  const min = Math.min(...frames.map(({ ankle }) => ankle.y))
  const n = frames.length
  const contact = frames.map(
    ({ ankle }, i) =>
      ankle.y < min + 0.002 * scale &&
      ankle.z - frames[modulo(i - 1, n)].ankle.z < -0.002 * step,
  )
  // 後退を初めて観測した標本の一つ前が接地の始点。
  const ranges = contact.flatMap((on, i) => {
    if (!on || contact[modulo(i - 1, n)]) return []
    let end = i
    while (contact[end % n]) end++
    return [[i - 1, end - 1]]
  })
  if (!ranges.length) throw new Error('Walk に接地が見つかりません')
  return ranges.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))
}

function makeTrajectory(frames, step, speed, scale) {
  const [start, end] = contactRange(frames, step, scale)
  const n = frames.length
  const first = frames[modulo(start, n)].sole
  const last = frames[modulo(end, n)].sole
  const midpoint = first.clone().lerp(last, 0.5)
  midpoint.y = 0
  const travel = (end - start) * step * speed
  const enter = midpoint.clone().add(new T.Vector3(0, 0, travel / 2))
  const leave = midpoint.clone().add(new T.Vector3(0, 0, -travel / 2))
  const interval = n - (end - start)
  const at = (i) => frames[modulo(i, n)].sole
  const soleAt = (index) => {
    const elapsed = modulo(index - start, n)
    if (elapsed <= end - start)
      return enter.clone().lerp(leave, elapsed / (end - start))
    const swing = elapsed - (end - start)
    const u = swing / interval
    const smooth = u * u * (3 - 2 * u)
    const raw = at(index)
    const liftBase = T.MathUtils.lerp(last.y, first.y, smooth)
    const continuous = raw
      .clone()
      .addScaledVector(leave.clone().sub(last), 1 - smooth)
      .addScaledVector(enter.clone().sub(first), smooth)
    continuous.y = Math.max(0, raw.y - liftBase)
    // 離地と接地の前後で、胴体と足の相対速度をつなぐ。
    const outgoing = leave
      .clone()
      .addScaledVector(new T.Vector3(0, 0, -speed), swing * step)
    const incoming = enter
      .clone()
      .addScaledVector(new T.Vector3(0, 0, speed), (interval - swing) * step)
    const blend = Math.round(interval * 0.12)
    const easeOut = T.MathUtils.smoothstep(swing, 0, blend)
    const easeIn = T.MathUtils.smoothstep(interval - swing, 0, blend)
    continuous.z = T.MathUtils.lerp(outgoing.z, continuous.z, easeOut)
    continuous.z = T.MathUtils.lerp(incoming.z, continuous.z, easeIn)
    return continuous
  }
  return { start, end, travel, originalRetreat: first.z - last.z, soleAt }
}

function aim(model, bone, from, to) {
  const parent = bone.parent.getWorldQuaternion(new T.Quaternion())
  const rotation = new T.Quaternion().setFromUnitVectors(
    from.normalize(),
    to.normalize(),
  )
  bone.quaternion.premultiply(
    parent.clone().invert().multiply(rotation).multiply(parent),
  )
  model.updateMatrixWorld(true)
}

function restoreLeg(leg, raw) {
  leg.hip.position.copy(raw.hipPosition)
  leg.hip.quaternion.copy(raw.rotation)
  leg.upper.quaternion.copy(raw.upperRotation)
  leg.lower.quaternion.copy(raw.lowerRotation)
  leg.foot.position.copy(raw.footPosition)
}

function poseLeg(model, leg, raw, mean, factor, ankle) {
  restoreLeg(leg, raw)
  leg.hip.quaternion.copy(mean).slerp(raw.rotation, factor).normalize()
  model.updateMatrixWorld(true)
  const l1 = raw.hip.distanceTo(raw.knee)
  const l2 = raw.knee.distanceTo(raw.ankle)
  let hip = world(leg.upper)
  const towards = ankle.clone().sub(hip)
  const limit = (l1 + l2) * maxReach
  const originalDistance = raw.hip.distanceTo(raw.ankle)
  const distance = leg.front
    ? Math.min(towards.length(), limit)
    : Math.min(
        Math.max(towards.length(), originalDistance - (l1 + l2) * 0.045),
        limit,
      )
  const shift = towards.length() - distance
  if (Math.abs(shift) > 1e-8) {
    // 足先が独立した骨なので、届かない分だけ付け根を寄せてから脚を曲げる。
    const pivot = world(leg.hip).addScaledVector(
      towards.clone().normalize(),
      shift,
    )
    leg.hip.position.copy(leg.hip.parent.worldToLocal(pivot))
    model.updateMatrixWorld(true)
    hip = world(leg.upper)
  }
  const axis = ankle.clone().sub(hip).normalize()
  const pole = new T.Vector3(0, 0, leg.front ? -1 : 1)
  pole.addScaledVector(axis, -pole.dot(axis)).normalize()
  const along = (l1 * l1 + distance * distance - l2 * l2) / (2 * distance)
  const knee = hip
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
  const kneePosition = world(leg.lower)
  const oldLower = raw.ankle.clone().sub(raw.knee)
  const upperRotation = new T.Quaternion().setFromUnitVectors(
    kneePosition.clone().sub(hip).normalize(),
    knee.clone().sub(hip).normalize(),
  )
  const hipRotation = leg.hip.getWorldQuaternion(new T.Quaternion())
  const previousHipRotation = hipRotation
    .clone()
    .multiply(leg.hip.quaternion.clone().invert())
    .multiply(raw.rotation)
  oldLower
    .applyQuaternion(hipRotation.multiply(previousHipRotation.invert()))
    .applyQuaternion(upperRotation)
  aim(model, leg.upper, kneePosition.sub(hip), knee.clone().sub(hip))
  aim(model, leg.lower, oldLower, ankle.clone().sub(knee))
  leg.foot.position.copy(leg.foot.parent.worldToLocal(ankle.clone()))
  model.updateMatrixWorld(true)
  const posed = frame(leg, raw.sole)
  return {
    shift: Math.abs(shift),
    reach: posed.hip.distanceTo(posed.ankle) / (l1 + l2),
    kneeDeltaDeg: T.MathUtils.radToDeg(
      angle(raw.hip.clone().sub(raw.knee), raw.ankle.clone().sub(raw.knee)) -
        angle(
          posed.hip.clone().sub(posed.knee),
          posed.ankle.clone().sub(posed.knee),
        ),
    ),
  }
}

function setTrack(doc, walk, time, name, property, values, buffer) {
  const node = doc
    .getRoot()
    .listNodes()
    .find((node) => node.getName().replace(/\./g, '') === name)
  const channel = walk
    .listChannels()
    .find(
      (ch) => ch.getTargetNode() === node && ch.getTargetPath() === property,
    )
  const output = doc
    .createAccessor()
    .setType(property === 'rotation' ? 'VEC4' : 'VEC3')
    .setArray(Float32Array.from(values))
    .setBuffer(buffer)
  let sampler = channel?.getSampler()
  if (!sampler) {
    sampler = doc.createAnimationSampler()
    walk.addSampler(sampler)
    walk.addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(property)
        .setSampler(sampler),
    )
  }
  sampler.setInput(time).setOutput(output).setInterpolation('LINEAR')
}

const byteManifest = JSON.parse(
  await fs.readFile('src/demos/toy-figure/asset-bytes.json', 'utf8'),
)
const output = '.work/toy-character/dino4'
await fs.mkdir(output, { recursive: true })
const report = []
for (const { name, length, speed, front, back } of species) {
  const input = path.join(source, `${name}.glb`)
  const bytes = await fs.readFile(input)
  const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, '')
  const { model, root, inspect } = createDinosaur(gltf, name, length)
  const { feet, sample } = dinosaurFeet(root, model, inspect().height)
  const legs = feet.map(({ bone }) => readLeg(model, bone))
  const clip = gltf.animations.find(({ name }) => name === 'Walk')
  const duration = clip.duration
  const mixer = new T.AnimationMixer(model)
  mixer.clipAction(clip).play()
  const count = Math.round(duration * 120)
  const step = duration / count
  const rows = Array.from({ length: count }, (_, i) => {
    mixer.setTime(i * step)
    const soles = sample()
    return legs.map((leg, j) => frame(leg, soles[j]))
  })
  const tracks = legs.map((leg, j) => {
    const frames = rows.map((row) => row[j])
    return {
      name: leg.foot.name,
      frames,
      mean: averageRotation(frames),
      ...makeTrajectory(frames, step, speed, model.scale.x / 0.42),
      shift: 0,
      reach: 0,
      kneeDelta: [],
      values: [[], [], [], [], []],
    }
  })
  for (let i = 0; i < count; i++) {
    mixer.setTime(i * step)
    for (const [j, leg] of legs.entries()) restoreLeg(leg, tracks[j].frames[i])
    for (const [j, leg] of legs.entries()) {
      const track = tracks[j]
      const raw = track.frames[i]
      const goal = track.soleAt(i)
      const ankle = raw.ankle.clone().add(goal).sub(raw.sole)
      const factor = leg.front ? front : back
      let result = poseLeg(model, leg, raw, track.mean, factor, ankle)
      // すねにもウェイトがある足裏は、スキニング後の位置で合わせる。
      for (let iteration = 0; iteration < 12; iteration++) {
        const error = goal.clone().sub(sample()[j])
        if (error.lengthSq() < 1e-10) break
        ankle.add(error)
        result = poseLeg(model, leg, raw, track.mean, factor, ankle)
      }
      const { shift, reach, kneeDeltaDeg } = result
      track.shift = Math.max(track.shift, shift)
      track.reach = Math.max(track.reach, reach)
      track.kneeDelta.push(kneeDeltaDeg)
      const pose = [
        leg.hip.quaternion,
        leg.hip.position,
        leg.upper.quaternion,
        leg.lower.quaternion,
        leg.foot.position,
      ]
      pose.forEach((v, k) => track.values[k].push(...v.toArray()))
    }
  }
  const doc = await io.read(input)
  const walk = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === 'Walk')
  const buffer = doc.getRoot().listBuffers()[0]
  const time = doc
    .createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(Float32Array.from({ length: count + 1 }, (_, i) => i * step))
  const accessors = new Set(doc.getRoot().listAccessors())
  for (const [j, { hip, upper, lower, foot }] of legs.entries()) {
    const destinations = [
      [hip, 'rotation'],
      [hip, 'translation'],
      [upper, 'rotation'],
      [lower, 'rotation'],
      [foot, 'translation'],
    ]
    destinations.forEach(([bone, property], k) => {
      const values = tracks[j].values[k]
      values.push(...values.slice(0, property === 'rotation' ? 4 : 3))
      setTrack(doc, walk, time, bone.name, property, values, buffer)
    })
  }
  for (const accessor of accessors) {
    if (accessor.listParents().every((p) => p === doc.getRoot()))
      accessor.dispose()
  }
  doc
    .getRoot()
    .listScenes()[0]
    .setExtras({
      ...doc.getRoot().listScenes()[0].getExtras(),
      quadrupedWalk: {
        speed: speed / model.scale.x,
        strideScale: model.scale.x,
        length,
        sole: Object.fromEntries(
          feet.map(({ bone, sole }) => [
            bone.name,
            sole.map(({ mesh, i }) => ({ mesh: mesh.name, i })),
          ]),
        ),
        stance: Object.fromEntries(
          tracks.map(({ name, start, end }) => [
            name,
            [modulo(start, count) * step, modulo(end, count) * step],
          ]),
        ),
      },
    })
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
    })
  const destination = path.join(assets, `${name}-balanced.glb`)
  await io.write(destination, doc)
  byteManifest[`${name}-balanced`] = (await fs.stat(destination)).size
  delete byteManifest[name]
  report.push({
    name,
    duration,
    speed,
    front,
    back,
    bytes: byteManifest[`${name}-balanced`],
    sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
    feet: tracks.map(
      ({
        name,
        start,
        end,
        shift,
        reach,
        originalRetreat,
        travel,
        kneeDelta,
      }) => ({
        name,
        start: start * step,
        end: end * step,
        shift,
        reach,
        originalRetreat,
        travel,
        kneeDeltaMedian: kneeDelta.map(Math.abs).sort((a, b) => a - b)[
          Math.floor(count / 2)
        ],
        kneeDeltaMax: Math.max(...kneeDelta.map(Math.abs)),
      }),
    ),
  })
}
await fs.writeFile(
  'src/demos/toy-figure/asset-bytes.json',
  `${JSON.stringify(byteManifest, null, 2)}\n`,
)
await fs.writeFile(
  `${output}/bake.json`,
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(JSON.stringify(report, null, 2))
