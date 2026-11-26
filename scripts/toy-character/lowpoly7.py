"""Seventh body pass: straight visibility, semantic slit, uniform remeshing and pose audit."""
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
    print('LOWPOLY7',s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')


def checkpoint(name):
    reset_pose(bpy.data.objects['temporary_rig']);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')));log('保存 '+name)


def external(*args):
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('solidify.py')),str(OUT),*args],check=True)


def load_npz(name,path):
    d=np.load(path);return mesh_obj(name,d['V'].tolist(),d['F'].tolist())


def prepare(studio,render):
    source=WORK/'lowpoly4/character-lowpoly4.blend'
    append(source,['reference_labeled_body','high3_body_original','high3_head_original','high3_cap_original','temporary_rig'])
    rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    original=bpy.data.objects['reference_labeled_body'];np.savez(OUT/'source.npz',V=coords(original),F=triangles(original),labels=attr(original,'part_id'))
    high=bpy.data.objects['high3_head_original'];head=clone(high,'low6_head');head.animation_data_clear()
    write(OUT/'joints.json',json.loads((WORK/'lowpoly4/joints.json').read_text()))
    write(OUT/'construction.json',{'source':'lowpoly4/character-lowpoly4.blend','input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'head_matrix':np.asarray(high.matrix_world).tolist(),'source_topology':topology(original),'source_includes_old_head':True,'head_original_bottom_m':float(coords(high)[:,2].min())})
    checkpoint('source-checkpoint')
    existing=set(bpy.context.scene.objects);cam=studio();visible([bpy.data.objects['high3_body_original']]);bpy.context.scene.render.resolution_x=bpy.context.scene.render.resolution_y=1000
    render(OUT,cam,'collar-source-color.png',(0,-2,.685),(0,0,.685),.18)
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly6_landmark.py')),str(OUT)],check=True)
    for obj in set(bpy.context.scene.objects)-existing:bpy.data.objects.remove(obj,do_unlink=True)


def sections(body):
    data=mesh_sections(body,bpy.data.objects['temporary_rig'])
    def inside(q,poly):
        a=np.asarray(poly);b=np.roll(a,-1,axis=0)
        return bool(((((a[:,1]>q[1])!=(b[:,1]>q[1]))&(q[0]<(b[:,0]-a[:,0])*(q[1]-a[:,1])/(b[:,1]-a[:,1]+1e-30)+a[:,0])).sum()%2))
    def area(loop):
        q=np.array(loop['points_mm']);return abs(np.sum(q[:,0]*np.roll(q[:,1],-1)-q[:,1]*np.roll(q[:,0],-1)))/2
    for name,r in data.items():
        loops=r['all_contours_in_radius'];pid=4 if name.endswith('.L') and name.startswith(('upper_arm','forearm')) else 5 if name.startswith(('upper_arm','forearm')) else 10 if name.startswith(('thigh','shin')) else 3 if name=='torso' else 2
        candidates=[l for l in loops if l['closed'] and l['part_counts'].get(pid,0)>0]
        center=[l for l in candidates if inside([0,0],l['points_mm'])]
        if center:outer=max(center,key=area)
        elif candidates:outer=min(candidates,key=lambda l:np.linalg.norm(np.array(l['points_mm']),axis=1).min())
        else:outer=None
        # Select the anatomical outer contour and retain ALL nested contours,
        # including ones with different labels. Remote limb/accessory loops stay recorded.
        chosen=[l for l in loops if outer is not None and (l is outer or inside(l['points_mm'][0],outer['points_mm']))]
        closed=[l for l in chosen if l['closed']];depth=[sum(inside(q['points_mm'][0],o['points_mm']) for o in closed if o is not q) for q in closed]
        r.update({'contours':chosen,'filled_regions':sum(d%2==0 for d in depth),'holes':sum(d%2==1 for d in depth),'open_chains':sum(not l['closed'] for l in chosen),'anatomical_selection':'outer contour containing bone midpoint, else nearest contour with expected part; all nested contours retained','remote_contours_excluded':len(loops)-len(chosen)})
        r['pass']=r['filled_regions']==1 and r['holes']==0 and r['open_chains']==0
    return data


def solid():
    original=bpy.data.objects['reference_labeled_body']
    external()
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly6_probe_replay.py')),str(OUT)],check=True)
    filled=load_npz('filled6_with_old_head',OUT/'filled.npz');recalc(filled,True)
    p3.transfer_labels(filled,original,'part_id')
    report=json.loads((OUT/'construction.json').read_text())
    report['solidification']=json.loads((OUT/'solidification.json').read_text());report['after_fill']=topology(filled)
    report['filled_distances']=report['solidification']['probe_vertex_distances']
    write(OUT/'construction.json',report);write(OUT/'sections.json',{'before':sections(bpy.data.objects['high3_body_original']),'after':sections(filled)})
    checkpoint('filled-checkpoint')
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly7_volume.py')),str(OUT)],check=True)
    body=load_npz('body7_without_old_head',OUT/'body-without-old-head.npz');recalc(body,True)
    p3.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
    cut_neck(body,report);checkpoint('closed-checkpoint')


def cut_neck(body,report):
    from lowpoly7_neck import cut_neck as operation
    operation(body,report,globals())


def remesh():
    source=bpy.data.objects['solid6_body'];body=clone(source,'low6_body');before=topology(body);activate(body);start=time.monotonic()
    status=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,mode='FACES',target_faces=17500,seed=0)
    sides=Counter(len(f.vertices) for f in body.data.polygons);valid='FINISHED' in status and set(sides)=={4}
    method={'quadriflow_status':list(status),'seconds':time.monotonic()-start,'polygon_sides':dict(sides),'input':before,'method':'QuadriFlow','target_triangles':30000,'requested_quad_faces':17500,'reason':'QuadriFlow completed with quadrilaterals; input rim and degenerate counts retained in the input report'}
    if not valid:raise RuntimeError('QuadriFlow did not return a quadrilateral surface')
    recalc(body,True)
    method['before_rim_closure']=topology(body)
    bm=bmesh.new();bm.from_mesh(body.data);rim=[e for e in bm.edges if e.is_boundary]
    filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'] if rim else []
    method['quadriflow_rim_closure']={'boundary_edges':len(rim),'caps':len(filled),'new_vertex_positions':0,'operator':'bmesh holes_fill on existing rims'}
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();body.data.update();recalc(body,True);activate(body)
    mod=body.modifiers.new('Nearest point on filled body','SHRINKWRAP');mod.target=source;mod.wrap_method='NEAREST_SURFACEPOINT';mod.wrap_mode='ON_SURFACE';mod.offset=0
    bpy.ops.object.modifier_apply(modifier=mod.name);recalc(body,True)
    p3.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
    # New collar closure faces above the seam cannot become neck skin again
    # merely because the removed original skin is their nearest source face.
    cut=json.loads((OUT/'construction.json').read_text())['neck']['body_cut_m'];pp=coords(body);ff=triangles(body);fl=attr(body,'part_id');fl[(fl==2)&(pp[ff].mean(1)[:,2]>cut+1e-6)]=3;p3.face_attr(body,'part_id',fl)
    # Tag the planar closure separately for distance and neck diagnostics.
    cut=json.loads((OUT/'construction.json').read_text())['neck']['body_cut_m'];p=coords(body);f=triangles(body)
    p3.face_attr(body,'neck_cap',np.all(abs(p[f][:,:,2]-cut)<1e-6,axis=1).astype(int))
    np.savez(OUT/'uniform-body.npz',V=coords(body),F=triangles(body));method['after']=topology(body);write(OUT/'remeshing.json',method);log('均一化 '+json.dumps(method));checkpoint('uniform-checkpoint')


def rebuild_head(report):
    from lowpoly2 import visible_exterior,split_surface_fans,cut_and_cap
    from lowpoly import clean
    high=bpy.data.objects['high3_head_original'];head=bpy.data.objects['low6_head'];cut=report['neck']['head_cut_m']
    # The original lower bound is retained when the requested cut lies below it.
    cleanup={'exterior_classification':visible_exterior(head)};cleanup['clean']=clean(head,False);cleanup['split_fans']=split_surface_fans(head)
    p3.transfer_labels(head,high,'part2')
    cleanup['cut']=cut_and_cap(head,cut)
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()}
    reduced=p3.reduce_regions(head,high,'reduced6_head','part2',{0:4800,1:3600},j)
    bpy.data.objects.remove(head,do_unlink=True);reduced.name='low6_head'
    cap=clone(bpy.data.objects['high3_cap_original'],'low6_cap');p3.collapse_mask(cap,600,np.ones(len(cap.data.vertices)));p3.face_attr(cap,'part2',np.ones(len(cap.data.polygons),np.int32))
    activate(reduced);cap.select_set(True);bpy.ops.object.join();recalc(reduced,True);cleanup['after_clean']=clean(reduced,False,weld=False)
    cleanup['triangles']=len(triangles(reduced));cleanup['topology']=topology(reduced)
    report['head_cleanup']=cleanup;report['head_geometry_sha256']=hashlib.sha256(coords(reduced).tobytes()+triangles(reduced).tobytes()).hexdigest()
    report['neck']['head_bottom_m']=float(coords(reduced)[:,2].min());report['neck']['overlap_m']=report['neck']['body_cut_m']-report['neck']['head_bottom_m'];report['neck']['overlap_shortfall_m']=.010-report['neck']['overlap_m']
    write(OUT/'head-cleanup.json',cleanup);log('頭の再減面 '+json.dumps(cleanup))


