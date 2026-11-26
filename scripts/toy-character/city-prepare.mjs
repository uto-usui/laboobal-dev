import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const out = '.work/toy-character/city'
const req = createRequire(path.resolve(out, 'tooling/package.json'))
const imp = (name) => import(pathToFileURL(req.resolve(name)).href)
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp(
  '@gltf-transform/extensions',
)
const { dedup, prune, weld, unweld, reorder, getBounds, cloneDocument } =
  await imp('@gltf-transform/functions')
const { MeshoptEncoder, MeshoptDecoder } = await imp('meshoptimizer')
const sharp = req('sharp')
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const selection = {
  suburban: [
    'building-type-a',
    'building-type-b',
    'building-type-c',
    'building-type-e',
    'tree-small',
    'tree-large',
    'fence-low',
  ],
  commercial: ['building-e', 'building-a', 'detail-awning'],
  roads: ['road-straight', 'road-bend-sidewalk', 'tile-high', 'light-curved'],
}
const palette = [
  '#e6ddcb',
  '#b6afa3',
  '#779a93',
  '#c28f7c',
  '#758481',
  '#5d6969',
  '#a2ae8c',
  '#b2a28b',
]
// Each source texel belongs to one of eight shared matte paint colors.
function paint([r, g, b]) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  if (g > r * 1.08 && g > b * 1.04) return 2
  if (min > 180) return 0
  if (max < 90) return 5
  if (b > r * 1.45 && b >= g * 1.15) return 4
  if (r > g * 1.18 && r > b * 1.15) return 3
  if (r > b * 1.2 && g > b * 1.12) return max > 200 ? 0 : 7
  return max < 145 ? 4 : 1
}
await fs.mkdir(`${out}/models`, { recursive: true })
const assets = []
for (const [kit, names] of Object.entries(selection)) {
  for (const name of names) {
    const source = `${out}/vendor/${kit}/Models/GLB format/${name}.glb`
    const doc = await io.read(source)
    const bounds = getBounds(doc.getRoot().listScenes()[0])
    const images = []
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage(),
        md = await sharp(image).metadata()
      images.push({
        name: texture.getName(),
        bytes: image.length,
        width: md.width,
        height: md.height,
        mimeType: texture.getMimeType(),
      })
    }
    const triangles = doc
      .getRoot()
      .listMeshes()
      .reduce(
        (sum, m) =>
          sum +
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
      )
    const row = {
      id: `${kit}/${name}`,
      kit,
      name,
      source,
      sourceUrl: `https://kenney.nl/assets/city-kit-${kit}`,
      license: 'CC0-1.0',
      licenseFile: `vendor/${kit}/License.txt`,
      triangles,
      materials: doc.getRoot().listMaterials().length,
      images,
      sourceGlbBytes: (await fs.stat(source)).size,
      externalImageBytes: images.reduce((s, i) => s + i.bytes, 0),
      bounds,
      dimensions: bounds.max.map((v, i) => v - bounds.min[i]),
      variants: {},
    }
    for (const variant of ['A', 'B']) {
      const d = cloneDocument(doc)
      if (variant === 'B') {
        await d.transform(unweld())
        const colors = palette.flatMap((h) => [
          parseInt(h.slice(1, 3), 16),
          parseInt(h.slice(3, 5), 16),
          parseInt(h.slice(5, 7), 16),
          255,
        ])
        const atlas = d
          .createTexture('shared-eight-paints')
          .setImage(
            await sharp(Buffer.from(colors), {
              raw: { width: 8, height: 1, channels: 4 },
            })
              .png()
              .toBuffer(),
          )
          .setMimeType('image/png')
        const material = d
          .createMaterial('city-matte-eight-paints')
          .setBaseColorTexture(atlas)
          .setRoughnessFactor(0.95)
          .setMetallicFactor(0)
          .setDoubleSided(true)
        material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728)
        for (const mesh of d.getRoot().listMeshes())
          for (const prim of mesh.listPrimitives()) {
            const texture = prim.getMaterial().getBaseColorTexture()
            const { data, info } = await sharp(texture.getImage())
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })
            const uv = prim.getAttribute('TEXCOORD_0').clone()
            for (let i = 0; i < uv.getCount(); i += 3) {
              const vs = [0, 1, 2].map((k) => uv.getElement(i + k, []))
              const v = [0, 1].map(
                (axis) => vs.reduce((s, p) => s + p[axis], 0) / 3,
              )
              const x = Math.min(
                info.width - 1,
                Math.max(0, Math.floor(v[0] * info.width)),
              )
              // Kenney stores a vertical baked gradient inside each quarter-height
              // swatch. Sample its middle so one wall does not turn into patches.
              const swatchV = (Math.floor(v[1] * 4) + 0.5) / 4
              const y = Math.min(
                info.height - 1,
                Math.max(0, Math.floor(swatchV * info.height)),
              )
              const k = (y * info.width + x) * 4
              for (let j = 0; j < 3; j++)
                uv.setElement(i + j, [
                  (paint(data.subarray(k, k + 3)) + 0.5) / 8,
                  0.5,
                ])
            }
            prim.setAttribute('TEXCOORD_0', uv).setMaterial(material)
          }
      }
      await d.transform(
        prune(),
        dedup(),
        weld(),
        reorder({ encoder: MeshoptEncoder }),
      )
      d.createExtension(EXTMeshoptCompression)
        .setRequired(true)
        .setEncoderOptions({
          method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
        })
      const file = `models/${kit}-${name}-${variant}.glb`
      await io.write(`${out}/${file}`, d)
      const decoded = await io.read(`${out}/${file}`)
      const actualTriangles = decoded
        .getRoot()
        .listMeshes()
        .reduce(
          (s, m) =>
            s +
            m
              .listPrimitives()
              .reduce((n, p) => n + p.getIndices().getCount() / 3, 0),
          0,
        )
      if (actualTriangles !== triangles)
        throw Error('Topology count changed: ' + name)
      row.variants[variant] = {
        file,
        meshoptBytes: (await fs.stat(`${out}/${file}`)).size,
        decodedTriangles: actualTriangles,
      }
    }
    assets.push(row)
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  source: 'Official Kenney archives; originals unchanged in vendor/',
  sources: JSON.parse(await fs.readFile(`${out}/vendor/sources.json`)),
  palette,
  units: 'Kenney model units; dimensions before scene scaling',
  assets,
  budget: {
    targetBytes: 2 * 1024 * 1024,
    excludes:
      'Character, JS, original vendor archives; one network fetch per unique selected model',
    A: assets.reduce((s, a) => s + a.variants.A.meshoptBytes, 0),
    B: assets.reduce((s, a) => s + a.variants.B.meshoptBytes, 0),
  },
}
await fs.writeFile(`${out}/assets.json`, JSON.stringify(report, null, 2) + '\n')
// Run the current walker only during setup, then freeze one valid contact pose.
const walkSource = await fs.readFile('src/demos/toy-figure/walk.ts', 'utf8')
await fs.writeFile(
  `${out}/walk-snapshot.js`,
  ts.transpileModule(walkSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText,
)
console.log(
  JSON.stringify(
    {
      assets: assets.map((a) => ({
        id: a.id,
        tris: a.triangles,
        size: a.dimensions,
      })),
      budget: report.budget,
    },
    null,
    2,
  ),
)
