"""Compose review sheets and measure fixed annotations in original v4 pixels."""
import argparse,json,math
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
from fidelity_options import add_seed_argument, unique_seeds
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.work/toy-character/fidelity'
FONT='/System/Library/Fonts/Helvetica.ttc'
def read(name):return json.loads((OUT/name).read_text())
def save(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def tile(path,label,size=600):
 im=Image.open(path).convert('RGBA');bg=Image.new('RGBA',im.size,'#e5e3e7');bg=Image.alpha_composite(bg,im)
 im=bg.convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
 panel=Image.new('RGB',(size,size+52),'#fafafa');panel.paste(im,(0,52))
 ImageDraw.Draw(panel).text((12,15),label,fill='#222222',font=ImageFont.truetype(FONT,18));return panel
def sheet(rows,name):
 canvas=Image.new('RGB',(sum(x.width for x in rows[0]),sum(max(x.height for x in r) for r in rows)),'white');y=0
 for row in rows:
  x=0
  for im in row:canvas.paste(im,(x,y));x+=im.width
  y+=max(im.height for im in row)
 canvas.save(OUT/name)
def reference():
 Image.open(ROOT/'docs/toy-character/design/v4.png').crop((397,10,857,470)).resize((920,920),Image.Resampling.LANCZOS).save(OUT/'reference.png')
def contour_metrics(path,chin=390):
 ref=np.array(Image.open(OUT/'design-head-mask.png').crop((397,10,857,470)).resize((920,920),Image.Resampling.NEAREST))>127
 cur=np.array(Image.open(path).convert('RGBA'))[:,:,3]>127
 # The head silhouette excludes the neck at the observed chin plane for each mesh.
 neck_row=int(round((chin-10)*2))+1
 cur[neck_row:,360:560]=False;ref[int(round((390-10)*2))+1:]=False
 intersection=int((cur&ref).sum());union=int((cur|ref).sum())
 k=np.ones((3,3),np.uint8)
 a=ref & ~cv2.erode(ref.astype('uint8'),k).astype(bool)
 b=cur & ~cv2.erode(cur.astype('uint8'),k).astype(bool)
 da=cv2.distanceTransform((~a).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
 db=cv2.distanceTransform((~b).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
 distances=np.r_[da[b],db[a]]/2
 return {'iou':intersection/union,'contour_distance_p95_px':float(np.percentile(distances,95)),
  'contour_distance_mean_px':float(distances.mean()),'pass':intersection/union>=.97 and np.percentile(distances,95)<=3,
  'neck_excluded_at_observed_chin':chin,'neck_exclusion':'central 100 original px below observed chin; lower lateral hair retained','distance':'symmetric raster contour distances; 2 render pixels = 1 original pixel'}
def measures(points):
 p={k:np.array(v,float) for k,v in points.items()}
 dist=lambda a,b:float(np.linalg.norm(p[a]-p[b]))
 dims={}
 for side in ['L','R']:
  dims[f'eye_{side}_width']=dist(f'eye_{side}_left',f'eye_{side}_right')
  dims[f'eye_{side}_height']=dist(f'eye_{side}_top',f'eye_{side}_bottom')
  # Iris is replaced in the next stage and does not gate this aperture fit.
 dims['eye_center_spacing']=dist('eye_L_center','eye_R_center')
 dims.update(nose_width=dist('ala_L','ala_R'),nose_height=dist('nose_top','nose_bottom'),
  mouth_width=dist('mouth_L','mouth_R'),lip_thickness=dist('lip_top','lip_bottom'))
 return dims
def metric_record(points,path):
 ref=read('design-landmarks.json')['points'].copy()
 for side in ['L','R']:
  ref[f'eye_{side}_center']=np.mean([ref[f'eye_{side}_{edge}'] for edge in ['left','right','top','bottom']],axis=0).tolist()
 target=measures(ref);actual=measures(points)
 position={k:{'target_px':ref[k],'actual_px':points[k],'error_px':float(np.linalg.norm(np.array(points[k])-ref[k]))} for k in ref if k in points and not k.startswith('iris_')}
 for record in position.values():record['pass']=record['error_px']<=2
 facial={k:v for k,v in position.items() if k.startswith(('eye_','nose_','ala_','mouth_','lip_'))}
 dims={k:{'target_px':v,'actual_px':actual[k],'relative_error':(actual[k]-v)/v,
  'tolerance':.05 if k.startswith(('eye','iris')) else .08,
  'pass':abs((actual[k]-v)/v)<=(.05 if k.startswith(('eye','iris')) else .08)} for k,v in target.items()}
 facekeys=['temple_L','temple_R','cheek_L','cheek_R','jaw_L','jaw_R','chin']
 faceerrors=[position[k]['error_px'] for k in facekeys]
 return {'positions':position,'facial_position_max_px':max(v['error_px'] for v in facial.values()),
 'facial_position_pass':all(v['error_px']<=2 for v in facial.values()),'dimensions':dims,
 'head_silhouette':contour_metrics(path,points['chin'][1]),
 'face_contour':{'landmark_max_error_px':max(faceerrors),'landmark_mean_error_px':float(np.mean(faceerrors)),
 'local_bulges':'requires visual review; sparse landmarks alone do not certify absence'},
 'annotation_uncertainty_px':1.5}
def seeds(seed_list,gate=False):
 import hashlib
 reference()
 prefix='repaired' if gate else 'ranked-seed'
 def seed_tile(seed,view):
  path=OUT/(f'repaired-{view}.png' if gate else f'{prefix}-{seed}-{view}.png')
  if not path.exists():path=OUT/f'seed-{seed}-{view}.png'
  return tile(path,f'Seed {seed} | {view} | same scale and light')
 sheet([[seed_tile(s,v) for s in seed_list] for v in ['front','45']],'seeds.png')
 source=ROOT/'scripts/toy-character/fidelity_annotations.json'
 if not source.exists():raise SystemExit('Open the renders and record defect inspection in fidelity_annotations.json before proceeding.')
 annotations=json.loads(source.read_text()) if gate else read('rank-landmarks.json');scores={}
 for seed in map(str,seed_list):
  info=annotations[seed]
  glb=ROOT/f'.work/toy-character/img3d/fidelity/head-s{seed}.glb'
  if info.get('source_sha256')!=hashlib.sha256(glb.read_bytes()).hexdigest():
   raise SystemExit(f'Seed {seed}: inspection does not match the current GLB; review again.')
  repair=read('repair.json')
  if info.get('repair_review_script_sha256')!=hashlib.sha256((ROOT/'scripts/toy-character/fidelity_repair.py').read_bytes()).hexdigest() or repair['source_sha256']!=info['source_sha256']:
   raise SystemExit('Repaired seed needs a current six-view inspection')
  defects=info['defects']
  if set(defects)!={'holes','double_ears','missing_hair'} or any(type(v) is not bool for v in defects.values()):
   raise SystemExit(f'Seed {seed}: all three defect checks must be explicit booleans.')
  record={} if gate or any(defects.values()) else metric_record(info['points'],OUT/f'ranked-seed-{seed}-front.png')
  record.update(defects=defects,visual_review=info['visual_review'],source_sha256=info['source_sha256'])
  record['excluded']=any(defects.values());scores[seed]=record
 eligible=[s for s in scores if not scores[s]['excluded']]
 # Lexicographic order keeps silhouette ahead of facial appearance and oblique form.
 rank=eligible if gate else sorted(eligible,key=lambda s:(scores[s]['head_silhouette']['contour_distance_p95_px'],
  scores[s]['facial_position_max_px'],sum(abs(x['relative_error']) for x in scores[s]['dimensions'].values()),annotations[s].get('oblique_shape_rank',0)))
 result={'requested_seeds':seed_list,'selected_for_fit':int(rank[0]) if rank and (len(rank)==1 or not gate) else None,
  'selection':'defect inspection only' if gate else 'defect exclusion, then contour P95, facial position and dimensions, oblique review',
  'adopted':False,'status':'excluded' if not eligible else 'eligible_for_fitting',
  'note':'No ranking for a single candidate. Fitting eligibility is separate from final acceptance.','seeds':scores}
 if len(seed_list)>1 and not gate:result['ranking']=rank
 save('seed-scores.json',result)
 if gate:
  repaired_inspection_sheets()
 if not eligible:raise SystemExit('All requested seeds were excluded; fitting and final outputs were stopped.')
 if gate and any('points' not in annotations[s] for s in eligible):
  raise SystemExit('Eligible seeds need manual render landmarks before alignment; no fitting was run.')

def repaired_inspection_sheets():
 sheet([[tile(OUT/f'repaired-{"clay-" if clay else ""}{v}.png',f'{v} | {"white" if clay else "textured"}',460) for v in ['front','45','left45','side','leftside','back']] for clay in [False,True]],'repair-review.png')

def inspection_sheets(seed_list,annotations):
 for seed in seed_list:
  sheet([[tile(OUT/f'seed-{seed}-{"clay-" if clay else ""}{v}.png',
    f'Seed {seed} | {v} | {"clay" if clay else "textured"}',460)
    for v in ['front','45','left45','side','leftside','back']] for clay in [False,True]],f'seed-{seed}-inspection.png')
  regions=annotations[str(seed)]['visual_review'].get('defect_regions_render_px',{})
  if not regions:continue
  rows=[]
  for clay in [False,True]:
   row=[]
   for view,box in regions.items():
    path=OUT/f'seed-{seed}-{"clay-" if clay else ""}{view}.png'
    panel=tile(path,f'{view} | {"clay" if clay else "textured"}',600)
    box=tuple(round(v*600/920)+(52 if i%2 else 0) for i,v in enumerate(box))
    ImageDraw.Draw(panel).rectangle(box,outline='#ff2255',width=3)
    row.append(panel)
   rows.append(row)
  sheet(rows,f'seed-{seed}-defect-review.png')
  if len(seed_list)==1:sheet(rows,'defect-review.png')
def final(seed_list):
 reference();fit=read('fit-landmarks.json');seed=fit['selected_seed']
 assert seed in seed_list and not read('seed-scores.json')['seeds'][str(seed)]['excluded']
 sheet([[tile(OUT/'reference.png','Design v4 | FRONT reference'),tile(OUT/f'before-{v}.png','Full-body generation | Before'),
  tile(OUT/f'selected-unfitted-{v}.png',f'Head-only seed {seed} | before fit'),tile(OUT/f'after-{v}.png','After constrained fit')]
  for v in ['front','45']],'compare-head.png')
 sheet([[tile(OUT/f'body-with-head-{v}.png',f'Body + separate head | {v}',760) for v in ['front','45']]],'body-with-head.png')
 sheet([[tile(OUT/f'{state}-unlit.png',state+' | base color, no lighting') for state in ['before','selected-unfitted','after']]],'unlit-comparison.png')
 result=metric_record(fit['after_points'],OUT/'after-front.png')
 groups={'eyes':('eye_',),'nose':('nose_','ala_'),'mouth':('mouth_','lip_')}
 result['feature_positions']={name:{'max_error_px':max(v['error_px'] for k,v in result['positions'].items() if k.startswith(prefixes)),'pass':all(v['error_px']<=2 for k,v in result['positions'].items() if k.startswith(prefixes)),'limit_px':2} for name,prefixes in groups.items()}
 result['eye_policy']='aperture positions, width, height and opening-center spacing; iris excluded because eyeballs/eyelids are replaced later'
 result['repair']=read('repair.json')
 result['selected_seed']=seed;result['correspondence_measurement']='Original render annotations ray-attached to mesh triangles and reprojected after deformation; verified against rendered texture.'
 result['geometry']=fit['geometry'];result['normal_review_required']=fit['geometry']['normal_rotation_over_90_triangles']>0
 result['geometry_pass']=fit['geometry']['max_dense_displacement_m']<=.015 and fit['geometry']['cage_fixed_max_drift_m']<1e-6
 result['acceptance']='FAIL' if not (result['facial_position_pass'] and all(x['pass'] for x in result['dimensions'].values()) and result['head_silhouette']['pass'] and result['geometry_pass']) else 'PENDING_VISUAL_REVIEW'
 review_path=OUT/'fit-visual-review.json'
 if review_path.exists():
  import hashlib
  review=json.loads(review_path.read_text())
  if review.get('after_front_sha256')==hashlib.sha256((OUT/'after-front.png').read_bytes()).hexdigest():
   result['visual_review']=review
   result['face_contour'].update(review['face_contour'])
   result['geometry_visual_pass']=review['geometry_pass']
   result['numeric_geometry_constraints_pass']=result['geometry_pass']
   result['geometry_pass']=result['geometry_pass'] and review['geometry_pass']
   if 'normal_rotation_area' in review:result['geometry']['normal_rotation_area']=review['normal_rotation_area']
   if not review['geometry_pass'] or not result['face_contour']['pass']:result['acceptance']='FAIL'
 save('metrics.json',result)
 scores=read('seed-scores.json');scores['status']='fitted_not_adopted' if result['acceptance']=='FAIL' else 'fitted_pending_visual_review'
 scores['final_acceptance']=result['acceptance'];scores['final_metrics']='metrics.json';save('seed-scores.json',scores)
 ref=Image.open(OUT/'reference.png').convert('RGBA');cur=Image.open(OUT/'after-front.png').convert('RGBA')
 bg=Image.new('RGBA',cur.size,'#e5e3e7');cur=Image.alpha_composite(bg,cur)
 over=Image.blend(ref,cur,.5);d=ImageDraw.Draw(over)
 for key,target in read('design-landmarks.json')['points'].items():
  if key not in fit['after_points'] or key.startswith('iris_'):continue
  a=((target[0]-397)*2,(target[1]-10)*2);p=fit['after_points'][key];b=((p[0]-397)*2,(p[1]-10)*2)
  d.line([a,b],fill='#ff2266',width=2);d.ellipse((a[0]-2,a[1]-2,a[0]+2,a[1]+2),fill='#00ffff')
  d.ellipse((b[0]-2,b[1]-2,b[0]+2,b[1]+2),outline='#ff2266',width=1)
 over.convert('RGB').save(OUT/'overlay-front.png')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['gate','seeds','final']);add_seed_argument(parser);args=parser.parse_args()
 if args.stage=='final':final(unique_seeds(args.seeds))
 else:seeds(unique_seeds(args.seeds),gate=args.stage=='gate')