def run(out,studio,render):
    global OUT;OUT=out;p3.OUT=out;p4.OUT=out
    from lowpoly6_measure import POSES as poses,set_pose as pose
    global POSES,set_pose;POSES=poses;set_pose=pose
    import lowpoly3_render as renders
    renders.POSES=poses;renders.set_pose=pose
    import lowpoly7_neck
    lowpoly7_neck.OUT=out
    phase=os.environ.get('LOWPOLY7_PHASE','all');log('開始 '+phase)
    if phase in ['all','prepare']:prepare(studio,render)
    if phase=='solid':bpy.ops.wm.open_mainfile(filepath=str(out/'source-checkpoint.blend'))
    if phase in ['all','solid']:solid()
    if phase=='cut':
        bpy.ops.wm.open_mainfile(filepath=str(out/'filled-checkpoint.blend'))
        body=load_npz('body7_without_old_head',out/'body-without-old-head.npz');recalc(body,True)
        p3.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
        cut_neck(body,json.loads((out/'construction.json').read_text()));checkpoint('closed-checkpoint')
    if phase=='seam':
        bpy.ops.wm.open_mainfile(filepath=str(out/'head-measure-checkpoint.blend'))
        cut_neck(bpy.data.objects['body7_without_old_head'],json.loads((out/'construction.json').read_text()));checkpoint('closed-checkpoint')
    if phase=='remesh':bpy.ops.wm.open_mainfile(filepath=str(out/'closed-checkpoint.blend'))
    if phase in ['all','remesh']:remesh()
    if phase=='finish':bpy.ops.wm.open_mainfile(filepath=str(out/'uniform-checkpoint.blend'))
    if phase in ['all','finish']:finish(studio,render)
    if phase=='verify':verify()



