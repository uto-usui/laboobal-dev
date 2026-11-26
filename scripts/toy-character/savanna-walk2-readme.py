from pathlib import Path
import json
out = Path('.work/toy-character/savanna-walk2')
s = json.loads((out / 'summary.json').read_text())
v = json.loads((out / 'capture-report.json').read_text())
a = json.loads((out / 'assets.json').read_text())
perf = '\n'.join(f"| {r['name']} | {r['medianMs']:.1f} ms | {r['p95Ms']:.1f} ms | {r['samples']} |" for r in s['performance'])
density = '\n'.join(f"- {name}: 最小{v[name]['metrics']['visibleObjectsMin']}個、最大{v[name]['metrics']['visibleObjectsMax']}個。6個未満は{v[name]['metrics']['sparseFrames']}/{v[name]['metrics']['frames']}フレーム（{v[name]['metrics']['sparseFrames']/v[name]['metrics']['frames']*100:.2f}%）、12個超は0フレーム。" for name in ['desktop','mobile'])
text = f'''# サバンナの歩幅と景色の修正

一歩を140 mm・0.34秒へ戻した。通常の前進は140/0.34 = 0.411765 m/秒。キャラのGLBと関節の上限は変えていない。開発サーバーは http://localhost:4410/toy-figure/ のまま動かしている。コミットはしていない。

## 80 mmに縮めた原因

脚は左293.085 mm、右292.278 mmあり、前後70 mmの接地なら太ももの上限には余裕がある。旧版は最初の歩へ支持足の前方へのずれを含めて112.631 mm進んでいたが、連続歩行版は一律70 mmになった。靴底を床へ合わせるために前後の着地位置を探していたことも重なり、左右の着地位置が偏っていた。140 mmへ戻しただけでは太ももが25°で止まり、支持足の接地を守る体の補正で、通常の前進速度が一時−0.152 m/秒になった。80 mmはそれを避ける回避策だった。

着地を股関節の70 mm前に固定し、左右の靴底の変形差を腰の傾きで合わせた。足の運びには歩の始まりと終わりの腰の傾きを使う。最初は支持足の前方へのずれも含めて加速し、通常の速度へつなぐ。接地点はスキニング後の靴底の同じ頂点を固定する。関節の上限は25°のままなので、上限を上げたポーズの追加はしていない。

[原因の再現記録](diagnosis.md)と[全コマの値](diagnosis-frames.json)。旧版も実測最大は25°で、全コマ25°未満という前提は記録とは一致しなかった。

## 景色

手前と中景へ低い草、小石、茂みを置き、地面へ淡い色むらの平面を足した。木・岩・倒木も中景で大きく見える距離へ置く。6通りの区間と13本の使い回し、16 mごとの原点の付け替えは残した。

頭・胴体・脚を覆う範囲と景色のモデルを画面へ投影し、輪郭へ接する前から薄くする。動物の全身にも同じ余白を空ける。物が多い場合は遠い物や画面端の物から薄くし、12個を超えないようにする。優先度も滑らかに変える。新しい区間は遠方か画面の外で作り、薄い状態から入れる。

動物は全身の投影範囲とキャラとの間隔で折り返す。縦長では左の余白を使い、シマウマとゾウの全身を画面内へ入れる。進む量は引き続き支持する蹄の変位に合わせる。

## 3分の記録

ChromeのGPUで{ s['durationSeconds']:.3f}秒、{s['frames']:,}フレーム。途中で押さず、歩き続ける状態を毎フレーム計測した。

| 項目 | 値 |
| --- | --- |
| 一歩 | 140 mm・0.34秒 |
| 膝 | {s['kneeDegrees'][0]:.2f}〜{s['kneeDegrees'][1]:.2f}°、支持脚最大{s['supportKneeMax']:.2f}° |
| 太もも | 前{s['thighForwardMax']:.2f}°、後{s['thighBackwardMax']:.2f}°、回転全体の最大{s['thighRotationMax']:.2f}° |
| 靴底の高さ | 最大{s['soleMaxMm']:.2f} mm、歩の中央{s['midSwingMm'][0]:.2f}〜{s['midSwingMm'][1]:.2f} mm |
| 通常の前進 | {s['speedMps']['min']:.9f}〜{s['speedMps']['max']:.9f} m/秒 |
| 支持足の滑り | 接地点0.001 mm未満、周囲の靴底の変形最大{s['nearContactDeformationMaxMm']:.3f} mm |
| 区間交換／同じ配置の連続 | {s['segmentExchanges']}回／{s['repeatedLayouts']}回 |
| 原点の付け替え／動物の出現 | {s['rebases']}回／{s['animalAppearances']}回 |
| 頭・体と物の重なり／動物が物に隠れたフレーム | {s['headAndBodyOverlapFrames']}／{s['animalOcclusionFrames']} |
| JSヒープ | {s['heapMiB'][0]:.2f} → {s['heapMiB'][1]:.2f} MiB、終了後GCで{s['heapMiB'][2]:.2f} MiB |
| カメラの1フレームの変位 | 中央値{s['camera']['median']*1000:.3f} mm、最大{s['camera']['max']*1000:.3f} mm、比{s['cameraMaxToMedian']:.3f}倍 |

区間交換・原点変更時の速度も{s['seamSpeed']['min']:.9f}〜{s['seamSpeed']['max']:.9f} m/秒。[生の記録](longrun.json)と[まとめ](summary.json)。

## 速度と大きさ

CPUを4倍制限して10秒ずつ測定。1440×900・DPR 2（2880×1800バッファ）、390×844・DPR 3（1170×2532バッファ）。GPUはApple M5 MaxのMetal。ほかのブラウザの検証を終えてから単独で測定した。

| 画面 | 中央値 | P95 | 標本数 |
| --- | --- | --- | --- |
{perf}

景色・動物のGLBは8本、合計{s['glbBytes']:,} bytes（{s['glbBytes']/1048576:.3f} MiB）。2 MiB以内。キャラのSHA-256は作業前後で一致: `{a['characterSha256']}`。

`pnpm verify --config .work/toy-character/walk/chrome.config.ts --output .work/toy-character/savanna-walk2/verify-results` は293件成功。[ログ](verify.log)。動きを減らす設定、押した反応、動物を押した注視、再開、画面外・タブ非表示での停止、タッチでの縦スクロールも成功した。タブ非表示だけは既存と同じvisibilitychangeの模擬で確認した。

## 画像と動画

両動画は66秒。途中で1回押して止まり、見てから歩き直す。動画をChromeで再生し、全体の2秒ごとのコマと静止画も開いて確認した。[再生の記録](video-review.json)。

- [横長動画](desktop.webm)・[2秒ごとのコマ](desktop-strip.png)
- [縦長動画](mobile.webm)・[2秒ごとのコマ](mobile-strip.png)
- [腰から下の連続画像](legs-desktop.png)・[値](legs.json)
- [横の8コマ](cycle-side.png)・[前の8コマ](cycle-front.png)
- [縦長のシマウマ](animal-mobile-zebra.png)・[ゾウ](animal-mobile-elephant.png)
- [動きを減らした状態](reduced.png)・[押した反応](reduced-look.png)

## 残る点と仮定

6〜12個は定常時の目安とし、物が薄く出入りする間は下回ることを許容した。地面の色むらは地面の一部として、物の数から除いた。3分の記録では最小{s['visibleObjects'][0]}個で、6個未満は{s['sparseFrames']}/{s['frames']}フレーム（{s['sparseFrames']/s['frames']*100:.2f}%）。動画の記録は次のとおり。数は不透明度5%以上の物を数えている。

{density}

実機スマホのGPUは未測定。腰下の連続画像は約0.7秒を0.667秒・9コマ（1/12秒間隔）として撮った。周期画像は以前と同じ左右2歩0.68秒を8等分した。0.34秒は通常の一歩へ適用し、初回の加速だけは約0.547秒とした。
'''
(out / 'README.md').write_text(text)
