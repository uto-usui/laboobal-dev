import bpy,sys,json,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import coords,triangles,WORK
from lowpoly_verify import combined
from lowpoly8_neck import section_segments
bpy.ops.wm.open_mainfile(filepath=str(WORK/'lowpoly8/character-lowpoly8.blend'))
out=WORK/'lowpoly9';out.mkdir(exist_ok=True)
h=bpy.data.objects['high3_head_original'];v=coords(h);f=triangles(h)
rows=[]
for z in [.685,.690,.695]:
 s=section_segments(v,f,z).reshape(-1,2);rows.append({'z':z,'center':np.r_[(s.min(0)+s.max(0))/2,z].tolist()})
print('BOTTOMS', {n:float(coords(bpy.data.objects[n])[:,2].min()) for n in ['high3_head_original','low6_head']},flush=True)
print('CENTERS',rows,flush=True)
v,f=combined([h,bpy.data.objects['high3_cap_original']]);np.savez(out/'head-source.npz',V=v,F=f)
b=bpy.data.objects['low6_body'];np.savez(out/'body-source.npz',V=coords(b),F=triangles(b))
print('OBJECTS',[(o.name,len(o.data.vertices)) for o in bpy.data.objects if o.type=='MESH'],flush=True)
print('GRID',[(n,np.load(WORK/'lowpoly8'/n).files) for n in ['body-grid.npz','filled-grid.npz']],flush=True)
