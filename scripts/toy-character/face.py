"""Stage 5: compact-support displacement of a high-density copy, plus review props."""
import math
import shutil

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from generated_mesh import PARTS, WORK, arrays, import_source, texture_colors, write_json
from geometry import material, patch, aim
from head import make_eyes, make_glasses
from prepare import classify_parts


def smooth(t):
    t=np.clip(t,0,1)
    return t*t*t*(t*(t*6-15)+10)


def falloff(r,inner=.55,outer=1):
    return 1-smooth((r-inner)/(outer-inner))


def linear(rgb):
    rgb=np.asarray(rgb)
    return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)


def deform(obj,labels,pass_number):
    p,f=arrays(obj.data);q=p.copy()
    incident=np.bincount(f.ravel(),minlength=len(p))
    head=np.bincount(f[labels==PARTS.index('head_face')].ravel(),minlength=len(p))
    allowed=(head==incident)&(head>0)
    front=smooth((-p[:,1]-.065)/.035)*allowed
    records={}
    def apply(name,d):
        nonlocal q
        d*=front[:,None]
        q+=d
        length=np.linalg.norm(d,axis=1)
        records[name]={'vertices':int(np.count_nonzero(length>1e-9)),
                       'max_displacement_m':float(length.max()),
                       'axis_min_m':d.min(axis=0).tolist(),'axis_max_m':d.max(axis=0).tolist()}
    # Reference proportions: eye .811 H, nose .775 H, mouth .740 H in design v4.
    # Generated facial features sit 7-11 mm lower. Keep jaw/hair untouched.
    lift=.009 if pass_number==1 else .010
    w=smooth((p[:,2]-.622)/.025)*(1-smooth((p[:,2]-.730)/.035))*falloff(abs(p[:,0])/.122,.63)
    d=np.zeros_like(p);d[:,2]=lift*w
    apply('midface_raise',d)
    nose_center=.678
    r=np.sqrt((p[:,0]/.040)**2+((p[:,2]-nose_center)/.030)**2)
    w=falloff(r,.52)
    width=.30 if pass_number==1 else .30
    depth=.008 if pass_number==1 else .009
    d=np.zeros_like(p);d[:,0]=-width*p[:,0]*w
    d[:,1]=depth*w
    d[:,2]=-.17*(p[:,2]-nose_center)*w
    apply('nose_smaller_lower_projection_narrower',d)
    # The generated lower lip protrudes as a separate roll. Compress only that roll.
    r=np.sqrt((p[:,0]/.047)**2+((p[:,2]-.647)/.019)**2)
    w=falloff(r,.35)
    lip_depth=.0035 if pass_number==1 else (.005 if pass_number==2 else .007)
    d=np.zeros_like(p);d[:,1]=lip_depth*w
    d[:,2]=(-.14 if pass_number<3 else -.24)*(p[:,2]-.650)*w
    apply('lower_lip_roll_reduction',d)
    if pass_number>=3:
        r=np.sqrt((p[:,0]/.016)**2+((p[:,2]-.666)/.013)**2)
        d=np.zeros_like(p);d[:,2]=.0025*falloff(r,.35)
        apply('nasal_columella_raise',d)
        # Round the existing cap with a local target field, retaining 25% of its
        # detail. This fills the generated nostril notches without a remesh/smooth.
        r=np.sqrt((p[:,0]/.027)**2+((p[:,2]-.678)/.022)**2)
        shape=1-(q[:,0]/.019)**2-((q[:,2]-.688)/.015)**2
        positive=(shape+np.sqrt(shape*shape+.01**2))/2
        target=-.125-.010*np.sqrt(positive)
        d=np.zeros_like(p);d[:,1]=.75*falloff(r,.50)*(target-q[:,1])
        apply('round_nose_cap',d)
    eyes={}
    for side,sign in [('L',1),('R',-1)]:
        x=sign*(.048 if pass_number<3 else .044)
        z=.719 if pass_number==1 else (.715 if pass_number==2 else .718)
        radius=.0245 if pass_number==1 else (.026 if pass_number==2 else .038)
        cy=-.1115 if pass_number==1 else (-.100 if pass_number==2 else -.085)
        rr=np.sqrt((q[:,0]-x)**2+(q[:,2]-z)**2)
        influence=.034 if pass_number==1 else (.029 if pass_number==2 else .026)
        weight=falloff(rr/influence,.68)*.98
        target_y=cy+np.sqrt(np.maximum(0,radius**2-rr**2))+.0010
        delta=(target_y-q[:,1])*weight
        # Only the original anterior facial sheet participates, not back/interior skin.
        gate=smooth((-p[:,1]-.073)/.020)
        d=np.zeros_like(p);d[:,1]=delta*gate
        apply('round_socket_'+side,d)
        eyes[side]={'center':[x,cy,z],'globe_radius':radius,'spherical_bowl_radius':radius,
                    'bowl_back_clearance':.001,'influence_radius':influence,
                    'aperture_preview_radii':[.0225,.0185] if pass_number==1 else [.0185,.0140],
                    'pass':pass_number}
    obj.data.vertices.foreach_set('co',q.ravel());obj.data.update()
    if obj.data.has_custom_normals:
        # Imported split normals encode the undeformed surface and must not be
        # retained after changing the nose/socket curvature. Zero requests auto normals.
        obj.data.normals_split_custom_set(np.zeros((len(obj.data.loops),3),dtype=np.float32))
    delta=q-p;mag=np.linalg.norm(delta,axis=1)
    obj.data.attributes.new('face_displacement','FLOAT_VECTOR','POINT').data.foreach_set('vector',delta.ravel())
    result={'pass':pass_number,'method':'Compact C2 quintic displacement in original face-label region; no smoothing, no remesh, no topology edit.',
            'parameters':{'midface_lift_m':lift,'nose_width_core_scale':1-width,
                          'nose_projection_reduction_core_m':depth,'nose_height_core_scale':.83,
                          'lower_lip_projection_reduction_core_m':lip_depth},
            'operations':records,'eyes':eyes,'triangles_before':len(f),'triangles_after':len(f),
            'moved_vertices':int(np.count_nonzero(mag>1e-9)),
            'maximum_total_displacement_m':float(mag.max()),
            'outside_face_label_moved':int(np.count_nonzero((~allowed)&(mag>1e-9))),
            'outside_front_region_moved':int(np.count_nonzero((p[:,1]>=-.065)&(mag>1e-9))),
            'source_untouched':True,
            'assumptions':['Design front is authoritative. Supplied turnaround has no 45-degree view; same front design is explicitly repeated in the second compare row.',
                           'Generated height is retained, treating its units as metres for reported distances.',
                           'Eye sockets are closed spherical receiving surfaces here; final openings/lid retopology remain stage 6/7.']}
    assert result['outside_face_label_moved']==0
    return p,q,result


