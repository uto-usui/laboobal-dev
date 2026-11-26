"""Separate vertex fans and cap local source defects without remeshing surfaces."""
import bpy,bmesh,numpy as np
from mathutils import Vector
from collections import defaultdict


def manifold_fans(o,min_faces=48,min_area=8e-6):
    # All existing polygon corners (including diagnostic UVs) keep their order.
    # Distinct fans touching at a single vertex are split, not moved or remeshed.
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
        if len(component)<8 or (len(component)<min_faces and area<min_area):drop.extend(component)
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
        layer=mesh.uv_layers.new(name='Retained source UV');layer.data.foreach_set('uv',uvs.ravel())
    o.data=mesh
    o.vertex_groups.clear()
    for name in group_names:o.vertex_groups.new(name=name)
    for new_id,old_id in enumerate(f.ravel()[roots]):
        for group,weight in old_weights[old_id]:o.vertex_groups[group].add([new_id],weight,'REPLACE')
    bm=bmesh.new();bm.from_mesh(mesh)
    # A private center per simple boundary loop prevents cap diagonals from
    # becoming edges already shared by another part of the generated surface.
    pending={e for e in bm.edges if e.is_boundary};patches=[]
    uv=bm.loops.layers.uv.active
    cap_layer=bm.faces.layers.int.get('repair_cap') or bm.faces.layers.int.new('repair_cap')
    while pending:
        e=pending.pop();start,current=e.verts;loop=[start,current]
        for _ in range(len(bm.edges)):
            choices=[ed for ed in current.link_edges if ed in pending]
            if not choices:break
            edge=choices[0];pending.remove(edge);current=edge.other_vert(current)
            if current==start:break
            loop.append(current)
        if len(loop)<3 or current!=start:continue
        center=sum((v.co for v in loop),loop[0].co*0)/len(loop)
        center+=Vector((.0000032,.0000051,.0000079))
        vertex=bm.verts.new(center)
        border_uv={}
        if uv:
            for v in loop:
                if v.link_loops:border_uv[v]=v.link_loops[0][uv].uv.copy()
            mean_uv=sum(border_uv.values(),next(iter(border_uv.values()))*0)/len(border_uv) if border_uv else None
        for a,b in zip(loop,loop[1:]+loop[:1]):
            face=bm.faces.new((a,b,vertex));face[cap_layer]=1;patches.append(face)
            adjacent=[f for e in a.link_edges if b in e.verts for f in e.link_faces if f!=face]
            if adjacent:
                face.material_index=adjacent[0].material_index
                for name in bm.faces.layers.int.keys():
                    if name!='repair_cap':face[bm.faces.layers.int[name]]=adjacent[0][bm.faces.layers.int[name]]
            if uv and border_uv:
                for corner in face.loops:corner[uv].uv=border_uv.get(corner.vert,mean_uv)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    return {'components_before':len(sizes),'dropped_fragment_faces':len(drop),'largest_component_faces':max(x[0] for x in sizes),'split_fan_vertices':len(newp)-len(np.unique(f)),'local_caps':len(patches)}


def exterior_faces(o):
    """Cull enclosed generated sheets using two-sided escape rays.

    Only existing triangles are classified. No remesh or alternate reduction
    method is used. The separate hair backing is deliberately kept separately.
    """
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    m=o.data;m.calc_loop_triangles();p=np.array([v.co[:] for v in m.vertices]);f=np.array([t.vertices[:] for t in m.loop_triangles])
    c=p[f].mean(1);n=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);length=np.linalg.norm(n,axis=1);n/=np.maximum(length[:,None],1e-20)
    tree=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)
    keep=np.zeros(len(f),bool);origin=(p.min(0)+p.max(0))/2
    for i in range(len(f)):
        for direction in [n[i],-n[i]]:
            hit,_,_,dist=tree.ray_cast(Vector(c[i]+direction*2e-5),Vector(direction),2.)
            if hit is None:keep[i]=True;break
        if not keep[i]:
            radial=c[i]-origin;radial/=max(np.linalg.norm(radial),1e-10)
            hit,_,_,dist=tree.ray_cast(Vector(c[i]+radial*2e-5),Vector(radial),2.)
            if hit is None:keep[i]=True
    bm=bmesh.new();bm.from_mesh(m);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.flatnonzero(~keep)],context='FACES')
    bm.to_mesh(m);bm.free();m.update()
    return {'triangles_before':len(f),'enclosed_triangles_removed':int((~keep).sum()),'test':'escape in +normal, -normal or global radial direction; epsilon 20 micrometres'}
