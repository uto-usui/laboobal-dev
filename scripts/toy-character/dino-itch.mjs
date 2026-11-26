import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const b = await chromium.launch({ channel: 'chrome' })
for (const [name, slug] of [
  ['dinosaur', 'animated-lowpoly-dinosaurs'],
  ['nature', 'stylized-nature-megakit'],
  ['ultimate-nature', '150-lowpoly-nature-models'],
]) {
  const p = await b.newPage()
  await p.goto(`https://quaternius.itch.io/${slug}`)
  const token = await p.locator('meta[name=csrf_token]').getAttribute('value')
  const r = await p.request.post(
    `https://quaternius.itch.io/${slug}/download_url`,
    { form: { csrf_token: token } },
  )
  console.log(name, r.status())
  const { url } = await r.json()
  if (url) {
    await p.goto(url)
    await fs.writeFile(
      `.work/toy-character/dino/vendor/${name}-download.html`,
      await p.content(),
    )
    console.log(
      await p.locator('[data-upload_id]').evaluateAll((a) =>
        a.map((x) => ({
          text: x.parentElement.textContent,
          id: x.dataset.upload_id,
        })),
      ),
    )
    const dl = p.waitForEvent('download')
    await p.locator('[data-upload_id]').first().click()
    await (await dl).saveAs(`.work/toy-character/dino/vendor/${name}.zip`)
    console.log(name, 'saved')
  }
  await p.close()
}
await b.close()
