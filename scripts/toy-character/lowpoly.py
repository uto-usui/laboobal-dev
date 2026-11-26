"""Stage 6. Collapse rigid surfaces; author and project deforming ring surfaces.

No UV creation, texture transfer, rigging or Laplacian fit. Existing source UVs
on rigid pieces are retained solely for diagnostic renders.
"""
import json, math, time, hashlib
from pathlib import Path
from collections import Counter, defaultdict
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from fidelity_blender import coords, setcoords, apply_similarity
from generated_mesh import arrays, PARTS
from geometry import material, aim

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character'
FID=WORK/'fidelity'


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')


def mesh_obj(name, verts, faces, mat=None):
    m=bpy.data.meshes.new(name);m.from_pydata(verts, [], faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o)
    if mat:m.materials.append(mat)
    for f in m.polygons:f.use_smooth=True
    return o


def activate(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o


def triangles(o):
    o.data.calc_loop_triangles()
    return np.array([t.vertices[:] for t in o.data.loop_triangles], dtype=np.int32)


def bvh(o):
    return BVHTree.FromPolygons(coords(o).tolist(), triangles(o).tolist(), all_triangles=True)


def subset(o, keep, name):
    new=o.copy();new.data=o.data.copy();new.name=name;bpy.context.collection.objects.link(new)
    bm=bmesh.new();bm.from_mesh(new.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[f for i,f in enumerate(bm.faces) if not keep[i]],context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(new.data);bm.free();new.data.update()
    return new


def append(path, names):
    with bpy.data.libraries.load(str(path),link=False) as (a,d):d.objects=names
    for o in d.objects:bpy.context.collection.objects.link(o)
    return d.objects


def recalc(o, triangulate=False):
    bm=bmesh.new();bm.from_mesh(o.data)
    if triangulate:bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
    for p in o.data.polygons:p.use_smooth=True


def clean(o, close=False, weld=True):
    """Repair only local defects. Never voxel remesh the source silhouette."""
    bm=bmesh.new();bm.from_mesh(o.data)
    before=(len(bm.verts),len(bm.faces))
    if weld:bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bm.verts.index_update()
    seen=set();bad=[]
    for f in bm.faces:
        key=tuple(sorted(v.index for v in f.verts))
        if key in seen or f.calc_area()<1e-14:bad.append(f)
        else:seen.add(key)
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
    # Excess sheets are removed locally, keeping the largest supported faces.
    excess=set()
    for e in bm.edges:
        fs=list(e.link_faces)
        if len(fs)>2:
            fs.sort(key=lambda f:f.calc_area(),reverse=True)
            excess.update(fs[2:])
    removed=len(excess)
    if excess:bmesh.ops.delete(bm,geom=list(excess),context='FACES_ONLY')
    holes=0
    if close:
        edges=[e for e in bm.edges if e.is_boundary]
        if edges:
            result=bmesh.ops.holes_fill(bm,edges=edges,sides=0);holes=len(result['faces'])
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free();o.data.update()
    return {'before_vertices_faces':before,'after_vertices_faces':[len(o.data.vertices),len(o.data.polygons)],'excess_sheet_faces_removed':removed,'hole_patches':holes}


def collapse(o, target, weights=None):
    activate(o)
    g=o.vertex_groups.new(name='ReduceAllowed')
    if weights is None:g.add(list(range(len(o.data.vertices))),1.,'REPLACE')
    else:
        for value in np.unique(weights):g.add(np.flatnonzero(weights==value).tolist(),float(value),'REPLACE')
    mod=o.modifiers.new('Rigid Collapse','DECIMATE');mod.decimate_type='COLLAPSE'
    mod.ratio=min(1.,target/len(triangles(o)));mod.use_collapse_triangulate=True;mod.use_symmetry=False
    mod.vertex_group=g.name;mod.vertex_group_factor=1.
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Loose generated sheets can stop Collapse before its target. Close/clean
    # the remaining local defects before continuing the same Collapse method.
    result=clean(o,False,weld=False)
    from lowpoly_cleanup import manifold_fans
    result['fan_closure']=manifold_fans(o,min_faces=12,min_area=1e-7)
    return result


class Surface:
    def __init__(self):self.v=[];self.f=[];self.part=[];self.groups=defaultdict(list);self.cap_faces=[]
    def vertex(self,p,group=None):
        i=len(self.v);self.v.append(tuple(p))
        if group:self.groups[group].append(i)
        return i
    def face(self,ids,part,repair=False):self.f.append(tuple(ids));self.part.append(part);self.cap_faces.append(int(repair))
    def ring(self,points,group=None):return [self.vertex(p,group) for p in points]
    def join(self,a,b,part):
        """Zipper with cyclic alignment, including unequal seam vertex counts."""
        pa=np.array([self.v[i] for i in a]);pb=np.array([self.v[i] for i in b])
        # Exhaust both orientations; nearest correspondence avoids twisting seams.
        candidates=[]
        for bb in [b,list(reversed(b))]:
            for off in range(len(bb)):
                q=bb[off:]+bb[:off]
                ids=np.floor(np.arange(len(a))*len(q)/len(a)).astype(int)
                err=np.mean(np.linalg.norm(pa-np.array([self.v[q[i]] for i in ids]),axis=1))
                candidates.append((err,q))
        b=min(candidates,key=lambda x:x[0])[1];i=j=0;na=len(a);nb=len(b)
        while i<na or j<nb:
            u=(i+1)/na if i<na else 2;v=(j+1)/nb if j<nb else 2
            if abs(u-v)<1e-8:
                self.face((a[i%na],a[(i+1)%na],b[(j+1)%nb],b[j%nb]),part);i+=1;j+=1
            elif u<v:self.face((a[i%na],a[(i+1)%na],b[j%nb]),part);i+=1
            else:self.face((a[i%na],b[(j+1)%nb],b[j%nb]),part);j+=1
    def object(self,name,materials):
        o=mesh_obj(name,self.v,self.f)
        for m in materials:o.data.materials.append(m)
        attr=o.data.attributes.new('region','INT','FACE');attr.data.foreach_set('value',self.part)
        attr=o.data.attributes.new('repair_cap','INT','FACE');attr.data.foreach_set('value',self.cap_faces)
        for f,p in zip(o.data.polygons,self.part):f.material_index=p
        for name,vs in self.groups.items():
            g=o.vertex_groups.new(name=name);g.add(vs,1.,'REPLACE')
        recalc(o)
        return o


def ordered_boundary(bm):
    pending={e for e in bm.edges if e.is_boundary};loops=[]
    while pending:
        e=pending.pop();a,b=e.verts;loop=[a,b];cur=b
        for _ in range(len(bm.edges)):
            choices=[ed for ed in cur.link_edges if ed in pending]
            if not choices:break
            ed=choices[0];pending.remove(ed);cur=ed.other_vert(cur)
            if cur==loop[0]:break
            loop.append(cur)
        loops.append(loop)
    return loops


def eye_point(cx,cz,k,factor=1.):
    # The second harmonic lets the four measured corners be asymmetric while
    # retaining a smooth 32-point closed outline through every measured point.
    points=json.loads((FID/'design-landmarks.json').read_text())['points'];side='L' if cx<0 else 'R'
    def world(key):
        x,y=points[f'eye_{side}_{key}'];return np.array([(x-627)/1177,(1213-y)/1177])
    left,right,top,bottom=[world(key) for key in ['left','right','top','bottom']]
    center=(left+right+top+bottom)/4;a=(right-left)/2;b=(top-bottom)/2;second=(right+left-top-bottom)/4
    t=k*math.pi/16
    return center+factor*(a*math.cos(t)+b*math.sin(t)+second*math.cos(2*t))


def hole_patch(o, center, radii, ring_specs, group, cut_factor=1.55):
    """Remove front faces, stitch a 32-point analytic rim into its existing border."""
    tree=bvh(o);cx,cz=center;rx,rz=radii
    bm=bmesh.new();bm.from_mesh(o.data);bm.normal_update()
    cut=[]
    for f in bm.faces:
        p=f.calc_center_median()
        if p.y>=-.06:continue
        q=np.array([[(v.co.x-cx)/rx,(v.co.z-cz)/rz] for v in f.verts])
        overlap=bool(np.any(np.sum(q*q,axis=1)<cut_factor**2))
        for a,b in zip(q,np.roll(q,-1,axis=0)):
            delta=b-a;t=float(np.clip(-np.dot(a,delta)/max(np.dot(delta,delta),1e-12),0,1))
            overlap|=np.dot(a+t*delta,a+t*delta)<cut_factor**2
        if overlap or ((p.x-cx)/rx)**2+((p.z-cz)/rz)**2<cut_factor**2:cut.append(f)
    bmesh.ops.delete(bm,geom=cut,context='FACES')
    loops=ordered_boundary(bm)
    near=[l for l in loops if np.linalg.norm(np.array([np.mean([v.co.x for v in l])-cx,np.mean([v.co.z for v in l])-cz]))<rx*2]
    if not near:raise RuntimeError('No isolated socket border '+group)
    border=min(near,key=lambda l:abs(np.mean([v.co.x for v in l])-cx)+abs(np.mean([v.co.z for v in l])-cz))
    # Parametric angular order is valid for the convex annular cut. Retain the
    # original boundary edges; never re-sort boundary vertices independently.
    s=Surface();s.v=[tuple(v.co) for v in bm.verts]
    index={v:i for i,v in enumerate(bm.verts)}
    s.f=[tuple(index[v] for v in f.verts) for f in bm.faces];s.part=[0]*len(s.f)
    outer=[index[v] for v in border];last=outer;rim_ids=[]
    for factor,depth in ring_specs:
        pp=[]
        for k in range(32):
            t=k*2*math.pi/32
            # Tilt follows the measured outer/inner eye corners.
            x,z=eye_point(cx,cz,k,factor)
            hit,_,_,_=tree.ray_cast(Vector((x,-.55,z)),Vector((0,1,0)),1)
            y=float(hit.y) if hit is not None else -.14
            pp.append((x,y+depth,z))
        ring=s.ring(pp,group if factor==1 and depth==0 else group+'_support')
        s.join(last,ring,0);last=ring
        if factor==1 and depth==0:rim_ids=ring
    # A recessed cup floor blocks the inside until the eyeball is inserted.
    mid=s.vertex(np.mean([s.v[i] for i in last],axis=0),group+'_floor')
    for a,b in zip(last,last[1:]+last[:1]):s.face((a,b,mid),0)
    # Rebuild this patch only after the rigid Collapse; UV on the entire head
    # stays diagnostic, and will be replaced during stage 7.
    old_materials=list(o.data.materials)
    # Preserve existing UV corners on all retained faces in a separate array.
    uv=bm.loops.layers.uv.active
    retained_uv=[[(l[uv].uv.x,l[uv].uv.y) for l in f.loops] for f in bm.faces] if uv else []
    retained_mat=[f.material_index for f in bm.faces]
    cap_layer=bm.faces.layers.int.get('repair_cap')
    retained_caps=[f[cap_layer] if cap_layer else 0 for f in bm.faces]
    old_groups={g.name:[v.index for v in o.data.vertices if any(x.group==g.index and x.weight>.5 for x in v.groups)] for g in o.vertex_groups}
    old_to_new={v.index:i for i,v in enumerate(bm.verts)}
    old_groups={name:[old_to_new[i] for i in ids if i in old_to_new] for name,ids in old_groups.items()}
    old_count=len(bm.faces);bm.free()
    new=bpy.data.meshes.new(o.name+'_socket');new.from_pydata(s.v,[],s.f);new.update()
    for m in old_materials:new.materials.append(m)
    if retained_uv:
        layer=new.uv_layers.new(name='Source diagnostic UV')
        for f,uvs in zip(list(new.polygons)[:old_count],retained_uv):
            for li,value in zip(f.loop_indices,uvs):layer.data[li].uv=value
    for i,p in enumerate(new.polygons):p.material_index=retained_mat[i] if i<old_count else len(old_materials)-1
    attr=new.attributes.new('repair_cap','INT','FACE');attr.data.foreach_set('value',retained_caps+[0]*(len(new.polygons)-old_count))
    o.data=new
    o.vertex_groups.clear()
    for name,vs in old_groups.items():
        g=o.vertex_groups.new(name=name)
        if vs:g.add(vs,1.,'REPLACE')
    for name,vs in s.groups.items():
        g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);g.add(vs,1.,'REPLACE')
    recalc(o)
    return {'rim_vertices':32,'surface_rings':4,'wall_depth_m':ring_specs[-1][1], 'rim_vertex_ids':rim_ids,'center_xz':list(center),'radii_xz':list(radii),'removed_faces':len(cut)}


def trim_neck(o, z):
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,z),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
    loops=ordered_boundary(bm)
    at=[l for l in loops if max(abs(v.co.z-z) for v in l)<1e-5]
    bm.to_mesh(o.data);bm.free();o.data.update()
    return len(at)


