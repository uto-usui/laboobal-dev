"""Ninth pass, preserving eighth-pass surface and restricted weights."""
import os,json,math,time,hashlib,subprocess
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector,Quaternion,Matrix
from mathutils.bvhtree import BVHTree
from lowpoly import WORK,coords,triangles,write,activate,mesh_obj,recalc,bvh
from lowpoly2 import reset_pose,evaluated,turn_world,set_pose as old_pose,clone,weight_audit
from lowpoly_verify import topology,visible,area_samples,combined
from lowpoly8_neck import section_segments
import lowpoly3 as p3
import lowpoly4 as p4
from geometry import aim,material
PYTHON=WORK/'venv-geo/bin/python'
POSES={'rest':{},**{f'neck_{direction}{a:g}':{'neck':(direction,a)} for direction,maximum in [('left',25),('right',25),('up',10),('down',10)] for a in [maximum/2,maximum]},'upper_left8':{'upper':8},'upper_right8':{'upper':-8},'combo_left':{'upper':8,'neck':('left',25)},'combo_right':{'upper':-8,'neck':('right',25)},'combo_up_left':{'neck':('left',25),'pitch':-10},'arm_L_70_elbow90':{'arm':'L'},'arm_R_70_elbow90':{'arm':'R'},'arms_both70_elbow90':{'arm':'both'},'spine_left15':{'spine':15},'spine_right15':{'spine':-15},'spine_forward15':{'forward':15}}

def log(out,s):
 print('LOWPOLY9',s,flush=True)
 with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def pose(rig,name):
 reset_pose(rig);r=POSES[name]
 if 'arm' in r:
  if r['arm']!='both':old_pose(rig,'arm_'+r['arm']+'_70_elbow90')
  else:
   old_pose(rig,'arm_L_70_elbow90');saved={b.name:b.rotation_quaternion.copy() for b in rig.pose.bones if b.name.endswith('.L')};old_pose(rig,'arm_R_70_elbow90')
   for n,q in saved.items():rig.pose.bones[n].rotation_quaternion=q
   bpy.context.view_layer.update()
 if 'upper' in r:
  for n in ['spine.upper','spine.chest']:turn_world(rig,n,(0,0,1),r['upper']/2)
 if 'spine' in r or 'forward' in r:
  for n in ['spine.lower','spine.upper','spine.chest']:turn_world(rig,n,(1,0,0) if 'forward' in r else (0,0,1),r.get('forward',r.get('spine'))/3)
 if 'neck' in r:
  direction,a=r['neck'];axis=(0,0,1) if direction in ['left','right'] else (1,0,0);a*=1 if direction in ['left','down'] else -1
  turn_world(rig,'neck',axis,a)
 if 'pitch' in r:
  # Pre-multiply in world coordinates; preserve the preceding yaw.
  p=rig.pose.bones['neck'];M=p.matrix.copy();rotation=Matrix.Rotation(math.radians(r['pitch']),4,'X');M.translation=Vector((0,0,0));M=rotation@M;M.translation=p.head;p.matrix=M;bpy.context.view_layer.update()

