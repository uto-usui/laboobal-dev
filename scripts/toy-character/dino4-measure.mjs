import fs from 'node:fs/promises'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { dinosaurFeet } from '../../src/demos/toy-figure/dinosaur-feet.ts'
import { createDinosaur } from '../../src/demos/toy-figure/dinosaurs.ts'
import { createDinosaur as before } from '../../.work/toy-character/dino4/dinosaurs-before.ts'

const out = '.work/toy-character/dino4'
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const assets = 'src/demos/toy-figure/assets'
async function load(name) {
  const bytes = await fs.readFile(`${assets}/${name}.glb`)
  return loader.parseAsync(Uint8Array.from(bytes).buffer, '')
}

function probe(animal) {
  const { root, model } = animal
  const { feet, sample } = dinosaurFeet(root, model, animal.inspect().height)
  const legs = feet.map(({ bone }) => ({
    name: bone.name,
    foot: bone,
    upper: model.getObjectByName(bone.name.replace('Foot', 'UpLeg')),
    lower: model.getObjectByName(bone.name.replace('Foot', 'LowLeg')),
  }))
  return {
    legs,
    sample() {
      const soles = sample()
      return legs.map(({ upper, lower, foot }, i) => {
        const hip = upper.getWorldPosition(new T.Vector3())
        const knee = lower.getWorldPosition(new T.Vector3())
        const ankle = foot.getWorldPosition(new T.Vector3())
        const axis = ankle.clone().sub(hip).normalize()
        const thigh = knee.clone().sub(hip)
        return {
          sole: root.localToWorld(soles[i]),
          bend: thigh.z - thigh.dot(axis) * axis.z,
          reach:
            hip.distanceTo(ankle) / (thigh.length() + knee.distanceTo(ankle)),
        }
      })
    },
  }
}

function maxDistance(points) {
  let max = 0
  let pair
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < i; j++) {
      const vector = points[i].clone().sub(points[j])
      if (vector.lengthSq() <= max) continue
      max = vector.lengthSq()
      pair = vector.toArray()
    }
  }
  return { distance: Math.sqrt(max), vector: pair ?? [0, 0, 0] }
}

