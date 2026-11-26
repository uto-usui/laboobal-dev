"""Append measured sixth-pass results after an explicit image review."""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());v=json.loads((out/'visual-review.json').read_text())
if v['blend_sha256']!=m['saved_verification']['blend_sha256']:raise RuntimeError('Visual review is for a different saved blend')
for f,digest in v['image_sha256'].items():
    if hashlib.sha256((out/f).read_bytes()).hexdigest()!=digest:raise RuntimeError('Reviewed image changed: '+f)
m['visual_review']=v;m['acceptance'].update({'visual':False,'neck_hidden':v['neck_hidden'],'no_fragments_or_holes_in_poses':False,'all_poses':all(m['numeric_pose_acceptance'].values()) and v['neck_hidden'] and v['arm_visual_pass'] and v['adduction_visual_pass']});m['overall_pass']=all(m['acceptance'].values())
assumptions=[
'試しのfinal.pyの値を正とする。脇の切り離しはz=0.40〜0.567m、左右のx範囲、6近傍、境界の1格子拡張、距離測定除外の2格子拡張まで同じ。26方向の判定は同じ漸化式を各直線で1回ずつ走査して計算した。小格子で試しの反復計算と全点一致も確認した。',
'前開きの底は、元の色付き面を1000px・180mm幅の正投影で描き、金色の両縁が合流する位置とした。644.23mm、読取り誤差は約0.5mm。形の頂点を作る数値ではなく、元の見える特徴の測定値。',
'体の切断は5回目と同じく体全体への平面切断と解釈した。このため襟上部も除かれた。襟を残す別の切断や形状の追加はしていない。首の合格条件を満たさない原因の一つ。',
'頭は元の下端より下へ延長・移動しない。元の下端668.577mmを切断平面に指定したが、内部面の整理で実際の残存下端は669.132mmになった。この高さには切断でできる縁がなく、頭の閉鎖面は0枚。既存の首元の境界は開いたまま記録した。',
'頭は約9000三角形を全体の予算として解釈し、顔4800・髪3600・キャップ600を目標に、3回目と同じ内部面の整理・Collapse・顔の保護を使った。結果は9634三角形。位置と大きさは変えていない。',
'各部位の断面は、骨の中点に垂直な面で、骨の中点を含む外周（なければ該当ラベルの最も近い外周）と、その内側にあるすべての輪を数えた。別の手足や装備の独立した輪は別記した。脇は指定の水平断面でも数えた。',
'距離の合否は処理後から元の全体の面までとし、部位は処理後のラベルで分けた。切り離しの近傍と新しい水平閉鎖面を除いた。元から処理後は内部の殻を含む参考値。最終面は部位ごとの150000面積標本と全使用頂点、試しとの一致はmarching cubesの全頂点で測った。',
'腕を体へ寄せる10度は、元のAポーズから左右とも正面内で体へ10度回すものとした。ほかの11ポーズ、仮の骨、1024pxの8方向輪郭測定は5回目を流用した。',
'ウェイトの再調整では肩45mm外の袖への脊柱の影響を制限し、肩100mm・肘75mm・リュック接点35mm・切断上端35mmだけをSmoothした（係数0.6、40回）。リュックと切断上面は胸に固定した。切り離しの新面の部位ラベルを生き残った格子側と照合したが、変更対象は0頂点だった。面の座標変更は0。']
m['assumptions']=assumptions
(out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
lines=['\n## 工程6・6回目の最終判定\n','不合格。中身の生成は試しのfinal.pyと完全一致したが、首の切断・重なり、均一化後の距離と輪郭、肩・脇・背骨の変形が基準を満たさない。コミットしていない。\n',
'### 中身の生成と再現\n','試しのfinal.pyを入力からそのまま再実行し、格子の差0セル、marching cubesの面配列が完全一致、頂点位置の差0mを確認した。除外後のP95はすべて提示値と小数1桁まで一致した。脇で除いた格子点は9574、距離から除いたmarching cubesの頂点は13048。\n',
'| 部位 | 試し再現P95 mm | 均一化後の三角形 | 均一化後→元 P95 mm | 元→均一化後 P95 mm（参考） |','| --- | ---: | ---: | ---: | ---: |']
for part,count in m['triangles'].items():
 if part=='total':continue
 a=m['filled_distances'].get(part,{}).get('p95_mm');b=m['distances_full_source'].get(part,{})
 fmt=lambda x:'—' if x is None else f'{x:.3f}'
 lines.append(f"| {part} | {fmt(a)} | {count} | {fmt(b.get('low_to_high',{}).get('p95_mm'))} | {fmt(b.get('high_to_low',{}).get('p95_mm'))} |")
lines+=['\n古い頭・首の充填距離は、胴などの形の合否に含めない。最終の体は29628三角形、頭は9634、合計39262。後工程用5000を加えて44262。QuadriFlowの要求は17500四角面、出力14812四角面。12本の境界辺を既存の縁だけの4面で閉じ、三角形化とNearest Surface PointのShrinkwrapを行った。体の境界辺・3面以上の共有辺・退化面は0、成分は1。\n',
'### 首の測定\n']
n=m['construction']['neck']
for key in ['collar_top_m','front_opening_bottom_m','body_cut_m','head_cut_m','head_bottom_m','overlap_m','overlap_shortfall_m']:lines.append(f"- {key}: {n[key]*1000:.6f} mm")
lines+=['\n元の頭の下端は668.576896mm。要求される頭の切断高さ632.23mmより高いため元の下端で止めた。整理後の実際の下端は669.132054mm。重なりはなく、26.902054mmの空間ができた。必要な10mmの重なりに対して36.902054mm足りない。体全体を切ったため、襟の上部も失った。立ち姿からすき間と平たい上面が見え、首を曲げても隠れない。\n',
'### 断面\n','| 部位 | 充填後 領域/穴 | 均一化後 領域/穴 |','| --- | ---: | ---: |']
for key,a in m['sections']['after'].items():
 b=m['sections']['reduced'][key];lines.append(f"| {key} | {a['filled_regions']}/{a['holes']} | {b['filled_regions']}/{b['holes']} |")
lines+=['\n充填直後の右すねの骨直交断面には0.599平方mmと0.085平方mmの小さな穴がある。均一化後はなくなる。首の断面は切断により消えるので0領域。\n',
'| 高さ m | 充填後 左/右 領域 | 均一化後 左/右 領域 | 腕と胴 |','| --- | ---: | ---: | --- |']
for z,rows in m['armpit_sections_after_uniform'].items():
 a=m['grid_and_r']['armpit_sections'];lines.append(f"| {z} | {a['L'][z]['regions']}/{a['R'][z]['regions']} | {rows['L']['regions']}/{rows['R']['regions']} | {'別' if all(rows[s]['arm_torso_separate'] for s in ['L','R']) else '接続'} |")
lines+=['\n充填後に一部3領域となるのは独立した小領域も数えているためで、腕と胴がつながるという意味ではない。均一化後は左右とも全高で2領域（胴側1、腕1）、脇を埋める面はない。\n',
'試しのfinal.pyの出力も省略せずprobe-replay/stdout.logとmetrics.jsonに保存した。z=0.05、0.35、0.65mの水平断面ではそれぞれ穴2と出る。試しと全く同じ形なので、「全断面が穴0」とは報告しない。同スクリプトの近似投影IoUは正面0.9797、側面0.9794（旧頭の上側を除外）。最終の8方向レンダによるIoUとは別の参考値。\n',
'### 輪郭\n','| 向き | IoU | 0.985以上 |','| --- | ---: | --- |']
for angle,r in m['silhouette'].items():lines.append(f"| {angle} | {r['iou']:.6f} | {'合格' if r['pass'] else '不合格'} |")
lines+=['\n### 全ポーズの体全体と関節別の数値\n','裏返りは5回目と同じ、骨の回転で運んだ元の法線に対する判定。領域のふちは三角形・辺のいずれかの頂点が入るものを含むため、関節間の数は重複する。\n','| ポーズ | 領域 | 裏返り面 | 2倍超の辺/全辺 | 割合 % | 最大伸び |','| --- | --- | ---: | ---: | ---: | ---: |']
for pose,rows in m['joint_pose_metrics'].items():
 for key in ['whole_body','neck','chest','shoulder','armpit','elbow','crotch']:
  r=rows[key];lines.append(f"| {pose} | {key} | {r['flipped_faces']} | {r['edges_over_2x']}/{r['tested_edges']} | {r['edges_over_2x_fraction']*100:.4f} | {r['max_stretch']:.4f} |")
lines+=['\n左右個別の肩・脇・肘の値もjoint-pose-metrics.jsonとmetrics.jsonに保存した。\n','| 腕の5回目と共通の判定範囲 | 裏返り | 2倍超の辺 % | 最大伸び |','| --- | ---: | ---: | ---: |']
for pose,r in m['elbows'].items():lines.append(f"| {pose} | {r['flipped_faces']} | {r['edges_over_2x_fraction']*100:.4f} | {r['max_stretch']:.4f} |")
lines+=['\n### ポーズの目視\n']
for pose,description in v['poses'].items():lines.append(f'- {pose}: {description}')
s=m['saved_verification'];lines += [f"\nウェイトは最大{s['max_positive_influences_including_tiny_weights']}本、未割当0、禁止された0.05超の影響{s['forbidden_over_005']}、正規化誤差最大{s['maximum_weight_sum_error_including_tiny_weights']:.3g}。リュック{s['backpack_vertices']}頂点の胸1.0固定を保存後に再確認した。ウェイト工程で変わった面の位置は{s['max_surface_position_change_during_weights_mm']:.8f}mm。頭の位置・大きさは変更なし。保存したBlendを開き直し、全12ポーズの数値一致と仮の骨の一致を確認した。\n",
'追加のウェイト調整前の腕は左24面・2.936%・9.770倍、右27面・2.929%・9.574倍。追加後は左27面・2.508%・15.709倍、右20面・2.012%・15.701倍。10度内寄せは体全体の裏返りが4から54に増えた。背骨の最大伸びは減ったが、腕は改善したと扱わない。形を変えずに行った再調整の限界として、調整前後の数値と最終形を残した。\n',
'### 置いた仮定\n']
lines.extend('- '+x for x in assumptions)
lines+=['\n### 保存物と確認\n','character-lowpoly6.blend、metrics.json、各段のチェックポイント、部位ごとの距離、全ポーズの全体・局所数値、試しの完全再実行結果を保存した。指定11画像を開いて確認し、画像とBlendのSHA256をvisual-review.jsonに固定した。\n',
'26方向の走査と試しの反復計算の小格子での一致、試し本体との全格子・全頂点・全面の一致、保存し直さず開き直したBlendの全ポーズ一致、形状保持、入力の保持を確認した。Blender依存の処理はbuild.py --stage lowpoly6から、外部処理はvenv-geoから行った。\n',
'残る不足は、首の形の連続性、均一化後の胴・手・肩ベルト・脚の距離、全8方向の輪郭、腕上げと内寄せの肩・脇の崩れ、背骨を左右へ曲げた胸・肩の崩れ。工程7へ進める品質に達していない。\n']
text='\n'.join(lines)+'\n'
with (out/'log.md').open('a') as stream:stream.write(text)
(out/'report.md').write_text(text)
print(json.dumps({'overall_pass':m['overall_pass'],'acceptance':m['acceptance']},ensure_ascii=False))