def align(out,h,rig):
 v=coords(h);f=triangles(h);rows=[]
 for z in [.685,.690,.695]:
  s=section_segments(v,f,z).reshape(-1,2);rows.append(np.r_[(s.min(0)+s.max(0))/2,z])
 q=np.array(rows);center=q.mean(0);xy=q[:,:2];pairs=np.linalg.norm(xy[:,None]-xy[None,:],axis=2)
 activate(rig);bpy.ops.object.mode_set(mode='EDIT');n=rig.data.edit_bones['neck'];h=rig.data.edit_bones['head'];hl=h.length;nl=n.length;n.head=center;n.tail=center+np.array([0,0,nl]);h.head=n.tail;h.tail=h.head+Vector((0,0,hl));h.use_connect=True;n.roll=0;h.roll=0;bpy.ops.object.mode_set(mode='OBJECT');reset_pose(rig)
 report={'centers_mm':(q*1000).tolist(),'pivot_mm':(center*1000).tolist(),'center_definition':'horizontal section XY bounds midpoint of fitted original head; compare XY because heights differ by design','max_xy_from_mean_mm':float(np.linalg.norm(xy-center[:2],axis=1).max()*1000),'max_pairwise_xy_mm':float(pairs.max()*1000),'pairwise_within_5mm':bool(pairs.max()<=.005),'bones':{n:{'head':list(rig.data.bones[n].head_local),'tail':list(rig.data.bones[n].tail_local)} for n in ['neck','head']},'rotation':'turn_world conjugates world Z yaw and world X pitch through parent and bone rest frames; combined pitch pre-multiplies world X'}
 # Assert actual world rotation, including a rotated parent.
 tests=[]
 for name in ['neck_left25','neck_up10','combo_left','combo_up_left']:
  pose(rig,name);n=rig.pose.bones['neck'];deform=n.matrix.to_3x3()@n.bone.matrix_local.to_3x3().inverted();expected=Matrix.Identity(3);r=POSES[name]
  if 'upper' in r:expected=Matrix.Rotation(math.radians(r['upper']),3,'Z')
  d,a=r['neck'];expected=Matrix.Rotation(math.radians(a*(1 if d in ['left','down'] else -1)),3,'Z' if d in ['left','right'] else 'X')@expected
  if 'pitch' in r:expected=Matrix.Rotation(math.radians(r['pitch']),3,'X')@expected
  error=float(np.max(abs(np.array(deform)-np.array(expected))));tests.append({'pose':name,'world_rotation_matrix_max_error':error});assert error<1e-5
 reset_pose(rig);report['world_axis_checks']=tests;write(out/'neck-pivot.json',report);log(out,'首中心 '+json.dumps(report))

def smooth(out,body,rig):
 p=coords(body);f=triangles(body);names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names);before=w.copy();fields=np.load(out/'bridge-distances.npz');edges=np.array([e.vertices[:] for e in body.data.edges]);e=np.r_[edges,edges[:,::-1]];degree=np.maximum(np.bincount(e[:,0],minlength=len(p)),1);report={};allowed=np.zeros_like(w,dtype=bool)
 for side in ['L','R']:
  distance=fields[side];selected=distance<=.03;alpha=np.where(selected,.65*(1-np.minimum(distance/.03,1))**2,0);keys=[names.index(n) for n in ['upper_arm.'+side,'spine.chest','shoulder.'+side]];mass=w[:,keys].sum(1)
  for _ in range(80):
   old=w[:,keys].copy();avg=np.zeros_like(old);np.add.at(avg,e[:,0],old[e[:,1]]);avg/=degree[:,None];new=old*(1-alpha[:,None])+avg*alpha[:,None];new*=np.divide(mass,new.sum(1),out=np.zeros_like(mass),where=new.sum(1)>0)[:,None];w[:,keys]=new
  allowed[np.ix_(selected,keys)]=True;report[side]={'selected_vertices':int(selected.sum()),'radius_mm':30,'operator':'distance-weighted graph Smooth','repeat':80,'factor_at_bridge':.65,'bones':[names[k] for k in keys],'mass_of_other_bones_preserved':True}
 # Shoulder straps on the upper shoulder take barycentric weights directly below,
 # using a vertical ray into the actual sleeve/root and shoulder surface.
 fl=np.array([q.value for q in body.data.attributes['part_id'].data]);vl=np.load(WORK/'lowpoly8/weight-labels.npy') if (WORK/'lowpoly8/weight-labels.npy').exists() else p4.vertex_labels(body)
 sourcefaces=np.flatnonzero(np.isin(fl,[3,4,5])&np.all(~np.isin(vl[f],[8,9]),axis=1));tree=BVHTree.FromPolygons(p.tolist(),f[sourcefaces].tolist(),all_triangles=True);targets=np.flatnonzero((vl==9)&(p[:,2]>.595));copied=[];miss=[]
 from mathutils.geometry import barycentric_transform
 for i in targets:
  loc,normal,fi,dist=tree.ray_cast(Vector(p[i]+[0,0,.001]),Vector((0,0,-1)),.06)
  if loc is None:miss.append(int(i));continue
  face=f[sourcefaces[fi]];a,b,c=p[face];q=np.array(loc);u=b-a;v=c-a;z=q-a;mat=np.array([[u@u,u@v],[u@v,v@v]]);uv=np.linalg.lstsq(mat,np.array([z@u,z@v]),rcond=None)[0];weights=np.array([1-uv.sum(),*uv]);w[i]=weights@w[face];allowed[i]=np.any(w[face]>0,axis=0);copied.append({'vertex':int(i),'source_face':int(sourcefaces[fi]),'vertical_distance_mm':dist*1000})
 order=np.argsort(w,axis=1)[:,:-4];w[np.arange(len(w))[:,None],order]=0;w/=np.maximum(w.sum(1)[:,None],1e-12);p4.put_weights(body,names,w)
 np.savez(out/'weight-audit-fields.npz',before=before,allowed_new=allowed,after=w);report['straps']={'targets':len(targets),'copied':copied,'no_vertical_hit_kept_original':miss};report['max_position_change_mm']=float(np.linalg.norm(coords(body)-p,axis=1).max()*1000);write(out/'weight-smoothing.json',report);log(out,'局所Smooth '+json.dumps({s:r for s,r in report.items() if s!='straps'}))

