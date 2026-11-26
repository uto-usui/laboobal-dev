"""Independent measurements and labeled contact sheets for the ninth pass."""
import sys,json,math,hashlib
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw,ImageFont
import igl
from lowpoly9_geometry import note
OUT=Path(sys.argv[1]);FONT=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18)

def sheet(items,name,columns=3,width=480):
 tiles=[]
 for path,label in items:
  im=Image.open(OUT/path).convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);im=bg.convert('RGB');im.thumbnail((width,width));tile=Image.new('RGB',(width,im.height+36),'white');tile.paste(im,((width-im.width)//2,36));ImageDraw.Draw(tile).text((8,8),label,font=FONT,fill='black');tiles.append(tile)
 rowheight=max(t.height for t in tiles);canvas=Image.new('RGB',(columns*width,math.ceil(len(tiles)/columns)*rowheight),'#eee')
 for i,t in enumerate(tiles):canvas.paste(t,((i%columns)*width,(i//columns)*rowheight))
 canvas.save(OUT/name)

def face():
 src=np.load(OUT/'head-source.npz');d=np.load(OUT/'head-candidate.npz');v=d['V'];f=d['F'];rng=np.random.default_rng(902)
 # Independent area weighted surface samples, plus every vertex in the visible face.
 t=v[f];area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)/2;ids=rng.choice(len(f),200000,p=area/area.sum());u=rng.random((len(ids),2));s=np.sqrt(u[:,0]);points=(1-s[:,None])*t[ids,0]+(s*(1-u[:,1]))[:,None]*t[ids,1]+(s*u[:,1])[:,None]*t[ids,2];points=np.r_[points,v]
 mask=(points[:,1]<-.055)&(abs(points[:,0])<.095)&(points[:,2]>.725)&(points[:,2]<.87);q=points[mask];dist=np.sqrt(igl.point_mesh_squared_distance(q,src['V'].astype(float),src['F'].astype(np.int64))[0])*1000
 result={'candidate_to_original_face_p95_mm':float(np.percentile(dist,95)),'face_max_mm':float(dist.max()),'face_samples':len(q),'face_region_m':{'abs_x_max':.095,'y_max':-.055,'z':[.725,.87]},'threshold_p95_mm':.5,'numeric_pass':bool(np.percentile(dist,95)<=.5),'method':'200000 area-weighted samples + vertices; visible frontal face ROI; nearest original triangle, directional'}
 (OUT/'face-distance.json').write_text(json.dumps(result,indent=2));note(OUT,'顔距離 '+json.dumps(result));sheet([(f'face-{label}-{a}.png',f'{label} | {a} deg') for a in [0,25,90] for label in ['original','eighth','filled']],'face-close.png',3,520)

def contacts():
 # Use solidify's lattice, and rasterize the actual closed body in each pose.
 # This includes the small exposed skin patch that follows head as well as chest.
 grid=np.load(OUT.parent/'lowpoly8/body-grid.npz');lo=grid['lo'];h=float(grid['h']);d=np.load(OUT/'contact-input.npz');bf=d['body_F'].astype(np.int64)
 origin=lo+h*np.floor((np.array([-.21,-.24,.61])-lo)/h);upper=np.array([.21,.22,.83]);axes=[np.arange(origin[k],upper[k]+h,h) for k in range(3)];shape=tuple(map(len,axes));yz=np.stack(np.meshgrid(axes[1],axes[2],indexing='ij'),-1).reshape(-1,2);raw={};cache_dir=OUT/'posed-grid';cache_dir.mkdir(exist_ok=True)
 for key in d.files:
  if not key.startswith('pose_'):continue
  name=key[5:];v=d['body_pose_'+name];signature=hashlib.sha256(v.tobytes()+bf.tobytes()+origin.tobytes()+np.array(shape).tobytes()).hexdigest();cache=cache_dir/(signature+'.npz')
  if cache.exists():solid=np.load(cache)['solid']
  else:
   solid=np.empty(shape,bool)
   for i in range(0,shape[0],8):
    xs=axes[0][i:i+8];q=np.empty((len(xs),len(yz),3));q[:,:,0]=xs[:,None];q[:,:,1:]=yz
    solid[i:i+len(xs)]=(abs(igl.fast_winding_number(v,bf,q.reshape(-1,3)))>.5).reshape(len(xs),shape[1],shape[2])
   np.savez_compressed(cache,solid=solid,lo=origin,h=h)
  signed=np.where(solid,-np.maximum(ndimage.distance_transform_edt(solid)*h-h/2,0),np.maximum(ndimage.distance_transform_edt(~solid)*h-h/2,0));q=d[key];dist=ndimage.map_coordinates(signed,((q-origin)/h).T,order=1,mode='constant',cval=.2)*1000
  raw[name]={'neck_outside':np.maximum(dist[d['neck']],0),'hair_jaw_inside':np.maximum(-dist[d['hairjaw']],0)};note(OUT,'体の姿勢格子 '+name)
 rest=raw['rest'];rows={}
 for name,r in raw.items():
  rows[name]={}
  for kind,depth in r.items():
   baseline=rest[kind];rows[name][kind]={'vertices':len(depth),'count':int((depth>0).sum()),'count_increment':int((depth>0).sum()-(baseline>0).sum()),'maximum_mm':float(depth.max(initial=0)),'max_depth_increment_mm':max(0,float(depth.max(initial=0)-baseline.max(initial=0))),'max_per_vertex_increment_mm':max(0,float((depth-baseline).max(initial=0))),'p95_mm':float(np.percentile(depth,95)) if len(depth) else 0}
 result={'grid_m':h,'grid_origin_m':origin.tolist(),'grid_shape':shape,'method':'solidify body-grid lattice origin and 2mm spacing; rasterize actual deformed closed uniform body by abs(winding)>0.5 in each pose, in chest rest frame; signed EDT, trilinear samples; maximum depth and same-vertex increments vs rest','approximation':'voxel occupancy at 2mm centers, EDT cell boundary at half a cell; neck crop has >30mm lower margin; no assumption of rigid front skin','selections':'head skin part2=0 below704mm; hair below800mm or front jaw above704 below800mm','rows':rows};(OUT/'contacts.json').write_text(json.dumps(result,indent=2));note(OUT,'格子食い込み計測を保存')

def report():
 # Rendered alpha is composited on white for the requested demo background.
 raw=OUT/'render-rgba';raw.mkdir(exist_ok=True)
 for path in OUT.glob('*.png'):
  if path.name.startswith('mask-'):continue
  im=Image.open(path).convert('RGBA')
  if im.getextrema()[3][0]<255:
   if not (raw/path.name).exists():im.save(raw/path.name)
   bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);bg.convert('RGB').save(path)
 m=json.loads((OUT/'metrics.json').read_text());contact=json.loads((OUT/'contacts.json').read_text());m['contacts']=contact;sil={}
 for a in range(0,360,45):
  high=np.array(Image.open(OUT/f'mask-high-{a}.png'))[:,:,3]>127;low=np.array(Image.open(OUT/f'mask-low-{a}.png'))[:,:,3]>127;iou=float((high&low).sum()/(high|low).sum());sil[str(a)]={'iou':iou,'pass':iou>=.985}
 m['silhouette']=sil;fields=np.load(OUT/'weight-audit-fields.npz');before=fields['before'];after=fields['after'];allowed=fields['allowed_new']|(before>0);m['weight_audit']={'new_weights_outside_authorized_support':int(((after>1e-8)&~allowed).sum()),'max_sum_error':float(abs(after.sum(1)-1).max()),'max_influences':int((after>1e-8).sum(1).max())}
 # Prior regional distance numbers remain valid because the body positions do not change.
 prev=json.loads((OUT.parent/'lowpoly8/metrics.json').read_text());m['body_distance_record_only']={part:{direction:{k:row[k] for k in ['p95_mm','max_mm']} for direction,row in value.items()} for part,value in prev.get('distances_full_source',{}).items()}
 decisions={}
 for name,r in m['poses'].items():
  if name=='rest':regions=['neck','chest','shoulder','armpit','elbow'];limit=1.3;thinlimit=0
  elif name.startswith('spine'):regions=['chest','armpit'];limit=None;thinlimit=None
  elif name.startswith('arm'):regions=['shoulder','armpit','elbow'];limit=1.6;thinlimit=5
  elif name.startswith('upper'):regions=['chest','armpit'];limit=1.3;thinlimit=0
  else:regions=['neck'];limit=1.3;thinlimit=0
  rr={k:r[k] for k in regions};stretch=max(v['edge_p99'] for v in rr.values());thin=max(v['thin_faces'] for v in rr.values());cc=contact['rows'][name];out=cc['neck_outside']['max_depth_increment_mm'];inside=cc['hair_jaw_inside']['max_depth_increment_mm'];necktest=name.startswith(('neck','combo'));numeric=None if limit is None else stretch<=limit and thin<=thinlimit and (not necktest or (out<=3 and inside<=3))
  decisions[name]={'regions':regions,'p99_worst_region':stretch,'thin_worst_region':thin,'neck_out_increment_mm':out,'hair_jaw_in_increment_mm':inside,'same_vertex_neck_out_increment_mm':cc['neck_outside']['max_per_vertex_increment_mm'],'same_vertex_hair_jaw_in_increment_mm':cc['hair_jaw_inside']['max_per_vertex_increment_mm'],'numeric_pass':numeric}
 m['pose_decisions']=decisions;m['acceptance']={'closed_single_body':all(m['topology']['body'][k]==v for k,v in [('connected_components',1),('boundary_edges',0),('edges_shared_by_3_or_more_faces',0)]),'closed_single_head':all(m['topology']['head'][k]==v for k,v in [('connected_components',1),('boundary_edges',0),('edges_shared_by_3_or_more_faces',0)]),'no_degenerate_faces':all(t['degenerate_faces']==0 for t in m['topology'].values()),'silhouette':all(v['pass'] for v in sil.values()),'weight_leaks_zero':m['weight_audit']['new_weights_outside_authorized_support']==0,'neck_centers_pairwise_within_5mm':m['neck']['pairwise_within_5mm'],'demo_pose_numeric':all(v['numeric_pass'] for n,v in decisions.items() if not n.startswith('spine'))}
 m['overall_pass']=all(m['acceptance'].values())
 (OUT/'metrics.json').write_text(json.dumps(m,indent=2,ensure_ascii=False));sheet([(f'demo-{name}.png',name) for name in m['poses']],'demo-frames.png',4,480);sheet([(f'view-low-{a}.png',f'low | {a}') for a in [0,90,180,270]],'clay-body.png',2,520);sheet([(f'view-{label}-{a}.png',f'{label} | {a}') for a in [0,90,180,270] for label in ['high','low']],'lowpoly-views.png',2,520);sheet([(f'wire-{a}.png',f'wire | {a}') for a in [0,90,'face','shoulder','elbow']],'wire.png',2,700)
 lines=['\n## 9回目の測定結果','\n| ポーズ | 関節P99最大 | つぶれた面最大 | 首元外への深さ増分mm | 髪あご内への深さ増分mm | 数値合否 |','|---|---:|---:|---:|---:|---|']
 for n,r in decisions.items():lines.append(f"| {n} | {r['p99_worst_region']:.4f} | {r['thin_worst_region']} | {r['neck_out_increment_mm']:.3f} | {r['hair_jaw_in_increment_mm']:.3f} | {r['numeric_pass']} |")
 lines+=['\n### 関節ごとの測定','| ポーズ | 関節 | P99 | つぶれた面 |','|---|---|---:|---:|']
 for n,regions in m['poses'].items():
  for region,r in regions.items():lines.append(f"| {n} | {region} | {r['edge_p99']:.5f} | {r['thin_faces']} |")
 lines+=['\n関節ごとの値と個数は metrics.json。全身の首判定を体のP99で希釈しない。つぶれた面数は指定関節それぞれの最大で、重なる領域を二重加算しない。','\n合否: '+json.dumps(m['acceptance'],ensure_ascii=False),'\n体と頭のトポロジー: '+json.dumps(m['topology'],ensure_ascii=False),'\n輪郭: '+json.dumps(sil),'\nウェイト: '+json.dumps(m['weight_audit'])]
 with (OUT/'log.md').open('a') as f:f.write('\n'.join(lines)+'\n')
 print(json.dumps(m['acceptance']))

if __name__=='__main__':{'face':face,'contacts':contacts,'report':report}[sys.argv[2]]()
