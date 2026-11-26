"""Stage 6 retry: operator-only Collapse surfaces and heat-weighted voxel proxy.

No authored surface coordinates, rings, eye openings or replacement fingers.
Bone coordinates are estimated rig controls, never mesh construction coordinates.
"""
import json, math, time
from collections import Counter, defaultdict
import bpy, bmesh, numpy as np
from mathutils import Vector, Matrix, Quaternion
from lowpoly import (WORK, source_inputs, coords, triangles, subset, append, activate,
                     clean, recalc, write, head_colors, head_hair_labels, bvh)
from lowpoly_cleanup import exterior_faces
from lowpoly_verify import topology, visible
from geometry import material


def split_surface_fans(o,min_faces=48,min_area=8e-6,remove_small=True):
    # All existing polygon corners (including diagnostic UVs) keep their order.
    # Distinct fans touching at a single vertex are split, not moved or remeshed.
    uv_name=o.data.uv_layers.active.name if o.data.uv_layers.active else 'UVMap'
    group_names=[g.name for g in o.vertex_groups]
    old_weights=[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices]
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.verts.index_update();bm.faces.index_update()
    # Face components are measured through edges. Tiny generated fragments have
    # no useful outer silhouette and prevent Collapse from reaching its budget.
    seen=set();drop=[];sizes=[]
    for start in bm.faces:
        if start in seen:continue
        seen.add(start);stack=[start];component=[];area=0.
        while stack:
            f=stack.pop();component.append(f);area+=f.calc_area()
            for e in f.edges:
                for q in e.link_faces:
                    if q not in seen:seen.add(q);stack.append(q)
        sizes.append((len(component),area))
        if remove_small and (len(component)<8 or (len(component)<min_faces and area<min_area)):drop.extend(component)
    if drop:bmesh.ops.delete(bm,geom=drop,context='FACES_ONLY')
    bm.verts.index_update();bm.faces.index_update();uvlayer=bm.loops.layers.uv.active
    face_attributes={name:[q[bm.faces.layers.int[name]] for q in bm.faces] for name in bm.faces.layers.int.keys() if not name.startswith('.')}
    if 'repair_cap' not in face_attributes:face_attributes['repair_cap']=[0]*len(bm.faces)
    p=np.array([tuple(v.co) for v in bm.verts]);f=np.array([[v.index for v in q.verts] for q in bm.faces],np.int32)
    uvs=np.array([[tuple(l[uvlayer].uv) for l in q.loops] for q in bm.faces]) if uvlayer else None
    mats=[q.material_index for q in bm.faces];materials=list(o.data.materials)
    bm.free()
    corner=np.arange(f.size,dtype=np.int32).reshape(-1,3)
    ed=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);ec=np.concatenate([corner[:,[0,1]],corner[:,[1,2]],corner[:,[2,0]]])
    rev=ed[:,0]>ed[:,1];ed[rev]=ed[rev,::-1];ec[rev]=ec[rev,::-1]
    order=np.lexsort((ed[:,1],ed[:,0]));ed=ed[order];ec=ec[order]
    starts=np.flatnonzero(np.r_[True,np.any(ed[1:]!=ed[:-1],axis=1)]);counts=np.diff(np.r_[starts,len(ed)])
    parent=np.arange(f.size,dtype=np.int32)
    def root(a):
        while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
        return a
    for k in starts[counts==2]:
        for a,b in zip(ec[k],ec[k+1]):
            ra=root(a);rb=root(b)
            if ra!=rb:parent[max(ra,rb)]=min(ra,rb)
    while True:
        newer=parent[parent]
        if np.array_equal(newer,parent):break
        parent=newer
    roots,inv=np.unique(parent,return_inverse=True);newp=p[f.ravel()[roots]];newf=inv.reshape(-1,3)
    mesh=bpy.data.meshes.new(o.name+'_manifold_fans');mesh.from_pydata(newp.tolist(),[],newf.tolist());mesh.update()
    for mat in materials:mesh.materials.append(mat)
    for face,mat in zip(mesh.polygons,mats):face.material_index=mat
    for name,values in face_attributes.items():
        attr=mesh.attributes.new(name,'INT','FACE');attr.data.foreach_set('value',values)
    if uvs is not None:
        layer=mesh.uv_layers.new(name=uv_name);layer.data.foreach_set('uv',uvs.ravel())
    o.data=mesh
    o.vertex_groups.clear()
    for name in group_names:o.vertex_groups.new(name=name)
    for new_id,old_id in enumerate(f.ravel()[roots]):
        for group,weight in old_weights[old_id]:o.vertex_groups[group].add([new_id],weight,'REPLACE')
    return {"dropped_fragment_faces":len(drop),"split_vertices":len(newp)-len(np.unique(f))}

