"""Append the measured result and the explicitly reviewed image observations."""
import json,sys
from pathlib import Path
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'visual-review.json').read_text())
if v['blend_sha256']!=m['saved_verification']['blend_sha256']:raise RuntimeError('Visual review is for a different saved mesh')
m['visual_review']=v
m['acceptance'].update({'visual':False,'no_fragments_or_holes_in_poses':False,'all_poses':False,'neck_hidden':False,'limb_isolation':all(r['legs']['max_displacement_mm']<.001 and r['lower_torso']['max_displacement_mm']<.001 for r in m['arm_motion'].values()),'head_unchanged':m['saved_verification']['head_geometry_unchanged'] and m['saved_verification']['head_transform_unchanged'],'triangle_budget':m['triangle_budget']['pass']})
m['overall_pass']=all(m['acceptance'].values())
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
lines=['\n## 最終判定\n','工程6の5回目は不合格。多重の内壁は消えたが、元の形との距離、輪郭、首の境目、関節を曲げた形が基準を満たさない。形を数値で作ったり、ポーズに合わせて形を押し引きしたりしていない。コミットはしていない。\n',
'採用値は2mm格子、r=7（14mm）。太らせる量と削り戻す量を同じにした。r=6では首に穴が1つ残り、r=7では全10断面が領域1・穴0。胴と首は中央、四肢は左右の骨の中点の垂直断面。脇と股の接続を含む外周を数えている。他部位だけの輪は計数から分け、全輪もsections.jsonに残した。\n',
'| 段 | 頂点 | 三角形 | 境界辺 | 3面以上の共有辺 | 成分 |','| --- | ---: | ---: | ---: | ---: | ---: |']
for name,key in [('充填直後・旧頭込み','filled'),('首切断後・体のみ','after_neck'),('均一化後・体のみ','uniform')]:
 r=m['topology'][key];lines.append(f"| {name} | {r['vertices']} | {r['triangles']} | {r['boundary_edges']} | {r['edges_shared_by_3_or_more_faces']} | {r['connected_components']} |")
lines+=['\nQuadriFlowを使用。最終要求は17,500四角面で、14,870四角面が出た。境界辺6本の小さな開口2つを既存の縁だけの面で塞いで三角形化し、Nearest Surface PointのShrinkwrapで切断・閉鎖済みの充填面へ沿わせた。最終の体は29,742三角形、頭込み47,880三角形。後工程用5,000面を加えて52,880面。pymeshlabは使用しなかった。\n',
'| 部位 | 充填P95 元→後 / 後→元 mm | 最終P95 元→後 / 後→元 mm | 最終 最大 元→後 / 後→元 mm |','| --- | ---: | ---: | ---: |']
for name,a in m['filled_distances'].items():
 b=m['distances_full_source'][name]
 def pair(d,key):return ' / '.join(f"{d[k][key]:.3f}" for k in ['high_to_low','low_to_high'])
 lines.append(f"| {name} | {pair(a,'p95_mm')} | {pair(b,'p95_mm')} | {pair(b,'max_mm')} |")
lines+=['\n距離は部位ごと・方向ごとの150,000面積標本と全頂点。元の内部面も含む生の値で合否を判定した。内部面を分けた参考P95もmetricsに残したが、外面側のずれも基準を超えるため、内部面だけを理由に合格へ変更していない。胴の行は4回目と同じ首込みの指標で、首単独も追加した。充填の双方向P95 2mm、最終の曲げる体の1.5mmはいずれも不合格。\n']
n=m['construction']['neck'];lines += [f"首の実測: 元の襟上端 {n['collar_top_m']*1000:.6f}mm、切断高さ {n['body_cut_m']*1000:.6f}mm、頭の首元の下端 {n['head_bottom_m']*1000:.6f}mm、重なり {n['overlap_m']*1000:.6f}mm。切断平面からの最大ずれ {n['cut_rim_nonplanarity_mm']:.8f}mm。均一化後の首上端 {n['after_uniform']['body_skin_neck_top_m']*1000:.6f}mm、重なり {n['after_uniform']['actual_vertical_overlap_m']*1000:.6f}mm。\n",'首の前面に平たい縁が見え、左右30°・上下20°でも境目を隠せなかった。切断は元の襟の上端を基準に体全体へ適用した。頭の座標・面・位置・大きさは4回目のまま。\n',
'| 肘・肩 | 裏返り面 | 2倍超の辺 | 比率 | 最大伸長 | 判定 |','| --- | ---: | ---: | ---: | ---: | --- |']
for pose,r in m['elbows'].items():lines.append(f"| {pose} | {r['flipped_faces']} | {r['edges_over_2x']}/{r['tested_edges']} | {r['edges_over_2x_fraction']*100:.3f}% | {r['max_stretch']:.3f}倍 | 不合格 |")
lines+=['\n合格線は裏返り20面以下、2倍超の辺1%以下、最大3倍以下。白い材質でも肘内側と脇に細い面と鋭い突き出しが見える。\n','| ポーズ | 体全体の裏返り面 | 2倍超の辺 | 最大伸長 | 目視 |','| --- | ---: | ---: | ---: | --- |']
for pose,rows in m['poses'].items():
 r=rows['low5_body'];lines.append(f"| {pose} | {r['flipped_faces_against_transported_rest_normal']} | {r['edges_over_2x_rest_length']} | {r['max_edge_stretch']:.3f}倍 | {v['poses'][pose]} |")
