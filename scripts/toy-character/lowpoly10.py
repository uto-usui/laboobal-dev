"""Tenth pass: chest-fixed opening, protected source Collapse, conservative fragments."""
import os,sys,json,time,hashlib,subprocess
from pathlib import Path
from collections import Counter
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import WORK,coords,triangles,write,activate,recalc,bvh,clean
from lowpoly2 import clone,reset_pose,evaluated,split_surface_fans,visible_exterior
from lowpoly_verify import topology,visible
import lowpoly3 as p3
import lowpoly4 as p4
import lowpoly9 as p9
from geometry import material
PYTHON=WORK/'venv-geo/bin/python'


def log(out,message):
 print('LOWPOLY10',message,flush=True)
 with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def components(p,f):
 adj=[set() for _ in p]
 for a,b,c in f:adj[a].update([b,c]);adj[b].update([a,c]);adj[c].update([a,b])
 unseen=set(np.unique(f).tolist());result=[]
 while unseen:
  x=unseen.pop();stack=[x];vs={x}
  while stack:
   x=stack.pop();new=adj[x]&unseen;unseen-=new;vs|=new;stack.extend(new)
  ids=np.flatnonzero(np.all(np.isin(f,list(vs)),axis=1));result.append((np.array(sorted(vs)),ids))
 return result