def source_inputs(out):
    raw=append(FID/'body-normalized.blend',['body_height_1m'])[0]
    raw.name='reference_body_normalized';raw.hide_render=True
    prepared=append(WORK/'prepare/source.blend',['generated_high_density_source'])[0]
    # The prepare labels are in the welded source ordering. Verify the scale
    # against the independently normalized fidelity input before using them.
    lm=json.loads((WORK/'prepare/landmarks.json').read_text());scale=1/lm['coordinates']['height']
    setcoords(prepared,coords(prepared)*scale)
    labels=np.empty(len(prepared.data.polygons),np.int32);prepared.data.attributes['part_id'].data.foreach_get('value',labels)
    assert np.max(abs(coords(prepared).min(0)-coords(raw).min(0)))<1e-6
    assert np.max(abs(coords(prepared).max(0)-coords(raw).max(0)))<1e-6
    prepared.name='reference_labeled_body';prepared.hide_render=True
    head,cap=append(FID/'repaired-head.blend',['repaired_head_seed_42','hair_inner_cap_seed_42'])
    fit=json.loads((FID/'fit-landmarks.json').read_text())
    for o in [head,cap]:
        p=apply_similarity(coords(o),fit['isotropic_scale'],np.array(fit['image_translation_px']))
        p[:,1]+=fit['geometry']['neck_depth_translation_m'];setcoords(o,p)
    head.name='reference_head_similarity_only';cap.name='reference_hair_cap_similarity_only'
    head.hide_render=cap.hide_render=True
    joints={n:np.array(v)*scale for n,v in lm['joints'].items()}
    write(out/'inputs.json',{'body':'fidelity/body-normalized.blend','labels':'prepare/source.blend:part_id','head':'fidelity/repaired-head.blend','head_transform':'isotropic scale and translation from fit-landmarks; no fitted vertex positions read','landmark_scale':scale,'original_landmark_height':lm['coordinates']['height'],'normalized_body_height':float(np.ptp(coords(raw)[:,2])),'inputs_sha256':{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [FID/'body-normalized.blend',FID/'repaired-head.blend',WORK/'prepare/source.blend',FID/'design-landmarks.json']}})
    return prepared,labels,head,cap,joints,lm,raw