lines+=['\nウェイトはAutomatic Weights、部位での骨の制限、襟と肩ベルトへの胴からのData Transfer、4本への制限と正規化。腕の骨は袖・手ラベル、脚の骨は左右それぞれの脚ラベルに限定した。崩れた肩・肘・手首・首・背骨の周囲だけSmooth（係数0.6、12回）して再測定した。\n']
s=m['saved_verification'];lines += [f"禁止された0.05超の重みは{s['forbidden_over_005']}、未割当0、微小な重みを含めた影響最大{s['max_positive_influences_including_tiny_weights']}本、正規化誤差最大{s['maximum_weight_sum_error_including_tiny_weights']:.3g}。リュック{s['backpack_vertices']}頂点は胸1.0で固定。腕を上げたときの脚の最大移動は{max(r['legs']['max_displacement_mm'] for r in m['arm_motion'].values()):.8f}mm、胴下部は{max(r['lower_torso']['max_displacement_mm'] for r in m['arm_motion'].values()):.8f}mm。ウェイト工程による面の座標変更は{s['max_surface_position_change_during_weights_mm']:.8f}mm。\n",'| 部位 | 三角形 | 辺の中央値 mm | 辺のP95/P5 |','| --- | ---: | ---: | ---: |']
for name,r in m['uniformity'].items():lines.append(f"| {name} | {r['triangles']} | {r['edge_median_mm']:.3f} | {r['edge_p95_over_p5']:.3f} |")
lines+=['\n| 輪郭の方向 | IoU | 0.99以上 |','| --- | ---: | --- |']
for angle,r in m['silhouette'].items():lines.append(f"| {angle}° | {r['iou']:.6f} | {'合格' if r['pass'] else '不合格'} |")
lines+=['\n| 基準 | 判定 |','| --- | --- |']
for name,r in m['acceptance'].items():lines.append(f"| {name} | {'合格' if r else '不合格'} |")
lines+=['\n指定の9枚を実際に開いて確認した。静止時の体に離れた破片や開口は見えず、リュックの内部の面も外から見えない。頭の毛先の小さなぎざぎざは4回目と同じで、体の合否から分けた。ポーズでは薄い面が裂けに見える箇所や突き出しが出るため、破片の基準は不合格。\n',
'保存したBlendを開き直し、頭と入力の保持、骨の一致、ウェイト、全11ポーズの数値の一致を確認した。指定画像はlowpoly-views.png、clay-body.png、neck.png、poses.png、pose-close.png、wire.png、outliers.png、sections.png、elbow.png。\n',
'### 置いた仮定\n',
'- 形を作る位置は数値で指定せず、元の面と指定の格子処理・切断・QuadriFlow・Shrinkwrapから導く。\n- 太らせる格子の形と塗りつぶしの接続は試し処理と同じ6近傍。削り戻しは試し処理のr−1から、依頼どおりrへ揃える。\n- 胴と首は左右に分けない中央の骨を使い、四肢は左右を測る。融合した脇と股の輪は分割せず計数する。該当ラベルを含む輪を残し、内側の輪は除かない。\n- 襟の範囲は4回目と同じ。切断平面は元の襟上端から2mm下。融合した首と襟を一つの平面で切り、頭を延長・移動しない。\n- QuadriFlow出力の小さな開口は、既存の縁だけで閉じる。新しい頂点位置は作らない。\n- 手は生成された形のまま。手首の交換用グループの境目は4回目と同じ方法で袖口の内側2mmとし、指の独立は工程6bに残す。\n- ポーズ、仮の骨、150,000標本と全頂点による双方向距離、1024pxの8方向IoUは4回目と同じ。内部面を含む距離で合否を決める。\n',
'残った不足は、距離と輪郭のずれ、首の境目の露出、肩から肘の内側の突き出し、首と背骨を曲げたときの局所的な崩れ。断面が詰まり、面が均一になっただけではポーズの基準を通らなかった。工程7へ進める品質には達していない。\n']
with (out/'log.md').open('a') as f:f.write('\n'.join(lines)+'\n')
print(json.dumps({'overall_pass':m['overall_pass'],'acceptance':m['acceptance']},ensure_ascii=False))
