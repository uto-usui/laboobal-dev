import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const out = '.work/toy-character/walk2'
const base = process.env.WALK_BASE_URL ?? 'http://localhost:4410'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
const videoOrigins = new WeakMap()
const devices = [
  ['desktop', { width: 1440, height: 900 }, 2, false],
  ['mobile', { width: 390, height: 844 }, 3, true],
]
const open = async (viewport, deviceScaleFactor = 1, mobile = false, video) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    ...(video ? { recordVideo: { dir: `${out}/raw`, size: viewport } } : {}),
  })
  const videoOrigin = Date.now()
  const page = await context.newPage()
  videoOrigins.set(page, videoOrigin)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/toy-figure/?walk-inspect`)
  await page.waitForFunction(
    () =>
      window.__toyWalk &&
      document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
  )
  return page
}
const pause = (page) =>
  page.evaluate(() => {
    window.__toyWalk.controls.paused = true
  })
const advance = (page, seconds) =>
  page.evaluate((seconds) => {
    const count = Math.ceil(seconds * 120)
    for (let i = 0; i < count; i++) window.__toyWalk.advance(seconds / count)
  }, seconds)
const go = (page, x, z) =>
  page.evaluate(([x, z]) => window.__toyWalk.go(x, z), [x, z])
const click = async (page, x, z, mobile) => {
  const point = await page.evaluate(
    ([x, z]) => window.__toyWalk.project(x, z),
    [x, z],
  )
  const v = page.viewportSize()
  assert(
    point.x > 0 && point.x < v.width && point.y > 0 && point.y < v.height,
    `Floor target outside viewport: ${JSON.stringify(point)}`,
  )
  if (mobile) await page.touchscreen.tap(point.x, point.y)
  else await page.mouse.click(point.x, point.y)
}
const settle = (page) =>
  page.evaluate(() => {
    const frames = []
    for (let i = 0; i < 2400; i++) {
      window.__toyWalk.advance(1 / 120)
      frames.push({
        ...window.__toyWalk.snapshot(),
        frame: i % 8 === 0 ? window.__toyWalk.framing() : frames.at(-1).frame,
      })
      if (frames.at(-1).state === 'idle') return frames
    }
    throw new Error('Walk did not finish')
  })
const cycle = await open({ width: 400, height: 550 })
await pause(cycle)
await go(cycle, 0, 0.55)
await advance(cycle, 0.34)
for (let i = 0; i < 8; i++) {
  for (const [view, angle] of [
    ['side', Math.PI / 2],
    ['front', 0],
  ]) {
    await cycle.evaluate((angle) => {
      window.__toyWalk.controls.view = angle
      window.__toyWalk.advance(0)
    }, angle)
    await cycle.screenshot({ path: `${out}/cycle-${view}-${i}.png` })
  }
  await advance(cycle, 0.085)
}
const floorY = await cycle.evaluate(() => window.__toyWalk.floorY)
await cycle.context().close()
const samples = []
const framing = []
const sizing = []
for (const [device, viewport, dpr, mobile] of devices) {
  const page = await open(viewport, dpr, mobile)
  await pause(page)
  await advance(page, 0)
  const initial = await page.evaluate(() => ({
    frame: window.__toyWalk.framing(),
    range: window.__toyWalk.snapshot().range,
  }))
  sizing.push({ device, viewport, dpr, ...initial })
  await page.screenshot({ path: `${out}/after-${device}.png` })
  const camera = await page.evaluate(() => window.__toyWalk.camera())
  const { x: rx, z: rz } = initial.range
  for (const [direction, x, z] of [
    ['near', 0, rz],
    ['far', 0, -rz],
    ['west', -rx, 0],
    ['east', rx, 0],
  ]) {
    await click(page, x, z, mobile)
    const frames = await settle(page)
    samples.push(...frames.map((s) => ({ device, direction, ...s })))
    framing.push({ device, direction, ...frames.at(-1) })
    assert.deepEqual(
      await page.evaluate(() => window.__toyWalk.camera()),
      camera,
    )
    await page.screenshot({ path: `${out}/${device}-${direction}.png` })
  }
  // 円周と斜めの経路も毎フレーム調べ、停止時だけの確認にしない。
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8
    await go(page, Math.sin(angle) * rx, Math.cos(angle) * rz)
    samples.push(
      ...(await settle(page)).map((s) => ({
        device,
        direction: `edge-${i}`,
        ...s,
      })),
    )
  }
  await page.context().close()
}
const knee = {
  unit: 'degrees',
  method:
    'Every rendered simulation frame (120 Hz), shin quaternion relative to rest; rest-world +X is backward flexion.',
  frames: samples.length,
  legs: ['left', 'right'].map((side, i) => ({
    side,
    min: Math.min(...samples.map((s) => s.knees[i])),
    max: Math.max(...samples.map((s) => s.knees[i])),
  })),
}
const foot = {
  unit: 'mm',
  angleUnit: 'degrees',
  tolerance: 0.1,
  method:
    'Same skinned sole vertices and rolling contact definition as walk/foot.json. Sample every 120 Hz frame during translation, turning and stopping. Swing maximum is the lowest sole vertex on the non-support foot.',
  frames: samples.length,
  maxContactSlip: Math.max(...samples.map((s) => s.feet[s.support].slip)),
  maxAnchoredPointHeight: Math.max(
    ...samples.map((s) => (s.feet[s.support].contact[1] - floorY) * 1000),
  ),
  maxHeightError: Math.max(
    ...samples.map((s) => Math.abs(s.feet[s.support].height)),
  ),
  minSwingHeight: Math.min(
    ...samples.flatMap((s) => s.feet.map((f) => f.height)),
  ),
  maxSwingHeight: Math.max(...samples.map((s) => s.feet[1 - s.support].height)),
  midSwingHeight: ['desktop', 'mobile'].map((device) => {
    const frames = samples.filter(
      (s) =>
        s.device === device &&
        s.state === 'walk' &&
        s.phase > 0.45 &&
        s.phase < 0.55 &&
        s.step?.distance > 0.13,
    )
    return {
      device,
      min: Math.min(...frames.map((s) => s.feet[1 - s.support].height)),
      max: Math.max(...frames.map((s) => s.feet[1 - s.support].height)),
    }
  }),
  maxNearContactDeformation: Math.max(
    ...samples.map((s) => s.feet[s.support].nearContactDeformation),
  ),
  thighMax: Math.max(...samples.flatMap((s) => s.feet.map((f) => f.thigh))),
  anklePitchMin: Math.min(
    ...samples.flatMap((s) => s.feet.map((f) => f.anklePitch)),
  ),
  anklePitchMax: Math.max(
    ...samples.flatMap((s) => s.feet.map((f) => f.anklePitch)),
  ),
  ankleMax: Math.max(
    ...samples.flatMap((s) => s.feet.map((f) => f.ankleAngle)),
  ),
  armMax: Math.max(...samples.flatMap((s) => s.arms)),
}
const frameSummary = devices.map(([device]) => {
  const frames = samples.filter((s) => s.device === device)
  return {
    device,
    minX: Math.min(...frames.map((s) => s.frame.minX)),
    maxX: Math.max(...frames.map((s) => s.frame.maxX)),
    minY: Math.min(...frames.map((s) => s.frame.minY)),
    maxY: Math.max(...frames.map((s) => s.frame.maxY)),
  }
})
for (const [name, value] of Object.entries({
  knee,
  foot,
  frames: samples,
  framing,
  sizing,
  'framing-summary': frameSummary,
}))
  await fs.writeFile(
    `${out}/${name}.json`,
    JSON.stringify(value, null, name === 'frames' ? 0 : 2),
  )
console.log({ knee, foot, frameSummary, sizing })
const videos = []
for (const [device, viewport, dpr, mobile] of devices) {
  const page = await open(viewport, dpr, mobile, true)
  await page.evaluate((offset) => {
    const w = window.__toyWalk
    const start = performance.now()
    let ticks = 0
    window.__walkVideo = { start, rows: [], direction: 'initial' }
    const sample = () => {
      const v = window.__walkVideo
      const s = w.snapshot()
      v.rows.push({
        t: (performance.now() - start) / 1000 + offset / 1000,
        direction: v.direction,
        state: s.state,
        position: s.position,
        frame: w.framing(),
      })
      ticks++
      v.timer = setTimeout(
        sample,
        Math.max(0, start + ticks * 250 - performance.now()),
      )
    }
    sample()
  }, Date.now() - videoOrigins.get(page))
  const range = await page.evaluate(() => window.__toyWalk.snapshot().range)
  for (const [direction, x, z] of [
    ['near', 0, range.z],
    ['far', 0, -range.z],
    ['west', -range.x, 0],
    ['east', range.x, 0],
  ]) {
    await page.evaluate((direction) => {
      window.__walkVideo.direction = direction
    }, direction)
    await click(page, x, z, mobile)
    await page.waitForFunction(
      () => window.__toyWalk.snapshot().state !== 'idle',
    )
    await page.waitForFunction(
      () => window.__toyWalk.snapshot().state === 'idle',
      null,
      { timeout: 20000 },
    )
    await page.waitForTimeout(300)
  }
  const timeline = await page.evaluate(() => {
    clearTimeout(window.__walkVideo.timer)
    return window.__walkVideo.rows
  })
  const video = page.video()
  await page.context().close()
  await video.saveAs(`${out}/${device}.webm`)
  videos.push({ device, timeline })
}
await fs.writeFile(
  `${out}/video-timeline.json`,
  JSON.stringify(videos, null, 2),
)
await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors, null, 2))
await browser.close()
const compose = spawnSync(
  'python3',
  [
    '-c',
    `
