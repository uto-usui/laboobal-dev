"""Record reviewed ninth-pass outputs and its remaining failed criteria."""
import sys,json,hashlib,time
from pathlib import Path
import numpy as np
from PIL import Image
import igl
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'saved-verification.json').read_text());bridge=json.loads((out/'armpit-bridges.json').read_text());smoothing=json.loads((out/'weight-smoothing.json').read_text());head=json.loads((out/'hidden-head-components.json').read_text());d=np.load(out/'contact-input.npz');basal=d['neck']&(d['rest'][:,2]<d['rest'][d['neck'],2].min()+.005);seam={}
for name in m['poses']:
 q=d['pose_'+name][basal];bv=d['body_pose_'+name];bf=d['body_F'].astype(np.int64);inside=abs(igl.fast_winding_number(bv,bf,q))>.5;dist=np.sqrt(igl.point_mesh_squared_distance(q,bv,bf)[0])*1000;seam[name]={'basal_neck_vertices':int(basal.sum()),'outside_body_count':int((~inside).sum()),'minimum_inside_depth_mm':float(dist[inside].min(initial=100))}
required=['character-lowpoly9.blend','demo-frames.png','clay-body.png','lowpoly-views.png','wire.png','face-close.png','metrics.json','log.md']
for name in m['poses']:
 required+=[f'demo-{name}.png']+[f'neck-close-{name}-{a}.png' for a in [0,25,90]]
 if name.startswith(('upper_','arm','spine_')) or name in ['combo_left','combo_right']:required += [f'armpit-close-{name}-{s}-{a}.png' for s in ['L','R'] for a in [0,155]]
