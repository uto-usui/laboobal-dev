"""Fifth body pass: exterior flood fill, uniform remeshing and semantic weights."""
import os,json,time,math,hashlib,subprocess
from pathlib import Path
from collections import Counter,defaultdict
import bpy,bmesh,numpy as np
from mathutils import Vector
from lowpoly import WORK,append,coords,triangles,write,activate,recalc,mesh_obj,bvh
from lowpoly2 import clone,reset_pose,set_pose,POSES,weight_audit
from lowpoly2_measure import attr
from lowpoly_verify import topology,visible
import lowpoly3 as p3
import lowpoly4 as p4
OUT=None
PYTHON=WORK/'venv-geo/bin/python'


def log(s):
    print('LOWPOLY5',s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')


def checkpoint(name):
    reset_pose(bpy.data.objects['temporary_rig']);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')));log('保存 '+name)


def external(*args):
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('solidify.py')),str(OUT),*(() if '--remesh' in args else ('--legacy',)),*args],check=True)


def load_npz(name,path):
    d=np.load(path);return mesh_obj(name,d['V'].tolist(),d['F'].tolist())


def prepare():
    source=WORK/'lowpoly4/character-lowpoly4.blend'
    append(source,['reference_labeled_body','high3_body_original','high3_head_original','high3_cap_original','low4_head','temporary_rig'])
    head=bpy.data.objects['low4_head'];head.name='low5_head';head.animation_data_clear()
    rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    original=bpy.data.objects['reference_labeled_body'];np.savez(OUT/'source.npz',V=coords(original),F=triangles(original),labels=attr(original,'part_id'))
    write(OUT/'joints.json',json.loads((WORK/'lowpoly4/joints.json').read_text()))
    write(OUT/'construction.json',{'source':'lowpoly4/character-lowpoly4.blend','input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'head_geometry_sha256':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest(),'head_matrix':np.asarray(head.matrix_world).tolist(),'source_topology':topology(original),'source_includes_old_head':True})
    checkpoint('source-checkpoint')


def sections(body):
    data=mesh_sections(body,bpy.data.objects['temporary_rig'])
    # Classify nested closed contours by even/odd containment; an outer loop
    # bounds a filled region, and a directly nested loop bounds a hole.
    def inside(q,poly):
        a=poly;b=np.roll(a,-1,axis=0)
        hit=((a[:,1]>q[1])!=(b[:,1]>q[1]))&(q[0]<(b[:,0]-a[:,0])*(q[1]-a[:,1])/(b[:,1]-a[:,1]+1e-30)+a[:,0])
        return bool(hit.sum()%2)
    for name,r in data.items():
        loops=[np.array(l['points_mm']) for l in r['contours'] if l['closed']]
        depth=[sum(inside(q[0],other) for k,other in enumerate(loops) if k!=i) for i,q in enumerate(loops)]
        r['filled_regions']=sum(d%2==0 for d in depth);r['holes']=sum(d%2==1 for d in depth)
        r['pass']=r['filled_regions']==1 and r['holes']==0 and r['open_chains']==0
    return data


def solid():
    report=json.loads((OUT/'construction.json').read_text());rig=bpy.data.objects['temporary_rig'];original=bpy.data.objects['reference_labeled_body']
    trials=[]
    for r in range(6,10):
        external('--r',str(r));body=load_npz('filled5_with_old_head',OUT/'filled.npz');recalc(body,True)
        p3.transfer_labels(body,original,'part_id');sec=sections(body)
        # Record every r, including failed section checks, before moving on.
        trial={'r':r,'sections':sec,'topology':topology(body)};trials.append(trial);write(OUT/'fill-trials.json',trials)
        log('充填断面 '+json.dumps({k:(v['filled_regions'],v['holes'],v['open_chains']) for k,v in sec.items()}))
        if all(v['pass'] for v in sec.values()) or r==9:break
        bpy.data.objects.remove(body,do_unlink=True)
    report['solidification']=json.loads((OUT/'solidification.json').read_text());report['after_fill']=topology(body);report['fill_trials']=trials
    # Distances before removing the old head use only the body labels.
    from lowpoly3_measure import regional,measure_direction,tree
    high=bpy.data.objects['high3_body_original'];head=bpy.data.objects['low5_head'];highhead=bpy.data.objects['high3_head_original'];cap=bpy.data.objects['high3_cap_original']
    lo=regional([body,head],'fill_measure_low_');hi=regional([high,highhead],'fill_measure_high_');rng=np.random.default_rng(642)
    originaltree=tree([original]);filledtree=tree([body]);dist={}
    for part in p3.PARTS.values():
        if part=='neck':continue
        dist[part]={}
        for direction,s,t,forward in [('high_to_low',hi[part],lo[part],True),('low_to_high',lo[part],hi[part],False)]:
            dist[part][direction]=measure_direction(s,t,part,rng,originaltree,filledtree,forward,n=150000)
        log('充填距離 '+part+' '+json.dumps({d:dist[part][d]['p95_mm'] for d in dist[part]}))
    for o in list(lo.values())+list(hi.values()):bpy.data.objects.remove(o,do_unlink=True)
    write(OUT/'filled-distances.json',dist);report['filled_distances']=dist
    write(OUT/'construction.json',report);write(OUT/'sections.json',{'before':sections(high),'after':sec})
    checkpoint('filled-checkpoint')
    cut_neck(body,report)
    checkpoint('closed-checkpoint')


def cut_neck(body,report):
    high=bpy.data.objects['high3_body_original'];p=coords(high);f=triangles(high);labels=attr(high,'part_id');centers=p[f].mean(1)
    collar=(labels==3)&(centers[:,2]>.642)&(abs(centers[:,0])<.089);top=float(p[np.unique(f[collar]),2].max());cut=top-.002
    head=bpy.data.objects['low5_head'];bottom=float(coords(head)[:,2].min())
    bm=bmesh.new();bm.from_mesh(body.data);layer=bm.faces.layers.int['part_id'];cap=bm.faces.layers.int.new('neck_cap')
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,cut),plane_no=(0,0,1),dist=1e-7)
    # The requested plane clips the complete filled body; a label boundary
    # must not leave a nonplanar rim on the fused collar and neck.
    remove=[face for face in bm.faces if face.calc_center_median().z>cut+1e-7]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    rim=[e for e in bm.edges if e.is_boundary];nonplanar=max((abs(v.co.z-cut)*1000 for e in rim for v in e.verts),default=0)
    filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces']
    for face in filled:face[layer]=2;face[cap]=1
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();body.data.update();body.name='solid5_body'
    report['neck']={'collar_top_m':top,'body_cut_m':cut,'head_bottom_m':bottom,'overlap_m':cut-bottom,'cut_rim_nonplanarity_mm':nonplanar,'planar_cut_pass':nonplanar<.01,'head_transform_changed':False,'collar_selection':'source torso z>.642 and abs(x)<.089; same as lowpoly4','removed_faces':len(remove),'cap_faces':len(filled)}
    report['after_neck_cut']=topology(body);write(OUT/'construction.json',report);log('首 '+json.dumps(report['neck']))