def head_colors(obj):
    from fidelity_repair import texture_colors
    rgb=texture_colors(obj).reshape(-1,3,3).mean(1)
    slots=np.array([f.material_index for f in obj.data.polygons])
    for i,mat in enumerate(obj.data.materials):
        bs=mat.node_tree.nodes.get('Principled BSDF') if mat and mat.use_nodes else None
        if bs and not bs.inputs['Base Color'].is_linked:
            rgb[slots==i]=bs.inputs['Base Color'].default_value[:3]
    return rgb


def head_hair_labels(rgb,c):
    return (rgb.max(1)<.16)&((c[:,2]>.842)|(abs(c[:,0])>.095)|(c[:,1]>-.055))


def build_rigid(body,labels,head,cap,out):
    from fidelity_repair import texture_colors
    rgb=head_colors(head)
    p=coords(head);f=triangles(head);c=p[f].mean(1)
    hair=head_hair_labels(rgb,c)
    # Keep skin and hair together across their boundary, preserving the join.
    low=head.copy();low.data=head.data.copy();bpy.context.collection.objects.link(low);low.name='low_head_hair'
    from lowpoly_cleanup import exterior_faces
    print('HEAD exterior classification',flush=True)
    exterior=exterior_faces(low)
    print('HEAD weld/clean',exterior,flush=True)
    repair=clean(low,False)
    repair['exterior']=exterior
    from lowpoly_cleanup import manifold_fans
    repair['manifold_fans']=manifold_fans(low)
    # Classify the welded copy once more in its own face order.
    rgb=head_colors(low);p=coords(low);f=triangles(low);c=p[f].mean(1)
    hair=head_hair_labels(rgb,c)
    weights=np.ones(len(p))
    print('HEAD collapse',len(low.data.polygons),flush=True)
    repair['initial_collapse']=collapse(low,33000,weights)
    # Allocate the second pass only to hair. Face vertices and the shared
    # boundary are zero-weight protected, following the agreed Collapse setup.
    from fidelity_repair import texture_colors
    source_rgb=head_colors(head)
    source_c=coords(head)[triangles(head)].mean(1);source_hair=head_hair_labels(source_rgb,source_c);source_tree=bvh(head)
    lp=coords(low);lf=triangles(low);lc=lp[lf].mean(1)
    hair_faces=np.array([source_hair[source_tree.find_nearest(Vector(point))[2]] for point in lc])
    permitted=np.ones(len(lp));permitted[np.unique(lf[~hair_faces])]=0
    repair['collapse']=collapse(low,18000,permitted)

    print('HEAD collapsed',len(low.data.polygons),flush=True)
    trim_neck(low,.687)
    # Trim creates the intended seam; all earlier accidental holes are patched.
    skin=material('New socket and neck skin',(.63,.31,.18),.63);low.data.materials.append(skin)
    eye=json.loads((FID/'design-landmarks.json').read_text())['points'];opening={}
    for side in ['L','R']:
        a=np.array(eye[f'eye_{side}_left']);b=np.array(eye[f'eye_{side}_right']);top=np.array(eye[f'eye_{side}_top']);bottom=np.array(eye[f'eye_{side}_bottom'])
        mid=(a+b+top+bottom)/4
        opening[side]=hole_patch(low,((mid[0]-627)/1177,(1213-mid[1])/1177),((b[0]-a[0])/2354,(bottom[1]-top[1])/2354),[(1.40,0),(1.23,0),(1.10,0),(1.,0),(1.,.010),(0.93,.018)],'eye_'+side,1.6)
    lowcap=cap.copy();lowcap.data=cap.data.copy();bpy.context.collection.objects.link(lowcap);lowcap.name='low_hair_cap'
    print('CAP collapse',flush=True)
    caprepair=manifold_fans(lowcap);caprepair['collapse']=collapse(lowcap,1000)
    fixed=[];refs={};repairs={'head':repair,'hair_cap':caprepair}
    for name,mask,target in [('legs_shoes',labels==10,6000),('backpack_straps',np.isin(labels,[8,9]),3000)]:
        ref=subset(body,mask,'reference_'+name);ref.hide_render=True;exterior_faces(ref);refs[name]=ref
        print('FIXED',name,flush=True)
        obj=subset(body,mask,'low_'+name);ex=exterior_faces(obj);clean(obj,False);repairs[name]=manifold_fans(obj);repairs[name]['exterior']=ex;repairs[name]['collapse']=collapse(obj,target);fixed.append(obj)
    write(out/'rigid-repairs.json',repairs);write(out/'eye-openings.json',opening)
    return low,lowcap,fixed,refs,skin


