"""Surface/error attribution and deformation diagnostics, without surface edits."""
from collections import Counter,defaultdict
import math
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import coords,triangles,subset,append,write,WORK,bvh
from lowpoly_verify import topology,area_samples,head_masks

ASSEMBLY_TARGET=None

PART_NAMES={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes'}


def attr(o,name):
    a=o.data.attributes.get(name)
    values=np.zeros(len(o.data.polygons),np.int32)
    if a:a.data.foreach_get('value',values)
    return values


def parts(objects,prefix):
    body,head,cap=objects;result={}
    for pid,name in PART_NAMES.items():
        mask=attr(body,'part_id')==pid
        if np.any(mask):result[name]=subset(body,mask,prefix+name)
    for pid,name in [(0,'face_head'),(1,'hair')]:result[name]=subset(head,attr(head,'part2')==pid,prefix+name)
    result['hair_cap']=cap
    return result


def tree_arrays(o):
    p=coords(o);f=triangles(o)
    return BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)


def nearest_values(points,tree):
    d=np.empty(len(points));index=np.empty(len(points),np.int32)
    for i,p in enumerate(points):
        q,n,k,dist=tree.find_nearest(Vector(p));d[i]=dist if dist is not None else float('inf');index[i]=k if k is not None else -1
    return d,index


def classify(points,values,part,source_tree=None,retained_tree=None):
    # Conservative classification: geometric masks alone never excuse an error.
    # Recess/gap labels require actual occlusion from all eight outside cameras.
    bad=np.flatnonzero(values>.001);counts=Counter();examples=[]
    for i in bad:
        p=Vector(points[i]);kind='true_shape_deviation'
        assembly_distance=None
        if ASSEMBLY_TARGET:
            q,n,k,assembly_distance=ASSEMBLY_TARGET.find_nearest(p)
            if assembly_distance is not None and assembly_distance<=.001:kind='part_correspondence_only'
        hidden=True
        if source_tree:
            for k in range(8):
                a=k*math.pi/4;direction=Vector((math.sin(a),-math.cos(a),.12)).normalized()
                q,_,_,dist=source_tree.ray_cast(p+direction*.00008,direction,2)
                if q is None:hidden=False;break
        else:hidden=False
        if retained_tree and hidden and kind=='true_shape_deviation':
            q,n,k,d=retained_tree.find_nearest(p)
            _,_,_,original_distance=source_tree.find_nearest(p)
            if d is not None and d>.001 and original_distance is not None and original_distance<=.00025:kind='internal_surface'
        if kind=='true_shape_deviation' and hidden:
            if part=='face_head' and p.y<-.055 and .775<p.z<.85 and .015<abs(p.x)<.10:kind='eye_recess_depth'
            elif part in ['hair','hair_cap']:kind='between_hair_clumps'
        counts[kind]+=1
        if len(examples)<12 or values[i]>examples[-1]['distance_mm']/1000:
            examples.append({'xyz_m':list(p),'distance_mm':float(values[i]*1000),'cause':kind,'assembly_distance_mm':float(assembly_distance*1000) if assembly_distance is not None else None})
            examples=sorted(examples,key=lambda q:-q['distance_mm'])[:12]
    return {k:counts[k] for k in ['internal_surface','eye_recess_depth','between_hair_clumps','true_shape_deviation','part_correspondence_only']},examples


def distance(source,target,part,rng,original,retained,n=150000,exclude_cap=False):
    p=coords(source);f=triangles(source)
    if exclude_cap:
        keep=~attr(source,'neck_cap').astype(bool);f=f[keep]
        pids=np.unique(f);vertices=p[pids]
    else:vertices=p[np.unique(f)]
    points=np.concatenate([area_samples(p,f,n,rng),vertices])
    values,_=nearest_values(points,tree_arrays(target))
    counts,examples=classify(points,values,part,original,retained)
    limit=1. if part in ['torso','sleeve_L','sleeve_R','backpack','shoulder_straps','neck'] else .5
    return {'p95_mm':float(np.percentile(values,95)*1000),'max_mm':float(values.max()*1000),
        'samples':len(points),'area_samples':n,'vertices_included':len(vertices),'p95_limit_mm':limit,
        'p95_pass':bool(np.percentile(values,95)*1000<=limit),'points_over_1mm_by_cause':counts,
        'max_examples':examples,'neck_closure_excluded':exclude_cap}


