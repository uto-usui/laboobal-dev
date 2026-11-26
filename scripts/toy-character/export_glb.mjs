/** pnpm dlx provides the CLI, its SDK dependencies, and the Khronos validator. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const out = process.env.TOY_EXPORT_OUT
if (!out) throw new Error('TOY_EXPORT_OUT is required')
const dirs = process.env.PATH.split(path.delimiter).filter((p) =>
  p.endsWith('node_modules/.bin'),
)
const root = dirs
  .map((p) => path.dirname(p))
  .find(
    (p) =>
      fs.existsSync(path.join(p, '@gltf-transform/cli')) &&
      fs.existsSync(path.join(p, 'gltf-validator')),
  )
if (!root)
  throw new Error(
    'Run with pnpm dlx --package=@gltf-transform/cli@4.5.1 --package=gltf-validator -c ...',
  )
const req = createRequire(
  path.join(
    fs.realpathSync(path.join(root, '@gltf-transform/cli')),
    'package.json',
  ),
)
const importPkg = async (p) => import(pathToFileURL(req.resolve(p)).href)
const { NodeIO } = await importPkg('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await importPkg(
  '@gltf-transform/extensions',
)
const { MeshoptEncoder, MeshoptDecoder } = await importPkg('meshoptimizer')
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
function glbJSON(file) {
  const b = fs.readFileSync(file)
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)))
}
const rawJSON = glbJSON(path.join(out, 'character-raw.glb'))
function preserveTransforms(file) {
  const b = fs.readFileSync(file),
    jl = b.readUInt32LE(12),
    g = JSON.parse(b.subarray(20, 20 + jl)),
    bin = b.subarray(20 + jl)
  for (const n of g.nodes) {
    const src = rawJSON.nodes.find((q) => q.name === n.name)
    if (!src) continue
    for (const key of ['translation', 'rotation', 'scale', 'matrix']) {
      delete n[key]
      if (src[key]) n[key] = src[key]
    }
  }
  let j = Buffer.from(JSON.stringify(g))
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)])
  const h = Buffer.alloc(20)
  h.write('glTF')
  h.writeUInt32LE(2, 4)
  h.writeUInt32LE(20 + j.length + bin.length, 8)
  h.writeUInt32LE(j.length, 12)
  h.write('JSON', 16)
  fs.writeFileSync(file, Buffer.concat([h, j, bin]))
}
const raw = await io.read(path.join(out, 'character-raw.glb'))
const doc = await io.read(path.join(out, 'character-webp.glb'))
// QUANTIZE mode applies lossless entropy encoding to existing attributes. Do
// not invoke quantize(): rest positions, normals, UVs and weights remain floats.
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await io.write(path.join(out, 'character.glb'), doc)
preserveTransforms(path.join(out, 'character.glb'))
const final = await io.read(path.join(out, 'character.glb'))
const hash = (b) => createHash('sha256').update(b).digest('hex')
const typed = (a) => ({
  type: a.getType(),
  component: a.getComponentType(),
  normalized: a.getNormalized(),
  count: a.getCount(),
  sha256: hash(
    new Uint8Array(
      a.getArray().buffer,
      a.getArray().byteOffset,
      a.getArray().byteLength,
    ),
  ),
})
function typedTriangles(a) {
  const src = a.getArray(),
    v = []
  for (let i = 0; i < src.length; i += 3) {
    const t = [src[i], src[i + 1], src[i + 2]]
    const k = t.indexOf(Math.min(...t))
    v.push([t[k], t[(k + 1) % 3], t[(k + 2) % 3]])
  }
  v.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  return { triangles: v.length, sha256: hash(Buffer.from(JSON.stringify(v))) }
}
function structure(d) {
  const r = d.getRoot()
  return {
    bones: r.listSkins().map((s) => ({
      name: s.getName(),
      joints: s.listJoints().map((j) => ({
        name: j.getName(),
        parent: j.getParentNode()?.getName() || null,
        translation: j.getTranslation(),
        rotation: j.getRotation(),
        scale: j.getScale(),
      })),
      inverseBindMatrices: typed(s.getInverseBindMatrices()),
    })),
    parts: r.listMeshes().map((m) => ({
      name: m.getName(),
      triangles: m
        .listPrimitives()
        .reduce((n, p) => n + p.getIndices().getCount() / 3, 0),
      primitives: m.listPrimitives().map((p) => ({
        material: p.getMaterial()?.getName(),
        indices: typedTriangles(p.getIndices()),
        attributes: Object.fromEntries(
          p
            .listSemantics()
            .sort()
            .map((s) => [s, typed(p.getAttribute(s))]),
        ),
      })),
    })),
    nodes: r
      .listNodes()
      .filter((n) => n.getMesh())
      .map((n) => ({
        name: n.getName(),
        parent: n.getParentNode()?.getName(),
        translation: n.getTranslation(),
        rotation: n.getRotation(),
        scale: n.getScale(),
        skin: n.getSkin()?.getName(),
      })),
    animations: r.listAnimations().length,
  }
}
const before = structure(raw),
  after = structure(final)
const equal = JSON.stringify(before) === JSON.stringify(after)
if (!equal) {
  fs.writeFileSync(
    path.join(out, 'structure-before.json'),
    JSON.stringify(before, null, 2),
  )
  fs.writeFileSync(
    path.join(out, 'structure-after.json'),
    JSON.stringify(after, null, 2),
  )
  throw new Error(
    'Mesh, rig, UV, weight, normal, or topology changed during compression',
  )
}
const imageChecks = []
for (let i = 0; i < raw.getRoot().listTextures().length; i++) {
  const a = raw.getRoot().listTextures()[i]
  const b = final
    .getRoot()
    .listTextures()
    .find((t) => t.getName() === a.getName())
  if (!b) throw new Error('Texture lost: ' + a.getName())
  const ar = await sharp(a.getImage())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const br = await sharp(b.getImage())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let max = 0,
    visibleMax = 0
  if (ar.data.length !== br.data.length)
    throw new Error('Texture dimensions changed')
  for (let j = 0; j < ar.data.length; j++) {
    const error = Math.abs(ar.data[j] - br.data[j])
    max = Math.max(max, error)
    if (j % 4 === 3 || ar.data[j - (j % 4) + 3] > 0)
      visibleMax = Math.max(visibleMax, error)
  }
  if (visibleMax)
    throw new Error(
      'Lossless WebP changed visible texture values: ' + a.getName(),
    )
  imageChecks.push({
    name: a.getName(),
    width: ar.info.width,
    height: ar.info.height,
    mime: b.getMimeType(),
    visiblePixelMaxError: visibleMax,
    includingTransparentRGBMaxError: max,
  })
}
// gltf-validator has no executable. Its official JS/WASM API is invoked from
// the pnpm dlx package environment after recording the NO_BIN limitation.
const reports = {}
for (const [key, file] of [
  ['raw', 'character-raw.glb'],
  ['compressed', 'character.glb'],
]) {
  const r = await validator.validateBytes(
    new Uint8Array(fs.readFileSync(path.join(out, file))),
    { uri: file, maxIssues: 10000 },
  )
  fs.writeFileSync(
    path.join(out, 'validator-' + key + '.json'),
    JSON.stringify(r, null, 2) + '\n',
  )
  reports[key] = {
    errors: r.issues.numErrors,
    warnings: r.issues.numWarnings,
    infos: r.issues.numInfos,
    hints: r.issues.numHints,
    messages: r.issues.messages,
  }
  if (r.issues.numErrors) throw new Error('Validator errors in ' + file)
}
// Blender does not decode EXT_meshopt_compression. Re-serialize the already
// verified final file after decoding, keeping the exact final WebP pixels.
const ext = final
  .getRoot()
  .listExtensionsUsed()
  .find((e) => e.extensionName === 'EXT_meshopt_compression')
ext.dispose()
await io.write(path.join(out, 'character-decoded.glb'), final)
preserveTransforms(path.join(out, 'character-decoded.glb'))
const decodedReport = await validator.validateBytes(
  new Uint8Array(fs.readFileSync(path.join(out, 'character-decoded.glb'))),
  { uri: 'character-decoded.glb', maxIssues: 10000 },
)
fs.writeFileSync(
  path.join(out, 'validator-decoded.json'),
  JSON.stringify(decodedReport, null, 2) + '\n',
)
if (decodedReport.issues.numErrors)
  throw new Error('Validator errors in decoded file')
reports.decoded = {
  errors: decodedReport.issues.numErrors,
  warnings: decodedReport.issues.numWarnings,
  infos: decodedReport.issues.numInfos,
}
const stat = (n) => ({
  bytes: fs.statSync(path.join(out, n)).size,
  MiB: fs.statSync(path.join(out, n)).size / 1048576,
})
const sizes = {
  raw: stat('character-raw.glb'),
  webp: stat('character-webp.glb'),
  compressed: stat('character.glb'),
}
const report = {
  versions: { gltfTransform: '4.5.1', validator: validator.version() },
  format: 'meshopt (no quantization or lossy filters) + lossless WebP',
  reason:
    'toktx is not installed or on PATH; WebP preserves visible pixels exactly. WebP has no GPU block compression.',
  cliValidatorNote:
    'pnpm dlx gltf-validator returns ERR_PNPM_DLX_NO_BIN; official gltf-validator JS/WASM API used through pnpm dlx package environment',
  sizes,
  exactPreservation: {
    bonesAndParents: true,
    bindMatrices: true,
    weights: true,
    positions: true,
    normals: true,
    uvs: true,
    orientedTriangleConnectivity: true,
    partCount: true,
    triangles: true,
    textureVisiblePixels: true,
  },
  structure: before,
  images: imageChecks,
  validator: reports,
  animations: before.animations,
  under10MiB: sizes.compressed.MiB <= 10,
  target5to8MiB: sizes.compressed.MiB >= 5 && sizes.compressed.MiB <= 8,
}
fs.writeFileSync(
  path.join(out, 'compression.json'),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(
  JSON.stringify(
    {
      sizes,
      parts: before.parts.length,
      triangles: before.parts.reduce((n, p) => n + p.triangles, 0),
      bones: before.bones[0].joints.length,
      validator: Object.fromEntries(
        Object.entries(reports).map(([k, v]) => [
          k,
          { errors: v.errors, warnings: v.warnings },
        ]),
      ),
    },
    null,
    2,
  ),
)
if (!report.under10MiB) throw new Error('Compressed GLB exceeds 10 MiB')