def project_radial(tree, center, direction, extent=.35):
    # Exterior-to-interior ray picks the intended visible fold in a local part.
    hit,_,_,_=tree.ray_cast(Vector(center+direction*extent),Vector(-direction),extent-.0001)
    if hit is None:
        hit,_,_,_=tree.find_nearest(Vector(center+direction*.05))
    return np.array(hit) if hit is not None else center+direction*.05


def make_upper(body, labels, joints, skin, out):
    mats=[material('Torso diagnostic red',(.24,.035,.045),.85),material('Left sleeve diagnostic orange',(.55,.19,.09),.85),material('Right sleeve diagnostic blue',(.025,.18,.24),.85),skin]
    # Diagnostic region colors avoid UV or color projection in this stage.
    sources={}
    for key,ids in [('torso',[2,3,9]),('L',[4]),('R',[5])]:
        ob=subset(body,np.isin(labels,ids),'reference_deform_'+key);ob.hide_render=True
        from lowpoly_cleanup import exterior_faces
        exterior_faces(ob)
        sources[key]=ob
    trees={k:bvh(o) for k,o in sources.items()}
    s=Surface();N=48
    # 18 principal torso levels. Extra samples subdivide the panels while all
    # backbone stations and the two rectangular shoulder patches stay explicit.
    levels=np.r_[np.linspace(.367,.505,9),np.linspace(.522,.645,7),.681,.696]
    rows=[]
    for iz,z in enumerate(levels):
        center=np.array([0,.009,z]);pp=[]
        for k in range(N):
            a=2*math.pi*k/N;d=np.array([math.cos(a),math.sin(a),0.])
            q=project_radial(trees['torso'],center,d)
            q[2]=z
            # Stop under the collar, reducing its mouth to the neck ring later.
            pp.append(q)
        rows.append(s.ring(pp,'torso_station_%02d'%iz))
    # A 10x6 panel has a 32-vertex perimeter, flowing front/back through axilla.
    shoulder_borders={}
    for side,center_k in [('L',0),('R',24)]:
        k0=center_k-5;k1=center_k+5;r0=9;r1=15
        path=[(r0,k) for k in range(k0,k1)]+[(r,k1) for r in range(r0,r1)]+[(r1,k) for k in range(k1,k0,-1)]+[(r,k0) for r in range(r1,r0,-1)]
        shoulder_borders[side]=[rows[r][k%N] for r,k in path]
    for r in range(len(rows)-1):
        for k in range(N):
            if 9<=r<15 and any((k-center)%N in list(range(43,48))+list(range(5)) for center in [0,24]):continue
            s.face((rows[r][k],rows[r][(k+1)%N],rows[r+1][(k+1)%N],rows[r+1][k]),0)
    # Closed hidden base. Legs are a rigid, separate enclosed part under the hem.
    s.face(tuple(reversed(rows[0])),0,repair=True)
    wrists={}
    for side,part in [('L',1),('R',2)]:
        shoulder=joints['shoulder_'+side];elbow=joints['elbow_'+side];wrist=joints['wrist_'+side]
        # Section schedule includes a seven-ring elbow block and five wrist rings.
        ts=np.unique(np.round(np.r_[np.linspace(.04,.80,20),.40,.43,.46,.50,.52,.55,.58,.86,.90,.94,.97,1.],6))
        last=shoulder_borders[side]
        for ix,t in enumerate(ts):
            center=(shoulder*(1-t*2)+elbow*(t*2)) if t<=.5 else elbow*(2-t*2)+wrist*(t*2-1)
            tangent=(elbow-shoulder) if t<=.5 else (wrist-elbow);tangent=tangent/np.linalg.norm(tangent)
            u=np.array([0.,1.,0.]);v=np.cross(tangent,u);v/=np.linalg.norm(v)
            pp=[]
            for k in range(32):
                a=2*math.pi*k/32;d=u*math.cos(a)+v*math.sin(a)
                pp.append(project_radial(trees[side],center,d,.16))
            ring=s.ring(pp,f'sleeve_{side}_station_{ix:02d}');s.join(last,ring,part);last=ring
        wrists[side]=last
    # Collar -> neck is a real bridge, not overlapping closed cylinders.
    last=rows[-1]
    neckrings=[]
    for iz,z in enumerate(np.linspace(.669,.687,6)):
        pp=[]
        for k in range(32):
            a=2*math.pi*k/32
            # The top seam will be pulled exactly onto the head border at join.
            pp.append((.034*math.cos(a),.004+.030*math.sin(a),z))
        ring=s.ring(pp,f'neck_ring_{iz}');s.join(last,ring,3);last=ring;neckrings.append(ring)
    # Densify only clothing panels; anatomy ring indices remain in vertex groups.
    upper=s.object('low_upper_hands_neck',mats)
    write(out/'ring-design.json',{'torso_principal_rings':18,'torso_circumference':48,'shoulder_patch':'continuous 10x6 torso panel ->32 sleeve ring; front/back/axilla connected','sleeve_circumference':32,'elbow_support_rings':7,'wrist_support_rings':5,'neck_circumference':32,'neck_length_rings':6,'neck_z_m':[.669,.687],'collar_top_z_m':.696,'collar_basis':'source red collar p95 z=.696962m; neck seam z=.687 is beneath collar','sleeve_stations':len(ts)})
    return s,upper,wrists,neckrings[-1],sources,mats


