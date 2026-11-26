import numpy as np,json,os
from pathlib import Path
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
OUT=Path(os.environ.get('TOY_DISPLAY2_OUT','.work/toy-character/display2'))
report={}
for name in ['head_face','hair','body']:
 d=np.load(OUT/(name+'-inspect.npz'));p=d['p'];f=d['f']
 # Coincident seam vertices belong to the same geometric component.
 _,inv=np.unique(np.round(p,7),axis=0,return_inverse=True);wf=inv[f];e=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]]);n=int(inv.max()+1)
 edges=np.sort(e,axis=1);_,ei=np.unique(edges,axis=0,return_inverse=True);fi=np.tile(np.arange(len(f)),3);order=np.argsort(ei);se=ei[order];sf=fi[order];same=se[1:]==se[:-1];pairs=np.stack([sf[1:][same],sf[:-1][same]],axis=1)
 _,fl=connected_components(coo_matrix((np.ones(len(pairs)),(pairs[:,0],pairs[:,1])),shape=(len(f),len(f))),directed=False)
 rows=[]
 for i in np.unique(fl):
  ids=np.where(fl==i)[0];q=p[np.unique(f[ids])];a=p[f[ids]];area=np.linalg.norm(np.cross(a[:,1]-a[:,0],a[:,2]-a[:,0]),axis=1).sum()/2
  rows.append(dict(id=int(i),faces=len(ids),lo=q.min(0).tolist(),hi=q.max(0).tolist(),area=float(area),center=q.mean(0).tolist()))
 rows.sort(key=lambda a:-a['faces']);report[name]=rows
 np.save(OUT/(name+'-face-components.npy'),fl)
 print(name,'components',len(rows));print(json.dumps(rows[:10],indent=2))
(OUT/'components.json').write_text(json.dumps(report,indent=2))
