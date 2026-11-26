"""Remove only the obsolete low-head cap; preserve all remaining loop data."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from lowpoly import WORK, triangles, coords, write
from lowpoly_verify import topology
from lowpoly2 import reset_pose
from hair import log, save, preserved_fields, hashes, PYTHON
from hair2 import material_state, camera
import bake
import hair_review as review
import lowpoly9 as p9

HERE=Path(__file__).resolve().parent
OLD=WORK/'hair2'
CAP='Baked inner hair cap'
NAMES=['low6_body','hair_preserved_head','hair_B']


def cap_mask(o):
    return np.array([o.data.materials[p.material_index].name==CAP for p in o.data.polygons])


def snapshot(keep=None):
    result={}
    for name in NAMES:
        o=bpy.data.objects[name];mask=keep if name=='hair_preserved_head' else None
        weights=[tuple((g.group,g.weight) for g in v.groups) for v in o.data.vertices]
        result[name]={'fields':hashes(preserved_fields(o,mask)), 'vertex_weights':weights,
                      'vertex_positions':hashlib.sha256(coords(o).tobytes()).hexdigest(),
                      'materials':material_state(o),'world':[list(r) for r in o.matrix_world],
                      'modifiers':[(m.name,m.type,m.object.name if m.type=='ARMATURE' and m.object else '') for m in o.modifiers],
                      'faces':hashlib.sha256(triangles(o)[mask].tobytes() if mask is not None else triangles(o).tobytes()).hexdigest()}
        # Face/corner comparison deliberately ignores removed cap faces only.
        result[name]['face_materials']=[p.material_index for i,p in enumerate(o.data.polygons) if mask is None or mask[i]]
    return {'images':{i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file},'objects':result,'rig':bake.rig_signature(bpy.data.objects['temporary_rig'])}


def install(out):
    paths=[OLD/'character-hair2.blend',OLD/'baked-checkpoint.blend']+list(OLD.rglob('*.png'))
    write(out/'input-hashes.json',{str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'character-hair2.blend'));review.setup()
    head=bpy.data.objects['hair_preserved_head'];remove=cap_mask(head);assert remove.sum()==999
    before=snapshot(~remove);counts={n:len(triangles(bpy.data.objects[n])) for n in NAMES}
    # FACES_ONLY keeps vertex indices, skin weights and custom loop normals intact.
    # No normal recalculation or UV re-encoding follows the deletion.
    bm=bmesh.new();bm.from_mesh(head.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[f for i,f in enumerate(bm.faces) if remove[i]],context='FACES_ONLY')
    bm.to_mesh(head.data);bm.free();head.data.update()
    assert snapshot()==before
    save(out,'character-hair3.blend')
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-hair3.blend'));review.setup()
    assert snapshot()==before
    assert not cap_mask(bpy.data.objects['hair_preserved_head']).any()
    after={n:len(triangles(bpy.data.objects[n])) for n in NAMES}
    report={'hair_B_topology':topology(bpy.data.objects['hair_B']),'only_cap_faces_removed':True,'remaining_positions_corner_normals_uv_smoothing_weights_materials_modifiers_rig_exact':True,
            'all_packed_images_exact':True,'source_files_unchanged':True,'triangles_before':counts,'triangles_after':after,
            'removed_triangles':sum(counts.values())-sum(after.values()),'total_triangles_before':sum(counts.values()),'total_triangles':sum(after.values()),'total_with_5000_eye_lid_glasses_reserve':sum(after.values())+5000,
            'loose_cap_vertices_retained':'FACES_ONLY retains unused vertices so other vertex indices and weights remain exact'}
    assert report['removed_triangles']==999
    write(out/'verification.json',report);log(out,'保存後の完全一致検査 '+json.dumps(report,ensure_ascii=False))


def views():
    return [(f'face-{a}','rest',a,(0,-.03,.84),.38,False) for a in review.ANGLES]+[(f'demo-{p}',p,0,(0,0,.5),1.25,True) for p in ['rest','combo_left','neck_up10']]+[(f'under-{a}','neck_up10',a,(0,-.005,.718),.22,False) for a in [0,55,-55]]


def render(out):
    for tag,path in [('hair2',OLD/'character-hair2.blend'),('hair3',out/'character-hair3.blend')]:
        bpy.ops.wm.open_mainfile(filepath=str(path));scene,cam,rig=review.setup();objs=[bpy.data.objects[n] for n in NAMES]
        for name,pose,angle,target,height,demo in views():
            p9.pose(rig,pose);p9.shot(out,cam,f'{name}-{tag}.png',objs,angle,target,height,demo)
        reset_pose(rig)
        masks=review.make_semantic_sets({tag:objs})[tag]
        scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.eevee.taa_render_samples=16
        for angle in review.ANGLES:p9.shot(out,cam,f'mask-face-{angle}-{tag}.png',masks,angle,target=(0,-.03,.84),height=.38)
        p9.shot(out,cam,f'mask-demo-rest-{tag}.png',masks,target=(0,0,.5),height=1.25,demo=True)
    log(out,'顔4方向、デモ3姿勢、首上10度の髪裏3方向を同条件で前後レンダー。')


def probe_misses(out):
    # Revisit exactly the previous 3,065 screen samples, using its original ID atlas.
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'baked-checkpoint.blend'));scene,cam,rig=review.setup()
    hair=bpy.data.objects['hair_B'];v=coords(hair);f=triangles(hair);uv=np.array([x.uv[:] for x in hair.data.uv_layers.active.data]).reshape(-1,3,2)
    trees={n:BVHTree.FromPolygons(coords(bpy.data.objects[n]).tolist(),triangles(bpy.data.objects[n]).tolist(),all_triangles=True) for n in NAMES}
    im=bpy.data.images.load(str(OLD/'material-id-raw.png'),check_existing=False);im.colorspace_settings.name='Non-Color';pix=np.array(im.pixels[:]).reshape(4096,4096,4)
    probes=np.load(OLD/'dark-pixels-before.npz');rows={};samples={}
    for view in ['demo-rest','face-0','face-35']:
        camera(cam,0 if view=='demo-rest' else int(view.split('-')[1]),view=='demo-rest')
        frame=np.array([tuple(q) for q in cam.data.view_frame(scene=scene)]);lo=frame.min(0);hi=frame.max(0);records=[]
        for y,x in probes[view]:
            direction=cam.matrix_world.to_3x3()@Vector((lo[0]+(x+.5)/1280*(hi[0]-lo[0]),hi[1]-(y+.5)/800*(hi[1]-lo[1]),frame[0,2]));direction.normalize()
            hits=[]
            for n,tree in trees.items():
                hit,normal,fi,dist=tree.ray_cast(cam.location,direction)
                if hit is not None:hits.append((dist,n,fi,hit))
            if not hits:continue
            _,n,fi,hit=min(hits,key=lambda q:q[0])
            if n!='hair_B':continue
            t=barycentric_transform(hit,*[Vector(q) for q in v[f[fi]]],*[Vector((q[0],q[1],0)) for q in uv[fi]])
            tx=int(np.clip(t.x*4096,0,4095));ty=int(np.clip(t.y*4096,0,4095))
            if pix[ty,tx,0]<=.5 and pix[ty,tx,1]<=.5:records.append([int(y),int(x),ty,tx])
        samples[view]=np.array(records,dtype=int).reshape(-1,4);rows[view]=len(records)
    assert sum(rows.values())==3065,rows
    np.savez(out/'original-miss-samples.npz',**samples);write(out/'miss-probes.json',{'screen_pixels':rows,'total':sum(rows.values()),'source':'hair2 original material-ID atlas and visible surface, pixel-center rays, nearest UV texel'})
    log(out,'元の未到達3,065画素を再特定 '+json.dumps(rows))


def visibility(out):
    from hair3_visibility import run
    run(out)


def verify_sources(out):
    entries=json.loads((out/'input-hashes.json').read_text())
    assert all(hashlib.sha256((WORK/n).read_bytes()).hexdigest()==h for n,h in entries.items())


def run(out,studio,unused_render):
    phase=os.environ.get('HAIR3_PHASE','all');log(out,'開始 '+phase)
    for name,fn in [('install',install),('probe',probe_misses),('render',render),('visibility',visibility)]:
        if phase in ['all',name]:fn(out)
    if phase in ['all','measure']:
        subprocess.run([str(PYTHON),str(HERE/'hair3_sides.py'),str(out)],check=True)
        subprocess.run([str(PYTHON),str(HERE/'hair3_images.py'),str(out),'measure'],check=True)
    verify_sources(out)
