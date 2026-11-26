import bpy,sys,numpy as np,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from lowpoly import WORK,coords,triangles
bpy.ops.wm.open_mainfile(filepath=str(WORK/'lowpoly9/character-lowpoly9.blend'))
for n in ['low6_body','low9_head','high3_head_original','high3_cap_original']:
 o=bpy.data.objects[n];p=coords(o);f=triangles(o);area=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)/2
 print('PROBE',n,len(p),len(f),'attrs',[(a.name,a.domain) for a in o.data.attributes],'matrix',list(map(list,o.matrix_world)),'bounds',p.min(0),p.max(0),flush=True)
 if n=='low6_body':
  for i in np.flatnonzero(area<1e-14):print('DEGENERATE',i,f[i],p[f[i]],'neighbors',[(q.index,list(q.vertices)) for q in o.data.polygons if set(q.vertices)&set(f[i])],flush=True)