def repair_body(out,body,rig):
 p=coords(body);f=triangles(body);names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names);labels=np.load(WORK/'lowpoly8/weight-labels.npy');collar=(labels==3)&(p[:,2]>.642)&(abs(p[:,0])<.089);fixed=(labels==2)|collar;before=w.copy();w[fixed]=0;w[fixed,names.index('spine.chest')]=1;p4.put_weights(body,names,w)
 np.savez(out/'body-before.npz',V=p,F=f,W=before,fixed=fixed,names=names)
 # Delete the two zero-area faces first. Their boundary has two coincident
 # vertices: stitch those existing rim vertices rather than creating new points.
 bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();bm.verts.ensure_lookup_table();layer=bm.verts.layers.int.new('low10_source_index')
 for v in bm.verts:v[layer]=v.index
 bad=[q for q in bm.faces if q.calc_area()<1e-14];removed=[q.index for q in bad];bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY');rim=[e for e in bm.edges if e.is_boundary];rimverts=list({v for e in rim for v in e.verts});pairs=[];targetmap={}
 for a in rimverts:
  for b in rimverts:
   if a.index<b.index and (a.co-b.co).length<1e-10:targetmap[b]=a;pairs.append([b[layer],a[layer]])
 if targetmap:bmesh.ops.weld_verts(bm,targetmap=targetmap)
 loose=[e for e in bm.edges if not e.link_faces]
 if loose:bmesh.ops.delete(bm,geom=loose,context='EDGES')
 rim=[e for e in bm.edges if e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'] if rim else []
 if filled:bmesh.ops.triangulate(bm,faces=filled)
 bm.to_mesh(body.data);bm.free();body.data.update();mapping=np.array([v.value for v in body.data.attributes['low10_source_index'].data]);p4.put_weights(body,names,w[mapping]);np.save(out/'body-source-index.npy',mapping)
 after=p4.read_weights(body,names);assert np.array_equal(coords(body),p[mapping]);assert np.allclose(after[~fixed[mapping]],before[mapping][~fixed[mapping]],atol=1e-7)
 top=topology(body);assert top['degenerate_faces']==0 and top['boundary_edges']==0 and top['connected_components']==1
 report={'fixed_vertices':int(fixed.sum()),'changed_weight_vertices':int(np.any(abs(w-before)>1e-8,axis=1).sum()),'deleted_degenerate_faces':removed,'stitched_coincident_rim_vertices':pairs,'hole_fill_faces':len(filled),'position_change_mm':0,'other_weights_max_error':float(abs(after[~fixed[mapping]]-before[mapping][~fixed[mapping]]).max()),'topology':top}
 write(out/'body-repair.json',report);log(out,'体の処理 '+json.dumps(report));return report


def protected_reduce(out,source,reference):
 p3.OUT=out;trial=clone(source,'low10_head');p3.collapse_mask(trial,500000,np.ones(len(trial.data.vertices)));p3.transfer_labels(trial,reference,'part2');history=[]
 # Same eye/nose/mouth protection as passes 6--9; additional low cost on jaw/neck.
 for pid,target in [(0,9000),(1,6000)]:
  for attempt in range(4):
   labels=np.array([a.value for a in trial.data.attributes['part2'].data]);f=triangles(trial);count=int((labels==pid).sum())
   if count<=target:break
   p=coords(trial);weights=np.zeros(len(p));weights[np.unique(f[labels==pid])]=1;p3.protect_joints(trial,weights,{},True)
   jaw=(p[:,2]<.765)&(p[:,1]<.025);neck=p[:,2]<.720;selected=(jaw|neck)&(weights>0);weights[selected]=np.minimum(weights[selected],.12)
   p3.collapse_mask(trial,len(f)-(count-target),weights);p3.transfer_labels(trial,reference,'part2');history.append({'part':pid,'before':count,'target':target,'after':int(sum(a.value==pid for a in trial.data.attributes['part2'].data))})
 p3.face_attr(trial,'head_region',np.array([a.value for a in trial.data.attributes['part2'].data]));cap=clone(bpy.data.objects['high3_cap_original'],'low10_cap');p3.collapse_mask(cap,1000,np.ones(len(cap.data.vertices)));p3.face_attr(cap,'part2',np.ones(len(cap.data.polygons),int));p3.face_attr(cap,'head_region',np.full(len(cap.data.polygons),2,int));activate(trial);cap.select_set(True);bpy.ops.object.join();recalc(trial,True)
 enforce_head_budget(trial,history)
 write(out/'head-reduction.json',{'budget':16000,'allocation':{'face_skin':9000,'hair':6000,'cap':1000},'history':history,'triangles_before_fragment_cleanup':len(triangles(trial)),'face_protection':'same protect_joints eye=.12 detail=.25','additional_protection':'jaw z<765mm,y<25mm; neck z<720mm; collapse cost min(existing,.12)'});return trial


def enforce_head_budget(head,history):
 # Protected/locked regions make the modifier ratio approximate. Continue the
 # same Collapse until the actual combined count meets the 16k ceiling.
 for attempt in range(8):
  f=triangles(head);count=len(f)
  if count<=16000:return
  p=coords(head);parts=np.array([a.value for a in head.data.attributes['head_region'].data]);weights=np.ones(len(p));p3.protect_joints(head,weights,{},True);lower=((p[:,2]<.765)&(p[:,1]<.025))|(p[:,2]<.720);weights[lower]=np.minimum(weights[lower],.12);weights[np.unique(f[parts==2])]=0
  p3.collapse_mask(head,16000-attempt,weights);history.append({'part':'combined_budget','before':count,'target':16000,'after':len(triangles(head))})
 assert len(triangles(head))<=16000


def cleanup_fragments(out,head):
 p=coords(head);f=triangles(head);parts=np.array([a.value for a in head.data.attributes['head_region'].data]);comps=components(p,f);tree=bvh(head);dirs=[Vector((x,y,z)).normalized() for x in [-1,0,1] for y in [-1,0,1] for z in [-1,0,1] if x or y or z]
 # Close only a diagnostic cap copy using its existing boundary. This volume
 # classifies hidden hair fragments; the output cap geometry is never filled.
 cap=bpy.data.objects['high3_cap_original'];bm=bmesh.new();bm.from_mesh(cap.data);rim=[e for e in bm.edges if e.is_boundary];filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'];bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.verts.index_update();cv=np.array([tuple(v.co) for v in bm.verts]);cf=np.array([[v.index for v in q.verts] for q in bm.faces]);boundary=sum(e.is_boundary for e in bm.edges);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));cf=np.array([[v.index for v in q.verts] for q in bm.faces]);bm.free();np.savez(out/'cap-volume.npz',V=cv,F=cf)
 rows=[];remove=[];pointlists=[];offset=0
 for k,(vs,ids) in enumerate(comps):
  if len(ids)>=100:continue
  points=np.r_[p[vs],p[f[ids]].mean(1)];pointlists.append(points);row={'component':k,'faces':len(ids),'face_indices':ids.tolist(),'parts':dict(Counter(map(int,parts[ids]))),'point_start':offset,'point_count':len(points),'bounds_mm':(np.array([p[vs].min(0),p[vs].max(0)])*1000).tolist()};offset+=len(points);rows.append(row)
 np.save(out/'fragment-points.npy',np.concatenate(pointlists) if pointlists else np.empty((0,3)));write(out/'fragment-candidates.json',{'cap_diagnostic_boundary_edges':boundary,'cap_diagnostic_filled_faces':len(filled),'components':rows})
 subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly10_measure.py')),str(out),'cap'],check=True);inside=np.load(out/'fragment-inside-cap.npy')
 for row in rows:
  ids=row['face_indices'];idset=set(ids);pts=np.load(out/'fragment-points.npy')[row['point_start']:row['point_start']+row['point_count']];visible_any=False
  for point in pts:
   for direction in dirs:
    hit=tree.ray_cast(Vector(point)+direction*2,-direction,2.01)
    if hit[0] is not None and hit[2] in idset:visible_any=True;break
   if visible_any:break
  hair_only=all(parts[i]==1 for i in ids);incap=bool(boundary==0 and hair_only and np.all(inside[row['point_start']:row['point_start']+row['point_count']]))
  row.update(visible_26_directions=visible_any,hair_only=hair_only,all_samples_inside_cap=incap,removed=not visible_any or incap,reason='occluded_26_directions' if not visible_any else 'inside_cap' if incap else 'visible_keep')
  if row['removed']:remove.extend(ids)
 if remove:
  bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(head.data);bm.free();head.data.update()
 write(out/'hidden-head-components.json',{'method':'<100 faces; all vertices + centroids; 26 exterior rays; visible hair-only components removed only if every sample lies inside closed diagnostic cap','removed_faces':len(remove),'cap_diagnostic_boundary_edges':boundary,'components':rows});log(out,'頭の小片 '+json.dumps({'removed_faces':len(remove),'removed_components':sum(r['removed'] for r in rows),'inside_cap_components':sum(r['removed'] and r['reason']=='inside_cap' for r in rows),'visible_small_components_kept':sum(not r['removed'] for r in rows)}))


def head_inventory(out,head):
 p=coords(head);f=triangles(head);part=np.array([a.value for a in head.data.attributes['head_region'].data]);part[(part==0)&(p[f].mean(1)[:,2]<.720)]=3;names=['face','hair','cap','neck'];bins=[0,.70,.72,.76,.80,.86,.92,1.,2.];band=np.digitize(p[f].mean(1)[:,2],bins)-1;edges=np.sort(np.r_[f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]],axis=1);owners=np.tile(np.arange(len(f)),3);u,first,counts=np.unique(edges,axis=0,return_index=True,return_counts=True);be=u[counts==1];bo=owners[first[counts==1]];bpart=part[bo];bband=np.digitize(p[be].mean(1)[:,2],bins)-1;rows=[]
 for k,(vs,ids) in enumerate(components(p,f)):
  rows.append({'id':k,'vertices':len(vs),'faces':len(ids),'bounds_mm':(np.array([p[vs].min(0),p[vs].max(0)])*1000).tolist(),'dominant_part':names[int(np.bincount(part[ids],minlength=4).argmax())],'height_band':int(np.digitize(p[vs,2].mean(),bins)-1),'faces_by_part':{n:int((part[ids]==i).sum()) for i,n in enumerate(names)}})
 bypart={n:{'triangles':int((part==i).sum()),'boundary_edges':int((bpart==i).sum()),'components_dominant':sum(r['dominant_part']==n for r in rows),'components_touching':sum(r['faces_by_part'][n]>0 for r in rows)} for i,n in enumerate(names)}
 table=[]
 for i,n in enumerate(names):
  for k in range(len(bins)-1):table.append({'part':n,'height_mm':[bins[k]*1000,bins[k+1]*1000],'triangles':int(((part==i)&(band==k)).sum()),'boundary_edges':int(((bpart==i)&(bband==k)).sum()),'components_dominant_centroid':sum(r['dominant_part']==n and r['height_band']==k for r in rows)})
 result={'topology':topology(head),'parts':bypart,'height_table':table,'components':rows,'definition':'global vertex-connected components assigned to dominant face part and vertex-mean height; touching counts are not additive; true boundary edge assigned to its sole face part and edge-midpoint height; face skin below720mm is neck'};write(out/'head-inventory.json',result);return result


