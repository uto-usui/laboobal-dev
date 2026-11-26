"""Stage 9: camera-projected eyelid atlas, independently masked iris UVs, curve glasses.

EYES_PHASE=prepare/assets/install/render/report/verify allows resuming image generation.
"""
import os,json,time,hashlib,subprocess,math
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from geometry import aim
from lowpoly import WORK,coords,triangles,write
from lowpoly2 import reset_pose
from hair import hashes,preserved_fields,save
from hair3 import NAMES
import bake,color,hair_review,lowpoly9 as p9
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
SOURCE=WORK/'color/character-color.blend'
PYTHON=WORK/'venv-color/bin/python'
CROP=(427,100,400)
SIZE=1024

def log(out,s):
    print('EYES',s,flush=True)
    with (out/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def external(out,phase):
    subprocess.run([str(PYTHON),str(HERE/'eyes_images.py'),str(out),phase],check=True)

def state():
    return {'meshes':{n:{'fields':hashes(preserved_fields(bpy.data.objects[n])),'signature':bake.signature(bpy.data.objects[n])} for n in NAMES},'rig':bake.rig_signature(bpy.data.objects['temporary_rig'])}

def projection_camera(cam):
    x,y,w=CROP;target=((x+w/2-627)/1177,0,(1213-y-w/2)/1177)
    cam.data.type='ORTHO';cam.data.ortho_scale=w/1177;cam.location=(target[0],-3,target[2]);aim(cam,target)
    return target

def prepare(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene,cam,rig=hair_review.setup()
    write(out/'baseline.json',{'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'state':state()})
    scene.render.resolution_x=scene.render.resolution_y=SIZE;projection_camera(cam)
    color.emission(True);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.render.filepath=str(out/'face-front-unlit.png');bpy.ops.render.render(write_still=True)
    write(out/'projection-camera.json',{'crop_in_design_pixels':CROP,'resolution':[SIZE,SIZE],'type':'ORTHO','location':list(cam.location),'rotation_euler':list(cam.rotation_euler),'matrix_world':list(map(list,cam.matrix_world)),'ortho_scale_m':cam.data.ortho_scale,'mapping':'design x=627+1177*X, y=1213-1177*Z; camera u=(design_x-427)/400, v=1-(design_y-100)/400','pixels_per_m':SIZE*1177/400})
    inspection={'objects':[{ 'name':o.name,'type':o.type,'tris':len(triangles(o)) if o.type=='MESH' else None,'materials':[m.name for m in o.data.materials] if o.type=='MESH' else []} for o in bpy.data.objects], 'materials':{m.name:[{'name':n.name,'type':n.type,'image':n.image.name if n.type=='TEX_IMAGE' and n.image else None} for n in m.node_tree.nodes] for m in bpy.data.materials if m.use_nodes}}
    write(out/'inspection.json',inspection)
    h=bpy.data.objects['hair_preserved_head'];np.savez_compressed(out/'head.npz',p=coords(h),f=triangles(h),uv=np.array([u.uv[:] for u in h.data.uv_layers.active.data]).reshape(-1,3,2))
    log(out,'1: 工程8を読み、形・法線・UV・骨のハッシュと正面正投影カメラを固定。照明なし1024角を出力。')
    external(out,'reference')

def run(out,studio,render):
    phase=os.environ.get('EYES_PHASE','all')
    for name,fn in [('prepare',prepare),('assets',lambda p:external(p,'assets')),('install',install),('render',render_all),('report',lambda p:external(p,'report')),('verify',verify)]:
        if phase in ['all',name]:fn(out)

def image_node(mat,path,name,uv=None,noncolor=False):
    im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pack()
    n=mat.node_tree.nodes.new('ShaderNodeTexImage');n.name=name;n.image=im;n.extension='CLIP'
    if uv:mat.node_tree.links.new(uv,n.inputs['Vector'])
    return n

def eye_uv(o):
    uv=o.data.uv_layers.get('EyeProjection') or o.data.uv_layers.new(name='EyeProjection')
    p=coords(o);x=(627+1177*p[:,0]-CROP[0])/CROP[2];y=1-(1213-1177*p[:,2]-CROP[1])/CROP[2]
    for poly in o.data.polygons:
        for vi,li in zip(poly.vertices,poly.loop_indices):uv.data[li].uv=(x[vi],y[vi])
    return uv

def scalar_driver(socket,rig,prop,expr='v',component=None):
    f=socket.driver_add('default_value') if component is None else socket.driver_add('default_value',component)
    d=f.driver;d.type='SCRIPTED';d.expression=expr;v=d.variables.new();v.name='v';v.type='SINGLE_PROP';v.targets[0].id=rig;v.targets[0].data_path='["'+prop+'"]'

def atlas_vector(mat,uv,rig):
    n=mat.node_tree.nodes;ln=mat.node_tree.links
    mul=n.new('ShaderNodeVectorMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=(1/3,1,1);ln.new(uv,mul.inputs[0])
    add=n.new('ShaderNodeVectorMath');add.operation='ADD';ln.new(mul.outputs[0],add.inputs[0]);scalar_driver(add.inputs[1],rig,'eye_frame','min(2,max(0,floor(v+0.5)))/3',0)
    return add.outputs[0]

def install(out):
    from lowpoly import subset,activate,mesh_obj
    from mathutils.bvhtree import BVHTree
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['temporary_rig'];rig.animation_data_clear();reset_pose(rig)
    h=bpy.data.objects['hair_preserved_head'];before=state();eye_uv(h)
    for prop,default in [('eye_frame',0),('gaze_x',0.),('gaze_y',0.)]:rig[prop]=default
    rig.id_properties_ui('eye_frame').update(min=0,max=2,description='0 open, 1 half, 2 closed; rounded discrete frame')
    ranges=json.loads((out/'gaze-ranges.json').read_text())
    rig.id_properties_ui('gaze_x').update(min=-ranges['left']['camera_uv'],max=ranges['right']['camera_uv'],description='Visible iris displacement in camera UV; positive is image right')
    rig.id_properties_ui('gaze_y').update(min=-ranges['down']['camera_uv'],max=ranges['up']['camera_uv'],description='Visible iris displacement in camera UV; positive is up')
    # Select the camera footprint plus one triangle ring, preserving all original mesh fields.
    p=coords(h);f=triangles(h);q=p[f];cx=(627+1177*q[:,:,0]-CROP[0])/CROP[2]*SIZE;cy=(1213-1177*q[:,:,2]-CROP[1])/CROP[2]*SIZE
    keep=((cx.max(1)>240)&(cx.min(1)<478)|(cx.max(1)>538)&(cx.min(1)<778))&(cy.max(1)>310)&(cy.min(1)<510)&(q[:,:,1].mean(1)<-.08)
    original_indices=np.array([p.material_index for p in h.data.polygons]);mat=h.data.materials[0].copy();mat.name='Eyes / projected eyelid atlas';h.data.materials.append(mat);idx=len(h.data.materials)-1
    for poly,k in zip(h.data.polygons,keep):
        if k:poly.material_index=idx
    n=mat.node_tree.nodes;ln=mat.node_tree.links;uv=n.new('ShaderNodeUVMap');uv.uv_map='EyeProjection';origuv=n.new('ShaderNodeUVMap');origuv.uv_map=h.data.uv_layers[0].name
    # Pin every pre-existing image to its original UV; adding a UV layer must not retarget it.
    for node in list(n):
        if node.type=='TEX_IMAGE':ln.new(origuv.outputs[0],node.inputs['Vector'])
    avec=atlas_vector(mat,uv.outputs[0],rig);atlas=image_node(mat,out/'eyelid-atlas.png','Eyelid atlas',avec);patch=image_node(mat,out/'eye-patch-mask.png','Eye replacement mask',uv.outputs[0],True)
    bs=next(z for z in n if z.type=='BSDF_PRINCIPLED');old=bs.inputs['Base Color'].links[0].from_socket
    mix=n.new('ShaderNodeMixRGB');ln.new(patch.outputs[0],mix.inputs[0]);ln.new(old,mix.inputs[1]);ln.new(atlas.outputs[0],mix.inputs[2]);ln.new(mix.outputs[0],bs.inputs['Base Color'])
    # The normal map includes the old iris indentation/shading. Neutralize it only
    # within the same feathered patch; geometry and stored corner normals stay exact.
    normal=next(z for z in n if z.type=='NORMAL_MAP');nc=normal.inputs['Color'].links[0].from_socket;nm=n.new('ShaderNodeMixRGB');ln.new(patch.outputs[0],nm.inputs[0]);ln.new(nc,nm.inputs[1]);nm.inputs[2].default_value=(.5,.5,1,1);ln.new(nm.outputs[0],normal.inputs['Color'])
    normal.uv_map=h.data.uv_layers[0].name
    em=n.get('color diagnostic emission')
    if em:ln.new(mix.outputs[0],em.inputs[0])
    layer=subset(h,keep,'eye_iris_layer');layer.data.materials.clear();eye_uv(layer)
    # Exact duplicated surface; depth is offset in the shader rather than remodeling it.
    # Blender's transparent shader needs a submillimeter object-space offset to avoid z fighting.
    layer.location.y-=.0006
    iris=bpy.data.materials.new('Eyes / moving iris and fixed aperture');iris.use_nodes=True;n=iris.node_tree.nodes;ln=iris.node_tree.links;n.clear()
    uv=n.new('ShaderNodeUVMap');uv.uv_map='EyeProjection';off=n.new('ShaderNodeVectorMath');off.operation='ADD';ln.new(uv.outputs[0],off.inputs[0]);scalar_driver(off.inputs[1],rig,'gaze_x','-min('+str(ranges['right']['camera_uv'])+',max(-'+str(ranges['left']['camera_uv'])+',v))',0);scalar_driver(off.inputs[1],rig,'gaze_y','-min('+str(ranges['up']['camera_uv'])+',max(-'+str(ranges['down']['camera_uv'])+',v))',1)
    tex=image_node(iris,out/'iris-layer.png','Iris texture / moving UV',off.outputs[0]);mask=image_node(iris,out/'aperture-atlas.png','Fixed aperture / follows eyelid frame',atlas_vector(iris,uv.outputs[0],rig),True)
    alpha=n.new('ShaderNodeMath');alpha.operation='MULTIPLY';ln.new(tex.outputs['Alpha'],alpha.inputs[0]);ln.new(mask.outputs[0],alpha.inputs[1]);test=n.new('ShaderNodeMath');test.operation='GREATER_THAN';test.inputs[1].default_value=.5;ln.new(alpha.outputs[0],test.inputs[0])
    bs=n.new('ShaderNodeBsdfPrincipled');ln.new(tex.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.4;bs.inputs['Specular IOR Level'].default_value=.1
    transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');ln.new(test.outputs[0],mix.inputs[0]);ln.new(transparent.outputs[0],mix.inputs[1]);ln.new(bs.outputs[0],mix.inputs[2]);output=n.new('ShaderNodeOutputMaterial');ln.new(mix.outputs[0],output.inputs[0]);iris.surface_render_method='DITHERED';layer.data.materials.append(iris)
    layer['surface_source']='hair_preserved_head / exact selected triangles';layer['depth_offset_m']=.0006
    write(out/'eye-surface.json',{'selected_triangle_ids':np.flatnonzero(keep).tolist(),'selected_triangles':int(keep.sum()),'original_material_indices':original_indices.tolist(),'surface_identical_in_object_coordinates':bool(np.array_equal(coords(layer)[triangles(layer)],coords(h)[triangles(h)[keep]])),'layer_offset_m':.0006,'projection_camera':'projection-camera.json','atlas_size':[3072,1024],'frame_order':['open','half','closed'],'old_shading':'basecolor reconstructed from existing skin; tangent normal neutralized inside fixed eye mask; no AO texture connected in source'})
    assert np.array_equal(coords(layer)[triangles(layer)],coords(h)[triangles(h)[keep]])
    log(out,f'3-4: {int(keep.sum())}面を専用マテリアルへ。既存面をそのまま複製、黒目UVと開口UVを独立させる。元の黒目色と法線焼き込みを同じ目マスク内だけ除去。')
    make_glasses(out,h,rig)
    measure_surface(out,h,ranges)
    # Adding a projection UV does not change the original active UV or mesh fields.
    h.data.uv_layers.active_index=0;layer.data.uv_layers.active_index=0
    reset_pose(rig);scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.transparent_max_bounces=16;scene.render.resolution_x=1280;scene.render.resolution_y=800;p9.shot_camera_only(scene.camera)
    for i in bpy.data.images:
        if i.packed_file and i.users==0:i.use_fake_user=True
    after=state();assert before==after,'original meshes or rig changed'
    save(out,'character-eyes.blend');log(out,'5-6: 眼鏡をheadの子にして保存。顔・体・髪の頂点、元UV、法線、骨、ウェイトは入力と完全一致。')

def make_glasses(out,head,rig):
    from lowpoly import activate,mesh_obj
    from mathutils.bvhtree import BVHTree
    tree=BVHTree.FromPolygons(coords(head).tolist(),triangles(head).tolist(),all_triangles=True)
    frame=bpy.data.materials.new('Glasses / warm silver');frame.use_nodes=True;bs=frame.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.32,.29,.25,1);bs.inputs['Metallic'].default_value=.72;bs.inputs['Roughness'].default_value=.32
    lens=bpy.data.materials.new('Glasses / thin clear lens');lens.use_nodes=True;lens.use_raytrace_refraction=True;bs=lens.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.98,.99,1,1);bs.inputs['Transmission Weight'].default_value=1;bs.inputs['Roughness'].default_value=.035;bs.inputs['IOR'].default_value=1.45
    # A zero-thickness lens transmits straight through. A lone refractive BSDF
    # bends the ray once and never bends it back, visibly displacing the iris.
    # Fresnel reflection plus transparent transmission is the thin-sheet limit.
    lens['web_transmission']=1.;lens['web_thickness']=0.;lens['ior']=1.45;lens['reflection_coating_factor']=.2
    n=lens.node_tree.nodes;ln=lens.node_tree.links;n.clear();tr=n.new('ShaderNodeBsdfTransparent');gl=n.new('ShaderNodeBsdfGlossy');gl.inputs['Roughness'].default_value=.06;fresnel=n.new('ShaderNodeFresnel');fresnel.inputs['IOR'].default_value=1.45;mix=n.new('ShaderNodeMixShader');coat=n.new('ShaderNodeMath');coat.operation='MULTIPLY';coat.inputs[1].default_value=.2;ln.new(fresnel.outputs[0],coat.inputs[0]);ln.new(coat.outputs[0],mix.inputs[0]);ln.new(tr.outputs[0],mix.inputs[1]);ln.new(gl.outputs[0],mix.inputs[2]);output=n.new('ShaderNodeOutputMaterial');ln.new(mix.outputs[0],output.inputs[0])
    curves=[];objects=[];radius=.00078
    def front(x,z):
        hit,normal,fi,dist=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
        return float(hit.y)-.006 if hit is not None and hit.y<-.06 else -.14
    def parent(o):
        mw=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone='head';bpy.context.view_layer.update();o.matrix_world=mw
    def tube(name,points,cyclic=False):
        data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=radius;data.bevel_resolution=1;data.resolution_u=1;data.use_fill_caps=True
        # Blender 5.2's round bevel resolution 1 yields six radial sides.
        s=data.splines.new('POLY');s.points.add(len(points)-1)
        for q,p in zip(s.points,points):q.co=(*p,1)
        s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(frame);curves.append({'name':name,'centerline':points,'cyclic':cyclic,'bevel_radius_m':radius,'bevel_resolution':1});activate(o);bpy.ops.object.convert(target='MESH');o=bpy.context.object
        for p in o.data.polygons:p.use_smooth=True
        parent(o);objects.append(o);return o
    rings=[];planes={};land=json.loads((WORK/'fidelity/design-landmarks.json').read_text())['points']
    # The landmark file annotates eyes, not rims. Use its eye midpoint as the
    # anchor and record separately the visible rim bounds annotated on v4.
    for side,bounds in [('L',(520,228,607,308)),('R',(646,228,733,308))]:
        x0,y0,x1,y1=bounds;cx=((x0+x1)/2-627)/1177;cz=(1213-(y0+y1)/2)/1177;rx=(x1-x0)/2/1177;rz=(y1-y0)/2/1177;points=[]
        for t in np.linspace(0,2*math.pi,92,endpoint=False):
            x=cx+rx*math.cos(t);z=cz+rz*math.sin(t);points.append((float(x),front(x,z),float(z)))
        plane_y=min(p[1] for p in points);planes[side]=plane_y;points=[(x,plane_y,z) for x,y,z in points]
        tube('glasses_rim_'+side,points,True);rings.append({'side':side,'design_bounds_px':bounds,'center_m':[cx,plane_y,cz],'radius_m':[rx,rz],'eye_anchor_px':np.mean([land['eye_'+side+'_left'],land['eye_'+side+'_right']],axis=0).tolist()})
        # A thin independent disk has no modeled thickness; glTF uses thin transmission.
        verts=[(cx,plane_y-.00015,cz)]+[(cx+(rx-radius*1.3)*math.cos(t),plane_y-.00015,cz+(rz-radius*1.3)*math.sin(t)) for t in np.linspace(0,2*math.pi,48,endpoint=False)]
        ob=mesh_obj('glasses_lens_'+side,verts,[(0,1+i,1+(i+1)%48) for i in range(48)],lens);parent(ob);objects.append(ob)
    # Smooth bridge rises over the nose; temples bend toward the ears behind hair.
    points=[]
    for t in np.linspace(0,1,17):
        xd=607+39*t;yd=266-9*math.sin(math.pi*t);x=(xd-627)/1177;z=(1213-yd)/1177;base_y=planes['L']*(1-t)+planes['R']*t;points.append((x,base_y-.010*math.sin(math.pi*t),z))
    tube('glasses_bridge',points)
    for side,sign,start in [('L',-1,520),('R',1,733)]:
        ring=next(r for r in rings if r['side']==side);cx,plane,cz=ring['center_m'];rx,rz=ring['radius_m'];z=(1213-259)/1177;x=cx+sign*rx*math.sqrt(1-((z-cz)/rz)**2);y=planes[side]
        controls=np.array([(x,y,z),(sign*.108,-.145,z),(sign*.119,-.106,z-.001),(sign*.123,-.055,z-.003),(sign*.122,-.016,z-.012)])
        points=[]
        for i in range(len(controls)-1):
            for t in np.linspace(0,1,5,endpoint=False):points.append(tuple(controls[i]*(1-t)+controls[i+1]*t))
        points.append(tuple(controls[-1]));tube('glasses_temple_'+side,points)
    bpy.context.view_layer.update()
    write(out/'glasses-curves.json',curves)
    counts={o.name:len(triangles(o)) for o in objects};alltris=sum(len(triangles(o)) for o in bpy.data.objects if o.type=='MESH')
    clearance=[]
    for curve in curves[:2]+[curves[2]]:
        for x,y,z in curve['centerline']:
            hit,n,fi,d=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
            if hit is not None:clearance.append((hit.y-y-radius)*1000)
    m={'rings':rings,'frame_diameter_mm':radius*2000,'frame_outer_width_mm':(733-520)/1177*1000+radius*2000,'bridge_width_mm':39/1177*1000,'parts_triangles':counts,'glasses_triangles':sum(counts.values()),'total_triangles':alltris,'limit':65000,'within_limit':alltris<=65000,'rim_bridge_min_front_clearance_mm':min(clearance),'parent_bone':'head','rim_annotation_uncertainty_design_px':1.5,'lens':'separate zero-thickness disk; transparent transmission + coated dielectric Fresnel reflection (factor .2), IOR=1.45; Web transmission=1 / thickness=0'}
    assert m['within_limit'];assert min(clearance)>0
    write(out/'glasses-metrics.json',m);log(out,'5: v4眼の対応点を基準に眼鏡の縁を別途注記。カーブを丸断面Bevelでメッシュ化: '+str(m['glasses_triangles'])+'三角形、全体'+str(alltris)+'。')

def set_eyes(rig,frame=0,x=0,y=0):
    rig['eye_frame']=frame;rig['gaze_x']=x;rig['gaze_y']=y;rig.update_tag();bpy.context.view_layer.update();bpy.context.scene.frame_set(bpy.context.scene.frame_current)

def lighting(unlit):
    color.emission(unlit)
    m=bpy.data.materials['Eyes / moving iris and fixed aperture'];n=m.node_tree.nodes;ln=m.node_tree.links;bs=next(q for q in n if q.type=='BSDF_PRINCIPLED');mix=next(q for q in n if q.type=='MIX_SHADER')
    if unlit:
        em=n.get('iris diagnostic emission') or n.new('ShaderNodeEmission');em.name='iris diagnostic emission';ln.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs[0]);ln.new(em.outputs[0],mix.inputs[2])
    else:ln.new(bs.outputs[0],mix.inputs[2])
    bpy.context.scene.view_settings.view_transform='Standard' if unlit else 'AgX'
    bpy.context.scene.view_settings.look='None';bpy.context.scene.view_settings.exposure=0;bpy.context.scene.view_settings.gamma=1

def face_shot(out,cam,name,angle=0):
    scene=bpy.context.scene;target=Vector(projection_camera(cam));a=math.radians(angle);cam.location=target+Vector((3*math.sin(a),-3*math.cos(a),0));aim(cam,target)
    scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)

def render_all(out):
    from lowpoly_verify import visible
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-eyes.blend'));scene,cam,rig=hair_review.setup();scene.eevee.taa_render_samples=64;scene.eevee.use_raytracing=True
    objects=[o for o in bpy.data.objects if o.type=='MESH'];glasses=[o for o in objects if o.name.startswith('glasses_')];nonglasses=[o for o in objects if o not in glasses]
    scene.render.resolution_x=scene.render.resolution_y=768;lighting(True);visible(nonglasses)
    ranges=json.loads((out/'gaze-ranges.json').read_text());states=[('open',0,0,0),('half',1,0,0),('closed',2,0,0),('left',0,-ranges['left']['camera_uv'],0),('right',0,ranges['right']['camera_uv'],0),('up',0,0,ranges['up']['camera_uv']),('down',0,0,-ranges['down']['camera_uv'])]
    for tag,frame,x,y in states:
        set_eyes(rig,frame,x,y)
        for angle in [0,25]:face_shot(out,cam,f'eyes-{tag}-{angle}.png',angle)
    # Matching unlit renders isolate the blink boundary from illumination changes.
    visible(objects);set_eyes(rig);lighting(False);scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.transparent_max_bounces=16
    for angle in [0,35,90]:face_shot(out,cam,f'glasses-{angle}.png',angle)
    scene.render.resolution_x=1280;scene.render.resolution_y=800
    for tag,pose,frame,x in [('rest','rest',0,0),('left','neck_left25',0,-ranges['left']['camera_uv']),('closed','rest',2,0),('right','neck_right25',0,ranges['right']['camera_uv'])]:
        p9.pose(rig,pose);set_eyes(rig,frame,x,0);p9.shot(out,cam,f'demo-{tag}.png',objects,demo=True)
    reset_pose(rig);set_eyes(rig);lighting(False)
    # Save a comfortable lit demo view, leaving diagnostic materials unsaved.
    log(out,'検証: 3コマと視線4端を正面・25度で、眼鏡を正面・35度・横で、工程6の画角で立ち姿・首左右25度・閉眼をレンダー。')

def verify(out):
    from lowpoly2 import evaluated
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-eyes.blend'));rig=bpy.data.objects['temporary_rig'];reset_pose(rig);set_eyes(rig)
    baseline=json.loads((out/'baseline.json').read_text());after=state();glasses=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('glasses_')]
    parents=all(o.parent==rig and o.parent_type=='BONE' and o.parent_bone=='head' for o in glasses)
    # A bone child must undergo exactly the same head transform, tested independently
    # of the scene graph labels at both required yaw limits.
    rest={o.name:o.matrix_world.copy() for o in glasses};bone0=rig.pose.bones['head'].matrix.copy();errors=[]
    for pose in ['neck_left25','neck_right25']:
        p9.pose(rig,pose);bpy.context.view_layer.update();M=rig.matrix_world@rig.pose.bones['head'].matrix@bone0.inverted()@rig.matrix_world.inverted()
        errors.append({'pose':pose,'matrix_error':max(float(np.max(abs(np.array(o.matrix_world)-np.array(M@rest[o.name])))) for o in glasses)})
    reset_pose(rig);r={'source_sha256_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==baseline['source_sha256'],'original_mesh_fields_and_rig_unchanged':after==baseline['state'],'glasses_head_parent':parents,'head_yaw_checks':errors,'total_triangles':sum(len(triangles(o)) for o in bpy.data.objects if o.type=='MESH'),'packed_images':all(i.packed_file is not None for i in bpy.data.images if i.users and i.source=='FILE')}
    assert r['source_sha256_unchanged'] and r['original_mesh_fields_and_rig_unchanged'] and parents and r['total_triangles']<=65000
    assert all(x['matrix_error']<1e-5 for x in errors)
    write(out/'verification.json',r);metrics=json.loads((out/'metrics.json').read_text());metrics['verification']=r;write(out/'metrics.json',metrics);log(out,'保存後の再検証: '+json.dumps(r,ensure_ascii=False))

def measure_surface(out,head,ranges):
    from mathutils.bvhtree import BVHTree
    tree=BVHTree.FromPolygons(coords(head).tolist(),triangles(head).tolist(),all_triangles=True);result={}
    for side,center in [('L',(368.64,412.16)),('R',(650.24,412.16))]:
        result[side]={}
        for direction,r in ranges.items():
            dx=r['pixels']*(-1 if direction=='left' else 1) if direction in ['left','right'] else 0
            dy=r['pixels']*(-1 if direction=='up' else 1) if direction in ['up','down'] else 0
            points=[]
            for t in np.linspace(0,1,33):
                x=(CROP[0]+(center[0]+dx*t)/SIZE*CROP[2]-627)/1177;z=(1213-CROP[1]-(center[1]+dy*t)/SIZE*CROP[2])/1177
                hit,n,fi,d=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2);assert hit is not None;points.append(np.array(hit))
            result[side][direction]={'surface_path_mm':float(np.linalg.norm(np.diff(points,axis=0),axis=1).sum()*1000),'surface_chord_mm':float(np.linalg.norm(points[-1]-points[0])*1000),'start_m':points[0].tolist(),'end_m':points[-1].tolist()}
    write(out/'surface-ranges.json',{'definition':'33 front-ray samples along iris-center displacement on the unchanged face; actual polyhedral surface path, current model unit converted m to mm','eyes':result})
    log(out,'4: 黒目のUV範囲を33点ずつ顔へレイ投影し、実際の顔の表面上の移動距離をmmで測定。')
