import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const out = '.work/toy-character/savanna'
const req = createRequire(path.resolve(out, 'tooling/package.json')),
  imp = (n) => import(pathToFileURL(req.resolve(n)).href)
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
const manifest = JSON.parse(await fs.readFile(`${out}/assets.json`)),
  capture = JSON.parse(await fs.readFile(`${out}/capture-report.json`))
const bundles = {}
for (const variant of ['S', 'D']) {
  const placements = capture.shots.find(
    (s) => s.variant === variant && s.name === 'desktop',
  ).placements
  const doc = new Document(),
    scene = doc.createScene(`savanna-${variant}`),
    templates = new Map(),
    animals = []
  for (const id of new Set(placements.map((p) => p.id))) {
    const a = manifest.assets.find((a) => a.id === id)
    if (a.bones) {
      const file = `${id}-${variant}.glb`
      await fs.copyFile(`${out}/${a.variants[variant].file}`, `${out}/${file}`)
      const decoded = await io.read(`${out}/${file}`)
      if (
        decoded.getRoot().listAnimations().length !== 4 ||
        decoded.getRoot().listSkins()[0].listJoints().length !== 16
      )
        throw Error('Rig lost')
      animals.push({
        id,
        file,
        bytes: (await fs.stat(`${out}/${file}`)).size,
        triangles: a.triangles,
        bones: a.bones,
        animations: decoded
          .getRoot()
          .listAnimations()
          .map((a) => a.getName()),
      })
      continue
    }
    const source = await io.read(`${out}/${a.variants[variant].file}`),
      map = mergeDocuments(doc, source)
    templates.set(
      id,
      source
        .getRoot()
        .listScenes()[0]
        .listChildren()
        .map((n) => map.get(n)),
    )
    for (const s of source.getRoot().listScenes()) map.get(s).dispose()
  }
  const clone = (n) => {
    const c = doc
      .createNode(n.getName())
      .setMatrix(n.getMatrix())
      .setMesh(n.getMesh())
    for (const child of n.listChildren()) c.addChild(clone(child))
    return c
  }
  for (const [i, p] of placements.entries()) {
    if (!templates.has(p.id)) continue
    const g = doc
      .createNode(`${p.id}-${i}`)
      .setTranslation(p.position)
      .setScale(p.scale)
      .setRotation([0, Math.sin(p.rotationY / 2), 0, Math.cos(p.rotationY / 2)])
    for (const t of templates.get(p.id)) g.addChild(clone(t))
    scene.addChild(g)
  }
  for (const ns of templates.values()) for (const n of ns) n.dispose()
  // The ground is the one permitted newly made mesh, shared with the page's flat plane.
  const buffer = doc.createBuffer('ground')
  const positions = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(
      new Float32Array([
        -100, 0.055, -100, -100, 0.055, 100, 100, 0.055, 100, 100, 0.055, -100,
      ]),
    )
    .setBuffer(buffer)
  const normals = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]))
    .setBuffer(buffer)
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer)
  const color = manifest.palettes[variant][0]
    .slice(1)
    .match(/../g)
    .map((s) => {
      const n = parseInt(s, 16) / 255
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
    })
  const material = doc
    .createMaterial('ground-matte')
    .setBaseColorFactor([...color, 1])
    .setRoughnessFactor(0.95)
    .setMetallicFactor(0)
  scene.addChild(
    doc
      .createNode('ground')
      .setMesh(
        doc
          .createMesh('ground')
          .addPrimitive(
            doc
              .createPrimitive()
              .setAttribute('POSITION', positions)
              .setAttribute('NORMAL', normals)
              .setIndices(indices)
              .setMaterial(material),
          ),
      ),
  )
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
  const file = `savanna-${variant}.glb`
  await io.write(`${out}/${file}`, doc)
  const decoded = await io.read(`${out}/${file}`)
  const count = (n) =>
    (n
      .getMesh()
      ?.listPrimitives()
      .reduce((s, p) => s + p.getIndices().getCount() / 3, 0) ?? 0) +
    n.listChildren().reduce((s, n) => s + count(n), 0)
  const expected =
    2 +
    placements
      .filter((p) => templates.has(p.id))
      .reduce(
        (s, p) => s + manifest.assets.find((a) => a.id === p.id).triangles,
        0,
      )
  const actual = decoded
    .getRoot()
    .listScenes()[0]
    .listChildren()
    .reduce((s, n) => s + count(n), 0)
  if (actual !== expected) throw Error('Triangle count changed')
  const bytes = (await fs.stat(`${out}/${file}`)).size
  bundles[variant] = {
    file,
    bytes,
    triangles: actual,
    materials: decoded.getRoot().listMaterials().length,
    animals,
    totalBytes: bytes + animals.reduce((s, a) => s + a.bytes, 0),
    targetBytes: 2097152,
  }
}
manifest.bundles = bundles
await fs.writeFile(
  `${out}/assets.json`,
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(bundles, null, 2))
