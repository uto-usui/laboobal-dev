"""Stage 6, third pass: closed voxel surfaces, regional Collapse, pose audit.

Surface positions come only from input geometry and Blender operators. Numbers
below describe sampling, labels, cut planes and rig weights, never authored shape.
"""
import json, math, time, os, hashlib
from collections import Counter
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import (WORK, source_inputs, coords, triangles, subset, append,
    activate, recalc, write, head_colors, head_hair_labels, bvh)
from lowpoly2 import (clone, cut_and_cap, labels_to_groups, make_rig, rigid as rigid2,
    weight_audit, POSES, set_pose, reset_pose, evaluated)
from lowpoly_verify import topology, area_samples, combined, visible
from lowpoly2_measure import attr, nearest_values

PARTS={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes'}
BODY_TARGET={2:800,3:10200,4:3400,5:3400,6:1800,7:1800,8:1500,9:2500,10:6200}
HEAD_TARGET={0:9300,1:8200}
LIMITS={'face_head':8000,'hair':7000,'torso':8000,'sleeve_L':3000,'sleeve_R':3000,'legs_shoes':5000}
ASSUMPTIONS=[
 '体は全高1m。prepareの関節・寸法を1/0.8886438608倍する。',
 'body-normalized.blendはUV境界を持つ968768面。これと同じ形を溶接したprepareの968114面を用い、元の面を残す。外側面の抽出はしない。',
 '旧頭のラベル0・1だけを除く。体の首ラベル2と襟は残す。',
 '頭の位置と大きさは工程5の等方スケールと並進のまま。切断面は体の首上端から10mm下を初期値とし、元の頭の下端より下へは延長しない。',
 '首・胴の共通部分を胴の予算に含める。髪とキャップは同じ頭の面にVoxelで統合し、髪の予算に含める。',
 '腕45度は胴の横からの角度。腕70度・肘90度は2回目と同じ回転。',
 '距離は150000面積標本と全頂点。生の双方向値と内部面を分けた値を併記する。厳密なHausdorff距離ではない。',
 '高→低の内部面は、元の面から8方向すべてが遮蔽され、低密度の全体まで1mmを超える点とする。全体まで1mm以内なら2回目と同じ部位の対応違いへ分ける。',
 '首の切断閉鎖面も生の距離に含め、隠れた点を内部面として分類する。元の高密度面との比較に外側抽出メッシュは使わない。',
 '手は生成の形のまま。指の独立やピースの完成はこの工程の合否に含めない。',
 '脚の仮の関節位置は2回目と同じ断面による推定。']


def rigid(o,bone,ids=None):
    rigid2(o,bone,None if ids is None else [int(i) for i in ids])


def face_attr(o,name,values):
    a=o.data.attributes.get(name) or o.data.attributes.new(name,'INT','FACE')
    a.data.foreach_set('value',np.asarray(values,np.int32))


def transfer_labels(o,source,name):
    print('LABEL3',o.name,flush=True)
    tree=bvh(source);labels=attr(source,name);p=coords(o);f=triangles(o)
    result=np.array([labels[tree.find_nearest(Vector(c))[2]] for c in p[f].mean(1)],np.int32)
    face_attr(o,name,result)
    return result


def main_shell(o):
    bm=bmesh.new();bm.from_mesh(o.data);seen=set();components=[]
    for v in bm.verts:
        if v in seen:continue
        seen.add(v);stack=[v];vs=[]
        while stack:
            q=stack.pop();vs.append(q)
            for e in q.link_edges:
                a=e.other_vert(q)
                if a not in seen:seen.add(a);stack.append(a)
        components.append(vs)
    components.sort(key=len,reverse=True)
    removed=[];drop=[]
    for vs in components[1:]:
        p=np.array([tuple(v.co) for v in vs]);removed.append({'vertices':len(vs),'bounds_m':[p.min(0).tolist(),p.max(0).tolist()]})
        drop.extend(vs)
    if drop:bmesh.ops.delete(bm,geom=drop,context='VERTS')
    bm.to_mesh(o.data);bm.free();o.data.update()
    return removed


def voxel(o,size):
    print('VOXEL3',o.name,size,flush=True)
    o.vertex_groups.clear();activate(o)
    m=o.modifiers.new('Closed surface from original volume','REMESH');m.mode='VOXEL';m.voxel_size=size
    m.use_smooth_shade=True;m.use_remove_disconnected=False
    bpy.ops.object.modifier_apply(modifier=m.name);recalc(o,True)
    print('VOXEL3 AUDIT',o.name,len(triangles(o)),flush=True)
    before=topology(o);removed=main_shell(o);recalc(o,True);after=topology(o)
    write(OUT/(o.name+'-voxel.json'),{'voxel_size_m':size,'before_shell_removal':before,'removed_components':removed,'after':after})
    if after['boundary_edges'] or after['edges_shared_by_3_or_more_faces'] or after['connected_components']!=1:
        raise RuntimeError('Voxel result must be one closed manifold: '+o.name)
    return {'voxel_size_m':size,'before_shell_removal':before,'removed_components':removed,'after':after}


def collapse_mask(o,target,weights):
    activate(o);g=o.vertex_groups.get('collapse_mask') or o.vertex_groups.new(name='collapse_mask')
    g.remove(list(range(len(o.data.vertices))))
    for w in np.unique(weights):
        if w>0:g.add(np.flatnonzero(weights==w).tolist(),float(w),'REPLACE')
    m=o.modifiers.new('Regional Collapse without splitting seams','DECIMATE');m.decimate_type='COLLAPSE'
    m.ratio=max(.00001,min(1,target/len(triangles(o))));m.use_collapse_triangulate=True
    m.vertex_group=g.name;m.vertex_group_factor=1.
    bpy.ops.object.modifier_apply(modifier=m.name);recalc(o,True)


def protect_joints(o,weights,j,head=False):
    p=coords(o)
    if head:
        for cx in [-.048,.048]:
            eye=(p[:,1]<-.06)&(((p[:,0]-cx)/.035)**2+((p[:,2]-.813)/.03)**2<1)
            weights[eye&(weights>0)]=.12
        detail=(p[:,1]<-.09)&(abs(p[:,0])<.04)&(p[:,2]>.735)&(p[:,2]<.82)
        weights[detail&(weights>0)]=.25
    else:
        for side in ['L','R']:
            for name,radius,w in [('shoulder',.045,.35),('elbow',.04,.2),('wrist',.025,.4)]:
                mask=np.linalg.norm(p-j[name+'_'+side],axis=1)<radius
                weights[mask&(weights>0)]=np.minimum(weights[mask&(weights>0)],w)
        # Knee/ankle neighborhoods are inferred from the same limb sections as
        # the temporary skeleton, without changing any surface coordinates.
        for sign in [-1,1]:
            q=p[(p[:,0]*sign>0)&(p[:,2]<.36)]
            if len(q):
                z0,z1=np.quantile(q[:,2],[.05,.95])
                for t in [.52,.12]:
                    mask=(p[:,0]*sign>0)&(abs(p[:,2]-(z0+(z1-z0)*t))<.025)
                    weights[mask&(weights>0)]=np.minimum(weights[mask&(weights>0)],.35)
    return weights


def reduce_regions(source,reference,name,attribute,targets,j):
    # Collapse operates on one closed surface. Region rim vertices may collapse
    # with each other; zero weights lock only vertices outside the region. No
    # geometric cut is introduced at a semantic label boundary.
    print('REDUCE3',name,flush=True)
    trial=clone(source,name);initial=max(sum(targets.values())*10,500000)
    # Leave enough faces for every region before enforcing its own budget.
    # A strong global joint cost otherwise spends almost everything on elbows.
    collapse_mask(trial,initial,np.ones(len(trial.data.vertices)))
    transfer_labels(trial,reference,attribute)
    history=[]
    for pid,target in targets.items():
        for attempt in range(3):
            labels=attr(trial,attribute);f=triangles(trial);n=int((labels==pid).sum());total=len(f)
            if n<=target+40:break
            weights=np.zeros(len(trial.data.vertices));weights[np.unique(f[labels==pid])]=1
            protect_joints(trial,weights,j,attribute=='part2')
            collapse_mask(trial,total-(n-target),weights)
            transfer_labels(trial,reference,attribute)
            newer=int((attr(trial,attribute)==pid).sum())
            history.append({'part':pid,'before':n,'target':target,'after':newer})
            if newer==n:break
    counts=Counter(attr(trial,attribute));top=topology(trial)
    print('REGIONAL',name,dict(counts),top,flush=True)
    write(OUT/(name+'-allocation.json'),{'initial_target':initial,'history':history,'counts':{int(k):int(v) for k,v in counts.items()},'topology':top})
    return trial


def neck_measure(body,labels,head,j):
    p=coords(body);f=triangles(body);q=p[np.unique(f[labels==2])];hp=coords(head)
    upper=float(q[:,2].max());lower=float(hp[:,2].min())
    cut=max(lower+.0005,upper-.010)
    def radius(o,z,label=None):
        p=coords(o);f=triangles(o);v=p[f];mask=(v[:,:,2].min(1)<=z)&(v[:,:,2].max(1)>=z)
        if label is not None:mask &= labels==label
        intersections=[]
        for tri in v[mask]:
            for a,b in zip(tri,np.roll(tri,-1,axis=0)):
                if (a[2]-z)*(b[2]-z)<=0 and abs(b[2]-a[2])>1e-10:
                    intersections.append(a+(b-a)*((z-a[2])/(b[2]-a[2])))
        if not intersections:return {'samples':0}
        pp=np.array(intersections);center=np.median(pp[:,:2],0);rr=np.linalg.norm(pp[:,:2]-center,axis=1)*1000
        return {'samples':len(pp),'center_xy_m':center.tolist(),'radius_p05_p50_p95_mm':np.percentile(rr,[5,50,95]).tolist(),'xy_bounds_m':[pp[:,:2].min(0).tolist(),pp[:,:2].max(0).tolist()]}
    z=(upper+cut)/2
    return {'source_body_neck_z_min_m':float(q[:,2].min()),'source_body_neck_top_m':upper,'source_head_bottom_m':lower,'cut_plane_m':cut,'overlap_m':upper-cut,'radius_section_z_m':z,'body_neck_section':radius(body,z,2),'head_neck_section':radius(head,z),'source_head_available_overlap_m':upper-lower,'head_transform_changed':False}


def prepare_geometry(out):
    body,labels,head,cap,j,lm,raw=source_inputs(out)
    assert len(triangles(body))==968114
    # The labeled source is the welded version of the normalized original, not
    # the exterior-only meshes from lowpoly2. Keep skin neck and the full collar.
    highbody=subset(body,~np.isin(labels,[0,1]),'high3_body_original')
    highhead=clone(head,'high3_head_original');highcap=clone(cap,'high3_cap_original');recalc(highcap,True)
    hl=head_hair_labels(head_colors(head),coords(head)[triangles(head)].mean(1)).astype(np.int32)
    face_attr(highhead,'part2',hl);face_attr(highcap,'part2',np.ones(len(triangles(highcap)),np.int32))
    neck=neck_measure(body,labels,head,j);write(out/'neck-measurements.json',neck)
    b=clone(highbody,'voxel3_body');bt=voxel(b,.0015);transfer_labels(b,highbody,'part_id')
    h=clone(highhead,'voxel3_head');c=clone(highcap,'voxel3_cap_input');activate(h);c.select_set(True);bpy.ops.object.join()
    # Voxel closes the cut automatically; do not patch each open source rim
    # individually on the original nonmanifold generated mesh.
    print('CUT3 head',flush=True)
    bm=bmesh.new();bm.from_mesh(h.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,neck['cut_plane_m']),plane_no=(0,0,1),dist=1e-7,clear_inner=True)
    bm.to_mesh(h.data);bm.free();h.data.update()
    cut={'plane_z_m':neck['cut_plane_m'],'method':'bisect before Voxel; Voxel closes planar cut'}
    ht=voxel(h,.001);transfer_labels(h,highhead,'part2')
    # The cap's material belongs to hair; nearest original head labels remain
    # well defined on the outer result because the cap is inset.
    lowbody=reduce_regions(b,highbody,'low3_body','part_id',BODY_TARGET,j)
    lowhead=reduce_regions(h,highhead,'candidate3_head_voxel','part2',HEAD_TARGET,j)
    construction={'voxel':{'body':bt,'head':ht},'decimated_voxel':{'body':topology(lowbody),'head':topology(lowhead)},'neck':neck,'head_cut':cut,
        'original_body_triangles':len(triangles(body)),'normalized_file_unwelded_triangles':len(triangles(raw)),
        'original_body_labels':dict(Counter(map(int,labels)))}
    write(out/'construction.json',construction)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'candidate-checkpoint.blend'))
    write(out/'joints.json',{k:v.tolist() for k,v in j.items()})
    return lowbody,lowhead,highbody,highhead,highcap,b,h,j,body,labels