def add_hands(s,wrists,joints,lm,scale,out):
    reports={};part=3
    for side in ['L','R']:
        wrist=joints['wrist_'+side];d=np.array(lm['hands'][side]['palm_axis']);u=np.array([0.,1.,0.]);n=np.cross(u,d);n/=np.linalg.norm(n)
        if side=='R':n=-n
        mcp=np.array([joints[f'{f}_mcp_{side}'] for f in ['index','middle','ring','little']]);knuckle=mcp.mean(0)
        knuckle=knuckle-d*.004
        spacing=float(np.mean(np.diff(mcp[:,1])));width=4*spacing;thick=.024
        # Distal rectangular wall: four 3x3 cells, each with a 12-vertex port.
        grid={}
        def point(i,j):
            a=(i/12-.5)*2;b=(j/3-.5)*2
            return knuckle+u*(a*width/2*math.sqrt(1-.28*b*b))+n*(b*thick/2*math.sqrt(1-.28*a*a))
        for i in range(13):
            for j in range(4):
                if i%3==0 or j in [0,3]:grid[i,j]=s.vertex(point(i,j))
        perimeter=[(i,0) for i in range(12)]+[(12,j) for j in range(3)]+[(i,3) for i in range(12,0,-1)]+[(0,j) for j in range(3,0,-1)]
        distal=[grid[x] for x in perimeter]
        palmrows=[]
        # Rectangular sections round into an ellipse under the sleeve.
        for r in range(9):
            t=r/8;center=wrist*(1-t)+knuckle*t;pp=[]
            for i,j in perimeter:
                a=(i/12-.5)*2;b=(j/3-.5)*2
                halfwidth=(1-t)*.025+t*width/2+.002*math.sin(math.pi*t);halfthick=(1-t)*.017+t*thick/2+.002*math.sin(math.pi*t)
                pp.append(center+u*(a*halfwidth*math.sqrt(1-.28*b*b))+n*(b*halfthick*math.sqrt(1-.28*a*a)))
            palmrows.append(distal if r==8 else s.ring(pp,f'palm_{side}_{r}'))
        # Thumb port occupies three longitudinal and three depth-side panels.
        # Side i=0 is next to the index finger; fingers are distinct from MCP on.
        thumb_indices=[idx for idx,(i,j) in enumerate(perimeter) if i==0]
        # Actual i=0 side spans segments 27,28,29 in this winding.
        skip={27,28,29}
        for r in range(8):
            for k in range(30):
                if 2<=r<5 and k in skip:continue
                s.face((palmrows[r][k],palmrows[r][(k+1)%30],palmrows[r+1][(k+1)%30],palmrows[r+1][k]),part)
        thumb_border=[palmrows[2][k] for k in [27,28,29]]+[palmrows[r][0] for r in [2,3,4]]+[palmrows[5][k] for k in [0,29,28]]+[palmrows[r][27] for r in [5,4,3]]
        s.join(wrists[side],palmrows[0],part)
        chains={}
        for fi,finger in enumerate(['index','middle','ring','little']):
            k0=fi*3
            frame=[(i,0) for i in range(k0,k0+3)]+[(k0+3,j) for j in range(3)]+[(i,3) for i in range(k0+3,k0,-1)]+[(k0,j) for j in range(3,0,-1)]
            border=[grid[x] for x in frame]
            # Direction follows each measured/estimated chain; mild curling is
            # normal to the palm, keeping the fingers open in the A-pose.
            controls=np.array([joints[f'{finger}_{j}_{side}'] for j in ['mcp','pip','dip','tip']])
            chains[finger]=finger_tube(s,border,controls,u,n,side,finger,.0085 if fi<3 else .0074,part)
        controls=np.array([joints[f'thumb_{j}_{side}'] for j in ['cmc','mcp','ip','tip']])
        # The CMC candidate lies inside the palm. The actual thumb web starts at
        # its authored side port; move only that first station to the web.
        controls[0]=np.mean([s.v[i] for i in thumb_border],axis=0)
        thumb_direction=controls[1]-controls[0];thumb_direction/=np.linalg.norm(thumb_direction);controls[0]+=thumb_direction*.003
        chains['thumb']=finger_tube(s,thumb_border,controls,u,n,side,'thumb',.010,part)
        reports[side]={'palm_width_m':width,'palm_thickness_m':thick,'source_wrist_m':wrist.tolist(),'finger_chains':chains,'finger_count':5,'finger_circumference':12,'joint_support_rings':3,'pose':'open relaxed A-pose; modest normal-plane curl','thumb_cmc_policy':'palm-side web anchor replaces the internal estimated CMC candidate'}
    write(out/'hand-design.json',reports)


