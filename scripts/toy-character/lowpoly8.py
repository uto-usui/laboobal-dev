"""Eighth pass: repair source labels, center the neck rig, transfer backpack weights.

All surface geometry is produced by the seventh-pass operators. Numeric coordinates
below specify measurements, cuts and skeleton placement, never authored vertices.
"""
import os,json,time,hashlib,subprocess,shutil,math
from pathlib import Path
from collections import Counter,defaultdict
import bpy,bmesh,numpy as np
from mathutils import Vector
from lowpoly import WORK,append,coords,triangles,write,activate,recalc,subset
from lowpoly2 import clone,reset_pose,set_pose as previous_pose,POSES,weight_audit,evaluated,turn_world
from lowpoly2_measure import attr
from lowpoly_verify import topology,visible
import lowpoly3 as p3
import lowpoly4 as p4
import lowpoly7 as p7
import lowpoly7_neck as n7
OUT=None
PYTHON=WORK/'venv-geo/bin/python'
BASE_TRANSFER=p4.transfer_accessory_weights


def log(message):
    print('LOWPOLY8',message,flush=True)
    with (OUT/'log.md').open('a') as stream:stream.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def set_pose(rig,name):
    if not name.startswith('neck_'):return previous_pose(rig,name)
    reset_pose(rig)
    import re
    direction,degrees=__import__('re').match(r'neck_(left|right|up|down)(\d+)',name).groups()
    axis=(0,0,1) if direction in ['left','right'] else (1,0,0)
    turn_world(rig,'neck',axis,int(degrees)*(1 if direction in ['left','down'] else -1))


def repair_labels(original,rig,filename="label-repair.json"):
    p=coords(original);f=triangles(original);labels=attr(original,'part_id');centers=p[f].mean(1);changed=[]
    neighbors=defaultdict(list)
    for i,face in enumerate(f):
        for a,b in [(0,1),(1,2),(2,0)]:neighbors[tuple(sorted((int(face[a]),int(face[b]))))].append(i)
    bad=[]
    for side,pids in [('L',[4,6]),('R',[5,7])]:
        ids=np.flatnonzero(np.isin(labels,pids));q=centers[ids];dist=np.full(len(q),np.inf)
        for name in ['upper_arm.','forearm.','hand.']:
            bone=rig.data.bones[name+side];a=np.array(bone.head_local);b=np.array(bone.tail_local);ab=b-a
            t=np.clip(((q-a)@ab)/(ab@ab),0,1);dist=np.minimum(dist,np.linalg.norm(q-(a+t[:,None]*ab),axis=1))
        bad.extend((int(i),side,float(d)) for i,d in zip(ids,dist) if d>=.070)
    for i,side,dist in bad:
        face=f[i];adj=set()
        for a,b in [(0,1),(1,2),(2,0)]:adj.update(neighbors[tuple(sorted((int(face[a]),int(face[b]))))])
        counts=Counter(int(labels[k]) for k in adj if labels[k] not in [4,5,6,7])
        # A connected island can have no immediate non-arm neighbor. Expand face
        # rings until the first ring containing a non-arm label, with stable ties.
        seen={i};front=adj
        while not counts and front:
            seen|=front;next_ring=set()
            for k in front:
                for a,b in [(0,1),(1,2),(2,0)]:next_ring.update(neighbors[tuple(sorted((int(f[k,a]),int(f[k,b]))))])
            front=next_ring-seen;counts=Counter(int(labels[k]) for k in front if labels[k] not in [4,5,6,7])
        if not counts:raise RuntimeError('No neighboring non-arm label')
        target=min(counts,key=lambda k:(-counts[k],k))
        changed.append({'face_index':i,'side':side,'from':int(labels[i]),'to':target,'center_m':centers[i].tolist(),'bounds_m':[p[face].min(0).tolist(),p[face].max(0).tolist()],'distance_to_arm_mm':dist*1000,'neighbor_non_arm_counts':dict(counts)})
    fixed=labels.copy()
    for row in changed:fixed[row['face_index']]=row['to']
    p3.face_attr(original,'part_id',fixed)
    result={'count':len(changed),'by_side':dict(Counter(r['side'] for r in changed)),'distance_definition':'triangle centroid to nearest same-side upper_arm/forearm/hand bone segment, >=70mm','adjacency':'shared edge; expand rings only when no immediate non-arm labels; majority, smallest label wins ties','faces':changed}
    write(OUT/filename,result);log('ラベル修正 '+json.dumps({k:v for k,v in result.items() if k!='faces'},ensure_ascii=False))
    return fixed


