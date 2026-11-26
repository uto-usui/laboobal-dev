/** Preserve the accepted mesh and rig; change base color images and UVs only. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
const out = process.env.TOY_TEXTURE_OUT
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
const sharp = req('sharp'),
  validator = createRequire(path.join(root, 'package.json'))('gltf-validator')
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const originalFile = '.work/toy-character/display2/character.glb'
const original = await io.read(originalFile)
const originalRaw = await io.read(
  '.work/toy-character/display2/character-raw.glb',
)
const rig = (d) =>
  d
    .getRoot()
    .listSkins()
    .map((s) => ({
      j: s.listJoints().map((j) => ({
        name: j.getName(),
        parent: j.getParentNode()?.getName(),
        matrix: j.getMatrix(),
      })),
      ib: Array.from(s.getInverseBindMatrices().getArray()),
    }))
// A triangle's non-UV corner records remain identical even when glTF splits
// additional vertices at the new UV seams or meshopt reorders triangle indices.
function surface(d, includeUV = false) {
  return d
    .getRoot()
    .listMeshes()
    .map((m) => ({
      name: d
        .getRoot()
        .listNodes()
        .find((n) => n.getMesh() === m)
        ?.getName(),
      primitives: m.listPrimitives().map((p) => {
        const semantics = p
            .listSemantics()
            .filter((s) => includeUV || !s.startsWith('TEXCOORD'))
            .sort(),
          idx = p.getIndices().getArray(),
          rows = []
        const attrs = semantics.map((s) => p.getAttribute(s))
        for (let i = 0; i < idx.length; i += 3) {
          const corners = []
          for (let k = 0; k < 3; k++) {
            const chunks = []
            for (const a of attrs) {
              const ar = a.getArray(),
                start = idx[i + k] * a.getElementSize()
              chunks.push(
                Buffer.from(
                  ar.buffer,
                  ar.byteOffset + start * ar.BYTES_PER_ELEMENT,
                  a.getElementSize() * ar.BYTES_PER_ELEMENT,
                ),
              )
            }
            corners.push(Buffer.concat(chunks).toString('base64'))
          }
          const first = corners.indexOf([...corners].sort()[0])
          rows.push(
            [...corners.slice(first), ...corners.slice(0, first)].join('|'),
          )
        }
        return {
          material: p.getMaterial().getName(),
          count: idx.length / 3,
          hash: crypto
            .createHash('sha256')
            .update(rows.sort().join('\n'))
            .digest('hex'),
        }
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
const baseSurface = surface(originalRaw),
  reports = []
for (const variant of (process.env.TEXTURE_VARIANTS ?? '0,1,2,3')
  .split(',')
  .map(Number)) {
  const dest = path.join(out, String(variant))
  fs.mkdirSync(dest, { recursive: true })
  const file = path.join(dest, 'character.glb')
  if (variant === 0) {
    fs.copyFileSync(originalFile, file)
    reports.push({ variant, bytes: fs.statSync(file).size })
    continue
  }
  const doc =
    variant === 1
      ? await io.read(originalFile)
      : await io.read(path.join(dest, 'character-raw.glb'))
  const raw = variant === 1 ? originalRaw : doc
  if (variant > 1) {
    const preserved = surface(doc)
    fs.writeFileSync(
      path.join(dest, 'surface.json'),
      JSON.stringify(
        {
          baseline: baseSurface,
          candidate: preserved,
          exact: JSON.stringify(baseSurface) === JSON.stringify(preserved),
        },
        null,
        2,
      ),
    )
    if (JSON.stringify(baseSurface) !== JSON.stringify(preserved))
      throw Error('Non-UV surface changed')
  }
  const images = []
  for (const tex of doc.getRoot().listTextures()) {
    if (variant === 1) {
      if (tex.getName() === 'source-body-0')
        tex
          .setImage(
            await sharp('.work/toy-character/img3d/out/v4-noglasses_base.png')
              .webp({ lossless: true, effort: 6 })
              .toBuffer(),
          )
          .setMimeType('image/webp')
    } else {
      const matching = original
        .getRoot()
        .listTextures()
        .find((t) => t.getName() === tex.getName())
      if (/^(body|head_face)-[23]$/.test(tex.getName()))
        tex
          .setImage(
            await sharp(tex.getImage())
              .webp({ quality: 85, effort: 6 })
              .toBuffer(),
          )
          .setMimeType('image/webp')
      else if (/orm2048$/.test(tex.getName()))
        tex
          .setImage(
            await sharp(tex.getImage())
              .webp({ quality: 40, effort: 6 })
              .toBuffer(),
          )
          .setMimeType('image/webp')
      else if (matching)
        tex.setImage(matching.getImage()).setMimeType(matching.getMimeType())
      else
        tex
          .setImage(
            await sharp(tex.getImage())
              .webp({ lossless: true, effort: 6 })
              .toBuffer(),
          )
          .setMimeType('image/webp')
    }
    const md = await sharp(tex.getImage()).metadata()
    images.push({
      name: tex.getName(),
      dimensions: [md.width, md.height],
      bytes: tex.getImage().length,
    })
  }
  doc.createExtension(EXTTextureWebP).setRequired(true)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await io.write(file, doc)
  // Restore exact original transforms instead of SDK's equivalent matrix factors.
  const b = fs.readFileSync(file),
    n = b.readUInt32LE(12),
    g = JSON.parse(b.subarray(20, 20 + n))
  const sourceFile =
      variant === 1 ? originalFile : path.join(dest, 'character-raw.glb'),
    srcBytes = fs.readFileSync(sourceFile),
    src = JSON.parse(srcBytes.subarray(20, 20 + srcBytes.readUInt32LE(12)))
  for (const node of g.nodes) {
    const s = src.nodes.find((s) => s.name === node.name)
    if (s)
      for (const k of ['translation', 'rotation', 'scale', 'matrix']) {
        delete node[k]
        if (s[k]) node[k] = s[k]
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
  if (
    variant > 1 &&
    JSON.stringify(surface(final)) !== JSON.stringify(baseSurface)
  )
    throw Error('Compressed surface changed')
  if (JSON.stringify(rig(raw)) !== JSON.stringify(rig(final)))
    throw Error('Compression changed rig')
  if (JSON.stringify(rig(originalRaw)) !== JSON.stringify(rig(final)))
    throw Error('Export changed rig')
  const validation = await validator.validateBytes(
    new Uint8Array(fs.readFileSync(file)),
    { uri: 'character.glb', maxIssues: 10000 },
  )
  fs.writeFileSync(
    path.join(dest, 'validator.json'),
    JSON.stringify(validation, null, 2),
  )
  final
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'EXT_meshopt_compression')
    ?.dispose()
  const decodedFile = path.join(dest, 'character-decoded.glb')
  await io.write(decodedFile, final)
  const decoded = await validator.validateBytes(
    new Uint8Array(fs.readFileSync(decodedFile)),
    { uri: 'character-decoded.glb', maxIssues: 10000 },
  )
  fs.writeFileSync(
    path.join(dest, 'validator-decoded.json'),
    JSON.stringify(decoded, null, 2),
  )
  if (validation.issues.numErrors || decoded.issues.numErrors)
    throw Error('Validator errors')
  const eyes = (d) => surface(d, true).filter((m) => m.name.startsWith('eye_'))
  if (JSON.stringify(eyes(originalRaw)) !== JSON.stringify(eyes(final)))
    throw Error('Eye surface or UVs changed')
  for (const name of ['eye-iris', 'eye-lids-display', 'eye-aperture-orm']) {
    const a = original
      .getRoot()
      .listTextures()
      .find((t) => t.getName() === name)
    const b = final
      .getRoot()
      .listTextures()
      .find((t) => t.getName() === name)
    if (
      !a ||
      !b ||
      !Buffer.from(a.getImage()).equals(Buffer.from(b.getImage()))
    )
      throw Error('Eye image changed')
  }
  const row = {
    variant,
    bytes: fs.statSync(file).size,
    MiB: fs.statSync(file).size / 1048576,
    errors: validation.issues.numErrors,
    decodedErrors: decoded.issues.numErrors,
    warnings: validation.issues.numWarnings,
    bones: final.getRoot().listSkins()[0].listJoints().length,
    surfaceExact: true,
    eyeUVExact: true,
    eyeImagesExact: true,
    rigExact: true,
    images,
  }
  fs.writeFileSync(
    path.join(dest, 'compression.json'),
    JSON.stringify(row, null, 2),
  )
  reports.push(row)
  console.log(row)
}
fs.writeFileSync(
  path.join(out, 'compression.json'),
  JSON.stringify(
    [
      ...(fs.existsSync(path.join(out, 'compression.json'))
        ? JSON.parse(
            fs.readFileSync(path.join(out, 'compression.json')),
          ).filter((r) => !reports.some((n) => n.variant === r.variant))
        : []),
      ...reports,
    ].sort((a, b) => a.variant - b.variant),
    null,
    2,
  ),
)