def finger_tube(s,border,controls,u,n,side,name,radius,part):
    length=np.linalg.norm(np.diff(controls,axis=0),axis=1);arc=np.r_[0,np.cumsum(length)]
    # Every joint has before / center / after support. The MCP before-ring is
    # kept outside the web rather than extending a detached finger into palm.
    stations=np.unique(np.r_[-.002,0,.002,arc[1]-.002,arc[1],arc[1]+.002,arc[2]-.0018,arc[2],arc[2]+.0018,arc[-1]-.004,arc[-1]-.002,arc[-1]-.0005])
    if name=='thumb':stations=np.unique(np.r_[-.002,0,.002,arc[1]-.002,arc[1],arc[1]+.002,arc[2]-.002,arc[2],arc[2]+.002,arc[-1]-.003,arc[-1]-.001])
    last=border;groups={};allrings=[]
    for ri,t in enumerate(stations):
        idx=min(np.searchsorted(arc,t,side='right')-1,2);idx=max(idx,0);w=(t-arc[idx])/max(length[idx],1e-8)
        center=controls[idx]*(1-w)+controls[idx+1]*w;fraction=t/arc[-1]
        center=center+n*(.0025*fraction**2)
        tangent=controls[idx+1]-controls[idx];tangent/=np.linalg.norm(tangent)
        a=u-tangent*np.dot(u,tangent)
        if np.linalg.norm(a)<.1:a=n-tangent*np.dot(n,tangent)
        a/=np.linalg.norm(a);b=np.cross(tangent,a);b/=np.linalg.norm(b)
        taper=1-.20*fraction
        if t>arc[-1]-.004:taper*=math.sqrt(max(.07,1-((t-(arc[-1]-.004))/.004)**2))
        pp=[center+radius*taper*(a*math.cos(k*math.pi/6)+b*.82*math.sin(k*math.pi/6)) for k in range(12)]
        group=f'{side}_{name}_ring_{ri:02d}';ring=s.ring(pp,group);s.join(last,ring,part);last=ring;allrings.append(ring)
    tip=s.vertex(controls[-1]+n*.0025,f'{side}_{name}_tip')
    for a,b in zip(last,last[1:]+last[:1]):s.face((a,b,tip),part)
    return {'controls_m':controls.tolist(),'joint_arc_positions_m':arc.tolist(),'ring_arc_positions_m':stations.tolist(),'ring_vertex_ids':allrings,'tip_vertex_id':tip,'mcp_before_ring':'palm port / first two support rings'}


def connect_head(upper,head):
    # Join objects first, then bridge the actual two boundary loops. Seam vertex
    # IDs are retained as groups for deterministic weights in the later stage.
    activate(upper);head.select_set(True);bpy.ops.object.join();upper.name='character_lowpoly'
    bm=bmesh.new();bm.from_mesh(upper.data);loops=ordered_boundary(bm)
    neck=[]
    for l in loops:
        pp=np.array([tuple(v.co) for v in l]);center=pp.mean(0)
        if abs(center[0])<.04 and max(abs(v.co.z-.687) for v in l)<1e-5:neck.append(l)
    if len(neck)<2:raise RuntimeError(f'Expected neck and head borders, got {len(neck)}')
    tube=min(neck,key=lambda l:abs(len(l)-32)+np.linalg.norm(np.mean([tuple(v.co) for v in l],0)-[0,.004,.687]))
    head_border=max([l for l in neck if l is not tube],key=lambda l:sum((v.co-w.co).length for v,w in zip(l,l[1:]+l[:1])))
    for loop in neck:
        if loop is tube or loop is head_border:continue
        center=bm.verts.new(sum((v.co for v in loop),Vector((0,0,0)))/len(loop))
        for a,b in zip(loop,loop[1:]+loop[:1]):
            face=bm.faces.new((a,b,center));face.material_index=3
    neck=[tube,head_border]
    # The head seam is usually more finely sampled than the neck's 32 vertices.
    # bmesh bridge supports unequal counts poorly; use the explicit zipper.
    bm.verts.index_update();s=Surface();s.v=[tuple(v.co) for v in bm.verts]
    s.join([v.index for v in neck[0]],[v.index for v in neck[1]],3)
    verts=list(bm.verts)
    for ids in s.f:
        try:f=bm.faces.new([verts[i] for i in ids]);f.material_index=3
        except ValueError:pass
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(upper.data);bm.free();upper.data.update()
    return upper


def densify_clothes(o,target=14000):
    # Only split existing designed cloth quads. Edge subdivision follows the
    # authored rings and does not invoke an automatic retopology method.
    bm=bmesh.new();bm.from_mesh(o.data);faces=[f for f in bm.faces if f.material_index==0 or (f.material_index<3 and f.calc_center_median().z>.557)]
    edges={e for f in faces for e in f.edges}
    bmesh.ops.subdivide_edges(bm,edges=list(edges),cuts=1,use_grid_fill=True)
    bm.to_mesh(o.data);bm.free();o.data.update()
    recalc(o)