def camera_setup(studio):
 cam=studio();scene=bpy.context.scene;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.eevee.taa_render_samples=24;scene.render.film_transparent=True
 scene.view_settings.view_transform='AgX';scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.55,.55,1)
 for node in scene.world.node_tree.nodes:
  if node.type=='BACKGROUND' and node.name!='Background':node.inputs[0].default_value=(1,1,1,1)
 return cam

def shot(out,cam,name,objects,angle=0,target=(0,0,.5),height=1.25,demo=False):
 visible(objects);scene=bpy.context.scene;target=Vector(target);a=math.radians(angle)
 if demo:
  cam.data.type='PERSP';cam.data.lens_unit='FOV';cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(25);distance=height/(2*math.tan(math.radians(12.5)));cam.location=(0,-distance,.64);aim(cam,target)
 else:
  # Same perspective FOV for close inspection, with independently framed crops.
  cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(25);distance=height/(2*math.tan(math.radians(12.5)));cam.location=target+Vector((distance*math.sin(a),-distance*math.cos(a),0));aim(cam,target)
 scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)

def prepare(out,studio):
 bpy.ops.wm.open_mainfile(filepath=str(WORK/'lowpoly8/character-lowpoly8.blend'));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig);body=bpy.data.objects['low6_body'];high=bpy.data.objects['high3_head_original'];old=bpy.data.objects['low6_head'];old.name='eighth_head'
 v,f=combined([high,bpy.data.objects['high3_cap_original']]);np.savez(out/'head-source.npz',V=v,F=f);np.savez(out/'body-source.npz',V=coords(body),F=triangles(body))
 subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly9_geometry.py')),str(out),'bridges'],check=True)
 digest=hashlib.sha256(v.astype(float).tobytes()+f.astype(np.int64).tobytes()).hexdigest();fillmeta=out/'head-fill.json'
 if not fillmeta.exists() or json.loads(fillmeta.read_text()).get('source_sha256')!=digest:
  subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly9_geometry.py')),str(out),'head'],check=True)
 align(out,high,rig);smooth(out,body,rig)
 d=np.load(out/'head-filled.npz');head=mesh_obj('filled_head_candidate',d['V'],d['F']);recalc(head,True)
 # Collapse reduces the solid; tiny weights protect the visible eyes/nose/mouth.
 weights=np.ones(len(head.data.vertices));p=coords(head);face=(p[:,1]<-.055)&(abs(p[:,0])<.095)&(p[:,2]>.725)&(p[:,2]<.87);weights[face]=.015;p3.collapse_mask(head,9000,weights);p3.transfer_labels(head,high,'part2');p3.rigid(head,'head');p3.attach_armature(head,rig)
 np.savez(out/'head-candidate.npz',V=coords(head),F=triangles(head));cam=camera_setup(studio);clay=material('Ninth pass neutral clay',(.72,.72,.72),.8)
 for obj in [high,head,old,bpy.data.objects['high3_cap_original']]:
  obj.data.materials.clear();obj.data.materials.append(clay)
 for label,objects in [('original',[high,bpy.data.objects['high3_cap_original']]),('eighth',[old]),('filled',[head])]:
  for a in [0,25,90]:shot(out,cam,f'face-{label}-{a}.png',objects,a,(0,-.03,.81),.27)
 reset_pose(rig);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'candidate-checkpoint.blend'));log(out,'候補を保存')

