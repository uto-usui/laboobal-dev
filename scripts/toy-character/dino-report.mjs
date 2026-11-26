import fs from 'node:fs/promises'
const out = '.work/toy-character/dino'
const stats = (a) => {
  const s = a.toSorted((a, b) => a - b)
  return {
    min: s[0],
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  }
}
const rows = []
for (const [name, angle] of [
  ['desktop', 30],
  ['desktop', 50],
  ['mobile', 30],
  ['mobile', 50],
]) {
  const data = JSON.parse(
      await fs.readFile(`${out}/${name}-${angle}-metrics.json`),
    ),
    m = data.metrics,
    s = m.scenery
  let absent = 0,
    maxAbsent = 0
  for (const r of data.timeline) {
    if (
      r.view.animalBounds.some((a) => a.minX < 1 && a.maxX > -1 && a.depth < 73)
    )
      absent = 0
    else absent += 1
    maxAbsent = Math.max(maxAbsent, absent)
  }
  const events = s.visibleAppearanceLog
  const gaps = events.slice(1).map((e, i) => e.time - events[i].time)
  rows.push({
    id: data.id,
    seconds: data.seconds,
    frames: m.frames,
    knee: [m.kneeMin, m.kneeMax],
    thighForward: m.thighForwardMax,
    thighBackward: m.thighBackwardMax,
    supportSlipMm: m.slipMaxMm,
    patchDeformationMm: m.patchSlipMaxMm,
    liftMm: [m.midSwingMinMm, m.midSwingMaxMm],
    exchanges: s.exchanges,
    rebases: s.rebases,
    repeats: s.repeats,
    spawned: s.appearances,
    visibleAppearances: events.length,
    visibleTypes: [...new Set(events.map((e) => e.species))],
    maxAppearanceGapSeconds: Math.max(...gaps),
    maxAbsentSampledSeconds: maxAbsent,
    dinosaurSlipMm: Math.max(...s.animals.map((a) => a.allContactSlip)),
    trees: stats(m.treeCounts),
    objects: stats(m.objectCounts),
    overlapFrames:
      s.overlapFrames - data.timeline[0].snapshot.scenery.overlapFrames,
    overlapBeforeRecording: data.timeline[0].snapshot.scenery.overlapFrames,
    heapStartBytes: data.heapStart,
    heapEndBytes: data.heapEnd,
    heapAfterGcBytes: data.heapAfterGc,
    errors: data.errors,
    renderer: data.renderer,
  })
}
await fs.writeFile(`${out}/summary.json`, JSON.stringify(rows, null, 2))
console.log(JSON.stringify(rows, null, 2))
