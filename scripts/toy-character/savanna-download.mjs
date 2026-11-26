import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
const out = '.work/toy-character/savanna/vendor'
await fs.mkdir(out, { recursive: true })
const b = await chromium.launch({ channel: 'chrome', headless: true }),
  page = await b.newPage()
const sources = []
async function save(name, url) {
  const r = await page.request.get(url)
  if (!r.ok()) throw Error(`${r.status()} ${url}`)
  const bytes = await r.body()
  await fs.writeFile(`${out}/${name}`, bytes)
  return {
    file: name,
    url,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  }
}
try {
  await page.goto('https://kenney.nl/assets/nature-kit')
  sources.push(await save('nature-page.html', page.url()))
  const link = await page.evaluate(
    async () =>
      (
        await (
          await fetch('/download-link/6173736574732f6e61747572652d6b6974')
        ).json()
      ).url,
  )
  const nature = await save('nature.zip', link)
  // Signed query links expire; the official page is the durable source.
  nature.url = 'https://kenney.nl/assets/nature-kit'
  sources.push(nature)
  await page.goto('https://gobkit.com/freebies')
  sources.push(await save('gobkit-page.html', page.url()))
  const manifest = await save(
    'gobkit-manifest.json',
    'https://gobkit.com/api/free',
  )
  sources.push(manifest)
  const data = JSON.parse(await fs.readFile(`${out}/gobkit-manifest.json`))
  const pack = data.packs.find((p) => p.id === 'gobkit-animal006-pack')
  sources.push(await save('gobkit-animal006-pack.zip', pack.zip))
  await fs.writeFile(
    `${out}/sources.json`,
    JSON.stringify(
      {
        retrievedAt: new Date().toISOString(),
        sources,
        license: 'CC0-1.0',
        optionalCredits:
          'Nature assets by Kenney; animals by Gobkit (CC0). Colors modified.',
      },
      null,
      2,
    ) + '\n',
  )
  await fs.writeFile(
    `${out}/SHA256SUMS`,
    sources.map((s) => `${s.sha256}  ${s.file}`).join('\n') + '\n',
  )
  for (const name of ['nature', 'gobkit-animal006-pack'])
    execFileSync('python3', [
      '-c',
      `import zipfile;zipfile.ZipFile('${out}/${name}.zip').extractall('${out}/${name}')`,
    ])
} finally {
  await b.close()
}
