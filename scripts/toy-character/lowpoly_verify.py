"""Surface sampling, topological audit and reproducible inspection renders."""
import math, json, time
from collections import Counter
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lowpoly import coords,triangles,bvh,subset,write,recalc,head_hair_labels,head_colors
from geometry import material


def topology(o):
    f=triangles(o);p=coords(o)
    e=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1)
    unique,c=np.unique(e,axis=0,return_counts=True)
    area=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)/2
    _,dup=np.unique(np.sort(f,axis=1),axis=0,return_counts=True)
    parent=np.arange(len(p))
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for a,b in unique:
        ra=root(a);rb=root(b)
        if ra!=rb:parent[rb]=ra
    roots=np.array([root(i) for i in range(len(p))]);ids,amount=np.unique(roots,return_counts=True);main=ids[np.argmax(amount)];main_p=p[roots==main]
    return {'connected_components':len(ids),'main_component_bounds_m':[main_p.min(0).tolist(),main_p.max(0).tolist()],'main_component_contains_head_and_upper_body':bool(main_p[:,2].min()<.45 and main_p[:,2].max()>.95),'triangles':len(f),'vertices':len(p),'boundary_edges':int((c==1).sum()),'edges_shared_by_3_or_more_faces':int((c>2).sum()),'degenerate_faces':int((area<1e-14).sum()),'duplicate_faces':int(np.maximum(dup-1,0).sum()),'all_polygons_triangles':all(len(q.vertices)==3 for q in o.data.polygons)}


def combined(objects):
    p=[];f=[];offset=0
    for o in objects:
        a=coords(o);b=triangles(o);p.extend(a);f.extend(b+offset);offset+=len(a)
    return np.asarray(p),np.asarray(f,dtype=np.int32)


def area_samples(p,f,n,rng):
    area=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)/2
    ids=rng.choice(len(f),n,p=area/area.sum())
    uv=rng.random((n,2));s=np.sqrt(uv[:,0]);a=(1-s)[:,None];b=(s*(1-uv[:,1]))[:,None];c=(s*uv[:,1])[:,None]
    return p[f[ids,0]]*a+p[f[ids,1]]*b+p[f[ids,2]]*c


def intentional(p,part):
    if part in ['face_head','hair']:
        eye=json.loads((Path(__file__).resolve().parents[2]/'.work/toy-character/fidelity/design-landmarks.json').read_text())['points']
        mask=p[:,2]<.704
        for side in ['L','R']:
            edges=np.array([eye[f'eye_{side}_{k}'] for k in ['left','right','top','bottom']]);m=edges.mean(0)
            cx=(m[0]-627)/1177;cz=(1213-m[1])/1177
            mask|=(p[:,1]<-.06)&(((p[:,0]-cx)/.042)**2+((p[:,2]-cz)/.031)**2<1)
        return mask
    if part=='clothes':return p[:,2]>.664
    return np.zeros(len(p),bool)


def distances(source,target,part,rng,n=500000):
    p,f=combined(source);q,g=combined(target)
    tree=BVHTree.FromPolygons(q.tolist(),g.tolist(),all_triangles=True)
    samples=area_samples(p,f,n,rng)
    # Vertices supplement the fixed surface sample rather than replacing it.
    samples=np.concatenate([samples,p]);excluded=int(intentional(samples,part).sum());samples=samples[~intentional(samples,part)]
    values=np.empty(len(samples))
    for i,point in enumerate(samples):
        _,_,_,d=tree.find_nearest(Vector(point));values[i]=d if d is not None else np.inf
    mm=values*1000;tol=(.5,1.5) if part in ['face_head','hair'] else (1.,3.)
    return {'surface_samples_requested':n,'supplemental_source_vertices':len(p),'intentional_region_samples_excluded':excluded,'samples_tested':len(samples),'p95_mm':float(np.percentile(mm,95)),'max_mm':float(mm.max()),'mean_mm':float(mm.mean()),'p95_limit_mm':tol[0],'sample_max_limit_mm':tol[1],'pass':bool(np.percentile(mm,95)<=tol[0] and mm.max()<=tol[1]),'method':'area-weighted independent surface samples plus every vertex; nearest triangle BVH; not exact Hausdorff'}