def vertex_error_attribute(o,target):
    values,_=nearest_values(coords(o),tree_arrays(target))
    layer=o.data.color_attributes.get('distance_error') or o.data.color_attributes.new(name='distance_error',type='FLOAT_COLOR',domain='POINT')
    mm=values*1000;t=np.minimum(mm/2,1)
    color=np.column_stack([np.clip(t*2,0,1),np.clip(2-t*2,0,1),np.zeros(len(t)),np.ones(len(t))])
    layer.data.foreach_set('color',color.ravel())
    o['distance_error_legend']='green 0mm / yellow 1mm / red >=2mm'
    return {'max_mm':float(mm.max()),'max_xyz_m':coords(o)[np.argmax(values)].tolist()}


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
        cross[PART_NAMES[a]+' / '+PART_NAMES[b]]={'intersecting_nonadjacent_triangle_pairs':len(overlaps),
            'signed_depth_over_2mm_candidates':len(deep),'max_candidate_depth_mm':max(deep,default=0)*1000}
    hp=np.concatenate([current[lows[1].name],current[lows[2].name]])
    hf=np.concatenate([triangles(lows[1]),triangles(lows[2])+len(current[lows[1].name])])
    headtree=BVHTree.FromPolygons(hp.tolist(),hf.tolist(),all_triangles=True)
    for pid in [3,4,5]:
        overlaps=trees[pid].overlap(headtree);deep=[]
        for i in np.unique(f[indices[pid]]):
            q,n,k,d=headtree.find_nearest(Vector(p[i]))
            if q is not None and d<.03 and (Vector(p[i])-q).dot(n)<-.002:deep.append(d)
        cross[PART_NAMES[pid]+' / head_hair']={'intersecting_nonadjacent_triangle_pairs':len(overlaps),
            'signed_depth_over_2mm_candidates':len(deep),'max_candidate_depth_mm':max(deep,default=0)*1000}
    reports['cross_part_diagnostics']=cross
    reports['interpretation']='flips use transported normals; signed depth on open regional surfaces is a candidate, not proof of inside. Compare rest and rendered pose.'
    return reports


def regional_boundaries(objects):
    result={}
    for o in objects:
        f=triangles(o)
        edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1)
        _,first,count=np.unique(edges,axis=0,return_index=True,return_counts=True)
        face_id=np.tile(np.arange(len(f)),3)[first[count==1]]
        if o.name=='low2_body':
            labels=attr(o,'part_id');names=PART_NAMES
        elif o.name=='low2_head':
            labels=attr(o,'part2');names={0:'face_head',1:'hair'}
        else:
            labels=np.zeros(len(f),np.int32);names={0:'hair_cap'}
        for pid,name in names.items():result[name]=int((labels[face_id]==pid).sum())
    return result


def measure_all(out,lows,highs,exteriors):
    global ASSEMBLY_TARGET
    from lowpoly_verify import combined
    pp,ff=combined(lows);low_assembly=BVHTree.FromPolygons(pp.tolist(),ff.tolist(),all_triangles=True)
    pp,ff=combined(highs);full_assembly=BVHTree.FromPolygons(pp.tolist(),ff.tolist(),all_triangles=True)
    pp,ff=combined(exteriors);exterior_assembly=BVHTree.FromPolygons(pp.tolist(),ff.tolist(),all_triangles=True)
    ASSEMBLY_TARGET=low_assembly
    rng=np.random.default_rng(642);lo=parts(lows,'measure_low2_');hi=parts(highs,'measure_full2_');ex=parts(exteriors,'measure_ext2_')
    counts={k:len(triangles(v)) for k,v in lo.items()};counts['total']=sum(counts.values())
    metrics={'triangles':counts,'triangle_budget':{'target':53000,'limit':60000,'reserved_later':5000,'current_plus_reserved':counts['total']+5000,'pass':counts['total']<=60000},
        'topology':{o.name:topology(o) for o in lows},'open_boundary_edges_by_part':regional_boundaries(lows),'distance_method':'150000 area-weighted surface points per part and direction plus all used vertices; fixed seed 642; approximate, not exact Hausdorff',
        'outlier_method':'counts refer to sampled points >1mm, separately for each direction and part. Conservative: occlusion from all 8 outside rays required to excuse a recess/gap/internal sheet.',
        'distances_exterior':{},'distances_full_source':{},'outlier_vertex_maps':{}}
    for part in lo:
        print('DISTANCES',part,flush=True)
        original=full_assembly;retained=tree_arrays(ex[part])
        for key,source in [('distances_exterior',ex[part]),('distances_full_source',hi[part])]:
            ASSEMBLY_TARGET=low_assembly
            forward=distance(source,lo[part],part,rng,original,retained)
            ASSEMBLY_TARGET=exterior_assembly if key=='distances_exterior' else full_assembly
            backward=distance(lo[part],source,part,rng,original,retained,exclude_cap=key=='distances_exterior' and part in ['face_head','hair'])
            metrics[key][part]={'high_to_low':forward,'low_to_high':backward}
        metrics['outlier_vertex_maps'][part]=vertex_error_attribute(ex[part],lo[part])
        write(out/'metrics-progress.json',metrics)
    # The colored diagnostic copies remain saved for direct inspection in Blender.
    for o in set(lo.values())|set(hi.values()):
        if o not in highs+lows:bpy.data.objects.remove(o,do_unlink=True)
    metrics['legacy']=legacy(out,ex,rng)
    return metrics


