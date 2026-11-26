"""Reload the saved ninth pass and independently repeat its key checks."""
import bpy,sys,json,hashlib,math,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK,coords,triangles,write
from lowpoly2 import reset_pose,weight_audit
from lowpoly9 import POSES,pose,region_metrics,log
from lowpoly_verify import topology
import lowpoly4 as p4
out=WORK/'lowpoly9';path=out/'character-lowpoly9.blend';bpy.ops.wm.open_mainfile(filepath=str(path));body=bpy.data.objects['low6_body'];head=bpy.data.objects['low9_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig);metrics=json.loads((out/'metrics.json').read_text());saved={}
for name in POSES:pose(rig,name);saved[name]=region_metrics(body,head,rig)
reset_pose(rig);names=[b.name for b in rig.data.bones];audit={o.name:weight_audit(o,set(names)) for o in [body,head]};cam=bpy.context.scene.camera;frame=np.array([list(v) for v in cam.data.view_frame(scene=bpy.context.scene)]);vfov=2*math.degrees(math.atan(abs(frame[0,1]/frame[0,2])));report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source_sha256_unchanged':hashlib.sha256((WORK/'lowpoly8/character-lowpoly8.blend').read_bytes()).hexdigest()==metrics['input_sha256'],'saved_pose_metrics_identical':saved==metrics['poses'],'weights':audit,'head_bottom_mm':float(coords(head)[:,2].min()*1000),'reference_head_bottom_mm':float(coords(bpy.data.objects['high3_head_original'])[:,2].min()*1000),'body_topology':topology(body),'head_topology':topology(head),'head_rigid':bool(np.allclose(p4.read_weights(head,names)[:,names.index('head')],1)),'camera_vertical_fov_degrees':vfov,'camera_position_m':list(cam.location),'resolution':[bpy.context.scene.render.resolution_x,bpy.context.scene.render.resolution_y],'body_position_change_mm':float(np.linalg.norm(coords(body)-np.load(out/'body-source.npz')['V'],axis=1).max()*1000),'head_face_components_removed':json.loads((out/'hidden-head-components.json').read_text())['removed_faces'],'pose_actions':[a.name for a in bpy.data.actions if a.name.startswith('lowpoly9_')]}
differences=[]
for name,r in saved.items():
 for region,row in r.items():
  for key,value in row.items():
   old=metrics['poses'][name][region][key]
   if value!=old:differences.append({'pose':name,'region':region,'key':key,'saved':value,'before_save':old,'difference':abs(value-old)})
stored=p4.read_weights(body,names);fields=np.load(out/'weight-audit-fields.npz');allowed=fields['allowed_new']|(fields['before']>0);report['stored_weight_leaks']=int(((stored>1e-8)&~allowed).sum());report['stored_weight_sum_error']=float(abs(stored.sum(1)-1).max());report['stored_max_influences']=int((stored>1e-8).sum(1).max());report['pose_metrics_reproduced_within_0_0001']=all(x['difference']<1e-4 for x in differences);report['differences']=differences;report['float_max_difference']=max([x['difference'] for x in differences if isinstance(x['saved'],float)],default=0);report['integer_counts_match']=all(isinstance(x['saved'],float) for x in differences);write(out/'saved-verification.json',report)
assert report['stored_weight_leaks']==0;assert report['integer_counts_match'] and report['float_max_difference']<1e-4;assert report['source_sha256_unchanged'];assert report['body_position_change_mm']==0;assert abs(vfov-25)<1e-3
write(out/'saved-verification.json',report);log(out,'保存後の再検査 '+json.dumps({k:v for k,v in report.items() if k!='differences'},ensure_ascii=False));print({k:v for k,v in report.items() if k!='differences'})
