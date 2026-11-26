"""xatlas works on a position-welded UV proxy; output is only corner UVs."""
import sys,json
from pathlib import Path
import numpy as np,xatlas
p=Path(sys.argv[1]);a=np.load(p);vertices,inv=np.unique(a['p'],axis=0,return_inverse=True);faces=inv[a['f']].astype(np.uint32)
from scipy import sparse
# Relax only the UV proxy, so generated micro-folds do not create one chart
# per triangle. Original positions and the bake source remain untouched.
a=faces[:,[0,1,2]].reshape(-1);b=faces[:,[1,2,0]].reshape(-1)
graph=sparse.coo_matrix((np.ones(len(a)),(a,b)),shape=(len(vertices),)*2);graph=graph+graph.T;graph.data[:]=1;graph=graph.tocsr();den=np.asarray(graph.sum(1)).reshape(-1,1)
proxy=vertices.copy()
for _ in range(12):proxy=proxy*.65+(graph@proxy)/np.maximum(den,1)*.35
atlas=xatlas.Atlas();atlas.add_mesh(proxy.astype(np.float32),faces)
chart=xatlas.ChartOptions();chart.max_iterations=2;chart.normal_deviation_weight=.5;chart.normal_seam_weight=0;chart.texture_seam_weight=0;chart.max_cost=8;chart.straightness_weight=0;chart.fix_winding=True
pack=xatlas.PackOptions();pack.resolution=4096;pack.padding=16;pack.bilinear=True;pack.rotate_charts=True
atlas.generate(chart,pack,verbose=True)
vmapping,indices,uv=atlas[0]
assert np.array_equal(vmapping[indices],faces),'xatlas changed triangle order'
np.save(p.with_name(p.stem+'-atlas.npy'),uv[indices])
p.with_name(p.stem+'-atlas.json').write_text(json.dumps({'xatlas_version':'0.0.11','chart_count':atlas.chart_count,'atlas_count':atlas.atlas_count,'width':atlas.width,'height':atlas.height,'utilization':atlas.utilization,'options':{'max_iterations':2,'normal_deviation_weight':.5,'normal_seam_weight':0,'texture_seam_weight':0,'max_cost':8,'straightness_weight':0,'fix_winding':True,'proxy_relaxation_iterations':12,'resolution':4096,'padding':16,'bilinear':True},'proxy_only_welded_vertices':int(len(vertices))},indent=2))