def legacy(out,ex,rng):
    global ASSEMBLY_TARGET
    path=WORK/'lowpoly/character-lowpoly.blend'
    old=append(path,['character_lowpoly','low_hair_cap','low_legs_shoes','reference_head_similarity_only','reference_legs_shoes','reference_hair_cap_similarity_only','low_backpack_straps'])
    character,cap,legs,reference,oldlegsource,oldcapsource,oldpack=old
    face,hair=head_masks(character,reference)
    from lowpoly2 import clone
    from lowpoly_cleanup import exterior_faces
    from lowpoly import head_colors,head_hair_labels
    legacy_exterior=clone(reference,'legacy_reference_exterior');exterior_faces(legacy_exterior)
    lc=coords(legacy_exterior)[triangles(legacy_exterior)].mean(1)
    lh=head_hair_labels(head_colors(legacy_exterior),lc)
    legacy_sources={'face_head':subset(legacy_exterior,~lh,'legacy_reference_face'),
        'hair':subset(legacy_exterior,lh,'legacy_reference_hair'),'legs_shoes':oldlegsource}
    objects={'face_head':subset(character,face,'legacy_face'),'hair':subset(character,hair,'legacy_hair'),'legs_shoes':legs}
    from lowpoly import mesh_obj
    from lowpoly_verify import combined
    hp,hf=combined([objects['hair'],cap]);objects['hair']=mesh_obj('legacy_hair_with_cap',hp,hf)
    result={'note':'Same previous retained-surface selection and intentional-region exclusion remeasured; also whole-assembly nearest distance distinguishes missing part labels from missing surface.','parts':{}}
    from lowpoly_verify import intentional
    from lowpoly_verify import combined
    pp,ff=combined([character,cap,legs,oldpack]);whole=BVHTree.FromPolygons(pp.tolist(),ff.tolist(),all_triangles=True);ASSEMBLY_TARGET=whole
    for part,low in objects.items():
        print('LEGACY',part,flush=True)
        from lowpoly2 import clone
        source=clone(legacy_sources[part],'legacy_error_'+part)
        if part=='hair':
            hp,hf=combined([source,oldcapsource]);bpy.data.objects.remove(source,do_unlink=True);source=mesh_obj('legacy_error_hair',hp,hf)
        p=coords(source);f=triangles(source)
        pts=np.concatenate([area_samples(p,f,500000,rng),p]);pts=pts[~intentional(pts,part)]
        values,_=nearest_values(pts,tree_arrays(low));assembly,_=nearest_values(pts,whole)
        if part=='legs_shoes':
            original=tree_arrays(bpy.data.objects['high2_body_full'])
        else:
            from lowpoly_verify import combined
            op,of=combined([bpy.data.objects['high2_head_full'],bpy.data.objects['high2_cap_full']])
            original=BVHTree.FromPolygons(op.tolist(),of.tolist(),all_triangles=True)
        counts,examples=classify(pts,values,part,original,tree_arrays(ex[part]))
        vertex_error_attribute(source,low)
        source.name='legacy_error_'+part
        maximum=int(np.argmax(values));near=whole.find_nearest(Vector(pts[maximum]))
        result['parts'][part]={'p95_mm':float(np.percentile(values,95)*1000),'max_mm':float(values.max()*1000),
            'max_xyz_m':pts[maximum].tolist(),'max_distance_to_own_source_surface_mm':float(tree_arrays(source).find_nearest(Vector(pts[maximum]))[3]*1000),'whole_assembly_distance_at_part_max_mm':float(assembly[maximum]*1000),
            'samples':len(pts),'source_unreferenced_vertices':int(len(p)-len(np.unique(f))),'points_over_1mm_by_cause':counts,'max_examples':examples,
            'part_correspondence_outliers_over1mm_but_assembly_under1mm':int(((values>.001)&(assembly<=.001)).sum())}
    source=bpy.data.objects['high2_body_exterior']
    bodymap=subset(source,attr(source,'part_id')!=10,'legacy_error_body')
    pp,ff=combined([character,cap,legs,oldpack]);vertex_error_attribute(bodymap,mesh_obj('legacy_complete_target',pp,ff))
    bpy.data.objects.remove(bpy.data.objects['legacy_complete_target'],do_unlink=True)
    write(out/'legacy-outliers.json',result)
    # Keep source maps, but remove imported old render meshes after diagnostics.
    for o in objects.values():
        if o not in old:bpy.data.objects.remove(o,do_unlink=True)
    for o in [legacy_exterior,legacy_sources['face_head'],legacy_sources['hair']]+old:bpy.data.objects.remove(o,do_unlink=True)
    return result
