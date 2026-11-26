"""Fourth surface pass. Input shape is changed only by the requested operators."""
import os, json, time, math, hashlib
from pathlib import Path
from collections import Counter, defaultdict
import bpy, bmesh, numpy as np
from mathutils import Vector
from lowpoly import WORK, append, coords, triangles, subset, activate, recalc, write, bvh
from lowpoly2 import clone, reset_pose, set_pose, POSES, evaluated, weight_audit
from lowpoly_verify import topology, visible
from lowpoly2_measure import attr
import lowpoly3 as previous

PARTS=previous.PARTS
TARGET=previous.BODY_TARGET
OUT=None

def log(message):
    print('LOWPOLY4',message,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')

def checkpoint(name):
    reset_pose(bpy.data.objects['temporary_rig'])
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    log('保存: '+name+'.blend')

def get_sections(o,rig):
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
            if np.linalg.norm(center-c)>radius:continue
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
        relevant=[l for l in loops if l['majority_part'] in expected]
        results[name]={'plane_center_m':c.tolist(),'plane_normal':n.tolist(),'anatomical_radius_m':radius,'loops':len([l for l in relevant if l['closed']]),'open_chains':len([l for l in relevant if not l['closed']]),'contours':relevant,'remote_contours_excluded':len(loops)-len(relevant),'all_contours_in_radius':loops,'pass':len(relevant)==1 and relevant[0]['closed']}
    return results

def cap_openings(o):
    p=coords(o);f=triangles(o);original_labels=attr(o,'part_id')
    # Split disconnected surface fans at a shared vertex. Positions are copied
    # verbatim, and every original triangle is retained. This makes the rims
    # explicit without deleting a sheet or placing a new cap-center vertex.
    corner=np.arange(f.size,dtype=np.int32).reshape(-1,3)
    edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]])
    ec=np.concatenate([corner[:,[0,1]],corner[:,[1,2]],corner[:,[2,0]]])
    rev=edges[:,0]>edges[:,1];edges[rev]=edges[rev,::-1];ec[rev]=ec[rev,::-1]
    order=np.lexsort((edges[:,1],edges[:,0]));edges=edges[order];ec=ec[order]
    starts=np.flatnonzero(np.r_[True,np.any(edges[1:]!=edges[:-1],axis=1)]);counts=np.diff(np.r_[starts,len(edges)])
    parent=np.arange(f.size,dtype=np.int32)
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for k in starts[counts==2]:
        for a,b in zip(ec[k],ec[k+1]):
            a=root(a);b=root(b)
            if a!=b:parent[max(a,b)]=min(a,b)
    while True:
        newer=parent[parent]
        if np.array_equal(newer,parent):break
        parent=newer
    roots,inv=np.unique(parent,return_inverse=True);q=p[f.ravel()[roots]];g=inv.reshape(-1,3)
    mesh=bpy.data.meshes.new('Body with explicit existing rims');mesh.from_pydata(q.tolist(),[],g.tolist());mesh.update();o.data=mesh
    previous.face_attr(o,'part_id',original_labels)
    bm=bmesh.new();bm.from_mesh(mesh);bm.verts.index_update()
    boundary=[e for e in bm.edges if e.is_boundary];pending=set(boundary);rims=[];branch=0
    while pending:
        edge=pending.pop();start,cur=edge.verts;last=start;rim=[start.index,cur.index]
        while cur!=start:
            choices=[e for e in cur.link_edges if e in pending]
            if len(choices)!=1:
                branch+=1;break
            edge=choices[0];pending.remove(edge);cur=edge.other_vert(cur)
            if cur!=start:rim.append(cur.index)
        if cur==start and len(rim)>=3:rims.append(rim)
    layer=bm.faces.layers.int.new('opening_cap');filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)['faces']
    for face in filled:face[layer]=1
    # A completely isolated input triangle already occupies its own rim. The
    # closing reverse face is a valid rim-only cap, but BMesh rejects duplicate
    # face vertex sets. Retain this zero-volume component through Mesh polygons;
    # the subsequent voxel and enclosed-component removal handle it explicitly.
    bm.verts.index_update();left=[e for e in bm.edges if e.is_boundary];remaining_rims=[];pending=set(left)
    while pending:
        edge=pending.pop();start,cur=edge.verts;rim=[start.index,cur.index]
        for _ in range(len(left)+1):
            choices=[e for e in cur.link_edges if e in pending]
            if not choices:break
            edge=choices[0];pending.remove(edge);cur=edge.other_vert(cur)
            if cur==start:break
            rim.append(cur.index)
        if cur==start and len(rim)>=3:remaining_rims.append(rim)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    if remaining_rims:
        faces=[list(poly.vertices) for poly in mesh.polygons]+[list(reversed(rim)) for rim in remaining_rims]
        old_labels=attr(o,'part_id');old_caps=attr(o,'opening_cap')
        patched=bpy.data.meshes.new('Rim-only planar closure');patched.from_pydata(q.tolist(),[],faces);patched.update();o.data=patched
        previous.face_attr(o,'part_id',np.r_[old_labels,np.full(len(remaining_rims),3)])
        previous.face_attr(o,'opening_cap',np.r_[old_caps,np.ones(len(remaining_rims))])
    # Blender tessellates the rim polygons; positions are never authored.
    o.data.calc_loop_triangles()
    top=topology(o)
    report={'boundary_edges_before':int((counts==1).sum()),'opening_count':len(filled)+len(remaining_rims),'simple_rims_traced':len(rims),'filled_polygons':len(filled)+len(remaining_rims),
        'boundary_edges_after':top['boundary_edges'],'original_positions':len(p),'fan_split_coincident_vertices':len(q)-len(p),
        'new_vertex_positions':0,'original_faces_retained':len(f),'rim_branch_failures':branch,'mesh_rim_caps':len(remaining_rims),
        'method':'preserve all source faces and positions; separate coincident surface fans without semantic cuts; cap actual rims with holes_fill and rim-only polygons; Blender tessellation'}
    write(OUT/'opening-fill.json',report);log('開口閉鎖: '+json.dumps(report,ensure_ascii=False));return report

