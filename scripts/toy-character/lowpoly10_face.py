"""Same studio close-ups of the source and retained ninth/tenth-pass heads."""
import sys,bpy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK
from lowpoly2 import reset_pose
from lowpoly9 import shot
out=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else WORK/'lowpoly10';bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly10.blend'));reset_pose(bpy.data.objects['temporary_rig']);scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;cam=scene.camera;clay=bpy.data.objects['low10_head'].data.materials[0]
for name in ['high3_head_original','high3_cap_original','low9_head','low10_head']:
 o=bpy.data.objects[name];o.data.materials.clear();o.data.materials.append(clay)
 for f in o.data.polygons:f.material_index=0
for label,names in [('original',['high3_head_original','high3_cap_original']),('ninth',['low9_head']),('tenth',['low10_head'])]:
 for a in [0,25,90]:shot(out,cam,f'face-{label}-{a}.png',[bpy.data.objects[n] for n in names],a,(0,-.03,.81),.27)
