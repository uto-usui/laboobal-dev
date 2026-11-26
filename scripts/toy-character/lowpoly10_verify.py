"""Reload saved outputs; audit preserved geometry, weights and front seam."""
import bpy,sys,json,hashlib,math
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK,coords,triangles,write
from lowpoly2 import reset_pose,evaluated,weight_audit
from lowpoly_verify import topology
import lowpoly4 as p4
import lowpoly9 as p9
from geometry import aim
out=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else WORK/'lowpoly10';path=out/'character-lowpoly10.blend';bpy.ops.wm.open_mainfile(filepath=str(path));rig=bpy.data.objects['temporary_rig'];body=bpy.data.objects['low6_body'];head=bpy.data.objects['low10_head'];reset_pose(rig);m=json.loads((out/'metrics.json').read_text());base=np.load(out/'body-before.npz');mapping=np.load(out/'body-source-index.npy');names=list(base['names']);w=p4.read_weights(body,names);fixed=base['fixed'][mapping];original=base['W'][mapping];allowed=original>0;allowed[fixed]=False;allowed[fixed,names.index('spine.chest')]=True
pivot=json.loads((WORK/'lowpoly9/neck-pivot.json').read_text());boneerrors={n:max(float(np.max(abs(np.array(rig.data.bones[n].head_local)-v['head']))),float(np.max(abs(np.array(rig.data.bones[n].tail_local)-v['tail'])))) for n,v in pivot['bones'].items()};saved={}
for n in p9.POSES:p9.pose(rig,n);saved[n]=p9.region_metrics(body,head,rig)
reset_pose(rig);diff=[]
for n,regions in saved.items():
 for k,row in regions.items():
  for key,value in row.items():
   old=m['poses'][n][k][key]
   if value!=old:diff.append({'pose':n,'region':k,'key':key,'difference':abs(value-old),'integer':isinstance(value,int)})
report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source_sha256_unchanged':hashlib.sha256((WORK/'lowpoly9/character-lowpoly9.blend').read_bytes()).hexdigest()==m['input_sha256'],'weights':{o.name:weight_audit(o,set(names)) for o in [body,head]},'position_change_mm':float(np.linalg.norm(coords(body)-base['V'][mapping],axis=1).max()*1000),'other_weight_max_error':float(abs(w[~fixed]-original[~fixed]).max()),'neck_and_collar_chest_1':bool(np.all(w[fixed,names.index('spine.chest')]==1) and np.all(np.delete(w[fixed],names.index('spine.chest'),axis=1)==0)),'stored_weight_leaks':int(((w>1e-8)&~allowed).sum()),'head_rigid':bool(np.all(p4.read_weights(head,names)[:,names.index('head')]==1)),'neck_bones_max_error_m':boneerrors,'body_topology':topology(body),'head_topology':topology(head),'float_max_pose_error':max([x['difference'] for x in diff if not x['integer']],default=0),'integer_counts_match':not any(x['integer'] for x in diff),'pose_actions':[a.name for a in bpy.data.actions if a.name.startswith('lowpoly10_')]}
assert report['source_sha256_unchanged'] and report['stored_weight_leaks']==0 and report['position_change_mm']==0 and report['other_weight_max_error']==0 and report['neck_and_collar_chest_1'] and max(boneerrors.values())==0
assert report['float_max_pose_error']<1e-4 and report['integer_counts_match'];write(out/'saved-verification.json',report)
report['stored_weight_sum_error_all_positive']=float(abs(w.sum(1)-1).max());write(out/'saved-verification.json',report)
print('VERIFIED',json.dumps(report),flush=True)