def prepare():
    names=['reference_labeled_body','high3_body_original','high3_head_original','high3_cap_original','low3_head','temporary_rig']
    append(WORK/'lowpoly3/character-lowpoly3.blend',names)
    rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    original=bpy.data.objects['reference_labeled_body'];assert len(triangles(original))==968114
    head=bpy.data.objects['low3_head'];head.name='low4_head'
    head.animation_data_clear()
    high=bpy.data.objects['high3_body_original']
    body=clone(high,'capped4_body')
    j=json.loads((WORK/'lowpoly3/joints.json').read_text());write(OUT/'joints.json',j)
    sections={'before':get_sections(high,rig)};write(OUT/'sections.json',sections)
    before=topology(body);fill=cap_openings(body);after=topology(body)
    construction={'input_body_triangles':len(triangles(original)),'input_sha256':hashlib.sha256((WORK/'lowpoly3/character-lowpoly3.blend').read_bytes()).hexdigest(),'head_geometry_sha256':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest(),'source_topology':before,'opening_fill':fill,'after_cap_topology':after}
    write(OUT/'construction.json',construction)
    if fill['boundary_edges_after']:raise RuntimeError('Boundary fill remains open; review opening-fill.json')
    checkpoint('capped-checkpoint')
    return construction

def close_volume():
    construction=json.loads((OUT/'construction.json').read_text())
    capped=bpy.data.objects['capped4_body'];body=clone(capped,'voxel4_body')
    construction['voxel']=previous.voxel(body,.0015)
    high=bpy.data.objects['high3_body_original']
    previous.transfer_labels(body,high,'part_id')
    rig=bpy.data.objects['temporary_rig']
    sections=json.loads((OUT/'sections.json').read_text());sections['after']=get_sections(body,rig)
    write(OUT/'sections.json',sections)
    log('Voxel 後の断面: '+json.dumps({k:(v['loops'],v['open_chains']) for k,v in sections['after'].items()}))
    p=coords(high);f=triangles(high);labels=attr(high,'part_id')
    collar_faces=(labels==3)&(p[f].mean(1)[:,2]>.642)&(abs(p[f].mean(1)[:,0])<.089)
    cp=p[np.unique(f[collar_faces])];collar_top=float(cp[:,2].max())
    head=bpy.data.objects['low4_head'];head_bottom=float(coords(head)[:,2].min())
    cut=collar_top-.002
    # Lowering the body's top cannot increase its overlap with an immutable
    # head whose bottom is higher. Record that infeasibility without extending
    # the head or moving it against the specified input constraint.
    neck={'collar_top_m':collar_top,'body_cut_m':cut,'head_bottom_m':head_bottom,'overlap_m':cut-head_bottom,
        'required_overlap_m':.010,'overlap_pass':cut-head_bottom>=.010,'below_collar':cut<collar_top,
        'collar_selection':'original torso label, z>.642m and abs(x)<.089m, reused from lowpoly3 collar selection',
        'lower_cut_would_reduce_overlap':True,'head_transform_changed':False}
    log('首の実測: '+json.dumps(neck,ensure_ascii=False))
    bm=bmesh.new();bm.from_mesh(body.data)
    skin=bm.faces.layers.int.get('part_id');cap=bm.faces.layers.int.get('neck_cap') or bm.faces.layers.int.new('neck_cap')
    # Split at the plane, then remove neck skin only. The collar's highest
    # vertices are above this plane and must not be cropped with the neck.
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,cut),plane_no=(0,0,1),clear_outer=False,dist=1e-7)
    remove=[face for face in bm.faces if face[skin]==2 and face.calc_center_median().z>cut+1e-7]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    rim=[e for e in bm.edges if e.is_boundary]
    neck['cut_removed_skin_faces']=len(remove)
    neck['cut_rim_nonplanarity_mm']=max((abs(v.co.z-cut)*1000 for e in rim for v in e.verts),default=0.)
    neck['planar_cut_pass']=neck['cut_rim_nonplanarity_mm']<.01
    filled=bmesh.ops.holes_fill(bm,edges=rim,sides=0)['faces']
    for face in filled:face[cap]=1;face[skin]=2
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(body.data);bm.free();body.data.update()
    construction['neck']=neck;construction['after_neck_cut']=topology(body)
    write(OUT/'construction.json',construction)
    checkpoint('closed-checkpoint')
    return construction

