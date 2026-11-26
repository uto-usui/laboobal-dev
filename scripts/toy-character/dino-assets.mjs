import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
const base = '.work/toy-character/dino',
  out = 'src/demos/toy-figure/assets'
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
const names = [
  'Trex',
  'Velociraptor',
  'Triceratops',
  'Parasaurolophus',
  'Stegosaurus',
  'Apatosaurus',
  'PalmTree_1',
  'PalmTree_3',
  'Fern_1',
  'Grass_Common_Short',
  'Rock_Medium_1',
]
const rows = []
for (const name of names) {
  const file =
    name.startsWith('Fern') ||
    name.startsWith('Grass') ||
    name.startsWith('Rock')
      ? `${base}/vendor/nature/glTF/${name}.gltf`
      : `${base}/raw/${name}.glb`
  const doc = await io.read(file)
  if (
    ![
      'Trex',
      'Velociraptor',
      'Triceratops',
      'Parasaurolophus',
      'Stegosaurus',
      'Apatosaurus',
    ].includes(name)
  ) {
    for (const m of doc.getRoot().listMaterials()) {
      const c = name.startsWith('Rock')
        ? [0.32, 0.34, 0.29, 1]
        : /bark|wood|trunk|brown/i.test(m.getName())
          ? [0.27, 0.24, 0.16, 1]
          : [0.25, 0.36, 0.19, 1]
      m.setBaseColorFactor(c)
        .setBaseColorTexture(null)
        .setNormalTexture(null)
        .setOcclusionTexture(null)
        .setMetallicRoughnessTexture(null)
        .setEmissiveTexture(null)
        .setRoughnessFactor(0.95)
        .setMetallicFactor(0)
        .setDoubleSided(true)
    }
  }
  await doc.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }))
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await io.write(`${out}/${name}.glb`, doc)
  const data = await fs.readFile(`${out}/${name}.glb`)
  rows.push({
    name,
    source: file.split('/vendor/')[1] ?? `Blends/${name}.blend`,
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
    materials: doc.getRoot().listMaterials().length,
    images: doc
      .getRoot()
      .listTextures()
      .map((t) => ({ name: t.getName(), size: t.getSize() })),
    bones: doc
      .getRoot()
      .listSkins()
      .map((s) => s.listJoints().map((n) => n.getName())),
    animations: doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
    bounds: getBounds(doc.getRoot().listScenes()[0]),
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  })
}
await fs.writeFile(
  `${base}/assets.json`,
  JSON.stringify(
    { assets: rows, totalBytes: rows.reduce((n, r) => n + r.bytes, 0) },
    null,
    2,
  ),
)
console.log(
  rows.map((r) => ({
    name: r.name,
    bytes: r.bytes,
    triangles: r.triangles,
    animations: r.animations,
  })),
)
