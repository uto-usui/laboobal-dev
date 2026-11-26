"""Share filter deltas at UV seam vertices without changing paint boundaries."""
import os,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT/'.work/toy-character';OUT=Path(os.environ.get('TOY_EDGES_OUT',WORK/'edges')).resolve()
def read(name):return np.array(Image.open(OUT/name).convert('RGB'))
def correct():
 a=np.load(WORK/'texture/body-uv.npz');p=a['p'];f=a['f'];uv=a['new'];size=4096
 _,canonical=np.unique(p,axis=0,return_inverse=True);ids=canonical[f].ravel();n=int(ids.max())+1
 keys=np.column_stack((ids,np.round(uv.reshape(-1,2)*1e6).astype(np.int64)))
 unique=np.unique(keys,axis=0);split=np.bincount(unique[:,0],minlength=n)>1
 counts=np.bincount(ids,minlength=n);xy=uv.reshape(-1,2)*[size,-size]+[-.5,size-.5]
 def sample(im):
  q=np.pad(xy,((0,(-len(xy))%1024),(0,0)),mode='edge').reshape(-1,1024,2).astype(np.float32)
  z=cv2.remap(im.astype(np.float32),q[:,:,0],q[:,:,1],cv2.INTER_LINEAR)
  return z.reshape((-1,)+im.shape[2:])[:len(xy)]
 original=read('body-transfer4096.png');guard=read('body-atlas-guard.png')[:,:,0]>0
 guarded=sample(guard.astype(np.uint8)*255)>0
 # Exclude all corners of a seam vertex if any incident corner is protected.
 forbidden=np.bincount(ids,weights=guarded.astype(float),minlength=n)>0
 allowed=split&~forbidden
 target=uv*[size,-size]+[0,size]
 report=[]
 corrections=[]
 for strength in [1,2,3]:
  path=OUT/f'body-x{strength}-before-seams.png'
  if not path.exists():Image.open(OUT/f'body-x{strength}.png').save(path)
  image=read(path.name);delta=image.astype(np.float32)-original.astype(np.float32);values=sample(delta)
  mean=np.column_stack([np.bincount(ids,weights=values[:,c],minlength=n)/np.maximum(counts,1) for c in range(3)])
  correction=mean[ids]-values;correction[~allowed[ids]]=0
  corrections.append(correction.reshape(-1,3,3))
  report.append({'strength':strength,'seam_delta_rms':float(np.sqrt(np.mean(correction[allowed[ids]]**2))),'eligible_seam_vertices':int(allowed.sum())})
 print(json.dumps(report),flush=True)
 if os.environ.get('EDGES_SEAMS_MEASURE_ONLY'):return
 # The same barycentric interpolation used for source colors also transports
 # the small seam correction, without touching positions, normals or UVs.
 fields=np.zeros((3,size,size,3),np.float32)
 for i,dst in enumerate(target):
  lo=np.maximum(np.ceil(dst.min(0)-.5).astype(int),0);hi=np.minimum(np.floor(dst.max(0)-.5).astype(int),size-1)
  if np.any(hi<lo):continue
  v0=dst[1]-dst[0];v1=dst[2]-dst[0];den=v0[0]*v1[1]-v0[1]*v1[0]
  if abs(den)<1e-10:continue
  xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5-dst[0,0],np.arange(lo[1],hi[1]+1)+.5-dst[0,1])
  u=(xx*v1[1]-yy*v1[0])/den;v=(v0[0]*yy-v0[1]*xx)/den;inside=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
  sy,sx=np.where(inside)
  if not len(sx):continue
  for k,colors in enumerate(corrections):
   c=colors[i];value=c[0]+u[inside,None]*(c[1]-c[0])+v[inside,None]*(c[2]-c[0]);fields[k,lo[1]+sy,lo[0]+sx]=value
 from scipy import ndimage
 cache=np.load(OUT/'body-mapping4096.npz');coverage=cache['coverage'];_,indices=ndimage.distance_transform_edt(~coverage,return_indices=True)
 for k in range(3):
  image=read(f'body-x{k+1}-before-seams.png');result=np.rint(np.clip(image.astype(float)+fields[k],0,255)).astype(np.uint8)
  result[guard]=image[guard];result=result[indices[0],indices[1]]
  assert np.array_equal(result[guard&coverage],original[guard&coverage])
  values=sample(result.astype(np.float32)-original.astype(np.float32))
  mean=np.column_stack([np.bincount(ids,weights=values[:,c],minlength=n)/np.maximum(counts,1) for c in range(3)])
  report[k]['seam_delta_rms_after']=float(np.sqrt(np.mean((mean[ids]-values)[allowed[ids]]**2)))
  report[k]['guard_exact_after']=True
  Image.fromarray(result).save(OUT/f'body-x{k+1}.png')
 (OUT/'seams.json').write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':correct()
