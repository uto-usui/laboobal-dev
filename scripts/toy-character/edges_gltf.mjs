/** Image-only variants; decoded geometry, UVs, weights and rig are checked exactly. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
const out = path.resolve(
  process.env.TOY_EDGES_OUT ?? '.work/toy-character/edges',
)
const work = path.dirname(out)
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
const hash = (a) =>
  crypto
    .createHash('sha256')
    .update(Buffer.from(a.buffer, a.byteOffset, a.byteLength))
    .digest('hex')
function signature(doc) {
  return {
    meshes: doc
      .getRoot()
      .listMeshes()
      .map((m) => ({
        name: m.getName(),
        primitives: m.listPrimitives().map((p) => ({
          material: p.getMaterial().getName(),
          indices: hash(p.getIndices().getArray()),
          attributes: Object.fromEntries(
            p
              .listSemantics()
              .map((s) => [s, hash(p.getAttribute(s).getArray())]),
          ),
        })),
      })),
    skins: doc
      .getRoot()
      .listSkins()
      .map((s) => ({
        j: s.listJoints().map((j) => ({
          name: j.getName(),
          parent: j.getParentNode()?.getName(),
          matrix: j.getMatrix(),
        })),
        ib: hash(s.getInverseBindMatrices().getArray()),
      })),
  }
}
function restoreTransforms(file, source) {
  const b = fs.readFileSync(file),
    n = b.readUInt32LE(12),
    g = JSON.parse(b.subarray(20, 20 + n))
  const a = fs.readFileSync(source),
    src = JSON.parse(a.subarray(20, 20 + a.readUInt32LE(12)))
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
}
const mode = process.env.EDGES_GLTF_PHASE ?? 'diagnose'
const reports = []
const variants =
  mode === 'diagnose'
    ? ['b-control', 'c-control', 'b-png', 'd4096', 'd-lossless']
    : ['x1', 'x2', 'x3']
for (const v of variants) {
  const atlas =
    v.startsWith('d') ||
    (mode !== 'diagnose' && process.env.EDGES_UV === 'atlas')
  const source = path.join(
    work,
    atlas ? 'texture/2/character.glb' : 'display2/character.glb',
  )
  const doc = await io.read(source),
    before = signature(doc),
    images = []
  const fixedEyeImages = new Map(
    doc
      .getRoot()
      .listTextures()
      .filter((t) => ['eye-iris', 'eye-aperture-orm'].includes(t.getName()))
      .map((t) => [t.getName(), Buffer.from(t.getImage())]),
  )
  for (const t of doc.getRoot().listTextures()) {
    let buf = t.getImage(),
      modify = false
    const body = atlas
      ? t.getName() === 'body-2'
      : t.getName() === 'source-body-0'
    if (body) {
      if (mode === 'diagnose') {
        const input =
          v === 'b-png'
            ? path.join(work, 'img3d/out/v4-noglasses_base.png')
            : v.startsWith('d')
              ? path.join(
                  work,
                  'texture',
                  v === 'd4096' ? 'body-bake4096.png' : 'body-2.png',
                )
              : path.join(work, 'display/source-body-0.png')
        let pipeline = sharp(input)
        if (v === 'c-control')
          pipeline = pipeline.resize(2048, 2048, { kernel: 'lanczos3' })
        buf = await pipeline.webp({ lossless: true, effort: 4 }).toBuffer()
      } else
        buf = await sharp(path.join(out, `body-${v}.png`))
          .jpeg({
            quality: Number(process.env.EDGES_BODY_QUALITY ?? 85),
            chromaSubsampling: '4:4:4',
            mozjpeg: true,
          })
          .toBuffer()
      modify = true
    }
    if (mode !== 'diagnose') {
      const head = atlas
        ? t.getName() === 'head_face-2'
        : t.getName() === 'source-head-2'
      if (head) {
        buf = await sharp(path.join(out, `head-${v}.png`))
          .resize(3072, 3072, { kernel: 'lanczos3' })
          .webp({ quality: 85, effort: 6 })
          .toBuffer()
        modify = true
      }
      if (t.getName() === 'eye-lids-display') {
        buf = await sharp(path.join(out, `eye-lids-${v}.png`))
          .webp({ lossless: true, effort: 6 })
          .toBuffer()
        modify = true
      }
      if (
        /orm2048$/.test(t.getName()) ||
        /^source-(body-1|head-3)$/.test(t.getName())
      ) {
        buf = await sharp(buf)
          .resize(1024, 1024, { kernel: 'lanczos3' })
          .webp({ quality: 50, effort: 6 })
          .toBuffer()
        modify = true
      }
    }
    if (modify)
      t.setImage(buf).setMimeType(
        body && mode !== 'diagnose' ? 'image/jpeg' : 'image/webp',
      )
    const md = await sharp(t.getImage()).metadata()
    images.push({
      name: t.getName(),
      mimeType: t.getMimeType(),
      chromaSubsampling: md.chromaSubsampling ?? null,
      dimensions: [md.width, md.height],
      bytes: t.getImage().length,
    })
  }
  doc.createExtension(EXTTextureWebP).setRequired(true)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const file = path.join(out, `character-${v}.glb`)
  await io.write(file, doc)
  restoreTransforms(file, source)
  const final = await io.read(file)
  if (JSON.stringify(signature(final)) !== JSON.stringify(before))
    throw Error(`Geometry / UV / weights / rig changed ${v}`)
  for (const [name, bytes] of fixedEyeImages) {
    const image = final
      .getRoot()
      .listTextures()
      .find((t) => t.getName() === name)
    if (!image || !bytes.equals(Buffer.from(image.getImage())))
      throw Error(`Eye image changed ${name}`)
  }
  const validation = await validator.validateBytes(
    new Uint8Array(fs.readFileSync(file)),
    { uri: `character-${v}.glb`, maxIssues: 10000 },
  )
  fs.writeFileSync(
    path.join(out, `validator-${v}.json`),
    JSON.stringify(validation, null, 2),
  )
  if (validation.issues.numErrors) throw Error(`Validator errors ${v}`)
  final
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'EXT_meshopt_compression')
    ?.dispose()
  const decoded = await io.writeBinary(final)
  const vd = await validator.validateBytes(decoded, {
    uri: `decoded-${v}.glb`,
    maxIssues: 10000,
  })
  fs.writeFileSync(
    path.join(out, `validator-decoded-${v}.json`),
    JSON.stringify(vd, null, 2),
  )
  if (vd.issues.numErrors) throw Error(`Decoded validator errors ${v}`)
  const report = {
    variant: v,
    source: path.relative(process.cwd(), source),
    bytes: fs.statSync(file).size,
    MiB: fs.statSync(file).size / 1048576,
    triangles: doc
      .getRoot()
      .listMeshes()
      .reduce(
        (n, m) =>
          n +
          m
            .listPrimitives()
            .reduce((a, p) => a + p.getIndices().getCount() / 3, 0),
        0,
      ),
    bones: doc.getRoot().listSkins()[0].listJoints().length,
    preservation: {
      geometry: true,
      uv: true,
      weights: true,
      rig: true,
      irisAndApertureImages: true,
    },
    errors: validation.issues.numErrors,
    decodedErrors: vd.issues.numErrors,
    warnings: validation.issues.numWarnings,
    images,
  }
  if (mode !== 'diagnose' && report.MiB > 15)
    throw Error(`15 MiB exceeded ${v} ${report.MiB}`)
  reports.push(report)
  console.log(JSON.stringify(report))
}
fs.writeFileSync(
  path.join(out, `gltf-${mode}.json`),
  `${JSON.stringify(reports, null, 2)}\n`,
)
