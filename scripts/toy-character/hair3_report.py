"""Persist reviewed findings alongside the reproducible hair3 measurements."""
import json
from pathlib import Path


def report(out):
    data=json.loads((out/'metrics.json').read_text());before=data['comparison']['hair2'];after=data['comparison']['hair3']
    lines=['# キャップを外した結果','',
           'キャップ999三角形を削除した。前髪の大きな黒い斑点は残り、そのすき間に髪の裏と肌の裏が見える。形の追加修正はしていない。',
           '残りの面の頂点位置・面の頂点番号・コーナー法線・UV・スムーズ設定・頂点ウェイト・材質・同梱画像が保存前後で一致した。キャップの未使用頂点は残し、他の頂点番号を変えない。',
           '', '|値|hair2 最終|hair3|','|---|---:|---:|']
    for label,key in [('髪内の肌色画素（デモ立ち姿＋正面＋35°）','skin_pixels_in_hair_total'),('色差平均（sRGB 0..255）','mean_abs_srgb_difference_0_255'),('黒斑点（同3画角合計）','black_patch_pixels_total'),('頭の輪郭IoU平均','mean_silhouette_iou'),('全体の三角形数','total_triangles')]:lines.append(f'|{label}|{before[key]}|{after[key]}|')
    for angle in ['0','90','180']:lines.append(f'|頭の輪郭IoU {angle}°|{before["silhouette_iou"][angle]}|{after["silhouette_iou"][angle]}|')
    for view in ['demo-rest','face-0','face-35','face-90','face-180']:lines.append(f'|黒斑点 {view}|{before["views"][view]["black_patch_pixels"]}|{after["views"][view]["black_patch_pixels"]}|')
    lines += ['', '## 露出した場所', '',
              '指定の顔4方向・デモ3姿勢・首上10°の髪裏0/±55°を色付きで開き、表裏ID画像でも照合した。newly-exposed.png の赤は新たな肌裏、紫は髪裏、シアンは背景、オレンジは肌表。座標は1280×800画像の左上原点。', '',
              '- 正面: 前髪上部の横並びのすき間で髪の裏が見える。画面左寄りのすき間（最大領域 x419..472, y174..246）と中央寄り（x551..568, y188..219）に肌裏が見える。頭頂左にも小さな肌裏がある。新たな肌裏1,705画素。',
              '- 35°: 画面左の前髪上部で肌裏151画素が見え、同じ高さの前髪の外縁（x317..328, y221..258）で背景163画素が見える。複数のすき間では肌表と髪裏が見える。',
              '- 横: 新たな肌裏と背景は0画素。頭頂付近に髪裏と肌表の小片が見える。',
              '- 後ろ: 画面中央より左上の小穴（主にx536..543, y245..251）から背景42画素が見える。右寄りの毛束間に小さく肌表が見える。新たな肌裏は0画素。',
              '- デモ立ち姿: 前髪上部のすき間に肌裏80画素。首左25°＋上半身左8°: 同じ前髪帯と画面左の髪際に肌裏247画素。首上10°: 同じ帯に肌裏98画素と背景1画素。',
              '- 首上10°の髪裏とあご下の拡大3方向: 新たな肌裏・背景はいずれも0画素。髪の下端の内側でキャップの代わりに髪裏が見える。既存のあご際の段・裂け目や首元の小片は残る。',
              '', '黒斑点は前髪上部の大きなすき間群、頭頂の分け目、横の頭頂近くと毛束の溝、後頭部の画面左上の小穴と右寄りの毛束間に残る。remaining-patches.png に同一定義で着色した。',
              '', '## 光線が届かなかった3,065画素', '',
              'hair2の材質ID画像と画面中心の光線から、デモ69・正面2,208・35°788の合計3,065画素を再特定した。最終画像では全3,065画素に色があり、RGB=(0,0,0)は0画素だった。',
              '2,952画素はUV内で光線が届かなかった点で、元の有効な髪色を3D最近傍で埋める対象だった。113画素は画面→UV最近傍の参照がラスタ化したUVの境界外に出た点で、最終2048px画像では色が入っていた。',
              'hair2の元画像から、3D最近傍補完・UV島ごとの6px拡張・線形色での4096→2048縮小を再実行し、basecolor・normal・roughnessのPNGがhair2とバイト単位で一致した。hair3に保存した同梱画像も入力と一致した。したがって色の補完は実行済みだが、面の裏・光・法線による暗さまで解消することを意味しない。',
              '', '## 前提と検証で分かったこと', '',
              '- 入力はhair2の最終 character-hair2.blend。キャップは Baked inner hair cap 材質の付いた低密度頭の面とした。高密度の参照キャップは比較画像だけに残す。',
              '- カメラ・照明・解像度・指標はhair2と同じ。髪裏は従来の正面・±55°を採用。黒斑点は閉じた穴を埋めた参照髪マスクの1px収縮領域で、Rec709のsRGB明るさが高密度より25/255以上暗い画素。',
              '- 依頼文の32,123は焼き直し前Bの値。hair2最終の実測は32,124なので前後表はこちらを用いた。再レンダー時の色差平均は1e-5未満の丸め差を許容し、個数・IoUは一致を要求した。',
              '- Bは詰めた頭全体から髪だけを切り出した形であり、最終メッシュには境界辺1,816本、3面以上で共有する辺22本、29成分があった。「完全に閉じていてキャップを外せば内部が見えない」という前提は最終メッシュには成立しなかった。',
              '- 全体は実メッシュ51,368三角形。眼球・まぶた・眼鏡の未制作分5,000を予備として足すと56,368三角形。',
              '', '再実行: `blender -b --factory-startup --python-exit-code 1 -P scripts/toy-character/build.py -- --stage hair3`。`HAIR3_PHASE=install|probe|render|visibility|measure` で再開できる。画像補完の再現はfill-replay内だけに書き、モデルの画像を変更しない。コミットはしていない。', '']
    text='\n'.join(lines);(out/'review-notes.md').write_text(text)
    with (out/'log.md').open('a') as f:f.write('\n'+text)
