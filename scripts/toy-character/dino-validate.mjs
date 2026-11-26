import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
const req = createRequire(
  path.resolve('.work/toy-character/savanna/tooling/package.json'),
)
const imp = (n) => import(pathToFileURL(req.resolve(n)).href)
const { NodeIO } = await imp('@gltf-transform/core'),
  { ALL_EXTENSIONS } = await imp('@gltf-transform/extensions'),
  { MeshoptDecoder } = await imp('meshoptimizer')
const cache = path.join(process.env.HOME, 'Library/Caches/pnpm/dlx')
const files = execFileSync('rg', ['--files', '-uuu', cache], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
}).split('\n')
const pkg = files.find((p) => p.endsWith('/gltf-validator/package.json'))
const validator = createRequire(pkg)('gltf-validator')
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const out = '.work/toy-character/dino',
  record = JSON.parse(await fs.readFile(`${out}/assets.json`)),
  results = []
for (const a of record.assets) {
  const doc = await io.read(`src/demos/toy-figure/assets/${a.name}.glb`)
  for (const e of doc.getRoot().listExtensionsUsed())
    if (e.extensionName === 'EXT_meshopt_compression') e.dispose()
  const bytes = await io.writeBinary(doc)
  const r = await validator.validateBytes(bytes, { maxIssues: 100 })
  results.push({ name: a.name, ...r.issues })
  if (r.issues.numErrors) throw Error(a.name + JSON.stringify(r.issues))
}
await fs.writeFile(`${out}/validation.json`, JSON.stringify(results, null, 2))
console.log(
  results.map((r) => ({
    name: r.name,
    errors: r.numErrors,
    warnings: r.numWarnings,
  })),
)