def visible_exterior(o):
    """Keep every face exposed in the requested silhouette directions.

    Normal-only escape tests miss the visible sides of deep cloth folds.
    Outside visibility is therefore tested as well before discarding a face.
    """
    from mathutils.bvhtree import BVHTree
    p=coords(o);f=triangles(o);centers=p[f].mean(1)
    normal=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-20)
    tree=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)
    directions=[Vector((math.sin(a*math.pi/4),-math.cos(a*math.pi/4),0)) for a in range(8)]
    directions += [Vector((0,0,1)),Vector((0,0,-1))]
    origin=(p.min(0)+p.max(0))/2;keep=np.zeros(len(f),bool)
    for i,center in enumerate(centers):
        radial=Vector(center-origin).normalized()
        for direction in [Vector(normal[i]),Vector(-normal[i]),radial]+directions:
            hit,_,_,_=tree.ray_cast(Vector(center)+direction*.00002,direction,2.)
            if hit is None:keep[i]=True;break
    bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.flatnonzero(~keep)],context='FACES')
    bm.to_mesh(o.data);bm.free();o.data.update()
    return {'triangles_before':len(f),'enclosed_triangles_removed':int((~keep).sum()),
        'test':'normal +/- and radial escape, plus 8 horizontal silhouette directions and +/-Z; epsilon 20um'}


def clone(o, name):
    q=o.copy(); q.data=o.data.copy(); q.name=name
    bpy.context.collection.objects.link(q)
    return q


def labels_to_groups(o, labels, names):
    f=triangles(o)
    for pid,name in names.items():
        g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
        ids=np.unique(f[labels==pid]).tolist()
        if ids:g.add(ids,1.,'REPLACE')
        g.lock_weight=True


def group_counts(o):
    counts=Counter(g.group for v in o.data.vertices for g in v.groups if g.weight>1e-6)
    return {g.name:counts[g.index] for g in o.vertex_groups}


def decimate(o, target, protect):
    activate(o)
    g=o.vertex_groups.new(name='collapse_cost')
    # High costs allow ordinary areas to collapse first; protected areas retain
    # a nonzero cost so a noisy generated patch cannot block the whole budget.
    for w in np.unique(protect):
        g.add(np.flatnonzero(protect==w).tolist(),float(w),'REPLACE')
    before=len(triangles(o))
    mod=o.modifiers.new('Collapse generated surface','DECIMATE')
    mod.decimate_type='COLLAPSE';mod.ratio=min(1.,target/before)
    mod.use_collapse_triangulate=True;mod.vertex_group=g.name
    mod.vertex_group_factor=1.;mod.use_symmetry=False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    g=o.vertex_groups.get('collapse_cost');g.lock_weight=True
    recalc(o,True)
    return {'before':before,'target':target,'after':len(triangles(o)),
            'protection_costs':np.unique(protect).tolist(),'factor':1.}