def attach_armature(o,rig):
    o.parent=rig
    mod=next((m for m in o.modifiers if m.type=='ARMATURE'),None) or o.modifiers.new('Temporary pose deformation','ARMATURE')
    mod.object=rig;mod.use_deform_preserve_volume=True


def semantic_vertices(o,name):
    labels=attr(o,name);f=triangles(o);p=coords(o)
    # Face-center labels are authoritative; nearest face avoids the overlap of
    # vertex groups on a shared region seam when applying rigid overrides.
    tree=bvh(o)
    return np.array([labels[tree.find_nearest(Vector(v))[2]] for v in p],np.int32)


def assign_overrides(body,head,rig,neck):
    bones={b.name for b in rig.data.bones};p=coords(body);ids=semantic_vertices(body,'part_id')
    collar=(ids==3)&(p[:,2]>.642)&(abs(p[:,0])<.089)
    frozen=np.isin(ids,[8,9])|collar
    rigid(body,'spine.chest',np.flatnonzero(frozen))
    skin=np.flatnonzero((ids==2)&~frozen)
    if len(skin):
        rigid(body,'spine.chest',skin)
        t=np.clip((p[skin,2]-neck['source_body_neck_z_min_m'])/(neck['source_body_neck_top_m']-neck['source_body_neck_z_min_m']),0,1)
        t=t*t*(3-2*t)
        for i,w in zip(skin,t):
            body.vertex_groups['spine.chest'].add([int(i)],float(1-w),'REPLACE')
            body.vertex_groups['head'].add([int(i)],float(w),'REPLACE')
    rigid(head,'head');attach_armature(head,rig)
    return {'collar_vertices':int(collar.sum()),'strap_bag_collar_vertices':int(frozen.sum()),'neck_skin_vertices':len(skin),'neck_blend':'smoothstep height chest -> head; no neck weight',
        'collar_policy':'torso label above z=.642 and |x|<.089; straps and backpack all chest=1',
        'rigid_neck_head_leak_vertices':sum(any(body.vertex_groups[g.group].name in ['neck','head'] and g.weight>1e-6 for g in body.data.vertices[int(i)].groups) for i in np.flatnonzero(frozen))}