def prepare():
    source=WORK/'lowpoly7/character-lowpoly7.blend'
    append(source,['reference_labeled_body','high3_body_original','high3_head_original','high3_cap_original','temporary_rig'])
    rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    original=bpy.data.objects['reference_labeled_body'];fixed=repair_labels(original,rig)
    highbody=bpy.data.objects['high3_body_original']
    repair_labels(highbody,rig,'label-repair-high-original.json')
    np.savez(OUT/'source.npz',V=coords(original),F=triangles(original),labels=fixed)
    high=bpy.data.objects['high3_head_original'];head=clone(high,'low6_head');head.animation_data_clear()
    write(OUT/'joints.json',json.loads((WORK/'lowpoly7/joints.json').read_text()))
    write(OUT/'construction.json',{'source':'lowpoly7/character-lowpoly7.blend','input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'head_matrix':np.asarray(high.matrix_world).tolist(),'source_topology':topology(original),'source_includes_old_head':True,'head_original_bottom_m':float(coords(high)[:,2].min())})
    # Cache keys exclude labels because winding and straight visibility use only
    # geometry. Semantic slit, distance labels and old-head removal are rerun.
    for name in ['winding.npz','escape-counts.npy','escape-cache.json','collar-landmark.json','versions.json']:
        shutil.copyfile(WORK/'lowpoly7'/name,OUT/name)
    from lowpoly8_neck import align_bones
    align_bones(OUT,high,rig)
    p7.checkpoint('source-checkpoint')


def cut_neck(body,report):
    n7.cut_neck(body,report,{'rebuild_head':p7.rebuild_head,'checkpoint':p7.checkpoint,'log':log})
    # Keep the seventh-pass BODY cut, but restore the head from the immutable
    # fitted source and cut at its own original lower bound.
    bpy.data.objects.remove(bpy.data.objects['low6_head'],do_unlink=True)
    clone(bpy.data.objects['high3_head_original'],'low6_head')
    for obj in list(bpy.data.objects):
        if obj.name.startswith('low6_cap'):bpy.data.objects.remove(obj,do_unlink=True)
    report['neck']['head_cut_m']=report['head_original_bottom_m'];p7.rebuild_head(report)
    report['neck']['required_overlap_m']=.010;report['neck']['overlap_pass']=report['neck']['overlap_m']>=.010
    n=report['neck'];n['inherited_body_cut_selection']=n['radial_measurement'];n['requested_head_cut_m']=n['head_cut_m']
    n['radial_measurement']={'scope':'final eighth-pass head; angular samples in neck-range-raw.json','head_cut_height_mm':n['head_cut_m']*1000,'actual_head_bottom_mm':n['head_bottom_m']*1000,'overlap_mm':n['overlap_m']*1000}
    n['radial_measurement_scope']='inherited_body_cut_selection records the temporary head for the retained body cut only; it does not describe the final head or decide the neck movement range'
    report['neck']['head_cut_policy']='original fitted lower bound; no second trim at body_cut-10mm'
    write(OUT/'construction.json',report)


def crossing_faces(body,phase):
    labels=n7.vertex_labels_with_slit_provenance(body);p=coords(body);f=np.array([face.vertices[:] for face in body.data.polygons]);rows={}
    # A face is below the slit only if all its vertices are below its top.
    below=np.max(p[f,2],axis=1)<.567
    for side,pids in [('L',[4,6]),('R',[5,7])]:
        arm=np.isin(labels,pids);mixed=below&np.any(arm[f],axis=1)&np.any(~arm[f],axis=1);ids=np.flatnonzero(mixed)
        rows[side]={'count':len(ids),'faces':[{'index':int(i),'center_m':p[f[i]].mean(0).tolist(),'labels':labels[f[i]].tolist()} for i in ids]}
    return {'phase':phase,'below_m':.567,'selection':'all face vertices below armpit top; vertex labels from original faces and surviving slit volume','sides':rows,'count':sum(r['count'] for r in rows.values())}


def remesh():
    from lowpoly8_neck import align_bones
    align_bones(OUT,bpy.data.objects['high3_head_original'],bpy.data.objects['temporary_rig'])
    source=bpy.data.objects['solid6_body'];body=clone(source,'low6_body');activate(body);before=topology(body);start=time.monotonic()
    status=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,mode='FACES',target_faces=17500,seed=0)
    sides=Counter(len(face.vertices) for face in body.data.polygons)
    if 'FINISHED' not in status or set(sides)!={4}:raise RuntimeError('QuadriFlow did not produce quads')
    # Check actual quads before capping/triangulation changes face indexing.
    quad=crossing_faces(body,'immediately_after_quadriflow')
    method={'method':'QuadriFlow','target_triangles':30000,'requested_quad_faces':17500,'quadriflow_status':list(status),'polygon_sides':dict(sides),'input':before,'seconds':time.monotonic()-start}
    bm=bmesh.new();bm.from_mesh(body.data);rim=[e for e in bm.edges if e.is_boundary];caps=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces'] if rim else []
    method['quadriflow_rim_closure']={'boundary_edges':len(rim),'caps':len(caps),'new_vertex_positions':0}
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();recalc(body,True)
    def wrap(target,mask=None):
        activate(body);mod=body.modifiers.new('Nearest filled surface','SHRINKWRAP');mod.target=target;mod.wrap_method='NEAREST_SURFACEPOINT';mod.wrap_mode='ON_SURFACE'
        if mask is not None:
            group=body.vertex_groups.new(name='temporary_wrap');group.add(np.flatnonzero(mask).tolist(),1.,'REPLACE');mod.vertex_group=group.name
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if mask is not None:body.vertex_groups.remove(body.vertex_groups['temporary_wrap'])
    before_wrap=coords(body).copy();wrap(source);recalc(body,True);after=crossing_faces(body,'immediately_after_shrinkwrap')
    log('脇の面確認 '+json.dumps({'quadriflow':quad['count'],'shrinkwrap':after['count']}))
    write(OUT/'armpit-crossing-initial.json',{'quadriflow':quad,'shrinkwrap':after})
    method['separate_shrinkwrap_targets_used']=bool(quad['count'] or after['count'])
    if method['separate_shrinkwrap_targets_used']:
        # Restore only this provisional wrap, then perform the mandated wrap on
        # disjoint semantic sources; this is not a geometry design alternative.
        body.data.vertices.foreach_set('co',before_wrap.ravel());body.data.update()
        labels=n7.vertex_labels_with_slit_provenance(body);source_labels=n7.vertex_labels_with_slit_provenance(source);sf=triangles(source)
        for name,pids in [('left_arm',[4,6]),('right_arm',[5,7]),('non_arm',[0,1,2,3,8,9,10])]:
            target=subset(source,np.all(np.isin(source_labels[sf],pids),axis=1),'wrap_'+name)
            wrap(target,np.isin(labels,pids));bpy.data.objects.remove(target,do_unlink=True)
        recalc(body,True);method['after_separate_shrinkwrap']=crossing_faces(body,'after_separate_shrinkwrap')
    method['armpit_crossing_faces']={'quadriflow':quad,'shrinkwrap':after}
    p3.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
    cut=json.loads((OUT/'construction.json').read_text())['neck']['body_cut_m'];p=coords(body);f=triangles(body);fl=attr(body,'part_id');fl[(fl==2)&(p[f].mean(1)[:,2]>cut+1e-6)]=3;p3.face_attr(body,'part_id',fl)
    p3.face_attr(body,'neck_cap',np.all(abs(p[f][:,:,2]-cut)<1e-6,axis=1).astype(int))
    np.savez(OUT/'uniform-body.npz',V=p,F=f);method['after']=topology(body);write(OUT/'remeshing.json',method);log('均一化 '+json.dumps(method));p7.checkpoint('uniform-checkpoint')


def bone_mask(body,rig,j,labels):
    names,allowed,collar=p7.bone_mask(body,rig,j,labels)
    fixed=(labels==2)|collar
    allowed[fixed]=False;allowed[fixed,names.index('spine.chest')]=True
    field=OUT/'front-blend-field.npz'
    if field.exists():
        data=np.load(field)
        if data['head_weight'].shape==(len(labels),):allowed[data['head_weight']>0,names.index('head')]=True
    return names,allowed,collar


def transfer_accessory_weights(body,rig,labels,collar):
    p=coords(body);f=triangles(body);fl=attr(body,'part_id');fc=p[f].mean(1);torso=(fl==3)&~((fc[:,2]>.642)&(abs(fc[:,0])<.089))
    source=subset(body,torso,'underlying_torso_weight_source');targets=np.flatnonzero((labels==8)|(labels==9))
    mask=body.vertex_groups.new(name='temporary_transfer_mask');mask.add(targets.tolist(),1.,'REPLACE');activate(body)
    mod=body.modifiers.new('Backpack and straps from underlying torso','DATA_TRANSFER');mod.object=source;mod.use_vert_data=True;mod.data_types_verts={'VGROUP_WEIGHTS'};mod.vert_mapping='POLYINTERP_NEAREST';mod.layers_vgroup_select_src='ALL';mod.layers_vgroup_select_dst='NAME';mod.vertex_group=mask.name
    bpy.ops.object.modifier_apply(modifier=mod.name);body.vertex_groups.remove(body.vertex_groups['temporary_transfer_mask']);bpy.data.objects.remove(source,do_unlink=True)
    p3.rigid(body,'spine.chest',np.flatnonzero((labels==2)|collar))
    return {'operator':'DATA_TRANSFER','mapping':'POLYINTERP_NEAREST','targets':len(targets),'backpack_vertices':int((labels==8).sum()),'source':'underlying torso triangles excluding collar','neck_skin_and_collar':'spine.chest=1'}


def fixed_neck(body,rig,labels,n):
    p=coords(body);collar=(labels==3)&(p[:,2]>.642)&(abs(p[:,0])<.089);ids=np.flatnonzero((labels==2)|collar);p3.rigid(body,'spine.chest',ids)
    blend=None
    field=OUT/'front-blend-field.npz'
    if field.exists():
        alpha=np.load(field)['head_weight'];names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names);selected=alpha>0;w[selected]=0;w[selected,names.index('head')]=alpha[selected];w[selected,names.index('spine.chest')]=1-alpha[selected];p4.put_weights(body,names,w);blend=json.loads((OUT/'front-blend.json').read_text())
    return {'method':'body neck skin and collar spine.chest=1, except visually confirmed exposed front skin with distance-based head blend; head rigid head=1','body_fixed_vertices':len(ids),'front_opening_blend':blend}


