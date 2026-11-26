import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const out = '.work/toy-character/city'
const req = createRequire(path.resolve(out, 'tooling/package.json'))
const imp = (n) => import(pathToFileURL(req.resolve(n)).href)
const { Document, NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp(
  '@gltf-transform/extensions',
)
const { mergeDocuments, prune, dedup, unpartition, reorder } = await imp(
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
const assets = JSON.parse(await fs.readFile(`${out}/assets.json`))
const capture = JSON.parse(await fs.readFile(`${out}/capture-report.json`))
const placements = capture.shots.find(
  (s) => s.variant === 'B' && s.name === 'desktop',
).placements
const bundled = {}
for (const variant of ['A', 'B']) {
  const doc = new Document(),
    scene = doc.createScene(`city-${variant}`),
    templates = new Map()
  for (const asset of assets.assets) {
    const source = await io.read(`${out}/${asset.variants[variant].file}`)
    const map = mergeDocuments(doc, source)
    const template = source
      .getRoot()
      .listScenes()[0]
      .listChildren()
      .map((n) => map.get(n))
    templates.set(asset.id, template)
    for (const s of source.getRoot().listScenes()) map.get(s).dispose()
  }
  const cloneTree = (node) => {
    const copy = doc
      .createNode(node.getName())
      .setMatrix(node.getMatrix())
      .setMesh(node.getMesh())
    for (const child of node.listChildren()) copy.addChild(cloneTree(child))
    return copy
  }
  for (const [i, p] of placements.entries()) {
    const q = [0, Math.sin(p.rotationY / 2), 0, Math.cos(p.rotationY / 2)]
    const group = doc
      .createNode(`${p.id}-${i}`)
      .setTranslation(p.position)
      .setScale(p.scale)
      .setRotation(q)
    for (const template of templates.get(p.id))
      group.addChild(cloneTree(template))
    scene.addChild(group)
  }
  for (const nodes of templates.values()) for (const n of nodes) n.dispose()
  await doc.transform(
    prune(),
    dedup(),
    unpartition(),
    reorder({ encoder: MeshoptEncoder }),
  )
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const file = `city-${variant}.glb`
  await io.write(`${out}/${file}`, doc)
  const decoded = await io.read(`${out}/${file}`)
  const expectedTriangles = placements.reduce(
    (s, p) => s + assets.assets.find((a) => a.id === p.id).triangles,
    0,
  )
  const count = (node) =>
    (node
      .getMesh()
      ?.listPrimitives()
      .reduce((s, p) => s + p.getIndices().getCount() / 3, 0) ?? 0) +
    node.listChildren().reduce((s, n) => s + count(n), 0)
  const triangles = decoded
    .getRoot()
    .listScenes()[0]
    .listChildren()
    .reduce((s, n) => s + count(n), 0)
  if (triangles !== expectedTriangles)
    throw Error('Bundled scene triangle count mismatch')
  bundled[variant] = {
    file,
    bytes: (await fs.stat(`${out}/${file}`)).size,
    instances: placements.length,
    sceneTriangles: triangles,
    uniqueMaterials: decoded.getRoot().listMaterials().length,
    images: decoded.getRoot().listTextures().length,
    roundTripTriangleCount: true,
  }
}
assets.budget.bundled = bundled
assets.budget.scope =
  'Complete static imported city, with shared geometry and deduplicated images; excludes character, JS, flat ground and shadow receiver'
assets.budget.conservativeAllowanceBytes = 1024
assets.budget.eightSectionsBConservativeBytes = bundled.B.bytes * 8 + 1024
await fs.writeFile(`${out}/assets.json`, JSON.stringify(assets, null, 2) + '\n')
console.log(JSON.stringify(assets.budget, null, 2))