def prepare(out):
 source=WORK/'lowpoly9/character-lowpoly9.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig);body=bpy.data.objects['low6_body'];repair_body(out,body,rig)
 high=bpy.data.objects['high3_head_original'];src=clone(high,'source10_head');log(out,'元の頭の外面を確認');cleanup={'exterior':visible_exterior(src),'clean':clean(src,False),'split_fans':split_surface_fans(src,remove_small=False)};p3.transfer_labels(src,high,'part2');log(out,'頭の減面開始 '+json.dumps(cleanup));head=protected_reduce(out,src,high);cleanup_fragments(out,head);p3.rigid(head,'head');p3.attach_armature(head,rig);inventory=head_inventory(out,head)
 mat=material('Tenth neutral clay',(.72,.72,.72),.8)
 for o in [body,head]:
  o.data.materials.clear();o.data.materials.append(mat)
  for q in o.data.polygons:q.material_index=0
 # Preserve ninth-pass cameras and studio lights exactly.
 cam=bpy.context.scene.camera;scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;scene.eevee.taa_render_samples=24
 metrics={'stage':'lowpoly10','input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'neck':json.loads((WORK/'lowpoly9/neck-pivot.json').read_text()),'head_preparation':cleanup,'head_inventory':inventory,'topology':{'body':topology(body),'head':topology(head)},'poses':{}}
 for name in p9.POSES:p9.pose(rig,name);metrics['poses'][name]=p9.region_metrics(body,head,rig)
 reset_pose(rig);p9.export_contacts(out,body,head,rig);write(out/'metrics.json',metrics);visible([body,head]);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'geometry-checkpoint.blend'));log(out,'形状チェックポイント保存')


