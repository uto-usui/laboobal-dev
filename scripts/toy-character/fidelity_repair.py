"""A separate inner hair sheet; never alter the original hair strand vertices."""
import hashlib
import json
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from fidelity_blender import GEN, coords, import_mesh, setcoords, setup, write

VIEWS = [('front',(0,-2)),('45',(math.sqrt(2),-math.sqrt(2))),
         ('left45',(-math.sqrt(2),-math.sqrt(2))),('side',(2,0)),
         ('leftside',(-2,0)),('back',(0,2))]


def texture_colors(obj):
    mesh=obj.data
    uv=np.empty(len(mesh.loops)*2);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
    image=next(n.image for m in mesh.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(pixels)
    pixels=pixels.reshape(image.size[1],image.size[0],4)
    xy=np.floor(uv*np.array(image.size)).astype(int)
    rgb=pixels[xy[:,1]%image.size[1],xy[:,0]%image.size[0],:3]
    return rgb


def repair(out,studio,render,seed_list):
    assert seed_list==[42], 'This repair is annotated for seed 42 only'
    seed=42;tr=json.loads((out/'seed-transforms.json').read_text())['42']
    obj=import_mesh(GEN/'head-s42.glb','repaired_head_seed_42')
    p=(coords(obj)-np.array(tr['initial_offset']))*tr['initial_scale'];p[:,2]+=1;setcoords(obj,p)
    rgb=texture_colors(obj)
    # Classify only the low red collar fragment; no skin or dark strand is cut.
    poly_rgb=rgb.reshape(-1,3,3).mean(1)
    tri=np.array([tuple(poly.vertices) for poly in obj.data.polygons])
    center=p[tri].mean(1)
    red=(poly_rgb[:,0]>poly_rgb[:,1]*1.6)&(poly_rgb[:,2]>poly_rgb[:,1]*.72)&(poly_rgb[:,0]>.09)&(center[:,2]<.735)&(center[:,1]>-.01)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.flatnonzero(red)],context='FACES')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    p=coords(obj)
    surface_rgb=texture_colors(obj).reshape(-1,3,3).mean(1)
    obj.data.calc_loop_triangles();tri=[tuple(t.vertices) for t in obj.data.loop_triangles]
    bvh=BVHTree.FromPolygons([Vector(v) for v in p],tri,all_triangles=True)
    # Sample the existing hair envelope radially. Interpolation bridges the
    # narrow gaps; the inset sheet stays behind the unchanged strand surface.
    nphi=256;ntheta=112;origin=np.array([0,.005,.849])
    phi=np.arange(nphi)*2*math.pi/nphi
    # Front rim is concealed inside the bangs; side/back rim stays inside hair.
    front=np.maximum(0,-np.sin(phi))
    bottom_z=.755+.155*front**2
    bottom_z=np.where(np.sin(phi)>0,.725,bottom_z)
    theta_end=np.arccos(np.clip((bottom_z-origin[2])/.166,-.97,.97))
    theta=np.linspace(.002,1,ntheta)[:,None]*theta_end[None,:]
    directions=np.stack([np.sin(theta)*np.cos(phi),np.sin(theta)*np.sin(phi),np.cos(theta)],axis=-1)
    radii=np.empty((ntheta,nphi))
    for i in range(ntheta):
        for j in range(nphi):
            direction=directions[i,j]
            hit,_,index,_=bvh.ray_cast(Vector(origin+.38*direction),Vector(-direction),.42)
            color=surface_rgb[index] if hit is not None else np.array([1,1,1])
            hair=hit is not None and color.max()<.24 and color[0]<max(color[2],.008)*2.2
            radii[i,j]=np.linalg.norm(np.array(hit)-origin) if hair else np.nan
    invalid=int(np.isnan(radii).sum())
    for i in range(ntheta):
        good=np.flatnonzero(np.isfinite(radii[i]))
        if len(good)>4:
            radii[i]=np.interp(np.arange(nphi),np.r_[good-nphi,good,good+nphi],np.tile(radii[i,good],3))
    for j in range(nphi):
        good=np.flatnonzero(np.isfinite(radii[:,j]))
        if len(good):radii[:,j]=np.interp(np.arange(ntheta),good,radii[good,j])
    # A median neighborhood rejects the recessed scalp in a gap. A conservative
    # inset keeps this backing below the hair rather than replacing its ridges.
    windows=[]
    for di in range(-3,4):
        for dj in range(-3,4):
            windows.append(np.roll(radii.clip(.08,.23), (di,dj),axis=(0,1)))
    smooth=np.nanpercentile(windows,25,axis=0)
    smooth[:4]=np.nanmedian(radii[:4])
    smooth=np.where(np.isfinite(smooth),smooth,.15)-.001
    verts=origin+directions*smooth[:,:,None]
    faces=[]
    for i in range(ntheta-1):
        for j in range(nphi):
            jj=(j+1)%nphi
            ids=(i*nphi+j,(i+1)*nphi+j,(i+1)*nphi+jj,i*nphi+jj)
            patch=verts.reshape(-1,3)[list(ids)]
            if np.any(((patch[:,1]<-.04)&(patch[:,2]<.90))|((patch[:,1]<.04)&(patch[:,2]<.815))):continue
            faces.append(ids)
    faces.append(tuple(reversed(range(nphi))))
    mesh=bpy.data.meshes.new('Inner hair continuous sheet');mesh.from_pydata(verts.reshape(-1,3).tolist(),[],faces);mesh.update()
    cap=bpy.data.objects.new('hair_inner_cap_seed_42',mesh);bpy.context.collection.objects.link(cap)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    mat=bpy.data.materials.new('Hair backing neutral black');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.001,.0008,.0007,1);bs.inputs['Roughness'].default_value=.9
    bs.inputs['Specular IOR Level'].default_value=0
    mesh.materials.append(mat)
    # Hide mixed-color collar boundary triangles that cannot be safely cut by
    # hue alone. This region is behind the face and outside the retained neck.
    centers=p[np.array(tri)].mean(1)
    collar_mask=(centers[:,2]<.735)&(centers[:,1]>-.01)&(abs(centers[:,0])>.04)&(surface_rgb[:,0]>.06)&(surface_rgb[:,0]>surface_rgb[:,1]*1.3)
    obj.data.materials.append(mat)
    for i in np.flatnonzero(collar_mask):obj.data.polygons[i].material_index=len(obj.data.materials)-1
    for poly in mesh.polygons:poly.use_smooth=True
    cam=setup(studio);z=(1213-240)/1177
    for label,xy in VIEWS:render(out,cam,f'repaired-{label}.png',(*xy,z),(0,0,z),460/1177)
    materials=[list(o.data.materials) for o in [obj,cap]]
    material_indices=[[poly.material_index for poly in o.data.polygons] for o in [obj,cap]]
    clay=bpy.data.materials.new('White repair inspection');clay.use_nodes=True
    clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.45,.45,.45,1)
    for o in [obj,cap]:
        o.data.materials.clear();o.data.materials.append(clay)
        for poly in o.data.polygons:poly.material_index=0
    for label,xy in VIEWS:render(out,cam,f'repaired-clay-{label}.png',(*xy,z),(0,0,z),460/1177)
    for o,mats,indices in zip([obj,cap],materials,material_indices):
        o.data.materials.clear()
        for m in mats:o.data.materials.append(m)
        for poly,index in zip(o.data.polygons,indices):poly.material_index=index
    write(out/'repair.json',{'seed':42,'source_sha256':hashlib.sha256((GEN/'head-s42.glb').read_bytes()).hexdigest(),
          'method':'single connected inset radial sheet sampled from existing hair envelope; 7x7 angular lower quartile bridges gaps',
          'cap_vertices':len(mesh.vertices),'cap_faces':len(mesh.polygons),'inset_m':.001,'non_hair_ray_samples_interpolated':invalid,
          'source_strand_vertex_displacement_m':0,'removed_low_red_faces':int(red.sum()),'hidden_mixed_collar_faces':int(collar_mask.sum()),'rendered_views':[v[0] for v in VIEWS]})
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'repaired-head.blend'))


def load_repaired(out):
    with bpy.data.libraries.load(str(out/'repaired-head.blend'),link=False) as (src,dst):
        dst.objects=['repaired_head_seed_42','hair_inner_cap_seed_42']
    for obj in dst.objects:bpy.context.collection.objects.link(obj)
    return dst.objects