def head_masks(o,reference):
    from fidelity_repair import texture_colors
    rgb=head_colors(reference)
    rp=coords(reference);rf=triangles(reference);rc=rp[rf].mean(1)
    rh=head_hair_labels(rgb,rc)
    tree=bvh(reference);p=coords(o);f=triangles(o);c=p[f].mean(1)
    mats=np.array([q.material_index for q in o.data.polygons])
    head=(mats>=4)|((mats==3)&(c[:,2]>.704));hair=np.zeros(len(f),bool)
    for i in np.flatnonzero(head):
        _,_,index,_=tree.find_nearest(Vector(c[i]));hair[i]=rh[index]
    return head&~hair,hair


def visible(objects):
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_render=o not in objects
    bpy.context.view_layer.update()


def verify(out,lows,highs,refs,sources,character,head,cam,render):
    print('VERIFY start',flush=True)
    face,hair=head_masks(character,head)
    lowface=subset(character,face,'metric_low_face');lowface.hide_render=True
    lowhair=subset(character,hair,'metric_low_hair');lowhair.hide_render=True
    from fidelity_repair import texture_colors
    from lowpoly_cleanup import exterior_faces
    head_outer=head.copy();head_outer.data=head.data.copy();bpy.context.collection.objects.link(head_outer);head_outer.name='retained_exterior_high_head';exterior_faces(head_outer)
    rgb=head_colors(head_outer);hp=coords(head_outer);hf=triangles(head_outer);hc=hp[hf].mean(1)
    hh=head_hair_labels(rgb,hc)
    highface=subset(head_outer,~hh,'metric_high_face');highface.hide_render=True
    highhair=subset(head_outer,hh,'metric_high_hair');highhair.hide_render=True
    mats=np.array([p.material_index for p in character.data.polygons]);centers=coords(character)[triangles(character)].mean(1)
    hand=(mats==3)&(abs(centers[:,0])>.16)
    cloth=mats<3;neck=(mats==3)&~hand&~(face|hair)
    lowcloth=subset(character,cloth,'metric_low_cloth');lowcloth.hide_render=True
    highcloth=[sources[k] for k in ['torso','L','R']]
    counts={'face_head':int(face.sum()),'hair_including_cap':int(hair.sum())+len(triangles(lows[1])),'neck_torso_sleeves':int(cloth.sum()+neck.sum()),'legs_shoes':len(triangles(lows[2])),'hands':int(hand.sum()),'backpack_straps':len(triangles(lows[3]))}
    counts['total']=sum(counts.values())
    write(out/'triangle-counts.json',counts)
    topology_reports={o.name:topology(o) for o in lows}
    write(out/'topology.json',topology_reports)
    rng=np.random.default_rng(642)
    distance={}
    for part,high,low in [('face_head',[highface],[lowface]),('hair',[highhair,highs[2]],[lowhair,lows[1]]),('clothes',highcloth,[lowcloth]),('legs_shoes',[refs['legs_shoes']],[lows[2]]),('backpack_straps',[refs['backpack_straps']],[lows[3]])]:
        print('DISTANCE',part,flush=True)
        retained=[]
        for ob in low:
            flag=ob.data.attributes.get('repair_cap')
            if flag:
                caps=np.empty(len(ob.data.polygons),np.int32);flag.data.foreach_get('value',caps)
                r=subset(ob,caps==0,'metric_retained_'+ob.name);r.hide_render=True;retained.append(r)
            else:retained.append(ob)
        distance[part]={'high_to_low':distances(high,low,part,rng),'low_to_high':distances(retained,high,part,rng),'hidden_closure_policy':'new local closure triangles have no high-density counterpart; excluded only from low-to-high samples'}
        for ob in retained:
            if ob not in low:bpy.data.objects.remove(ob,do_unlink=True)
        write(out/'distances.json',distance)
    # Also report the unfiltered immutable source, including enclosed sheets.
    # This remains separate from the retained-surface acceptance gate.
    rawbody=bpy.data.objects['reference_labeled_body']
    labels=np.empty(len(rawbody.data.polygons),np.int32);rawbody.data.attributes['part_id'].data.foreach_get('value',labels)
    rawrgb=head_colors(head);rawc=coords(head)[triangles(head)].mean(1)
    rawhair=head_hair_labels(rawrgb,rawc)
    rawface=subset(head,~rawhair,'metric_raw_face');rawh=subset(head,rawhair,'metric_raw_hair')
    rawcloth=subset(rawbody,np.isin(labels,[2,3,4,5,9]),'metric_raw_clothing')
    rawlegs=subset(rawbody,labels==10,'metric_raw_legs');rawpack=subset(rawbody,np.isin(labels,[8,9]),'metric_raw_pack')
    full_distance={}
    for part,high,low in [('face_head',[rawface],[lowface]),('hair',[rawh,highs[2]],[lowhair,lows[1]]),('clothes',[rawcloth],[lowcloth]),('legs_shoes',[rawlegs],[lows[2]]),('backpack_straps',[rawpack],[lows[3]])]:
        print('FULL SOURCE DISTANCE',part,flush=True)
        full_distance[part]={'high_to_low':distances(high,low,part,rng),'low_to_high':distances(low,high,part,rng)}
        write(out/'full-source-distances.json',full_distance)
    for ob in [rawface,rawh,rawcloth,rawlegs,rawpack]:bpy.data.objects.remove(ob,do_unlink=True)
    # Intentional surfaces receive their own structural checks instead of a
    # meaningless agreement score against fused hands or filled eye hollows.
    hand_design=json.loads((out/'hand-design.json').read_text());rings=json.loads((out/'ring-design.json').read_text());opening=json.loads((out/'eye-openings.json').read_text())
    engine=bpy.context.scene.render.engine;bpy.context.scene.render.engine='BLENDER_WORKBENCH'
    bpy.context.scene.display.shading.light='FLAT';bpy.context.scene.display.shading.color_type='SINGLE'
    bpy.context.scene.render.film_transparent=True
    for i in range(8):
        a=i*math.pi/4;xy=(2*math.sin(a),-2*math.cos(a))
        for label,objs in [('high',highs),('low',lows)]:
            visible(objs);render(out,cam,f'mask-{label}-{i}.png',(*xy,.5),(0,0,.5),1.08)
    # A separate 1024px head crop reveals local losses masked by full-body IoU.
    for label,objs in [('high',highs),('low',lows)]:
        visible(objs);render(out,cam,f'face-mask-{label}.png',(0,-2,.843),(0,0,.843),.38)
    bpy.context.scene.render.engine=engine
    for o in [lowface,lowhair,highface,highhair,lowcloth,head_outer]:bpy.data.objects.remove(o,do_unlink=True)
    return {'stage':6,'distance_reference_policy':'retained exterior triangles; enclosed generated sheets classified with escape rays are removed in method section 1; immutable full high-density geometry remains in the blend and the image comparison','triangles':counts,'triangle_budget':{'target_current_stage':45000,'reserved_eyes_lids_glasses':5000,'requested_approximate_target':50000,'hard_limit':60000,'pass':counts['total']<=60000},'distances':distance,'full_source_distances':full_distance,'intentional_changes':{'excluded':'new neck below z=.704; eye ellipses with explicit margin; whole regenerated hands','neck':rings,'hands':hand_design,'eye_openings':opening},'topology':topology_reports,'topology_pass':all(all(v[k]==0 for k in ['boundary_edges','edges_shared_by_3_or_more_faces','degenerate_faces','duplicate_faces']) for v in topology_reports.values()),'deferred_checks':['UV','bake','normals after bake','weights','deformed pose / self intersections','GLB','Web performance'],'silhouette':'measured by lowpoly_review.py from saved 1024px alpha masks; includes separate intentional-change-aware scores'}


