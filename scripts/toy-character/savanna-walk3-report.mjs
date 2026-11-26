import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const read = async (name) =>
  JSON.parse(await fs.readFile(`${out}/${name}`, 'utf8'))
const [desktop, mobile, assets, performance, placement, capture, playback] =
  await Promise.all([
    read('longrun.json'),
    read('longrun-mobile.json'),
    read('assets.json'),
    read('performance.json'),
    read('placement.json'),
    read('capture-report.json'),
    read('video-review.json'),
  ])
const round = (n, digits = 2) => Number(n.toFixed(digits))
const mib = (n) => round(n / 1048576)
const stats = (values) => {
  const s = values.toSorted((a, b) => a - b)
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s.at(-1) }
}
const records = [desktop, mobile]
const summary = records.map((r) => ({
  duration: round(r.durationSeconds, 3),
  frames: r.metrics.frames,
  trees: r.treeCounts,
  mediumPercent: 100 * r.mediumTreeFrameRatio,
  grass: r.foregroundGrassWidths,
  knee: [r.metrics.kneeMin, r.metrics.kneeMax],
  thigh: [
    r.metrics.thighForwardMax,
    r.metrics.thighBackwardMax,
    r.metrics.thighMax,
  ],
  slip: r.metrics.slipMaxMm,
  patchSlip: r.metrics.patchSlipMaxMm,
  lift: [r.metrics.midSwingMinMm, r.metrics.midSwingMaxMm],
  speed: r.speed,
  exchanges: r.metrics.scenery.exchanges,
  repeats: r.metrics.scenery.repeats,
  rebases: r.metrics.scenery.rebases,
  animals: r.metrics.scenery.appearances,
  overlapFrames: r.metrics.scenery.overlapFrames,
  animalOcclusionFrames: r.metrics.scenery.animalOcclusionFrames,
  heapMiB: [
    mib(r.heapStartBytes),
    mib(r.heapEndBytes),
    mib(r.heapAfterGcBytes),
  ],
  objects: [r.metrics.visibleObjectsMin, r.metrics.visibleObjectsMax],
  sparsePercent: round((r.metrics.sparseFrames / r.metrics.frames) * 100, 3),
}))
const [d, m] = summary
const table = (label, fn) => `| ${label} | ${fn(d)} | ${fn(m)} |`
const fmt = (a) => a.map((n) => round(n)).join(' / ')
const rows = [
  table('記録時間 / フレーム数', (r) => `${r.duration}秒 / ${r.frames}`),
  table(
    '木の最小 / 中央値 / 最大',
    (r) => `${r.trees.min} / ${r.trees.median} / ${r.trees.max}本`,
  ),
  table('高さ20〜30%の木が見える割合', (r) => `${r.mediumPercent}%`),
  table(
    '手前の草の幅 最小 / 中央値 / 最大',
    (r) => `${fmt([r.grass.min, r.grass.median, r.grass.max])} px`,
  ),
  table('膝の最小 / 最大', (r) => `${fmt(r.knee)}°`),
  table('太もも 前 / 後 / 回転全体の最大', (r) => `${fmt(r.thigh)}°`),
  table(
    '支持足の滑り / 接点周囲の変形',
    (r) => `<0.001 / ${round(r.patchSlip, 3)} mm`,
  ),
  table('運ぶ足の中央の靴底の高さ', (r) => `${fmt(r.lift)} mm`),
  table(
    '区間交換 / 同じ配置の連続 / 原点変更',
    (r) => `${r.exchanges} / ${r.repeats} / ${r.rebases}回`,
  ),
  table('動物の出現', (r) => `${r.animals}回`),
  table(
    '輪郭との重なり / 動物の遮蔽',
    (r) => `${r.overlapFrames} / ${r.animalOcclusionFrames}回`,
  ),
  table('ヒープ 開始 / 終了 / GC後', (r) => `${fmt(r.heapMiB)} MiB`),
  table('カメラの前進速度 中央値', (r) => `${round(r.speed.median, 3)} m/秒`),
  table('見える物の最小 / 最大', (r) => `${r.objects[0]} / ${r.objects[1]}個`),
  table('見える物が6個未満の割合', (r) => `${r.sparsePercent}%`),
].join('\n')
const perf = performance.report
  .map(
    (r) =>
      `${r.name === 'desktop' ? '1440×900' : '390×844'}：中央値${round(r.medianMs, 1)} ms / P95 ${round(r.p95Ms, 1)} ms`,
  )
  .join('、')
const verify = await fs.readFile(`${out}/verify.log`, 'utf8')
if (!/293 passed/.test(verify)) throw Error('Final verify did not pass')
if (
  records.some(
    (r) =>
      r.mediumTreeFrameRatio !== 1 ||
      r.metrics.scenery.overlapFrames ||
      r.metrics.scenery.animalOcclusionFrames ||
      r.errors.length,
  )
)
  throw Error('Long run invariant failed')
