"""Fidelity stages: immutable imports, metric cameras, constrained cage deformation."""
import hashlib,json,math
from pathlib import Path
import bmesh,bpy,numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character'
GEN=WORK/'img3d/fidelity'
OUT=WORK/'fidelity'
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def import_mesh(path,name):
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(path))
 meshes=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
 assert len(meshes)==1
 obj=meshes[0];obj.name=name
 obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world.identity()
 for o in set(bpy.data.objects)-before:
  if o!=obj:bpy.data.objects.remove(o,do_unlink=True)
 return obj
def coords(obj):
 p=np.empty(len(obj.data.vertices)*3);obj.data.vertices.foreach_get('co',p);return p.reshape(-1,3)
def setcoords(obj,p):obj.data.vertices.foreach_set('co',p.ravel());obj.data.update()
def setup(studio):
 if not bpy.context.scene.world:bpy.context.scene.world=bpy.data.worlds.new('World')
 cam=studio();s=bpy.context.scene
 s.render.resolution_x=s.render.resolution_y=920;s.render.film_transparent=True
 return cam
def views(out,cam,render,obj,label,body=False):
 z=.5 if body else (1213-240)/1177;scale=1.12 if body else 460/1177
 s=bpy.context.scene;s.render.resolution_x=s.render.resolution_y=920
 for view,position in [('front',(0,-2,z)),('45',(math.sqrt(2),-math.sqrt(2),z))]:
  render(out,cam,f'{label}-{view}.png',position,(0,0,z),scale)
def emission_materials(obj):
 old=list(obj.data.materials)
 for slot,mat in enumerate(old):
  new=mat.copy();new.name=mat.name+' unlit inspection';nodes=new.node_tree.nodes;links=new.node_tree.links
  bs=nodes.get('Principled BSDF');out=nodes.get('Material Output');em=nodes.new('ShaderNodeEmission')
  if bs.inputs['Base Color'].is_linked:links.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs['Color'])
  else:em.inputs['Color'].default_value=bs.inputs['Base Color'].default_value
  links.new(em.outputs[0],out.inputs['Surface']);obj.data.materials[slot]=new
 return old
def unlit(out,cam,render,obj,label):
 old=emission_materials(obj);scene=bpy.context.scene;oldview=scene.view_settings.view_transform
 scene.view_settings.view_transform='Standard'
 z=(1213-240)/1177;render(out,cam,label+'-unlit.png',(0,-2,z),(0,0,z),460/1177)
 scene.view_settings.view_transform=oldview
 for i,m in enumerate(old):obj.data.materials[i]=m

def body_copy():
 path=WORK/'img3d/out/v4-noglasses.glb'
 if (OUT/'body-normalization.json').exists():
  assert hashlib.sha256(path.read_bytes()).hexdigest()==json.loads((OUT/'body-normalization.json').read_text())['sha256'],'Body source changed since baseline'
 obj=import_mesh(path,'body_height_1m')
 p=coords(obj);lo=p.min(0);hi=p.max(0);h=hi[2]-lo[2];offset=(lo+hi)/2;offset[2]=lo[2]
 setcoords(obj,(p-offset)/h)
 write(OUT/'body-normalization.json',{'source':'img3d/out/v4-noglasses.glb','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
  'raw_bounds':[lo.tolist(),hi.tolist()],'translation_before_scale':(-offset).tolist(),'isotropic_scale':1/h,
  'result_height_m':float(np.ptp(coords(obj)[:,2])),'shoe_bottom_z':float(coords(obj)[:,2].min()),'front':'-Y','up':'+Z'})
 return obj

def base(out,studio,render):
 obj=body_copy();cam=setup(studio)
 views(out,cam,render,obj,'before');unlit(out,cam,render,obj,'before')
 views(out,cam,render,obj,'body-original',True)
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'body-normalized.blend'))