def pose_regions(body,rig,j):
    from lowpoly6_measure import pose_regions as previous
    result=previous(body,rig,j);q=coords(body);p=evaluated(body);edges=np.array([e.vertices[:] for e in body.data.edges]);labels=p4.vertex_labels(body)
    ratio=np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1)/np.maximum(np.linalg.norm(q[edges[:,1]]-q[edges[:,0]],axis=1),1e-12)
    def sphere(center,r):return np.linalg.norm(q-np.asarray(center),axis=1)<r
    masks={'whole_body':np.ones(len(q),bool),'neck':(q[:,2]>.600)&(abs(q[:,0])<.10),'chest':(q[:,2]>.48)&(q[:,2]<.65)&(abs(q[:,0])<.115),'crotch':sphere(j['pelvis'],.10)&(q[:,2]<.40)}
    for region,key,radius in [('shoulder','shoulder_',.075),('armpit','shoulder_',.095),('elbow','elbow_',.065)]:
        masks[region]=np.zeros(len(q),bool)
        for side in ['L','R']:
            m=sphere(j[key+side],radius)
            if region=='armpit':m&=q[:,2]<j[key+side][2]+.01
            masks[region+'_'+side]=m;masks[region]|=m
    for name,r in result.items():
        ids=np.flatnonzero(np.any(masks[name][edges],axis=1));i=int(ids[np.argmax(ratio[ids])]);edge=edges[i]
        r['flipped_face_fraction']=r['flipped_faces']/max(r['tested_faces'],1)
        r['maximum_edge']={'index':i,'vertices':edge.tolist(),'stretch':float(ratio[i]),'parts':[p3.PARTS.get(int(x),str(x)) for x in labels[edge]],'rest_endpoints_mm':(q[edge]*1000).tolist(),'posed_endpoints_mm':(p[edge]*1000).tolist(),'height_range_mm':(q[edge,2]*1000).tolist()}
    return result