def region_metrics(body,head,rig):
 p=coords(body);q=evaluated(body);edges=np.array([e.vertices[:] for e in body.data.edges]);f=triangles(body);ratio=np.linalg.norm(q[edges[:,1]]-q[edges[:,0]],axis=1)/np.maximum(np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1),1e-15)
 def aspect(v):
  t=v[f];length=np.stack([np.linalg.norm(t[:,1]-t[:,0],axis=1),np.linalg.norm(t[:,2]-t[:,1],axis=1),np.linalg.norm(t[:,0]-t[:,2],axis=1)],1);area2=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1);return length.max(1)**2/np.maximum(area2,1e-20)
 ar=aspect(p);aq=aspect(q);thin=(aq>10)&(aq>3*ar);j=json.loads((WORK/'lowpoly8/joints.json').read_text());masks={'neck':(p[:,2]>.60)&(abs(p[:,0])<.10),'chest':(p[:,2]>.48)&(p[:,2]<.65)&(abs(p[:,0])<.115)}
 for name,key,radius in [('shoulder','shoulder_',.075),('armpit','shoulder_',.095),('elbow','elbow_',.065)]:
  for side in ['L','R']:
   mask=np.linalg.norm(p-np.array(j[key+side]),axis=1)<radius
   if name=='armpit':mask&=p[:,2]<j[key+side][2]+.01
   masks[name+'_'+side]=mask
  masks[name]=masks[name+'_L']|masks[name+'_R']
 result={}
 for name,mask in masks.items():
  e=np.any(mask[edges],1);ff=np.any(mask[f],1);r=ratio[e];result[name]={'edge_p99':float(np.percentile(r,99)),'thin_faces':int((thin&ff).sum()),'tested_edges':int(e.sum()),'tested_faces':int(ff.sum()),'max_stretch':float(r.max())}
 # Include rigid head explicitly in neck statistics, without diluting body P99.
 result['head']={'edge_p99':1.,'thin_faces':0};return result

def export_contacts(out,body,head,rig):
 hp=coords(head);hf=triangles(head);labels=np.array([x.value for x in head.data.attributes['part2'].data]);vl=np.zeros(len(hp),int)
 for k in [0,1]:vl[np.unique(hf[labels==k])]=k
 neck=(vl==0)&(hp[:,2]<.704);hairjaw=(hp[:,2]<.80)&((vl==1)|((hp[:,2]>.704)&(hp[:,1]<-.015)));rows={}
 bone_names=[b.name for b in rig.data.bones];matrices={}
 for name in POSES:
  pose(rig,name);matrices['bones_'+name]=np.array([rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted() for n in bone_names]);q=evaluated(head);ch=rig.pose.bones['spine.chest'];M=ch.matrix@ch.bone.matrix_local.inverted();inv=np.array(M.inverted());matrices['chest_inv_'+name]=inv;matrices['body_pose_'+name]=(np.c_[evaluated(body),np.ones(len(body.data.vertices))]@inv.T)[:,:3];r=(np.c_[q,np.ones(len(q))]@inv.T)[:,:3];rows[name]=r
 reset_pose(rig);np.savez(out/'contact-input.npz',neck=neck,hairjaw=hairjaw,rest=hp,body_V=coords(body),body_F=triangles(body),body_W=p4.read_weights(body,bone_names),**matrices,**{'pose_'+k:v for k,v in rows.items()})

