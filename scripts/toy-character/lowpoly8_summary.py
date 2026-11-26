"""Compose eighth-pass evidence after hash-bound manual render inspection."""
import sys,json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'visual-review.json').read_text())
assert v['blend_sha256']==m['saved_verification']['blend_sha256']
for name,digest in v['image_sha256'].items():assert hashlib.sha256((out/name).read_bytes()).hexdigest()==digest,name
r=json.loads((out/'remeshing.json').read_text());m['armpit_crossing_faces']=dict(r['armpit_crossing_faces']);m['armpit_crossing_faces']['after_separate_shrinkwrap']=r['after_separate_shrinkwrap']
m['visual_review']=v;m['acceptance']['visual']=v['overall_visual_pass'];m['acceptance']['neck_visual']=v['neck_seam_hidden_all_views']
n=m['neck_angle_measurements'];m['neck_measurements']=n;m['neck_movement_range']=n['continuous_safe_range_degrees'];m['acceptance']['neck_range']=n['range_pass'] and v['neck_seam_hidden_all_views']
m['acceptance']['armpit_face_separation']=all(r['count']==0 for r in m['armpit_crossing_faces'].values())
neck=m['construction']['neck']
if 'inherited_body_cut_selection' not in neck:neck['inherited_body_cut_selection']=neck['radial_measurement']
neck['requested_head_cut_m']=neck['head_cut_m'];neck['radial_measurement']={'scope':'final eighth-pass head; angular samples in neck-range-raw.json','head_cut_height_mm':neck['head_cut_m']*1000,'actual_head_bottom_mm':neck['head_bottom_m']*1000,'overlap_mm':neck['overlap_m']*1000}
neck['radial_measurement_scope']='inherited_body_cut_selection records the temporary head used to retain the seventh-pass body cut, not the final head or movement range'
m['overall_pass']=all(m['acceptance'].values())
m['assumptions']=[
'7cmは面の重心から同側upper_arm・forearm・handの線分への最短距離とした。元の高密度メッシュを補正したので、減面後に観測された5面とは数が違う。辺を共有する隣接面の多数ラベルを使い、隣接面に腕以外がない場合だけ最初に見つかる隣接リングまで広げた。同数なら小さいラベルを採った。',
'首の中心は位置と大きさだけを合わせた元の頭全体の水平断面のXY範囲の中点とした。7中心は一直線に並ばないためx(z),y(z)を最小二乗で合わせた。骨の両端の高さとheadの長さは保持した。減面後の690mm断面の中心とは区別した。',
'体の切り口の作り方・高さは7回目を維持した。頭だけは元の下端で切り直して約9000三角形に減らした。体の中へ残す長さをさらに削る処理は外した。',
'首の断面半径は両面に交わる128方向だけを比較した。欠けた方向はnullであり半径0に置き換えない。すき間は角度別の上下断面の開きを1mm刻みで測り、衣服での遮蔽を検査した。髪・あごの食い込みは面積標本40000点と頂点で近似した。1mm未満の開きや斜め方向はレンダも併用した。',
'首の範囲は立ち姿から5度ずつ連続して通る各方向の最大角。立ち姿が通らなければ全方向0度とする。複合回転の安全範囲は意味しない。',
'関節の12回Smoothは7回目のものを保持した。背骨だけを良くする追加調整は入れていない。リュックと肩ベルトは襟を除いた胴の面からPOLYINTERP_NEARESTで写した。体の首肌・襟は胸に固定した。立ち姿の正面で段を確認した前側53頂点だけheadを混ぜた。混合は実際の襟境界で0、肌の面に沿って10mm離れるまでsmoothstepで増やし、境界のhead最大値は0。',
'脇より下は面の全頂点が567mm未満のものとした。QuadriFlow直後は四角面、Shrinkwrap直後は三角面を数えた。ウェイト用の部位ラベルと同じ、元の面と残存ボクセル側の由来を使った。',
'腕を10度寄せるポーズは作らず、立ち姿は元の角度を用いた。工程6の範囲の編集のみでコミットはしていない。']
(out/'construction.json').write_text(json.dumps(m['construction'],ensure_ascii=False,indent=2)+'\n')
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
lines=['# 工程6・8回目の判定','',('合格。' if m['overall_pass'] else '不合格。')+' 指定した修正、全ポーズ測定、レンダの目視まで実施した。','',v['remaining'],'','## ラベルと骨','',f"高密度メッシュのラベル補正: {m['label_repair']['count']}面、左右内訳 {m['label_repair']['by_side']}。面ごとの座標はlabel-repair.json。",'','| z mm | 中心x mm | 中心y mm |','| ---: | ---: | ---: |']
for row in m['neck_bones']['original_head_cross_sections']:lines.append(f"| {row['height_mm']} | {row['center_mm'][0]:.4f} | {row['center_mm'][1]:.4f} |")
lines+=['','骨の位置（m）:','```json',json.dumps(m['neck_bones']['new_bones_m'],indent=2),'```',f"中心との最大残差: {m['neck_bones']['max_center_residual_mm']:.4f}mm。",'','## 首','','開きは128方向・高さ1mm刻みの輪郭からの近似値。欠測方向があり、0mmは完全な閉鎖の証明ではない。髪を含む頭全体と体全体で外向きの遮蔽を検査した。',f"連続して通る範囲: {m['neck_movement_range']} 度。",'','| ポーズ | 外向き遮蔽検査後の開き候補mm | 突き出しmm | 見える突き出しmm | 食い込みmm | 断面欠測方向 | 数値合否 |','| --- | ---: | ---: | ---: | ---: | ---: | --- |']
for r in n['rows']:lines.append(f"| {r['pose']} | {r['gap_mm']:.3f} | {r['protrusion_mm']:.3f} | {r['visible_protrusion_mm']:.3f} | {r['penetration_mm']:.3f} | {r['missing_angular_sections']} | {r['numeric_neck_pass']} |")
lines+=['','測定方法:','```json',json.dumps(n['method'],ensure_ascii=False,indent=2),'```','','## 脇をまたぐ面','']
for phase,row in m['armpit_crossing_faces'].items():lines.append(f"- {phase}: {row['count']}面。左右: { {k:v['count'] for k,v in row['sides'].items()} }")
lines+=['','## 体全体と関節まわり','', '| ポーズ | 領域 | 裏返り面 | 裏返り% | 2倍超の辺% | 最大伸び | 部位 | 高さmm |','| --- | --- | ---: | ---: | ---: | ---: | --- | --- |']
allposes=dict(m['joint_pose_metrics'])
for r in n['rows']:allposes.setdefault(r['pose'],r['joint_pose_metrics'])
for pose,regions in allposes.items():
 for region,r in regions.items():
  e=r['maximum_edge'];lines.append(f"| {pose} | {region} | {r['flipped_faces']} | {r['flipped_face_fraction']*100:.4f} | {r['edges_over_2x_fraction']*100:.4f} | {r['max_stretch']:.4f} | {'/'.join(e['parts'])} | {min(e['height_range_mm']):.3f}..{max(e['height_range_mm']):.3f} |")
