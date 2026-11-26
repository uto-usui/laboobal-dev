"""Remove only occupied cells whose closest ORIGINAL triangle has label 0 or 1."""
import sys,json,time
from pathlib import Path
import numpy as np,igl
from skimage.measure import marching_cubes
out=Path(sys.argv[1]);g=np.load(out/'filled-grid.npz');solid=g['solid'].copy();lo=g['lo'];h=float(g['h']);src=np.load(out/'source.npz');v=src['V'].astype(float);f=src['F'].astype(np.int64)
ii=np.argwhere(solid);removed=0;counts={}
for start in range(0,len(ii),100000):
 ids=ii[start:start+100000];q=lo+ids*h
 _,faces,_=igl.point_mesh_squared_distance(q,v,f);labels=src['labels'][faces];drop=np.isin(labels,[0,1]);solid[tuple(ids[drop].T)]=False;removed+=int(drop.sum())
 for k,n in zip(*np.unique(labels,return_counts=True)):counts[int(k)]=counts.get(int(k),0)+int(n)
 print('volume nearest triangles',start,len(ii),flush=True)
np.savez_compressed(out/'body-grid.npz',solid=solid,lo=lo,h=h,slit=g['slit'])
v,f,_,_=marching_cubes(solid.astype(np.float32),.5,spacing=(h,h,h));v+=lo;np.savez(out/'body-without-old-head.npz',V=v,F=f)
report={'method':'exact closest original triangle for every occupied grid point; remove labels 0 and 1 only','occupied_before':len(ii),'removed_cells':removed,'nearest_label_counts':counts,'occupied_after':int(solid.sum()),'preserved_other_label_cells':True,'triangles':len(f)}
(out/'old-head-removal.json').write_text(json.dumps(report,indent=2)+'\n')
with (out/'log.md').open('a') as s:s.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' 古い頭の除去 '+json.dumps(report)+'\n')