def finish(out,studio):
 bpy.ops.wm.open_mainfile(filepath=str(out/'candidate-checkpoint.blend'));body=bpy.data.objects['low6_body'];rig=bpy.data.objects['temporary_rig'];old=bpy.data.objects['eighth_head'];candidate=bpy.data.objects['filled_head_candidate'];decision=json.loads((out/'head-decision.json').read_text())
 head=candidate if decision['adopt'] else old;head.name='low9_head';reset_pose(rig)
 if not decision['adopt']:
  # Remove only small disconnected components completely occluded from 26 exterior directions.
  clean_hidden(out,head)
 cam=bpy.context.scene.camera;clay=material('Ninth body clay',(.72,.72,.72),.8);body.data.materials.clear();body.data.materials.append(clay)
 metrics={'head':decision,'neck':json.loads((out/'neck-pivot.json').read_text()),'topology':{'body':topology(body),'head':topology(head)},'poses':{},'stretch_definition':'edge length posed/rest; face aspect longest edge / altitude; thin means aspect>10 and >3x rest','input_sha256':hashlib.sha256((WORK/'lowpoly8/character-lowpoly8.blend').read_bytes()).hexdigest()}
 for name in POSES:pose(rig,name);metrics['poses'][name]=region_metrics(body,head,rig)
 reset_pose(rig);export_contacts(out,body,head,rig);write(out/'metrics.json',metrics)
 # Keep a recoverable geometry checkpoint before the longer rendering step.
 visible([body,head]);bpy.ops.wm.save_as_mainfile(filepath=str(out/'geometry-checkpoint.blend'))
 render_outputs(out,body,head,rig,cam)
 reset_pose(rig);visible([body,head]);bpy.context.preferences.filepaths.save_version=0
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.hide_set(o not in [body,head])
 rig.animation_data_create()
 for name in POSES:
  pose(rig,name);a=bpy.data.actions.new('lowpoly9_'+name);a.use_fake_user=True;rig.animation_data.action=a
  for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_quaternion',frame=1,group=bone.name)
  rig.animation_data.action=None
 reset_pose(rig);shot_camera_only(cam);bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly9.blend'));log(out,'最終ファイル保存。画像と数値の判定は metrics.json / log.md に追記する')

def clean_hidden(out,head):
 p=coords(head);f=triangles(head);original_bottom=float(p[:,2].min());adj=[set() for _ in p]
 for a,b,c in f:adj[a].update([b,c]);adj[b].update([a,c]);adj[c].update([a,b])
 unseen=set(range(len(p)));components=[]
 while unseen:
  seed=unseen.pop();stack=[seed];verts={seed}
  while stack:
   x=stack.pop();new=adj[x]&unseen;unseen-=new;verts|=new;stack.extend(new)
  components.append(verts)
 tree=bvh(head);dirs=[Vector((x,y,z)).normalized() for x in [-1,0,1] for y in [-1,0,1] for z in [-1,0,1] if x or y or z];remove=[];rows=[]
 for vs in components:
  ids=np.flatnonzero(np.all(np.isin(f,list(vs)),1))
  if len(ids)>=100:continue
  if np.min(p[list(vs),2])<=original_bottom+1e-8:
   rows.append({'faces':len(ids),'removed':False,'reason':'retain original lower bound'});continue
  # A component is retained if even one vertex or face centroid has an open exterior ray.
  points=np.r_[p[list(vs)],p[f[ids]].mean(1)];visible_any=False
  for point in points:
   for direction in dirs:
    origin=Vector(point)+direction*2;hit=tree.ray_cast(origin,-direction,2.01)
    if hit[0] is not None and hit[2] in set(ids.tolist()):visible_any=True;break
   if visible_any:break
  if not visible_any:remove.extend(ids.tolist())
  rows.append({'faces':len(ids),'removed':not visible_any})
 if remove:
  bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES');loose=[v for v in bm.verts if not v.link_faces];bmesh.ops.delete(bm,geom=loose,context='VERTS');bm.to_mesh(head.data);bm.free();head.data.update()
 write(out/'hidden-head-components.json',{'test':'all vertices and face centroids, 26 exterior directions; preserve if any directly visible; preserve original lower bound','removed_faces':len(remove),'components':rows})

