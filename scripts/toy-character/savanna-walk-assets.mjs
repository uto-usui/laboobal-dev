import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const work = '.work/toy-character/savanna'
const out = 'src/demos/toy-figure/assets'
const req = createRequire(path.resolve(work, 'tooling/package.json'))
const imp = (n) => import(pathToFileURL(req.resolve(n)).href)
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp(
  '@gltf-transform/extensions',
)
const { prune, dedup, reorder, getBounds } = await imp(
  '@gltf-transform/functions',
)
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer')
const sharp = req('sharp')
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const palette = [
  '#c9b78b',
  '#a99769',
  '#8e966d',
  '#83745d',
  '#b6a58e',
  '#343936',
  '#f0ece0',
  '#828b89',
]
const rgb = palette.map((h) =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
)
const pixels = Buffer.alloc(1024 * 1024 * 4, 255)
const names = [
  'tree_plateau',
  'grass_large',
  'rock_largeA',
  'rock_smallC',
  'plant_bushSmall',
  'log',
  'Zebra',
  'Elephant',
]
const docs = new Map()
const sources = []
for (const name of names) {
  const animal = name === 'Zebra' || name === 'Elephant'
  const file = animal
    ? `${work}/vendor/gobkit-animal006-pack/${name}.glb`
    : `${work}/vendor/nature/Models/GLTF format/${name}.glb`
  const doc = await io.read(file)
  docs.set(name, doc)
  sources.push({
    name,
    sha256: crypto
      .createHash('sha256')
      .update(await fs.readFile(file))
      .digest('hex'),
    bounds: getBounds(doc.getRoot().listScenes()[0]),
  })
  if (animal) {
    const raw = await sharp(doc.getRoot().listTextures()[0].getImage())
      .ensureAlpha()
      .raw()
      .toBuffer()
    const offset = name === 'Zebra' ? 0 : 512
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4
        const light = (raw[i] + raw[i + 1] + raw[i + 2]) / 3
        const k =
          name === 'Zebra'
            ? light > 140
              ? 6
              : 5
            : light < 65
              ? 5
              : light > 220
                ? 6
                : 7
        Buffer.from([...rgb[k], 255]).copy(pixels, (y * 1024 + offset + x) * 4)
      }
  }
}
for (let y = 512; y < 1024; y++)
  for (let x = 0; x < 1024; x++)
    Buffer.from([...rgb[Math.floor(x / 128)], 255]).copy(
      pixels,
      (y * 1024 + x) * 4,
    )
const atlas = await sharp(pixels, {
  raw: { width: 1024, height: 1024, channels: 4 },
})
  .png()
  .toBuffer()
const report = []
for (const [name, doc] of docs) {
  const texture = doc
    .createTexture('savanna-eight-paints')
    .setImage(atlas)
    .setMimeType('image/png')
  const material = doc
    .createMaterial('savanna-matte')
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.95)
    .setMetallicFactor(0)
    .setDoubleSided(true)
  material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728)
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const animal = name === 'Zebra' || name === 'Elephant'
      const old = p.getMaterial()?.getBaseColorFactor() ?? [0.5, 0.5, 0.5, 1]
      const uv = animal
        ? p.getAttribute('TEXCOORD_0').clone()
        : doc
            .createAccessor()
            .setType('VEC2')
            .setArray(
              new Float32Array(p.getAttribute('POSITION').getCount() * 2),
            )
            .setBuffer(p.getAttribute('POSITION').getBuffer())
      for (let i = 0; i < uv.getCount(); i++) {
        if (animal) {
          const v = uv.getElement(i, [])
          uv.setElement(i, [
            v[0] / 2 + (name === 'Elephant' ? 0.5 : 0),
            v[1] / 2,
          ])
        } else {
          const k = name.startsWith('rock')
            ? 4
            : name.startsWith('grass') || name.startsWith('plant')
              ? 1
              : old[1] > old[0] * 1.05
                ? 2
                : 3
          uv.setElement(i, [(k + 0.5) / 8, 0.75])
        }
      }
      p.setAttribute('TEXCOORD_0', uv)
        .setAttribute('COLOR_0', null)
        .setMaterial(material)
    }
  for (const e of doc.getRoot().listExtensionsUsed())
    if (e.extensionName === 'KHR_materials_unlit') e.dispose()
  await doc.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }))
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const file = `${out}/${name}.glb`
  await io.write(file, doc)
  const decoded = await io.read(file)
  report.push({
    ...sources.find((s) => s.name === name),
    bytes: (await fs.stat(file)).size,
    animations: decoded
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
    bones: new Set(
      decoded
        .getRoot()
        .listSkins()
        .flatMap((s) => s.listJoints()),
    ).size,
  })
}
await fs.writeFile(
  '.work/toy-character/savanna-walk/assets.json',
  JSON.stringify(
    { palette, assets: report, bytes: report.reduce((s, r) => s + r.bytes, 0) },
    null,
    2,
  ),
)
console.log(report)