def remesh():
    source=bpy.data.objects['solid5_body'];body=clone(source,'low5_body');before=topology(body);activate(body);start=time.monotonic()
    status=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,mode='FACES',target_faces=17500,seed=0)
    sides=Counter(len(f.vertices) for f in body.data.polygons);valid='FINISHED' in status and set(sides)=={4}
    method={'quadriflow_status':list(status),'seconds':time.monotonic()-start,'polygon_sides':dict(sides),'input':before,'method':'QuadriFlow','target_triangles':30000,'requested_quad_faces':17500,'reason':'QuadriFlow completed with quadrilaterals on the closed filled surface'}
    if not valid:
        method['method']='pymeshlab isotropic explicit remeshing';method['reason']='QuadriFlow did not return a quadrilateral surface'
        np.savez(OUT/'remesh-input.npz',V=coords(source),F=triangles(source));external('--remesh')
        bpy.data.objects.remove(body,do_unlink=True);body=load_npz('low5_body',OUT/'isotropic.npz');method['isotropic']=json.loads((OUT/'isotropic.json').read_text())
    recalc(body,True)
    method['before_rim_closure']=topology(body)
    bm=bmesh.new();bm.from_mesh(body.data);rim=[e for e in bm.edges if e.is_boundary]
    filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'] if rim else []
    method['quadriflow_rim_closure']={'boundary_edges':len(rim),'caps':len(filled),'new_vertex_positions':0,'operator':'bmesh holes_fill on existing rims'}
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();body.data.update();recalc(body,True);activate(body)
    mod=body.modifiers.new('Nearest point on filled body','SHRINKWRAP');mod.target=source;mod.wrap_method='NEAREST_SURFACEPOINT';mod.wrap_mode='ON_SURFACE';mod.offset=0
    bpy.ops.object.modifier_apply(modifier=mod.name);recalc(body,True)
    p3.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
    # Tag the planar closure separately for distance and neck diagnostics.
    cut=json.loads((OUT/'construction.json').read_text())['neck']['body_cut_m'];p=coords(body);f=triangles(body)
    p3.face_attr(body,'neck_cap',np.all(abs(p[f][:,:,2]-cut)<1e-6,axis=1).astype(int))
    method['after']=topology(body);write(OUT/'remeshing.json',method);log('均一化 '+json.dumps(method));checkpoint('uniform-checkpoint')