def shot_camera_only(cam):
 cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(25);cam.location=(0,-1.25/(2*math.tan(math.radians(12.5))),.64);aim(cam,(0,0,.5))

def render_outputs(out,body,head,rig,cam):
 highs=[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original','high3_cap_original']];scene=bpy.context.scene
 for obj in highs:
  obj.data.materials.clear();obj.data.materials.append(body.data.materials[0])
 for name in POSES:
  pose(rig,name);shot(out,cam,f'demo-{name}.png',[body,head],demo=True)
  target=rig.pose.bones['neck'].head
  for a in [0,25,90]:shot(out,cam,f'neck-close-{name}-{a}.png',[body,head],a,target,.18)
  if any(k in POSES[name] for k in ['arm','upper','spine','forward']):
   for side in ['L','R']:
    for a in [0,155]:shot(out,cam,f'armpit-close-{name}-{side}-{a}.png',[body,head],a,rig.pose.bones['upper_arm.'+side].head,.28)
 reset_pose(rig)
 for a in [0,90,180,270]:
  for label,objects in [('low',[body,head]),('high',highs)]:shot(out,cam,f'view-{label}-{a}.png',objects,a,height=1.25)
 render_wire(out,body,head,cam)
 scene.render.engine='BLENDER_WORKBENCH';scene.render.film_transparent=True;scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE'
 for a in range(0,360,45):
  for label,objects in [('low',[body,head]),('high',highs)]:shot(out,cam,f'mask-{label}-{a}.png',objects,a,height=1.25)
 scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=False

def render_wire(out,body,head,cam):
 wires=[]
 for o in [body,head]:
  w=clone(o,'wire9_'+o.name);w.data.materials.clear();w.data.materials.append(material('wire9',(.005,.005,.005),.8))
  for f in w.data.polygons:f.material_index=0
  m=w.modifiers.new('Actual mesh edges','WIREFRAME');m.thickness=.0008;m.offset=1.;wires.append(w)
 j=json.loads((WORK/'lowpoly8/joints.json').read_text())
 for name,a,target,height in [('0',0,(0,0,.5),1.25),('90',90,(0,0,.5),1.25),('face',0,(0,-.04,.83),.32),('shoulder',25,j['shoulder_R'],.22),('elbow',25,j['elbow_R'],.18)]:
  for w in wires:w.modifiers[-1].thickness=height/800*.75
  shot(out,cam,f'wire-{name}.png',[body,head]+wires,a,target,height)
 for w in wires:bpy.data.objects.remove(w,do_unlink=True)


def run(out,studio,render):
 phase=os.environ.get('LOWPOLY9_PHASE','all');log(out,'開始 '+phase)
 if phase in ['prepare','all']:
  prepare(out,studio)
  subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly9_report.py')),str(out),'face'],check=True)
 if phase in ['finish','all']:
  if not (out/'head-decision.json').exists():
   d=json.loads((out/'face-distance.json').read_text());d.update(adopt=False,visual_pass=False,reason='Numeric face threshold failed' if not d['numeric_pass'] else 'No recorded visual acceptance; preserve the eighth-pass head');write(out/'head-decision.json',d)
  finish(out,studio)
  bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly9.blend'))
  export_contacts(out,bpy.data.objects['low6_body'],bpy.data.objects['low9_head'],bpy.data.objects['temporary_rig'])
  for task in ['contacts','report']:subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly9_report.py')),str(out),task],check=True)
  subprocess.run([bpy.app.binary_path,'-b','--factory-startup','--python-exit-code','1','-P',str(Path(__file__).with_name('lowpoly9_verify.py'))],check=True)
 if phase=='render':
  bpy.ops.wm.open_mainfile(filepath=str(out/'geometry-checkpoint.blend'));render_outputs(out,bpy.data.objects['low6_body'],bpy.data.objects['low9_head'],bpy.data.objects['temporary_rig'],bpy.context.scene.camera)