def preview_skin(obj,original_points,labels):
    # A review-only shader replaces the old painted eyes; the image/UV remain intact.
    p,f=arrays(obj.data)
    rgb=texture_colors(obj.data)
    c=original_points[f].mean(axis=1)
    sample=(labels==0)&(c[:,1]<-.095)&(c[:,2]>.687)&(c[:,2]<.730)&(abs(c[:,0])>.075)&(abs(c[:,0])<.091)
    color=linear(np.median(rgb[sample],axis=0))
    mask=np.zeros(len(p),np.float32)
    vertex_rgb=np.zeros((len(p),3));counts=np.zeros(len(p))
    for corner in range(3):
        np.add.at(vertex_rgb,f[:,corner],rgb);np.add.at(counts,f[:,corner],1)
    vertex_rgb/=np.maximum(counts[:,None],1)
    eye_paint=(vertex_rgb.max(axis=1)-vertex_rgb.min(axis=1)<.24)|(vertex_rgb.max(axis=1)<.40)
    for sign in [-1,1]:
        r=np.sqrt(((original_points[:,0]-sign*.048)/.027)**2+((original_points[:,2]-.709)/.023)**2)
        w=falloff(r,.93,1.27)*smooth((-original_points[:,1]-.070)/.025)
        mask=np.maximum(mask,w*eye_paint)
    attr=obj.data.color_attributes.new(name='PreviewEyePaintMask',type='FLOAT_COLOR',domain='POINT')
    rgba=np.column_stack([mask,mask,mask,np.ones(len(mask))]).astype(np.float32)
    attr.data.foreach_set('color',rgba.ravel())
    old=obj.data.materials[0]
    new=old.copy();new.name='REVIEW_ONLY_skin_over_original_eye_paint'
    obj.data.materials[0]=new
    nodes=new.node_tree.nodes;links=new.node_tree.links
    bsdf=nodes.get('Principled BSDF');source=bsdf.inputs['Base Color'].links[0].from_socket
    attrnode=nodes.new('ShaderNodeVertexColor');attrnode.layer_name=attr.name
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX'
    links.new(attrnode.outputs['Color'],mix.inputs[0]);links.new(source,mix.inputs[1])
    mix.inputs[2].default_value=(*color,1)
    links.new(mix.outputs[0],bsdf.inputs['Base Color'])
    obj['eye_paint_mask']='Review shader only; original embedded image unchanged. Remove PreviewEyePaintMask/mix for stage 6 bake setup.'
    return color