# Sample the actual visible skin transition with perspective camera rays. Step
# height is a camera-depth discontinuity, width is the seam's world-X span.
# The two-pixel interval is 0.45mm at the target plane. The rest-height neck
# mask excludes a lowered jaw's occlusion edge from the actual neck join.
bf=triangles(body);hf=triangles(head);bl=np.array([a.value for a in body.data.attributes['part_id'].data]);hl=np.array([a.value for a in head.data.attributes['part2'].data]);head_neck=(hl==0)&(coords(head)[hf].mean(1)[:,2]<.704);cam=bpy.context.scene.camera;scene=bpy.context.scene;cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(25);width=1280;height=800;rows={};fields={}
for name in p9.POSES:
 if name.startswith(('arm','spine')):continue
 p9.pose(rig,name);bp=evaluated(body);hp=evaluated(head);bt=BVHTree.FromPolygons(bp.tolist(),bf.tolist(),all_triangles=True);ht=BVHTree.FromPolygons(hp.tolist(),hf.tolist(),all_triangles=True);target=rig.pose.bones['neck'].head.copy();rows[name]={}
 for angle in [0,25,90]:
  a=math.radians(angle);distance=.18/(2*math.tan(math.radians(12.5)));cam.location=target+Vector((distance*math.sin(a),-distance*math.cos(a),0));aim(cam,target);bpy.context.view_layer.update();rotation=cam.matrix_world.to_3x3();origin=cam.location.copy();forward=rotation@Vector((0,0,-1));sy=math.tan(math.radians(12.5));sx=sy*width/height
  # Only the front opening and jaw region is relevant to the skin/skin seam.
  xs=np.arange(260,1021,2);ys=np.arange(230,581,2);ids=np.zeros((len(ys),len(xs)),np.int8);points=np.full((*ids.shape,3),np.nan)
  for iy,y in enumerate(ys):
   for ix,x in enumerate(xs):
    ray=(rotation@Vector(((2*(x+.5)/width-1)*sx,(1-2*(y+.5)/height)*sy,-1))).normalized();bh=bt.ray_cast(origin,ray);hh=ht.ray_cast(origin,ray);nearest=bh if bh[0] is not None and (hh[0] is None or bh[3]<hh[3]) else hh
    if nearest[0] is None:continue
    if nearest is bh:kind=1 if bl[bh[2]]==2 else 3
    else:kind=2 if head_neck[hh[2]] else 4
    ids[iy,ix]=kind;points[iy,ix]=nearest[0]
  seams=[];deltas=[]
  for axis in [0,1]:
   aa=(slice(None,-1),slice(None)) if axis==0 else (slice(None),slice(None,-1));bb=(slice(1,None),slice(None)) if axis==0 else (slice(None),slice(1,None));mask=((ids[aa]==1)&(ids[bb]==2))|((ids[aa]==2)&(ids[bb]==1))
   if np.any(mask):
    pa=points[aa][mask];pb=points[bb][mask];seams.extend(((pa+pb)/2).tolist());deltas.extend(abs((pa-pb)@np.array(forward)).tolist())
  if seams:
   q=np.array(seams);r={'skin_transition_samples':len(q),'step_depth_max_mm':max(deltas)*1000,'step_depth_p95_mm':float(np.percentile(deltas,95))*1000,'world_x_width_mm':float(np.ptp(q[:,0]))*1000,'projected_width_mm':float(np.ptp(q@np.array(rotation@Vector((1,0,0)))))*1000,'world_height_range_mm':(np.array([q[:,2].min(),q[:,2].max()])*1000).tolist(),'bounds_mm':(np.array([q.min(0),q.max(0)])*1000).tolist()}
  else:r={'skin_transition_samples':0,'step_depth_max_mm':None,'world_x_width_mm':None}
  rows[name][str(angle)]=r;fields[f'{name}_{angle}_ids']=ids;fields[f'{name}_{angle}_points']=points
 print('SEAM',name,json.dumps(rows[name]),flush=True)
reset_pose(rig);write(out/'seam-measurements.json',{'method':'visible body-skin/head-neck transitions; head-neck=part2 skin centroid rest z<704mm, excludes lowered jaw occlusion edges; perspective ray sample every2px at1280x800; vertical plane spacing0.45mm; depth jump along view; projected width along camera-right; no geometric repair','rows':rows});np.savez_compressed(out/'seam-fields.npz',**fields)
