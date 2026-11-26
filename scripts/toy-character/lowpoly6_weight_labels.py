"""External voxel-side provenance for the new armpit cut surfaces."""
import sys,json
from pathlib import Path
from collections import Counter
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
out=Path(sys.argv[1]);d=np.load(out/'weight-label-input.npz');q=d['V'];labels=d['labels'].copy()
original=labels.copy();g=np.load(out/'filled-grid.npz');solid=g['solid'];lo=g['lo'];h=float(g['h'])
near=ndimage.binary_dilation(g['slit'],iterations=2);ix=np.clip(np.floor((q-lo)/h+.5).astype(int),0,np.array(solid.shape)-1)
selected=near[tuple(ix.T)]&(q[:,2]<.567)&(q[:,2]>=.40)
source=np.load(out/'source.npz');stree=cKDTree(source['V'][source['F']].mean(1));zids=range(int(round((.40-lo[2])/h)),int(round((.567-lo[2])/h)))
positions=[];classes=[]
for iz in zids:
    cc,n=ndimage.label(solid[:,:,iz])
    for component in range(1,n+1):
        cells=np.argwhere(cc==component);sample=cells[::max(1,len(cells)//250)]
        xyz=lo+np.c_[sample,np.full(len(sample),iz)]*h;_,nn=stree.query(xyz);lab=source['labels'][nn]
        counts=Counter(lab.tolist());major=counts.most_common(1)[0][0]
        pid=4 if np.isin(lab,[4,6]).sum()>len(lab)/2 else 5 if np.isin(lab,[5,7]).sum()>len(lab)/2 else major
        positions.append(lo+np.c_[cells,np.full(len(cells),iz)]*h);classes.append(np.full(len(cells),pid))
points=np.concatenate(positions);cl=np.concatenate(classes);_,nn=cKDTree(points).query(q[selected]);ids=np.flatnonzero(selected);arm=np.isin(cl[nn],[4,5]);labels[ids[arm]]=cl[nn[arm]]
report={'changed_vertices':int((labels!=original).sum()),'method':'only vertices near new armpit cut, below .567m; nearest surviving voxel connected section, majority source face-center labels; original labels elsewhere','changes':{f'{a}->{b}':int(((original==a)&(labels==b)).sum()) for a in np.unique(original) for b in [4,5] if a!=b and ((original==a)&(labels==b)).any()}}

np.save(out/'weight-labels.npy',labels)
(out/'slit-weight-labels.json').write_text(json.dumps(report,indent=2)+'\n')