def run(out,studio,render):
    global OUT;OUT=out;p3.OUT=out;p4.OUT=out
    phase=os.environ.get('LOWPOLY5_PHASE','all');log('開始 '+phase)
    if phase in ['all','prepare']:prepare()
    if phase=='solid':bpy.ops.wm.open_mainfile(filepath=str(out/'source-checkpoint.blend'))
    if phase in ['all','solid']:solid()
    if phase=='cut':
        bpy.ops.wm.open_mainfile(filepath=str(out/'filled-checkpoint.blend'))
        cut_neck(bpy.data.objects['filled5_with_old_head'],json.loads((out/'construction.json').read_text()))
        checkpoint('closed-checkpoint')
    if phase=='remesh':bpy.ops.wm.open_mainfile(filepath=str(out/'closed-checkpoint.blend'))
    if phase in ['all','remesh']:remesh()
    if phase=='finish':bpy.ops.wm.open_mainfile(filepath=str(out/'uniform-checkpoint.blend'))
    if phase in ['all','finish']:
        finish(studio,render)
        supplement()
    if phase=='supplement':
        bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly5.blend'))
        supplement()
    if phase=='verify':verify()


BASE_BONE_MASK=p4.bone_mask

def bone_mask(body,rig,j,labels):
    names,allowed,collar=BASE_BONE_MASK(body,rig,j,labels);p=coords(body)
    for k,name in enumerate(names):
        if name.startswith(('shoulder.','upper_arm.','forearm.','hand.')):
            allowed[:,k]=np.isin(labels,[4,6] if name[-1]=='L' else [5,7])
        elif name.startswith(('thigh.','shin.','foot.')):
            allowed[:,k]=(labels==10)&(p[:,0]*(1 if name[-1]=='L' else -1)>=0)
    return names,allowed,collar


