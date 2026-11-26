"""Clean seam-rim topology without displacing any existing surface position."""
import sys,json
from pathlib import Path
import numpy as np,pymeshlab as ml
from scipy.spatial import cKDTree
out=Path(sys.argv[1]);d=np.load(out/'seam-clean-input.npz');v=d['V'];f=d['F'];ms=ml.MeshSet();ms.add_mesh(ml.Mesh(v,f));steps=[]
for _ in range(3):
 for name,params in [('meshing_remove_duplicate_faces',{}),('meshing_remove_null_faces',{}),('meshing_repair_non_manifold_edges',{'method':'Remove Faces'}),('meshing_repair_non_manifold_vertices',{'vertdispratio':0.0}),('meshing_close_holes',{'maxholesize':10000,'selfintersection':False,'refinehole':False})]:
  ms.apply_filter(name,**params);steps.append({'operator':name,'parameters':params,'vertices':ms.current_mesh().vertex_number(),'faces':ms.current_mesh().face_number()})
ms.apply_filter('meshing_re_orient_faces_coherently')
m=ms.current_mesh();q=m.vertex_matrix();g=m.face_matrix();dd,_=cKDTree(v).query(q);assert dd.max()<1e-10
# Track every removed triangle by exact vertex positions, independently of indices.
key=lambda points:tuple(sorted(tuple(x) for x in points))
remaining={key(x) for x in q[g]};removed=[x for x in v[f] if key(x) not in remaining]
report={'steps':steps,'max_position_distance_to_existing_vertices_mm':float(dd.max()*1000),'removed_input_triangles':len(removed),'removed_input_height_range_mm':[float(np.array(removed)[:,:,2].min()*1000),float(np.array(removed)[:,:,2].max()*1000)] if removed else None,'new_positions':0,'closed_with_existing_rim_vertices_only':True}
np.savez(out/'seam-clean-output.npz',V=q,F=g);(out/'seam-cleanup.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