def run(out,studio,render):
    global OUT;OUT=out;previous.OUT=out
    phase=os.environ.get('LOWPOLY4_PHASE','all');log('開始 phase='+phase)
    if phase in ['all','cap']:prepare()
    if phase=='close':bpy.ops.wm.open_mainfile(filepath=str(out/'capped-checkpoint.blend'))
    if phase in ['all','close']:close_volume()
    if phase=='A':bpy.ops.wm.open_mainfile(filepath=str(out/'closed-checkpoint.blend'))
    if phase in ['all','A']:make_a()
    if phase=='B':
        bpy.ops.wm.open_mainfile(filepath=str(out/'closed-checkpoint.blend'));make_b()
    if phase=='all':
        import subprocess
        env=os.environ.copy();env['LOWPOLY4_PHASE']='B'
        with (out/'run-B.log').open('w') as stream:
            try:
                result=subprocess.run([bpy.app.binary_path,'-b','--factory-startup','--python-exit-code','1','-P',str(Path(__file__).with_name('build.py')),'--','--stage','lowpoly4','--out',str(out)],env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=900)
                if result.returncode:write(out/'B-generation.json',{'valid':False,'reason':'QuadriFlow child process failed','returncode':result.returncode})
            except subprocess.TimeoutExpired:
                write(out/'B-generation.json',{'valid':False,'reason':'QuadriFlow did not finish within 900 seconds','timeout_seconds':900});log('B は15分の上限で終了し不採用。')
    if phase=='ab':bpy.ops.wm.open_mainfile(filepath=str(out/'A-checkpoint.blend'))
    if phase in ['all','ab']:
        if (out/'B-checkpoint.blend').exists():append(out/'B-checkpoint.blend',['low4_B'])
        ab_compare(studio,render)
    if phase=='finish':bpy.ops.wm.open_mainfile(filepath=str(out/'AB-checkpoint.blend'))
    if phase in ['all','finish']:finish(studio,render)
    if phase=='verify':verify_saved()
    log('phase 完了: '+phase)


def vertex_labels(body):
    # Nearest original face labels are authoritative, including semantic seams.
    reference=bpy.data.objects['high3_body_original'];tree=bvh(reference);labels=attr(reference,'part_id')
    return np.array([labels[tree.find_nearest(Vector(p))[2]] for p in coords(body)],np.int32)


def bone_mask(body,rig,j,labels):
    p=coords(body);names=[b.name for b in rig.data.bones];allowed=np.ones((len(p),len(names)),bool)
    collar=(labels==3)&(p[:,2]>.642)&(abs(p[:,0])<.089)
    for k,name in enumerate(names):
        if name in ['neck','head']:allowed[:,k]=(labels==2)&~collar
        elif name.startswith(('shoulder.','upper_arm.','forearm.','hand.')):
            side=name[-1];sleeve,hand=(4,6) if side=='L' else (5,7)
            allowed[:,k]=np.isin(labels,[sleeve,hand])|((labels==3)&~collar&(np.linalg.norm(p-j['shoulder_'+side],axis=1)<=.06))
        elif name.startswith(('thigh.','shin.','foot.')):
            sign=1 if name[-1]=='L' else -1
            allowed[:,k]=((labels==10)&(p[:,0]*sign>=0))|((labels==3)&(np.linalg.norm(p-j['pelvis'],axis=1)<=.06))
    return names,allowed,collar


def read_weights(body,names):
    lookup={g.index:names.index(g.name) for g in body.vertex_groups if g.name in names};w=np.zeros((len(body.data.vertices),len(names)))
    for v in body.data.vertices:
        for g in v.groups:
            if g.group in lookup:w[v.index,lookup[g.group]]=g.weight
    return w


def put_weights(body,names,w):
    for k,name in enumerate(names):
        group=body.vertex_groups.get(name) or body.vertex_groups.new(name=name);group.lock_weight=False
        group.remove(list(range(len(w))))
        for i in np.flatnonzero(w[:,k]>1e-9):group.add([int(i)],float(w[i,k]),'REPLACE')