def smooth_joint_weights(body,j,repeat=8):
    activate(body);p=coords(body);selected=np.zeros(len(p),bool)
    for side in ['L','R']:
        for key,radius in [('shoulder',.075),('elbow',.065),('wrist',.035)]:
            selected|=np.linalg.norm(p-j[key+'_'+side],axis=1)<radius
    for v,flag in zip(body.data.vertices,selected):v.select=bool(flag)
    body.data.use_paint_mask_vertex=True
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM',factor=.6,repeat=repeat,expand=0.)
    bpy.ops.object.mode_set(mode='OBJECT');body.data.use_paint_mask_vertex=False


def normalize(o):
    activate(o)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='BONE_DEFORM',limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM',lock_active=False)


def set_hand_boundaries(body,j):
    p=coords(body);f=triangles(body);labels=attr(body,'part_id');report={}
    for side,pid,sleeve,sign in [('L',6,4,1),('R',7,5,-1)]:
        axis=j['middle_tip_'+side]-j['wrist_'+side];axis/=np.linalg.norm(axis)
        t=(p-j['wrist_'+side])@axis
        skin=np.unique(f[labels==pid]);cut=float(np.quantile(t[skin],.01)-.002)
        near=np.zeros(len(p),bool);near[np.unique(f[np.isin(labels,[pid,sleeve])])]=True
        ids=np.flatnonzero(near&(t>=cut)&(p[:,0]*sign>.13))
        g=body.vertex_groups['hand_'+side];g.lock_weight=False
        g.remove(list(range(len(p))));g.add(ids.tolist(),1.,'REPLACE');g.lock_weight=True
        report[side]={'axis_from_wrist':axis.tolist(),'group_cut_projection_m':cut,
            'original_skin_projection_p01_m':float(np.quantile(t[skin],.01)),
            'inside_cuff_offset_mm':2.,'group_vertices':len(ids),'surface_split':False,
            'policy':'replacement vertex group starts 2mm proximal to generated skin boundary; surface remains closed'}
    return report


