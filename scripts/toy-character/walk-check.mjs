import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const out = '.work/toy-character/walk'
const base = process.env.WALK_BASE_URL ?? 'http://localhost:4410'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const open = async (viewport, deviceScaleFactor = 1, mobile = false) => {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  })
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
const advance = (page, dt) =>
  page.evaluate((dt) => window.__toyWalk.advance(dt), dt)
const go = (page, x, z) =>
  page.evaluate(([x, z]) => window.__toyWalk.go(x, z), [x, z])
const pause = (page) =>
  page.evaluate(() => {
    window.__toyWalk.controls.paused = true
  })
const settle = async (page) =>
  page.evaluate(() => {
    const samples = []
    for (let i = 0; i < 1600; i++) {
      window.__toyWalk.advance(1 / 120)
      samples.push(window.__toyWalk.snapshot())
      if (samples.at(-1).state === 'idle') return samples
    }
    throw new Error('Walk did not finish')
  })
const page = await open({ width: 400, height: 550 })
const floorY = await page.evaluate(() => window.__toyWalk.floorY)
await pause(page)
await go(page, 0, 0.55)
await advance(page, 0.34)
for (let i = 0; i < 8; i++) {
  for (const [view, angle] of [
    ['side', Math.PI / 2],
    ['front', 0],
  ]) {
    await page.evaluate((angle) => {
      window.__toyWalk.controls.view = angle
      window.__toyWalk.advance(0)
    }, angle)
    await page.screenshot({ path: `${out}/cycle-${view}-${i}.png` })
  }
  await advance(page, 0.085)
}
await page.close()

const samples = []
const framing = []
for (const [device, viewport, dpr, mobile] of [
  ['desktop', { width: 1440, height: 900 }, 2, false],
  ['mobile', { width: 390, height: 844 }, 3, true],
]) {
  const p = await open(viewport, dpr, mobile)
  await pause(p)
  for (const [direction, x, z] of [
    ['east', 0.55, 0],
    ['far', 0, -0.55],
    ['west', -0.55, 0],
    ['near', 0, 0.55],
  ]) {
    // 画面上で選んだ床の点を実際の pointer 入力で押す。
    const taps = []
    for (let attempt = 0; attempt < 10; attempt++) {
      const point = await p.evaluate(
        ([x, z]) => window.__toyWalk.project(x, z),
        [x, z],
      )
      const px = Math.max(35, Math.min(viewport.width - 40, point.x))
      const py = Math.max(20, Math.min(viewport.height - 20, point.y))
      taps.push({ x: px, y: py })
      if (mobile) await p.touchscreen.tap(px, py)
      else await p.mouse.click(px, py)
      const walk = await settle(p)
      samples.push(...walk.map((s) => ({ device, direction, ...s })))
      const position = walk.at(-1).position
      if (Math.hypot(position[0] - x, position[2] - z) < 0.0001) break
      if (attempt === 9)
        throw new Error(`Could not tap ${device} ${direction}: ${position}`)
    }
    for (let i = 0; i < 360; i++) await advance(p, 1 / 120)
    const frame = await p.evaluate(() => window.__toyWalk.framing())
    const state = await p.evaluate(() => window.__toyWalk.snapshot())
    framing.push({
      device,
      direction,
      taps,
      ...frame,
      position: state.position,
      yaw: state.yaw,
    })
    await p.screenshot({ path: `${out}/walk-${device}-${direction}.png` })
  }
  if (device === 'desktop') {
    await p.mouse.move(1100, 250)
    for (let i = 0; i < 360; i++) await advance(p, 1 / 120)
    await p.screenshot({ path: `${out}/turn.png` })
  }
  await p.close()
}
const knee = {
  unit: 'degrees',
  method:
    'Every rendered simulation frame (120 Hz), measured from the shin local quaternion relative to rest; rest-world +X is backward flexion.',
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
    'Skinned shoe-sole vertices. Fix the lowest contact vertex in world XZ while planted; when the sole rolls to a new vertex use its previous-frame world position. Height is the minimum of all sole vertices. Also record deformation of vertices within 0.1 mm of the floor, separately from the actual contact point.',
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
}
await fs.writeFile(`${out}/knee.json`, JSON.stringify(knee, null, 2))
await fs.writeFile(`${out}/foot.json`, JSON.stringify(foot, null, 2))
await fs.writeFile(`${out}/frames.json`, JSON.stringify(samples))
await fs.writeFile(`${out}/framing.json`, JSON.stringify(framing, null, 2))
console.log({ knee, foot, framing })

