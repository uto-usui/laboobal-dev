"""Finalize only after the recorded renders have actually been inspected."""
import sys,json,time,hashlib,shutil
from pathlib import Path
from PIL import Image
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'saved-verification.json').read_text());review=json.loads((out/'visual-review.json').read_text());inventory=json.loads((out/'head-inventory.json').read_text());seam=json.loads((out/'seam-measurements.json').read_text())
for name,digest in review['reviewed_images'].items():assert hashlib.sha256((out/name).read_bytes()).hexdigest()==digest,name
assert v['stored_weight_leaks']==0 and v['position_change_mm']==0 and v['other_weight_max_error']==0 and v['neck_and_collar_chest_1'] and v['integer_counts_match'] and v['float_max_pose_error']<1e-4
required=['character-lowpoly10.blend','demo-frames.png','neck-frames.png','arm-frames.png','clay-body.png','lowpoly-views.png','wire.png','metrics.json','head-inventory.json','seam-measurements.json','saved-verification.json','log.md','review.html']
for n in m['poses']:
 required += [f'demo-{n}.png']+[f'neck-close-{n}-{a}.png' for a in [0,25,90]]
 if n.startswith(('upper','arm','spine')) or n in ['combo_left','combo_right']:required += [f'armpit-close-{n}-{side}-{a}.png' for side in ['L','R'] for a in [0,155]]
