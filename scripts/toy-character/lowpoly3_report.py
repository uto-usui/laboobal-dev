"""Japanese report generated from measured data and hash-bound visual review."""
import hashlib,json,sys
from pathlib import Path
NAMES={'neck':'首の肌','torso':'胴・襟・首','sleeve_L':'左袖','sleeve_R':'右袖','hand_L':'左手','hand_R':'右手','backpack':'リュック','shoulder_straps':'肩ベルト','legs_shoes':'脚・靴','face_head':'顔・頭','hair':'髪・キャップ','total':'合計'}
def report(out):
    m=json.loads((out/'metrics.json').read_text());review=None
    if (out/'input-body-verification.json').exists():m['input_body_verification']=json.loads((out/'input-body-verification.json').read_text())
    if (out/'saved-verification.json').exists():
        saved=json.loads((out/'saved-verification.json').read_text())
        if saved['blend_sha256']==hashlib.sha256((out/'character-lowpoly3.blend').read_bytes()).hexdigest():
            m['saved_verification']=saved
            m['weights']['objects']={('low3_body' if k=='low3_body' else 'low3_head'):v for k,v in saved['weights'].items()}
    if (out/'visual-review.json').exists():
        r=json.loads((out/'visual-review.json').read_text())
        if all(hashlib.sha256((out/k).read_bytes()).hexdigest()==v for k,v in r['image_sha256'].items()):review=r
    if review:
        m['visual_review']=review
        m['acceptance'].update({'pose_visual':all(v['pass'] for v in review['poses'].values()),'neck_visual':review['neck']['pass'],'fragment_visual':review['fragments']['pass'],'face_visual':review['face']['pass'],'adhesion_visual':review['adhesion']['pass']})
    m['acceptance']['original_body_identity']=m.get('input_body_verification',{}).get('pass',False)
    m['acceptance']['weights']=all(v['max_influences']<=4 and not v['unweighted_vertices'] and v['max_normalization_error']<1e-5 for v in m['weights']['objects'].values()) and not m['weights']['overrides']['rigid_neck_head_leak_vertices']
    m['acceptance']['overall_pass']=all(v is True for k,v in m['acceptance'].items() if k!='overall_pass')
    (out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    verdict=lambda v:'合格' if v is True else '不合格' if v is False else '未確認'
    lines=['# 工程6・3回目 lowpoly3','',f"総合判定: {verdict(m['acceptance']['overall_pass'])}。",'',
      '再実行: `blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage lowpoly3`','',
      '元の体から旧頭のラベル0・1だけを除き、首・襟を残して1.5mmでVoxel化。頭とキャップは切断後に1mmでVoxel化した。体の外側面の抽出や、頂点座標での造形・形の補正は行っていない。頭を元面Collapseへ戻す場合だけ、元の面の内部面候補を整理する。首の切り口は既存のふちだけで塞ぎ、首以外の穴は新たに塞がない。','',
      '## 閉じた面の検査','', '| 段 | 部位 | 境界辺 | 3面以上の共有辺 | 成分 | 三角形 |','| --- | --- | ---: | ---: | ---: | ---: |']
    for name,t in m['construction']['voxel'].items():
        for step,v in [('Voxel直後',t['before_shell_removal']),('小成分除去後',t['after'])]:lines.append(f"| {step} | {name} | {v['boundary_edges']} | {v['edges_shared_by_3_or_more_faces']} | {v['connected_components']} | {v['triangles']:,} |")
    for name,v in m['topology'].items():lines.append(f"| 採った減面後 | {name} | {v['boundary_edges']} | {v['edges_shared_by_3_or_more_faces']} | {v['connected_components']} | {v['triangles']:,} |")
    lines+=['','## 頭の選択','',('1.0mm Voxel＋部位ごとのCollapse' if m['head_selection']['distance_pass'] and 'Voxel' in m['head_selection']['selected'] else '元の面をCollapseで減らす方法に戻した。'),('Voxel候補の顔が0.3mmの距離基準、または目のくぼみの目視基準を満たさなかったため。元面の処理でも境界や成分の数は隠さず記録する。' if 'fallback' in m['head_selection']['selected'] else '顔の双方向P95が内部面を分けた集計で0.3mm以下。目のくぼみは拡大画像でも確認する。'),'',
        '| Voxel候補の顔 | 元のまま P95 mm | 内部面分離後 P95 mm |','| --- | ---: | ---: |']
    for d in ['high_to_low','low_to_high']:
        v=m['head_selection'][d];lines.append(f"| {d} | {v['p95_mm']:.3f} | {v['surface_p95_mm']:.3f} |")
    if review:lines+=['',review['face']['observation']]
    lines+=['','## 面の配分','', '| 部位 | 三角形 |','| --- | ---: |']
    for name,n in m['triangles'].items():lines.append(f'| {NAMES.get(name,name)} | {n:,} |')
    lines+=['','| 部位の条件 | 実測 | 下限 / 上限 | 判定 |','| --- | ---: | ---: | --- |']
    for name,v in m['part_allocation'].items():lines.append(f"| {NAMES.get(name,name)} | {v['triangles']:,} | {v.get('minimum','—')} / {v.get('maximum','—')} | {verdict(v['pass'])} |")
    b=m['triangle_budget'];lines+=['',f"今回{m['triangles']['total']:,}面、後工程5,000面を加えると{b['current_plus_reserved']:,}面。",'',
        '## 双方向距離','','部位・方向ごとに面積に比例した150,000点と全頂点を測った。元の高密度メッシュとの双方向で、外側だけを選び出した面とは比較しない。最大値は厳密なHausdorff距離ではない。','判定は内部面を含む元のままの双方向P95に対して行う。元の面からの8方向の遮蔽と全体までの1mmの距離で内部面を分けたP95も参考として併記する。目の奥・毛束の間・部位の対応違いは参考P95からも除かない。1mm超の分類は下表に示す。','',
        '| 部位 | 元のまま 高→低 P95 / 最大 mm | 元のまま 低→高 P95 / 最大 mm | 内部面分離後 高→低 / 低→高 P95 mm | 判定 |',
        '| --- | ---: | ---: | ---: | --- |']
    for name,v in m['distances_full_source'].items():
        a,b=v['high_to_low'],v['low_to_high'];lines.append(f"| {NAMES[name]} | {a['p95_mm']:.3f} / {a['max_mm']:.3f} | {b['p95_mm']:.3f} / {b['max_mm']:.3f} | {a['surface_p95_mm']:.3f} / {b['surface_p95_mm']:.3f} | {verdict(a['p95_pass'] and b['p95_pass'])} |")
    causes=['internal_surface','eye_recess_depth','between_hair_clumps','true_shape_deviation','part_correspondence_only']
    lines+=['','| 部位・方向 | 内部面 | 目の奥 | 毛束の間 | 形のずれ | 対応違い |','| --- | ---: | ---: | ---: | ---: | ---: |']
    for name,v in m['distances_full_source'].items():
        for d,a in v.items():lines.append('| '+NAMES[name]+' '+d+' | '+' | '.join(str(a['points_over_1mm_by_cause'][k]) for k in causes)+' |')
    lines+=['','## 輪郭','', '| 方向 | IoU | 輪郭P95 / 最大 px | 判定 |','| --- | ---: | ---: | --- |']
    for name,v in m['silhouette'].items():lines.append(f"| {name}° | {v['iou']:.6f} | {v['contour_p95_px']:.3f} / {v['contour_max_px']:.3f} | {verdict(v['pass'])} |")
    neck=m['construction']['neck'];lines+=['','## 首','',f"体の首: {neck['source_body_neck_z_min_m']*1000:.3f}〜{neck['source_body_neck_top_m']*1000:.3f}mm。元の頭下端: {neck['source_head_bottom_m']*1000:.3f}mm。切断: {neck['cut_plane_m']*1000:.3f}mm。入力での上下の重なり: {neck['overlap_m']*1000:.3f}mm。",f"半径の測定断面: Z={neck['radius_section_z_m']*1000:.3f}mm。体 P05/50/95: {neck['body_neck_section'].get('radius_p05_p50_p95_mm')}mm。頭: {neck['head_neck_section'].get('radius_p05_p50_p95_mm')}mm。元の内部面を含む断面なので円柱の半径ではない。"]
    if neck.get('after_reduction'):
        a=neck['after_reduction'];lines+=['',f"処理後の首の肌上端は{a['body_skin_neck_top_m']*1000:.3f}mm、頭下端は{a['head_bottom_m']*1000:.3f}mm、差は{a['actual_vertical_overlap_m']*1000:.3f}mm。"]
    if review:lines+=['',review['neck']['observation']]
    lines+=['','## ウェイトとポーズ','',('減面した閉じた体へ直接Automatic Weightsを適用した。' if m['weights']['fallback'] is None else '減面した体のAutomatic Weightsが失敗したため、2回目と同じ閉じた代理メッシュから転送した。'),'', '| ポーズ | 体の裏返り面 | 2倍超の辺 | 最大伸長比 | 目視 |','| --- | ---: | ---: | ---: | --- |']
    for pose,v in m['poses'].items():
        a=v['low3_body'];obs=review['poses'][pose]['observation'] if review else '未確認';lines.append(f"| {pose} | {a['flipped_faces_against_transported_rest_normal']} | {a['edges_over_2x_rest_length']} | {a['max_edge_stretch']:.3f} | {obs} |")
    lines+=['','## 合否','']+[f'- {k}: {verdict(v)}' for k,v in m['acceptance'].items()]
    if review:lines+=['','## 足りないところ','']+['- '+s for s in review['remaining']]
    lines+=['','## 仮定','']+['- '+s for s in m['assumptions']]
    (out/'log.md').write_text('\n'.join(lines)+'\n')
if __name__=='__main__':report(Path(sys.argv[1]))