def constrain(body,rig,j,labels):
    names,allowed,collar=bone_mask(body,rig,j,labels);w=read_weights(body,names);removed=int(((w>0)&~allowed).sum());w[~allowed]=0
    empty=np.flatnonzero(w.sum(1)<1e-12);p=coords(body)
    # Heat diffusion can leave vertices empty after forbidden influences are
    # removed. Assign only an allowed existing bone, using distance to its
    # segment. This is a weight repair; surface coordinates stay unchanged.
    for i in empty:
        choices=np.flatnonzero(allowed[i]);dist=[]
        for k in choices:
            bone=rig.data.bones[names[k]];a=np.array(bone.head_local);b=np.array(bone.tail_local);ab=b-a
            t=np.clip(np.dot(p[i]-a,ab)/np.dot(ab,ab),0,1);dist.append(np.linalg.norm(p[i]-(a+t*ab)))
        w[i,choices[np.argmin(dist)]]=1
    order=np.argsort(w,axis=1)[:,:-4];w[np.arange(len(w))[:,None],order]=0;w/=w.sum(1)[:,None]
    put_weights(body,names,w)
    table={name:{part:int(((w[:,k]>.05)&(labels==pid)).sum()) for pid,part in PARTS.items()} for k,name in enumerate(names)}
    leaks={name:int(((w[:,k]>.05)&~allowed[:,k]).sum()) for k,name in enumerate(names)}
    return {'removed_forbidden_influences':removed,'empty_after_restriction_repaired':len(empty),'over_005_by_bone_and_part':table,'forbidden_over_005':leaks,'audit':weight_audit(body,set(names))}


def transfer_accessory_weights(body,rig,labels,collar):
    p=coords(body);f=triangles(body);fl=attr(body,'part_id');fc=p[f].mean(1)
    torso=(fl==3)&~((fc[:,2]>.642)&(abs(fc[:,0])<.089))
    source=subset(body,torso,'underlying_torso_weight_source')
    targets=np.flatnonzero(collar|(labels==9));mask=body.vertex_groups.new(name='temporary_transfer_mask');mask.add(targets.tolist(),1.,'REPLACE')
    activate(body);mod=body.modifiers.new('Collar and straps from underlying torso','DATA_TRANSFER');mod.object=source
    mod.use_vert_data=True;mod.data_types_verts={'VGROUP_WEIGHTS'};mod.vert_mapping='POLYINTERP_NEAREST'
    mod.layers_vgroup_select_src='ALL';mod.layers_vgroup_select_dst='NAME';mod.vertex_group=mask.name
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Applying Data Transfer rebuilds the deform-group RNA collection.
    current_mask=body.vertex_groups.get('temporary_transfer_mask')
    if current_mask:body.vertex_groups.remove(current_mask)
    bpy.data.objects.remove(source,do_unlink=True)
    for name in ['neck','head']:body.vertex_groups[name].remove(np.flatnonzero(collar|np.isin(labels,[8,9])).tolist())
    previous.rigid(body,'spine.chest',np.flatnonzero(labels==8))
    return {'operator':'DATA_TRANSFER','mapping':'POLYINTERP_NEAREST','targets':len(targets),'source':'torso faces excluding collar','backpack_chest_1_vertices':int((labels==8).sum())}


def auto_weights(body,rig,j):
    reset_pose(rig);body.vertex_groups.clear();activate(body);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    error=None
    try:bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as e:error=str(e)
    previous.attach_armature(body,rig)
    labels=vertex_labels(body);names,allowed,collar=bone_mask(body,rig,j,labels)
    for name in names:
        if not body.vertex_groups.get(name):body.vertex_groups.new(name=name)
    report={'automatic_error':error,'automatic_before_restriction':weight_audit(body,set(names))}
    report['initial_restriction']=constrain(body,rig,j,labels)
    report['accessory_transfer']=transfer_accessory_weights(body,rig,labels,collar)
    report['final']=constrain(body,rig,j,labels)
    return report


def smooth_problem(body,rig,j,labels,joints,repeat=12):
    p=coords(body);select=np.zeros(len(p),bool)
    for center,radius in joints:select|=np.linalg.norm(p-center,axis=1)<radius
    activate(body)
    for v,flag in zip(body.data.vertices,select):v.select=bool(flag)
    body.data.use_paint_mask_vertex=True;bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM',factor=.6,repeat=repeat,expand=0.)
    bpy.ops.object.mode_set(mode='OBJECT');body.data.use_paint_mask_vertex=False
    names,allowed,collar=bone_mask(body,rig,j,labels)
    transfer_accessory_weights(body,rig,labels,collar)
    audit=constrain(body,rig,j,labels)
    return {'selected_vertices':int(select.sum()),'repeat':repeat,'factor':.6,'coordinates_changed':False,'audit':audit}


def local_deformation(body,rig):
    q=coords(body);p=evaluated(body);f=triangles(body);edges=np.array([e.vertices[:] for e in body.data.edges]);labels=vertex_labels(body)
    shoulder=rig.data.bones['upper_arm.R'].head_local
    selected=(labels==5)|((labels==3)&(np.linalg.norm(q-np.array(shoulder),axis=1)<.06))
    faces=np.any(selected[f],axis=1);ee=np.any(selected[edges],axis=1)
    n0=np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]]);n1=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    names=[b.name for b in rig.data.bones];w=read_weights(body,names)
    rotations=np.array([np.asarray(rig.pose.bones[name].matrix.to_3x3()@rig.data.bones[name].matrix_local.to_3x3().inverted()) for name in names])
    transport=np.einsum('nk,kij->nij',w,rotations);expected=np.einsum('nij,nj->ni',transport[f].mean(1),n0)
    flipped=np.einsum('ij,ij->i',expected,n1)<0
    ratio=np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1)/np.maximum(np.linalg.norm(q[edges[:,1]]-q[edges[:,0]],axis=1),1e-12)
    regions={}
    for part,mask in [('sleeve_shoulder',selected),('legs',labels==10),('lower_torso',(labels==3)&(q[:,2]<.44))]:
        regions[part]={'vertices':int(mask.sum()),'max_displacement_mm':float(np.linalg.norm(p[mask]-q[mask],axis=1).max(initial=0)*1000)}
    result={'flipped_faces':int((flipped&faces).sum()),'tested_faces':int(faces.sum()),'edges_over_2x':int(((ratio>2)&ee).sum()),'tested_edges':int(ee.sum()),
        'edges_over_2x_fraction':float(((ratio>2)&ee).sum()/ee.sum()),'max_stretch':float(ratio[ee].max()),'regional_motion':regions}
    result['numeric_pass']=result['flipped_faces']<=20 and result['edges_over_2x_fraction']<=.01 and result['max_stretch']<=3
    return result