def seeds(out,studio,render,seed_list):
 cam=setup(studio);records=json.loads((out/'seed-transforms.json').read_text()) if (out/'seed-transforms.json').exists() else {}
 for seed in seed_list:
  if not (GEN/f'head-s{seed}.glb').exists():raise RuntimeError(f'Missing requested seed {seed}')
  # Rendering is cheap compared with generation. Rebuild the diagnostic scene
  # from the GLB so cached images cannot certify a different source or an empty scene.
  obj=import_mesh(GEN/f'head-s{seed}.glb',f'seed_{seed}')
  p=coords(obj);lo=p.min(0);hi=p.max(0);h=hi[2]-lo[2]
  # Input's exposed neck ends at y=416, not at the chin (y=390).
  scale=(416-36)/1177/h;offset=(lo+hi)/2;offset[2]=hi[2]
  p=(p-offset)*scale;p[:,2]+=1;setcoords(obj,p)
  views(out,cam,render,obj,f'seed-{seed}');unlit(out,cam,render,obj,f'seed-{seed}')
  z=(1213-240)/1177
  for view,pos in [('side',(2,0,z)),('back',(0,2,z)),('left45',(-math.sqrt(2),-math.sqrt(2),z))]:
   render(out,cam,f'seed-{seed}-{view}.png',pos,(0,0,z),460/1177)
  # Welding affects only the control-mesh copy in the fit stage.
  records[str(seed)]={'raw_bounds':[lo.tolist(),hi.tolist()],'initial_scale':scale,'initial_offset':offset.tolist(),
   'vertices':len(p),'faces':len(obj.data.polygons),'bounds':[p.min(0).tolist(),p.max(0).tolist()]}
  obj.hide_render=True;obj.hide_set(True)
 write(out/'seed-transforms.json',records)
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'seeds.blend'))

def run(stage,out,studio,render,seed_list):
 if stage=='fidelity-base':base(out,studio,render)
 elif stage=='fidelity-seeds':seeds(out,studio,render,seed_list)
 elif stage=='fidelity-repair':
  from fidelity_repair import repair
  repair(out,studio,render,seed_list)
 elif stage=='fidelity-inspect':
  from fidelity_inspect import inspect
  inspect(out,studio,render,seed_list)
 elif stage=='fidelity-rank':rank_seeds(out,studio,render,seed_list)
 else:fit(out,studio,render,seed_list)

def pixel_to_world(point):return Vector(((point[0]-627)/1177,-2,(1213-point[1])/1177))
def project(point):return [float(point[0]*1177+627),float(1213-point[2]*1177)]
def select_only(obj):
 bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj

def fit(out,studio,render,seed_list):
 from mathutils.bvhtree import BVHTree
 from mathutils.kdtree import KDTree
 scores=json.loads((out/'seed-scores.json').read_text());seed=scores['selected_for_fit']
 assert seed is not None,'No non-defective seed available'
 assert seed in seed_list,'Selected seed is outside the requested seed list'
 assert not scores['seeds'][str(seed)]['excluded'],'Excluded seed must not be fitted'
 annotation=json.loads((out/'seed-landmarks.json').read_text())[str(seed)]['points']
 target=opening_centers(json.loads((out/'design-landmarks.json').read_text())['points'])
 transform=json.loads((out/'seed-transforms.json').read_text())[str(seed)]
 from fidelity_repair import load_repaired
 obj,cap=load_repaired(out);obj.name='head_high_density_fidelity'
 p=coords(obj)
 cam=setup(studio)
 views(out,cam,render,obj,'selected-unfitted');unlit(out,cam,render,obj,'selected-unfitted')
 scale,shift=similarity(annotation,target)
 p=apply_similarity(p,scale,shift)
 setcoords(cap,apply_similarity(coords(cap),scale,shift))
 # Align the visible neck stub's depth axis to the body's collar cross-section.
 reference_body=import_mesh(WORK/'img3d/out/v4-noglasses.glb','temporary_neck_depth_reference')
 bp=coords(reference_body);blo=bp.min(0);bhi=bp.max(0);bo=(blo+bhi)/2;bo[2]=blo[2];bp=(bp-bo)/(bhi[2]-blo[2])
 ring=bp[(abs(bp[:,0])<.035)&(bp[:,2]>.685)&(bp[:,2]<.710)]
 body_neck_y=float(np.mean(np.percentile(ring[:,1],[5,95])))
 stub=p[p[:,2]<p[:,2].min()+.018]
 head_neck_y=float(np.mean(np.percentile(stub[:,1],[5,95])))
 neck_depth_shift=body_neck_y-head_neck_y;p[:,1]+=neck_depth_shift
 cap_points=coords(cap);cap_points[:,1]+=neck_depth_shift;setcoords(cap,cap_points)
 bpy.data.objects.remove(reference_body,do_unlink=True)
 setcoords(obj,p)
 aligned={k:(np.array(v)*scale+shift).tolist() for k,v in annotation.items()}
 views(out,cam,render,obj,'aligned');unlit(out,cam,render,obj,'aligned')
 # Attach annotations to the actual high-density triangles before any deformation.
 obj.data.calc_loop_triangles();faces=[tuple(t.vertices) for t in obj.data.loop_triangles]
 bvh=BVHTree.FromPolygons([Vector(v) for v in p],faces,all_triangles=True)
 attachments={};unattached=[]
 from mathutils.geometry import barycentric_transform
 for key,point in aligned.items():
  loc,normal,index,distance=bvh.ray_cast(pixel_to_world(point),Vector((0,1,0)))
  if loc is None:
   # A contour pixel may fall just outside antialias coverage. Nearest geometric
   # silhouette is recorded, including the attachment offset, rather than invented.
   loc,normal,index,distance=bvh.find_nearest(pixel_to_world(point)+Vector((0,2,0)))
   unattached.append(key)
  ids=faces[index];aa,bb,cc=[Vector(p[i]) for i in ids]
  basis=barycentric_transform(loc,aa,bb,cc,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
  attachments[key]={'vertices':ids,'weights':list(basis),'before':project(loc),
   'annotation_attachment_error_px':float(np.linalg.norm(np.array(project(loc))-point))}
 # A regular radial control surface avoids spending almost all control vertices
 # on the detailed hair while collapsing the smooth face to a few triangles.
 nphi=80;nlat=56;center=np.array([0,neck_depth_shift,.842]);control=[]
 directions=[np.array([0,0,1])]
 for latitude in range(1,nlat):
  theta=math.pi*latitude/nlat
  for longitude in range(nphi):
   phi=2*math.pi*longitude/nphi
   directions.append(np.array([math.sin(theta)*math.cos(phi),math.sin(theta)*math.sin(phi),math.cos(theta)]))
 directions.append(np.array([0,0,-1]))
 for direction in directions:
  loc,_,_,_=bvh.ray_cast(Vector(center+.40*direction),Vector(-direction),.8)
  if loc is None:loc=bvh.find_nearest(Vector(center+.15*direction))[0]
  control.append(tuple(loc))
 cf=[]
 for j in range(nphi):cf.append((0,1+j,1+(j+1)%nphi))
 for row in range(nlat-2):
  for j in range(nphi):
   a=1+row*nphi+j;b=1+row*nphi+(j+1)%nphi;c=a+nphi;d=b+nphi
   cf.extend([(a,c,d),(a,d,b)])
 bottom=len(control)-1;last=1+(nlat-2)*nphi
 for j in range(nphi):cf.append((last+j,bottom,last+(j+1)%nphi))
 cm=bpy.data.meshes.new('Evenly sampled head control surface');cm.from_pydata(control,[],cf);cm.update()
 cage=bpy.data.objects.new('fidelity_control_cage',cm);bpy.context.collection.objects.link(cage);select_only(cage)
 cp=coords(cage);assert 2000<=len(cp)<=5000,f'Cage has {len(cp)} vertices'
 del bvh,faces
 kd=KDTree(len(cp))
 for i,v in enumerate(cp):kd.insert(Vector(v),i)
 kd.balance()
 # Preserve neck, posterior cranium and unmoved hairline. The unobserved depth is
 # never flattened: every requested handle displacement has delta Y = 0.
 fixed=(cp[:,2]<.697)|(cp[:,1]>neck_depth_shift)|(cp[:,2]>.846)|((abs(cp[:,0])>.115)&(cp[:,2]<.825))
 from fidelity_repair import texture_colors
 source_rgb=texture_colors(obj);loop_vertices=np.empty(len(obj.data.loops),dtype=np.int32);obj.data.loops.foreach_get('vertex_index',loop_vertices)
 dark=np.max(source_rgb,axis=1)<.12
 hair_ids=np.unique(loop_vertices[dark]);hair_kd=KDTree(len(hair_ids))
 for i,idx in enumerate(hair_ids):hair_kd.insert(Vector(p[idx]),i)
 hair_kd.balance()
 hair_fixed=np.array([hair_kd.find(Vector(v))[2]<.0035 for v in cp])
 hair_fixed &= ((cp[:,2]>.85)|(abs(cp[:,0])>.105)|(cp[:,1]>neck_depth_shift+.02))
 fixed |= hair_fixed
 handle_moves={};rejected={};accepted={}
 for key,att in attachments.items():
  if key=='crown' or key.startswith(('ear_','iris_')):continue
  position=sum((p[i]*w for i,w in zip(att['vertices'],att['weights'])),np.zeros(3))
  goal=pixel_to_world(target[key]);delta=np.array([goal.x-position[0],0,goal.z-position[2]])
  error=float(np.linalg.norm(delta)*1177)
  if error>12:
   rejected[key]={'residual_px':error,'reason':'over 12px small-residual limit; not forced'};continue
  candidates=kd.find_range(Vector(position),.0035)
  if not candidates:candidates=[kd.find(Vector(position))]
  ids=[idx for _,idx,_ in candidates if not fixed[idx]]
  if not ids:
   rejected[key]={'residual_px':error,'reason':'fixed neck, posterior cranium or hairline'};continue
  accepted[key]={'residual_before_px':error,'cage_vertices':ids}
  for i in ids:handle_moves.setdefault(i,[]).append(delta)
 pinned=cage.vertex_groups.new(name='Fixed regions and facial handles')
 pinned.add(np.where(fixed)[0].tolist(),1,'REPLACE')
 if handle_moves:pinned.add(list(handle_moves),1,'REPLACE')
 lap=cage.modifiers.new('Laplacian residual fit','LAPLACIANDEFORM');lap.vertex_group=pinned.name;lap.iterations=10
 bpy.ops.object.laplaciandeform_bind(modifier=lap.name)
 assert lap.is_bind,'Laplacian bind failed'
 changed=cp.copy()
 for i,deltas in handle_moves.items():changed[i]+=np.mean(deltas,axis=0)
 setcoords(cage,changed);bpy.context.view_layer.update()
 evaluated=coords(cage.evaluated_get(bpy.context.evaluated_depsgraph_get()))
 soft_pin_error=float(np.linalg.norm(evaluated[fixed]-cp[fixed],axis=1).max())
 # The iterative solver's anchors are approximate. Enforce the declared fixed
 # regions and moved handles exactly before transferring the displacement.
 evaluated[fixed]=cp[fixed]
 for i in handle_moves:evaluated[i]=changed[i]
 fixed_error=float(np.linalg.norm(evaluated[fixed]-cp[fixed],axis=1).max())
 # Transfer only cage displacement, retaining the original dense detail and UVs.
 # Barycentric interpolation is continuous across shared cage edges and gives
 # coincident dense UV-seam vertices exactly the same displacement.
 cage.data.calc_loop_triangles();cf=[tuple(t.vertices) for t in cage.data.loop_triangles]
 rest_bvh=BVHTree.FromPolygons([Vector(v) for v in cp],cf,all_triangles=True)
 delta=evaluated-cp;final=p.copy()
 rest_tri=[tuple(Vector(cp[i]) for i in tri) for tri in cf]
 delta_tri=[tuple(Vector(delta[i]) for i in tri) for tri in cf]
 for i,point in enumerate(p):
  nearest,normal,index,distance=rest_bvh.find_nearest(Vector(point))
  dd=barycentric_transform(nearest,*rest_tri[index],*delta_tri[index])
  final[i]+=dd
 dense_fixed=(p[:,2]<.697)|(p[:,1]>neck_depth_shift)|(p[:,2]>.846)
 dense_hair=np.zeros(len(p),bool);dense_hair[hair_ids]=True
 dense_fixed |= dense_hair & ((p[:,2]>.85)|(abs(p[:,0])>.105)|(p[:,1]>neck_depth_shift+.02))
 final[dense_fixed]=p[dense_fixed]
 setcoords(obj,final)
 if obj.data.has_custom_normals:
  obj.data.normals_split_custom_set(np.zeros((len(obj.data.loops),3),dtype=np.float32))
 obj.data.update()
 obj.data.calc_loop_triangles()
 tri=np.array([tuple(t.vertices) for t in obj.data.loop_triangles],dtype=np.int32)
 old_normal=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
 new_normal=np.cross(final[tri[:,1]]-final[tri[:,0]],final[tri[:,2]]-final[tri[:,0]])
 valid=np.linalg.norm(old_normal,axis=1)>1e-12
 flipped=int(((old_normal*new_normal).sum(axis=1)[valid]<0).sum())
 dense_y_max=float(np.max(abs(final[:,1]-p[:,1])))
 after={k:project(sum((final[i]*w for i,w in zip(a['vertices'],a['weights'])),np.zeros(3))) for k,a in attachments.items()}
 displacement=np.linalg.norm(final-p,axis=1)
 geometry={'cage_vertices':len(cp),'cage_triangles':len(cage.data.polygons),'laplacian_bound':lap.is_bind,
  'cage_preparation':'4402 vertices sampled radially from actual source triangles, regular angular spacing; dense source geometry and UVs preserved',
  'laplacian_soft_pin_drift_before_hard_constraints_m':soft_pin_error,
  'dense_transfer':'nearest cage triangle barycentric displacement, original vertex order and UV preserved','cage_fixed_vertices':int(fixed.sum()),'fixed_hair_cage_vertices':int(hair_fixed.sum()),'cage_fixed_max_drift_m':fixed_error,
  'dense_fixed_vertices':int(dense_fixed.sum()),'dense_fixed_max_drift_m':float(np.linalg.norm(final[dense_fixed]-p[dense_fixed],axis=1).max()),
  'max_dense_displacement_m':float(displacement.max()),'normal_rotation_over_90_triangles':flipped,'dense_max_depth_change_m':dense_y_max,'p95_dense_displacement_m':float(np.percentile(displacement,95)),
  'head_neck_connected':False,'neck_depth_translation_m':neck_depth_shift,'body_neck_axis_y':body_neck_y,'depth_policy':'deltaY=0 at handles; unobserved shape retained through Laplacian regularization',
  'large_residual_limit_px':12,'rejected_handles':rejected,'accepted_handles':accepted,'contour_attachment_fallbacks':unattached}
 cage.hide_render=True;cage.hide_set(True)
 views(out,cam,render,obj,'after');unlit(out,cam,render,obj,'after')
 # Additional views expose flattening or holes hidden from the specified two views.
 z=(1213-240)/1177
 for label,pos in [('left45',(-math.sqrt(2),-math.sqrt(2),z)),('side',(2,0,z)),('back',(0,2,z))]:
  render(out,cam,f'after-{label}.png',pos,(0,0,z),460/1177)
 write(out/'fit-landmarks.json',{'selected_seed':seed,'isotropic_scale':scale,'image_translation_px':shift.tolist(),
  'aligned_points':aligned,'after_points':after,'attachments':attachments,'geometry':geometry})
 # Body copy is trimmed only on this working copy, below the existing chin.
 body=body_copy();bp=coords(body)
 bm=bmesh.new();bm.from_mesh(body.data)
 body_scale=json.loads((out/'body-normalization.json').read_text())['isotropic_scale']
 # Use the existing head/neck contour prior, converted to the 1m copy. The lower
 # front condition removes the old chin instead of hiding it inside the neck.
 old_head=[v for v in bm.verts if v.co.z>.620*body_scale or
  (v.co.z>.611*body_scale and v.co.y<-.078*body_scale and abs(v.co.x)<.067*body_scale)]
 bmesh.ops.delete(bm,geom=old_head,context='VERTS')
 bm.to_mesh(body.data);bm.free();body.data.update()
 views(out,cam,render,obj,'body-with-head',True)
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'fidelity.blend'))


