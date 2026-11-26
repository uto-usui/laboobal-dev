/** Same lossless meshopt and WebP path as stage 11, without CLI side effects. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const out = process.env.TOY_EXPORT_OUT
const size = Number(process.env.TOY_TEXTURE_SIZE ?? 3072)
const quality = Number(process.env.TOY_TEXTURE_QUALITY ?? 75)
const sourceDir = path.resolve('.work/toy-character/display')
const root = process.env.PATH.split(path.delimiter)
  .filter((p) => p.endsWith('node_modules/.bin'))
  .map((p) => path.dirname(p))
  .find(
    (p) =>
      fs.existsSync(path.join(p, '@gltf-transform/cli')) &&
      fs.existsSync(path.join(p, 'gltf-validator')),
  )
const req = createRequire(
  path.join(
    fs.realpathSync(path.join(root, '@gltf-transform/cli')),
    'package.json',
  ),
)
const imp = async (n) => import(pathToFileURL(req.resolve(n)).href)
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } = await imp(
  '@gltf-transform/extensions',
)
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer')
const sharp = req('sharp')
const validator = createRequire(path.join(root, 'package.json'))(
  'gltf-validator',
)
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const doc = await io.read(path.join(path.dirname(out), 'character-raw.glb'))
const images = []
for (const t of doc.getRoot().listTextures()) {
  const source = t.getImage()
  const preserved = t.getName().startsWith('source-')
    ? path.join(sourceDir, `${t.getName()}.png`)
    : null
  const originalImage =
    preserved && fs.existsSync(preserved) ? fs.readFileSync(preserved) : source
  const before = await sharp(originalImage).metadata()
  const headColor = t.getName() === 'source-head-2'
  const resolution = process.env.TOY_MIXED === '1' && headColor ? 3072 : size
  const imageQuality =
    process.env.TOY_MIXED === '1'
      ? headColor
        ? 80
        : t.getName().endsWith('-1') || t.getName().endsWith('-3')
          ? 40
          : 75
      : quality
  const resized = t.getName().startsWith('source-')
  const buf = resized
    ? await sharp(originalImage)
        .resize(resolution, resolution, { kernel: 'lanczos3' })
        .webp({ quality: imageQuality, effort: 6 })
        .toBuffer()
    : await sharp(source).webp({ lossless: true, effort: 6 }).toBuffer()
  const after = await sharp(buf).metadata()
  t.setImage(buf).setMimeType('image/webp')
  images.push({
    name: t.getName(),
    bytes: buf.length,
    originalDimensions: [before.width, before.height],
    dimensions: [after.width, after.height],
    quality: resized ? imageQuality : 'lossless',
  })
}
doc.createExtension(EXTTextureWebP).setRequired(true)
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await io.write(path.join(out, 'character.glb'), doc)
// Keep the original node transforms exact (SDK otherwise factors matrices).
const readJSON = (b) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)))
const original = readJSON(
  fs.readFileSync(path.join(path.dirname(out), 'character-raw.glb')),
)
const file = path.join(out, 'character.glb')
const b = fs.readFileSync(file)
const n = b.readUInt32LE(12)
const g = readJSON(b)
for (const node of g.nodes) {
  const src = original.nodes.find((s) => s.name === node.name)
  if (src)
    for (const k of ['translation', 'rotation', 'scale', 'matrix']) {
      delete node[k]
      if (src[k]) node[k] = src[k]
    }
}
let j = Buffer.from(JSON.stringify(g))
j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)])
const h = Buffer.alloc(20)
h.write('glTF')
h.writeUInt32LE(2, 4)
h.writeUInt32LE(20 + j.length + b.length - 20 - n, 8)
h.writeUInt32LE(j.length, 12)
h.write('JSON', 16)
fs.writeFileSync(file, Buffer.concat([h, j, b.subarray(20 + n)]))
const final = await io.read(file)
const attributes = (d) =>
  d
    .getRoot()
    .listMeshes()
    .map((m) => ({
      name: m.getName(),
      p: m.listPrimitives().map((p) => ({
        mat: p.getMaterial().getName(),
        attrs: Object.fromEntries(
          p
            .listSemantics()
            .map((s) => [
              s,
              Buffer.from(p.getAttribute(s).getArray().buffer).toString(
                'base64',
              ),
            ]),
        ),
      })),
    }))
if (JSON.stringify(attributes(final)) !== JSON.stringify(attributes(doc)))
  throw Error('Attribute change')
const report = await validator.validateBytes(
  new Uint8Array(fs.readFileSync(file)),
  { uri: 'character.glb', maxIssues: 10000 },
)
fs.writeFileSync(
  path.join(out, 'validator.json'),
  JSON.stringify(report, null, 2),
)
const summary = {
  versions: { gltfTransform: '4.5.1', validator: validator.version() },
  bytes: fs.statSync(file).size,
  MiB: fs.statSync(file).size / 1048576,
  errors: report.issues.numErrors,
  warnings: report.issues.numWarnings,
  images,
  attributePreservation: true,
  bones: final.getRoot().listSkins()[0].listJoints().length,
}
fs.writeFileSync(
  path.join(out, 'compression.json'),
  JSON.stringify(summary, null, 2),
)
console.log(summary)
if (summary.errors) throw Error('Validator errors')
const topology = (d) =>
  d
    .getRoot()
    .listMeshes()
    .map((m) =>
      m.listPrimitives().map((p) => {
        const a = p.getIndices().getArray(),
          triangles = []
        for (let i = 0; i < a.length; i += 3) {
          const t = [a[i], a[i + 1], a[i + 2]],
            k = t.indexOf(Math.min(...t))
          triangles.push([t[k], t[(k + 1) % 3], t[(k + 2) % 3]])
        }
        return triangles.sort(
          (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2],
        )
      }),
    )
if (JSON.stringify(topology(doc)) !== JSON.stringify(topology(final)))
  throw Error('Oriented triangle connectivity changed')
const rig = (d) =>
  d
    .getRoot()
    .listSkins()
    .map((skin) => ({
      joints: skin.listJoints().map((j) => ({
        name: j.getName(),
        parent: j.getParentNode()?.getName(),
        matrix: j.getMatrix(),
      })),
      inverseBindMatrices: Array.from(skin.getInverseBindMatrices().getArray()),
    }))
if (JSON.stringify(rig(doc)) !== JSON.stringify(rig(final)))
  throw Error('Skin or joint transform changed')
summary.topologyPreservation = true
summary.rigPreservation = true
fs.writeFileSync(
  path.join(out, 'compression.json'),
  JSON.stringify(summary, null, 2),
)

// Validate the decoded accessors as well: the Khronos validator does not
// currently decode EXT_meshopt_compression itself.
const meshopt = final
  .getRoot()
  .listExtensionsUsed()
  .find((e) => e.extensionName === 'EXT_meshopt_compression')
meshopt.dispose()
const decodedPath = path.join(out, 'character-decoded.glb')
await io.write(decodedPath, final)
const decoded = await validator.validateBytes(
  new Uint8Array(fs.readFileSync(decodedPath)),
  { uri: 'character-decoded.glb', maxIssues: 10000 },
)
fs.writeFileSync(
  path.join(out, 'validator-decoded.json'),
  JSON.stringify(decoded, null, 2),
)
if (decoded.issues.numErrors) throw Error('Decoded validator errors')
