import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import http from 'node:http'
import { gzipSync } from 'node:zlib'
const out = '.work/toy-character/dino2'
const proxy = http.createServer(async (req, res) => {
  try {
    const response = await fetch(`http://localhost:4411${req.url}`)
    res.statusCode = response.status
    res.setHeader(
      'content-type',
      response.headers.get('content-type') ?? 'application/octet-stream',
    )
    const body = Buffer.from(await response.arrayBuffer())
    if (req.url.includes('.glb')) res.setHeader('content-encoding', 'gzip')
    res.write(req.url.includes('.glb') ? gzipSync(body) : body)
    res.end()
  } catch (e) {
    res.statusCode = 500
    res.end(String(e))
  }
})
await new Promise((resolve) => proxy.listen(4421, '127.0.0.1', resolve))
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const results = []
for (const [name, url, strip] of [
  ['preview', 'http://localhost:4411/toy-figure/', true],
  ['dev', 'http://localhost:4410/toy-figure/', false],
  ['gzip-no-length', 'http://127.0.0.1:4421/toy-figure/', false],
]) {
  const context = await b.newContext({
    viewport: { width: 800, height: 500 },
    deviceScaleFactor: 1,
  })
  const p = await context.newPage()
  await p.routeWebSocket('**/*', () => {})
  await p.addInitScript(() => {
    window.__progress = []
    const record = () => {
      const e = document.querySelector('[role="progressbar"]')
      if (!e) return
      const value = Number(e.getAttribute('aria-valuenow'))
      if (window.__progress.at(-1)?.value !== value)
        window.__progress.push({ value, time: performance.now() })
    }
    new MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    })
  })
  const cdp = await context.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: 500000,
    uploadThroughput: 500000,
  })
  const responses = []
  p.on('response', (r) => {
    if (r.url().includes('.glb'))
      responses.push({ url: r.url(), headers: r.headers() })
  })
  await p.goto(url, { waitUntil: 'commit' })
  await p.getByRole('progressbar').waitFor()
  const started = Date.now(),
    frames = []
  for (let i = 0; i < 240; i++) {
    const target = started + i * 500
    if (Date.now() < target) await p.waitForTimeout(target - Date.now())
    const state = await p.evaluate(() => ({
      value: Number(
        document
          .querySelector('[role="progressbar"]')
          ?.getAttribute('aria-valuenow') ?? 100,
      ),
      done:
        document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
    }))
    const file = `loading-${String(i).padStart(3, '0')}.png`
    if (strip) await p.screenshot({ path: `${out}/${file}` })
    frames.push({ seconds: i * 0.5, ...state, file })
    if (state.done) break
  }
  const samples = await p.evaluate(() => window.__progress)
  const valid =
    samples.length > 10 &&
    samples.at(-1).value === 100 &&
    samples.every(
      (s, i) =>
        s.value >= 0 &&
        s.value <= 100 &&
        (!i || s.value >= samples[i - 1].value),
    )
  results.push({ name, valid, frames, samples, responses })
  console.log(name, valid, samples.length, frames.at(-1).seconds)
  await context.close()
  if (!valid) throw Error('Nonmonotonic or incomplete progress')
}
await fs.writeFile(`${out}/loading.json`, JSON.stringify(results, null, 2))
await b.close()
await new Promise((resolve) => proxy.close(resolve))
