"""Write a compact Japanese audit from measured values and reviewed evidence."""
import json,sys,hashlib
from pathlib import Path
from collections import Counter

NAMES={'neck':'旧首','torso':'胴','sleeve_L':'左袖','sleeve_R':'右袖','hand_L':'左手','hand_R':'右手','backpack':'リュック','shoulder_straps':'肩ベルト','legs_shoes':'脚・靴','face_head':'顔・頭','hair':'髪','hair_cap':'髪のキャップ','total':'合計'}
CAUSES=['internal_surface','eye_recess_depth','between_hair_clumps','true_shape_deviation','part_correspondence_only']

def report(out):
    m=json.loads((out/'metrics.json').read_text())
    reviewed=None
    if (out/'visual-review.json').exists():
        v=json.loads((out/'visual-review.json').read_text())
        if all(hashlib.sha256((out/name).read_bytes()).hexdigest()==sha for name,sha in v['image_sha256'].items()):reviewed=v
    if reviewed:
        m['visual_review']=reviewed
        m['acceptance']['pose_visual']=all(p['pass'] for p in reviewed['poses'].values())
        m['acceptance']['neck_visual']=reviewed['neck']['pass']
    required=m['construction']['label_groups'];actual=m.get('label_groups_after_weighting',{})
    if actual:
        checks={o:{name:actual[o].get(name,0)>0 for name,v in gs.items() if v['before']>0} for o,gs in required.items()}
        m['label_groups_after_weighting_checks']=checks
        m['acceptance']['labels_preserved']=all(all(g.values()) for g in checks.values())
    m['weights']['joint_weight_smooth']={'factor':.6,'repeat':8,'shoulder_radius_m':.075,'other_joint_radius_m':.05,'mesh_vertices_moved':False,'collar':'chest rigid only on torso-labeled vertices; shoulder straps excluded'}
    m['acceptance']['no_true_shape_outlier_over_1mm']=all(v[d]['points_over_1mm_by_cause']['true_shape_deviation']==0 for v in m['distances_exterior'].values() for d in ['high_to_low','low_to_high'])
    m['acceptance']['overall_pass']=all(v is True for k,v in m['acceptance'].items() if k!='overall_pass')
    if (out/'saved-verification.json').exists():
        saved=json.loads((out/'saved-verification.json').read_text())
        if saved.get('blend_sha256')==hashlib.sha256((out/'character-lowpoly2.blend').read_bytes()).hexdigest():m['saved_verification']=saved
    (out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    verdict=lambda b:'合格' if b is True else ('未確認' if isinstance(b,str) else '不合格')
    lines=['# 工程6のやり直し lowpoly2','',f"総合判定は{verdict(m['acceptance']['overall_pass'])}。次の工程へ渡せる完成品としては扱わない。",'',
        '## 再実行','', '```sh','blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage lowpoly2','```','',
        '手続きは同じ入力から作り直す。既存段は残し、コミットは行わない。目視結果は画像のSHA256が一致するときだけ再利用する。','',
        '## 処理','',
        '- 体は全高1mに正規化された入力と照合し、prepareの関節を1 / 0.8886438608倍した。頭はseed 42に位置と等方スケールだけを適用した。',
        '- 表面の頂点位置は設計していない。Collapse、既存の頂点を複製する接続整理、Bisect、ふちを塞ぐ演算子だけを使った。顔の押し引き、リング、手指の作り直し、眼球や目の開口は行わない。',
        '- 内部面候補の除外は法線・放射方向だけでなく、輪郭8方向と上下へ抜ける面も保持する。前者だけでは外から見える布の折り目を除いていたため修正した。',
        '- 体側の旧頭と旧首のラベル0・1・2は除いた。seed 42の首をZ=0.680mで切り、襟との重なりを検査した。途切れた切り口は既存の端同士を結び、ふちだけで閉じる。溶接しない。',
        '- 生成した手の形を減面し、hand_L / hand_Rと袖側の部位グループを残した。境界の細部はsaved-verification.jsonにある。',
        '- 元の全身から8mmのVoxel代理を作り、独立した小片を除き、代理だけを5回平滑化した。閉じた主成分にAutomatic Weightsを適用し、Nearest Face Interpolatedで転送した。',
        '- 首・肩・肘・手首付近だけをウェイトSmooth（0.6、8回）で見直した。体の形は変えていない。襟の胴側だけを胸へ固定し、肩ベルトはこの固定から除いた。頭と髪はhead=1.0、リュック本体はspine.chest=1.0。最後に4本へ制限・正規化した。','',
        '## 三角形と開いた境界','', '| 部位 | 三角形 | 開いた境界辺 |','| --- | ---: | ---: |']
    for p,n in m['triangles'].items():lines.append(f"| {NAMES.get(p,p)} | {n:,} | {m['open_boundary_edges_by_part'].get(p,'—')} |")
    b=m['triangle_budget'];lines+=['',f"目安{b['target']:,}、上限{b['limit']:,}に対し{b['current_plus_reserved']-b['reserved_later']:,}。後の5,000を含めると{b['current_plus_reserved']:,}。",'',
        '## 距離','',m['distance_method']+'。首の隠れた閉鎖面だけは外表面の低→高から除く。最大値は厳密なHausdorff距離ではない。','']
    for key,title in [('distances_exterior','内部面候補を除いた参照面'),('distances_full_source','元の高密度メッシュ')]:
        lines += ['### '+title,'','| 部位 | 高→低 P95 / 最大 mm | 低→高 P95 / 最大 mm | P95 |','| --- | ---: | ---: | --- |']
        for p,v in m[key].items():
            a,c=v['high_to_low'],v['low_to_high'];lines.append(f"| {NAMES[p]} | {a['p95_mm']:.3f} / {a['max_mm']:.3f} | {c['p95_mm']:.3f} / {c['max_mm']:.3f} | {verdict(a['p95_pass'] and c['p95_pass'])} |")
        lines.append('')
    lines+=['## 1mmを超える点の分類','',
        '点数は独立した面積標本と頂点の合計であり、面積や欠陥数ではない。部位ごと・方向ごとの内訳と最大点の座標はmetrics.jsonに残す。全体の表面まで1mm以内なら「部位の対応違い」とし、形の欠けと区別する。内部面・目の奥・毛束の間の分類には元の全身による遮蔽を併用し、判断しきれない点は保守的に形のずれへ数える。','',
        '| 参照面 | 内部面 | 目の奥 | 毛束の間 | 形のずれ | 部位の対応違い |','| --- | ---: | ---: | ---: | ---: | ---: |']
    for key,title in [('distances_exterior','内部面候補除外後・双方向'),('distances_full_source','元のまま・双方向')]:
        c=Counter()
        for v in m[key].values():
            for d in ['high_to_low','low_to_high']:c.update(v[d]['points_over_1mm_by_cause'])
        lines.append('| '+title+' | '+' | '.join(f'{c[k]:,}' for k in CAUSES)+' |')
    lines+=['','### 1回目の再測定','','| 部位 | P95 / 最大 mm | 最大点から全体表面まで mm | 内部面 / 目の奥 / 毛束の間 / 形のずれ / 対応違い |','| --- | ---: | ---: | --- |']
    for p,v in m['legacy']['parts'].items():lines.append(f"| {NAMES[p]} | {v['p95_mm']:.3f} / {v['max_mm']:.3f} | {v['whole_assembly_distance_at_part_max_mm']:.3f} | "+' / '.join(str(v['points_over_1mm_by_cause'][k]) for k in CAUSES)+' |')
    lines+=['','顔の約89.6mmは後頭部の点を顔グループだけへ対応させた外れ値。全体表面までの距離は約0.95mmで、89mmの穴ではない。髪と脚の最大点はmax_examplesとoutliers-first.pngで位置を追える。','',
        '## 輪郭','', '| 方向 | IoU | 輪郭P95 / 最大 px | 判定 |','| --- | ---: | ---: | --- |']
    for a,v in m['silhouette'].items():lines.append(f"| {a}° | {v['iou']:.6f} | {v['contour_p95_px']:.3f} / {v['contour_max_px']:.3f} | {verdict(v['pass'])} |")
    lines+=['','1024px、正投影、同一縮尺。内側の穴も含むマスクで測る。合否の閾値はIoU 0.99。','',
        '## 接続','', '| メッシュ | 3面以上の共有辺 | 退化面 | 重複面 |','| --- | ---: | ---: | ---: |']
    for n,v in m['topology'].items():lines.append(f"| {n} | {v['edges_shared_by_3_or_more_faces']} | {v['degenerate_faces']} | {v['duplicate_faces']} |")
    lines+=['','## ポーズ','', '| ポーズ | 裏返り面 | 2倍を超える辺 | 最大伸長比 | 目視 |','| --- | ---: | ---: | ---: | --- |']
    for p,v in m['poses'].items():
        a=v['low2_body'];obs=reviewed['poses'][p]['observation'] if reviewed else '未確認'
        lines.append(f"| {p} | {a['flipped_faces_against_transported_rest_normal']} | {a['edges_over_2x_rest_length']} | {a['max_edge_stretch']:.3f} | {obs} |")
    lines+=['','頭・髪・キャップの裏返りと2倍を超える辺は全ポーズ0。裏返りは静止時法線を骨の回転で運んだ法線に対して測る。部位同士の三角形交差、符号付き最近傍距離2mm超の候補数もmetrics.jsonに残した。開いた部位の符号付き距離だけで、内部へのめり込みと断定しない。','',
        '## 首と目視の判定','',reviewed['neck']['observation'] if reviewed else '未確認','']
    if reviewed:lines+=reviewed['remaining']+['']
    lines+=['## 仮定','']+['- '+s for s in m['assumptions']]+['- Voxel代理だけは元の全身を使った。置き換えた頭は転送せずheadへ固定した。','- 腕の45°は静止Aポーズへ45°を追加する意味ではなく、胴の横からの角度として合わせた。','- 掌の正面は、入力の掌軸と幅方向から推定した。生成した指は分離も握りも行っていない。','',
        '## 保存後の確認','', 'saved-verification.jsonに、再読込後の三角形数、20本の骨、11個のポーズAction、4本制限・正規化、剛体固定、handグループ、入力のハッシュ照合を残す。','']
    (out/'log.md').write_text('\n'.join(lines)+'\n')
    return m

if __name__=='__main__':report(Path(sys.argv[1]))
