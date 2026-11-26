"""Check the subtraction against the accepted Blender input and exact rig."""
import bpy,numpy as np,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK,coords,triangles,write
from export_stage import bones
O=WORK/'display2'
bpy.ops.wm.open_mainfile(filepath=str(WORK/'display/400000/character-display.blend'))
original={}
for name in ['head_face','hair','body']:
 o=bpy.data.objects[name];p=coords(o);f=triangles(o);original[name]={'p':p,'f':f,'corners':np.array([tuple(x.vector) for x in o.data.corner_normals])}
rig=bones(bpy.data.objects['character_rig'])
bpy.ops.wm.open_mainfile(filepath=str(O/'character-display2.blend'))
assert bones(bpy.data.objects['character_rig'])==rig
report={'bones_unchanged':True,'bones':len(rig),'parts':{}}
for name in ['head_face','hair','body']:
 o=bpy.data.objects[name];p=coords(o);f=triangles(o);orig=original[name];old={tuple(np.round(v,9)) for v in orig['p']};new=sum(tuple(np.round(v,9)) not in old for v in p)
 q=p[f];oldfaces={tuple(np.round(t.ravel(),8)) for t in orig['p'][orig['f']]};unchanged=sum(tuple(np.round(t.ravel(),8)) in oldfaces for t in q)
 report['parts'][name]={'before_triangles':len(orig['f']),'triangles':len(f),'new_vertices':new,'unchanged_triangles':unchanged}
 if name!='body':
  assert new==0 and unchanged==len(f)
  normals={tuple(np.round(t.ravel(),8)):n for t,n in zip(orig['p'][orig['f']],orig['corners'].reshape(-1,3,3))}
  current=np.array([tuple(x.vector) for x in o.data.corner_normals]).reshape(-1,3,3)
  difference=max(float(np.max(abs(normals[tuple(np.round(t.ravel(),8))]-n))) for t,n in zip(q,current))
  report['parts'][name]['unchanged_corner_normal_max_error']=difference
 if name=='body':
  old_normals={tuple(np.round(t.ravel(),8)):n for t,n in zip(orig['p'][orig['f']],orig['corners'].reshape(-1,3,3))}
  normals=np.array([tuple(x.vector) for x in o.data.corner_normals]);errors=[];bad=[]
  for triangle in o.data.loop_triangles:
   key=tuple(np.round(p[list(triangle.vertices)].ravel(),8))
   if key in old_normals:
    error=float(np.max(abs(normals[list(triangle.loops)]-old_normals[key])));errors.append(error)
    if error>.001:bad.append(p[list(triangle.vertices)].mean(0).tolist())
  report['parts'][name]['unchanged_corner_normal_max_error']=max(errors)
  print('BODY_NORMAL_ERROR',np.percentile(errors,[50,95,99,100]),'bad',len(bad),'bounds',np.min(bad,axis=0) if bad else [],np.max(bad,axis=0) if bad else [],flush=True)
  report['parts'][name]['normal_errors_over_001']={'faces':len(bad),'centers':bad}
  bad=np.asarray(bad)
  assert len(bad)==0 or np.all((abs(bad[:,0])<.055)&(bad[:,1]>-.10)&(bad[:,1]<.05)&(bad[:,2]>.66)&(bad[:,2]<.70))
  report['parts'][name]['normal_changes_confined_to_neck_cut']=True
 groups={g.index:g.name for g in o.vertex_groups}
 error=max(abs(sum(g.weight for g in v.groups)-1) for v in o.data.vertices);influences=max(len(v.groups) for v in o.data.vertices)
 assert error<1e-6 and influences<=4
 report['parts'][name].update(max_weight_sum_error=error,max_influences=influences)
 if name!='body':assert all(len(v.groups)==1 and groups[v.groups[0].group]=='head' and v.groups[0].weight==1 for v in o.data.vertices)
 if name=='hair':assert np.array_equal(p,orig['p']) and np.array_equal(f,orig['f'])
report['triangles']=sum(len(triangles(o)) for o in bpy.data.objects if o.type=='MESH')
write(O/'geometry-verification.json',report);print(json.dumps(report,indent=2))
