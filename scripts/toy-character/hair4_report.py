"""Write the measured hair4 audit, including every retained boundary path."""
import collections
import json
import re


def report(out):
    d=json.loads((out/'metrics.json').read_text());g=d['geometry'];diag=d['diagnosis'];rows=d['comparison']
    text=['# Bの髪の穴を塞いだ結果','',
          '髪内部の70輪を既存のふちの頂点だけで閉じ、935三角形を追加した。キャップは使わず、髪専用UVと色・法線・粗さを焼き直した。UVが変わるためmetallicも同じ元材質から焼き直した。',
          '元の髪の頂点位置・既存三角形・ウェイトは保持した。体と顔の位置・法線・UV・スムーズ設定も一致した。3面以上で共有する辺は22本のまま、退化面・重複面は0。',
          '', '## 見立ての検証','',
          '最初の選別を元の三角形への正確な最近傍距離と髪への距離差1mmで再現し、充填した頭1,232,686面から髪962,438面を残し、270,248面を外したことを確認した。',
          '今回塞いだ輪の頂点から3mm以内にある、外された充填面の重心20,839件を集計した。最近傍の元面のラベルはすべて顔0で、髪1は0件だった。髪への距離が最近傍面への距離より1mmを超えて遠いため、重ね代にも救われなかった。ラベルによる穴の発生は裏付けられた。',
          'ただし「髪の下に隠れた頭皮だけ」という説明は成立しない。最近傍の元面が26方向のいずれかから見えるものは20,211件、見えないものは628件。重複を除く元面では可視3,159面、不可視144面。充填後に外された面自体も20,831面が可視、8面が不可視だった。毛束間など外から見える顔ラベルの面も多い。',
          '可視は各面の重心へ2m外から26方向の光線を当て、最初の交点との差が2µm以下かで判定する。面全体の可視率ではなく重心の標本で、面数は面積の重みなし。元面と充填面の両方を測り、キャップは遮蔽物に入れていない。生の面番号はdiagnosis-samples.npzに保存した。',
          '', '|方向 x,y,z（正規化前）|可視の元面（重複なし）|可視の外された充填面|','|---|---:|---:|']
    for direction,a,b in zip(diag['directions'],diag['visible_unique_faces_by_direction'],diag['visible_removed_faces_by_direction']):
        signs=','.join(str(0 if abs(q)<.1 else (1 if q>0 else -1)) for q in direction);text.append(f'|{signs}|{a}|{b}|')
    text+=['','## 同一定義での比較','', '|値|hair2|hair3|hair4|','|---|---:|---:|---:|']
    for name,key in [('髪内の肌色画素（3画角合計）','skin_pixels_in_hair_total'),('色差平均 sRGB 0..255','mean_abs_srgb_difference_0_255'),('頭の輪郭IoU平均','mean_silhouette_iou'),('黒斑点（3画角合計）','black_patch_pixels_total'),('髪の境界辺','boundary_edges'),('全体の三角形数','total_triangles')]:
        text.append('|'+name+'|'+'|'.join(str(rows[t][key]) for t in ['hair2','hair3','hair4'])+'|')
    text+=['','3画角はデモ立ち姿・正面・35°。輪郭は正面・横・後ろの平均。黒斑点は、穴を埋めた高密度髪マスクを1px収縮した領域で、高密度よりsRGBのRec709明るさが25/255以上暗い画素。hair2/hair3は既存の確定値と画像を使用し、hair4だけ同じカメラと照明で新しく描画した。','',
          'UVは工程7と同じ縫い目とANGLE_BASED、重なりを実測して島を分割しCONCAVEで配置した。最終2,738島、重なり・面積ゼロ・範囲外はいずれも0、島間は2048px換算7.999px。4096pxで3mm押し出し・最大光線5mmで転写し、色・粗さは3D最近傍、法線は同じ島または中立値で補完、島ごと6px拡張後2048pxへ縮小した。未到達率は17.87%。',
          '', '## 塞いだ輪と残した境界','',
          '塞いだ70輪の周長は1.993〜679.387mm。前髪上部、頭頂、側頭部、後頭部に分布する。長さだけで穴を判定せず、場所と既存の面・辺の有無で分けた。すでに髪の中にある辺を新しい三角形の対角線にしないよう、面積を小さくする分割を選んだ。頂点の追加・移動は0。',
          '残した閉じた輪は76個。生え際・もみあげ・えり足をつなぐ主輪1個、下端や首元47個、前側の生え際8個、既存の小片・面・辺を囲んでおり追加すると重複面や非多様体になる20個。ほかに首元などの閉じていない鎖25本も残した。',
          '分類の仮定: 最長の主輪を顔との境界とし、独立した境界で最高Z<0.82mはもみあげ・えり足・首元、平均Z<0.86mかつ平均Y<-0.11mは前側の生え際とした。Y負が前、Zが高さ。閾値は現在のBの座標系だけに適用する。頂点で接する輪は面のファンに沿って分ける。既存の小片を囲む輪は穴ではないと扱う。',
          '', '|ID|処理|周長mm|頂点数|中心 x,y,z m|追加三角形|残した理由|', '|---|---|---:|---:|---|---:|---|']
    for r in g['loops']:
        text.append(f"|{r['id']}|{'閉じる' if r['action']=='fill' else '残す（輪）' if r['closed'] else '残す（鎖）'}|{r['perimeter_mm']:.3f}|{len(r['vertices'])}|{','.join(f'{q:.4f}' for q in r['center_m'])}|{r['added_triangles']}|{r['reason'] or ''}|")
    text+=['','## 残りと確認','',
          'hair-compare.png、demo-color.png、hair-under.pngを開いて確認した。前髪の横並びの大穴は面で閉じたが、塞いだ帯には明るく平らな三角形と暗い斑点が残る。頭頂の分け目、横の頭頂付近と毛束の溝、後頭部の上側と右の毛束間にも斑点が残る。首裏・あご際の裂け目や小片は残している。',
          'hair3で旧キャップを外して露出した領域に限定すると、35°外縁の背景163画素、後頭部の背景42画素はどちらも0になった。この領域で全10画角の背景は0。正面の肌裏1,705画素と35°の151画素も0になった。首左25°＋上半身左8°では肌裏が23画素残る（主な位置 x585..590,y103..109、補助 x582,y128..130、1280×800の左上原点）。髪の裏は正面473画素・35°240画素など残る。これは旧キャップ領域だけの集計で、髪全体の穴ゼロを意味しない。',
          '髪内の肌色画素は2,141のままで、残した生え際や肌の見える場所は改善していない。髪の輪郭外側の細いすき間も残る。既存頂点だけの面張りでは毛束の曲面や厚みまでは復元できず、黒斑点もゼロではない。',
          '全体52,303三角形、髪15,801三角形。眼球・まぶた・眼鏡の未制作分5,000を別枠で足すと57,303。',
          '', '再実行: `blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage hair4`。`HAIR4_PHASE=geometry|diagnose|uv|transfer|render|verify|measure`で再開できる。書き込みはscripts/toy-characterと.work/toy-characterのみ。コミットはしていない。','']
    result='\n'.join(text);(out/'review-notes.md').write_text(result)
    # Keep event timestamps and the final readable report in the same log.
    path=out/'log.md';events='\n\n'.join(line for line in path.read_text().splitlines() if re.match(r'^\d{4}-\d{2}-\d{2} ',line));path.write_text(events+'\n\n'+result)