def cut_and_cap(o,z):
    bm=bmesh.new();bm.from_mesh(o.data)
    result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        plane_co=(0,0,z),plane_no=(0,0,1),dist=1e-7,clear_inner=True)
    edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-z)<2e-6 for v in e.verts)]
    layer=bm.faces.layers.int.get('neck_cap') or bm.faces.layers.int.new('neck_cap')
    filled=bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces'] if edges else []
    fallback=False
    if edges and not filled:
        # An open generated contour may end at a preexisting hole. Make the
        # planar closure from its existing cut-rim vertices; no center or tube.
        pending=set(edges)
        while pending:
            first=pending.pop();component={first};stack=list(first.verts)
            while stack:
                v=stack.pop()
                for e in v.link_edges:
                    if e in pending:
                        pending.remove(e);component.add(e);stack.extend(e.verts)
            rim={v for e in component for v in e.verts}
            ends=[v for v in rim if sum(v in e.verts for e in component)==1]
            if len(ends)==2 and len(rim)>=3:
                connector=bm.edges.get(ends) or bm.edges.new(ends)
                component.add(connector)
            if len(rim)>=3:
                result=bmesh.ops.holes_fill(bm,edges=list(component),sides=0)
                filled.extend(result['faces'])
        fallback=True
    for f in filled:f[layer]=1
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free();o.data.update()
    return {'plane_z_m':z,'cut_boundary_edges':len(edges),'filled_polygons':len(filled),'closed_open_rim_chains_with_existing_endpoints':fallback,'unfilled_original_cut_edges':sum(e.is_boundary for e in edges if e.is_valid),
        'method':'bisect_plane + holes_fill + triangulate; only existing cut rim; no center vertex'}


