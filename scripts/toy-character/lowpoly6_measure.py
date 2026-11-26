"""Sixth-pass measurements; masks affect reports and weights, never surface positions."""
import json,math,subprocess
from collections import Counter,defaultdict
import bpy,numpy as np
from mathutils import Vector
from lowpoly import coords,triangles,write,WORK
from lowpoly2 import POSES as PREVIOUS_POSES,set_pose as previous_pose,turn_world,reset_pose,evaluated
from lowpoly2_measure import attr
import lowpoly4 as p4
POSES=list(PREVIOUS_POSES)+['arms_toward_body10']


def set_pose(rig,name):
    if name!='arms_toward_body10':return previous_pose(rig,name)
    reset_pose(rig)
    for side,sgn in [('L',1),('R',-1)]:turn_world(rig,'upper_arm.'+side,(0,1,0),sgn*10)


def pose_regions(body,rig,j):
    q=coords(body);p=evaluated(body);f=triangles(body);e=np.array([edge.vertices[:] for edge in body.data.edges])
    names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names)
    rot=np.array([np.asarray(rig.pose.bones[name].matrix.to_3x3()@rig.data.bones[name].matrix_local.to_3x3().inverted()) for name in names])
    transport=np.einsum('nk,kij->nij',w,rot)
    n0=np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]]);n1=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    expected=np.einsum('nij,nj->ni',transport[f].mean(1),n0);flip=np.einsum('ij,ij->i',expected,n1)<0
    ratio=np.linalg.norm(p[e[:,1]]-p[e[:,0]],axis=1)/np.maximum(np.linalg.norm(q[e[:,1]]-q[e[:,0]],axis=1),1e-12)
    def sphere(center,r):return np.linalg.norm(q-np.asarray(center),axis=1)<r
    masks={'whole_body':np.ones(len(q),bool),'neck':(q[:,2]>.600)&(abs(q[:,0])<.10),'chest':(q[:,2]>.48)&(q[:,2]<.65)&(abs(q[:,0])<.115),'crotch':sphere(j['pelvis'],.10)&(q[:,2]<.40)}
    for region,key,r in [('shoulder','shoulder_',.075),('armpit','shoulder_',.095),('elbow','elbow_',.065)]:
        masks[region]=np.zeros(len(q),bool)
        for side in ['L','R']:
            m=sphere(j[key+side],r)
            if region=='armpit':m&=q[:,2]<j[key+side][2]+.01
            masks[region+'_'+side]=m;masks[region]|=m
    result={}
    for name,mask in masks.items():
        fm=np.any(mask[f],1);em=np.any(mask[e],1);over=(ratio>2)&em
        result[name]={'vertices':int(mask.sum()),'tested_faces':int(fm.sum()),'flipped_faces':int((flip&fm).sum()),'tested_edges':int(em.sum()),'edges_over_2x':int(over.sum()),'edges_over_2x_fraction':float(over.sum()/max(em.sum(),1)),'max_stretch':float(ratio[em].max(initial=0))}
    return result


def armpit_sections(body):
    p=coords(body);f=triangles(body);labels=attr(body,'part_id');results={}
    for z in np.arange(.46,.561,.02):
        # A tiny plane offset avoids vertices exactly on the sampling plane.
        dd=p[f,2]-z-1e-8;mask=(dd.min(1)<0)&(dd.max(1)>0);graph=defaultdict(set);points={};parts={}
        for face,d,pid in zip(f[mask],dd[mask],labels[mask]):
            keys=[]
            for a,b in [(0,1),(1,2),(2,0)]:
                if d[a]*d[b]<0:
                    key=tuple(sorted((int(face[a]),int(face[b]))));points[key]=p[face[a]]+(p[face[b]]-p[face[a]])*d[a]/(d[a]-d[b]);parts[key]=int(pid);keys.append(key)
            if len(keys)==2:graph[keys[0]].add(keys[1]);graph[keys[1]].add(keys[0])
        seen=set();loops=[]
        for key in graph:
            if key in seen:continue
            chain=[];cur=key;last=None
            while cur not in seen:
                seen.add(cur);chain.append(cur);nxt=graph[cur]-({last} if last is not None else set())
                if not nxt:break
                last,cur=cur,next(iter(nxt))
            xy=np.array([points[k][:2] for k in chain]);labs=Counter(parts[k] for k in chain)
            area=abs(np.sum(xy[:,0]*np.roll(xy[:,1],-1)-xy[:,1]*np.roll(xy[:,0],-1)))/2
            loops.append({'closed':all(len(graph[k])==2 for k in chain),'points_m':xy.tolist(),'part_counts':dict(labs),'area_mm2':float(area*1e6),'x_range_m':[float(xy[:,0].min()),float(xy[:,0].max())]})
        row={}
        for side,sgn in [('L',1),('R',-1)]:
            included=[l for l in loops if max(np.array(l['points_m'])[:,0]*sgn)>0]
            arm=4 if side=='L' else 5;hand=6 if side=='L' else 7
            def arm_loop(l):return (l['part_counts'].get(arm,0)+l['part_counts'].get(hand,0))/sum(l['part_counts'].values())>.5
            arms=[l for l in included if arm_loop(l)];torso=[l for l in included if not arm_loop(l) and l['part_counts'].get(3,0)>10]
            row[side]={'regions':len(included),'arm_contours':len(arms),'torso_contours':len(torso),'arm_torso_separate':bool(arms and torso and not any(l in torso for l in arms)),'closed':all(l['closed'] for l in included),'contours':included}
        results[f'{z:.2f}']=row
    return results