def local_deformation(body,rig,side):
    q=coords(body);p=__import__('lowpoly2').evaluated(body);f=triangles(body);edges=np.array([e.vertices[:] for e in body.data.edges]);labels=p4.vertex_labels(body)
    selected=(labels==(4 if side=='L' else 5))|((labels==3)&(np.linalg.norm(q-np.array(rig.data.bones['upper_arm.'+side].head_local),axis=1)<.06))
    faces=np.any(selected[f],1);ee=np.any(selected[edges],1)
    n0=np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]]);n1=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names)
    rot=np.array([np.asarray(rig.pose.bones[name].matrix.to_3x3()@rig.data.bones[name].matrix_local.to_3x3().inverted()) for name in names])
    transport=np.einsum('nk,kij->nij',w,rot);expected=np.einsum('nij,nj->ni',transport[f].mean(1),n0)
    flipped=np.einsum('ij,ij->i',expected,n1)<0;ratio=np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1)/np.maximum(np.linalg.norm(q[edges[:,1]]-q[edges[:,0]],axis=1),1e-12)
    regions={name:{'vertices':int(mask.sum()),'max_displacement_mm':float(np.linalg.norm(p[mask]-q[mask],axis=1).max(initial=0)*1000)} for name,mask in [('sleeve_shoulder',selected),('legs',labels==10),('lower_torso',(labels==3)&(q[:,2]<.44))]}
    r={'flipped_faces':int((flipped&faces).sum()),'tested_faces':int(faces.sum()),'edges_over_2x':int(((ratio>2)&ee).sum()),'tested_edges':int(ee.sum()),'edges_over_2x_fraction':float(((ratio>2)&ee).sum()/ee.sum()),'max_stretch':float(ratio[ee].max()),'regional_motion':regions}
    r['numeric_pass']=r['flipped_faces']<=20 and r['edges_over_2x_fraction']<=.01 and r['max_stretch']<=3
    return r


def uniformity(body):
    p=coords(body);f=triangles(body);labels=attr(body,'part_id');result={}
    for pid,name in p3.PARTS.items():
        faces=f[labels==pid];edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
        lengths=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)*1000
        result[name]={'triangles':len(faces),'edges':len(edges),'edge_median_mm':float(np.median(lengths)),'edge_p5_mm':float(np.percentile(lengths,5)),'edge_p95_mm':float(np.percentile(lengths,95)),'edge_p95_over_p5':float(np.percentile(lengths,95)/np.percentile(lengths,5))}
    return result


def elbows(body,head,rig,cam,render):
    from geometry import material
    clay=material('lowpoly5 white',(.7,.7,.7),.82);wiremat=material('lowpoly5 wire',(.008,.012,.018),.8)
    for o in [body,head]:
        o.data.materials.clear();o.data.materials.append(clay)
        for face in o.data.polygons:face.material_index=0
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=900;scene.render.film_transparent=True
    for side in ['L','R']:
        set_pose(rig,'arm_'+side+'_70_elbow90');target=rig.pose.bones['forearm.'+side].head.copy()
        wire=clone(body,'elbow_wire');wire.data.materials.clear();wire.data.materials.append(wiremat)
        for face in wire.data.polygons:face.material_index=0
        mod=wire.modifiers.new('Exact triangle overlay','WIREFRAME');mod.thickness=.00015;mod.offset=0;mod.use_even_offset=False
        for angle in [25,205]:
            a=math.radians(angle)
            for kind,objects in [('white',[body,head]),('wire',[body,head,wire])]:
                visible(objects);render(OUT,cam,f'elbow-{side}-{kind}-{angle}.png',target+Vector((2*math.sin(a),-2*math.cos(a),0)),target,.19)
        bpy.data.objects.remove(wire,do_unlink=True)
    reset_pose(rig)


