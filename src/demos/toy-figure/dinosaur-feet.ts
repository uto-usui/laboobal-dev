import * as THREE from 'three'

type SoleVertices = Record<string, { mesh: string; i: number }[]>

export function dinosaurFeet(
  root: THREE.Group,
  model: THREE.Object3D,
  height: number,
) {
  const meshes: THREE.SkinnedMesh[] = []
  const footBones: THREE.Bone[] = []
  model.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) meshes.push(o)
    if (o instanceof THREE.Bone && /Foot/.test(o.name)) footBones.push(o)
  })
  const baked = model.userData.quadrupedWalk?.sole as SoleVertices | undefined
  const feet = footBones
    .filter((b) =>
      baked
        ? b.name in baked
        : b.getWorldPosition(new THREE.Vector3()).y < height * 0.25,
    )
    .map((bone) => {
      if (baked) {
        return {
          bone,
          sole: baked[bone.name].map(({ mesh, i }) => ({
            mesh: meshes.find((candidate) => candidate.name === mesh)!,
            i,
          })),
        }
      }
      const vertices: { mesh: THREE.SkinnedMesh; i: number }[] = []
      let low = Infinity
      for (const mesh of meshes) {
        const index = mesh.skeleton.bones.indexOf(bone)
        const weights = mesh.geometry.getAttribute('skinWeight')
        const joints = mesh.geometry.getAttribute('skinIndex')
        for (let i = 0; i < weights.count; i++) {
          let w = 0
          for (let k = 0; k < 4; k++)
            if (joints.getComponent(i, k) === index)
              w += weights.getComponent(i, k)
          if (w < 0.6) continue
          const p = mesh
            .getVertexPosition(i, new THREE.Vector3())
            .applyMatrix4(mesh.matrixWorld)
          low = Math.min(low, p.y)
          vertices.push({ mesh, i })
        }
      }
      const sole = vertices.filter(
        ({ mesh, i }) =>
          mesh
            .getVertexPosition(i, new THREE.Vector3())
            .applyMatrix4(mesh.matrixWorld).y <
          low + height * 0.012,
      )
      return {
        bone,
        sole,
      }
    })
  const centers = feet.map(({ sole }) => {
    const points = new Map<THREE.Bone, THREE.Vector4>()
    const point = new THREE.Vector4()
    for (const { mesh, i } of sole) {
      if (
        mesh.bindMode !== THREE.AttachedBindMode ||
        mesh.geometry.morphAttributes.position?.length
      )
        return undefined
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(i, k) / sole.length
        if (!weight) continue
        const index = skinIndex.getComponent(i, k)
        const bone = mesh.skeleton.bones[index]
        let center = points.get(bone)
        if (!center) {
          center = new THREE.Vector4(0, 0, 0, 0)
          points.set(bone, center)
        }
        // スキニングは線形なので、骨ごとに足裏の重み付き平均を先に求められる。
        point
          .set(position.getX(i), position.getY(i), position.getZ(i), 1)
          .applyMatrix4(mesh.bindMatrix)
          .applyMatrix4(mesh.skeleton.boneInverses[index])
        center.addScaledVector(point, weight)
      }
    }
    return points
  })
  const point = new THREE.Vector4()
  const vertex = new THREE.Vector3()
  function sampleWorld(i: number, target: THREE.Vector3) {
    const { sole, bone } = feet[i]
    if (!sole.length) return bone.getWorldPosition(target)
    target.set(0, 0, 0)
    const center = centers[i]
    if (!center) {
      root.updateMatrixWorld(true)
      for (const { mesh, i } of sole)
        target.add(
          mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld),
        )
      return target.divideScalar(sole.length)
    }
    for (const [joint, position] of center) {
      joint.updateWorldMatrix(true, false)
      point.copy(position).applyMatrix4(joint.matrixWorld)
      target.x += point.x
      target.y += point.y
      target.z += point.z
    }
    return target
  }
  function sample() {
    root.updateWorldMatrix(true, false)
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
    return feet.map((_, i) =>
      sampleWorld(i, new THREE.Vector3()).applyMatrix4(inverse),
    )
  }
  return { feet, sample, sampleWorld }
}
