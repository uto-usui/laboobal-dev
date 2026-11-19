import { type Gpu, storageBuffer } from '../../shared/gpu/device'
import { createUniform } from '../../shared/gpu/uniform'
import { BoughPhysics, FIELDS, type Input } from './physics'
import { type Scene, STEP } from './scene'

export const makeSimulation = async (gpu: Gpu, scene: Scene) => {
  const { device } = gpu
  let model = new BoughPhysics(scene)
  let interpolation = 1
  const raw = createUniform(device, 'Bough', FIELDS)
  const uniform = {
    ...raw,
    set(values: Parameters<typeof raw.set>[0]) {
      raw.set(values)
      if (typeof values.interpolation === 'number')
        interpolation = values.interpolation
      Object.assign(model.input, values as Partial<Input>)
    },
  }
  uniform.set({
    dt: STEP,
    nodeCount: scene.count,
    branchCount: scene.branchCount,
    snowCount: scene.snows.length,
    gripOn: 0,
    gripEdge: 0,
    gripT: 0,
    settling: 1,
    renew: 1,
    adhesion: 1,
    brightness: 1,
    interpolation: 1,
  })
  const points = storageBuffer(
    device,
    model.nodes.byteLength,
    'bough points',
    model.nodes,
  )
  const snows = storageBuffer(
    device,
    model.snow.byteLength,
    'bough snow poses',
    model.snow,
  )
  const upload = () => {
    device.queue.writeBuffer(points, 0, model.nodes)
    device.queue.writeBuffer(snows, 0, model.snow)
  }
  return {
    get snapshot() {
      return { nodes: model.nodes, snow: model.snow, interpolation }
    },
    async readSnapshot(value = 1) {
      interpolation = value
    },
    uniform,
    points,
    snows,
    encode(_encoder: GPUCommandEncoder, steps: number) {
      for (let i = 0; i < steps; i++) model.step()
      upload()
    },
    reset() {
      const input = model.input
      model = new BoughPhysics(scene)
      model.input = input
      upload()
    },
    destroy() {
      for (const buffer of [uniform.buffer, points, snows]) buffer.destroy()
    },
  }
}
export type Simulation = Awaited<ReturnType<typeof makeSimulation>>
