"""Write the fourth-pass result from measured data and inspected images."""
import json,sys,hashlib
from pathlib import Path
OUT=Path(sys.argv[1]);m=json.loads((OUT/'metrics.json').read_text())
visual=json.loads((OUT/'visual-final.json').read_text())
if visual['blend_sha256']!=hashlib.sha256((OUT/'character-lowpoly4.blend').read_bytes()).hexdigest():raise RuntimeError('Visual review belongs to a different saved blend')
m['visual_review']=visual;m['acceptance'].update(visual['acceptance'])
m['acceptance']['part_allocation']=all(v['pass'] for v in m['part_allocation'].values())
m['acceptance']['triangles']=m['triangle_budget']['pass']
m['acceptance']['head_unchanged']=m['head_geometry_unchanged']
m['acceptance']['overall_pass']=all(v is True for v in m['acceptance'].values())
m['head_selection']={'selected':'low3_head unchanged','source':'lowpoly3/character-lowpoly3.blend','rebuilt':False}
(OUT/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
name={'neck':'首の肌','torso':'胴・襟','sleeve_L':'左袖','sleeve_R':'右袖','hand_L':'左手','hand_R':'右手','backpack':'リュック','shoulder_straps':'肩ベルト','legs_shoes':'脚・靴','face_head':'顔・頭','hair':'髪・キャップ','total':'合計'}
lines=[]
def add(s=''):lines.append(s)
def table(headers,rows):
 add('| '+' | '.join(headers)+' |');add('| '+' | '.join(['---']*len(headers))+' |')
 for row in rows:add('| '+' | '.join(map(str,row))+' |')
 add()
add('工程6の4回目は不合格です。開口を塞いで境界辺を0にし、ウェイトの部位間の漏れは防げましたが、断面の多重壁、肘の崩れ、首の段、距離と正面・背面の輪郭が基準を満たしません。BのQuadriFlowは中止したため、Aを不合格の検査対象として保存しました。')
add()
add('出力は `character-lowpoly4.blend`、`metrics.json`、指定の9枚の画像です。入力と頭の形を保存ファイルから再検査しました。コミットはしていません。')
add()
f=m['construction']['opening_fill'];c=m['construction']
add(f"開口は、非多様体で途切れる接続を元の座標のまま分けた後の{f['opening_count']:,}輪を塞ぎました。元の体から旧頭を除いた境界は{f['boundary_edges_before']:,}本、閉鎖後は{f['boundary_edges_after']}本です。同じ位置の頂点を{f['fan_split_coincident_vertices']:,}個複製し、新しい位置の頂点は置いていません。")
add()
top_rows=[]
for label,t in [('開口閉鎖後',c['after_cap_topology']),('Voxel直後',c['voxel']['before_shell_removal']),('小成分除去後',c['voxel']['after']),('首切断後',c['after_neck_cut']),('A減面後',m['topology']['body'])]:
 top_rows.append([label,t['triangles'],t['boundary_edges'],t['edges_shared_by_3_or_more_faces'],t['connected_components']])
table(['段','三角形','境界辺','3面以上の共有辺','成分'],top_rows)
add('1.5mmでVoxel化しました。閉鎖後の重複面・ゼロ面積の面も隠さずmetricsに残しています。Voxel後は閉じた1成分ですが、内側の壁も同じ成分につながって残りました。')
add()
rows=[]
for region,jp in [('upper_arm','上腕'),('forearm','前腕'),('thigh','太もも'),('shin','すね')]:
 rows.append([jp,*[m['sections'][stage][region+'.'+side]['loops'] for stage in ['after','reduced'] for side in ['L','R']]])
for key,jp in [('torso','胴（中央）'),('neck','首（中央）')]:
 rows.append([jp,m['sections']['after'][key]['loops'],'—',m['sections']['reduced'][key]['loops'],'—'])
table(['断面','Voxel後 左','右','減面後 左','右'],rows)
add('断面は全箇所1重の条件を満たしません。多数の辺が別部位に属する輪は灰色で併記し、表の数から分けています。該当部位の内側の輪は除外していません。')
add()
n=c['neck'];add(f"首の高さは、襟の上端 {n['collar_top_m']*1000:.3f}mm、切断面 {n['body_cut_m']*1000:.3f}mm、固定された頭の下端 {n['head_bottom_m']*1000:.3f}mmです。切断直後の重なりは {n['overlap_m']*1000:.3f}mm、減面後の首の肌上端からは {n['after_reduction']['actual_vertical_overlap_m']*1000:.3f}mmで、10mmに届きません。切断の平面からの最大ずれは {n['cut_rim_nonplanarity_mm']:.6f}mmです。襟を残し、首の肌だけを切って塞ぎました。")
add()
add('正面の襟より上に細い帯と段が残ります。左右30°と上下20°でも境目が見え、上向きでは首の肌が鋭く折れます。切断高さをさらに下げると、固定された頭との上下の重なりは減るため、頭を延長・移動せず不足として記録しました。')
add()
a=m['ab_comparison']['candidates']['A']['elbow'];b=m['ab_comparison']['candidates']['B']['reason']
table(['右袖・肩の比較','A','B','合格の線'],[
 ['裏返り面',a['flipped_faces'],'未計測',20],['2倍超の辺',f"{a['edges_over_2x']}/{a['tested_edges']} ({a['edges_over_2x_fraction']*100:.3f}%)",'未計測','1%以下'],['最大伸長',f"{a['max_stretch']:.3f}倍",'未計測','3倍以下'],['白い拡大','肘内側の突き出し・外側の折れ','候補なし','裂け・突起なし']])
add(f"Bは30万三角形から15,800四角面（31,600三角形相当）を要求しましたが、{b.get('seconds',0):.2f}秒でCANCELLEDになりました。Blenderは多様体と一貫した法線を要求する警告を出し、出力は元の300,000三角形のままでした。別の処理では修復せず、不採用にしました。Aも線を越えておらず、合格した候補はありません。")
add()
add('Aは肩・肘・手首の周囲だけSmooth 0.6を12回行いました。最大伸長は45.474倍から16.361倍に下がりましたが、裏返りは140面から158面、2倍超の辺率は3.377%から5.432%になり、不合格のままです。45°では脇と股のすき間は残りますが、肩ベルトと胴の細いすき間は部分的に弱まり、つながる面が見えます。Bは候補がなく目視比較できません。')
add()
table(['部位','三角形'],[[name[k],v] for k,v in m['triangles'].items()])
add(f"後工程5,000面を含めると{m['triangle_budget']['current_plus_reserved']:,}面です。部位の配分と60,000面以内の条件は合格です。")
add()
rows=[]
for part in ['torso','sleeve_L','sleeve_R','backpack','shoulder_straps','legs_shoes']:
 v=m['distances_full_source'][part];rows.append([name[part],f"{v['high_to_low']['p95_mm']:.3f}",f"{v['low_to_high']['p95_mm']:.3f}",'不合格'])
table(['距離P95（mm）','元→低密度','低密度→元','1.5mm以下'],rows)
add('距離は3回目と同じ、方向・部位ごとの150,000面積標本と全頂点による双方向値です。元の内部面も含みます。内部面を分けた参考値もmetricsに残していますが、袖・ベルトなどは参考値でも1.5mmを超えます。固定された頭は今回の体の距離判定に含めません。')
add()
table(['輪郭の方向','IoU','0.99以上'],[[a+'°',f"{v['iou']:.6f}",'合格' if v['pass'] else '不合格'] for a,v in m['silhouette'].items()])
add('ウェイトは減面した体へ直接Automatic Weightsをかけ、部位の制限後に襟と肩ベルトへ胴からData Transferを適用しました。リュックは胸1.0です。最後に4本までに制限して正規化しました。次の表は体の各部位で重み0.05を超える頂点数です。')
add()
keys=['neck','torso','sleeve_L','sleeve_R','hand_L','hand_R','backpack','shoulder_straps','legs_shoes']
table(['骨','首','胴','左袖','右袖','左手','右手','鞄','帯','脚靴'],[[bone,*[counts[k] for k in keys]] for bone,counts in m['weights']['final']['over_005_by_bone_and_part'].items()])
h=m['saved_verification']['head_weights_over_005_by_part']['head'];add(f"頭側は顔・頭{h['face_head']:,}頂点、髪・キャップ{h['hair']:,}頂点がすべてhead=1.0です。腕の骨から脚へ、脚の骨から袖・手へ、首・頭の骨から胴・襟・ベルト・リュックへ、禁止された0.05超の重みは0です。未割当0、影響最大4本、微小な重みを含めた正規化誤差の最大は{m['saved_verification']['maximum_weight_sum_error_including_tiny_weights']:.2e}です。")
add()
for pose,regions in m['arm_motion'].items():
 add(f"{pose}: 脚の最大移動 {regions['legs']['max_displacement_mm']:.8f}mm、胴下部 {regions['lower_torso']['max_displacement_mm']:.8f}mm。")
add()
rows=[]
for pose,values in m['poses'].items():
 r=values['low4_body'];rows.append([pose,r['flipped_faces_against_transported_rest_normal'],r['edges_over_2x_rest_length'],f"{r['max_edge_stretch']:.3f}",visual['poses'][pose]])
table(['ポーズ','体全体の裏返り','2倍超の辺','最大伸長','目視'],rows)
add('表は体全体の数です。A/B判定の158面・333辺は右袖と肩の範囲だけを数えています。他の崩れた関節も周囲だけSmoothを行いましたが、首・背骨・肘の崩れは残りました。形を押し引きしていません。')
add()
labels={'sections':'断面が1重','body_topology':'閉じた体の辺と成分','weights':'部位制限・4本・正規化','distance_p95':'体の距離P95','elbow':'右袖・肩のA/B基準','neck_overlap':'首の重なり10mm','neck_planar_cut':'首の平面切断','pose_visual':'全ポーズの見え方','neck_visual':'首の境目を隠す','fragment_visual':'破片状の突起なし','silhouette':'8方向の輪郭','adhesion_visual':'すき間を保つ','part_allocation':'部位の面数','triangles':'面数の上限','head_unchanged':'頭をそのまま保持','overall_pass':'総合'}
table(['条件','判定'],[[labels.get(k,k),'合格' if v is True else '不合格' if v is False else '未確認'] for k,v in m['acceptance'].items()])
add('残った問題は、多重壁を1枚の外殻にできていないこと、Collapseの大きな三角形が肘を横切ること、固定された頭と襟の高さでは必要な重なりを取れないこと、形と輪郭のずれです。首の左右・上下で境目が出るため、このまま工程7へ進める品質にはなっていません。頭の毛先の小さなぎざぎざは記録だけとし、体の合否から除いています。')
add()
add('置いた仮定は次のとおりです。')
add()
for assumption in m['assumptions']:add('- '+assumption)
add()
add('開口閉鎖の検査中に部位ラベルの境界まで分けた版も作りましたが、元の開口だけを塞ぐ指定の結果としては採らず、`label-seam-closure-rejected/` に区別して残しました。最終の体は元の境界を閉じた版です。')
text='\n'.join(lines)+'\n';(OUT/'report.md').write_text(text)
with (OUT/'log.md').open('a') as f:f.write('\n## 最終判定と測定値\n\n'+text)
print(json.dumps({'overall_pass':m['acceptance']['overall_pass'],'report':'report.md','pending':[k for k,v in m['acceptance'].items() if v is None]},ensure_ascii=False))