BASE_BONE_MASK=p4.bone_mask

def bone_mask(body,rig,j,labels):
    names,allowed,collar=BASE_BONE_MASK(body,rig,j,labels);p=coords(body)
    for k,name in enumerate(names):
        if name.startswith(('shoulder.','upper_arm.','forearm.','hand.')):
            allowed[:,k]=np.isin(labels,[4,6] if name[-1]=='L' else [5,7])
        elif name.startswith(('thigh.','shin.','foot.')):
            allowed[:,k]=(labels==10)&(p[:,0]*(1 if name[-1]=='L' else -1)>=0)
    # Local restriction width: away from the shoulder joint, a sleeve must
    # follow its arm. Spinal heat weights here caused the remaining stretching.
    for side,pid in [('L',4),('R',5)]:
        away=(labels==pid)&(np.linalg.norm(p-np.asarray(j['shoulder_'+side]),axis=1)>.045)
        for k,name in enumerate(names):
            if name=='root' or name.startswith('spine.'):allowed[away,k]=False
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
        faces=f[labels==pid]
        if not len(faces):
            result[name]={'triangles':0,'edges':0,'edge_median_mm':None,'edge_p5_mm':None,'edge_p95_mm':None,'edge_p95_over_p5':None};continue
        edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
        lengths=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)*1000
        result[name]={'triangles':len(faces),'edges':len(edges),'edge_median_mm':float(np.median(lengths)),'edge_p5_mm':float(np.percentile(lengths,5)),'edge_p95_mm':float(np.percentile(lengths,95)),'edge_p95_over_p5':float(np.percentile(lengths,95)/np.percentile(lengths,5))}
    return result