def make_a():
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()}
    body=previous.reduce_regions(bpy.data.objects['voxel4_body'],bpy.data.objects['high3_body_original'],'low4_A','part_id',TARGET,j)
    log('A 減面: '+json.dumps(topology(body)))
    checkpoint('A-checkpoint')


def make_b():
    body=clone(bpy.data.objects['voxel4_body'],'low4_B')
    previous.collapse_mask(body,300000,np.ones(len(body.data.vertices)))
    before=topology(body)
    bm=bmesh.new();bm.from_mesh(body.data)
    before['nonmanifold_vertices']=sum(not v.is_manifold for v in bm.verts)
    before['non_contiguous_edges']=sum(not e.is_contiguous for e in bm.edges)
    bm.free();log('B QuadriFlow 入力: '+json.dumps(before))
    activate(body);start=time.monotonic()
    status=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,mode='FACES',target_faces=round(sum(TARGET.values())/2),seed=0)
    quads=Counter(len(f.vertices) for f in body.data.polygons)
    recalc(body,True);previous.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
    after=topology(body);valid='FINISHED' in status and not after['boundary_edges'] and not after['edges_shared_by_3_or_more_faces'] and after['connected_components']==1 and set(quads)=={4}
    write(OUT/'B-generation.json',{'status':list(status),'seconds':time.monotonic()-start,'input':before,'polygon_sides':dict(quads),'after':after,'valid':valid,'target_triangles':sum(TARGET.values())})
    log('B QuadriFlow 結果: '+json.dumps(after));checkpoint('B-checkpoint')


def ab_compare(studio,render):
    from geometry import material
    rig=bpy.data.objects['temporary_rig'];head=bpy.data.objects['low4_head']
    j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()};report={}
    cam=studio();scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=900;scene.eevee.taa_render_samples=32;scene.render.film_transparent=True
    clay=material('Lowpoly4 common white',(.70,.70,.70),.82);wiremat=material('Lowpoly4 wire',(.008,.012,.018),.8)
    def view(name,objects,angle,target,scale):
        visible(objects);target=Vector(target);a=math.radians(angle)
        render(OUT,cam,name,target+Vector((2*math.sin(a),-2*math.cos(a),0)),target,scale)
    for letter in ['A','B']:
        body=bpy.data.objects.get('low4_'+letter)
        if letter=='B' and not json.loads((OUT/'B-generation.json').read_text()).get('valid'):
            report[letter]={'available':False,'reason':json.loads((OUT/'B-generation.json').read_text())}
            log('B は QuadriFlow 未完了または閉じた1成分の四角面でないため不採用。');continue
        if body is None:report[letter]={'available':False,'reason':json.loads((OUT/'B-generation.json').read_text())};continue
        previous.transfer_labels(body,bpy.data.objects['high3_body_original'],'part_id')
        top=topology(body);valid=top['boundary_edges']==0 and top['edges_shared_by_3_or_more_faces']==0 and top['connected_components']==1
        wr=auto_weights(body,rig,j);set_pose(rig,'arm_R_70_elbow90');initial=local_deformation(body,rig)
        refinement=None
        if not initial['numeric_pass']:
            reset_pose(rig);refinement=smooth_problem(body,rig,j,vertex_labels(body),[(j['shoulder_R'],.075),(j['elbow_R'],.065),(j['wrist_R'],.035)])
        set_pose(rig,'arm_R_70_elbow90');after=local_deformation(body,rig)
        report[letter]={'available':True,'valid_topology':valid,'topology':top,'candidate_sha256':hashlib.sha256(coords(body).tobytes()+triangles(body).tobytes()+read_weights(body,[b.name for b in rig.data.bones]).tobytes()).hexdigest(),'triangles_by_part':{name:int((attr(body,'part_id')==pid).sum()) for pid,name in PARTS.items()},
            'weight_method':'Automatic Weights directly on reduced closed body; semantic restrictions; underlying torso Data Transfer; <=4 normalized influences',
            'weights':wr,'initial_elbow':initial,'joint_refinement':refinement,'elbow':after,'visual_pass':None}
        for o in [body,head]:
            if not o.data.materials:o.data.materials.append(clay)
            for k in range(len(o.data.materials)):o.data.materials[k]=clay
        target=rig.pose.bones['forearm.R'].head.copy()
        view('ab-'+letter+'-elbow.png',[body,head],25,target,.19)
        view('ab-'+letter+'-elbow-back.png',[body,head],205,target,.19)
        wire=clone(body,'wire4_'+letter);wire.data.materials.clear();wire.data.materials.append(wiremat)
        for face in wire.data.polygons:face.material_index=0
        mod=wire.modifiers.new('Actual triangulation','WIREFRAME');mod.thickness=.00016;mod.offset=0.;mod.use_even_offset=False
        view('ab-'+letter+'-wire.png',[body,head,wire],25,target,.19)
        bpy.data.objects.remove(wire,do_unlink=True)
        set_pose(rig,'arms_open45')
        view('ab-'+letter+'-gaps.png',[body,head],25,(0,0,.48),1.1)
        for name,angle,center,scale in [('armpit',25,rig.pose.bones['upper_arm.R'].head,.25),('crotch',0,(0,0,.32),.24),('straps-front',25,(0,-.04,.56),.36),('straps-back',155,(0,.07,.56),.36)]:
            view('ab-'+letter+'-'+name+'.png',[body,head],angle,center,scale)
        reset_pose(rig);write(OUT/'ab-comparison.json',report)
        log(letter+' 肘比較: '+json.dumps(after))
    write(OUT/'ab-comparison.json',report)
    reset_pose(rig);checkpoint('AB-checkpoint');return report


