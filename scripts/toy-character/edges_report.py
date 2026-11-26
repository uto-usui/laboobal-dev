"""Write the Japanese measurement report from verified artifacts only."""
import json,hashlib,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('TOY_EDGES_OUT',ROOT/'.work/toy-character/edges')).resolve()
def read(name):return json.loads((OUT/name).read_text())
def main():
    measure=read('measurements.json');rows={r['case']:r for r in measure['rows']}
    compression=read('gltf-package.json');web=read('web-x1-x2-x3.json')
    diagnostic_web=read('web-a-b-c-d-e-b-control-c-control-b-png-d4096-d-lossless.json')
    preservation=read('installed-preservation.json');filters=read('filter.json')
    seams=read('seams.json')
    assert preservation['unchanged']
    assert all(c['MiB']<=15 and c['errors']==0 and c['decodedErrors']==0 and all(c['preservation'].values()) for c in compression)
    assert all(not r['errors'] and r['canvas']==[2880,1800] and 'Metal' in r['gpu'] for r in web['runs'])
    assert diagnostic_web['camera']==web['camera'],'Camera drift'
    for r in web['runs']:
        file=OUT/f"character-{r['case']}.glb"
        assert hashlib.sha256(file.read_bytes()).hexdigest()==r['sha256'],'Captured file changed'
    assert all(p['guard_exact'] for p in filters['parts'].values())
    assert all(s['guard_exact_after'] for s in seams)
    shadow_note=''
    if (OUT/'shadow-probe.json').exists():
        shadow_note=f"投影影を無効にした追加対照でも、displayの裾は{read('shadow-probe.json')['b']['hem_navy']:.2f}px残った。"
    def table(labels,unlit=False):
        field='unlit_widths_px' if unlit else 'widths_px'
        s=['| 段 | 袖と白 | 白と手 | 裾の白と紺 | ポケットと紺 |','| --- | ---: | ---: | ---: | ---: |']
        for name,label in labels:
            r=rows[name];s.append('| '+label+' | '+' | '.join(f'{v:.2f}' for v in r[field].values())+' |')
        return '\n'.join(s)
    diagnostic=[('a','a 元の高密度・4096'),('b','b display・4096'),('c','c display2・2048'),('d','d 新UV・2048・平滑化前'),('e','e texture採用版・bilateral')]
    text='''# 色の境目の測定と、服をならした3段

元モデルからの5段を、同じWebデモのthree.js、1440×900、DPR2、同じカメラ・照明で撮った。視線・呼吸・まばたきを止め、胸から下の範囲を固定した。撮影用のブラウザだけでモデルを読み替え、デモのGLBとサーバーは変えていない。

## 5段の測定

単位は実画素px（CSS pxは半分）。緑の測定線は各フォルダの`regions.png`にある。同じ位置の9本を別々に測り、その中央値を示す。両端10画素のRGB中央値を0%と100%として色の進行方向へ射影し、単調回帰後の10%〜90%間を測った。傾いた境目を平均してから測る処理はしていない。照明ありの値には実際の陰影も入る。

'''+table(diagnostic)+'''

ポケットと袖では、写し直した画像を2048pxに縮めて圧縮した段が、境目の幅を大きく広げた。手はdisplay2の段とbilateralで広がった。すべての箇所が単調に悪化したわけではない。特に裾は、元モデルからdisplayの段で見かけの幅が増えている。

照明なしの追加撮影では次の値になった。裾の色自体は約1.6pxで切り替わるので、照明ありで約9pxに見える部分を、色の滲みとして画像だけで消していない。'''+shadow_note+'''色の混ざりだけでなく面と法線による陰影を含むため、形・法線・描画条件を固定した今回の画像処理では、その明暗を塗り消していない。

'''+table(diagnostic,True)+'''

## 切り分け用の対照

b-controlとc-controlは同じdisplay2の形・材質で、元の埋め込み画像を4096/2048pxの可逆WebPにした。b-pngは、同じ元UVに指定の4096px PNGを使ったもの。d4096は既存の4096px転写画像、d-losslessはその2048px版を可逆圧縮したもの。元GLB内のWebPと元PNGの差、UVの違い、縮小、非可逆圧縮を一緒に原因扱いしないために足した。

'''+table([(k,k) for k in ['b-control','c-control','b-png','d4096','d-lossless']])+'''

## 直した方法

元の4096px画像のCIELab色差で境目を求め、周囲3pxを保護した。部位ラベルや色相ラベルは境目の決定に使っていない。元UVから新UVへ重心座標で直接写し、保護帯は最近傍、内側は線形補間にした。UVの島の外は、同じ島の端の色で埋めた。体は4096px、頭は3072px、粗さ・金属度は1024px、まばたきの画像は元の3072×1024pxとした。体には色差成分を間引かないJPEG 4:4:4・品質85を使った。near-lossless WebPでは15MiBを超えたため、この配分で解像度と境目を確かめた。

服は各UV島を別々に周囲へ延長してbilateralを2回かけた。x1はtextureの2048px時の空間半径を4096pxへ換算した強さ。x2/x3は色差と空間のsigmaを2倍/3倍にした。フィルターによる変化のうちGaussian sigma3より大きな明暗の変化を戻し、大きなしわとふくらみの明暗を残した。保護帯にはフィルターをかけず、その内側3pxで徐々に効かせた。顔は肌色だけ22%の弱い処理で、赤み・暗い目/眉/口・髪・色の境目を対象外にした。別部品の黒目は変更していない。

## 3段の結果

'''+table([(k,k) for k in ['x1','x2','x3']])+'''

| 版 | 細かな明暗のMSE | x1比 | しわの明暗RMS | x1比 | GLB MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
'''
    cby={r['variant']:r for r in compression};base=rows['x1']
    for k in ['x1','x2','x3']:
        r=rows[k];c=cby[k]
        text+=f"| {k} | {r['fine_mse']:.4f} | {r['fine_mse']/base['fine_mse']*100:.1f}% | {r['fold_rms']:.4f} | {r['fold_rms']/base['fold_rms']*100:.1f}% | {c['MiB']:.3f} |\n"
    text+='\n3段の見た目の差は小さい。2倍・3倍では袖の内側がわずかになだらかに見えるが、強さに比例して細かな明暗のMSEが下がる結果にはならなかった。3倍は1倍からMSEが'+f"{(rows['x3']['fine_mse']/base['fine_mse']-1)*100:.1f}%"+'増えている。大きなしわは1倍比で'+f"{rows['x3']['fold_rms']/base['fold_rms']*100:.1f}%"+'残った。顔は目視ではほぼ同じで、目・眉・口・頬の赤みがぼける変化は見られなかった。\n'
    text+='''
細かな明暗はLabのL（0〜255）のGaussian sigma3との差の二乗平均、しわはGaussian sigma16と48の差のRMS。細かい明暗は、バックル・境目・大きなしわを避けた両袖と胸の5範囲、しわは別に設けた両袖の2範囲で測った。これは画面上の細かな明暗としわの指標であり、三角形の面を直接数える値ではない。形と法線に由来する面の見え方は残る。全身・顔・胸から下を`compare.png`に並べ、実画素の画像も`x1/`〜`x3/`に残した。

UVの継ぎ目では、同じ位置の頂点をもとにフィルターによる変化量だけを平均して写し戻した。元の色の境目の保護帯に触れる頂点は除いた。形・元の色の境目・UVを変える処理ではない。継ぎ目の変化量のずれは`seams.json`に記録した。

3段とも位置・面・法線・UV・ウェイト・骨・逆バインド行列を元のtextureのモデルと照合した。圧縮版と展開版のglTF Validatorはエラー0。既存の警告は各5件。表示用GLBのハッシュは`installed-preservation.json`の前後で一致した。

## 置いた仮定

- 元の作者のスクリーンショットは添付されていないため、指定の`original-hem.png`を見て、胸から下・袖口・手・裾・ポケット・ズボンの上が入る同じ範囲を5段と3段に適用した。カメラとview offsetは`web-*.json`に記録した。
- 10%〜90%は、照明を含んだ画像上のRGBの変化幅とした。陰影と色を切り分けるため、照明なしの対照も残した。
- 1倍は画面上の空間半径をそろえたbilateral2回、2倍/3倍は色差と空間のsigmaを倍増する意味とした。境目の保護と大きな明暗の復元は3段共通。
- 15MiBは15×1024×1024バイト。顔・髪を含む頭の画像を3072px、粗さ・金属度を1024pxへ配分して体の4096pxを確保した。

`blender -b -P scripts/toy-character/build.py -- --stage edges`で再実行できる。途中からは`EDGES_PHASE=diagnose/process/package/web/measure`を使う。デモのGLBは置き換えず、コミットもしない。
'''
    (OUT/'README.md').write_text(text)
    paths=[ROOT/'scripts/toy-character'/name for name in ['build.py','edges.py','edges_gltf.mjs','edges_process.py','edges_web.py','edges_measure.py','edges_report.py','edges_seams.py']]
    paths+=[OUT.parent/name for name in ['img3d/out/v4-noglasses.glb','img3d/out/v4-noglasses_base.png','texture/body-uv.npz','texture/head_face-uv.npz','display2/character.glb','texture/2/character.glb','texture/3/character.glb']]
    provenance={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    (OUT/'metrics.json').write_text(json.dumps({'measurements':measure,'filter':filters,'seams':seams,'shadow_probe':read('shadow-probe.json') if (OUT/'shadow-probe.json').exists() else None,'compression':compression,'web':web,'diagnostic_web':diagnostic_web,'installed_preservation':preservation,'provenance':provenance},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