def run(out,studio,render):
    global OUT;OUT=out;p7.OUT=out;p3.OUT=out;p4.OUT=out;n7.OUT=out
    p7.log=log;p7.cut_neck=cut_neck;p7.remesh=remesh;p7.POSES=POSES;p7.set_pose=set_pose
    p4.bone_mask=bone_mask;p4.vertex_labels=n7.vertex_labels_with_slit_provenance;p4.transfer_accessory_weights=transfer_accessory_weights
    import lowpoly3_render as renders,lowpoly6_measure as measures
    renders.POSES=POSES;renders.set_pose=set_pose;measures.POSES=POSES;measures.set_pose=set_pose
    phase=os.environ.get('LOWPOLY8_PHASE','all');log('開始 '+phase)
    if phase in ['all','prepare']:prepare()
    if phase=='solid':bpy.ops.wm.open_mainfile(filepath=str(out/'source-checkpoint.blend'))
    if phase in ['all','solid']:p7.solid()
    if phase=='remesh':bpy.ops.wm.open_mainfile(filepath=str(out/'closed-checkpoint.blend'))
    if phase in ['all','remesh']:remesh()
    if phase in ['weights','finish']:bpy.ops.wm.open_mainfile(filepath=str(out/'uniform-checkpoint.blend'))
    if phase in ['all','weights','finish']:finish(studio,render,only_weights=phase=='weights')
    if phase=='render':
        bpy.ops.wm.open_mainfile(filepath=str(out/'geometry-checkpoint.blend'));render_outputs(studio,render)
    if phase=='neck':
        from lowpoly8_neck import measure_range
        bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly8.blend'));body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig);cam=bpy.context.scene.camera
        bpy.context.scene.eevee.taa_render_samples=24
        j={k:np.array(v) for k,v in json.loads((out/'joints.json').read_text()).items()};metrics=json.loads((out/'metrics.json').read_text());metrics['neck_angle_measurements']=measure_range(out,body,head,rig,cam,render,set_pose,pose_regions,j);write(out/'metrics.json',metrics)
        p7.checkpoint('character-lowpoly8');verify()
        subprocess.run([str(PYTHON),str(Path(__file__).with_name('lowpoly8_review.py')),str(out)],check=True)
    if phase=='verify':verify()