const speed = []
for (const [device, viewport, dpr, rate] of [
  ['desktop', { width: 1440, height: 900 }, 2, 1],
  ['mobile', { width: 390, height: 844 }, 3, 4],
]) {
  const p = await open(viewport, dpr, device === 'mobile')
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await go(p, -0.55, 0)
  await p.waitForFunction(
    () => window.__toyWalk.snapshot().state === 'idle',
    null,
    { timeout: 20000 },
  )
  await go(p, 0.55, 0)
  await p.waitForFunction(() => window.__toyWalk.snapshot().state === 'walk')
  const result = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const times = []
        let previous
        let start
        const frame = (now) => {
          if (start === undefined) start = now
          if (previous !== undefined) times.push(now - previous)
          previous = now
          if (now - start < 5000) requestAnimationFrame(frame)
          else {
            const gl = document.querySelector('canvas').getContext('webgl2')
            const ext = gl.getExtension('WEBGL_debug_renderer_info')
            const sorted = [...times].sort((a, b) => a - b)
            resolve({
              frames: times.length,
              median: sorted[Math.floor(sorted.length * 0.5)],
              p95: sorted[Math.floor(sorted.length * 0.95)],
              gpu: ext
                ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                : gl.getParameter(gl.RENDERER),
              intervals: times,
            })
          }
        }
        requestAnimationFrame(frame)
      }),
  )
  speed.push({ device, viewport, dpr, cpuThrottle: rate, ...result })
  await p.close()
}
await fs.writeFile(`${out}/speed.json`, JSON.stringify(speed, null, 2))
await fs.writeFile(`${out}/errors.json`, JSON.stringify(errors))
await browser.close()
const compose = spawnSync(
  'python3',
  [
    '-c',
    `
from PIL import Image,ImageDraw
out='${out}'
for view in ['side','front']:
 images=[Image.open(f'{out}/cycle-{view}-{i}.png') for i in range(8)]
 sheet=Image.new('RGB',(1600,1100)); d=ImageDraw.Draw(sheet)
 for i,im in enumerate(images):
  x=i%4*400;y=i//4*550;sheet.paste(im,(x,y));d.text((x+10,y+10),f'{i}/8',fill='black')
 sheet.save(f'{out}/cycle-{view}.png')
for device in ['desktop','mobile']:
 images=[Image.open(f'{out}/walk-{device}-{p}.png') for p in ['east','far','west','near']]
 w,h=images[0].size;sheet=Image.new('RGB',(w*2,h*2))
 for i,im in enumerate(images):sheet.paste(im,(i%2*w,i//2*h))
 sheet.save(f'{out}/walk-{device}.png')
`,
  ],
  { stdio: 'inherit' },
)
if (compose.status) throw new Error('Contact sheet failed')
console.log(
  'speed',
  speed.map(({ intervals, ...s }) => s),
)
if (
  errors.length ||
  knee.legs.some((l) => l.min < 0) ||
  foot.thighMax > 25.001 ||
  foot.ankleMax > 30.001 ||
  foot.maxAnchoredPointHeight > foot.tolerance ||
  foot.maxContactSlip > foot.tolerance ||
  foot.maxHeightError > foot.tolerance ||
  foot.minSwingHeight < -foot.tolerance ||
  framing.some(
    (f) => Math.min(f.minX, f.minY) < -1 || Math.max(f.maxX, f.maxY) > 1,
  )
)
  process.exitCode = 1
