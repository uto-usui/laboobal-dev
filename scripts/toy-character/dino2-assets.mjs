import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
const req = createRequire(
  path.resolve('.work/toy-character/savanna/tooling/package.json'),
)
const imp = (n) => import(pathToFileURL(req.resolve(n)).href)
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp(
  '@gltf-transform/extensions',
)
const { prune, dedup, reorder, getBounds } = await imp(
  '@gltf-transform/functions',
)
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer')
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const dinosaurs = [
  'Trex',
  'Velociraptor',
  'Triceratops',
  'Parasaurolophus',
  'Stegosaurus',
  'Apatosaurus',
]
const nature = [
  'PalmTree_1',
  'PalmTree_3',
  'Fern_1',
  'Bush_Common',
  'Grass_Common_Short',
  'Grass_Wispy_Short',
  'Grass_Common_Tall',
  'Rock_Medium_1',
  'Rock_Medium_2',
  'Pebble_Round_2',
]
const palettes = [
  ['#594235', '#b49a76'],
  ['#8c7956', '#c0ad87'],
  ['#865f4d', '#b99d7c'],
  ['#a58b52', '#c6b286'],
  ['#647264', '#a0a78b'],
  ['#667e88', '#a6b1ad'],
]
const quadrupedDirectory =
  process.argv[2] === '--quadrupeds-to' ? process.argv[3] : undefined
if (process.argv[2] === '--quadrupeds-to' && !quadrupedDirectory)
  throw new Error('--quadrupeds-to requires an output directory')
const previous = quadrupedDirectory
  ? undefined
  : JSON.parse(
      await fs.readFile('.work/toy-character/dino/assets.json', 'utf8'),
    )
const sourceMap = new Map(previous?.assets.map((a) => [a.name, a.source]))
const names = quadrupedDirectory
  ? ['Triceratops', 'Stegosaurus', 'Apatosaurus']
  : [...dinosaurs, ...nature]
if (quadrupedDirectory) await fs.mkdir(quadrupedDirectory, { recursive: true })
const hash = async (file) =>
  createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex')
