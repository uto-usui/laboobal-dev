"""Export actual saved bone transforms for occupancy-grid contact measurements."""
import bpy,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK
from lowpoly9 import export_contacts
out=WORK/'lowpoly9';bpy.ops.wm.open_mainfile(filepath=str(out/'character-lowpoly9.blend'))
export_contacts(out,bpy.data.objects['low6_body'],bpy.data.objects['low9_head'],bpy.data.objects['temporary_rig'])
