import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '.work/toy-character/savanna-walk2'
const read = async (name) =>
  JSON.parse(await fs.readFile(`${out}/${name}.json`, 'utf8'))
const run = await read('longrun'),
  assets = await read('assets'),
  videos = await read('capture-report'),
  performance = await read('performance'),
  animals = await read('animal-visibility')
const m = run.metrics,
  s = run.snapshot.scenery
assert(run.durationSeconds >= 180)
assert(m.kneeMin >= 0 && m.kneeMax <= 40.001 && m.supportKneeMax <= 5)
assert(m.thighMax <= 25.001 && m.armMax <= 25.001)
assert(m.slipMaxMm < 0.1 && m.soleHeightMinMm > -0.001)
assert(m.soleHeightMaxMm >= 25 && m.soleHeightMaxMm <= 40)
assert(m.midSwingMinMm >= 25 && m.midSwingMaxMm <= 40)
assert(
  Math.abs(run.speed.min - 0.14 / 0.34) < 1e-5 &&
    Math.abs(run.speed.max - 0.14 / 0.34) < 1e-5,
)
assert(s.repeats === 0 && s.exchanges > 0 && s.rebases > 0 && s.appearances > 0)
assert(s.overlapFrames === 0 && s.animalOcclusionFrames === 0)
assert(run.errors.length === 0 && videos.errors.length === 0)
assert(assets.totalBytes <= assets.limitBytes)
assert(
  animals.every(
    (a) => a.whole.every((n) => n > 30) && a.s.scenery.overlapFrames === 0,
  ),
)
for (const name of ['desktop', 'mobile']) {
  const v = videos[name]
  assert(v.seconds >= 60)
  assert(v.timeline.some((t) => t.snapshot.state === 'look'))
  assert(v.timeline.at(-1).snapshot.state === 'walk')
  assert(v.metrics.crowdedFrames === 0 && v.metrics.scenery.overlapFrames === 0)
}
const summary = {
  durationSeconds: run.durationSeconds,
  frames: m.frames,
  stepLengthM: run.snapshot.step.distance,
  stepTimeSeconds: run.snapshot.step.duration,
  soleMaxMm: m.soleHeightMaxMm,
  midSwingMm: [m.midSwingMinMm, m.midSwingMaxMm],
  speedMps: run.speed,
  kneeDegrees: [m.kneeMin, m.kneeMax],
  supportKneeMax: m.supportKneeMax,
  thighForwardMax: m.thighForwardMax,
  thighBackwardMax: m.thighBackwardMax,
  thighRotationMax: m.thighMax,
  slipMaxMm: m.slipMaxMm,
  nearContactDeformationMaxMm: m.patchSlipMaxMm,
  segmentExchanges: s.exchanges,
  repeatedLayouts: s.repeats,
  rebases: s.rebases,
  animalAppearances: s.appearances,
  headAndBodyOverlapFrames: s.overlapFrames,
  animalOcclusionFrames: s.animalOcclusionFrames,
  visibleObjects: [m.visibleObjectsMin, m.visibleObjectsMax],
  sparseFrames: m.sparseFrames,
  crowdedFrames: m.crowdedFrames,
  heapMiB: [run.heapStartBytes, run.heapEndBytes, run.heapAfterGcBytes].map(
    (n) => n / 1048576,
  ),
  camera: run.camera,
  cameraMaxToMedian: run.cameraMaxToMedian,
  seamSpeed: run.seamSpeed,
  performance: performance.report.map(
    ({ name, medianMs, p95Ms, samples, gpu, buffer }) => ({
      name,
      medianMs,
      p95Ms,
      samples,
      gpu,
      buffer,
    }),
  ),
  glbBytes: assets.totalBytes,
}
await fs.writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2))
console.log(summary)
