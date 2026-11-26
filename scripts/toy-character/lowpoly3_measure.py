"""Original-source bidirectional distances; keep internal-sheet statistics explicit."""
import math
from collections import Counter
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import coords,triangles,subset,write,bvh
from lowpoly_verify import combined,area_samples
from lowpoly2_measure import attr,nearest_values,vertex_error_attribute
from lowpoly3 import PARTS
CAUSES=['internal_surface','eye_recess_depth','between_hair_clumps','true_shape_deviation','part_correspondence_only']


def tree(objects):
    p,f=combined(objects);return BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)


def regional(objects,prefix):
    body,head=objects;result={}
    for pid,name in PARTS.items():
        if pid==2:continue
        labels=attr(body,'part_id')
        mask=np.isin(labels,[2,3]) if pid==3 else labels==pid
        if mask.any():result[name]=subset(body,mask,prefix+name)
    for pid,name in [(0,'face_head'),(1,'hair')]:
        mask=attr(head,'part2')==pid
        if mask.any():result[name]=subset(head,mask,prefix+name)
    return result


def measure_direction(source,target,part,rng,original,low_assembly,source_is_high,n=150000,cut=None):
    p=coords(source);f=triangles(source);exclude=0
    identified_closure=int(attr(source,'neck_cap').astype(bool).sum()) if not source_is_high else 0
    # Full-source distances include the new closure as well; its hidden points
    # are explained in the internal-surface category instead of being dropped.
    vertices=p[np.unique(f)];points=np.concatenate([area_samples(p,f,n,rng),vertices])
    values,_=nearest_values(points,bvh(target));kinds=np.full(len(points),'true_shape_deviation',dtype='<U32')
    # Category assignment also covers sub-millimetre interior samples, so the
    # .3mm face gate cannot be distorted by hidden generated sheets.
    assembly=low_assembly if source_is_high else original
    assembly_distances=np.full(len(points),np.nan)
    for i in np.flatnonzero(values>.00025):
        v=Vector(points[i]);q,normal,_,d=assembly.find_nearest(v)
        assembly_distances[i]=d if d is not None else np.nan
        if d is not None and d<=.001:
            kinds[i]='part_correspondence_only';continue
        hidden=True
        for k in range(8):
            a=k*math.pi/4;direction=Vector((math.sin(a),-math.cos(a),.12)).normalized()
            hit,_,_,_=original.ray_cast(v+direction*.00008,direction,2)
            if hit is None:hidden=False;break
        if hidden and source_is_high and d is not None and d>.001:
            kinds[i]='internal_surface'
        elif hidden and not source_is_high and cut is not None and v.z<cut+.002:
            kinds[i]='internal_surface'
        elif hidden and part=='face_head' and v.y<-.055 and .775<v.z<.85 and .015<abs(v.x)<.10:
            kinds[i]='eye_recess_depth'
        elif hidden and part=='hair':kinds[i]='between_hair_clumps'
    raw=values*1000;surface=kinds!='internal_surface'
    # Regional correspondence is retained in the surface P95. It is separately
    # explained at maxima instead of silently expanding the target to all parts.
    counts=Counter(kinds[values>.001]);internal_count=int((~surface).sum())
    surf=raw[surface]
    limit=1 if part in ['neck','torso','sleeve_L','sleeve_R','backpack','shoulder_straps'] else .5
    top=np.argsort(values)[-12:][::-1]
    examples=[{'xyz_m':points[i].tolist(),'distance_mm':float(raw[i]),'cause':str(kinds[i]),'assembly_distance_mm':float(assembly_distances[i]*1000) if np.isfinite(assembly_distances[i]) else None} for i in top]
    report={'p95_mm':float(np.percentile(raw,95)),'max_mm':float(raw.max()),
        'surface_p95_mm':float(np.percentile(surf,95)) if len(surf) else None,
        'surface_max_mm':float(surf.max()) if len(surf) else None,'samples':len(points),'area_samples':n,'vertices_included':len(vertices),
        'internal_surface_samples':internal_count,'p95_limit_mm':limit,
        'p95_pass':bool(np.percentile(raw,95)<=limit),'surface_p95_pass':bool(len(surf) and np.percentile(surf,95)<=limit),
        'points_over_1mm_by_cause':{k:counts[k] for k in CAUSES},'max_examples':examples,
        'neck_closure_triangles_excluded':0,'neck_closure_triangles_identified':identified_closure}
    return report


def head_gate(high,low,cap,cut,out):
    hf=subset(high,attr(high,'part2')==0,'gate_original_face');lf=subset(low,attr(low,'part2')==0,'gate_voxel_face')
    rng=np.random.default_rng(642);original=tree([high,cap]);closed=tree([low])
    result={}
    for direction,s,t,forward in [('high_to_low',hf,lf,True),('low_to_high',lf,hf,False)]:
        result[direction]=measure_direction(s,t,'face_head',rng,original,closed,forward,cut=cut)
    result['limit_mm']=.3
    result['distance_pass']=all(result[d]['p95_mm']<=.3 for d in ['high_to_low','low_to_high'])
    for o in [hf,lf]:bpy.data.objects.remove(o,do_unlink=True)
    write(out/'head-voxel-gate.json',result);return result


