"""Re-render diagnostic wire overlays without changing the saved character."""
import bpy,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK
from lowpoly9 import render_wire
from lowpoly2 import reset_pose
out=WORK/'lowpoly9';bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly9.blend'));reset_pose(bpy.data.objects['temporary_rig'])
render_wire(out,bpy.data.objects['low6_body'],bpy.data.objects['low9_head'],bpy.context.scene.camera)