def render_all(out):
 bpy.ops.wm.open_mainfile(filepath=str(out/'geometry-checkpoint.blend'));body=bpy.data.objects['low6_body'];head=bpy.data.objects['low10_head'];rig=bpy.data.objects['temporary_rig'];cam=bpy.context.scene.camera;p9.render_outputs(out,body,head,rig,cam);reset_pose(rig);visible([body,head]);rig.animation_data_create()
 for name in p9.POSES:
  p9.pose(rig,name);a=bpy.data.actions.new('lowpoly10_'+name);a.use_fake_user=True;rig.animation_data.action=a
  for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=1,group=bone.name)
  rig.animation_data.action=None
 reset_pose(rig);p9.shot_camera_only(cam)
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.hide_set(o not in [body,head])
 bpy.context.scene.render.film_transparent=True;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly10.blend'));log(out,'全レンダとポーズを保存')


def run(out,studio,render):
 phase=os.environ.get('LOWPOLY10_PHASE','all');log(out,'開始 '+phase)
 if phase in ['all','prepare']:prepare(out)
 if phase in ['all','render']:
  render_all(out)
  subprocess.run([bpy.app.binary_path,'-b','--factory-startup','--python-exit-code','1','-P',str(Path(__file__).with_name('lowpoly10_face.py')),'--',str(out)],check=True)
 if phase in ['all','measure']:
  subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly9_report.py')),str(out),'contacts'],check=True)
  subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly10_measure.py')),str(out),'report'],check=True)
  subprocess.run([bpy.app.binary_path,'-b','--factory-startup','--python-exit-code','1','-P',str(Path(__file__).with_name('lowpoly10_verify.py')),'--',str(out)],check=True)
  subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly10_review.py')),str(out)],check=True)