assert all((out/n).exists() for n in required)
images={}
for n in required:
 if n.endswith('.png'):
  im=Image.open(out/n);images[n]={'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest(),'size':list(im.size)}
for n in m['poses']:
 im=Image.open(out/f'demo-{n}.png').convert('RGB');assert im.size==(1280,800) and im.getpixel((0,0))==(255,255,255)
m['numeric_acceptance']['weight_leaks_zero']=v['stored_weight_leaks']==0;m['visual_review']=review;m['acceptance']={**m['numeric_acceptance'],**review['acceptance']};m['overall_pass']=all(m['acceptance'].values());m['seam']=seam;m['saved_verification']=v
m['assumptions']=['体の首の肌と襟は8回目のweight-labels.npyの首ラベルと既存の襟の条件で選んだ。head混合53頂点を胸固定へ戻し、ほかのウェイトは完全一致させた。','退化面2枚を削除し、その穴のふちにあった完全に同位置の頂点1組をつないだ。新しい位置の頂点や面は作っていない。残す側の元のウェイトを保った。','頭の16,000三角形はキャップ込みの上限とした。既存の外面抽出・局所清掃を引き継ぎ、ファン分離時の小片の一律削除は止め、減面後に可視性を検査した。顔の保護は従来の目=.12、鼻口=.25。あご下と首元には減面コスト.12を追加した。','小片は100面未満の頂点連結成分。全頂点と面重心を26方向から検査した。見える髪の成分は、既存のふちだけを塞いだ検査用キャップの内側に全標本が入る場合だけ除いた。有限方向・有限標本による判定であり、全方向の連続面の証明ではない。出力のキャップは塞いでいない。','頭の部位は顔・髪・キャップと、肌のうち高さ720mm未満の首元。成分は最多面数の部位と頂点平均高さへ1回だけ割り当てた。境界辺は隣接する唯一の面の部位と辺の中点高さへ割り当てた。部位をまたぐ成分の詳細もJSONに残した。','段の高さは見える首肌同士の境界をまたぐ隣接カメラレイの奥行き差、幅はその境界のカメラ横方向の長さとした。頭側は元姿勢704mm未満の肌に限定し、下を向いたあごの遮蔽の縁は除外した。サンプル間隔は2px、拡大の目標面で約0.45mm。垂直方向の範囲とワールドX方向の幅もJSONへ併記した。','ポーズは9回目の20種類をそのまま使用した。組み合わせは首左25度＋上半身左8度、首右25度＋上半身右8度、首左25度＋上10度。腕上げ3種と背骨15度3種は記録だけとした。','数値は9回目の領域・辺長と面の比率の式を使った。今回指定の首と胸のうち最大を判定した。つぶれは最長辺÷高さが10超かつ立ち姿の3倍超、面数5以下。重複領域は足し合わせない。','食い込みと首元外側への突出は9回目と同じ2mm格子・姿勢後の閉じた体・winding占有・EDT三線形補間を使い、各ポーズの最大深さから立ち姿の最大深さを引いた増分を判定した。2mm格子の近似である。','輪郭は9回目と同じ8方向・1280x800・アルファ127超で元の高密度全身と比較した。90度の0.984960は丸めず不合格とした。頭を閉じた1成分にする条件や首中心点間5mmは今回の合否に追加していない。']
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
manifest={'required_files':required,'missing':[],'images':images,'blend_sha256':v['blend_sha256'],'overall_pass':m['overall_pass'],'visual_review_image_hashes_verified':True};(out/'output-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
lines=['\n## 10回目の最終判定（'+time.strftime('%Y-%m-%d %H:%M:%S')+'）','\n不合格。襟の折れと体の退化面は解消したが、髪の裏の小片、上向きの突出増分、上半身の伸び、側面90度の輪郭IoUが未達。腕上げは合否から除外した。','\n### 目視']+['- '+x for x in review['observations']]+['\n### 頭の内訳','|部位|三角形|開いた境界辺|成分（最多部位）|','|---|---:|---:|---:|']
for n,r in inventory['parts'].items():lines.append(f"|{n}|{r['triangles']}|{r['boundary_edges']}|{r['components_dominant']}|")
lines+=['\n### 部位と高さ別（境界辺・成分）','成分は頂点平均高さ、辺は辺の中点の高さ。行をまたぐ成分も1回だけ数える。','|高さmm|face 辺/成分|hair 辺/成分|cap 辺/成分|neck 辺/成分|','|---|---:|---:|---:|---:|']
table=inventory['height_table'];heights=list(dict.fromkeys(tuple(r['height_mm']) for r in table))
for band in heights:
 cells=[]
 for part in ['face','hair','cap','neck']:
  r=next(x for x in table if x['part']==part and tuple(x['height_mm'])==band);cells.append(f"{r['boundary_edges']}/{r['components_dominant_centroid']}")
 lines.append('|'+f'{band[0]:g}–{band[1]:g}'+'|'+'|'.join(cells)+'|')
lines+=['\n### 前の開きの段（拡大25度、修正せず記録）','|ポーズ|段の奥行き最大mm|P95 mm|幅mm|','|---|---:|---:|---:|']
for n,r in seam['rows'].items():
 a=r['25']
 if a['skin_transition_samples']:lines.append(f"|{n}|{a['step_depth_max_mm']:.3f}|{a['step_depth_p95_mm']:.3f}|{a['projected_width_mm']:.3f}|")
lines+=['\n体: 27,298三角形、1成分、境界0、退化面0。退化面2枚を削除し同位置のふち1組を接続。頂点位置変化0mm、対象外のウェイト変化0、漏れ0。','\n頭: 15,887三角形、境界3,861本、224成分、退化面0。小片は外から見えない43成分85面と、キャップ内の13成分28面を除いた。見える222小片698面は残した（主成分2つを含めて全224成分）。','\n輪郭IoU: '+json.dumps(m['silhouette']),'\n合否: '+json.dumps(m['acceptance'],ensure_ascii=False),'\nまだ足りないところ: 外に見える髪の裏と首元の小片、上向き首元突出の3mm上限、上半身と組み合わせのP99および右のつぶれ面数、側面90度の輪郭0.985。腕上げの脇の板は工程6bへ残す。','\n### 置いた仮定']+['- '+x for x in m['assumptions']]+['\nコミットなし。作業用ファイルの書き込みはscripts/toy-characterと.work/toy-characterのみ。9回目の入力ファイルは不変。最終ポーズ値は上の「ポーズの測定」およびmetrics.json。']
with (out/'log.md').open('a') as f:f.write('\n'.join(lines)+'\n')
snap=out/'script-snapshot';snap.mkdir(exist_ok=True)
for source in Path(__file__).parent.glob('*.py'):shutil.copyfile(source,snap/source.name)
print(json.dumps({'overall_pass':m['overall_pass'],'acceptance':m['acceptance'],'required_files':len(required)},ensure_ascii=False))
