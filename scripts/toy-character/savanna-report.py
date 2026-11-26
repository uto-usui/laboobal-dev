from pathlib import Path
import json,hashlib
out=Path('.work/toy-character/savanna')
a=json.loads((out/'assets.json').read_text());c=json.loads((out/'capture-report.json').read_text());old=json.loads(Path('.work/toy-character/city/capture-report.json').read_text())
for s in c['shots']:
 prev=next(v for v in old['shots'] if v['variant']=='B' and v['name']==s['name'])
 assert s['framing']==prev['framing'],'Camera or character framing changed'
 assert s['pose']==prev['pose'],'Walking pose changed'
assert (out/'walk-snapshot.js').read_bytes()==Path('.work/toy-character/city/walk-snapshot.js').read_bytes()
lines=['# 乾いた野原の静止見本','', 'S を推します。傘状の木と枯れ草で動物がいる野原だと分かり、キャラの服の色も目立ちます。D はさらに物が少なく、砂地の空白が広く見えます。両方とも街角 B より背景の情報量が減りました。','', '## 見る画像','', '- [S：サバンナ、3サイズ](savanna-S.png)','- [D：砂地、3サイズ](savanna-D.png)','- [S・D・前回の街角 B の比較](compare.png)','- [見本ページ S](index.html?variant=S) / [D](index.html?variant=D)','- [素材と容量](assets.json) / [撮影と計測の生データ](capture-report.json)','', '元の DPR 2 / 3 の画像は shots/ にあります。横並び画像では CSS ピクセルの大きさへ縮めています。最終画像を開き、頭・手・靴が切れず、動物がキャラの顔・体と重ならないことを確認しました。顔への3本のレイと全身の境界・中心へのレイにも手前の遮蔽物はありません。縦長の S の木は左端で一部が切れます。','', '## 素材と記録','', '[Kenney Nature Kit](https://kenney.nl/assets/nature-kit) と [Gobkit Animal Pack Vol.4](https://gobkit.com/freebies) を公式配布元から取得しました。すべて CC0-1.0 で、クレジットは必須ではありません。任意の表記は「Nature assets by Kenney; animals by Gobkit (CC0). Colors modified.」です。','', 'ZIP 原本、展開したモデル、同梱ライセンス、配布ページの HTML、Gobkit の公式配布一覧 JSON、SHA-256 を vendor/ に残しています。vendor/sources.json に取得日時・URL・容量・ハッシュがあります。各モデル原本の SHA-256 も assets.json に入れました。調査したが未使用の Quaternius / Gobkit Nature Kit の控えも vendor/ に残っています。','', '| 部品 | 三角形 | 元材質数 | 元画像 | 骨 | アニメーション | 元GLB bytes |','|---|---:|---:|---|---:|---|---:|']
for x in a['assets']:
 imgs=', '.join(f"{i['width']}×{i['height']} ({i['bytes']:,} bytes)" for i in x['images']) or 'なし'
 lines.append(f"| {x['id']} | {x['triangles']:,} | {x['materials']} | {imgs} | {x['bones']} | {', '.join(z['name'] for z in x['animations']) or 'なし'} | {x['sourceGlbBytes']:,} |")
lines+=['', 'シマウマとゾウはそれぞれ骨16本、idle / attack / dead / walk の独立した4クリップです。取得した GLB の実測と現在の公式 JSON が示す4クリップの一致を確認しました。圧縮した GLB を読み戻して骨と4クリップの保持を確認しました。今回は動物も静止させており、歩きの見た目や足滑りは検証していません。','', '## 配置と物の数','', '地面・空・キャラ・影の面を除き、木・草むら・岩・動物を配置1個につき1点と数えます。端に一部だけ見える木も1点です。視錐台とモデルの境界で数え、画像でも確認しました。','', '| 案 | 1440×900 | 390×844 | 配置の内訳（横長） |','|---|---:|---:|---|']
for v,desc in [('S','木2、草むら2、岩2、シマウマ1'),('D','サボテン2、岩3、ゾウ1')]:
 counts=[len(next(s for s in c['shots'] if s['variant']==v and s['name']==n)['visibleObjects']) for n in ['desktop','mobile']]
 lines.append(f'| {v} | {counts[0]} | {counts[1]} | {desc} |')