lines+=['','## 断面・形・輪郭','', '| 部位 | 処理後から元へのP95 mm | 合否 |','| --- | ---: | --- |']
for name,r in m['distances_full_source'].items():
 r=r['low_to_high'];lines.append(f"| {name} | {r['p95_mm']:.4f} | {r['p95_pass']} |")
lines+=['','| 方向 | 輪郭IoU | 合否 |','| ---: | ---: | --- |']
for a,r in m['silhouette'].items():lines.append(f"| {a} | {r['iou']:.6f} | {r['pass']} |")
lines+=['','断面:','```json',json.dumps({phase:{name:{k:r[k] for k in ['filled_regions','holes','open_chains','pass']} for name,r in m['sections'][phase].items()} for phase in ['after','reduced']},ensure_ascii=False,indent=2),'```','','予算:','```json',json.dumps(m['triangle_budget'],indent=2),'```','','## 目視','']
lines+=['- '+key+': '+value for key,value in v['observations'].items()]
lines+=['','## 合否','```json',json.dumps(m['acceptance'],ensure_ascii=False,indent=2),'```','','## 置いた仮定','']+['- '+s for s in m['assumptions']]
report='\n'.join(lines)+'\n';(out/'report.md').write_text(report)
with (out/'log.md').open('a') as stream:stream.write('\n'+report)
print(json.dumps({'overall_pass':m['overall_pass'],'acceptance':m['acceptance']},ensure_ascii=False))
