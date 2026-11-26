"""Distances to original triangles; only processed-to-original decides shape acceptance."""
import sys,json
from pathlib import Path
import numpy as np,igl
from scipy import ndimage
out=Path(sys.argv[1]);rng=np.random.default_rng(642)
names={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes',0:'face_head',1:'hair'}
g=np.load(out/'filled-grid.npz');lo=g['lo'];h=float(g['h']);near=ndimage.binary_dilation(g['slit'],iterations=2)

def excluded(points):
    ix=np.floor((points-lo)/h+.5).astype(int);ix=np.clip(ix,0,np.array(near.shape)-1)
    return near[tuple(ix.T)]

def samples(v,f,n=150000):
    area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1);ids=rng.choice(len(f),n,p=area/area.sum())
    b=rng.dirichlet([1,1,1],n);return np.r_[(v[f[ids]]*b[:,:,None]).sum(1),v[np.unique(f)]]

result={};maps={}
for region in ['body','head']:
    hi=np.load(out/f'original_{region}.npz');low=np.load(out/f'final_{region}.npz');hv=hi['V'].astype(float);hf=hi['F'].astype(np.int64);lv=low['V'].astype(float);lf=low['F'].astype(np.int64)
    for pid in np.unique(low['labels']):
        name=names[int(pid)];result[name]={}
        for direction,source,target in [('low_to_high',low,hi),('high_to_low',hi,low)]:
            v=source['V'];f=source['F'][source['labels']==pid];tv=target['V'].astype(float);tf=target['F'].astype(np.int64)
            if not len(f):continue
            points=samples(v,f);mask=excluded(points) if region=='body' and direction=='low_to_high' else np.zeros(len(points),bool)
            # Closing planes are new hidden surfaces, not original exterior shape.
            neck=json.loads((out/'construction.json').read_text())['neck'];cut=neck['body_cut_m'] if region=='body' else neck['head_cut_m']
            closure=abs(points[:,2]-cut)<1e-6;mask|=closure
            sd,_,_=igl.point_mesh_squared_distance(points[~mask].astype(float),tv,tf);mm=np.sqrt(sd)*1000
            limit=2.5 if pid==9 else .3 if name=='face_head' else 1.5
            result[name][direction]={'p95_mm':float(np.percentile(mm,95)) if len(mm) else None,'max_mm':float(mm.max()) if len(mm) else None,'samples':len(mm),'area_samples_before_exclusions':150000,'slit_and_closure_samples_excluded':int(mask.sum()),'p95_limit_mm':limit,'p95_pass':bool(len(mm) and np.percentile(mm,95)<=limit),'decision_metric':direction=='low_to_high'}
        print(name,json.dumps(result[name]),flush=True)
    # Full vertex error map uses the same authoritative original surface.
    sd,_,_=igl.point_mesh_squared_distance(lv,hv,hf);np.save(out/f'{region}-vertex-distances.npy',np.sqrt(sd))
metrics={'distances_full_source':result,'distance_method':'150000 area-weighted samples per part plus used vertices; nearest ORIGINAL whole body/head triangles, seed 642. Processed-to-original only decides; reverse is reference. Slit neighborhood dilated two 2mm cells and exact closure planes excluded. Probe reproduction separately uses original marching-cubes vertices.'}
(out/'distance-metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