from PIL import Image,ImageDraw
import json,subprocess,math
out='${out}'
for view in ['side','front']:
 sheet=Image.new('RGB',(1600,1100),'#d9d8dc');d=ImageDraw.Draw(sheet)
 for i in range(8):
  im=Image.open(f'{out}/cycle-{view}-{i}.png');x=i%4*400;y=i//4*550;sheet.paste(im,(x,y));d.text((x+10,y+10),f'{i}/8',fill='black')
 sheet.save(f'{out}/cycle-{view}.png')
for video in json.load(open(f'{out}/video-timeline.json')):
 device=video['device'];rows=[r for r in video['timeline'] if r['state']=='walk'];w,h=(320,200) if device=='desktop' else (156,338);cols=4
 sheet=Image.new('RGB',(cols*w,math.ceil(len(rows)/cols)*(h+20)),'white');d=ImageDraw.Draw(sheet)
 for i,row in enumerate(rows):
  filename=f'{out}/video-{device}-{i}.png'
  subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(row['t']),'-i',f'{out}/{device}.webm','-frames:v','1',filename],check=True)
  im=Image.open(filename).resize((w,h));x=i%cols*w;y=i//cols*(h+20);sheet.paste(im,(x,y));d.text((x+3,y+h+3),f"{row['t']:.2f}s {row['direction']}",fill='black')
 sheet.save(f'{out}/{device}-strip.png')
`,
  ],
  { stdio: 'inherit' },
)
assert.equal(compose.status, 0)
assert.deepEqual(errors, [])
assert(knee.legs.every((l) => l.min >= 0 && l.max <= 40.001))
assert(
  foot.thighMax <= 25.001 && foot.ankleMax <= 30.001 && foot.armMax <= 25.001,
)
assert(
  foot.maxContactSlip <= foot.tolerance &&
    foot.maxHeightError <= foot.tolerance &&
    foot.maxAnchoredPointHeight <= foot.tolerance &&
    foot.minSwingHeight >= -foot.tolerance,
)
assert(foot.maxSwingHeight >= 25 && foot.maxSwingHeight <= 40)
assert(
  frameSummary.every(
    (f) => Math.min(f.minX, f.minY) >= -1 && Math.max(f.maxX, f.maxY) <= 1,
  ),
)

assert(foot.midSwingHeight.every((h) => h.min >= 25 && h.max <= 40))
assert(
  videos.every((v) =>
    v.timeline.every(
      (s) =>
        Math.min(s.frame.minX, s.frame.minY) >= -1 &&
        Math.max(s.frame.maxX, s.frame.maxY) <= 1,
    ),
  ),
)
