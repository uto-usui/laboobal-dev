"""Geometry classification and reporting, outside Blender's Python."""
import sys,json,hashlib,time,math
from pathlib import Path
import numpy as np
import igl
from PIL import Image,ImageDraw,ImageFont
out=Path(sys.argv[1])

def cap():
 d=np.load(out/'cap-volume.npz');q=np.load(out/'fragment-points.npy');w=abs(igl.fast_winding_number(d['V'].astype(float),d['F'].astype(np.int64),q));np.save(out/'fragment-inside-cap.npy',w>.5)
 (out/'cap-classification.json').write_text(json.dumps({'test':'abs(fast_winding_number)>0.5 on cap closed at existing boundary','samples':len(q),'inside':int((w>.5).sum()),'winding_min_max':[float(w.min(initial=0)),float(w.max(initial=0))]},indent=2))

def sheet(items,name,columns=4,width=480):
 font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18);tiles=[]
 for path,label in items:
  im=Image.open(out/path).convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);im=bg.convert('RGB');im.thumbnail((width,width));tile=Image.new('RGB',(width,im.height+36),'white');tile.paste(im,((width-im.width)//2,36));ImageDraw.Draw(tile).text((8,8),label,font=font,fill='black');tiles.append(tile)
 rh=max(t.height for t in tiles);canvas=Image.new('RGB',(columns*width,math.ceil(len(tiles)/columns)*rh),'#eee')
 for i,t in enumerate(tiles):canvas.paste(t,((i%columns)*width,(i//columns)*rh))
 canvas.save(out/name)

def report():
 raw=out/'render-rgba';raw.mkdir(exist_ok=True)
 for path in out.glob('*.png'):
  if path.name.startswith('mask-'):continue
  im=Image.open(path).convert('RGBA')
  if im.getextrema()[3][0]<255:
   im.save(raw/path.name)
   bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);bg.convert('RGB').save(path)
 m=json.loads((out/'metrics.json').read_text());contacts=json.loads((out/'contacts.json').read_text());m['contacts']=contacts;decisions={}
 for name,r in m['poses'].items():
  excluded=name.startswith(('arm','spine'));regions=['shoulder','armpit','elbow'] if name.startswith('arm') else ['chest','armpit'] if name.startswith('spine') else ['neck','chest'];cc=contacts['rows'][name];stretch=max(r[k]['edge_p99'] for k in regions);thin=max(r[k]['thin_faces'] for k in regions);outside=cc['neck_outside']['max_depth_increment_mm'];inside=cc['hair_jaw_inside']['max_depth_increment_mm'];passed=stretch<=1.3 and thin<=5 and outside<=3 and inside<=3
  decisions[name]={'regions':regions,'p99':stretch,'thin':thin,'neck_out_increment_mm':outside,'hair_jaw_in_increment_mm':inside,'excluded':excluded,'numeric_pass':None if excluded else passed}
 sil={}
 for angle in range(0,360,45):
  hi=np.array(Image.open(out/f'mask-high-{angle}.png'))[:,:,3]>127;lo=np.array(Image.open(out/f'mask-low-{angle}.png'))[:,:,3]>127;sil[str(angle)]=float((hi&lo).sum()/(hi|lo).sum())
 m['pose_decisions']=decisions;m['silhouette']=sil;m['triangles']={'body':m['topology']['body']['triangles'],'head':m['topology']['head']['triangles']};m['triangles']['total']=sum(m['triangles'].values());m['triangles']['reserved_later']=5000;m['numeric_acceptance']={'closed_single_body':all(m['topology']['body'][k]==v for k,v in [('connected_components',1),('boundary_edges',0),('edges_shared_by_3_or_more_faces',0)]),'body_degenerate_zero':m['topology']['body']['degenerate_faces']==0,'silhouette_iou_0985':min(sil.values())>=.985,'total_under_60000':m['triangles']['total']<=60000,'demo_pose_numeric':all(r['numeric_pass'] for r in decisions.values() if not r['excluded'])}
 m['overall_pass']=False if not all(m['numeric_acceptance'].values()) else None
 (out/'metrics.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
 sheet([(f'demo-{n}.png',n) for n in decisions],'demo-frames.png');sheet([(f'neck-close-{n}-{a}.png',f'{n} | {a}') for n in decisions if not n.startswith(('arm','spine')) for a in [0,25,90]],'neck-frames.png',3,480);sheet([(f'armpit-close-{n}-{s}-0.png',f'{n} | {s}') for n in decisions if n.startswith('arm') for s in ['L','R']],'arm-frames.png',2,520);sheet([(f'view-low-{a}.png',f'low | {a}') for a in [0,90,180,270]],'clay-body.png',2,520);sheet([(f'view-{label}-{a}.png',f'{label} | {a}') for a in [0,90,180,270] for label in ['high','low']],'lowpoly-views.png',2,520);sheet([(f'wire-{a}.png',f'wire | {a}') for a in [0,90,'face','shoulder','elbow']],'wire.png',2,700)
 if (out/'face-tenth-90.png').exists():sheet([(f'face-{label}-{a}.png',f'{label} | {a}') for a in [0,25,90] for label in ['original','ninth','tenth']],'face-close.png',3,520)
 lines=['\n## ポーズの測定（首と胸、腕上げ・背骨15度は参考）','|ポーズ|P99|つぶれた面|首外増分mm|髪あご内増分mm|数値合否|','|---|---:|---:|---:|---:|---|']
 for n,r in decisions.items():lines.append(f"|{n}|{r['p99']:.4f}|{r['thin']}|{r['neck_out_increment_mm']:.3f}|{r['hair_jaw_in_increment_mm']:.3f}|{'対象外' if r['excluded'] else r['numeric_pass']}|")
 lines+=['\n数値判定: '+json.dumps(m['numeric_acceptance'],ensure_ascii=False),'\n輪郭IoU: '+json.dumps(sil),'\n面数: '+json.dumps(m['triangles'])]
 with (out/'log.md').open('a') as f:f.write('\n'.join(lines)+'\n')
 print(json.dumps(m['numeric_acceptance']))

if __name__=='__main__':{'cap':cap,'report':report}[sys.argv[2]]()