def run(out,studio,render):
    start=time.time();body,labels,head,cap,joints,lm,raw=source_inputs(out)
    lowhead,lowcap,fixed,refs,skin=build_rigid(body,labels,head,cap,out)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'rigid-checkpoint.blend'))
    print('UPPER rings',flush=True)
    s,temp,wrists,necktop,sources,mats=make_upper(body,labels,joints,skin,out)
    bpy.data.objects.remove(temp,do_unlink=True)
    add_hands(s,wrists,joints,lm,1/lm['coordinates']['height'],out)
    upper=s.object('low_upper_hands_neck',mats)
    densify_clothes(upper)
    # Fit the subdivided panels to their labeled local source. Connecting rings
    # and all skin surfaces are excluded, as required by the deformation design.
    p=coords(upper);tree={k:bvh(o) for k,o in sources.items()};allowed={0:[],1:[],2:[]}
    for f in upper.data.polygons:
        if f.material_index<3:
            for v in f.vertices:allowed[f.material_index].append(v)
    skinverts={v for f in upper.data.polygons if f.material_index==3 for v in f.vertices}
    for slot,key in [(0,'torso'),(1,'L'),(2,'R')]:
        for i in (set(allowed[slot])-skinverts):
            if i < len(s.v):continue
            q,_,_,dist=tree[key].find_nearest(Vector(p[i]))
            if q is not None and dist<.025:p[i]=q
    setcoords(upper,p)
    character=connect_head(upper,lowhead)
    lows=[character,lowcap]+fixed
    from lowpoly_cleanup import manifold_fans
    final_repair=[]
    from lowpoly_verify import topology
    for attempt in range(3):
        bm=bmesh.new();bm.from_mesh(character.data)
        tiny=[e for e in bm.edges if e.calc_length()<1e-8]
        if tiny:bmesh.ops.collapse(bm,edges=tiny,uvs=False)
        bm.to_mesh(character.data);bm.free();character.data.update()
        repair=clean(character,False,weld=False)
        repair['closure']=manifold_fans(character,min_faces=8,min_area=1e-8)
        recalc(character,True);repair['topology']=topology(character);final_repair.append(repair)
        if all(repair['topology'][k]==0 for k in ['boundary_edges','edges_shared_by_3_or_more_faces','degenerate_faces','duplicate_faces']):break
    write(out/'final-connection-repair.json',final_repair)
    # Refresh authored ring IDs after local vertex fan splits and edge cleanup.
    group_ids={g.index:g.name for g in character.vertex_groups};membership=defaultdict(list)
    for v in character.data.vertices:
        for g in v.groups:
            if g.weight>.5:membership[group_ids[g.group]].append(v.index)
    hand_report=json.loads((out/'hand-design.json').read_text())
    for side,record in hand_report.items():
        for finger,chain in record['finger_chains'].items():
            chain['ring_vertex_ids']=[membership[f'{side}_{finger}_ring_{i:02d}'] for i in range(len(chain['ring_arc_positions_m']))]
            chain['tip_vertex_ids']=membership[f'{side}_{finger}_tip']
            chain['tip_vertex_id']=chain['tip_vertex_ids'][0]
    write(out/'hand-design.json',hand_report)
    write(out/'actual-ring-counts.json',{'neck':{name:len(ids) for name,ids in membership.items() if name.startswith('neck_ring_')},'sleeves':{name:len(ids) for name,ids in membership.items() if name.startswith('sleeve_')}})
    refresh_eye_rim_groups(character,out)
    # Keep bake sources hidden. All models are packed,
    # and final low geometry has no shape-changing modifiers left unapplied.
    reference=subset(body,~np.isin(labels,[0,1]),'reference_body_without_old_head');reference.hide_render=True
    highs=[reference,head,cap]
    for o in lows:recalc(o,True);o.hide_render=False;o.hide_set(False)
    write(out/'palm-rounding.json',round_palms(character))
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and o not in lows:o.hide_render=True
    cam=studio();bpy.context.scene.render.film_transparent=True
    bpy.context.scene.render.resolution_x=bpy.context.scene.render.resolution_y=1024
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'geometry-checkpoint.blend'))
    from lowpoly_verify import verify, render_reviews
    metrics=verify(out,lows,highs,refs,sources,character,head,cam,render)
    render_reviews(out,lows,highs,body,labels,cam,render)
    metrics['elapsed_seconds']=time.time()-start;write(out/'metrics.json',metrics)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.file.pack_all()
    # A ready-to-open view shows the completed low mesh only.
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_set(o not in lows);o.hide_render=o not in lows
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly.blend'))
    print('LOWPOLY FINISHED',json.dumps(metrics.get('triangles',{})),flush=True)


def round_palms(character):
    """Soften authored palm panels while all finger joint rings stay fixed."""
    p=coords(character);original=p.copy();selected=set();fingers=set();cloth=set()
    names={g.index:g.name for g in character.vertex_groups}
    for v in character.data.vertices:
        if any(names[g.group].startswith(tuple(f'{side}_{finger}_' for side in ['L','R'] for finger in ['index','middle','ring','little','thumb'])) for g in v.groups):fingers.add(v.index)
    for face in character.data.polygons:
        center=np.mean(p[list(face.vertices)],axis=0)
        if face.material_index<3:cloth.update(face.vertices)
        if face.material_index==3 and abs(center[0])>.18 and center[2]<.455:selected.update(face.vertices)
    selected-=fingers|cloth
    adjacency=defaultdict(set)
    for edge in character.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    for _ in range(5):
        q=p.copy()
        for i in selected:
            if adjacency[i]:q[i]=p[i]*.72+np.mean(p[list(adjacency[i])],axis=0)*.28
        delta=q-original;length=np.linalg.norm(delta,axis=1);factor=np.minimum(1.,.004/np.maximum(length,1e-12));p=original+delta*factor[:,None]
    setcoords(character,p);recalc(character,True);character['palm_rounding_applied']=True
    return {'palm_vertices_smoothed':len(selected),'finger_ring_vertices_fixed':len(fingers),'max_displacement_m':float(np.linalg.norm(p-original,axis=1).max()),'iterations':5,'maximum_allowed_m':.004}