def measure_all(out,lows,highs,cap,cut):
    lo=regional(lows,'measure3_low_');hi=regional(highs,'measure3_source_')
    # The inset cap is part of the immutable hair source, even if Voxel absorbed
    # it. Keep its raw high-to-low internal-sheet errors in the same hair entry.
    hc=cap.copy();hc.data=cap.data.copy();bpy.context.collection.objects.link(hc)
    activate=__import__('lowpoly').activate
    activate(hi['hair']);hc.select_set(True);bpy.ops.object.join()
    original=tree(highs+[cap]);closed=tree(lows);rng=np.random.default_rng(642)
    metrics={'distances_full_source':{},'outlier_vertex_maps':{},'triangles':{name:len(triangles(o)) for name,o in lo.items()},
        'distance_method':'150000 area-weighted samples per part and direction plus all used vertices, fixed seed 642; original full source only; approximate Hausdorff',
        'outlier_method':'Raw P95 includes internal sheets. surface_p95 removes internal_surface samples only, using original 8-ray occlusion and >1mm nearest whole assembly distance; correspondence uses <=1mm as lowpoly2. Regional correspondence, eye recesses and hair gaps remain in the P95. Counts >1mm use the five lowpoly2 categories. No exterior-only source is constructed.'}
    for part in lo:
        print('DISTANCE3',part,flush=True);a=measure_direction(hi[part],lo[part],part,rng,original,closed,True,cut=cut)
        b=measure_direction(lo[part],hi[part],part,rng,original,closed,False,cut=cut)
        metrics['distances_full_source'][part]={'high_to_low':a,'low_to_high':b}
        metrics['outlier_vertex_maps'][part]=vertex_error_attribute(hi[part],lo[part])
        hi[part].name='error3_original_'+part;hi[part].hide_render=True
        write(out/'metrics-progress.json',metrics)
    metrics['triangles']['total']=sum(metrics['triangles'].values())
    for o in lo.values():bpy.data.objects.remove(o,do_unlink=True)
    return metrics


def deformation(lows,rest):
    from lowpoly2 import evaluated
    reports={};current={}
    for o in lows:
        p=evaluated(o);current[o.name]=p;q=rest[o.name];f=triangles(o);edges=np.array([e.vertices[:] for e in o.data.edges])
        lengths=np.linalg.norm(q[edges[:,1]]-q[edges[:,0]],axis=1);new=np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1)
        ratio=new/np.maximum(lengths,1e-12)
        n0=np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]])
        n1=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
        rig=o.parent;names={g.index:g.name for g in o.vertex_groups};rot={}
        for bone in rig.pose.bones:rot[bone.name]=np.asarray(bone.matrix.to_3x3()@bone.bone.matrix_local.to_3x3().inverted())
        transport=np.zeros((len(q),3,3))
        for v in o.data.vertices:
            for g in v.groups:
                if names[g.group] in rot:transport[v.index]+=rot[names[g.group]]*g.weight
        expected=np.einsum('nij,nj->ni',transport[f].mean(1),n0)
        flip=np.einsum('ij,ij->i',expected,n1)<0
        # Cross-part intersection tests below also record existing intersections
        # at rest, rather than calling every generated contact a new failure.
        reports[o.name]={'flipped_faces_against_transported_rest_normal':int(flip.sum()),
            'collapsed_faces_area_below_1e_12':int((np.linalg.norm(n1,axis=1)<2e-12).sum()),
            'edges_over_2x_rest_length':int((ratio>2).sum()),'max_edge_stretch':float(ratio.max())}
    body=lows[0];p=current[body.name];f=triangles(body);labels=attr(body,'part_id')
    # A triangle intersection is stronger evidence than signed nearest distance
    # on this open mesh. Signed distances are retained only as candidates.
    trees={};indices={}
    for pid in [3,4,5,6,7,8,9,10]:
        ids=np.flatnonzero(labels==pid);indices[pid]=ids
        trees[pid]=BVHTree.FromPolygons(p.tolist(),f[ids].tolist(),all_triangles=True)
    cross={}
    for a,b in [(3,4),(3,5),(3,6),(3,7),(4,9),(5,9),(3,8),(4,8),(5,8),(3,10),(4,6),(5,7),(4,5)]:
        overlaps=trees[a].overlap(trees[b]);overlaps=[(i,j) for i,j in overlaps if not set(f[indices[a][i]])&set(f[indices[b][j]])]
        ids=np.unique(f[indices[a]])
        deep=[]
        for i in ids:
            q,n,k,d=trees[b].find_nearest(Vector(p[i]))
            if q is not None and d<.03 and (Vector(p[i])-q).dot(n)<-.002:deep.append(d)
        cross[PARTS[a]+' / '+PARTS[b]]={'intersecting_nonadjacent_triangle_pairs':len(overlaps),
            'signed_depth_over_2mm_candidates':len(deep),'max_candidate_depth_mm':max(deep,default=0)*1000}
    hp=current[lows[1].name]
    hf=triangles(lows[1])
    headtree=BVHTree.FromPolygons(hp.tolist(),hf.tolist(),all_triangles=True)
    for pid in [3,4,5]:
        overlaps=trees[pid].overlap(headtree);deep=[]
        for i in np.unique(f[indices[pid]]):
            q,n,k,d=headtree.find_nearest(Vector(p[i]))
            if q is not None and d<.03 and (Vector(p[i])-q).dot(n)<-.002:deep.append(d)
        cross[PARTS[pid]+' / head_hair']={'intersecting_nonadjacent_triangle_pairs':len(overlaps),
            'signed_depth_over_2mm_candidates':len(deep),'max_candidate_depth_mm':max(deep,default=0)*1000}
    reports['cross_part_diagnostics']=cross
    reports['interpretation']='flips use transported normals; signed depth on open regional surfaces is a candidate, not proof of inside. Compare rest and rendered pose.'
    return reports