def props(obj,labels,eyes,skin_color):
    existing=set(bpy.data.objects)
    mats={
        'white':material('REVIEW_ivory white',(.89,.87,.82),.24),
        'iris':material('REVIEW_dark brown iris',(.08,.04,.02),.28),
        'pupil':material('REVIEW_deep pupil',(.006,.004,.003),.24),
        'highlight':material('REVIEW_softbox glint',(.95,.95,.95),.22),
        'skin':material('REVIEW_lid skin',tuple(skin_color),.47),
        'lash':material('REVIEW_lash',(.030,.014,.010),.5),
        'hair':material('REVIEW_unused brow',(.01,.005,.003),.5),
        'metal':material('REVIEW_thin satin metal',(.30,.29,.26),.28,.8)}
    irisnode=mats['iris'].node_tree.nodes.new('ShaderNodeVertexColor');irisnode.layer_name='IrisTint'
    mats['iris'].node_tree.links.new(irisnode.outputs['Color'],mats['iris'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    for name in ['white','iris','pupil']:
        bsdf=mats[name].node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Specular IOR Level'].default_value=.12
    make_eyes(mats)
    if eyes['L']['pass']>=3:
        # A complete review globe can protrude through the un-retopologized temple.
        # Keep its spherical geometry, but show white only through the intended
        # aperture. Stage 6/7 will replace this preview-only mask with real lids.
        white=mats['white'];white.surface_render_method='DITHERED'
        nodes=white.node_tree.nodes;links=white.node_tree.links
        coord=nodes.new('ShaderNodeTexCoord')
        separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coord.outputs['Object'],separate.inputs[0])
        terms=[]
        scale=eyes['L']['globe_radius']/.024
        for axis,aperture in [('X',.0185),('Z',.0140)]:
            divide=nodes.new('ShaderNodeMath');divide.operation='DIVIDE'
            links.new(separate.outputs[axis],divide.inputs[0]);divide.inputs[1].default_value=aperture/scale
            square=nodes.new('ShaderNodeMath');square.operation='MULTIPLY'
            links.new(divide.outputs[0],square.inputs[0]);links.new(divide.outputs[0],square.inputs[1])
            terms.append(square)
        total=nodes.new('ShaderNodeMath');total.operation='ADD'
        for i,node in enumerate(terms):links.new(node.outputs[0],total.inputs[i])
        inside=nodes.new('ShaderNodeMath');inside.operation='LESS_THAN'
        links.new(total.outputs[0],inside.inputs[0]);inside.inputs[1].default_value=1.025
        transparent=nodes.new('ShaderNodeBsdfTransparent')
        mix=nodes.new('ShaderNodeMixShader')
        links.new(inside.outputs[0],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1])
        links.new(nodes.get('Principled BSDF').outputs[0],mix.inputs[2])
        links.new(mix.outputs[0],nodes.get('Material Output').inputs['Surface'])
    for side in ['L','R']:
        for name in ['eyelid_'+side,'brow_'+side]:
            bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        eye=bpy.data.objects['eye_'+side]
        eye.location=eyes[side]['center'];eye.scale=(eyes[side]['globe_radius']/.024,)*3
        # Reuse the head stage's spherical iris construction, with a larger brown disc.
        iris=bpy.data.objects['iris_'+side]
        for v in iris.data.vertices:
            factor=1.12 if eyes[side]['pass']==1 else .80
            if eyes[side]['pass']>=3:factor=.0135/(.0152*eye.scale.x)
            v.co.x*=factor;v.co.z*=factor
            v.co.y=-math.sqrt(.02410**2-v.co.x**2-v.co.z**2)
    for side in ['L','R']:
        if eyes[side]['pass']>=3:
            eye=bpy.data.objects['eye_'+side]
            pupil=bpy.data.objects['pupil_'+side]
            for v in pupil.data.vertices:
                factor=.008/(.0083*eye.scale.x)
                v.co.x*=factor;v.co.z*=factor
                v.co.y=-math.sqrt(.02423**2-v.co.x**2-v.co.z**2)
            for suffix,desired in [('key',.0025),('fill',.00075)]:
                glint=bpy.data.objects['catchlight_'+suffix+'_'+side]
                glint.scale=(desired/((.0027 if suffix=='key' else .00085)*eye.scale.x),)*3
                glint.location.x=(-.004 if suffix=='key' else .003)/eye.scale.x
                glint.location.z=(.005 if suffix=='key' else -.004)/eye.scale.x
                glint.location.y=-math.sqrt(.024**2-glint.location.x**2-glint.location.z**2)-.00005
    p,f=arrays(obj.data)
    faceids=np.flatnonzero(labels==0)
    bvh=BVHTree.FromPolygons(p.tolist(),f[faceids].tolist(),all_triangles=True)
    for side in ['L','R']:
        center=np.array(eyes[side]['center']);radius=eyes[side]['globe_radius']
        inner_rx,inner_rz=eyes[side]['aperture_preview_radii']
        outer_rx,outer_rz=(.0305,.0265) if eyes[side]['pass']==1 else ((.025,.021) if eyes[side]['pass']==2 else (.0305,.0285))
        def lid(u,v):
            a=u*math.tau
            xr=inner_rx*(1-v)+outer_rx*v;zr=inner_rz*(1-v)+outer_rz*v
            x=xr*math.cos(a);z=zr*math.sin(a)
            innerx=inner_rx*math.cos(a);innerz=inner_rz*math.sin(a)
            inner_y=center[1]-math.sqrt(max(0,(radius+.0005)**2-innerx**2-innerz**2))
            outerx=outer_rx*math.cos(a);outerz=outer_rz*math.sin(a)
            hit,_,_,_=bvh.ray_cast(Vector((center[0]+outerx,-.4,center[2]+outerz)),Vector((0,1,0)),.5)
            outer_y=hit.y-.0005 if hit is not None else -.12
            t=v*v*(3-2*v)
            y=inner_y*(1-t)+outer_y*t-.0006*math.sin(math.pi*v)
            if eyes[side]['pass']>=3 and x*x+z*z<(radius+.00065)**2:
                y=min(y,center[1]-math.sqrt((radius+.00065)**2-x*x-z*z))
            return (center[0]+x,y,center[2]+z)
        lidobj=patch('REVIEW_lid_'+side,96,12,lid,mats['skin'],0,True)
        # Perimeter only: a restrained dark lash on the upper third.
        from geometry import tube
        pts=[lid((i/36)*.5,0) for i in range(37)]
        tube('REVIEW_upper_lash_'+side,pts,.00045,mats['lash'])
    glasses=make_glasses(mats)
    glasses.data.transform(Matrix.Translation((0,-.032 if eyes['L']['pass']<3 else -.020,-.00345)) @ Matrix.Diagonal((.90 if eyes['L']['pass']<3 else .86,.89,.89,1)))
    glasses.name='REVIEW_round_metal_glasses'
    created=[o for o in bpy.data.objects if o not in existing]
    collection=bpy.data.collections.new('REVIEW ONLY - temporary eyes lids glasses')
    bpy.context.scene.collection.children.link(collection)
    for o in created:
        o['temporary_review_prop']=True
        for coll in list(o.users_collection):coll.objects.unlink(o)
        collection.objects.link(o)
    return created