def finish(studio,render,only_weights=False):
    from lowpoly3_measure import deformation
    from lowpoly6_measure import export_distances,armpit_sections,extra_renders
    vertex_labels_with_slit_provenance=n7.vertex_labels_with_slit_provenance
    apply_neck_weights=fixed_neck
    from lowpoly3_render import render_all
    p4.bone_mask=bone_mask;p4.vertex_labels=vertex_labels_with_slit_provenance
    rig=bpy.data.objects['temporary_rig'];body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];reset_pose(rig)
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};construction=json.loads((OUT/'construction.json').read_text())
    construction['neck']['overlap_shortfall_m']=.010-construction['neck']['overlap_m']
    pp=coords(body);ff=triangles(body);fl=attr(body,'part_id');fl[(fl==2)&(pp[ff].mean(1)[:,2]>construction['neck']['body_cut_m']+1e-6)]=3;p3.face_attr(body,'part_id',fl)
    from lowpoly8_neck import front_blend_field
    front_blend_field(OUT,body,head,p4.vertex_labels(body))
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
    # Preserve the seventh-pass joint Smooth; no additional spine solve.
    weights['joint_refinement']=p4.smooth_problem(body,rig,j,labels,centers) if centers else None
    weights['neck_transition']=apply_neck_weights(body,rig,labels,construction['neck'])
    weights['local_width_refinement']=None
    weights['refinement_policy']='Inherited 12-pass joint Smooth; no additional spine-specific refinement; fixed body neck and transferred backpack'
    weights['final']=p4.constrain(body,rig,j,labels);weights['hand_boundaries']=hand
    poses={};regions={};local={}
    for pose in POSES:
        set_pose(rig,pose);poses[pose]=deformation([body,head],rest);regions[pose]=pose_regions(body,rig,j)
        if pose.startswith('arm_'):local[pose]=p7.local_deformation(body,rig,'L' if pose.startswith('arm_L') else 'R')
        log('最終ポーズ '+pose+' '+json.dumps(regions[pose]))
    reset_pose(rig);write(OUT/'weights.json',weights);write(OUT/'poses-metrics.json',poses);write(OUT/'joint-pose-metrics.json',regions);write(OUT/'elbow-metrics.json',local)
    p7.checkpoint('geometry-checkpoint')
    if only_weights:
        cam=studio();visible([body,head]);bpy.context.scene.render.resolution_x=bpy.context.scene.render.resolution_y=900
        for a in [0,25,90]:
            angle=math.radians(a);target=Vector((.013,-.025,.680));render(OUT,cam,f'rest-opening-{a}.png',target+Vector((2*math.sin(angle),-2*math.cos(angle),0)),target,.15)
        return
    metrics=export_distances(OUT,body,head)
    sec=json.loads((OUT/'sections.json').read_text())
    filled=append(OUT/'filled-checkpoint.blend',['filled6_with_old_head'])[0];sec['after']=p7.sections(filled);bpy.data.objects.remove(filled,do_unlink=True)
    sec['reduced']=p7.sections(body);write(OUT/'sections.json',sec)
    counts={part:int((attr(body,'part_id')==pid).sum()) for pid,part in p3.PARTS.items()}
    counts.update({part:int((attr(head,'part2')==pid).sum()) for pid,part in [(0,'face_head'),(1,'hair')]});counts['total']=sum(counts.values())
    method=json.loads((OUT/'remeshing.json').read_text());top=topology(body)
    ap=armpit_sections(body);write(OUT/'armpit-sections.json',ap)
    limits=lambda k:2.5 if k=='shoulder_straps' else 1.5
    metrics.update({'stage':'lowpoly8','construction':construction,'grid_and_r':construction['solidification'],'filled_distances':construction['filled_distances'],'sections':sec,'armpit_sections_after_uniform':ap,'remeshing':method,'uniformity':p7.uniformity(body),'triangles':counts,'weights':weights,'poses':poses,'joint_pose_metrics':regions,'elbows':local,'topology':{'filled':construction['after_fill'],'after_neck':construction['after_neck_cut'],'uniform':top,'head':topology(head)},'triangle_budget':{'target_body':30000,'body_triangles':len(triangles(body)),'total':counts['total'],'reserved_later':5000,'current_plus_reserved':counts['total']+5000,'limit':60000,'pass':counts['total']+5000<=60000},'acceptance':{'sections':all(v['pass'] for key in ['after','reduced'] for v in sec[key].values()),'body_topology':top['boundary_edges']==0 and top['edges_shared_by_3_or_more_faces']==0 and top['connected_components']==1,'weights':not any(weights['final']['forbidden_over_005'].values()) and weights['final']['audit']['max_influences']<=4 and weights['final']['audit']['unweighted_vertices']==0,'filled_distance':all(r['p95_mm']<=limits(k) for k,r in construction['filled_distances'].items() if k in p3.PARTS.values() and k!='neck'),'distance_p95':all(v['low_to_high']['p95_mm']<=limits(k) for k,v in metrics['distances_full_source'].items() if k not in ['neck','face_head','hair']),'elbow':all(v['numeric_pass'] for v in local.values()),'neck_planar_cut':construction['neck']['planar_cut_pass'],'silhouette':None,'visual':None}})
    write(OUT/'metrics.json',metrics)
    render_outputs(studio,render)