def refresh_eye_rim_groups(character,out):
    records=json.loads((out/'eye-openings.json').read_text());p=coords(character)
    for side,record in records.items():
        cx,cz=record['center_xz'];rx,rz=record['radii_xz'];rim=[]
        for k in range(32):
            x,z=eye_point(cx,cz,k)
            err=(p[:,0]-x)**2+(p[:,2]-z)**2;ids=np.flatnonzero((err<1e-12)&(p[:,1]<-.06))
            if not len(ids):raise RuntimeError('Authored eye rim vertex lost')
            rim.append(int(ids[np.argmin(p[ids,1])]))
        record['rim_vertex_ids']=rim
        actual={key:[float(627+p[rim[index],0]*1177),float(1213-p[rim[index],2]*1177)] for key,index in [('left',16),('right',0),('top',8),('bottom',24)]}
        target=json.loads((FID/'design-landmarks.json').read_text())['points']
        record['outline_method']='smooth periodic curve through the four measured image anchors'
        record['actual_image_anchors_px']=actual
        record['max_anchor_error_px']=max(float(np.linalg.norm(np.array(value)-target[f'eye_{side}_{key}'])) for key,value in actual.items())
        group=character.vertex_groups.get('eye_'+side) or character.vertex_groups.new(name='eye_'+side)
        group.add(rim,1.,'REPLACE')
    write(out/'eye-openings.json',records)


def run_review(out,studio,render):
    """Refresh inspection after palm-only smoothing; retain other verified shapes."""
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly.blend'))
    character=bpy.data.objects['character_lowpoly']
    lows=[character,bpy.data.objects['low_hair_cap'],bpy.data.objects['low_legs_shoes'],bpy.data.objects['low_backpack_straps']]
    high=[bpy.data.objects['reference_body_without_old_head'],bpy.data.objects['reference_head_similarity_only'],bpy.data.objects['reference_hair_cap_similarity_only']]
    body=bpy.data.objects['reference_labeled_body'];labels=np.empty(len(body.data.polygons),np.int32);body.data.attributes['part_id'].data.foreach_get('value',labels)
    old=coords(character);fixed=(abs(old[:,0])<=.18)|(old[:,2]>=.455)
    before=hashlib.sha256(old[fixed].tobytes()).hexdigest()
    refresh_eye_rim_groups(character,out)
    if not character.get('palm_rounding_applied'):
        write(out/'palm-rounding.json',round_palms(character))
    after=hashlib.sha256(coords(character)[fixed].tobytes()).hexdigest();assert before==after,'Non-hand geometry changed during review refresh'
    from lowpoly_verify import topology,visible,render_reviews
    metrics=json.loads((out/'metrics.json').read_text())
    metrics['topology']={o.name:topology(o) for o in lows}
    metrics['topology_pass']=all(all(v[k]==0 for k in ['boundary_edges','edges_shared_by_3_or_more_faces','degenerate_faces','duplicate_faces']) for v in metrics['topology'].values())
    metrics['intentional_changes']['eye_openings']=json.loads((out/'eye-openings.json').read_text())
    metrics['review_refresh']={'change':'palm surface rounding only; fixed finger joint rings, no non-hand position changes','unchanged_nonhand_sha256_before':before,'unchanged_nonhand_sha256_after':after,'distance_measurement':'retained, because all measured non-hand surfaces are unchanged; hand and silhouette inspection rerendered'}
    cam=bpy.context.scene.camera;scene=bpy.context.scene;engine=scene.render.engine
    scene.render.engine='BLENDER_WORKBENCH';scene.render.film_transparent=True;scene.render.resolution_x=scene.render.resolution_y=1024
    scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE'
    for i in range(8):
        a=i*math.pi/4;xy=(2*math.sin(a),-2*math.cos(a));visible(lows)
        render(out,cam,f'mask-low-{i}.png',(*xy,.5),(0,0,.5),1.08)
    scene.render.engine=engine
    render_reviews(out,lows,high,body,labels,cam,render)
    # Separate clay panels make it possible to inspect geometry without the
    # intentionally unfinished retained UVs on locally patched triangles.
    old_materials={o.name:list(o.data.materials) for o in lows}
    clay=material('Lowpoly geometry inspection clay',(.42,.42,.42),.85)
    for o in lows:
        for i in range(len(o.data.materials)):o.data.materials[i]=clay
    visible(lows)
    for label,pos,target,scale in [('body',(0,-2,.5),(0,0,.5),1.08),('neck',(0,-2,.684),(0,0,.684),.14),('face',(0,-2,.815),(0,0,.815),.26)]:
        render(out,cam,'clay-'+label+'.png',pos,target,scale)
    for o in lows:
        for i,m in enumerate(old_materials[o.name]):o.data.materials[i]=m
    metrics['inspection_clay_panels']=['clay-body.png','clay-neck.png','clay-face.png']
    write(out/'metrics.json',metrics)
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_set(o not in lows);o.hide_render=o not in lows
    cam.location=(1.15,-2,.8);aim(cam,(0,0,.5));cam.data.ortho_scale=1.08
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'character-lowpoly.blend'))