def make_weights(body,head,original,labels,j,neck,out):
    # Generate the same bones as lowpoly2, then try heat diffusion on the
    # actual closed decimated body before considering any proxy.
    rig=make_rig(j,original,labels,out);bones={b.name for b in rig.data.bones}
    for o in [body,head]:
        o.vertex_groups.clear()
        for name in bones:o.vertex_groups.new(name=name)
    activate(body);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    failure=None
    try:bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as e:failure=str(e)
    direct=weight_audit(body,bones)
    if direct['unweighted_vertices'] or failure:
        # Only this path uses the second pass's 8mm closed heat proxy.
        from lowpoly2 import weights
        for g in body.vertex_groups:g.lock_weight=False
        for mod in list(body.modifiers):
            if mod.type=='ARMATURE':body.modifiers.remove(mod)
        proxy,report=weights([body],original,rig,out)
        method='proxy fallback';fallback=report
    else:method='Automatic Weights directly on decimated closed body';fallback=None
    attach_armature(body,rig)
    # Semantic replacement groups are locked so normalization affects bones only.
    ll=attr(body,'part_id');names={k:('hand_L' if k==6 else 'hand_R' if k==7 else 'label_'+v) for k,v in PARTS.items()}
    labels_to_groups(body,ll,names)
    labels_to_groups(head,attr(head,'part2'),{0:'label_face_head',1:'label_hair'})
    for o in [body,head]:
        for g in o.vertex_groups:g.lock_weight=g.name not in bones
    hand_boundaries=set_hand_boundaries(body,j)
    smooth_joint_weights(body,j)
    overrides=assign_overrides(body,head,rig,neck)
    for o in [body,head]:normalize(o)
    report={'hand_boundaries':hand_boundaries,'method':method,'direct_attempt':direct,'direct_exception':failure,'fallback':fallback,
        'joint_smooth':{'factor':.6,'repeat':8,'shoulder_radius_m':.075,'elbow_radius_m':.065,'wrist_radius_m':.035,'mesh_vertices_moved':False},
        'overrides':overrides,'objects':{o.name:weight_audit(o,bones) for o in [body,head]}}
    write(out/'weights.json',report);return rig,report


