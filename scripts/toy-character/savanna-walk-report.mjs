import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk'
const capture = JSON.parse(await fs.readFile(`${out}/capture-report.json`))
const performance = JSON.parse(await fs.readFile(`${out}/performance.json`))
const assets = JSON.parse(await fs.readFile(`${out}/assets.json`))
const summaries = {}
for (const name of ['desktop', 'mobile']) {
  const r = capture[name],
    m = r.metrics
  const visible = r.timeline.map((t) => t.view.visibleObjects)
  const collisions = r.timeline
    .filter((t) =>
      t.view.animalBounds.some(
        (a) =>
          a.minX < t.framing.maxX &&
          a.maxX > t.framing.minX &&
          a.minY < t.framing.maxY &&
          a.maxY > t.framing.minY,
      ),
    )
    .map((t) => t.elapsed)
  const boundarySpeed = m.boundaries.map((b) => b.speed).filter((v) => v > 0.23)
  const boundaryDeltas = m.boundaries.map((b) => b.delta)
  const stats = (a) => {
    const s = a.toSorted((a, b) => a - b)
    return { min: s[0], median: s[Math.floor(s.length / 2)], max: s.at(-1) }
  }
  summaries[name] = {
    seconds: r.seconds,
    frames: m.frames,
    knees: [m.kneeMin, m.kneeMax],
    supportKneeMax: m.supportKneeMax,
    thighMax: m.thighMax,
    armMax: m.armMax,
    soleAnchorSlipMaxMm: m.slipMaxMm,
    nearContactDeformationMaxMm: m.patchSlipMaxMm,
    exchanges: m.scenery.exchanges,
    consecutiveRepeats: m.scenery.repeats,
    rebases: m.scenery.rebases,
    animalAppearances: m.scenery.appearances,
    heapMiB: [r.heapStartBytes / 1048576, r.heapEndBytes / 1048576],
    cameraFrameDeltaM: r.cameraDisplacementM,
    cameraMaxToMedian: r.cameraMaxToMedian,
    cameraSpeed: r.cameraSpeedMps,
    boundarySpeed: stats(boundarySpeed),
    boundaryDeltas: stats(boundaryDeltas),
    visibleObjects: stats(visible),
    faceOcclusionSamples: r.timeline.filter((t) => t.view.faceOcclusions > 0)
      .length,
    animalOverlapSeconds: collisions,
    framing: {
      minX: Math.min(...r.timeline.map((t) => t.framing.minX)),
      maxX: Math.max(...r.timeline.map((t) => t.framing.maxX)),
      minY: Math.min(...r.timeline.map((t) => t.framing.minY)),
      maxY: Math.max(...r.timeline.map((t) => t.framing.maxY)),
    },
    animals: m.scenery.animals,
  }
}
await fs.writeFile(
  `${out}/summary.json`,
  JSON.stringify(
    {
      summaries,
      performance: performance.report.map(
        ({ snapshot, rawFrameTimesMs, ...row }) => row,
      ),
      assetBytes: assets.bytes,
      assetMiB: assets.bytes / 1048576,
      errors: capture.errors,
    },
    null,
    2,
  ),
)
console.log(JSON.stringify(summaries, null, 2))