def run_face(out,studio,render,pass_number=3):
    source,info=import_source()
    labels,_,_=classify_parts(source,out)
    source.name='SOURCE_original_high_density_unchanged'
    after=source.copy();after.data=source.data.copy();bpy.context.collection.objects.link(after)
    after.name='FACE_corrected_high_density'
    original,corrected,metrics=deform(after,labels,pass_number)
    metrics['source_sha256']=info['sha256']
    metrics['height_m']=info['coordinates']['height']
    skin=preview_skin(after,original,labels)
    metrics['review_mask_skin_linear_rgb']=skin.tolist()
    metrics['preview_globe_aperture_shader_mask']=pass_number>=3
    camera=studio();scene=bpy.context.scene
    scene.eevee.taa_render_samples=48
    scene.render.resolution_x=scene.render.resolution_y=720
    source.hide_render=True
    preview=props(after,labels,metrics['eyes'],skin)
    center=(0,0,.734)
    # Same physical framing as the 460px design crop, at retained source height.
    scale=460/1177*info['coordinates']['height']
    views={'front':(0,-2,center[2]),'45':(math.sqrt(2),-math.sqrt(2),center[2]),'side':(2,0,center[2])}
    for state,obj in [('before',source),('after',after)]:
        source.hide_render=state!='before';after.hide_render=state!='after'
        for o in preview:o.hide_render=state!='after'
        for name in ['front','45']:
            render(out,camera,f'{state}-{name}.png',views[name],center,scale)
    for o in preview:o.hide_render=True
    render(out,camera,'corrected-skin-front.png',views['front'],center,scale)
    render(out,camera,'corrected-skin-45.png',views['45'],center,scale)
    for o in preview:o.hide_render=False
    for name in ['front','45']:
        render(out,camera,f'body-{name}.png',
               (0,-2,.444) if name=='front' else (math.sqrt(2),-math.sqrt(2),.444),
               (0,0,.444),1.00)
    clay=material('White clay, geometry comparison only',(.8,.8,.8),.65)
    for o in preview:o.hide_render=True
    for state,obj in [('before',source),('after',after)]:
        saved=list(obj.data.materials)
        obj.data.materials.clear();obj.data.materials.append(clay)
        source.hide_render=state!='before';after.hide_render=state!='after'
        for view,pos in views.items():
            render(out,camera,f'clay-{state}-{view}.png',pos,center,scale)
        obj.data.materials.clear()
        for mat in saved:obj.data.materials.append(mat)
    source.hide_render=True;source.hide_set(True);after.hide_render=False
    for o in preview:o.hide_render=False
    for im in bpy.data.images:
        if im.source!='VIEWER':im.pack()
    metrics['geometry_sha256_before']=__import__('hashlib').sha256(original.astype('<f8').tobytes()).hexdigest()
    metrics['geometry_sha256_after']=__import__('hashlib').sha256(arrays(after.data)[0].astype('<f8').tobytes()).hexdigest()
    write_json(out/'measurements.json',metrics)
    scene['workflow_stage']='5 - corrected high-density duplicate; final retopology/eyes/UV/bake not performed.'
    scene['review_props']='Temporary eyes/lids/frame in REVIEW ONLY collection. Source mesh and original texture are retained.'
    camera.location=views['45'];aim(camera,center);camera.data.ortho_scale=scale
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.view_layer.objects.active=after
    after.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'face.blend'))
    # A pass archive keeps the parameters and the exact scripts that generated it.
    snapshot=out/'script-snapshot';snapshot.mkdir(exist_ok=True)
    for name in ['face.py','prepare.py','generated_mesh.py','build.py','review_images.py']:
        shutil.copyfile(__import__('pathlib').Path(__file__).parent/name,snapshot/name)
    print('FACE_RESULT',metrics['parameters'],metrics['maximum_total_displacement_m'],flush=True)