def neck_after_reduction(body,head,cut):
    p=coords(body);f=triangles(body);ids=np.unique(f[attr(body,'part_id')==2]);hp=coords(head)
    top=float(p[ids,2].max());bottom=float(hp[:,2].min())
    return {'body_skin_neck_top_m':top,'head_bottom_m':bottom,'actual_vertical_overlap_m':top-bottom,
        'body_neck_vertices':len(ids),'head_cut_band_vertices':int((hp[:,2]<cut+.002).sum())}


def get_pose_metrics(lows,rig):
    from lowpoly3_measure import deformation
    rest={o.name:coords(o) for o in lows};reports={}
    for pose in POSES:
        print('POSE3',pose,flush=True);set_pose(rig,pose);reports[pose]=deformation(lows,rest)
    reset_pose(rig);return reports


def refine_problem_weights(body,head,rig,j,neck,initial):
    bones={b.name for b in rig.data.bones};p=coords(body);selected=np.zeros(len(p),bool);joints=set()
    for pose,report in initial.items():
        r=report[body.name]
        if not (r['flipped_faces_against_transported_rest_normal'] or r['edges_over_2x_rest_length']):continue
        if pose.startswith('arm_'):
            side=pose.split('_')[1]
            joints.update(['shoulder_'+side,'elbow_'+side,'wrist_'+side])
        elif pose.startswith('spine_'):joints.update(['spine_lower','spine_mid','spine_upper'])
        elif pose.startswith('neck_'):joints.update(['neck_base','head_pivot'])
    if not joints:return None
    for key in joints:
        radius=.07 if key.startswith(('elbow','shoulder')) else .045
        selected|=np.linalg.norm(p-j[key],axis=1)<radius
    activate(body)
    for v,flag in zip(body.data.vertices,selected):v.select=bool(flag)
    body.data.use_paint_mask_vertex=True;bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM',factor=.65,repeat=20,expand=0.)
    bpy.ops.object.mode_set(mode='OBJECT');body.data.use_paint_mask_vertex=False
    overrides=assign_overrides(body,head,rig,neck)
    for o in [body,head]:normalize(o)
    return {'joints':sorted(joints),'factor':.65,'repeat':20,'selected_vertices':int(selected.sum()),'mesh_vertices_moved':False,'overrides':overrides,'objects':{o.name:weight_audit(o,bones) for o in [body,head]}}


def allocation_check(body,head):
    counts={name:int((attr(body,'part_id')==pid).sum()) for pid,name in PARTS.items()}
    counts.update({name:int((attr(head,'part2')==pid).sum()) for pid,name in [(0,'face_head'),(1,'hair')]})
    total=sum(counts.values());checks={k:{'triangles':counts[k],'minimum':v,'pass':counts[k]>=v} for k,v in LIMITS.items()}
    checks['torso_including_neck']={'triangles':counts['torso']+counts['neck'],'minimum':8000,'pass':counts['torso']+counts['neck']>=8000}
    checks['shoulder_straps']={'triangles':counts['shoulder_straps'],'maximum':3000,'pass':counts['shoulder_straps']<=3000}
    return counts,checks,total


def preview_head(out,candidate,original,cap,studio,render):
    from geometry import material
    cam=studio();scene=bpy.context.scene;scene.render.film_transparent=True
    scene.render.resolution_x=scene.render.resolution_y=720;scene.eevee.taa_render_samples=16
    clay=material('Head candidate white',(.70,.70,.70),.82)
    objects=[candidate,original,cap];saved={o.name:list(o.data.materials) for o in objects}
    for o in objects:
        if not o.data.materials:o.data.materials.append(clay)
        for i in range(len(o.data.materials)):o.data.materials[i]=clay
    for label,objs in [('original',[original,cap]),('voxel',[candidate])]:
        visible(objs)
        for angle in [0,25]:
            a=math.radians(angle);target=Vector((0,-.05,.815))
            render(out,cam,f'face-{label}-{angle}.png',target+Vector((2*math.sin(a),-2*math.cos(a),0)),target,.235)
    for o in objects:
        for i,m in enumerate(saved[o.name]):o.data.materials[i]=m
    return cam