def opening_centers(points):
 points=points.copy()
 for side in ['L','R']:
  points[f'eye_{side}_center']=np.mean([points[f'eye_{side}_{edge}'] for edge in ['left','right','top','bottom']],axis=0).tolist()
 return points

def similarity(annotation,target):
 target=opening_centers(target);annotation=opening_centers(annotation)
 # A single scale fits both head height and temple width; depth is isotropic.
 a=np.array([np.array(annotation['chin'])-annotation['crown'],np.array(annotation['temple_R'])-annotation['temple_L']])
 b=np.array([np.array(target['chin'])-target['crown'],np.array(target['temple_R'])-target['temple_L']])
 scale=float((a*b).sum()/(a*a).sum())
 keys=['chin','ear_L','ear_R','eye_L_center','eye_R_center']
 shift=(np.array([target[k] for k in keys])-scale*np.array([annotation[k] for k in keys])).mean(0)
 return scale,shift

def apply_similarity(p,scale,shift):
 p=p.copy();p[:,0]=scale*p[:,0]+(scale*627+shift[0]-627)/1177
 p[:,1]*=scale;p[:,2]=scale*p[:,2]+(1213*(1-scale)-shift[1])/1177
 return p

def rank_seeds(out,studio,render,seed_list):
 source=ROOT/'scripts/toy-character/fidelity_annotations.json'
 annotations=json.loads(source.read_text())
 annotations={str(s):annotations[str(s)] for s in seed_list}
 write(out/'seed-landmarks.json',annotations)
 target=opening_centers(json.loads((out/'design-landmarks.json').read_text())['points'])
 transforms=json.loads((out/'seed-transforms.json').read_text());records={};cam=setup(studio)
 for seed in seed_list:
  tr=transforms[str(seed)];ann=annotations[str(seed)]
  if any(ann['defects'].values()):
   records[str(seed)]=ann
   continue
  from fidelity_repair import load_repaired
  obj,cap=load_repaired(out);obj.name=f'ranked_seed_{seed}'
  p=coords(obj)
  scale,shift=similarity(ann['points'],target);setcoords(obj,apply_similarity(p,scale,shift))
  setcoords(cap,apply_similarity(coords(cap),scale,shift))
  views(out,cam,render,obj,f'ranked-seed-{seed}');unlit(out,cam,render,obj,f'ranked-seed-{seed}')
  records[str(seed)]={**ann,'points':{k:(np.array(v)*scale+shift).tolist() for k,v in ann['points'].items()},
    'isotropic_scale':scale,'translation_px':shift.tolist()}
  obj.hide_render=True;obj.hide_set(True);cap.hide_render=True;cap.hide_set(True)
 write(out/'rank-landmarks.json',records)
