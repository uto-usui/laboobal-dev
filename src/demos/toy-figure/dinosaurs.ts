import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { dinosaurFeet } from './dinosaur-feet.ts'

const FLOOR = 0.06
const UP = new THREE.Vector3(0, 1, 0)

type QuadrupedWalk = {
  speed: number
  strideScale: number
  length: number
  stance: Record<string, [number, number]>
}

export function createDinosaur(
  gltf: GLTF,
  species: string,
  length: number,
  inspect = true,
) {
  const root = new THREE.Group()
  root.name = species
  const model = clone(gltf.scene)
  root.add(model)
  const walk = model.userData.quadrupedWalk as QuadrupedWalk | undefined
  const rate =
    species === 'Velociraptor'
      ? 1.6
      : species === 'Apatosaurus'
        ? walk
          ? 0.7
          : 0.5
        : 0.65
  const mixer = new THREE.AnimationMixer(model)
  const clip = gltf.animations.find((a) => a.name === 'Walk')!
  mixer.clipAction(clip).play()
  mixer.setTime(0)
  root.updateMatrixWorld(true)
  model.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) o.skeleton.update()
  })
  model.scale.setScalar(
    walk
      ? (walk.strideScale * length) / walk.length
      : length /
          new THREE.Box3()
            .setFromObject(model, true)
            .getSize(new THREE.Vector3()).z,
  )
  root.updateMatrixWorld(true)
  model.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) o.skeleton.update()
  })
  const dimensions = new THREE.Box3()
    .setFromObject(model, true)
    .getSize(new THREE.Vector3())
  const height = dimensions.y
  const feetSampler = dinosaurFeet(root, model, height)
  const { sample, sampleWorld } = feetSampler
  const feet = feetSampler.feet.map((foot) => ({
    ...foot,
    upper: model.getObjectByName(
      foot.bone.name.replace('Foot', 'UpLeg'),
    ) as THREE.Bone,
    lower: model.getObjectByName(
      foot.bone.name.replace('Foot', 'LowLeg'),
    ) as THREE.Bone,
    front: foot.bone.name.startsWith('Front'),
    lock: undefined as THREE.Vector3 | undefined,
    contactAge: 0,
    stance: walk?.stance[foot.bone.name],
  }))
  let previous = walk ? [] : sample()
  let phase = 0
  let age = 0
  let active = false
  let initialHeading = 0
  let curve: { after: number; duration: number; angle: number } | undefined
  let restarts = 0
  let walked = 0
  let maxSlip = 0
  let allContactSlip = 0
  let supportChanges = 0
  let support = 0
  let previousContact: (THREE.Vector3 | undefined)[] = []
  const solve = (
    { bone: foot, upper, lower, front }: (typeof feet)[number],
    ankle: THREE.Vector3,
    target: THREE.Vector3,
  ) => {
    lower.updateWorldMatrix(true, false)
    const a = new THREE.Vector3().setFromMatrixPosition(upper.matrixWorld)
    const b = new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld)
    const c = ankle
    const l1 = a.distanceTo(b),
      l2 = b.distanceTo(c)
    const axis = target.clone().sub(a)
    const limited = walk || front
    const d = THREE.MathUtils.clamp(
      axis.length(),
      Math.abs(l1 - l2) + 1e-6,
      (l1 + l2) * (limited ? 0.95 : 1) - 1e-6,
    )
    axis.normalize()
    const bendSource =
      front && !walk
        ? new THREE.Vector3(0, 0, -1).transformDirection(model.matrixWorld)
        : b.clone().sub(a)
    const bend = bendSource
      .clone()
      .addScaledVector(axis, -bendSource.dot(axis))
      .normalize()
    if (limited) target = a.clone().addScaledVector(axis, d)
    const along = (l1 * l1 + d * d - l2 * l2) / (2 * d)
    const knee = a
      .clone()
      .addScaledVector(axis, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
    const rotate = (
      bone: THREE.Bone,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => {
      const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion())
      const q = new THREE.Quaternion().setFromUnitVectors(
        from.normalize(),
        to.normalize(),
      )
      bone.quaternion.premultiply(
        parent.clone().invert().multiply(q).multiply(parent),
      )
    }
    const q = new THREE.Quaternion().setFromUnitVectors(
      b.clone().sub(a).normalize(),
      knee.clone().sub(a).normalize(),
    )
    const endpoint = c.clone().sub(a).applyQuaternion(q).add(a)
    rotate(upper, b.clone().sub(a), knee.sub(a))
    const pivot = lower.getWorldPosition(new THREE.Vector3())
    rotate(lower, endpoint.sub(pivot), target.clone().sub(pivot))
    if (foot.parent !== lower)
      foot.position.copy(foot.parent!.worldToLocal(target.clone()))
  }
  const sole = new THREE.Vector3()
  const ankle = new THREE.Vector3()
  const target = new THREE.Vector3()
  return {
    root,
    model,
    species,
    get active() {
      return active
    },
    start(
      position: THREE.Vector3,
      heading: number,
      turn?: { after: number; duration: number; angle: number },
    ) {
      if (inspect && active) restarts++
      root.userData.entered = false
      root.position.copy(position)
      initialHeading = root.rotation.y = heading
      curve = turn
      model.position.y = 0
      mixer.setTime(0)
      phase = age = 0
      root.visible = active = true
      if (walk) model.position.y = FLOOR
      else {
        model.position.y = FLOOR - Math.min(...sample().map((p) => p.y))
        previous = sample()
      }
      root.updateMatrixWorld(true)
      feet.forEach((f) => {
        f.lock = undefined
        f.contactAge = 0
      })
      previousContact = []
    },
    update(dt: number) {
      if (!active) return
      let remaining = dt
      while (remaining > 1e-8) {
        const d = Math.min(remaining, 1 / 120)
        remaining -= d
        if (inspect || curve) age += d
        if (curve)
          root.rotation.y =
            initialHeading +
            curve.angle *
              THREE.MathUtils.clamp((age - curve.after) / curve.duration, 0, 1)
        phase += d * rate
        if (!walk) model.position.y = 0
        mixer.setTime(phase)
        let chosen = support
        let planted: boolean[]
        let delta: THREE.Vector3
        if (walk) {
          const t = phase % clip.duration
          planted = feet.map(({ stance }) => {
            if (!stance) return false
            const [start, end] = stance
            return start < end ? t >= start && t < end : t >= start || t < end
          })
          if (inspect && !planted[chosen])
            chosen = Math.max(0, planted.indexOf(true))
          delta = new THREE.Vector3(0, 0, walk.speed * model.scale.x * d * rate)
        } else {
          const current = sample()
          const low = Math.min(...current.map((p) => p.y))
          planted = current.map(
            (p, i) =>
              p.y < low + height * 0.018 &&
              p.z - previous[i].z < height * 0.002,
          )
          const candidates = current
            .map((p, i) => ({ i, y: p.y, dz: p.z - previous[i].z }))
            .filter((p) => p.dz < -1e-7 && p.y < low + height * 0.06)
          candidates.sort((a, b) => a.y - b.y || a.dz - b.dz)
          chosen = candidates[0]?.i ?? support
          model.position.y = FLOOR - low
          delta = previous[chosen].clone().sub(current[chosen])
          // IK 後の点を次の原アニメーションの差分へ混ぜない。
          previous = current
        }
        if (inspect && chosen !== support) supportChanges++
        delta.y = 0
        delta.applyAxisAngle(UP, root.rotation.y)
        root.position.add(delta)
        if (inspect) walked += delta.length()
        for (const [i, foot] of feet.entries()) {
          if (planted[i] && !foot.lock)
            foot.lock = sampleWorld(i, new THREE.Vector3())
        }
        for (let i = 0; i < feet.length; i++) {
          const f = feet[i]
          if (!planted[i]) {
            f.lock = undefined
            f.contactAge = 0
            continue
          }
          f.contactAge += d
          const weight =
            f.front && !walk
              ? THREE.MathUtils.smoothstep(f.contactAge, 0, 0.15)
              : 1
          for (let j = 0; j < 3; j++) {
            sampleWorld(i, sole)
            f.bone.getWorldPosition(ankle)
            target.copy(f.lock!).sub(sole).multiplyScalar(weight).add(ankle)
            if (walk && target.distanceToSquared(ankle) < 1e-10) break
            solve(f, ankle, target)
          }
        }
        if (inspect) {
          const actual = feet.map((_, i) => sampleWorld(i, new THREE.Vector3()))
          if (planted[chosen] && previousContact[chosen])
            maxSlip = Math.max(
              maxSlip,
              actual[chosen].distanceTo(previousContact[chosen]!) * 1000,
            )
          for (let i = 0; i < feet.length; i++)
            if (planted[i] && previousContact[i])
              allContactSlip = Math.max(
                allContactSlip,
                actual[i].distanceTo(previousContact[i]!) * 1000,
              )
          previousContact = actual.map((p, i) => (planted[i] ? p : undefined))
        }
        support = chosen
      }
    },
    retire() {
      root.visible = active = false
    },
    rebase(z: number) {
      root.position.z -= z
      feet.forEach((f) => {
        if (f.lock) f.lock.z -= z
      })
      if (inspect) {
        previousContact.forEach((p) => {
          if (p) p.z -= z
        })
      }
    },
    inspect: () => ({
      species,
      length: dimensions.z,
      height,
      active,
      restarts,
      age,
      walked,
      maxSlip,
      allContactSlip,
      supportChanges,
      footVertices: feet.map((f) => f.sole.length),
      duration: clip.duration,
      rate,
      position: root.position.toArray(),
    }),
  }
}