def finish(out,studio,render,prepared=None):
    from lowpoly3_measure import head_gate,measure_all
    if prepared is None:
        bpy.ops.wm.open_mainfile(filepath=str(out/'candidate-checkpoint.blend'))
        body=bpy.data.objects['low3_body'];candidate=bpy.data.objects['candidate3_head_voxel']
        hb=bpy.data.objects['high3_body_original'];hh=bpy.data.objects['high3_head_original'];hc=bpy.data.objects['high3_cap_original']
        original=bpy.data.objects['reference_labeled_body'];labels=attr(original,'part_id')
        j={k:np.array(v) for k,v in json.loads((out/'joints.json').read_text()).items()}
    else:body,candidate,hb,hh,hc,vb,vh,j,original,labels=prepared
    construction=json.loads((out/'construction.json').read_text());neck=construction['neck']
    construction['decimated_voxel']={'body':topology(body),'head':topology(candidate)}
    body_sparse=any(int((attr(body,'part_id')==pid).sum())<target*.8 for pid,target in BODY_TARGET.items())
    head_sparse=any(int((attr(candidate,'part2')==pid).sum())<target*.8 for pid,target in HEAD_TARGET.items())
    if head_sparse:
        old=candidate;candidate=reduce_regions(bpy.data.objects['voxel3_head'],hh,'reallocated3_voxel_head','part2',HEAD_TARGET,j)
        old.name='rejected3_voxel_head_initial';candidate.name='candidate3_head_voxel'
    construction['decimated_voxel']={'body':topology(body),'head':topology(candidate)}
    gate=head_gate(hh,candidate,hc,neck['cut_plane_m'],out)
    cam=preview_head(out,candidate,hh,hc,studio,render)
    if body_sparse:
        old=body;body=reduce_regions(bpy.data.objects['voxel3_body'],hb,'reallocated3_body','part_id',BODY_TARGET,j)
        old.name='rejected3_body_initial';body.name='low3_body'
    visual_reject=False
    decision=out/'head-visual-decision.json'
    if decision.exists():
        d=json.loads(decision.read_text())
        visual_reject=d.get('voxel_eye_recess_pass') is False and d.get('candidate_triangles')==len(triangles(candidate))
    if gate['distance_pass'] and not visual_reject:
        head=clone(candidate,'low3_head');selection='Voxel 1.0mm + regional Collapse'
        reason='Face original-source P95 after internal-sheet classification <=0.3mm in both directions; visual eye check remains required.'
    else:
        # The fallback is deliberately restricted to the authorized original
        # Collapse method. Do not attempt another remesher or shape fit.
        from lowpoly2 import split_surface_fans
        from lowpoly import clean
        raw=clone(hh,'collapse3_head_source')
        from lowpoly2 import visible_exterior
        fallback_cleanup={'exterior_classification':visible_exterior(raw)}
        fallback_cleanup['clean']=clean(raw,False)
        fallback_cleanup['split_fans']=split_surface_fans(raw)
        fallback_cleanup['unrelated_holes_filled']=False
        transfer_labels(raw,hh,'part2')
        write(out/'head-fallback-cleanup.json',fallback_cleanup)
        # Join the generated cap only after reducing the original head surface.
        head=reduce_regions(raw,hh,'low3_head','part2',{0:9600,1:7600},j)
        cut_and_cap(head,neck['cut_plane_m'])
        cap=clone(hc,'collapse3_cap')
        collapse_mask(cap,600,np.ones(len(cap.data.vertices)))
        face_attr(cap,'part2',np.ones(len(cap.data.polygons),np.int32));activate(head);cap.select_set(True);bpy.ops.object.join();recalc(head,True)
        fallback_cleanup['after_collapse_clean']=clean(head,False,weld=False)
        write(out/'head-fallback-cleanup.json',fallback_cleanup)
        selection='original surface Collapse fallback'
        reason=('Voxel eye-recess enlargement failed the visual criterion.' if visual_reject else 'Voxel candidate exceeds the 0.3mm face P95 gate.')+' Original surface Collapse retained; open boundaries are reported, not hidden.'
    gate.update({'selected':selection,'reason':reason});write(out/'head-selection.json',gate)
    counts,checks,total=allocation_check(body,head)
    retries=[]
    for attempt in range(4):
        bad=[k for k,v in checks.items() if not v['pass']]
        if not bad:break
        targets=BODY_TARGET.copy()
        for pid,name in PARTS.items():
            minimum=LIMITS.get(name,0)
            if counts[name]<minimum:targets[pid]=int(targets[pid]*1.3**(attempt+1))
        if counts['shoulder_straps']>3000:targets[9]=max(1600,2500-attempt*200)
        if any(k not in ['face_head','hair'] for k in bad):
            old=body;body=reduce_regions(bpy.data.objects['voxel3_body'],hb,'allocation_retry_body','part_id',targets,j)
            old.name='rejected3_body_'+str(attempt);body.name='low3_body'
        if any(k in ['face_head','hair'] for k in bad) and gate['distance_pass']:
            old=head;head=reduce_regions(bpy.data.objects['voxel3_head'],hh,'allocation_retry_head','part2',{0:10000+attempt*1000,1:8500+attempt*500},j)
            old.name='rejected3_head_'+str(attempt);head.name='low3_head'
        counts,checks,total=allocation_check(body,head);retries.append({'attempt':attempt+1,'counts':counts,'checks':checks})
    construction['allocation_retries']=retries
    write(out/'construction.json',construction)
    write(out/'allocation-check.json',{'counts':counts,'checks':checks,'total':total})
    rig,wr=make_weights(body,head,original,labels,j,neck,out);lows=[body,head]
    poses=get_pose_metrics(lows,rig);write(out/'poses-initial.json',poses)
    refinement=refine_problem_weights(body,head,rig,j,neck,poses)
    if refinement:
        wr['problem_joint_refinement']=refinement
        poses=get_pose_metrics(lows,rig)
    write(out/'weights.json',wr)
    write(out/'poses-metrics.json',poses)
    construction['neck']['after_reduction']=neck_after_reduction(body,head,neck['cut_plane_m'])
    write(out/'construction.json',construction)
    # Save before distance sampling/rendering so every subsequent measurement
    # can be repeated against the same geometry and weights.
    reset_pose(rig);visible(lows)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'geometry-checkpoint.blend'))
    metrics=measure_all(out,lows,[hb,hh],hc,neck['cut_plane_m'])
    metrics.update({'stage':'lowpoly3','construction':construction,'head_selection':gate,'weights':wr,'poses':poses,
        'topology':{'body':topology(body),'head':topology(head)},'part_allocation':checks,
        'triangle_budget':{'target':50000,'limit':60000,'reserved_later':5000,'current_limit_with_reserve':55000,'current_plus_reserved':total+5000,'pass':total+5000<=60000},
        'assumptions':ASSUMPTIONS,'acceptance':{'part_allocation':all(c['pass'] for c in checks.values()),'triangles':total+5000<=60000,'pose_visual':'pending','neck_visual':'pending','fragment_visual':'pending','face_visual':'pending'}})
    write(out/'metrics.json',metrics)
    from lowpoly3_render import render_all
    render_all(out,lows,[hb,hh,hc],rig,j,cam,render,candidate)
    reset_pose(rig);visible(lows)
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_set(o not in lows)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly3.blend'))
    verify_saved(out)
    import subprocess
    python=WORK/'img3d/venv/bin/python'
    subprocess.run([str(python),str(__import__('pathlib').Path(__file__).with_name('lowpoly3_review.py')),str(out)],check=True)