lines+=['', '## meshopt 圧縮後の容量','', '| 案 | 地面と小物 | 動物1頭（別GLB） | 合計 |','|---|---:|---:|---:|']
for v,b in a['bundles'].items():
 animal=b['animals'][0]
 lines.append(f"| {v} | {b['bytes']:,} bytes | {animal['id']}: {animal['bytes']:,} bytes | {b['totalBytes']:,} bytes ({b['totalBytes']/1048576:.3f} MiB) |")
lines+=['', 'savanna-S.glb / savanna-D.glb は配置と平らな地面を含む小物の集約版です。動物は Zebra-S.glb / Elephant-D.glb に分離しました。各合計は2 MiB以内です。キャラ・JS・配布ZIPを含まず、将来の長い区間を複数持つときの容量は未計測です。圧縮前後で三角形数が一致することも確認しました。','', '## 5秒のフレーム時間','', f"Chrome {c['chrome']}、{c['shots'][0]['gpu']}。channel: 'chrome'、--enable-gpu --use-angle=metal、headless。各条件で800 msの描画後、5秒の requestAnimationFrame 間隔を計測しました。CPU制限は CDP Emulation.setCPUThrottlingRate です。静止した場面を毎フレーム描いています。",'', '| 案 | CSS画面 | DPR | CPU制限 | 中央値 ms | P95 ms | 標本数 |','|---|---|---:|---:|---:|---:|---:|']
for m in c['measurements']:
 r=m['raf'];lines.append(f"| {m['variant']} | {m['width']}×{m['height']} | {m['dpr']} | {m['cpuThrottling']}倍 | {r['medianMs']:.1f} | {r['p95Ms']:.1f} | {r['samples']} |")
lines+=['', 'これは描画更新の間隔で、GPUだけの処理時間ではありません。CPU制限4倍は実機スマホのGPU性能を再現しません。連続歩行・背景送り・区間交換・長時間のメモリは対象外です。','', '## 引き継いだ条件と置いた仮定','', '- 街角版のカメラ30° / 仰角8° / 画角25°、画面に合わせる処理、キャラの歩行途中の姿勢、RoomEnvironment、NeutralToneMapping、露出、主光源・補助光源、影、目と眼鏡の処理を引き継ぎました。6枚すべてのカメラ・キャラのフレーミングと姿勢が前回 B の生データに一致しています。walk-snapshot.js も同一です。','- 進行方向は +Z、地面の高さは前回の歩道と同じ .06 としました。景色だけを差し替え、デモページと歩行処理は編集していません。','- S は傘状の既製の木を横へ広げ、高さを抑えて配置しました。D は砂色の野原とし、完全な砂砂漠ではなく乾いた砂地にゾウがいる架空の場所と解釈しました。実在する地域や生態系の再現はしていません。','- 形状の新規生成は平らな地面だけです。それ以外は既製モデルの配置・回転・拡大縮小・塗り直しです。単色の空と地平線を使い、丘は足していません。','- 8枠の共通パレットを用意し、roughness .95 / metalness 0 の材質を小物・動物で共有しました。黒い輪郭線はありません。地面も同じつやのない設定です。','- 静かなサーバーを4431で起動しました。4410には起動・停止の操作をしていません。コミットはしていません。','', '## まだ足りないところ','', '木の段状の枝と動物の丸いデフォルメは、キャラの細かな質感とは違いがあります。D のゾウは砂地の雰囲気には合いますが、ラクダほど直接「砂漠」を示しません。地面は平板で、小物の接地や遠近の手掛かりは弱めです。静止見本としての確認であり、歩行と背景送りは未実装です。','', '## 再現','', 'リポジトリ直下で実行します。依存はこの作業フォルダ内に置きます。元の街角 B の撮影画像も必要です。','', '```sh','node scripts/toy-character/savanna-download.mjs','pnpm --dir .work/toy-character/savanna/tooling install','node scripts/toy-character/savanna-prepare.mjs','python3 scripts/toy-character/savanna-scene.py','python3 -m http.server 4431 --bind 127.0.0.1','```','', '別のターミナルで撮影・集約・レポート生成を行います。','', '```sh','node scripts/toy-character/savanna-capture.mjs','node scripts/toy-character/savanna-bundle.mjs','python3 scripts/toy-character/savanna-report.py','```','']
(out/'README.md').write_text('\n'.join(lines))
print('README generated; framing and pose match all six previous B shots.')