def render_outputs(studio,render):
    from lowpoly3_render import render_all
    from lowpoly6_measure import extra_renders
    from lowpoly8_neck import measure_range
    rig=bpy.data.objects['temporary_rig'];body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];reset_pose(rig)
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};cam=studio()
    bpy.context.scene.eevee.taa_render_samples=24
    metrics=json.loads((OUT/'metrics.json').read_text())
    metrics['label_repair']=json.loads((OUT/'label-repair.json').read_text());metrics['neck_bones']=json.loads((OUT/'neck-bones.json').read_text())
    remesh_report=json.loads((OUT/'remeshing.json').read_text());metrics['armpit_crossing_faces']=remesh_report['armpit_crossing_faces'];metrics['armpit_crossing_faces']['after_separate_shrinkwrap']=remesh_report['after_separate_shrinkwrap']
    metrics['neck_angle_measurements']=measure_range(OUT,body,head,rig,cam,render,set_pose,pose_regions,j)
    metrics['stretch_over_3x']=n7.stretch_diagnostics(OUT,body,head,rig,cam,render,POSES,set_pose)
    write(OUT/'metrics.json',metrics)
    render_all(OUT,[body,head],[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original','high3_cap_original']],rig,j,cam,render,head)
    p7.elbows(body,head,rig,cam,render);extra_renders(OUT,body,head,rig,cam,render)
    for action in bpy.data.actions:
        if action.name.startswith('lowpoly3_'):action.name=action.name.replace('lowpoly3_','lowpoly8_',1)
    reset_pose(rig);visible([body,head])
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_set(obj not in [body,head])
    p7.checkpoint('character-lowpoly8');verify()
    for script in ['lowpoly8_review.py','lowpoly6_supplement.py','lowpoly7_review.py']:
        subprocess.run([str(PYTHON),str(Path(__file__).with_name(script)),str(OUT)],check=True)


def verify():
    path=OUT/'character-lowpoly8.blend';bpy.ops.wm.open_mainfile(filepath=str(path));body=bpy.data.objects['low6_body'];head=bpy.data.objects['low6_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    metrics=json.loads((OUT/'metrics.json').read_text());construction=metrics['construction'];names=[b.name for b in rig.data.bones];labels=p4.vertex_labels(body);j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};_,allowed,collar=bone_mask(body,rig,j,labels);w=p4.read_weights(body,names)
    fixed=(labels==2)|collar
    report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'head_geometry_unchanged':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()==construction['head_geometry_sha256'],'source_blend_unchanged':hashlib.sha256((WORK/'lowpoly7/character-lowpoly7.blend').read_bytes()).hexdigest()==construction['input_sha256'],'head_transform_unchanged':bool(np.allclose(np.asarray(head.matrix_world),construction['head_matrix'],rtol=0,atol=1e-9)),'weights':{o.name:weight_audit(o,set(names)) for o in [body,head]},'forbidden_over_005':int(((w>.05)&~allowed).sum()),'maximum_weight_sum_error_including_tiny_weights':float(abs(w.sum(1)-1).max()),'max_positive_influences_including_tiny_weights':int((w>0).sum(1).max()),'body_neck_collar_chest_1_pass':bool(np.all(w[fixed & ~(np.load(OUT/'front-blend-field.npz')['head_weight']>0),names.index('spine.chest')]==1)),'front_blend_audit':json.loads((OUT/'front-blend.json').read_text()) if (OUT/'front-blend.json').exists() else None,'backpack_transfer':metrics['weights']['accessory_transfer'],'backpack_chest_weight_range':[float(w[labels==8,names.index('spine.chest')].min()),float(w[labels==8,names.index('spine.chest')].max())],'bone_count':len(names),'topology':topology(body),'arm_motion':{}}
    for side in ['L','R']:
        set_pose(rig,'arm_'+side+'_70_elbow90');report['arm_motion'][side]=p7.local_deformation(body,rig,side)
    reset_pose(rig)
    from lowpoly3_measure import deformation
    rest={o.name:coords(o) for o in [body,head]};saved={}
    for pose in POSES:
        set_pose(rig,pose);saved[pose]=deformation([body,head],rest)
    reset_pose(rig)
    report['head_rigid_head_1_pass']=all(len([g for g in v.groups if g.weight>0])==1 and any(head.vertex_groups[g.group].name=='head' and g.weight==1 for g in v.groups) for v in head.data.vertices)
    report['saved_pose_metrics_match']=saved==metrics['poses'];report['max_surface_position_change_during_weights_mm']=float(np.linalg.norm(coords(body)-np.load(OUT/'uniform-body.npz')['V'],axis=1).max()*1000)
    report['pose_actions']=[a.name for a in bpy.data.actions if a.name.startswith('lowpoly8_')]
    write(OUT/'saved-verification.json',report);metrics['saved_verification']=report;write(OUT/'metrics.json',metrics);log('保存検査 '+json.dumps(report))