# Checkpoint resumes are for diagnostics. Normal --stage lowpoly3 always rebuilds
# all geometry unless a phase is explicitly requested in the environment.
def run(out,studio,render):
    global OUT;OUT=out
    start=time.time();phase=os.environ.get('LOWPOLY3_PHASE','all')
    if phase=='audit':audit_head(out,render)
    elif phase=='measure':remeasure(out)
    elif phase=='finish':finish(out,studio,render)
    else:
        prepared=prepare_geometry(out)
        if phase!='candidate':finish(out,studio,render,prepared)
    write(out/'runtime.json',{'phase':phase,'seconds':time.time()-start})
    print('LOWPOLY3 FINISHED',phase,flush=True)


def verify_saved(out):
    path=out/'character-lowpoly3.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    body=bpy.data.objects['low3_body'];head=bpy.data.objects['low3_head'];rig=bpy.data.objects['temporary_rig']
    bones={b.name for b in rig.data.bones};counts,checks,total=allocation_check(body,head)
    report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':counts,'total':total,
        'bone_count':len(bones),'pose_actions':[a.name for a in bpy.data.actions if a.name.startswith('lowpoly3_')],
        'topology':{o.name:topology(o) for o in [body,head]},
        'weights':{o.name:weight_audit(o,bones) for o in [body,head]},
        'hand_groups':{n:sum(any(body.vertex_groups[g.group].name==n and g.weight>.5 for g in v.groups) for v in body.data.vertices) for n in ['hand_L','hand_R']},
        'input_hashes_match':all(hashlib.sha256((WORK/k).read_bytes()).hexdigest()==v for k,v in json.loads((out/'inputs.json').read_text())['inputs_sha256'].items())}
    write(out/'saved-verification.json',report)
    verify_original_body(out)


