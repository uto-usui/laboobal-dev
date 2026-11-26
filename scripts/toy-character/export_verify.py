"""Read saved artifacts and verify source geometry/UV/weights without rebuilding them."""
import json,hashlib,time
from pathlib import Path
import bpy,numpy as np
from lowpoly import WORK,coords,triangles,write
from export_stage import SOURCE,bones,log

def corners(o):
    f=triangles(o);p=coords(o)[f];uv=np.array([q.uv[:] for q in o.data.uv_layers[0].data]).reshape(-1,3,2)
    normals=np.array([q.vector[:] for q in o.data.corner_normals]).reshape(-1,3,3)
    w=[{o.vertex_groups[q.group].name:float(q.weight) for q in v.groups} for v in o.data.vertices]
    return {'p':p,'uv':uv,'normal':normals,'weights':[[w[int(v)] for v in tri] for tri in f]}

def run(out):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    baseline=json.loads((out/'baseline.json').read_text());sourcebones=bones(bpy.data.objects['temporary_rig'])
    source={n:corners(bpy.data.objects[n]) for n in ['low6_body','hair_preserved_head','hair_B','eye_iris_layer']}
    keep=np.array([p.material_index==2 for p in bpy.data.objects['hair_preserved_head'].data.polygons]);orig=source.pop('hair_preserved_head');source['head_face']={k:([v[i] for i in np.flatnonzero(~keep)] if k=='weights' else v[~keep]) for k,v in orig.items()};source['eye_lids']={k:([v[i] for i in np.flatnonzero(keep)] if k=='weights' else v[keep]) for k,v in orig.items()}
    source['body']=source.pop('low6_body');source['hair']=source.pop('hair_B');source['eye_iris']=source.pop('eye_iris_layer')
    bpy.ops.wm.open_mainfile(filepath=str(out/'character-export.blend'));rig=bpy.data.objects['character_rig'];checks={}
    for name,a in source.items():
        b=corners(bpy.data.objects[name]);pos=float(np.max(np.abs(a['p']-b['p'])));uv=float(np.max(np.abs(a['uv']-b['uv'])));norm=float(np.max(np.abs(a['normal']-b['normal'])));weights=a['weights']==b['weights'];assert pos==0 and uv==0 and weights;assert norm<.002
        checks[name]={'position_max_error_m':pos,'original_uv_max_error':uv,'weights_exact':weights,'corner_normals_max_component_error':norm,'triangles':len(b['p'])}
    rigcheck=bones(rig)==sourcebones==baseline['bones'];assert rigcheck
    props=[o.name for o in bpy.data.objects if o.type=='MESH'];assert sorted(props)==sorted(['body','head_face','hair','eye_lids','eye_iris','glasses_frame','glasses_lens'])
    assert all(bpy.data.objects[n].parent_bone=='head' for n in ['glasses_frame','glasses_lens'])
    images=[{'name':i.name,'size':list(i.size)} for i in bpy.data.images if i.users];assert all(max(i['size'])<=2048 for i in images)
    report={'source_blend_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==baseline['source_sha256'],'source_mesh_checks':checks,'rig_exact_to_eyes_and_stage6_pass10':rigcheck,'glasses_head_children':True,'part_names':props,'saved_images':images,'all_images_at_most_2048':True}
    assert report['source_blend_unchanged'];write(out/'saved-verification.json',report)
    compression=json.loads((out/'compression.json').read_text());bb=json.loads((out/'blender-export.json').read_text());rigdata=json.loads((out/'rig.json').read_text());glass=json.loads((out/'glasses-measurement.json').read_text())
    metrics={'input':'eyes/character-eyes.blend','output':'export/character.glb','bones':rigdata,'parts':bb['parts'],'triangles':sum(p['triangles'] for p in bb['parts'].values()),'images':compression['images'],'glb_sizes':compression['sizes'],'compression':{k:compression[k] for k in ['format','reason','exactPreservation','under10MiB','target5to8MiB','cliValidatorNote']},'validator':compression['validator'],'glasses':glass,'saved_verification':report,'ao':{'bake':json.loads((out/'ao-bake.json').read_text()),'statistics':json.loads((out/'ao-image-statistics.json').read_text()),'blender_review':'Imported glTF occlusion R multiplied into basecolor at exported strength 0.35 for inspection; not a Web lighting implementation.'},'assumptions':['20 existing bones and arm/leg weights retained; hand replacement and peace gesture are outside this request','Frame diameter uses median of 12 v4 rim cross-sections with 1177 design px per meter, constant across rims/bridge/temples','AO radius 80 mm, 32 samples, strength 0.35; three sources from stage7 high density checkpoint; matching surface projection distances recorded','Eye lids: 3 x 512px frames; moving iris 1024px; fixed aperture 3 x 512px. Web shader multiplies aperture independently of gaze; independent mask UV shifted along with eyelid frame in Blender review','Blender cannot read meshopt directly: delivery GLB decoded by glTF Transform with verified matching accessors, then imported for render','Lossless WebP used because toktx is unavailable. Official validator API used because the package has no CLI executable'],'limitations':['Web illumination and tone mapping are stage12 work','The independent fixed-aperture and moving-iris combination needs the documented Web shader; standard glTF alone shows the default open state','Validator warnings record generated tangent space (4) and non-root skinned meshes (5); these are not errors']}
    required=['export-check.png','ao-compare.png','glasses-thickness.png','eye-downsize-check.png','character.glb','character-export.blend','character-roundtrip.blend']
    metrics['artifacts']={name:{'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in required}
    write(out/'metrics.json',metrics);log(out,'検査: 保存Blendを読み直し、元の形・元UV・ウェイトと骨の一致を確認。metrics.jsonへ統合。')
