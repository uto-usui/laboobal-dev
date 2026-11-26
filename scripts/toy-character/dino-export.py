import bpy,sys,json
from pathlib import Path
base=Path('.work/toy-character/dino');raw=base/'raw';raw.mkdir(exist_ok=True)
source=base/'vendor/dinosaur/Dinosaur Animated Pack - Dec 2018/Blends'
report=[]
quadrupeds={'Triceratops','Stegosaurus','Apatosaurus'}
only_quadrupeds='--quadrupeds' in sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else False
for f in source.glob('*.blend'):
 if only_quadrupeds and f.stem not in quadrupeds:continue
 bpy.ops.wm.open_mainfile(filepath=str(f.resolve()))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 wanted=[a for a in bpy.data.actions if a.name.endswith(('_Walk','_Idle'))]
 for a in list(bpy.data.actions):
  if a not in wanted:bpy.data.actions.remove(a)
 for a in wanted:
  a.name=a.name.rsplit('_',1)[-1]
  if f.stem=='Velociraptor' and a.name=='Walk':
   a.use_frame_range=True;a.frame_start=0;a.frame_end=28
 if rig.animation_data:
  for t in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(t)
 rig.animation_data_create();rig.animation_data.action=next(a for a in wanted if a.name=='Idle')
 bpy.context.scene.frame_set(0)
 print('MATERIALS',f.stem,[(m.name,tuple(m.diffuse_color)) for m in bpy.data.materials])
 for m in bpy.data.materials:
  c=m.diffuse_color
  # 元の明暗と部位分けを残し、強い彩度を背景のセージ色へ寄せる。
  l=sum(c[:3])/3
  m.diffuse_color=(0.20+l*.28,0.25+l*.30,0.19+l*.27,1)
  if 'eye' in m.name.lower() or 'black' in m.name.lower():m.diffuse_color=(.055,.066,.052,1)
  if 'white' in m.name.lower() or 'teeth' in m.name.lower():m.diffuse_color=(.65,.64,.51,1)
  m.use_nodes=True;m.node_tree.nodes.clear();out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface']);p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Roughness'].default_value=.94;p.inputs['Metallic'].default_value=0
 bpy.ops.export_scene.gltf(filepath=str((raw/(f.stem+'.glb')).resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_current_frame=False,export_materials='EXPORT',export_cameras=False,export_lights=False)
 report.append({'name':f.stem,'source':f.name,'actions':[(a.name,list(a.frame_range)) for a in wanted]})
(base/('quadruped-conversion.json' if only_quadrupeds else 'conversion.json')).write_text(json.dumps(report,indent=2))

for name in ([] if only_quadrupeds else ['PalmTree_1','PalmTree_3']):
 bpy.ops.wm.open_mainfile(filepath=str((base/'vendor/ultimate/Blends'/(name+'.blend')).resolve()))
 bpy.ops.export_scene.gltf(filepath=str((raw/(name+'.glb')).resolve()),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False)