const results = []
for (const [name, length, oldRate] of [
  ['Triceratops', 8.5, 0.65],
  ['Stegosaurus', 8.5, 0.65],
  ['Apatosaurus', 22, 0.5],
]) {
  const original = await load(name)
  const baked = await load(`${name}-balanced`)
  const raw = before(original, name, length)
  const previous = before(original, name, length)
  const corrected = createDinosaur(baked, name, length)
  const bakedRaw = createDinosaur(baked, name, length)
  const { rate } = corrected.inspect()
  const clip = original.animations.find((c) => c.name === 'Walk')
  const rawMixer = new T.AnimationMixer(raw.model)
  rawMixer.clipAction(clip).play()
  const bakedMixer = new T.AnimationMixer(bakedRaw.model)
  bakedMixer.clipAction(baked.animations.find((c) => c.name === 'Walk')).play()
  for (const animal of [previous, corrected]) animal.start(new T.Vector3(), 0)
  bakedRaw.start(new T.Vector3(), 0)
  const orig = probe(raw)
  const balance = probe(bakedRaw)
  const old = probe(previous)
  const next = probe(corrected)
  const { stance } = baked.scene.userData.quadrupedWalk
  const stats = orig.legs.map(({ name }, i) => {
    const [start, end] = stance[name]
    bakedMixer.setTime(start)
    const contactStart = balance.sample()[i].sole.z
    bakedMixer.setTime(end)
    const retreatM = contactStart - balance.sample()[i].sole.z
    return {
      name,
      before: {
        maxSlipMm: 0,
        reach: 0,
        reversalFrames: 0,
        reversals: 0,
        lift: 0,
      },
      after: {
        maxSlipMm: 0,
        reach: 0,
        reversalFrames: 0,
        reversals: 0,
        lift: 0,
      },
      rawLift: 0,
      retreatM,
      runtimeCorrectionMm: 0,
      hasStart: false,
      oldContact: [],
      newContact: [],
      oldReversed: false,
      newReversed: false,
    }
  })
  const count = Math.ceil((clip.duration * 3 * 120) / rate)
  for (let i = 1; i <= count; i++) {
    previous.update(rate / oldRate / 120)
    corrected.update(1 / 120)
    const anim = (i * rate) / 120
    const t = anim % clip.duration
    const worldPosition = corrected.root.position
    rawMixer.setTime(anim)
    bakedMixer.setTime(anim)
    const source = orig.sample()
    const bakedPose = balance.sample()
    const beforePose = old.sample()
    const afterPose = next.sample()
    for (const [j, stat] of stats.entries()) {
      const [start, end] = stance[stat.name]
      const contact =
        start < end ? t >= start && t < end : t >= start || t < end
      const poses = [
        [stat.before, beforePose[j], stat.oldReversed],
        [stat.after, afterPose[j], stat.newReversed],
      ]
      const reversed = poses.map(([result, pose, wasReversed]) => {
        result.reach = Math.max(result.reach, pose.reach)
        if (!contact) result.lift = Math.max(result.lift, pose.sole.y - 0.06)
        const reverse =
          Math.abs(source[j].bend) >= 0.015 &&
          Math.sign(pose.bend) !== Math.sign(source[j].bend)
        if (reverse) {
          result.reversalFrames++
          if (!wasReversed) result.reversals++
        }
        return reverse
      })
      ;[stat.oldReversed, stat.newReversed] = reversed
      stat.rawLift = Math.max(stat.rawLift, source[j].sole.y)
      if (contact && stat.hasStart) {
        stat.oldContact.push(beforePose[j].sole)
        stat.newContact.push(afterPose[j].sole)
        stat.runtimeCorrectionMm = Math.max(
          stat.runtimeCorrectionMm,
          bakedPose[j].sole
            .clone()
            .add(worldPosition)
            .distanceTo(afterPose[j].sole) * 1000,
        )
      }
      if (!contact && stat.newContact.length) {
        for (const [result, points] of [
          [stat.before, stat.oldContact],
          [stat.after, stat.newContact],
        ]) {
          const { distance, vector } = maxDistance(points)
          if (distance * 1000 > result.maxSlipMm) {
            result.maxSlipMm = distance * 1000
            result.maxSlipVector = vector
          }
          points.length = 0
        }
      }
      if (!contact) stat.hasStart = true
    }
  }
  results.push({
    name,
    rate,
    oldRate,
    duration: clip.duration,
    seconds: count / 120,
    speedBefore: previous.inspect().walked / ((count * rate) / (120 * oldRate)),
    speedAfter: corrected.inspect().walked / (count / 120),
    beforeBodyLength: previous.inspect().length,
    afterBodyLength: corrected.inspect().length,
    feet: stats.map(
      ({ name, before, after, rawLift, retreatM, runtimeCorrectionMm }) => ({
        name,
        before,
        after,
        rawLift,
        retreatM,
        runtimeCorrectionMm,
      }),
    ),
  })
}
await fs.writeFile(`${out}/feet.json`, `${JSON.stringify(results, null, 2)}\n`)
for (const a of results)
  console.log(
    a.name,
    a.speedBefore.toFixed(3),
    a.speedAfter.toFixed(3),
    a.feet.map((f) => [
      f.name,
      f.before.maxSlipMm.toFixed(1),
      f.after.maxSlipMm.toFixed(3),
      f.after.reach.toFixed(5),
      f.after.reversals,
      f.rawLift.toFixed(3),
      f.before.lift.toFixed(3),
      f.after.lift.toFixed(3),
      f.runtimeCorrectionMm.toFixed(2),
    ]),
  )