const rows = []
for (const name of names) {
  const index = dinosaurs.indexOf(name),
    dino = index >= 0
  const file =
    dino || name.startsWith('Palm')
      ? `.work/toy-character/dino/raw/${name}.glb`
      : `.work/toy-character/dino/vendor/nature/glTF/${name}.gltf`
  const doc = await io.read(file)
  if (dino) {
    const dark = new THREE.Color(palettes[index][0]),
      light = new THREE.Color(palettes[index][1])
    const accessors = doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives().map((p) => p.getAttribute('POSITION')))
    const lo = Math.min(...accessors.map((a) => a.getMin([])[1])),
      hi = Math.max(...accessors.map((a) => a.getMax([])[1]))
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) {
        const m = p.getMaterial(),
          n = m.getName(),
          pos = p.getAttribute('POSITION'),
          normal = p.getAttribute('NORMAL')
        const colors = new Float32Array(pos.getCount() * 3),
          v = [],
          norm = []
        let accent = null
        if (/Black/.test(n)) accent = '#252c29'
        if (name === 'Apatosaurus' && n === 'Material') accent = '#abb5b0'
        if (name === 'Trex' && /Red/.test(n)) accent = '#79544b'
        if (name === 'Trex' && /LightYellow/.test(n)) accent = '#c9bea3'
        if (name === 'Triceratops' && n === 'LightBrown') accent = '#c2b59a'
        if (name === 'Parasaurolophus' && n === 'Red') accent = '#674d39'
        if (name === 'Stegosaurus' && n === 'Brown') accent = '#885849'
        if (name === 'Stegosaurus' && n === 'LightBrown') accent = '#b2a78a'
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v)
          normal?.getElement(i, norm)
          const y = (v[1] - lo) / (hi - lo)
          let t = Math.max(
            0,
            Math.min(1, (0.67 - y) * 1.5 + (norm[1] < -0.25 ? 0.23 : 0)),
          )
          if (/LightGreen|LightBrown/.test(n) && !accent) t = Math.max(0.6, t)
          const c = accent
            ? new THREE.Color(accent)
            : dark.clone().lerp(light, t)
          if (
            name === 'Velociraptor' &&
            !accent &&
            Math.sin(v[2] * 2.7 + v[1] * 0.8) > 0.65 &&
            y > 0.33
          )
            c.multiplyScalar(0.64)
          c.toArray(colors, i * 3)
        }
        p.setAttribute(
          'COLOR_0',
          doc
            .createAccessor()
            .setType('VEC3')
            .setArray(colors)
            .setBuffer(pos.getBuffer()),
        )
        m.setBaseColorFactor([1, 1, 1, 1])
          .setRoughnessFactor(0.95)
          .setMetallicFactor(0)
      }
  } else
    for (const m of doc.getRoot().listMaterials()) {
      const color = /Rock|Pebble/.test(name)
        ? '#777b6d'
        : /bark|wood|trunk|brown/i.test(m.getName())
          ? '#6d6146'
          : name.startsWith('Grass')
            ? '#6d8050'
            : '#526d42'
      m.setBaseColorFactor([...new THREE.Color(color).toArray(), 1])
        .setBaseColorTexture(null)
        .setNormalTexture(null)
        .setOcclusionTexture(null)
        .setMetallicRoughnessTexture(null)
        .setEmissiveTexture(null)
        .setRoughnessFactor(0.96)
        .setMetallicFactor(0)
        .setDoubleSided(true)
    }
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const colors = p.getAttribute('COLOR_0')
      if (colors)
        colors
          .setArray(
            Uint8Array.from(colors.getArray(), (v) =>
              Math.round(Math.min(1, Math.max(0, v)) * 255),
            ),
          )
          .setNormalized(true)
    }
  await doc.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }))
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const dest = path.join(
    quadrupedDirectory ?? 'src/demos/toy-figure/assets',
    `${name}.glb`,
  )
  await io.write(dest, doc)
  if (quadrupedDirectory) continue
  rows.push({
    name,
    source: sourceMap.get(name) ?? file.split('/vendor/')[1],
    input: file,
    inputSha256: await hash(file),
    sourceSha256: await hash(
      `.work/toy-character/dino/vendor/${sourceMap.get(name) ?? file.split('/vendor/')[1]}`,
    ),
    sha256: await hash(dest),
    images: doc.getRoot().listTextures().length,
    boneCount: doc
      .getRoot()
      .listSkins()
      .reduce((n, s) => n + s.listJoints().length, 0),
    bytes: (await fs.stat(dest)).size,
    bounds: getBounds(doc.getRoot().listScenes()[0]),
    materials: doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getName()),
    triangles: doc
      .getRoot()
      .listMeshes()
      .reduce(
        (n, m) =>
          n +
          m
            .listPrimitives()
            .reduce(
              (n, p) =>
                n +
                (p.getIndices()?.getCount() ??
                  p.getAttribute('POSITION').getCount()) /
                  3,
              0,
            ),
        0,
      ),
    animations: doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  })
}
if (quadrupedDirectory) process.exit(0)
const bytes = {
  character: (await fs.stat('src/demos/toy-figure/assets/character.glb')).size,
  ...Object.fromEntries(rows.map((r) => [r.name, r.bytes])),
}
await fs.writeFile(
  'src/demos/toy-figure/asset-bytes.json',
  `${JSON.stringify(bytes, null, 2)}\n`,
)
let measured = []
try {
  measured = JSON.parse(
    await fs.readFile('.work/toy-character/dino2/assets.json', 'utf8'),
  ).assets
} catch {}
for (const row of rows) {
  const before = measured.find((a) => a.name === row.name)
  if (before?.bodyLengthM)
    Object.assign(row, {
      bodyLengthM: before.bodyLengthM,
      walkPoseHeightM: before.walkPoseHeightM,
    })
}
const unchanged = {}
for (const [name, file] of [
  ['character.glb', 'src/demos/toy-figure/assets/character.glb'],
  ['walk.ts', 'src/demos/toy-figure/walk.ts'],
]) {
  const sha256 = await hash(file)
  unchanged[name] = {
    sha256,
    matchesDinoRecord: sha256 === previous.unchanged[name].sha256,
  }
}
await fs.writeFile(
  '.work/toy-character/dino2/assets.json',
  JSON.stringify(
    {
      assets: rows,
      totalBytes: rows.reduce((n, r) => n + r.bytes, 0),
      unchanged,
      plantHeightsM: {
        PalmTree_1: [6.3, 7.7],
        PalmTree_3: [7.65, 9.35],
        Fern_1: [0.48, 1.2],
        foregroundFern: 0.55,
        Bush_Common: [0.54, 1.35],
        Grass_Common_Short: [0.224, 0.4],
        Grass_Wispy_Short: [0.21, 0.375],
        Grass_Common_Tall: [0.28, 0.5],
        Rock_Medium_1: [0.14, 0.245],
        Rock_Medium_2: [0.33, 0.825],
        Pebble_Round_2: [0.084, 0.21],
      },
    },
    null,
    2,
  ),
)
console.log(
  rows.map((r) => [r.name, r.bytes]),
  'total',
  rows.reduce((n, r) => n + r.bytes, 0),
)