def remeasure(out):
    from lowpoly3_measure import measure_all
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly3.blend'))
    m=json.loads((out/'metrics.json').read_text())
    lows=[bpy.data.objects[n] for n in ['low3_body','low3_head']]
    highs=[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original']]
    cap=bpy.data.objects['high3_cap_original']
    m.update(measure_all(out,lows,highs,cap,m['construction']['neck']['cut_plane_m']))
    from lowpoly3_measure import head_gate
    candidate=bpy.data.objects['candidate3_head_voxel']
    m['head_selection'].update(head_gate(highs[1],candidate,cap,m['construction']['neck']['cut_plane_m'],out))
    write(out/'head-selection.json',m['head_selection'])
    m['assumptions']=ASSUMPTIONS
    write(out/'metrics.json',m)
    import subprocess
    from pathlib import Path
    subprocess.run([str(WORK/'img3d/venv/bin/python'),str(Path(__file__).with_name('lowpoly3_review.py')),str(out)],check=True)


def audit_head(out,render):
    from lowpoly3_measure import head_gate
    from geometry import material
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly3.blend'))
    m=json.loads((out/'metrics.json').read_text())
    high=bpy.data.objects['high3_head_original'];cap=bpy.data.objects['high3_cap_original'];candidate=bpy.data.objects['candidate3_head_voxel']
    gate=head_gate(high,candidate,cap,m['construction']['neck']['cut_plane_m'],out)
    m['head_selection'].update(gate);write(out/'head-selection.json',m['head_selection']);write(out/'metrics.json',m)
    original=bpy.data.objects['high3_body_original'];cam=bpy.context.scene.camera
    clay=material('Original gap inspection',(.70,.70,.70),.82)
    for o in [original,high,cap]:
        for i in range(len(o.data.materials)):o.data.materials[i]=clay
    visible([original,high,cap])
    for angle,name in [(25,'front'),(155,'back')]:
        a=math.radians(angle);target=Vector((0,-.04 if name=='front' else .07,.56))
        render(out,cam,f'original-straps-{name}.png',target+Vector((2*math.sin(a),-2*math.cos(a),0)),target,.36)
    verify_original_body(out)
    j=json.loads((out/'joints.json').read_text())
    for side in ['L','R']:
        target=np.array(j['wrist_'+side]);a=math.radians(25)
        render(out,cam,f'original-hand-{side}.png',target+np.array((2*math.sin(a),-2*math.cos(a),0)),target,.16)


def verify_original_body(out):
    from mathutils.kdtree import KDTree
    raw=bpy.data.objects['reference_body_normalized'];prepared=bpy.data.objects['reference_labeled_body']
    bm=bmesh.new();bm.from_mesh(raw.data)
    height=json.loads((out/'inputs.json').read_text())['original_landmark_height']
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6/height)
    bm.verts.index_update();bm.faces.index_update()
    p=np.array([tuple(v.co) for v in bm.verts]);f=np.array([[v.index for v in face.verts] for face in bm.faces],np.int32);bm.free()
    q=coords(prepared);g=triangles(prepared);kd=KDTree(len(q))
    for i,point in enumerate(q):kd.insert(Vector(point),i)
    kd.balance();mapping=np.empty(len(p),np.int32);maximum=0.
    for i,point in enumerate(p):
        _,k,d=kd.find(Vector(point));mapping[i]=k;maximum=max(maximum,d)
    a=np.sort(mapping[f],axis=1);b=np.sort(g,axis=1)
    ia=np.lexsort((a[:,2],a[:,1],a[:,0]));ib=np.lexsort((b[:,2],b[:,1],b[:,0]))
    equal=a.shape==b.shape and np.array_equal(a[ia],b[ib])
    report={'normalized_file_triangles_before_weld':len(triangles(raw)),
        'normalized_file_triangles_after_weld':len(f),'prepare_triangles':len(g),
        'weld_distance_m':1e-6/height,'maximum_matching_vertex_distance_m':maximum,
        'triangle_vertex_sets_identical':bool(equal),'pass':bool(equal and maximum<1e-6)}
    write(out/'input-body-verification.json',report)
    if not report['pass']:raise RuntimeError('Original normalized body does not match welded prepare input')