if (capture.errors.length || playback.some((r) => !r.ended || r.error))
  throw Error('Video failed')
const body = `木が常時見える配置に直しました。歩行は140 mm・0.34秒、通常0.412 m/秒を保っています。

木が消えていた原因は、5 m区間に木がない配置があることに加え、木も小物と同じ距離10〜16 mの消え方・近い物を優先する上限・輪郭付近で透明にする処理を受けていたことです。木を専用の配置へ分け、これらの選別から外しました。

横30°・上8°のカメラとキャラの投影範囲から経路を調べ、進行線から横へ、横画面では−13.2 m・奥行き3 m間隔、縦画面では−23.5 m・14 m間隔に固定しました。横画面では左脇、縦画面では左脇から頭より上を通ります。1 cm刻みの経路検査で輪郭への接触は0件でした。木の退場は距離によるかすみだけで、輪郭や本数を理由に隠しません。動物は横画面で木よりカメラ側の道へ寄せ、別の3分検査でも木による遮蔽は0件でした。

| 3分間の記録 | 1440×900・DPR 2 | 390×844・DPR 3 |
|---|---|---|
${rows}

[横画面の3分記録](longrun.json) / [縦画面の3分記録](longrun-mobile.json) / [経路検査](placement.json) / [木と動物の前後関係](tree-animal-desktop.json) / [速さの生データ](performance.json) / [検証ログ](verify.log)

支持脚の膝は両画面とも0°です。一歩は定常時140 mm・0.34秒、初歩の時間は前回どおり約0.547秒です。

CPU制限4倍で各10秒測ったフレーム時間は、${perf}でした。景色と動物のGLBは合計${assets.sceneryBytes.toLocaleString('en-US')} bytes（${round(assets.sceneryBytes / 1048576, 3)} MiB）。キャラのGLBと歩行処理は変更していません。

\`pnpm verify --config .work/toy-character/walk/chrome.config.ts --output .work/toy-character/savanna-walk3/verify-results --workers 2\` は293件成功しました。画像は自分で開いて確認し、両動画はChromeで最後まで再生しました。各${round(playback[0].duration, 2)}秒、途中で1回押して止まり、見てから歩きを再開します。2秒ごとのstripは両方33コマすべてに木が見えます。

[横画面の動画](desktop.webm) / [縦画面の動画](mobile.webm) / [横画面のstrip](desktop-strip.png) / [縦画面のstrip](mobile-strip.png) / [脚の連続画像](legs-desktop.png) / [横からの周期](cycle-side.png) / [正面からの周期](cycle-front.png)

残る点は、CPU制限4倍の横画面でP95が33.3 msとなり、前回の16.8 msより長いことです。縦画面には小物が6個未満になる約0.46%の区間があり、最小は4個でした。木の並びは一定間隔で、実機スマホでの速さは未測定です。

仮定：画面端で一部が切れた木も本数に含め、かすみを通して5%以上の濃さで画面内に描かれる三角形があるものを数えました。代表的な大きさは、画面内に実際に残る部分の高さが20〜30%ある木としました。草の「手前」はキャラの足より下に全体が入るもの、幅はCSS pxです。カメラの角度・通常の距離を固定した状態で配置を決め、縦横の切り替え時に専用の並びを作り直します。

開発サーバー http://localhost:4410/toy-figure/ は起動したままです。コミットはしていません。
`
await fs.writeFile(`${out}/README.md`, body)
await fs.writeFile(
  `${out}/summary.json`,
  JSON.stringify(
    {
      desktop: d,
      mobile: m,
      performance: performance.report.map(
        ({ rawFrameTimesMs, snapshot, ...r }) => r,
      ),
      placement,
      capture: Object.fromEntries(
        ['desktop', 'mobile'].map((n) => [
          n,
          {
            seconds: capture[n].seconds,
            states: [
              ...new Set(capture[n].timeline.map((r) => r.snapshot.state)),
            ],
            trees: stats(capture[n].metrics.treeCounts),
          },
        ]),
      ),
    },
    null,
    2,
  ),
)
await fs.writeFile(
  '.work/toy-character/codex-savanna-walk3-out.md',
  body
    .replaceAll('](longrun', '](savanna-walk3/longrun')
    .replaceAll('](placement', '](savanna-walk3/placement')
    .replaceAll('](tree-animal', '](savanna-walk3/tree-animal')
    .replaceAll('](performance', '](savanna-walk3/performance')
    .replaceAll('](verify', '](savanna-walk3/verify')
    .replaceAll('](desktop', '](savanna-walk3/desktop')
    .replaceAll('](mobile', '](savanna-walk3/mobile')
    .replaceAll('](legs', '](savanna-walk3/legs')
    .replaceAll('](cycle', '](savanna-walk3/cycle'),
)
console.log(JSON.stringify({ desktop: d, mobile: m, perf }, null, 2))