missing=[p for p in required if not (out/p).exists()];assert not missing,missing
images={};white=True
for name in m['poses']:
 path=out/f'demo-{name}.png';im=Image.open(path).convert('RGB');assert im.size==(1280,800);white&=im.getpixel((0,0))==(255,255,255);images[path.name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':list(im.size)}
assert white
# This record corresponds to the images inspected in this run, rather than an
# automatic claim of visual success based on the numerical measurements.
observed=['demo-frames.png','demo-neck_left25.png','demo-neck_right25.png','demo-neck_up10.png','demo-neck_down10.png','demo-combo_up_left.png','neck-close-neck_up10-25.png','armpit-close-arm_L_70_elbow90-L-155.png','face-close.png','clay-body.png','wire.png','wire-face.png']
review=json.loads((out/'visual-review.json').read_text())
assert all(hashlib.sha256((out/name).read_bytes()).hexdigest()==digest for name,digest in review['reviewed_images'].items()),'Reviewed images changed; inspect them before updating the visual record'
(out/'visual-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n');m['visual_review']=review;m['basal_neck_overlap']=seam;m['acceptance'].update(neck_join_no_visible_gap_in_demo_front=True,armpit_visual=False,original_head_bottom_retained=abs(v['head_bottom_mm']-v['reference_head_bottom_mm'])<=.05);m['overall_pass']=all(m['acceptance'].values());assert not m['overall_pass']
m['assumptions']=['首の中心は元の頭の水平断面XY範囲の中点。高さは685/690/695mm。整列の5mmはXYの点間距離で厳密に判定した。平均からは3.398mm以内だが、点間は5.193mmで未達。','橋は面の共有辺の双対グラフで、550mm以下で分かれている腕と胴を567mmまでの帯でつなぐ面の最小カットとした。除去して分離を再検査した。ウェイトの範囲は橋の頂点から面の辺に沿って30mm。','肩の上を通るベルトは、595mmより高いベルト候補のうち、真下60mm以内にベルト以外の肩・上腕・胴の面がある頂点とした。47頂点へ重心座標で写した。真下に面がない585候補は8回目のまま。','頭を採らない場合は8回目の頭をそのまま使う指示を優先した。下端は8回目の時点で669.132mmで、元の668.577mmまで0.555mm不足する。今回その下端をさらに削る処理はしていない。','小片は100面未満の頂点連結成分。全頂点と全三角形の重心を26方向から検査し、どこからも最初の面として見えないものだけを除いた。角度を連続無限に検査した証明ではない。','食い込みはsolidify出力の原点・2mm格子に、実際に変形した閉じた体を姿勢ごとに再標本化した。これで首前面のhead混合も含めた。格子中心の占有をwindingで判定し、半セルを境界としたEDTを三線形補間した。','深さの増分は各姿勢の最大深さから立ち姿の最大深さを引き、負は0とした。同じ頂点ごとの増分もcontacts.jsonに併記した。この定義では上10度の最大深さ増分は0だが、同じ頂点の外への増分は3.135mmある。','つぶれた面は最長辺÷その辺の高さが10を超え、かつ立ち姿の3倍を超えた面。表のP99と面数は対象関節のうち最大を示し、重なる領域の面を足し合わせない。','0度は共通の立ち姿1枚。首の半分は左右12.5度・上下5度。上半身8度はspine.upper/chestに4度ずつ、背骨15度は従来の3骨に5度ずつ。']
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');manifest={'required_files':required,'missing':missing,'demo_images':images,'all_demo_white_background':white,'blend_sha256':v['blend_sha256'],'all_pose_numeric_reproduced_within_0_0001':v['pose_metrics_reproduced_within_0_0001'],'overall_pass':m['overall_pass']};(out/'output-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
lines=['\n## 最終確定（'+time.strftime('%Y-%m-%d %H:%M:%S')+'）','\n9回目は不合格。最終の食い込み値は、姿勢後の体を格子に再標本化した contacts.json / metrics.json の値。途中の胸固定格子の仮値と、収束しなかった逆変形の試し値は最終判定に使わない。','\n首の中心: '+json.dumps(m['neck'],ensure_ascii=False),'\n脇の橋: '+json.dumps({s:{k:r[k] for k in ['minimum_cut_count','bounds_mm','separation_verified']} for s,r in bridge['sides'].items()},ensure_ascii=False),'\n頭: 顔P95 '+str(m['head']['candidate_to_original_face_p95_mm'])+'mmで詰めた頭は不採用。8回目の頭から外に見えない183面を除いた。','\n目視:']+['- '+s for s in review['observations']]+['\n最終のポーズ値（増分は最大深さの差）','| ポーズ | P99 | つぶれた面 | 首元外への増分mm | 髪あご内への増分mm | 数値合否 |','|---|---:|---:|---:|---:|---|']
for n,r in m['pose_decisions'].items():lines.append(f"| {n} | {r['p99_worst_region']:.4f} | {r['thin_worst_region']} | {r['neck_out_increment_mm']:.3f} | {r['hair_jaw_in_increment_mm']:.3f} | {r['numeric_pass']} |")
lines+=['\n胴の距離は判定に使わない。処理後→元のP95は2.688430mm、元→処理後のP95は50.434520mm。','\nまだ足りないところ: 首の左右・下方向と組み合わせの伸びとつぶれ、上半身8度の脇、腕上げの肩・脇・肘の伸びと突起、閉じた頭、体の退化面2枚、首断面の点間5mm、元の頭の下端までの0.555mm。','\n合否: '+json.dumps(m['acceptance'],ensure_ascii=False),'\n保存ファイルのウェイト漏れ: '+str(v['stored_weight_leaks'])+'、正規化誤差最大: '+str(v['stored_weight_sum_error'])+'。体の頂点位置変化0mm。元の8回目のファイル不変。','\n置いた仮定:']+['- '+s for s in m['assumptions']]+['\nコミットはしていない。書き込みは scripts/toy-character と .work/toy-character の中だけ。']
with (out/'log.md').open('a') as f:f.write('\n'.join(lines)+'\n')
print(json.dumps({'overall_pass':m['overall_pass'],'required_files':len(required),'missing':missing,'white':white,'max_basal_outside':max(r['outside_body_count'] for r in seam.values())}))
