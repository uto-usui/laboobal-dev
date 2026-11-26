import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const out = '.work/toy-character/savanna'
const req = createRequire(path.resolve(out, 'tooling/package.json'))
const imp = (n) => import(pathToFileURL(req.resolve(n)).href)
const { NodeIO } = await imp('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await imp(
  '@gltf-transform/extensions',
)
const { prune, dedup, reorder, getBounds, cloneDocument } = await imp(
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
const palettes = {
  S: [
    '#c9b78b',
    '#a99769',
    '#8e966d',
    '#83745d',
    '#b6a58e',
    '#777565',
    '#e0d1af',
    '#b6c1bf',
  ],
  D: [
    '#d9c39e',
    '#c8ad80',
    '#a0a181',
    '#96816a',
    '#bb9c80',
    '#8f8576',
    '#e5d5b7',
    '#bdc7c7',
  ],
}
const selection = [
  ['tree_plateau', 'nature'],
  ['grass_large', 'nature'],
  ['rock_largeA', 'nature'],
  ['rock_smallC', 'nature'],
  ['cactus_tall', 'nature'],
  ['cactus_short', 'nature'],
  ['Zebra', 'animals'],
  ['Elephant', 'animals'],
]
await fs.mkdir(`${out}/models`, { recursive: true })
const assets = []
for (const [name, kit] of selection) {
  const source =
    kit === 'nature'
      ? `vendor/nature/Models/GLTF format/${name}.glb`
      : `vendor/gobkit-animal006-pack/${name}.glb`
  const doc = await io.read(`${out}/${source}`),
    root = doc.getRoot()
  const triangles = root
    .listMeshes()
    .reduce(
      (s, m) =>
        s +
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
  const images = await Promise.all(
    root.listTextures().map(async (t) => {
      const b = t.getImage(),
        m = await sharp(b).metadata()
      return {
        name: t.getName(),
        width: m.width,
        height: m.height,
        bytes: b.length,
        mimeType: t.getMimeType(),
      }
    }),
  )
  const row = {
    id: name,
    kit,
    source,
    sourceSha256: crypto
      .createHash('sha256')
      .update(await fs.readFile(`${out}/${source}`))
      .digest('hex'),
    sourceUrl:
      kit === 'nature'
        ? 'https://kenney.nl/assets/nature-kit'
        : 'https://gobkit.com/freebies',
    author: kit === 'nature' ? 'Kenney' : 'Gobkit',
    license: 'CC0-1.0',
    licenseFile:
      kit === 'nature'
        ? 'vendor/nature/License.txt'
        : 'vendor/gobkit-animal006-pack/LICENSE.txt',
    triangles,
    materials: root.listMaterials().length,
    images,
    bones: new Set(root.listSkins().flatMap((s) => s.listJoints())).size,
    animations: root.listAnimations().map((a) => ({
      name: a.getName(),
      channels: a.listChannels().length,
      durationSeconds: Math.max(
        ...a.listSamplers().map((s) => Math.max(...s.getInput().getArray())),
      ),
    })),
    sourceGlbBytes: (await fs.stat(`${out}/${source}`)).size,
    bounds: getBounds(root.listScenes()[0]),
    variants: {},
  }
  for (const variant of ['S', 'D']) {
    const d = cloneDocument(doc)
    const pixels = palettes[variant].flatMap((h) => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
      255,
    ])
    const atlas = d
      .createTexture('eight-matte-paints')
      .setImage(
        await sharp(Buffer.from(pixels), {
          raw: { width: 8, height: 1, channels: 4 },
        })
          .png()
          .toBuffer(),
      )
      .setMimeType('image/png')
    const mat = d
      .createMaterial('landscape-matte')
      .setBaseColorTexture(atlas)
      .setRoughnessFactor(0.95)
      .setMetallicFactor(0)
      .setDoubleSided(true)
    mat.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728)
    for (const m of d.getRoot().listMeshes())
      for (const p of m.listPrimitives()) {
        const old = p.getMaterial(),
          tex = old?.getBaseColorTexture(),
          color = old?.getBaseColorFactor() ?? [0.5, 0.5, 0.5, 1]
        const image = tex
          ? await sharp(tex.getImage())
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })
          : null
        const oldUV = p.getAttribute('TEXCOORD_0')
        const uv = d
          .createAccessor()
          .setType('VEC2')
          .setArray(new Float32Array(p.getAttribute('POSITION').getCount() * 2))
          .setBuffer(p.getAttribute('POSITION').getBuffer())
        for (let i = 0; i < uv.getCount(); i++) {
          let rgb = color.slice(0, 3).map((v) => v * 255)
          if (image && oldUV) {
            const v = oldUV.getElement(i, [])
            const x = Math.max(
              0,
              Math.min(
                image.info.width - 1,
                Math.floor(v[0] * image.info.width),
              ),
            )
            const y = Math.max(
              0,
              Math.min(
                image.info.height - 1,
                Math.floor(v[1] * image.info.height),
              ),
            )
            rgb = Array.from(
              image.data.subarray(
                (y * image.info.width + x) * 4,
                (y * image.info.width + x) * 4 + 3,
              ),
            )
          }
          const [r, g, b] = rgb
          let k = name.startsWith('rock')
            ? 4
            : name.startsWith('grass')
              ? 1
              : name.startsWith('cactus')
                ? 2
                : name === 'Elephant'
                  ? 5
                  : name === 'Zebra'
                    ? r + g + b > 420
                      ? 6
                      : 5
                    : g > r * 1.05
                      ? 2
                      : 3
          uv.setElement(i, [(k + 0.5) / 8, 0.5])
        }
        p.setAttribute('TEXCOORD_0', uv).setMaterial(mat)
        // Baked unlit color and normals are replaced by the same lit matte paint.
        p.setAttribute('COLOR_0', null)
      }
    for (const e of d.getRoot().listExtensionsUsed())
      if (e.extensionName === 'KHR_materials_unlit') e.dispose()
    await d.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }))
    d.createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({
        method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
      })
    const file = `models/${name}-${variant}.glb`
    await io.write(`${out}/${file}`, d)
    const decoded = await io.read(`${out}/${file}`)
    const actual = decoded
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
    if (actual !== triangles) throw Error('Triangle count changed: ' + name)
    row.variants[variant] = {
      file,
      meshoptBytes: (await fs.stat(`${out}/${file}`)).size,
      bones: new Set(
        decoded
          .getRoot()
          .listSkins()
          .flatMap((s) => s.listJoints()),
      ).size,
      animations: decoded
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
      materials: decoded.getRoot().listMaterials().length,
      images: [{ width: 8, height: 1 }],
    }
  }
  assets.push(row)
}
await fs.writeFile(
  `${out}/assets.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sources: JSON.parse(await fs.readFile(`${out}/vendor/sources.json`)),
      palettes,
      assets,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify(
    assets.map((a) => ({
      id: a.id,
      tris: a.triangles,
      bones: a.bones,
      animations: a.animations.map((a) => a.name),
      bounds: a.bounds,
      images: a.images,
    })),
    null,
    2,
  ),
)