def select_candidate(report):
    decision=OUT/'visual-ab.json'
    if decision.exists():
        visual=json.loads(decision.read_text())
        for letter in ['A','B']:
            if report[letter].get('available') and visual[letter].get('candidate_sha256')==report[letter]['candidate_sha256']:report[letter].update(visual[letter])
    def passed(r):return r.get('available') and r.get('valid_topology') and r['elbow']['numeric_pass'] and r.get('visual_pass') is True
    available=[key for key,value in report.items() if value.get('available') and value.get('valid_topology')]
    good=[key for key in available if passed(report[key])]
    if len(good)==2:choice=min(good,key=lambda k:report[k]['elbow']['flipped_faces']);reason='Both pass; fewer inverted faces.'
    elif len(good)==1:choice=good[0];reason='Only candidate meeting all elbow gates.'
    elif available:
        # Compare normalized violations of the prespecified lines. Geometry and
        # methods are fixed; this only chooses which failed candidate to audit.
        def score(k):
            r=report[k]['elbow'];return (max(r['flipped_faces']/20,r['edges_over_2x_fraction']/.01,r['max_stretch']/3,float(report[k].get('visual_pass') is not True)*2),r['flipped_faces'])
        choice=min(available,key=score);reason='Neither passes; smallest maximum normalized gate violation. Overall elbow gate fails.'
    else:raise RuntimeError('Neither A nor B is a closed connected surface')
    selection={'selected':choice,'reason':reason,'pass':bool(good),'candidates':report}
    write(OUT/'ab-comparison.json',selection);log('A/B 選択: '+choice+' '+reason);return selection