def elbows(body,head,rig,cam,render):
    from geometry import material
    clay=material('lowpoly6 white',(.7,.7,.7),.82);wiremat=material('lowpoly6 wire',(.008,.012,.018),.8)
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
    from lowpoly3_measure import deformation
    from lowpoly6_measure import pose_regions,export_distances,armpit_sections,extra_renders
    from lowpoly7_neck import vertex_labels_with_slit_provenance,apply_neck_weights
    from lowpoly3_render import render_all
    p4.bone_mask=bone_mask;p4.vertex_labels=vertex_labels_with_slit_provenance
    rig=bpy.data.objects['temporary_rig'];body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];reset_pose(rig)
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};construction=json.loads((OUT/'construction.json').read_text())
    construction['neck']['overlap_shortfall_m']=.010-construction['neck']['overlap_m']
    pp=coords(body);ff=triangles(body);fl=attr(body,'part_id');fl[(fl==2)&(pp[ff].mean(1)[:,2]>construction['neck']['body_cut_m']+1e-6)]=3;p3.face_attr(body,'part_id',fl)
    weights=p4.auto_weights(body,rig,j);labels=p4.vertex_labels(body)
    weights['neck_transition']=apply_neck_weights(body,rig,labels,construction['neck'])
    for name in ['hand_L','hand_R']:
        if not body.vertex_groups.get(name):body.vertex_groups.new(name=name)
    hand=p3.set_hand_boundaries(body,j)
    p3.rigid(head,'head');p3.attach_armature(head,rig)
    rest={o.name:coords(o) for o in [body,head]};initial={};centers=[]
    for pose in POSES:
        set_pose(rig,pose);initial[pose]=pose_regions(body,rig,j)
        r=initial[pose]['whole_body']
        if r['flipped_faces'] or r['edges_over_2x']:
            if pose.startswith('arm'):
                for side in ['L','R']:
                    centers.extend([(j['shoulder_'+side],.075),(j['elbow_'+side],.065),(j['wrist_'+side],.035)])
            elif pose.startswith('spine_'):centers.extend([(j['spine_mid'],.05),(j['spine_upper'],.05)])
            elif pose.startswith('neck_'):centers.extend([(j['neck_base'],.035),(j['head_pivot'],.035)])
        log('初期ポーズ '+pose+' '+json.dumps(r))
    reset_pose(rig);write(OUT/'poses-initial.json',initial)
    weights['joint_refinement']=p4.smooth_problem(body,rig,j,labels,centers) if centers else None
    weights['neck_transition']=apply_neck_weights(body,rig,labels,construction['neck'])
    weights['local_width_refinement']=None
    weights['refinement_policy']='Use sixth-pass pre-refinement weights; neck transition only'
    weights['final']=p4.constrain(body,rig,j,labels);weights['hand_boundaries']=hand
    poses={};regions={};local={}
    for pose in POSES:
        set_pose(rig,pose);poses[pose]=deformation([body,head],rest);regions[pose]=pose_regions(body,rig,j)
        if pose.startswith('arm_'):local[pose]=local_deformation(body,rig,'L' if pose.startswith('arm_L') else 'R')
        log('最終ポーズ '+pose+' '+json.dumps(regions[pose]))
    reset_pose(rig);write(OUT/'weights.json',weights);write(OUT/'poses-metrics.json',poses);write(OUT/'joint-pose-metrics.json',regions);write(OUT/'elbow-metrics.json',local)
    checkpoint('geometry-checkpoint')
    metrics=export_distances(OUT,body,head)
    sec=json.loads((OUT/'sections.json').read_text())
    filled=append(OUT/'filled-checkpoint.blend',['filled6_with_old_head'])[0];sec['after']=sections(filled);bpy.data.objects.remove(filled,do_unlink=True)
    sec['reduced']=sections(body);write(OUT/'sections.json',sec)
    counts={part:int((attr(body,'part_id')==pid).sum()) for pid,part in p3.PARTS.items()}
    counts.update({part:int((attr(head,'part2')==pid).sum()) for pid,part in [(0,'face_head'),(1,'hair')]});counts['total']=sum(counts.values())
    method=json.loads((OUT/'remeshing.json').read_text());top=topology(body)
    ap=armpit_sections(body);write(OUT/'armpit-sections.json',ap)
    limits=lambda k:2.5 if k=='shoulder_straps' else 1.5
    metrics.update({'stage':'lowpoly7','construction':construction,'grid_and_r':construction['solidification'],'filled_distances':construction['filled_distances'],'sections':sec,'armpit_sections_after_uniform':ap,'remeshing':method,'uniformity':uniformity(body),'triangles':counts,'weights':weights,'poses':poses,'joint_pose_metrics':regions,'elbows':local,'topology':{'filled':construction['after_fill'],'after_neck':construction['after_neck_cut'],'uniform':top,'head':topology(head)},'triangle_budget':{'target_body':30000,'body_triangles':len(triangles(body)),'total':counts['total'],'reserved_later':5000,'current_plus_reserved':counts['total']+5000,'limit':60000,'pass':counts['total']+5000<=60000},'acceptance':{'sections':all(v['pass'] for key in ['after','reduced'] for v in sec[key].values()),'body_topology':top['boundary_edges']==0 and top['edges_shared_by_3_or_more_faces']==0 and top['connected_components']==1,'weights':not any(weights['final']['forbidden_over_005'].values()) and weights['final']['audit']['max_influences']<=4 and weights['final']['audit']['unweighted_vertices']==0,'filled_distance':all(r['p95_mm']<=limits(k) for k,r in construction['filled_distances'].items() if k in p3.PARTS.values() and k!='neck'),'distance_p95':all(v['low_to_high']['p95_mm']<=limits(k) for k,v in metrics['distances_full_source'].items() if k not in ['neck','face_head','hair']),'elbow':all(v['numeric_pass'] for v in local.values()),'neck_planar_cut':construction['neck']['planar_cut_pass'],'silhouette':None,'visual':None}})
    write(OUT/'metrics.json',metrics)
    from lowpoly7_neck import stretch_diagnostics
    cam=studio()
    metrics['stretch_over_3x']=stretch_diagnostics(OUT,body,head,rig,cam,render,POSES,set_pose)
    write(OUT/'metrics.json',metrics)
    render_all(OUT,[body,head],[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original','high3_cap_original']],rig,j,cam,render,head)
    elbows(body,head,rig,cam,render);extra_renders(OUT,body,head,rig,cam,render)
    for action in bpy.data.actions:
        if action.name.startswith('lowpoly3_'):action.name=action.name.replace('lowpoly3_','lowpoly7_',1)
    reset_pose(rig);visible([body,head])
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_set(obj not in [body,head])
    checkpoint('character-lowpoly7');verify()
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly6_review.py')),str(OUT)],check=True)
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly6_supplement.py')),str(OUT)],check=True)
    subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly7_review.py')),str(OUT)],check=True)


def verify():
    from lowpoly7_neck import vertex_labels_with_slit_provenance
    p4.vertex_labels=vertex_labels_with_slit_provenance
    path=OUT/'character-lowpoly7.blend';bpy.ops.wm.open_mainfile(filepath=str(path));body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    metrics=json.loads((OUT/'metrics.json').read_text());construction=metrics['construction'];names=[b.name for b in rig.data.bones];labels=p4.vertex_labels(body);j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};_,allowed,_=bone_mask(body,rig,j,labels);w=p4.read_weights(body,names)
    report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'head_geometry_unchanged':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()==construction['head_geometry_sha256'],'source_blend_unchanged':hashlib.sha256((WORK/'lowpoly4/character-lowpoly4.blend').read_bytes()).hexdigest()==construction['input_sha256'],'head_transform_unchanged':bool(np.allclose(np.asarray(head.matrix_world),construction['head_matrix'],rtol=0,atol=1e-9)),'weights':{o.name:weight_audit(o,set(names)) for o in [body,head]},'forbidden_over_005':int(((w>.05)&~allowed).sum()),'maximum_weight_sum_error_including_tiny_weights':float(abs(w.sum(1)-1).max()),'backpack_vertices':int((labels==8).sum()),'backpack_chest_1_pass':bool(np.all(w[labels==8,names.index('spine.chest')]==1) and np.all(np.delete(w[labels==8],names.index('spine.chest'),axis=1)==0)),'bone_count':len(names),'topology':topology(body),'arm_motion':{}}
    for side in ['L','R']:
        set_pose(rig,'arm_'+side+'_70_elbow90');report['arm_motion'][side]=local_deformation(body,rig,side)
    reset_pose(rig)
    from lowpoly3_measure import deformation
    rest={o.name:coords(o) for o in [body,head]};saved={}
    for pose in POSES:
        set_pose(rig,pose);saved[pose]=deformation([body,head],rest)
    reset_pose(rig)
    band=(labels==2)&(coords(body)[:,2]>=construction['neck']['body_cut_m']-.010-1e-7)
    report['neck_head_1_band_vertices']=int(band.sum())
    report['neck_head_1_band_pass']=bool(band.any() and np.all(w[band,names.index('head')]==1) and np.all(np.delete(w[band],names.index('head'),axis=1)==0))
    report['head_rigid_head_1_pass']=all(len([g for g in v.groups if g.weight>0])==1 and any(head.vertex_groups[g.group].name=='head' and g.weight==1 for g in v.groups) for v in head.data.vertices)
    report['saved_pose_metrics_match']=saved==metrics['poses']
    report['max_surface_position_change_during_weights_mm']=float(np.linalg.norm(coords(body)-np.load(OUT/'uniform-body.npz')['V'],axis=1).max()*1000)
    report['max_positive_influences_including_tiny_weights']=int((w>0).sum(1).max())
    report['pose_actions']=[a.name for a in bpy.data.actions if a.name.startswith('lowpoly7_')]
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