def render_reviews(out,lows,highs,body,labels,cam,render):
    engine=bpy.context.scene.render.engine
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=800
    for i in [0,2,4,6]:
        a=i*math.pi/4;xy=(2*math.sin(a),-2*math.cos(a))
        for label,objs in [('high',highs),('low',lows)]:
            visible(objs);render(out,cam,f'view-{label}-{i}.png',(*xy,.5),(0,0,.5),1.08)
    # The wire overlay is generated from the committed triangulation, so the
    # output records the exact topology used for all subsequent stages.
    wires=[]
    wiremat=material('Inspection wire',(.003,.008,.012),.8)
    for o in lows:
        w=o.copy();w.data=o.data.copy();bpy.context.collection.objects.link(w);w.name='inspect_wire_'+o.name
        w.data.materials.clear();w.data.materials.append(wiremat)
        for f in w.data.polygons:f.material_index=0
        mod=w.modifiers.new('Exact triangle wire','WIREFRAME');mod.thickness=.00020;mod.offset=1.;mod.use_replace=True;mod.use_even_offset=False;mod.use_relative_offset=False
        wires.append(w)
    shots=[('front',(0,-2,.5),(0,0,.5),1.08),('side',(2,0,.5),(0,0,.5),1.08),('neck',(0,-2,.684),(0,0,.684),.13),('shoulder',(.9,-1.7,.61),(.11,0,.61),.22),('elbow',(.5,-1.8,.53),(.177,0,.53),.19),('hand',(0,-2,.399),(.247,-.05,.399),.17),('face',(0,-2,.84),(0,0,.84),.36)]
    for name,pos,target,scale in shots:
        visible(lows+wires);render(out,cam,f'wire-{name}.png',pos,target,scale)
    for w in wires:bpy.data.objects.remove(w,do_unlink=True)
    for name,pos in [('front',(0,-2,.805)),('oblique',(1,-1.8,.805))]:
        visible(lows);render(out,cam,f'opening-{name}.png',pos,(0,-.07,.805),.235)
    # Isolate each hand plus a short cuff; fixed camera bases show palm, back
    # and edge. Both hands and both original generated hands are rendered.
    from geometry import aim
    lm=json.loads((out.parent/'prepare/landmarks.json').read_text())
    scale=1/lm['coordinates']['height']
    for side,pid in [('L',6),('R',7)]:
        ref=subset(body,labels==pid,'inspection_original_hand_'+side)
        p=coords(lows[0]);f=triangles(lows[0]);c=p[f].mean(1);wrist=np.array(lm['joints']['wrist_'+side])*scale
        sign=1 if side=='L' else -1
        mat_ids=np.array([q.material_index for q in lows[0].data.polygons])
        mask=(c[:,0]*sign>.18)&(c[:,2]<.455)&(mat_ids==3)
        hand=subset(lows[0],mask,'inspection_new_hand_'+side)
        d=np.array(lm['hands'][side]['palm_axis']);u=np.array([0.,1.,0.]);n=np.cross(u,d);n/=np.linalg.norm(n)
        # Isolated inspection meshes are cut on the wrist plane to avoid a
        # ragged triangle selection looking like a defect in the actual cuff.
        for isolated in [ref,hand]:
            bm=bmesh.new();bm.from_mesh(isolated.data)
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=Vector(wrist-d*.001),plane_no=Vector(d),dist=1e-7,clear_inner=True,clear_outer=False)
            edges=[e for e in bm.edges if e.is_boundary]
            if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(isolated.data);bm.free();isolated.data.update()
        if side=='R':n=-n
        target=wrist+d*.046-u*.018
        for label,obj in [('new',hand),('original',ref)]:
            for view,axis in [('palm',n),('back',-n),('edge',u)]:
                visible([obj]);render(out,cam,f'hand-{side}-{label}-{view}.png',target+axis*2,target,.17)
        for o in [ref,hand]:bpy.data.objects.remove(o,do_unlink=True)
    visible(lows);scene.render.resolution_x=scene.render.resolution_y=1024
