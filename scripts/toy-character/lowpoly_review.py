"""Compose the required sheets and measure saved 1024px alpha masks."""
import json,sys
from pathlib import Path
import numpy as np
import cv2
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[1])
FONT='/System/Library/Fonts/Helvetica.ttc'

def panel(path,label,size=560):
    im=Image.open(path).convert('RGBA');bg=Image.new('RGBA',im.size,'#e2e3e5');bg=Image.alpha_composite(bg,im).convert('RGB')
    bg.thumbnail((size,size),Image.Resampling.LANCZOS)
    tile=Image.new('RGB',(size,size+44),'#f9f9f9');tile.paste(bg,((size-bg.width)//2,44+(size-bg.height)//2))
    ImageDraw.Draw(tile).text((12,12),label,fill='#20232a',font=ImageFont.truetype(FONT,18))
    return tile


def sheet(rows,name):
    width=max(sum(x.width for x in row) for row in rows);height=sum(max(x.height for x in row) for row in rows)
    im=Image.new('RGB',(width,height),'#fafafa');y=0
    for row in rows:
        x=0
        for p in row:im.paste(p,(x,y));x+=p.width
        y+=max(p.height for p in row)
    im.save(OUT/name)


def mask(path):return np.asarray(Image.open(path).convert('RGBA'))[:,:,3]>127


def measure(a,b):
    intersection=np.logical_and(a,b).sum();union=np.logical_or(a,b).sum()
    k=np.ones((3,3),np.uint8);ac=a&~cv2.erode(a.astype(np.uint8),k).astype(bool);bc=b&~cv2.erode(b.astype(np.uint8),k).astype(bool)
    da=cv2.distanceTransform((~ac).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE);db=cv2.distanceTransform((~bc).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    d=np.r_[da[bc],db[ac]];iou=float(intersection/union);p95=float(np.percentile(d,95))
    return {'iou':iou,'contour_distance_p95_px':p95,'contour_distance_max_px':float(d.max()),'iou_limit':.995,'p95_limit_px':1.,'pass':bool(iou>=.995 and p95<=1.)}


metrics=json.loads((OUT/'metrics.json').read_text());angles={}
for i in range(8):
    a=mask(OUT/f'mask-high-{i}.png');b=mask(OUT/f'mask-low-{i}.png');angles[str(i*45)]=measure(a,b)
metrics['silhouette']={'resolution':[1024,1024],'ortho_scale_m':1.08,'8_directions':angles,'all_pass':all(x['pass'] for x in angles.values()),'face_1024px_crop':measure(mask(OUT/'face-mask-high.png'),mask(OUT/'face-mask-low.png')),'note':'raw full geometry including intentionally replaced hands/neck/sockets; silhouette images have solid opaque inspection materials, no alpha from source textures'}
hand=json.loads((OUT/'hand-design.json').read_text());eyes=json.loads((OUT/'eye-openings.json').read_text())
metrics['authored_topology_checks']={'five_fingers_each_hand':all(v['finger_count']==5 for v in hand.values()),'finger_ring_vertex_counts':{side:{name:[len(r) for r in chain['ring_vertex_ids']] for name,chain in record['finger_chains'].items()} for side,record in hand.items()},'eye_rim_vertex_counts':{side:len(v['rim_vertex_ids']) for side,v in eyes.items()},'neck_design':json.loads((OUT/'ring-design.json').read_text()),'actual_ring_counts':json.loads((OUT/'actual-ring-counts.json').read_text()) if (OUT/'actual-ring-counts.json').exists() else None}
metrics['acceptance']={'triangle_budget':metrics['triangle_budget']['pass'],'connectivity':metrics['topology_pass'],'retained_surface_distance':all(v[d]['pass'] for v in metrics['distances'].values() for d in ['high_to_low','low_to_high']),'full_source_distance':all(v[d]['pass'] for v in metrics['full_source_distances'].values() for d in ['high_to_low','low_to_high']),'silhouette':metrics['silhouette']['all_pass']}
metrics['acceptance']['all_measurable_gates_pass']=all(metrics['acceptance'].values())
(OUT/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
sheet([[panel(OUT/f'view-{label}-{i}.png',f'{label} | {i*45} deg',430) for label in ['high','low']] for i in [0,2,4,6]],'lowpoly-views.png')
sheet([[panel(OUT/f'wire-{v}.png',v,500) for v in row] for row in [['front','side'],['neck','shoulder'],['elbow','hand'],['face']]],'wire.png')
sheet([[panel(OUT/f'opening-{v}.png',f'Eye opening | {v}',800) for v in ['front','oblique']]],'face-opening.png')
ref=Image.open(ROOT/'docs/toy-character/design/v4.png')
ref.crop((838,664,985,810)).save(OUT/'design-hand-L.png');ref.crop((274,664,420,810)).save(OUT/'design-hand-R.png')
rows=[]
for side in ['L','R']:
    rows.append([panel(OUT/f'hand-{side}-new-{v}.png',f'{side} new | {v}',440) for v in ['palm','back','edge']])
    rows.append([panel(OUT/f'hand-{side}-original-palm.png',f'{side} original fused hand',440),panel(OUT/f'design-hand-{side}.png',f'{side} design | front',440)])
sheet(rows,'hands.png')
print(json.dumps({'triangles':metrics['triangles'],'topology_pass':metrics['topology_pass'],'silhouette_pass':metrics['silhouette']['all_pass']}))

names={'face_head':'顔・頭・耳','hair_including_cap':'髪・キャップ','neck_torso_sleeves':'首・胴・両袖','legs_shoes':'脚・靴','hands':'両手','backpack_straps':'リュック・ベルト','total':'合計'}
part_names={'face_head':'顔・頭','hair':'髪','clothes':'胴・袖','legs_shoes':'脚・靴','backpack_straps':'リュック・ベルト'}
verdict=lambda b:'合格' if b else '不合格'
lines=['# 工程6：首の接続、減面、変形用の面、手と目の開口','',
'出力は作成したが、距離と輪郭の合格基準には届いていない。次の工程へ進める完成品としては扱わない。','',
'## 再実行','',
'```sh','blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage lowpoly','```','',
'確認画像だけを作り直すときは `--stage lowpoly-review --out .work/toy-character/lowpoly` を使う。距離を測った面の座標が変わらないことをハッシュで確かめ、手と輪郭だけを再検査する。','',
'## 入力と処理','',
'- 体は fidelity の全高1m版と同一の形を、prepare の溶接済みの頂点・面順と part_id で扱った。最小・最大座標の差が1µm未満であることを照合した。関節は元全高0.8886438608mから1.1253101992倍した。',
'- 頭は repaired-head.blend の seed 42 とキャップを読み、等方スケールと並進だけを再適用した。fit-landmarks.json はその変換値だけに使い、Laplacianで変形した頂点は読んでいない。元ファイルのSHA256は inputs.json に残した。',
'- 減面を妨げていた内部面は、法線の正負または外向きのレイが外へ抜けるかで分類した。分類前の元メッシュは残した。枝分かれした辺の余分な面、微小な片、頂点だけで接する面を整理し、境界ごとに別の中心頂点を持つ局所パッチで閉じた。Voxelや自動四角形化は使っていない。',
'- 固定部は Collapse。頭は均等に減らす段の後、顔と髪際の頂点をウェイト0で保護し、髪側を予算まで落とした。対称化はしていない。局所パッチは repair_cap の面ラベルに分けた。',
'- 胴は48頂点×18主要断面、袖は32頂点の断面と肩の接続パッチから張った。服のパネルだけを細分し、対応する高密度部位へ投影した。元の関節支持列と接続点は最近傍投影から外した。肘は推定中心と前後、手首は前後の支持列を持つ。',
'- 首は32頂点×6リング。Z=0.669〜0.687mで頭側と面をつないだ。元の赤い襟の上端を測り直し、胴の上端をZ=0.696mまで伸ばした。接続面はその下にある。',
'- 手は生成の指を使わず、掌、4本の指の根元と親指の接続口を別々に作り、一続きの面にした。各指は周方向12頂点で、各関節の前・中心・後ろに支持列がある。掌だけを最大4mmの範囲で丸め、指の支持列は固定した。',
'- 目は原画の対応点を X=(x−627)/1177、Z=(1213−y)/1177 で換算した。片目32頂点、表面4周、奥へ2周と底を作った。開口と交差する元の面も取り除いた。奥の壁の設計深さは18mm。眼球とまぶたは作っていない。',
'- すべて三角形化を適用した。UVの作成、焼き込み、色の投影、眼鏡、ボーン、ウェイト、GLBは行っていない。既存UVは確認用に残るため、局所パッチの色には伸びや乱れがある。形は追加の clay 画像でも確認する。','',
'## 三角形数','', '| 部位 | 三角形 |','| --- | ---: |']
for k,v in metrics['triangles'].items():lines.append(f'| {names[k]} | {v:,} |')
lines+=['','眼球・まぶた・眼鏡の5,000三角形は後工程に予約し、この段の目安は45,000とした。上限60,000に対する判定は'+verdict(metrics['triangle_budget']['pass'])+'。','',
'## 距離','',
'部位ごと、各方向50万点の面積比例標本に全頂点を加えた近似値。首・手・目の開口と周囲の変更領域は別扱いにした。厳密なHausdorff距離ではない。','',
'最初の表は保持する外表面を比較したもの。新設した隠れた閉鎖面には元の面がないため、低→高の標本からだけ除外した。除外件数と閾値はmetrics.jsonにある。','',
'| 部位 | 高→低 P95 / 最大 mm | 低→高 P95 / 最大 mm | 判定 |','| --- | ---: | ---: | --- |']
for k,d in metrics['distances'].items():
    a,b=d['high_to_low'],d['low_to_high'];lines.append(f"| {part_names[k]} | {a['p95_mm']:.3f} / {a['max_mm']:.3f} | {b['p95_mm']:.3f} / {b['max_mm']:.3f} | {verdict(a['pass'] and b['pass'])} |")
lines+=['','内部面も含む元の高密度メッシュとの値も隠さず測った。新設した閉鎖面を含む低→高の値もこちらに残す。','',
'| 部位 | 元の高→低 P95 / 最大 mm | 低→元の高 P95 / 最大 mm | 判定 |','| --- | ---: | ---: | --- |']
for k,d in metrics['full_source_distances'].items():
    a,b=d['high_to_low'],d['low_to_high'];lines.append(f"| {part_names[k]} | {a['p95_mm']:.3f} / {a['max_mm']:.3f} | {b['p95_mm']:.3f} / {b['max_mm']:.3f} | {verdict(a['pass'] and b['pass'])} |")
lines+=['','## 輪郭','',
'全身1024px、8方向、同じ正投影と縮尺で、アルファから輪郭を測った。意図して作り直した手・首も含む値である。合格値はIoU 0.995以上、双方向の輪郭距離P95 1px以下。','',
'| 角度 | IoU | 輪郭 P95 / 最大 px | 判定 |','| --- | ---: | ---: | --- |']
for k,d in metrics['silhouette']['8_directions'].items():lines.append(f"| {k}° | {d['iou']:.6f} | {d['contour_distance_p95_px']:.3f} / {d['contour_distance_max_px']:.3f} | {verdict(d['pass'])} |")
f=metrics['silhouette']['face_1024px_crop'];lines+=['',f"顔の1024px拡大：IoU {f['iou']:.6f}、輪郭P95 {f['contour_distance_p95_px']:.3f}px、最大 {f['contour_distance_max_px']:.3f}px。{verdict(f['pass'])}。",'',
'## 接続','',
'| オブジェクト | 境界辺 | 3面以上の共有辺 | 退化面 | 重複面 |','| --- | ---: | ---: | ---: | ---: |']
for name,t in metrics['topology'].items():lines.append(f"| {name} | {t['boundary_edges']} | {t['edges_shared_by_3_or_more_faces']} | {t['degenerate_faces']} | {t['duplicate_faces']} |")
lines+=['','接続全体：'+verdict(metrics['topology_pass'])+'。目の奥を底で閉じているので、この段の低密度メッシュには意図した境界辺も残さない。','',
'## 画像と残っていること','',
'- lowpoly-views.png：高密度と低密度の正面・横・背面・反対の横。新しい服の面は仮の部位色。',
'- wire.png：確定した三角形の正面・横と各部の拡大。細長い三角形でワイヤーの幅が膨らまない表示設定を使った。',
'- hands.png：左右の手の掌・甲・横、元の手、原画の手。比較用に切り出した手だけは手首平面で閉じてある。',
'- face-opening.png：正面と斜め。clay-face.png と clay-neck.png は色を外した追加検査。',
'- 距離・輪郭は未達の項目が残る。特に胴・袖の形の保持、リュック・ベルトの細部、髪や耳付近の小さな面の保持は、工程6内でさらに直す必要がある。後のベイクで輪郭や面の不足を直せるとは扱わない。',
'- 手は5本に分かれ支持列があるが、原画のような自然な丸みと付け根の形には改善の余地がある。ボーンで曲げた時の自己交差・潰れは後工程で検査する。',
'- 元UVの乱れと仮色は仕上がりの色ではない。ただし、色だけの問題と決めつけず、clay画像で見える段差や面の粗さも残課題に含める。','',
'## 仮定','',
'- 手の奥行きと関節中心は原画だけでは決まらないため、prepare の推定値を基準とした。掌の厚みは24mm、各指は軽く力を抜いた向きとした。親指のCMC候補は掌の内部にあったため、実際の接続口側へ移した。',
'- 目は正面を正投影相当とし、原画の読取不確かさ約1.5pxを引き継ぐ。奥の18mmの底は頭の内部を見せないための仮の壁であり、眼球をはめる時に接触位置を調整する。',
'- 顔・髪は固定部、脚・靴とリュック本体はほぼ固定部として扱った。肩ベルトは部位ラベルを残し、後工程で胴へ追従させる。',
'- 現段階では眼球などの分を除いて約45,000三角形を予算とした。数値の不合格を許容した完成判定にはしていない。','',
'コミットはしていない。既存の工程と入力ファイルは残した。']
(OUT/'log.md').write_text('\n'.join(lines)+'\n')
