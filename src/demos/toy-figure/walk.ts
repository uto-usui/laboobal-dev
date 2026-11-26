import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { skinnedPositions } from './skinned-positions'

const UP = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)
export const STEP_LENGTH = 0.14
export const STEP_TIME = 0.34
const smooth = (t: number) => t * t * (3 - 2 * t)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function createWalker(
  character: THREE.Group,
  gltf: GLTF,
  floor: number,
  inspect: boolean,
) {
  character.updateMatrixWorld(true)
  const find = (name: string) => {
    let found: THREE.Bone | undefined
    character.traverse((o) => {
      const i = gltf.parser.associations.get(o)?.nodes
      if (
        o instanceof THREE.Bone &&
        i !== undefined &&
        gltf.parser.json.nodes[i].name === name
      )
        found = o
    })
    if (!found) throw new Error(`Missing bone: ${name}`)
    return found
  }
  const makePart = (name: string) => {
    const object = find(name)
    return {
      object,
      rest: object.quaternion.clone(),
      world: object.getWorldQuaternion(new THREE.Quaternion()),
      position: object
        .getWorldPosition(new THREE.Vector3())
        .sub(character.position),
    }
  }
  const body = character.getObjectByName('body') as THREE.SkinnedMesh
  const skin = skinnedPositions(body)
  const legs = ['L', 'R'].map((side) => {
    const thigh = makePart(`thigh.${side}`)
    const shin = makePart(`shin.${side}`)
    const foot = makePart(`foot.${side}`)
    const sole: number[] = []
    const positions = body.geometry.getAttribute('position')
    const p = new THREE.Vector3()
    let bottom = Infinity
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(body.matrixWorld)
      if (p.x * foot.position.x <= 0 || p.y > floor + 0.025) continue
      bottom = Math.min(bottom, p.y)
    }
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(body.matrixWorld)
      if (p.x * foot.position.x > 0 && p.y < bottom + 0.0015) sole.push(i)
    }
    // 靴底の頂点を使う。足首の高さだけを合わせると、靴の厚さが床へ沈む。
    const offset = bottom - foot.object.getWorldPosition(new THREE.Vector3()).y
    return {
      thigh,
      shin,
      foot,
      sole,
      offset,
      anchor: foot.position.clone().add(character.position),
      contact: new THREE.Vector3(),
      contactPoints: [] as THREE.Vector3[],
      contactIndex: 0,
      contactOrigins: new Map<number, THREE.Vector3>(),
      maxSlip: 0,
      patchSlip: 0,
      orientation: foot.world.clone(),
      knee: 0,
      a: shin.position.clone().sub(thigh.position),
      b: foot.position.clone().sub(shin.position),
    }
  })
  const arms = ['L', 'R'].map((s) => makePart(`upper_arm.${s}`))
  const pelvis = makePart('root')
  const lower = makePart('spine.lower')
  const pitch = (part: ReturnType<typeof makePart>, angle: number) =>
    part.object.quaternion
      .copy(part.rest)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          X.clone().applyQuaternion(part.world.clone().invert()),
          angle,
        ),
      )
  const setWorld = (part: ReturnType<typeof makePart>, q: THREE.Quaternion) => {
    part.object.parent!.updateWorldMatrix(true, false)
    part.object.quaternion.copy(
      part.object
        .parent!.getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(q),
    )
  }
  const sampleSole = (leg: (typeof legs)[number]) => {
    let y = Infinity
    const center = new THREE.Vector3()
    const p = new THREE.Vector3()
    const points: THREE.Vector3[] = []
    let minIndex = 0
    skin.update()
    for (const [j, i] of leg.sole.entries()) {
      skin.world(i, p)
      if (p.y < y) {
        y = p.y
        minIndex = j
      }
      center.add(p)
      points.push(p.clone())
    }
    center.divideScalar(leg.sole.length)
    return { y, center, points, minIndex }
  }
  const rememberContact = (leg: (typeof legs)[number]) => {
    const sole = sampleSole(leg)
    leg.contactIndex = sole.minIndex
    leg.contact.copy(sole.points[sole.minIndex])
    leg.contactPoints = sole.points
    leg.contactOrigins.clear()
    leg.maxSlip = 0
    leg.patchSlip = 0
  }
  legs.forEach(rememberContact)
  const poseLeg = (
    leg: (typeof legs)[number],
    ankle: THREE.Vector3,
    knee: number,
    orientation: THREE.Quaternion,
  ) => {
    // 正の値だけが後ろ曲げ。補間や IK の後にも、ここで必ず制限する。
    leg.knee = THREE.MathUtils.clamp(knee, 0, THREE.MathUtils.degToRad(40))
    const bent = leg.a.clone().add(leg.b.clone().applyAxisAngle(X, leg.knee))
    const hip = hipAt(leg, character.position, yaw)
    const desired = ankle.clone().sub(hip).applyAxisAngle(UP, -yaw)
    const delta = new THREE.Quaternion().setFromUnitVectors(
      bent.normalize(),
      desired.normalize(),
    )
    const angle = delta.angleTo(new THREE.Quaternion())
    const limit = THREE.MathUtils.degToRad(25)
    if (angle > limit) delta.slerp(new THREE.Quaternion(), 1 - limit / angle)
    const heading = new THREE.Quaternion().setFromAxisAngle(UP, yaw)
    setWorld(
      leg.thigh,
      heading.clone().multiply(delta).multiply(leg.thigh.world),
    )
    const thighDelta = leg.thigh.rest
      .clone()
      .invert()
      .multiply(leg.thigh.object.quaternion)
    const thighAngle = thighDelta.angleTo(new THREE.Quaternion())
    if (thighAngle > limit) {
      thighDelta.slerp(new THREE.Quaternion(), 1 - limit / thighAngle)
      leg.thigh.object.quaternion.copy(leg.thigh.rest).multiply(thighDelta)
    }
    pitch(leg.shin, leg.knee)
    setWorld(leg.foot, orientation)
    const ankleDelta = leg.foot.rest
      .clone()
      .invert()
      .multiply(leg.foot.object.quaternion)
      .normalize()
    const ankleAngle = ankleDelta.angleTo(new THREE.Quaternion())
    const ankleLimit = THREE.MathUtils.degToRad(30)
    if (ankleAngle > ankleLimit) {
      ankleDelta.slerp(new THREE.Quaternion(), 1 - ankleLimit / ankleAngle)
      leg.foot.object.quaternion.copy(leg.foot.rest).multiply(ankleDelta)
    }
  }
  let yaw = 0
  let pelvisRoll = 0
  let support = 0
  let renderedSupport = 0
  let reduced = false
  let wait = 0
  let state: 'start' | 'walk' | 'close' | 'look' | 'still' = 'start'
  let stopRequested = false
  let armAngle = 0
  let step:
    | {
        roll0: number
        roll1: number
        time: number
        arm0: number
        arm1: number
        duration: number
        from: THREE.Vector3
        to: THREE.Vector3
        yaw0: number
        yaw1: number
        startFoot: THREE.Vector3
        endFoot: THREE.Vector3
        orientation0: THREE.Quaternion
        orientation1: THREE.Quaternion
      }
    | undefined
  let stepCount = 0
  let lastPhase = 0
  let totalDistance = 0
  const hipAt = (
    leg: (typeof legs)[number],
    pos: THREE.Vector3,
    angle: number,
    roll = pelvisRoll,
  ) =>
    leg.thigh.position
      .clone()
      .sub(pelvis.position)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), roll)
      .add(pelvis.position)
      .applyAxisAngle(UP, angle)
      .add(pos)
  const height = (
    pos: THREE.Vector3,
    angle: number,
    anchor = legs[support].anchor,
  ) => {
    const leg = legs[support]
    const hip = hipAt(leg, pos.clone().setY(0), angle)
    const length = leg.a.clone().add(leg.b).length()
    return (
      anchor.y +
      Math.sqrt(
        Math.max(
          0,
          length * length - (hip.x - anchor.x) ** 2 - (hip.z - anchor.z) ** 2,
        ),
      ) -
      hip.y
    )
  }
  const plant = () => {
    const planted = legs[support]
    const plantAnkle = planted.anchor.clone()
    for (let i = 0; i < 16; i++) {
      character.position.y = height(character.position, yaw, plantAnkle)
      poseLeg(planted, plantAnkle, 0, planted.orientation)
      character.updateMatrixWorld(true)
      const sole = sampleSole(planted)
      // 足首を補正すると最下点も変わるので、反復中も接地点を選び直す。
      if (sole.minIndex !== planted.contactIndex) {
        planted.contactIndex = sole.minIndex
        planted.contact.copy(planted.contactPoints[sole.minIndex])
      }
      const dx = planted.contact.x - sole.points[planted.contactIndex].x
      const dz = planted.contact.z - sole.points[planted.contactIndex].z
      plantAnkle.x += dx
      plantAnkle.z += dz
      plantAnkle.y += floor - sole.y
      if (Math.max(Math.abs(dx), Math.abs(dz), Math.abs(floor - sole.y)) < 1e-8)
        break
    }
    character.position.y = height(character.position, yaw, plantAnkle)
    poseLeg(planted, plantAnkle, 0, planted.orientation)
    character.updateMatrixWorld(true)
    const sole = sampleSole(planted)
    // 関節の上限で残る誤差は体の位置で吸収し、接地点を動かさない。
    character.position.add(
      new THREE.Vector3(
        planted.contact.x - sole.points[planted.contactIndex].x,
        floor - sole.y,
        planted.contact.z - sole.points[planted.contactIndex].z,
      ),
    )
  }
  const beginStep = (to: THREE.Vector3, yaw1: number, duration: number) => {
    const swing = legs[1 - support]
    const savedPosition = character.position.clone()
    const savedYaw = yaw
    const roll0 = pelvisRoll
    const savedContact = legs[support].contact.clone()
    const savedIndex = legs[support].contactIndex
    const saved = [
      pelvis,
      ...legs.flatMap((l) => [l.thigh, l.shin, l.foot]),
    ].map((p) => [p.object, p.object.quaternion.clone()] as const)
    yaw = yaw1
    character.rotation.y = yaw1
    const orientation1 = new THREE.Quaternion()
      .setFromAxisAngle(UP, yaw1)
      .multiply(swing.foot.world)
    const endFoot = new THREE.Vector3()
    let lo = -0.1,
      hi = 0.1
    let roll1 = 0
    // 左右の靴底の変形差を腰の傾きで合わせ、着地の前後位置を偏らせない。
    for (let i = 0; i < 16; i++) {
      roll1 = (lo + hi) / 2
      pelvisRoll = roll1
      character.position.copy(to)
      setWorld(
        pelvis,
        new THREE.Quaternion()
          .setFromAxisAngle(UP, yaw1)
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              roll1,
            ),
          )
          .multiply(pelvis.world),
      )
      plant()
      const hip = hipAt(swing, character.position, yaw1)
      const length = swing.a.clone().add(swing.b).length()
      const lateral = swing.foot.position.x - swing.thigh.position.x
      const forward = state === 'close' ? 0 : STEP_LENGTH / 2
      endFoot
        .set(
          lateral,
          -Math.sqrt(length * length - lateral * lateral - forward * forward),
          forward,
        )
        .applyAxisAngle(UP, yaw1)
        .add(hip)
      poseLeg(swing, endFoot, 0, orientation1)
      character.updateMatrixWorld(true)
      const error = sampleSole(swing).y - floor - 0.00005
      if (error * (support === 0 ? 1 : -1) > 0) lo = roll1
      else hi = roll1
    }
    to.y = character.position.y
    swing.foot.object.getWorldPosition(endFoot)
    pelvisRoll = roll0
    yaw = savedYaw
    character.rotation.y = yaw
    character.position.copy(savedPosition)
    for (const [object, q] of saved) object.quaternion.copy(q)
    legs[support].contact.copy(savedContact)
    legs[support].contactIndex = savedIndex
    step = {
      roll0,
      roll1,
      time: 0,
      arm0: armAngle,
      arm1:
        state === 'close'
          ? 0
          : THREE.MathUtils.degToRad(24) * (support === 0 ? -1 : 1),
      duration,
      from: character.position.clone(),
      to,
      yaw0: yaw,
      yaw1,
      startFoot: swing.anchor.clone(),
      endFoot,
      orientation0: swing.orientation.clone(),
      orientation1,
    }
  }
  const next = () => {
    if (state === 'close') {
      state = 'look'
      wait = 1.5
      return
    }
    if (stopRequested) {
      state = 'close'
      stopRequested = false
    }
    // 立ち姿の足首は股関節より約42 mm前にあるため、最初の半歩に含める。
    const lead =
      legs[support].anchor.z - hipAt(legs[support], character.position, yaw).z
    const distance =
      state === 'walk'
        ? STEP_LENGTH
        : state === 'start'
          ? STEP_LENGTH / 2 + lead
          : STEP_LENGTH / 2
    beginStep(
      character.position.clone().add(new THREE.Vector3(0, 0, distance)),
      0,
      state === 'start'
        ? (2 * distance) / (STEP_LENGTH / STEP_TIME)
        : STEP_TIME,
    )
  }
  const look = () => {
    if (reduced) {
      wait = 1.5
      state = 'look'
    } else if (state === 'look' || state === 'close') wait = 1.5
    else stopRequested = true
  }
  const tick = (dt: number) => {
    if (reduced) {
      if (state === 'look' && (wait -= dt) <= 0) state = 'still'
      return
    }
    if (state === 'look') {
      if ((wait -= dt) > 0) return
      state = 'start'
    }
    if (!step) next()
    if (!step) return
    step.time = Math.min(step.duration, step.time + dt)
    const u = step.time / step.duration
    if (inspect) lastPhase = u
    const moving = legs[1 - support]
    const planted = legs[support]
    // 半歩の加減速だけを二次曲線にし、通常の歩の境目は同じ速度でつなぐ。
    const progress =
      state === 'start' ? u * u : state === 'close' ? 2 * u - u * u : u
    character.position.lerpVectors(step.from, step.to, progress)
    yaw = THREE.MathUtils.lerp(step.yaw0, step.yaw1, progress)
    character.rotation.y = yaw
    // この骨格は膝40°だけでは約6mmしか縮まないため、遊脚側の腰も上げる。
    pelvisRoll =
      THREE.MathUtils.lerp(step.roll0, step.roll1, progress) +
      THREE.MathUtils.degToRad(9.5) *
        Math.sin(Math.PI * u) ** 2 *
        (support === 0 ? -1 : 1)
    setWorld(
      pelvis,
      new THREE.Quaternion()
        .setFromAxisAngle(UP, yaw)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            pelvisRoll,
          ),
        )
        .multiply(pelvis.world),
    )
    if (inspect) renderedSupport = support
    plant()
    const hip = hipAt(moving, character.position, yaw)
    const knee = THREE.MathUtils.degToRad(40) * Math.sin(Math.PI * u) ** 2
    const bent = moving.a.clone().add(moving.b.clone().applyAxisAngle(X, knee))
    const length = bent.length()
    const angleAt = (
      ankle: THREE.Vector3,
      position: THREE.Vector3,
      heading: number,
      roll: number,
    ) => {
      const relative = ankle
        .clone()
        .sub(hipAt(moving, position, heading, roll))
        .applyAxisAngle(UP, -heading)
      return (
        Math.atan2(moving.a.z + moving.b.z, -moving.a.y - moving.b.y) -
        Math.atan2(relative.z, -relative.y)
      )
    }
    const startAngle = angleAt(step.startFoot, step.from, step.yaw0, step.roll0)
    const endAngle = angleAt(step.endFoot, step.to, step.yaw1, step.roll1)
    const peak = THREE.MathUtils.degToRad(-23)
    const thighAngle =
      u < 0.5
        ? THREE.MathUtils.lerp(startAngle, peak, smooth(u * 2))
        : THREE.MathUtils.lerp(peak, endAngle, smooth(u * 2 - 1))
    const ankle =
      state !== 'close'
        ? hip
            .clone()
            .add(
              bent
                .clone()
                .applyAxisAngle(X, thighAngle)
                .applyAxisAngle(UP, yaw),
            )
        : step.startFoot.clone().lerp(step.endFoot, progress)
    const flat = ankle.clone().sub(hip).setY(0)
    const flatDirection =
      flat.lengthSq() > 1e-12
        ? flat.clone().normalize()
        : new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw)
    if (state === 'close') {
      const vertical =
        hip.y -
        (floor - moving.offset) -
        0.00005 -
        0.001 * Math.sin(Math.PI * u) ** 2
      const minimum = Math.sqrt(
        Math.max(0, length * length - vertical * vertical),
      )
      if (flat.length() < minimum)
        flat.copy(flatDirection).multiplyScalar(minimum)
      ankle.copy(hip).add(flat)
      ankle.y =
        hip.y - Math.sqrt(Math.max(0, length * length - flat.lengthSq()))
    }
    const orientation = step.orientation0
      .clone()
      .slerp(step.orientation1, progress)
    poseLeg(moving, ankle, knee, orientation)
    // 運ぶ足はもぐったときだけ床へ上げる。歩の終わりに床へ引き下ろすと太ももと足首が跳ねる
    const landingFloor = floor + 0.00005
    for (let i = 0; i < 64; i++) {
      character.updateMatrixWorld(true)
      const sole = sampleSole(moving)
      if (sole.y >= landingFloor - 1e-8) break
      const desiredY = ankle.y + landingFloor - sole.y
      const dy = hip.y - desiredY
      const local = flat.clone().applyAxisAngle(UP, -yaw)
      const forward =
        Math.sign(local.z || 1) *
        Math.sqrt(Math.max(0, length * length - dy * dy - local.x * local.x))
      flat.set(local.x, 0, forward).applyAxisAngle(UP, yaw)
      ankle.copy(hip).add(flat)
      ankle.y =
        hip.y - Math.sqrt(Math.max(0, length * length - flat.lengthSq()))
      poseLeg(moving, ankle, knee, orientation)
    }
    armAngle = THREE.MathUtils.lerp(step.arm0, step.arm1, smooth(progress))
    pitch(arms[0], armAngle)
    pitch(arms[1], -armAngle)
    lower.object.quaternion
      .copy(lower.rest)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1).applyQuaternion(
            lower.world.clone().invert(),
          ),
          -pelvisRoll +
            THREE.MathUtils.degToRad(1.5) * Math.sin(Math.PI * (stepCount + u)),
        ),
      )
    character.updateMatrixWorld(true)
    const contacts = sampleSole(planted)
    if (inspect) {
      for (const [i, p] of contacts.points.entries()) {
        if (p.y > floor + 0.0001) {
          planted.contactOrigins.delete(i)
          continue
        }
        const origin = planted.contactOrigins.get(i)
        if (origin)
          planted.patchSlip = Math.max(
            planted.patchSlip,
            Math.hypot(p.x - origin.x, p.z - origin.z) * 1000,
          )
        else planted.contactOrigins.set(i, p.clone())
      }
      const contactPoint = contacts.points[planted.contactIndex]
      planted.maxSlip = Math.max(
        planted.maxSlip,
        Math.hypot(
          contactPoint.x - planted.contact.x,
          contactPoint.z - planted.contact.z,
        ) * 1000,
      )
    }
    planted.contactPoints = contacts.points
    if (u >= 1) {
      moving.anchor.copy(
        moving.foot.object.getWorldPosition(new THREE.Vector3()),
      )
      moving.orientation.copy(
        moving.foot.object.getWorldQuaternion(new THREE.Quaternion()),
      )
      rememberContact(moving)
      support = 1 - support
      stepCount++
      step = undefined
      const closing = state === 'close'
      if (state === 'start') state = 'walk'
      next()
      if (closing) {
        armAngle = 0
        arms.forEach((arm) => pitch(arm, 0))
        lower.object.quaternion.copy(lower.rest)
      }
    }
  }
  const update = (dt: number) => {
    // 境界をまたぐフレームの余りも次の歩へ渡す。
    let remaining = dt
    while (remaining > 1e-8) {
      const portion = Math.min(
        remaining,
        step ? step.duration - step.time : 1 / 60,
        1 / 60,
      )
      const before = inspect ? character.position.z : 0
      tick(portion)
      if (inspect) totalDistance += character.position.z - before
      remaining -= portion
    }
  }
  const stand = () => {
    step = undefined
    stopRequested = false
    pelvisRoll = 0
    character.position.y =
      floor - Math.min(...legs.map((l) => l.foot.position.y + l.offset))
    for (const part of [
      pelvis,
      lower,
      ...arms,
      ...legs.flatMap((l) => [l.thigh, l.shin, l.foot]),
    ])
      part.object.quaternion.copy(part.rest)
    character.updateMatrixWorld(true)
    for (const leg of legs) {
      leg.anchor.copy(leg.foot.object.getWorldPosition(new THREE.Vector3()))
      leg.orientation.copy(leg.foot.world)
      rememberContact(leg)
    }
  }
  return {
    look,
    update,
    rebase(z: number) {
      const shift = new THREE.Vector3(0, 0, z)
      character.position.sub(shift)
      for (const leg of legs) {
        leg.anchor.sub(shift)
        leg.contact.sub(shift)
        leg.contactPoints.forEach((p) => p.sub(shift))
        leg.contactOrigins.forEach((p) => p.sub(shift))
      }
      if (step)
        for (const p of [step.from, step.to, step.startFoot, step.endFoot])
          p.sub(shift)
    },
    setReduced(value: boolean) {
      if (reduced === value) return
      reduced = value
      stand()
      state = value ? 'still' : 'start'
    },
    get active() {
      return state === 'start' || state === 'walk' || state === 'close'
    },
    get state() {
      return state
    },
    get yaw() {
      return yaw
    },
    get distance() {
      return totalDistance
    },
    inspect() {
      character.updateMatrixWorld(true)
      return {
        geometry: legs.map((l) => ({
          a: l.a.toArray(),
          b: l.b.toArray(),
          hip: l.thigh.object.getWorldPosition(new THREE.Vector3()).toArray(),
        })),
        state,
        support: renderedSupport,
        phase: lastPhase,
        stepCount,
        yaw,
        position: character.position.toArray(),
        arms: arms.map((arm) =>
          THREE.MathUtils.radToDeg(arm.rest.angleTo(arm.object.quaternion)),
        ),
        pelvisRoll: THREE.MathUtils.radToDeg(pelvisRoll),
        step: step
          ? {
              duration: step.duration,
              distance: step.to.z - step.from.z,
              roll0: THREE.MathUtils.radToDeg(step.roll0),
              roll1: THREE.MathUtils.radToDeg(step.roll1),
            }
          : null,
        knees: legs.map((l) => {
          const q = l.shin.rest
            .clone()
            .invert()
            .multiply(l.shin.object.quaternion)
          const axis = X.clone().applyQuaternion(l.shin.world.clone().invert())
          return THREE.MathUtils.radToDeg(
            wrap(
              2 * Math.atan2(new THREE.Vector3(q.x, q.y, q.z).dot(axis), q.w),
            ),
          )
        }),
        feet: legs.map((l) => {
          const s = sampleSole(l)
          return {
            center: s.center.toArray(),
            slip: l.maxSlip,
            nearContactDeformation: l.patchSlip,
            contactVertex: l.contactIndex,
            contact: s.points[l.contactIndex].toArray(),
            soleVertices: l.sole.length,
            height: (s.y - floor) * 1000,
            ankle: l.foot.object
              .getWorldPosition(new THREE.Vector3())
              .toArray(),
            anchor: l.anchor.toArray(),
            thighPitch: (() => {
              const q = l.thigh.rest
                .clone()
                .invert()
                .multiply(l.thigh.object.quaternion)
              const axis = X.clone().applyQuaternion(
                l.thigh.world.clone().invert(),
              )
              return THREE.MathUtils.radToDeg(
                wrap(
                  2 *
                    Math.atan2(new THREE.Vector3(q.x, q.y, q.z).dot(axis), q.w),
                ),
              )
            })(),
            thigh: THREE.MathUtils.radToDeg(
              2 *
                Math.acos(
                  Math.min(
                    1,
                    Math.abs(
                      l.thigh.rest
                        .clone()
                        .invert()
                        .multiply(l.thigh.object.quaternion)
                        .normalize().w,
                    ),
                  ),
                ),
            ),
            anklePitch: (() => {
              const q = l.foot.rest
                .clone()
                .invert()
                .multiply(l.foot.object.quaternion)
              const axis = X.clone().applyQuaternion(
                l.foot.world.clone().invert(),
              )
              return THREE.MathUtils.radToDeg(
                wrap(
                  2 *
                    Math.atan2(new THREE.Vector3(q.x, q.y, q.z).dot(axis), q.w),
                ),
              )
            })(),
            ankleAngle: THREE.MathUtils.radToDeg(
              l.foot.rest.angleTo(l.foot.object.quaternion),
            ),
          }
        }),
      }
    },
  }
}
