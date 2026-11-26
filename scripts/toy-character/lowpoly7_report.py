"""Write seventh-pass numeric evidence after an explicit, hash-bound image review."""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'visual-review.json').read_text())
assert v['blend_sha256']==m['saved_verification']['blend_sha256']
for name,digest in v['image_sha256'].items():assert hashlib.sha256((out/name).read_bytes()).hexdigest()==digest,name
m['visual_review']=v
m['acceptance']['visual']=v['overall_visual_pass'];m['acceptance']['neck_visual']=v['neck_seam_hidden_all_views'];m['overall_pass']=all(m['acceptance'].values())
m['assumptions']=[
'首の中心軸は、減面した頭のz=690mmの首元断面のXY範囲の中心を通る鉛直線とした。仮の骨の軸は実際の頭の首元の外を通るため使わない。各水平面で同じ軸から64方向を測った。',
'首の半径はラベル2の肌と、頭のラベル0の顔・肌の外側を測った。髪は肌のつなぎ目を隠す面として数えない。肌の面に交わらない方向は生の半径をnull、差の計算では半径0とした。体または頭の断面が全くない高さは候補外とし、頭が64方向を覆わない高さは包含の合格にしない。',
'襟の全体上端700.582mmは横襟を含み、露出した肌のウェイト移行域より高い。そのため移行の下端は元の首の肌ラベル2の最下端661.151mmとし、つなぎ目の10mm下からその高さまでをhead→neck→spine.chestのsmoothstepで移した。襟と肩の面は切っていない。',
'6回目の調整前はweights-before-local-widths.jsonの段と解釈した。Automatic Weights、部位制限、12回の関節Smoothは維持し、追加40回の局所Smoothは使わない。首の指定ウェイトは関節Smooth後に設定し直した。',
'頭は6回目が用いた内部面整理・既存の縁での閉鎖・部位別Collapseと顔の保護を再利用した。元の位置と大きさを保持し、約9000三角形の予算は顔4800・髪3600・キャップ600の目標とした。',
'首の切断でできた不正な縁は既存の縁だけで閉じ、重複面・非多様体の辺・頂点を整理した。整理で既存頂点から動いた距離は0mm。除去した入力面2枚は691mmの切断面上だけにある。平面外の襟との境界は9mm幅を持つため、首の平面切断の合格にはしなかった。',
'中身の生成、脇の切り離し、QuadriFlow、Shrinkwrap、距離の除外範囲、仮の骨、全12ポーズ、8方向の輪郭測定は6回目と同じ。3倍超の位置は立ち姿の座標の高さで記した。',
]
m['neck_measurements']=m['construction']['neck']['radial_measurement']
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
lines=['\n## 工程6・7回目の判定\n',('合格。' if m['overall_pass'] else '不合格。')+' 首の処理だけを変更し、測定と指定画像の目視まで実施した。コミットしていない。\n','### 首\n']
n=m['construction']['neck'];r=n['radial_measurement']
for key in ['selection','seam_height_mm','maximum_protrusion_mm','head_cut_height_mm','actual_head_bottom_mm','overlap_mm']:lines.append(f'- {key}: {r[key]}')
lines+=['\n'+v['neck_observation']+'\n','| 高さmm | 体半径−頭半径の最大mm | 全方向で内側 |','| ---: | ---: | --- |']
for row in r['heights']:
 value=row['max_body_minus_head_mm'];lines.append(f"| {row['height_mm']} | {value if value is not None else '測定なし'} | {row['body_inside_head_all_directions']} |")
lines+=['\n### 三角形数と距離\n','距離は処理後→元の面までのP95。逆方向はmetrics.jsonに参考値として保存。\n','| 部位 | 三角形 | P95 mm |','| --- | ---: | ---: |']
for part,count in m['triangles'].items():
 if part=='total':continue
 d=m['distances_full_source'].get(part,{}).get('low_to_high',{}).get('p95_mm');lines.append(f'| {part} | {count} | {d} |')
lines.append(f"\n合計{m['triangles']['total']}三角形。後工程の5000面を含む予算: {m['triangle_budget']['current_plus_reserved']} / 60000。\n")
lines+=['### 輪郭\n','| 角度 | IoU |','| ---: | ---: |']
for angle,row in m['silhouette'].items():lines.append(f"| {angle} | {row['iou']:.6f} |")
lines+=['\n### 体全体と各関節の全ポーズ\n','| ポーズ | 領域 | 裏返り面 | 2倍超の辺 / 全辺 | 割合% | 最大伸び |','| --- | --- | ---: | ---: | ---: | ---: |']
for pose,regions in m['joint_pose_metrics'].items():
 for region,row in regions.items():lines.append(f"| {pose} | {region} | {row['flipped_faces']} | {row['edges_over_2x']}/{row['tested_edges']} | {row['edges_over_2x_fraction']*100:.4f} | {row['max_stretch']:.4f} |")
lines+=['\n### 3倍を超えた辺\n','| ポーズ | 辺数 | 最大伸び | 部位 | 立ち姿の高さmm | 拡大画像 |','| --- | ---: | ---: | --- | --- | --- |']
for pose,row in m['stretch_over_3x'].items():
 e=row['max_edge'];lines.append(f"| {pose} | {row['count']} | {e['stretch']:.4f} | {', '.join(e['parts'])} | {e['height_range_mm']} | {e.get('close_render','各群の代表画像を参照')} |")
 lines.append('各部位の代表: '+', '.join(f"{key}: {r['close_render']}" for key,r in row['group_representatives'].items()))
lines+=['\n### 目視\n']+[f'- {key}: {value}' for key,value in v['observations'].items()]
lines+=['\n### 検証\n','```json',json.dumps(m['saved_verification'],ensure_ascii=False,indent=2),'```','\n### 合否\n','```json',json.dumps(m['acceptance'],ensure_ascii=False,indent=2),'```','\n### 置いた仮定\n']+['- '+x for x in m['assumptions']]
lines+=['\n### 残る不足\n',v['remaining']]
report='\n'.join(lines)+'\n';(out/'report.md').write_text(report)
with (out/'log.md').open('a') as stream:stream.write(report)
print(json.dumps({'overall_pass':m['overall_pass'],'acceptance':m['acceptance']},ensure_ascii=False))