def finish(studio,render):
    from lowpoly3_measure import measure_all,deformation
    from lowpoly3_render import render_all
    rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    raw=json.loads((OUT/'ab-comparison.json').read_text());raw=raw.get('candidates',raw);selection=select_candidate(raw)
    body=bpy.data.objects['low4_'+selection['selected']];body.name='low4_body';head=bpy.data.objects['low4_head']
    previous.rigid(head,'head');previous.attach_armature(head,rig)
    construction=json.loads((OUT/'construction.json').read_text());j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()}
    rest={o.name:coords(o) for o in [body,head]};poses={}
    for pose in POSES:
        set_pose(rig,pose);poses[pose]=deformation([body,head],rest);log('ポーズ測定: '+pose)
    reset_pose(rig);write(OUT/'poses-initial.json',poses)
    # A/B already refined the right shoulder/elbow once. Repair only other
    # failing joint neighborhoods; leave the tested right-arm weights intact.
    centers=[]
    for pose,values in poses.items():
        r=values[body.name]
        if r['flipped_faces_against_transported_rest_normal'] or r['edges_over_2x_rest_length']:
            if pose.startswith('arm_L'):centers.extend([(j['shoulder_L'],.075),(j['elbow_L'],.065),(j['wrist_L'],.035)])
            elif pose.startswith('spine_'):centers.extend([(j['spine_mid'],.05),(j['spine_upper'],.05)])
            elif pose.startswith('neck_'):centers.extend([(j['neck_base'],.035),(j['head_pivot'],.035)])
    refinement=smooth_problem(body,rig,j,vertex_labels(body),centers) if centers else None
    if refinement:
        for pose in POSES:set_pose(rig,pose);poses[pose]=deformation([body,head],rest)
    reset_pose(rig)
    set_pose(rig,'arm_R_70_elbow90');final_elbow=local_deformation(body,rig);reset_pose(rig)
    # The final shared torso smoothing can affect the shoulder. Its actual
    # saved pose metric is recorded independently of the selection metric.
    write(OUT/'poses-metrics.json',poses)
    labels=vertex_labels(body);audit=constrain(body,rig,j,labels)
    weights={'method':selection['candidates'][selection['selected']]['weight_method'],'selected':selection['selected'],'final':audit,'other_joint_refinement':refinement}
    write(OUT/'weights.json',weights)
    checkpoint('geometry-checkpoint')
    highs=[bpy.data.objects[n] for n in ['high3_body_original','high3_head_original']];cap=bpy.data.objects['high3_cap_original']
    metrics=measure_all(OUT,[body,head],highs,cap,construction['neck']['body_cut_m'])
    for part,values in metrics['distances_full_source'].items():
        for direction in ['high_to_low','low_to_high']:
            values[direction]['p95_limit_mm']=1.5 if part not in ['face_head','hair'] else values[direction]['p95_limit_mm']
            values[direction]['p95_pass']=values[direction]['p95_mm']<=values[direction]['p95_limit_mm']
    sections={'before':get_sections(bpy.data.objects['high3_body_original'],rig),'after':get_sections(bpy.data.objects['voxel4_body'],rig),'reduced':get_sections(body,rig)};write(OUT/'sections.json',sections)
    counts={part:int((attr(body,'part_id')==pid).sum()) for pid,part in PARTS.items()}
    counts.update({part:int((attr(head,'part2')==pid).sum()) for pid,part in [(0,'face_head'),(1,'hair')]});counts['total']=sum(counts.values())
    distance_pass=all(v[d]['p95_mm']<=1.5 for k,v in metrics['distances_full_source'].items() if k not in ['face_head','hair','hand_L','hand_R'] for d in ['high_to_low','low_to_high'])
    head_hash=hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()
    _,allocation,_=previous.allocation_check(body,head)
    construction['neck']['after_reduction']=previous.neck_after_reduction(body,head,construction['neck']['body_cut_m'])
    write(OUT/'construction.json',construction)
    metrics.update({'stage':'lowpoly4','construction':construction,'sections':sections,'ab_comparison':selection,'final_right_elbow':final_elbow,'triangles':counts,'weights':weights,'poses':poses,'part_allocation':allocation,
        'topology':{'body':topology(body),'head':topology(head)},'head_geometry_unchanged':head_hash==construction['head_geometry_sha256'],
        'triangle_budget':{'target':50000,'limit':60000,'reserved_later':5000,'current_plus_reserved':counts['total']+5000,'pass':counts['total']+5000<=60000},
        'acceptance':{'sections':all(v['pass'] for v in sections['after'].values()) and all(v['pass'] for v in sections['reduced'].values()),'body_topology':topology(body)['boundary_edges']==0 and topology(body)['edges_shared_by_3_or_more_faces']==0 and topology(body)['connected_components']==1,
        'weights':not any(audit['forbidden_over_005'].values()) and audit['audit']['max_influences']<=4 and audit['audit']['unweighted_vertices']==0 and audit['audit']['max_normalization_error']<1e-5,
        'distance_p95':distance_pass,'elbow':selection['pass'] and final_elbow['numeric_pass'],'neck_overlap':construction['neck']['overlap_pass'],'neck_planar_cut':construction['neck']['planar_cut_pass'],'pose_visual':None,'neck_visual':None,'fragment_visual':None,'silhouette':None},
        'assumptions':[
          '入力は3回目の保存ファイル内の元のラベル付き体、低密度の頭、同じ仮の骨。頭の座標・面・位置・大きさは変えない。',
          '塞ぐ面の中心などに頂点を置かない。非多様体で途切れる境界は、元の面と座標をすべて保持し、同じ座標の頂点の接続だけ分けて輪にする。',
          '襟は3回目と同じ胴ラベルのz>.642m、abs(x)<.089mの領域。上端はその領域の全頂点の最大Z。',
          '頭の下端より体の切り口が低い場合、切り口をさらに下げても重なりは増えない。固定された頭を延長せず、指定の襟下2mmで切り、重なり不足を不合格として残す。',
          'A/Bが両方不合格なら、裏返り/20、2倍超辺率/.01、最大伸長/3、目視不合格=2の最大値が小さいほう。同値なら裏返りが少ないほう。',
          'QuadriFlowは30万三角形を入力し、体の配分合計/2の四角面を要求。15分で完了しなければ不採用。',
          '断面は仮の骨の中点に垂直な平面。腕90/85mm、脚115/100mm、胴180mm、首100mm以内の輪を数える。多数の辺が別部位に属する輪は灰色で併記して分ける。該当部位の内側の輪は除かない。胴と首は中央の断面、四肢は左右。',
          '距離は3回目と同じ元の全表面への双方向150000面積標本と全頂点。内部面を含む値で合否を決め、外面参考値も併記する。',
          '腕45度・70度、肘90度、首と背骨のポーズは3回目をそのまま使用。股の胴側の6cmは既存のpelvis関節を中心とする。',
          '体の合否に固定された頭の毛先の小さな欠けを含めない。頭の境界・成分数は省略せず記録する。']})
    write(OUT/'metrics.json',metrics);log('距離測定完了: '+json.dumps({k:[v[d]['p95_mm'] for d in ['high_to_low','low_to_high']] for k,v in metrics['distances_full_source'].items()}))
    cam=bpy.context.scene.camera or studio()
    render_all(OUT,[body,head],highs+[cap],rig,j,cam,render,head)
    for action in bpy.data.actions:
        if action.name.startswith('lowpoly3_'):action.name=action.name.replace('lowpoly3_','lowpoly4_',1)
    reset_pose(rig);visible([body,head])
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_set(obj not in [body,head])
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'character-lowpoly4.blend'))
    verify_saved()
    import subprocess
    subprocess.run([str(WORK/'img3d/venv/bin/python'),str(Path(__file__).with_name('lowpoly4_review.py')),str(OUT)],check=True)
    log('最終Blendと全レンダを保存。画像の目視と保存ファイルの再検査が必要。')


