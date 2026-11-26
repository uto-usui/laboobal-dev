"""Geometry-only measurements and 1 mm head filling; never authors vertices."""
import sys,json,time,hashlib
from pathlib import Path
import numpy as np
import igl
from scipy import ndimage,sparse
from scipy.sparse.csgraph import connected_components,maximum_flow,breadth_first_order,dijkstra
from skimage.measure import marching_cubes
from solidify import escape_counts,largest,note

def head_fill(out):
 d=np.load(out/'head-source.npz');v=d['V'].astype(float);f=d['F'].astype(np.int64);h=.001
 lo=v.min(0)-10*h;axes=[np.arange(lo[k],v[:,k].max()+11*h,h) for k in range(3)];shape=tuple(map(len,axes))
 digest=hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest();cache=out/'head-winding.npz'
 cached=np.load(cache) if cache.exists() else None
 if cached is not None and 'source_sha256' in cached and str(cached['source_sha256'])==digest:shell=cached['shell']
 else:
  shell=np.empty(shape,bool);yz=np.stack(np.meshgrid(axes[1],axes[2],indexing='ij'),-1).reshape(-1,2)
  for i in range(0,shape[0],4):
   xs=axes[0][i:i+4];q=np.empty((len(xs),len(yz),3));q[:,:,0]=xs[:,None];q[:,:,1:]=yz
   shell[i:i+len(xs)]=(abs(igl.fast_winding_number(v,f,q.reshape(-1,3)))>.5).reshape(len(xs),shape[1],shape[2])
   if i%40==0:note(out,f'頭 winding {i}/{shape[0]}')
  np.savez_compressed(out/'head-winding.npz',shell=shell,lo=lo,h=h,source_sha256=digest)
 st=ndimage.generate_binary_structure(3,1);wall=ndimage.binary_dilation(shell,st,iterations=1)
 note(out,'頭 26方向');counts=escape_counts(wall);solid=ndimage.binary_erosion(largest(ndimage.binary_fill_holes(counts<3)),st,iterations=1)
 # Keep the original bottom as a plane cut; no new contour is specified.
 solid[:,:,:int(np.ceil((v[:,2].min()-lo[2])/h))]=False
 np.savez_compressed(out/'head-grid.npz',solid=solid,lo=lo,h=h)
 vv,ff,_,_=marching_cubes(solid.astype(np.float32),.5,spacing=(h,h,h),allow_degenerate=False);vv+=lo
 np.savez(out/'head-filled.npz',V=vv,F=ff)
 report={'source_sha256':digest,'h':h,'shape':shape,'vertices':len(vv),'triangles':len(ff),'original_bottom_m':float(v[:,2].min()),'filled_bottom_m':float(vv[:,2].min()),'method':'abs(winding)>0.5; 1-cell 6-neighbor wall; escape_counts<3 of 26; fill holes; largest; erode 1 cell'}
 (out/'head-fill.json').write_text(json.dumps(report,indent=2));note(out,'頭充填 '+json.dumps(report))

def bridges(out):
 d=np.load(out/'body-source.npz');v=d['V'];f=d['F'];n=len(f);c=v[f].mean(1);height=v[f,2].max(1)
 edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),1);owners=np.tile(np.arange(n),3);order=np.lexsort((edges[:,1],edges[:,0]));e=edges[order];own=owners[order];same=np.all(e[1:]==e[:-1],1);a=own[:-1][same];b=own[1:][same]
 adjacency=sparse.coo_matrix((np.ones(2*len(a)),(np.r_[a,b],np.r_[b,a])),shape=(n,n)).tocsr()
 low=height<=.55;ids=np.flatnonzero(low);_,ll=connected_components(adjacency[ids][:,ids]);stats=[]
 for k in np.unique(ll):
  ix=ids[ll==k];stats.append({'id':int(k),'faces':len(ix),'center':c[ix].mean(0).tolist()})
 torso=max(stats,key=lambda x:x['faces'])['id'];limit=height<=.567;ix=np.flatnonzero(limit);lookup=np.full(n,-1);lookup[ix]=np.arange(len(ix));N=len(ix);allcut=[];rows={}
 for side,sign in [('L',1),('R',-1)]:
  arm=max([s for s in stats if s['id']!=torso and sign*s['center'][0]>.09],key=lambda s:s['faces'])['id'];src=lookup[ids[ll==arm]];dst=lookup[ids[ll==torso]]
  ok=limit[a]&limit[b];aa=lookup[a[ok]];bb=lookup[b[ok]];nn=np.arange(N);big=1000000
  rr=np.r_[nn,aa+N,bb+N,np.full(len(src),2*N),dst+N];cc=np.r_[nn+N,bb,aa,src,np.full(len(dst),2*N+1)];cap=np.r_[np.where(height[ix]>.55,1,big),np.full(2*len(aa)+len(src)+len(dst),big)]
  graph=sparse.coo_matrix((cap,(rr,cc)),shape=(2*N+2,2*N+2),dtype=np.int64).tocsr();flow=maximum_flow(graph,2*N,2*N+1);res=graph-flow.flow;res.data=(res.data>0).astype(int);res.eliminate_zeros();reachable=np.zeros(2*N+2,bool);reachable[breadth_first_order(res,2*N,directed=True,return_predecessors=False)]=True
  cut=ix[reachable[:N]&~reachable[N:2*N]];allcut.extend(cut.tolist());after=limit.copy();after[cut]=False;aid=np.flatnonzero(after);_,la=connected_components(adjacency[aid][:,aid]);alook=np.full(n,-1);alook[aid]=la
  separated=not bool(set(alook[ids[ll==arm]])&set(alook[ids[ll==torso]]))
  rows[side]={'minimum_cut_count':len(cut),'separation_verified':separated,'max_flow':int(flow.flow_value),'face_indices':cut.tolist(),'centers_mm':(c[cut]*1000).tolist(),'bounds_mm':(np.array([v[f[cut]].min((0,1)),v[f[cut]].max((0,1))])*1000).tolist()}
  assert separated and np.all((height[cut]>.55)&(height[cut]<=.567))
 (out/'armpit-bridges.json').write_text(json.dumps({'method':'shared-edge face dual graph; lower 550mm components; minimum vertex cut within 550..567mm; removal checked','lower_components':stats,'sides':rows},indent=2))
 # Intrinsic distance follows the actual mesh, so nearby unconnected sides of a slit do not bleed.
 ed=np.unique(edges,axis=0);length=np.linalg.norm(v[ed[:,0]]-v[ed[:,1]],axis=1);g=sparse.coo_matrix((np.r_[length,length],(np.r_[ed[:,0],ed[:,1]],np.r_[ed[:,1],ed[:,0]])),shape=(len(v),len(v))).tocsr();fields={}
 for side,row in rows.items():
  seeds=np.unique(f[row['face_indices']]);fields[side]=dijkstra(g,indices=seeds,min_only=True,limit=.03)
 np.savez(out/'bridge-distances.npz',**fields);note(out,'脇接続 '+json.dumps({s:{k:v for k,v in r.items() if k not in ['centers_mm','face_indices']} for s,r in rows.items()}))

if __name__=='__main__':
 out=Path(sys.argv[1]);{'head':head_fill,'bridges':bridges}[sys.argv[2]](out)