def finish(studio,render):
    from lowpoly3_measure import measure_all,deformation
    from lowpoly3_render import render_all
    p4.bone_mask=bone_mask
    rig=bpy.data.objects['temporary_rig'];body=bpy.data.objects['low5_body'];head=bpy.data.objects['low5_head'];reset_pose(rig)
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};construction=json.loads((OUT/'construction.json').read_text())
    weights=p4.auto_weights(body,rig,j);labels=p4.vertex_labels(body)
    # Nondeform groups identify the replacement boundary, inside the cuff.
    for name in ['hand_L','hand_R']:
        if not body.vertex_groups.get(name):body.vertex_groups.new(name=name)
    hand=p3.set_hand_boundaries(body,j)
    p3.rigid(head,'head');p3.attach_armature(head,rig)
    rest={o.name:coords(o) for o in [body,head]};initial={};centers=[]
    for pose in POSES:
        set_pose(rig,pose);initial[pose]=deformation([body,head],rest)
        r=initial[pose][body.name]
        if r['flipped_faces_against_transported_rest_normal'] or r['edges_over_2x_rest_length']:
            if pose.startswith('arm_'):
                side='L' if pose.startswith('arm_L') else 'R';centers.extend([(j['shoulder_'+side],.075),(j['elbow_'+side],.065),(j['wrist_'+side],.035)])
            elif pose.startswith('spine_'):centers.extend([(j['spine_mid'],.05),(j['spine_upper'],.05)])
            elif pose.startswith('neck_'):centers.extend([(j['neck_base'],.035),(j['head_pivot'],.035)])
        log('初期ポーズ '+pose+' '+json.dumps(r))
    reset_pose(rig);write(OUT/'poses-initial.json',initial)
    refinement=p4.smooth_problem(body,rig,j,labels,centers) if centers else None
    weights['joint_refinement']=refinement;weights['final']=p4.constrain(body,rig,j,labels);weights['hand_boundaries']=hand
    poses={};local={}
    for pose in POSES:
        set_pose(rig,pose);poses[pose]=deformation([body,head],rest)
        if pose.startswith('arm_'):local[pose]=local_deformation(body,rig,'L' if pose.startswith('arm_L') else 'R')
        log('最終ポーズ '+pose+' '+json.dumps(poses[pose][body.name]))
    reset_pose(rig);write(OUT/'weights.json',weights);write(OUT/'poses-metrics.json',poses);write(OUT/'elbow-metrics.json',local)
    checkpoint('geometry-checkpoint')
    highs=[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original']];cap=bpy.data.objects['high3_cap_original']
    metrics=measure_all(OUT,[body,head],highs,cap,construction['neck']['body_cut_m'])
    sec=json.loads((OUT/'sections.json').read_text());sec['reduced']=sections(body);write(OUT/'sections.json',sec)
    counts={part:int((attr(body,'part_id')==pid).sum()) for pid,part in p3.PARTS.items()}
    counts.update({part:int((attr(head,'part2')==pid).sum()) for pid,part in [(0,'face_head'),(1,'hair')]});counts['total']=sum(counts.values())
    for part,values in metrics['distances_full_source'].items():
        for direction in ['high_to_low','low_to_high']:
            values[direction]['p95_limit_mm']=1.5;values[direction]['p95_pass']=values[direction]['p95_mm']<=1.5
    construction['neck']['after_uniform']=p3.neck_after_reduction(body,head,construction['neck']['body_cut_m'])
    write(OUT/'construction.json',construction)
    method=json.loads((OUT/'remeshing.json').read_text());top=topology(body)
    metrics.update({'stage':'lowpoly5','construction':construction,'grid_and_r':construction['solidification'],'filled_distances':construction['filled_distances'],'sections':sec,'remeshing':method,'uniformity':uniformity(body),'triangles':counts,'weights':weights,'poses':poses,'elbows':local,'topology':{'filled':construction['after_fill'],'after_neck':construction['after_neck_cut'],'uniform':top,'head':topology(head)},'head_geometry_unchanged':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()==construction['head_geometry_sha256'],
        'triangle_budget':{'target_body':30000,'body_triangles':len(triangles(body)),'total':counts['total'],'reserved_later':5000,'current_plus_reserved':counts['total']+5000,'limit':60000,'pass':counts['total']+5000<=60000},
        'acceptance':{'sections':all(v['pass'] for key in ['after','reduced'] for v in sec[key].values()),'body_topology':top['boundary_edges']==0 and top['edges_shared_by_3_or_more_faces']==0 and top['connected_components']==1,'weights':not any(weights['final']['forbidden_over_005'].values()) and weights['final']['audit']['max_influences']<=4 and weights['final']['audit']['unweighted_vertices']==0,
        'filled_distance_p95_2mm':all(v[d]['p95_mm']<=2 for k,v in construction['filled_distances'].items() for d in ['high_to_low','low_to_high']),
        'distance_p95':all(v[d]['p95_mm']<=1.5 for k,v in metrics['distances_full_source'].items() if k not in ['face_head','hair','hand_L','hand_R'] for d in ['high_to_low','low_to_high']),
        'elbow':all(v['numeric_pass'] for v in local.values()),'neck_planar_cut':construction['neck']['planar_cut_pass'],'silhouette':None,'visual':None}})
    write(OUT/'metrics.json',metrics)
    cam=studio();render_all(OUT,[body,head],highs+[cap],rig,j,cam,render,head);elbows(body,head,rig,cam,render)
    for action in bpy.data.actions:
        if action.name.startswith('lowpoly3_'):action.name=action.name.replace('lowpoly3_','lowpoly5_',1)
    reset_pose(rig);visible([body,head])
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_set(obj not in [body,head])
    checkpoint('character-lowpoly5')
    verify()
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly5_review.py')),str(OUT)],check=True)


def verify():
    path=OUT/'character-lowpoly5.blend';bpy.ops.wm.open_mainfile(filepath=str(path));body=bpy.data.objects['low5_body'];head=bpy.data.objects['low5_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    metrics=json.loads((OUT/'metrics.json').read_text());construction=metrics['construction'];names=[b.name for b in rig.data.bones];labels=p4.vertex_labels(body);j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};_,allowed,_=bone_mask(body,rig,j,labels);w=p4.read_weights(body,names)
    report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'head_geometry_unchanged':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()==construction['head_geometry_sha256'],'source_blend_unchanged':hashlib.sha256((WORK/'lowpoly4/character-lowpoly4.blend').read_bytes()).hexdigest()==construction['input_sha256'],'head_transform_unchanged':bool(np.allclose(np.asarray(head.matrix_world),construction['head_matrix'],rtol=0,atol=1e-9)),'weights':{o.name:weight_audit(o,set(names)) for o in [body,head]},'forbidden_over_005':int(((w>.05)&~allowed).sum()),'maximum_weight_sum_error_including_tiny_weights':float(abs(w.sum(1)-1).max()),'bone_count':len(names),'topology':topology(body),'arm_motion':{}}
    for side in ['L','R']:
        set_pose(rig,'arm_'+side+'_70_elbow90');report['arm_motion'][side]=local_deformation(body,rig,side)
    reset_pose(rig)
    from lowpoly3_measure import deformation
    rest={o.name:coords(o) for o in [body,head]};saved={}
    for pose in POSES:
        set_pose(rig,pose);saved[pose]=deformation([body,head],rest)
    reset_pose(rig)
    report['saved_pose_metrics_match']=saved==metrics['poses']
    report['pose_actions']=[a.name for a in bpy.data.actions if a.name.startswith('lowpoly5_')]
    source_skeleton=json.loads((WORK/'lowpoly3/skeleton.json').read_text())['bones']
    report['same_temporary_bones_as_lowpoly4']=all(np.allclose(b.head_local,source_skeleton[b.name]['head'],rtol=0,atol=1e-8) and np.allclose(b.tail_local,source_skeleton[b.name]['tail'],rtol=0,atol=1e-8) for b in rig.data.bones)
    write(OUT/'saved-verification.json',report);metrics['saved_verification']=report;write(OUT/'metrics.json',metrics);log('保存検査 '+json.dumps(report))


def mesh_sections(o,rig):
    p=coords(o);f=triangles(o);v=p[f];results={};face_labels=attr(o,'part_id')
    definitions=[]
    for side in ['L','R']:
        for region,bone,radius in [('upper_arm','upper_arm.',.09),('forearm','forearm.',.085),('thigh','thigh.',.115),('shin','shin.',.10)]:
            b=rig.data.bones[bone+side];a=np.array(b.head_local);z=np.array(b.tail_local)
            definitions.append((region+'.'+side,(a+z)/2,(z-a)/np.linalg.norm(z-a),radius))
    for region,bone,radius in [('torso','spine.upper',.18),('neck','neck',.10)]:
        b=rig.data.bones[bone];a=np.array(b.head_local);z=np.array(b.tail_local)
        definitions.append((region,(a+z)/2,(z-a)/np.linalg.norm(z-a),radius))
    for name,c,n,radius in definitions:
        signed=(v-c)@n;mask=(signed.min(1)<0)&(signed.max(1)>0)
        ff=f[mask];vv=v[mask];dd=signed[mask];segments=[];points={};point_parts={};graph=defaultdict(set)
        for face,xyz,d,pid in zip(ff,vv,dd,face_labels[mask]):
            ids=[]
            for a,b in [(0,1),(1,2),(2,0)]:
                if d[a]*d[b]<0:
                    key=tuple(sorted((int(face[a]),int(face[b]))))
                    points[key]=xyz[a]+(xyz[b]-xyz[a])*d[a]/(d[a]-d[b]);point_parts[key]=int(pid);ids.append(key)
            if len(ids)==2:graph[ids[0]].add(ids[1]);graph[ids[1]].add(ids[0])
        seen=set();loops=[]
        axis=np.eye(3)[np.argmin(abs(n))];u=np.cross(n,axis);u/=np.linalg.norm(u);w=np.cross(n,u)
        for node in graph:
            if node in seen:continue
            stack=[node];seen.add(node);component=[]
            while stack:
                k=stack.pop();component.append(k)
                for nei in graph[k]:
                    if nei not in seen:seen.add(nei);stack.append(nei)
            q=np.array([points[k] for k in component]);center=q.mean(0)
            # Only exclude remote anatomy cut by the same infinite plane. Every
            # nested contour within this anatomical neighborhood is retained.
            if np.linalg.norm(q-c,axis=1).min()>radius:continue
            closed=all(len(graph[k])==2 for k in component)
            order=[];cur=component[0];last=None
            for _ in range(len(component)+1):
                order.append(cur);neis=graph[cur]-({last} if last is not None else set())
                if not neis:break
                nxt=next(iter(neis));last,cur=cur,nxt
                if cur==order[0]:break
            q=np.array([points[k] for k in order]);xy=np.stack(((q-c)@u,(q-c)@w),1)*1000
            perimeter=sum(np.linalg.norm(points[k]-points[nei]) for k in component for nei in graph[k])/2*1000
            counts=Counter(point_parts[k] for k in component)
            loops.append({'closed':closed,'segments':len(component),'perimeter_mm':float(perimeter),'center_m':center.tolist(),'points_mm':xy.tolist(),'majority_part':counts.most_common(1)[0][0],'part_counts':dict(counts)})
        expected=([3,4] if name=='upper_arm.L' else [3,5] if name=='upper_arm.R' else [4] if name=='forearm.L' else [5] if name=='forearm.R' else [10] if name.startswith(('thigh','shin')) else [3] if name=='torso' else [2])
        relevant=[l for l in loops if any(pid in expected for pid in l['part_counts'])]
        results[name]={'plane_center_m':c.tolist(),'plane_normal':n.tolist(),'anatomical_radius_m':radius,'loops':len([l for l in relevant if l['closed']]),'open_chains':len([l for l in relevant if not l['closed']]),'contours':relevant,'remote_contours_excluded':len(loops)-len(relevant),'all_contours_in_radius':loops,'pass':len(relevant)==1 and relevant[0]['closed']}
    return results


def supplement():
    """Keep the separate neck label alongside the historical torso+neck metric."""
    from lowpoly import subset
    from lowpoly_verify import area_samples
    from lowpoly2_measure import nearest_values
    metrics=json.loads((OUT/'metrics.json').read_text());high=bpy.data.objects['high3_body_original'];low=bpy.data.objects['low5_body']
    filled=append(OUT/'filled-checkpoint.blend',['filled5_with_old_head'])[0]
    h=subset(high,attr(high,'part_id')==2,'neck_source_measure');rng=np.random.default_rng(642)
    for key,obj in [('filled',filled),('uniform',low)]:
        l=subset(obj,attr(obj,'part_id')==2,'neck_target_measure');result={}
        for direction,a,b in [('high_to_low',h,l),('low_to_high',l,h)]:
            p=coords(a);f=triangles(a);points=np.concatenate([area_samples(p,f,150000,rng),p[np.unique(f)]])
            distances,_=nearest_values(points,bvh(b));mm=distances*1000
            result[direction]={'p95_mm':float(np.percentile(mm,95)),'max_mm':float(mm.max()),'samples':len(points),'area_samples':150000,'vertices_included':len(np.unique(f)),'p95_limit_mm':2 if key=='filled' else 1.5,'p95_pass':bool(np.percentile(mm,95)<=(2 if key=='filled' else 1.5))}
        metrics['filled_distances' if key=='filled' else 'distances_full_source']['neck']=result
        if key=='filled':metrics['construction']['filled_distances']['neck']=result
        bpy.data.objects.remove(l,do_unlink=True)
    for o in [h,filled]:bpy.data.objects.remove(o,do_unlink=True)
    metrics['acceptance']['filled_distance_p95_2mm']=all(v[d]['p95_mm']<=2 for v in metrics['filled_distances'].values() for d in ['high_to_low','low_to_high'])
    metrics['acceptance']['distance_p95']=all(v[d]['p95_mm']<=1.5 for k,v in metrics['distances_full_source'].items() if k not in ['face_head','hair','hand_L','hand_R'] for d in ['high_to_low','low_to_high'])
    original_uniform=append(OUT/'uniform-checkpoint.blend',['low5_body'])[0]
    delta=np.linalg.norm(coords(original_uniform)-coords(low),axis=1)*1000
    metrics['saved_verification']['max_surface_position_change_during_weights_mm']=float(delta.max())
    bpy.data.objects.remove(original_uniform,do_unlink=True)
    rig=bpy.data.objects['temporary_rig'];names=[b.name for b in rig.data.bones];w=p4.read_weights(low,names);labels=p4.vertex_labels(low)
    hw=p4.read_weights(bpy.data.objects['low5_head'],names);hp=p3.semantic_vertices(bpy.data.objects['low5_head'],'part2')
    for k,name in enumerate(names):
        metrics['weights']['final']['over_005_by_bone_and_part'][name].update({part:int(((hw[:,k]>.05)&(hp==pid)).sum()) for pid,part in [(0,'face_head'),(1,'hair')]})
    metrics['saved_verification']['max_positive_influences_including_tiny_weights']=int((w>0).sum(1).max())
    backpack=w[labels==8];chest=names.index('spine.chest')
    metrics['saved_verification']['backpack_vertices']=len(backpack)
    metrics['saved_verification']['backpack_chest_1_pass']=bool(np.all(abs(backpack[:,chest]-1)<1e-8) and np.all(np.delete(backpack,chest,axis=1)==0))
    metrics['arm_motion']={side:values['regional_motion'] for side,values in metrics['saved_verification']['arm_motion'].items()}
    write(OUT/'saved-verification.json',metrics['saved_verification'])
    write(OUT/'construction.json',metrics['construction'])
    write(OUT/'filled-distances.json',metrics['filled_distances']);write(OUT/'metrics.json',metrics);log('首を分けた距離測定 '+json.dumps({k:metrics[k]['neck'] for k in ['filled_distances','distances_full_source']}))