def verify_saved():
    path=OUT/'character-lowpoly4.blend';bpy.ops.wm.open_mainfile(filepath=str(path))
    body=bpy.data.objects['low4_body'];head=bpy.data.objects['low4_head'];rig=bpy.data.objects['temporary_rig'];reset_pose(rig)
    construction=json.loads((OUT/'construction.json').read_text());j={k:np.array(v) for k,v in json.loads((OUT/'joints.json').read_text()).items()}
    names=[b.name for b in rig.data.bones];labels=vertex_labels(body);_,allowed,_=bone_mask(body,rig,j,labels);weights=read_weights(body,names)
    report={'blend_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'head_geometry_unchanged':hashlib.sha256(coords(head).tobytes()+triangles(head).tobytes()).hexdigest()==construction['head_geometry_sha256'],
        'source_blend_unchanged':hashlib.sha256((WORK/'lowpoly3/character-lowpoly3.blend').read_bytes()).hexdigest()==construction['input_sha256'],
        'topology':{'body':topology(body),'head':topology(head)},'weights':{o.name:weight_audit(o,set(names)) for o in [body,head]},'forbidden_influences_above_005':int(((weights>.05)&~allowed).sum()),
        'pose_actions':[a.name for a in bpy.data.actions if a.name.startswith('lowpoly4_')],'bone_count':len(names)}
    set_pose(rig,'arm_R_70_elbow90');report['saved_right_arm']=local_deformation(body,rig);reset_pose(rig)
    report['arm_motion']={}
    for pose in ['arm_R_70_elbow90','arm_L_70_elbow90','arms_open45']:
        set_pose(rig,pose);report['arm_motion'][pose]=local_deformation(body,rig)['regional_motion']
    reset_pose(rig)
    all_weights=read_weights(body,names)
    report['maximum_weight_sum_error_including_tiny_weights']=float(abs(all_weights.sum(1)-1).max())
    report['maximum_positive_influences_including_tiny_weights']=int((all_weights>0).sum(1).max())
    hp=previous.semantic_vertices(head,'part2');hw=read_weights(head,names)
    head_counts={name:{part:int(((hw[:,k]>.05)&(hp==pid)).sum()) for pid,part in [(0,'face_head'),(1,'hair')]} for k,name in enumerate(names)}
    report['head_weights_over_005_by_part']=head_counts
    source_skeleton=json.loads((WORK/'lowpoly3/skeleton.json').read_text())['bones']
    report['same_temporary_bones_as_lowpoly3']=all(np.allclose(b.head_local,source_skeleton[b.name]['head'],rtol=0,atol=1e-8) and np.allclose(b.tail_local,source_skeleton[b.name]['tail'],rtol=0,atol=1e-8) for b in rig.data.bones)
    if (OUT/'metrics.json').exists():
        metrics=json.loads((OUT/'metrics.json').read_text())
        from lowpoly3_measure import deformation
        rest={o.name:coords(o) for o in [body,head]};saved_poses={}
        for pose in POSES:
            set_pose(rig,pose);saved_poses[pose]=deformation([body,head],rest)
        reset_pose(rig)
        report['saved_pose_counts_match_existing']=all(saved_poses[pose][body.name]['flipped_faces_against_transported_rest_normal']==metrics['poses'][pose][body.name]['flipped_faces_against_transported_rest_normal'] and saved_poses[pose][body.name]['edges_over_2x_rest_length']==metrics['poses'][pose][body.name]['edges_over_2x_rest_length'] for pose in POSES)
        metrics['poses']=saved_poses
        source_head=append(WORK/'lowpoly3/character-lowpoly3.blend',['low3_head'])[0]
        bpy.context.view_layer.update()
        report['head_transform_unchanged']=bool(np.allclose(np.asarray(source_head.matrix_world),np.asarray(head.matrix_world),rtol=0,atol=1e-9))
        for name,counts in head_counts.items():metrics['weights']['final']['over_005_by_bone_and_part'][name].update(counts)
        metrics['arm_motion']=report['arm_motion'];metrics['saved_verification']=report
        write(OUT/'metrics.json',metrics)
    write(OUT/'saved-verification.json',report);log('保存ファイル再検査: '+json.dumps({k:v for k,v in report.items() if k not in ['topology','pose_actions']},ensure_ascii=False))