def make_rig(j,body,labels,out):
    data=bpy.data.armatures.new('temporary_skeleton');rig=bpy.data.objects.new('temporary_rig',data)
    bpy.context.collection.objects.link(rig);activate(rig);bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,a,b,parent=None):
        q=data.edit_bones.new(name);q.head=Vector(a);q.tail=Vector(b)
        if parent:q.parent=data.edit_bones[parent]
        q.use_deform=True
        # Roll keeps local X close to the world X direction for auditability.
        q.align_roll(Vector((0,1,0)))
    bone('root',j['pelvis'],j['spine_lower'])
    bone('spine.lower',j['spine_lower'],j['spine_mid'],'root')
    bone('spine.upper',j['spine_mid'],j['spine_upper'],'spine.lower')
    bone('spine.chest',j['spine_upper'],j['neck_base'],'spine.upper')
    bone('neck',j['neck_base'],j['head_pivot'],'spine.chest')
    bone('head',j['head_pivot'],j['head_pivot']+(j['head_pivot']-j['neck_base'])*3,'neck')
    p=coords(body);f=triangles(body);legs=p[np.unique(f[labels==10])]
    inferred={}
    for side,sign in [('L',1),('R',-1)]:
        bone('shoulder.'+side,j['spine_upper'],j['shoulder_'+side],'spine.chest')
        bone('upper_arm.'+side,j['shoulder_'+side],j['elbow_'+side],'shoulder.'+side)
        bone('forearm.'+side,j['elbow_'+side],j['wrist_'+side],'upper_arm.'+side)
        bone('hand.'+side,j['wrist_'+side],j['middle_tip_'+side],'forearm.'+side)
        q=legs[legs[:,0]*sign>0]
        z0,z1=np.quantile(q[:,2],[.05,.95])
        def section(t):
            z=z0+(z1-z0)*t;s=q[abs(q[:,2]-z)<.008]
            c=np.median(s,0);c[2]=z;return c
        hip=section(.94);knee=section(.52);ankle=section(.12)
        toe=section(.04);toe[1]=np.quantile(q[q[:,2]<ankle[2],1],.05)
        bone('thigh.'+side,hip,knee,'root');bone('shin.'+side,knee,ankle,'thigh.'+side)
        bone('foot.'+side,ankle,toe,'shin.'+side)
        inferred[side]={'hip':hip.tolist(),'knee':knee.tolist(),'ankle':ankle.tolist(),'toe':toe.tolist()}
    bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
    write(out/'skeleton.json',{'inferred_legs':inferred,'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in data.bones}})
    return rig


def rigid(o, bone, ids=None):
    ids=list(range(len(o.data.vertices))) if ids is None else list(ids)
    for g in o.vertex_groups:
        if not g.lock_weight:g.remove(ids)
    g=o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone)
    g.add(ids,1.,'REPLACE')


def weights(lows,body,rig,out,voxel=.008):
    proxy=clone(body,'closed_voxel_weight_proxy');proxy.vertex_groups.clear()
    activate(proxy)
    mod=proxy.modifiers.new('Closed voxel proxy','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel
    mod.use_smooth_shade=True;mod.use_remove_disconnected=False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Generated internal shells can survive voxelization as small closed specks.
    # Heat diffusion has no bone inside those components, so retain the main
    # connected volume and smooth voxel stairs on the proxy only.
    bm=bmesh.new();bm.from_mesh(proxy.data);seen=set();components=[]
    for v in bm.verts:
        if v in seen:continue
        stack=[v];seen.add(v);component=[]
        while stack:
            q=stack.pop();component.append(q)
            for e in q.link_edges:
                a=e.other_vert(q)
                if a not in seen:seen.add(a);stack.append(a)
        components.append(component)
    components.sort(key=len,reverse=True)
    for component in components[1:]:bmesh.ops.delete(bm,geom=component,context='VERTS')
    bm.to_mesh(proxy.data);bm.free();proxy.data.update()
    activate(proxy);smooth=proxy.modifiers.new('Proxy stair smoothing','SMOOTH')
    smooth.factor=1.;smooth.iterations=5;bpy.ops.object.modifier_apply(modifier=smooth.name)
    recalc(proxy,True)
    proxy_top=topology(proxy)
    write(out/'proxy-topology.json',proxy_top)
    if proxy_top['boundary_edges'] or proxy_top['edges_shared_by_3_or_more_faces']:
        raise RuntimeError('Voxel proxy is not closed manifold')
    activate(proxy);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bone_names={b.name for b in rig.data.bones}
    nonzero=sum(any(g.weight>1e-8 for g in v.groups) for v in proxy.data.vertices)
    if nonzero!=len(proxy.data.vertices):raise RuntimeError('Automatic Weights left unweighted proxy vertices')
    reports={}
    for o in lows:
        for g in o.vertex_groups:
            if g.name not in bone_names:g.lock_weight=True
    for o in lows:
        activate(o);o.parent=rig
        arm=o.modifiers.new('Temporary pose deformation','ARMATURE');arm.object=rig;arm.use_deform_preserve_volume=True
        for name in bone_names:
            if not o.vertex_groups.get(name):o.vertex_groups.new(name=name)
        if o.name.startswith('low2_head') or o.name.startswith('low2_cap'):
            rigid(o,'head')
        else:
            mod=o.modifiers.new('Heat proxy vertex groups','DATA_TRANSFER');mod.object=proxy
            mod.use_vert_data=True;mod.data_types_verts={'VGROUP_WEIGHTS'};mod.vert_mapping='POLYINTERP_NEAREST'
            mod.layers_vgroup_select_src='ALL';mod.layers_vgroup_select_dst='NAME'
            mod.mix_mode='REPLACE';mod.mix_factor=1.
            bpy.ops.object.modifier_move_up(modifier=mod.name)
            bpy.ops.object.modifier_apply(modifier=mod.name)
            # The bag remains rigid; shoulder straps retain interpolated heat weights.
            label=o.vertex_groups.get('label_backpack')
            ids=[v.index for v in o.data.vertices if any(g.group==label.index and g.weight>.5 for g in v.groups)] if label else []
            attr=o.data.attributes.get('part_id')
            if attr:
                part_ids=np.empty(len(o.data.polygons),np.int32);attr.data.foreach_get('value',part_ids)
                ids=sorted(set(ids)|set(np.unique(triangles(o)[part_ids==8]).tolist()))
            if ids:rigid(o,'spine.chest',ids)
        if o.name=='low2_body':
            p=coords(o);selected=np.zeros(len(p),bool)
            lm=json.loads((WORK/'prepare/landmarks.json').read_text())
            for key in ['neck_base','head_pivot','shoulder_L','shoulder_R','elbow_L','elbow_R','wrist_L','wrist_R']:
                joint=np.array(lm['joints'][key])/lm['coordinates']['height']
                selected|=np.linalg.norm(p-joint,axis=1)<(.075 if key.startswith('shoulder') else .05)
            for v,flag in zip(o.data.vertices,selected):v.select=bool(flag)
            o.data.use_paint_mask_vertex=True
            bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
            bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM',factor=.6,repeat=8,expand=0.)
            bpy.ops.object.mode_set(mode='OBJECT');o.data.use_paint_mask_vertex=False
            if ids:rigid(o,'spine.chest',ids)
            # The retained jacket collar belongs to the chest; it must not be
            # pulled by the temporary head/neck weights after removing old skin.
            torso_group=o.vertex_groups['label_torso'].index
            strap_group=o.vertex_groups['label_shoulder_straps'].index
            collar=[v.index for v in o.data.vertices if p[v.index,2]>.656 and abs(p[v.index,0])<.085
                and any(g.group==torso_group and g.weight>.5 for g in v.groups)
                and not any(g.group==strap_group and g.weight>1e-6 for g in v.groups)]
            rigid(o,'spine.chest',collar)

        bpy.ops.object.vertex_group_limit_total(group_select_mode='BONE_DEFORM',limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM',lock_active=False)
        reports[o.name]=weight_audit(o,bone_names)
    proxy.hide_render=True;proxy.hide_set(True)
    report={'proxy_voxel_m':voxel,'proxy_topology':proxy_top,'proxy_components_removed':len(components)-1,'proxy_smooth_iterations':5,'automatic_weights_nonzero_vertices':nonzero,
        'mapping':'Nearest Face Interpolated / REPLACE 1.0','joint_weight_smooth':{'factor':.6,'repeat':8,'shoulder_radius_m':.075,'other_joint_radius_m':.05,'mesh_vertices_moved':False},'objects':reports}
    write(out/'weights.json',report)
    return proxy,report


def weight_audit(o,bones):
    names={g.index:g.name for g in o.vertex_groups};counts=[];sums=[]
    for v in o.data.vertices:
        a=[g.weight for g in v.groups if names[g.group] in bones and g.weight>1e-6]
        counts.append(len(a));sums.append(sum(a))
    return {'max_influences':max(counts),'unweighted_vertices':sum(x==0 for x in counts),
        'max_normalization_error':max(abs(x-1) for x in sums)}


POSES=['rest','neck_left30','neck_right30','neck_up20','neck_down20',
       'spine_left15','spine_right15','spine_forward15','arm_R_70_elbow90','arm_L_70_elbow90','arms_open45']


def reset_pose(rig):
    for p in rig.pose.bones:p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion()
    bpy.context.view_layer.update()


def turn_world(rig,name,axis,angle):
    p=rig.pose.bones[name]
    # Conjugate the requested world-axis rotation into this bone's current
    # parent frame. This avoids interpreting different limb rolls as angles.
    basis=p.bone.matrix_local.to_3x3()
    if p.parent:
        parent_rotation=p.parent.matrix.to_3x3() @ p.parent.bone.matrix_local.to_3x3().inverted()
        axis=parent_rotation.inverted() @ Vector(axis)
    local=basis.inverted() @ Vector(axis)
    p.rotation_quaternion=Quaternion(local,math.radians(angle))
    bpy.context.view_layer.update()


def set_pose(rig,name):
    reset_pose(rig)
    if name.startswith('neck_'):
        axis=(0,0,1) if '30' in name else (1,0,0)
        angle=30 if 'left' in name else -30
        if '20' in name:angle=-20 if 'up' in name else 20
        turn_world(rig,'neck',axis,angle)
    elif name.startswith('spine_'):
        angle=15 if 'left' in name else -15
        axis=(0,0,1)
        if 'forward' in name:axis=(1,0,0);angle=15
        for b in ['spine.lower','spine.upper','spine.chest']:turn_world(rig,b,axis,angle/3)
    elif name.startswith('arm_'):
        side=name.split('_')[1]
        turn_world(rig,'upper_arm.'+side,(1,0,0),-70)
        # The local forearm flexion rotates toward the viewer in its parent's
        # frame; wrist rotation aligns the measured palm normal with -Y.
        p=rig.pose.bones['forearm.'+side];p.rotation_quaternion=Quaternion(p.bone.matrix_local.to_3x3().inverted()@Vector((1,0,0)),math.radians(-90))
        bpy.context.view_layer.update()
        hand=rig.pose.bones['hand.'+side]
        rest_direction=(hand.bone.tail_local-hand.bone.head_local).normalized()
        rest_normal=Vector((0,1,0)).cross(rest_direction).normalized()*(1 if side=='L' else -1)
        palm=hand.matrix.to_3x3() @ hand.bone.matrix_local.to_3x3().inverted() @ rest_normal
        axis=(hand.tail-hand.head).normalized();target=Vector((0,-1,0))
        a=(palm-axis*palm.dot(axis)).normalized();b=(target-axis*target.dot(axis)).normalized()
        angle=math.atan2(axis.dot(a.cross(b)),a.dot(b))
        hand.rotation_quaternion=Quaternion((0,1,0),angle);bpy.context.view_layer.update()
    elif name=='arms_open45':
        for side,sgn in [('L',1),('R',-1)]:
            bone=rig.data.bones['upper_arm.'+side]
            d=bone.tail_local-bone.head_local
            rest_angle=math.degrees(math.atan2(abs(d.x),-d.z))
            turn_world(rig,'upper_arm.'+side,(0,1,0),-sgn*(45-rest_angle))


def evaluated(o):
    deps=bpy.context.evaluated_depsgraph_get();q=o.evaluated_get(deps);m=q.to_mesh()
    p=np.array([tuple(v.co) for v in m.vertices]);q.to_mesh_clear();return p


def pose_metrics(lows,rig):
    from lowpoly2_measure import deformation
    rest={o.name:coords(o) for o in lows};reports={}
    for pose in POSES:
        set_pose(rig,pose);reports[pose]=deformation(lows,rest)
    reset_pose(rig);return reports


def run(out,studio,render):
    start=time.time();body,labels,head,cap,j,lm,raw=source_inputs(out)
    names={pid:('hand_'+s if pid in [6,7] else 'label_'+name) for pid,name,s in [
        (2,'neck',''),(3,'torso',''),(4,'sleeve_L',''),(5,'sleeve_R',''),(6,'hand_L','L'),(7,'hand_R','R'),(8,'backpack',''),(9,'shoulder_straps',''),(10,'legs_shoes','')]}
    # Labels are copied before any reduction, including shared seam vertices.
    labels_to_groups(body,labels,names)
    for pid in [6,7]:labels_to_groups(body,labels,{pid:'label_'+('hand_L' if pid==6 else 'hand_R')})
    highbody=subset(body,~np.isin(labels,[0,1,2]),'high2_body_full')
    raw_head=clone(head,'high2_head_full');raw_cap=clone(cap,'high2_cap_full')
    rgb=head_colors(raw_head);p=coords(raw_head);f=triangles(raw_head)
    hl=head_hair_labels(rgb,p[f].mean(1)).astype(np.int32)
    attr=raw_head.data.attributes.new('part2','INT','FACE');attr.data.foreach_set('value',hl)
    labels_to_groups(raw_head,hl,{0:'label_face_head',1:'label_hair'})
    extbody=clone(highbody,'high2_body_exterior');exthead=clone(raw_head,'high2_head_exterior')
    cleanup={}
    for o in [extbody,exthead]:
        print('EXTERIOR',o.name,flush=True);cleanup[o.name]=visible_exterior(o)
    lowbody=clone(extbody,'low2_body');lowhead=clone(exthead,'low2_head');lowcap=clone(cap,'low2_cap')
    for o in [lowbody,lowhead,lowcap]:
        cleanup[o.name]=clean(o,False)
        cleanup[o.name]['split_fans']=split_surface_fans(o)
    before={o.name:group_counts(o) for o in [lowbody,lowhead]}
    p=coords(lowbody);cost=np.ones(len(p))
    # Keep the collar and sleeve cuffs detailed without replacing their shape.
    protect=(p[:,2]>.687)&(p[:,2]<.704)&(abs(p[:,0])<.085)
    for label,value in [('label_torso',.9),('label_shoulder_straps',.9),('label_legs_shoes',1.),('label_hand_L',.9),('label_hand_R',.9)]:
        gi=lowbody.vertex_groups[label].index
        ids=[v.index for v in lowbody.data.vertices if any(g.group==gi and g.weight>.5 for g in v.groups)]
        cost[ids]=value
    for side in ['L','R']:
        w=j['wrist_'+side];protect|=np.linalg.norm(p-w,axis=1)<.025
    cost[protect]=.2
    print('COLLAPSE body',flush=True);reductions={'body':decimate(lowbody,28500,cost)}
    p=coords(lowhead);hair_ids=lowhead.vertex_groups['label_hair'].index
    hair=np.array([any(g.group==hair_ids and g.weight>.3 for g in v.groups) for v in lowhead.data.vertices])
    cost=np.ones(len(p));cost[~hair]=.8
    # Face label includes the eye hollows. Shared hairline vertices retain face cost.
    faceid=lowhead.vertex_groups['label_face_head'].index
    face=np.array([any(g.group==faceid and g.weight>.3 for g in v.groups) for v in lowhead.data.vertices])
    cost[face&hair]=.3
    for cx in [-.048,.048]:
        eye=(p[:,1]<-.06)&(((p[:,0]-cx)/.033)**2+((p[:,2]-.813)/.028)**2<1)
        cost[eye]=.12
    print('COLLAPSE head',flush=True);reductions['head']=decimate(lowhead,23500,cost)
    reductions['cap']=decimate(lowcap,900,np.ones(len(lowcap.data.vertices)))
    # Cut the rim on the collar plane; only the pose renders can establish
    # whether the generated neck actually overlaps the collar continuously.
    neck=cut_and_cap(lowhead,.680)
    lows=[lowbody,lowhead,lowcap];highs=[highbody,raw_head,raw_cap]
    for o in lows:
        recalc(o,True)
        for g in o.vertex_groups:g.lock_weight=True
    after={o.name:group_counts(o) for o in [lowbody,lowhead]}
    preserved={n:{k:{'before':v,'after':after[n].get(k,0),'present':after[n].get(k,0)>0} for k,v in groups.items()} for n,groups in before.items()}
    write(out/'construction.json',{'cleanup':cleanup,'collapse':reductions,'neck':neck,'label_groups':preserved})
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'decimated-checkpoint.blend'))
    rig=make_rig(j,body,labels,out)
    proxy,weight_report=weights(lows,body,rig,out)
    poses=pose_metrics(lows,rig)
    write(out/'poses-metrics.json',poses)
    bpy.context.preferences.filepaths.save_version=0
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_render=o not in lows;o.hide_set(o not in lows)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'geometry-checkpoint.blend'))
    from lowpoly2_measure import measure_all
    metrics=measure_all(out,lows,highs,[extbody,exthead,raw_cap])
    metrics.update({'label_groups_after_weighting':{o.name:group_counts(o) for o in lows},'stage':'lowpoly2','construction':json.loads((out/'construction.json').read_text()),'weights':weight_report,'poses':poses,
        'assumptions':['全高1mに換算。頭は工程5の等方スケールと並進だけ。','脚の関節は脚ラベルの高さ断面から仮推定。','首の切断面はZ=0.680m。体側の旧首ラベル2は除く。seed42の位置と大きさは入力のまま維持し、重ねた境目を目視で判定する。頭と襟は溶接しない。','ピースを想定する腕の姿勢だけを検査し、生成した指は変えない。','深いめり込みの数値閾値は2mm。接触と交差の判定はレンダも併用。']})
    write(out/'metrics.json',metrics)
    cam=studio();bpy.context.scene.render.film_transparent=True
    from lowpoly2_render import render_all
    render_all(out,lows,highs,rig,j,cam,render)
    reset_pose(rig);visible(lows)
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_set(o not in lows)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly2.blend'))
    write(out/'runtime.json',{'seconds':time.time()-start})
    print('LOWPOLY2 FINISHED',metrics['triangles'],flush=True)