def export_distances(out,body,head):
    for name,obj,attribute in [('final_body',body,'part_id'),('final_head',head,'part2')]:np.savez(out/(name+'.npz'),V=coords(obj),F=triangles(obj),labels=attr(obj,attribute))
    for name,obj,attribute in [('original_body',bpy.data.objects['high3_body_original'],'part_id'),('original_head',bpy.data.objects['high3_head_original'],'part2')]:np.savez(out/(name+'.npz'),V=coords(obj),F=triangles(obj),labels=attr(obj,attribute))
    subprocess.run([str(WORK/'venv-geo/bin/python'),str(__import__('pathlib').Path(__file__).with_name('lowpoly6_distances.py')),str(out)],check=True)
    for name,obj in [('body',body),('head',head)]:
        d=np.load(out/f'{name}-vertex-distances.npy')*1000
        colors=np.ones((len(d),4));t=np.clip(d/2,0,1);colors[:,0]=t;colors[:,1]=1-t;colors[:,2]=0
        ca=obj.data.color_attributes.get('distance_error') or obj.data.color_attributes.new(name='distance_error',type='FLOAT_COLOR',domain='POINT')
        ca.data.foreach_set('color',colors.ravel())
    return json.loads((out/'distance-metrics.json').read_text())


def extra_renders(out,body,head,rig,cam,render):
    from lowpoly_verify import visible
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=900;scene.render.film_transparent=True;visible([body,head])
    for pose in POSES:
        set_pose(rig,pose)
        if pose=='rest' or pose.startswith('neck_'):
            for a in [0,25,90]:
                angle=math.radians(a);target=Vector((0,-.04,.665))
                render(out,cam,f'neck-open-{pose}-{a}.png',target+Vector((2*math.sin(angle),-2*math.cos(angle),0)),target,.15)
        if pose.startswith('arm_') or pose=='arms_toward_body10':
            sides=['L','R'] if pose=='arms_toward_body10' else [pose.split('_')[1]]
            for side in sides:
                target=(rig.pose.bones['upper_arm.'+side].head+rig.pose.bones['upper_arm.'+side].tail)/2
                for a in [0,180]:
                    angle=math.radians(a);render(out,cam,f'armpit-{pose}-{side}-{a}.png',target+Vector((2*math.sin(angle),-2*math.cos(angle),0)),target,.28)
    reset_pose(rig)


_LABEL_CACHE={}

def vertex_labels_with_slit_provenance(body):
    """New cut faces inherit the surviving volume side, not the opposite strap."""
    from lowpoly import bvh
    from pathlib import Path
    import hashlib
    q=coords(body);key=hashlib.sha256(q.tobytes()).hexdigest()
    if key in _LABEL_CACHE:return _LABEL_CACHE[key].copy()
    reference=bpy.data.objects['high3_body_original'];tree=bvh(reference);fl=attr(reference,'part_id')
    labels=np.array([fl[tree.find_nearest(Vector(v))[2]] for v in q],np.int32)
    out=WORK/'lowpoly6';np.savez(out/'weight-label-input.npz',V=q,labels=labels)
    subprocess.run([str(WORK/'venv-geo/bin/python'),str(Path(__file__).with_name('lowpoly6_weight_labels.py')),str(out)],check=True)
    labels=np.load(out/'weight-labels.npy');_LABEL_CACHE[key]=labels;return labels.copy()


def refine_local_weights(body,rig,j,labels):
    """Smooth only failed joint/contact neighborhoods with fixed backpack/cap weights."""
    from mathutils.kdtree import KDTree
    q=coords(body);e=np.array([edge.vertices[:] for edge in body.data.edges]);names=[b.name for b in rig.data.bones];w=p4.read_weights(body,names)
    edges=np.r_[e,e[:,::-1]];degree=np.maximum(np.bincount(edges[:,0],minlength=len(q)),1)
    fixed=(labels==8);tree=KDTree(int(fixed.sum()))
    for i,point in enumerate(q[fixed]):tree.insert(Vector(point),i)
    tree.balance();near_bag=np.array([tree.find(Vector(point))[2]<.035 for point in q])
    cut=json.loads((WORK/'lowpoly6/construction.json').read_text())['neck']['body_cut_m'];cap=abs(q[:,2]-cut)<1e-6;fixed|=cap
    selected=near_bag|((q[:,2]>cut-.035)&(abs(q[:,0])<.12))
    for side in ['L','R']:
        for key,radius in [('shoulder_',.10),('elbow_',.075)]:selected|=np.linalg.norm(q-np.asarray(j[key+side]),axis=1)<radius
    _,allowed,_=p4.bone_mask(body,rig,j,labels);chest=names.index('spine.chest')
    for _ in range(40):
        average=np.zeros_like(w);np.add.at(average,edges[:,0],w[edges[:,1]]);average/=degree[:,None];w[selected]=.4*w[selected]+.6*average[selected];w[~allowed]=0
        w[fixed]=0;w[fixed,chest]=1
        # Limit throughout the solve, matching the exported four-bone limit.
        order=np.argsort(w,axis=1)[:,:-4];w[np.arange(len(w))[:,None],order]=0;w/=np.maximum(w.sum(1)[:,None],1e-12)
    p4.put_weights(body,names,w)
    return {'operator':'local adjacency Smooth with fixed weights','factor':.6,'repeat':40,'selected_vertices':int(selected.sum()),'shoulder_radius_m':.10,'elbow_radius_m':.075,'backpack_contact_width_m':.035,'neck_cut_band_m':.035,'fixed_backpack_vertices':int((labels==8).sum()),'fixed_cap_vertices':int(cap.sum()),'coordinates_changed':False,'slit_labels':json.loads((WORK/'lowpoly6/slit-weight-labels.json').read_text())}
