import * as THREE from 'three'

export function skinnedPositions(mesh: THREE.SkinnedMesh) {
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes
  if (mesh.geometry.morphAttributes.position?.length) {
    return {
      update() {},
      world: (index: number, target: THREE.Vector3) =>
        mesh.getVertexPosition(index, target).applyMatrix4(mesh.matrixWorld),
    }
  }

  const bind = new Float64Array(position.count * 3)
  const joints = new Uint16Array(position.count * 4)
  const weights = new Float64Array(joints.length)
  const p = new THREE.Vector4()
  for (let i = 0; i < position.count; i++) {
    p.set(position.getX(i), position.getY(i), position.getZ(i), 1).applyMatrix4(
      mesh.bindMatrix,
    )
    bind.set([p.x, p.y, p.z], i * 3)
    for (let k = 0; k < 4; k++) {
      joints[i * 4 + k] = skinIndex.getComponent(i, k)
      weights[i * 4 + k] = skinWeight.getComponent(i, k)
    }
  }

  // 同じ姿勢で頂点を調べる間、骨の行列を頂点ごとに掛け直さない。
  const matrices = mesh.skeleton.bones.map(() => new THREE.Matrix4())
  return {
    update() {
      for (let i = 0; i < matrices.length; i++)
        matrices[i].multiplyMatrices(
          mesh.skeleton.bones[i].matrixWorld,
          mesh.skeleton.boneInverses[i],
        )
    },
    world(index: number, target: THREE.Vector3) {
      const x = bind[index * 3]
      const y = bind[index * 3 + 1]
      const z = bind[index * 3 + 2]
      target.set(0, 0, 0)
      for (let i = index * 4; i < index * 4 + 4; i++) {
        const weight = weights[i]
        if (!weight) continue
        const e = matrices[joints[i]].elements
        target.x += (e[0] * x + e[4] * y + e[8] * z + e[12]) * weight
        target.y += (e[1] * x + e[5] * y + e[9] * z + e[13]) * weight
        target.z += (e[2] * x + e[6] * y + e[10] * z + e[14]) * weight
      }
      return target
        .applyMatrix4(mesh.bindMatrixInverse)
        .applyMatrix4(mesh.matrixWorld)
    },
  }
}
