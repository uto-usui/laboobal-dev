"""Source-color guards, direct UV resampling, and scale-aware bilateral variants."""
import json,os,time
from pathlib import Path
import cv2,numpy as np
from scipy import ndimage
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT/'.work/toy-character'
OUT=Path(os.environ.get('TOY_EDGES_OUT',WORK/'edges')).resolve()

def log(message):print(time.strftime('%H:%M:%S'),message,flush=True)
def rgb(path):return np.array(Image.open(path).convert('RGB'))
def save(path,a):Image.fromarray(a).save(path)

def guards(image):
    # Differences are computed on the original 4096 image, before UV transfer.
    # A mild prefilter rejects isolated generated grain; no semantic labels are
    # used to decide where a color edge lies.
    lab=cv2.cvtColor(image.astype(np.float32)/255,cv2.COLOR_RGB2LAB)
    guide=cv2.GaussianBlur(lab,(0,0),.65)
    dx=np.linalg.norm(guide[:,4:]-guide[:,:-4],axis=2)
    dy=np.linalg.norm(guide[4:]-guide[:-4],axis=2)
    difference=np.zeros(image.shape[:2],np.float32)
    difference[:,2:-2]=dx;difference[2:-2]=np.maximum(difference[2:-2],dy)
    edge=(difference>13).astype(np.uint8)
    protected=cv2.dilate(edge,np.ones((7,7),np.uint8)).astype(bool)
    return edge,protected

def transfer_map(name,size=4096):
    cache=OUT/(name+f'-mapping{size}.npz')
    if cache.exists():
        a=np.load(cache);return a['x'],a['y'],a['coverage'],a['island']
    a=np.load(WORK/'texture'/(name+'-uv.npz'))
    target=a['new']*np.array([size,-size])+[0,size]
    source=a['old']*np.array([4096,-4096])+[-.5,4095.5]
    xmap=np.full((size,size),-1,np.float32);ymap=xmap.copy();island=np.full((size,size),-1,np.int32)
    from texture_process import islands
    _,labels=islands(a['f'],a['new'])
    for i,(dst,src) in enumerate(zip(target,source)):
        lo=np.maximum(np.ceil(dst.min(0)-.5).astype(int),0);hi=np.minimum(np.floor(dst.max(0)-.5).astype(int),size-1)
        if np.any(hi<lo):continue
        v0=dst[1]-dst[0];v1=dst[2]-dst[0];den=v0[0]*v1[1]-v0[1]*v1[0]
        if abs(den)<1e-10:continue
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5-dst[0,0],np.arange(lo[1],hi[1]+1)+.5-dst[0,1])
        u=(xx*v1[1]-yy*v1[0])/den;v=(v0[0]*yy-v0[1]*xx)/den;inside=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
        sy,sx=np.where(inside)
        if len(sx):
            sample=src[0]+u[inside,None]*(src[1]-src[0])+v[inside,None]*(src[2]-src[0])
            xmap[lo[1]+sy,lo[0]+sx]=sample[:,0];ymap[lo[1]+sy,lo[0]+sx]=sample[:,1];island[lo[1]+sy,lo[0]+sx]=labels[i]
        if i%50000==0:log(f'{name}: rasterized {i}/{len(target)} triangles')
    coverage=xmap>=0
    # Nearest occupied texel extension cannot blend different chart colors.
    # It fills the entire gutter; the source-colored 4px edge guard is extended
    # by the same mapping, so padding cannot introduce filtered edge pixels.
    _,indices=ndimage.distance_transform_edt(~coverage,return_indices=True)
    xmap=xmap[indices[0],indices[1]];ymap=ymap[indices[0],indices[1]];island=island[indices[0],indices[1]]
    np.savez_compressed(cache,x=xmap,y=ymap,coverage=coverage,island=island)
    return xmap,ymap,coverage,island

def skin_amount(image,protected):
    hsv=cv2.cvtColor(image,cv2.COLOR_RGB2HSV);h,s,v=cv2.split(hsv)
    lab=cv2.cvtColor(image.astype(np.float32)/255,cv2.COLOR_RGB2LAB)
    # Warm, bright, low-redness skin only. Saturated pink cheeks, dark features,
    # hair and the source color edges receive zero filter contribution.
    skin=(h>=7)&(h<=24)&(s>=25)&(s<=155)&(v>=135)&(lab[:,:,1]<23)&~protected
    inside=ndimage.distance_transform_edt(skin)
    return np.clip((inside-2)/4,0,1).astype(np.float32)*.22

def filter_variants(image,protected,face=False):
    amount=skin_amount(image,protected) if face else (~protected).astype(np.float32)
    if not face:
        # Fade in inside the guard; the entire guard stays bit-exact.
        distance=ndimage.distance_transform_edt(~protected)
        amount=np.clip((distance-1)/4,0,1).astype(np.float32)
    # SigmaSpace doubles relative to texture/2048 to retain the same physical
    # smoothing radius at 4096. Repetition defines x1/x2/x3, not brightness.
    current=image.copy();result=[]
    for strength in [1,2,3]:
        a=cv2.bilateralFilter(current,41,32,12)
        a=cv2.bilateralFilter(a,41,24,18)
        current=np.rint(image*(1-amount[:,:,None])+a*amount[:,:,None]).astype(np.uint8)
        current[protected]=image[protected]
        result.append(current.copy())
        log(f'bilateral {"skin" if face else "body"} x{strength}')
    return result,amount

def atlas_variants(image,protected,coverage,island):
    """Filter independently extended UV charts; preserve broad illumination."""
    result=[image.copy() for _ in range(3)]
    count=np.bincount(island[coverage]);objects=ndimage.find_objects(np.where(coverage,island+1,0))
    for label,box in enumerate(objects):
        if box is None or count[label]<100:continue
        y,x=box;region=(island[y,x]==label)&coverage[y,x]
        local=image[y,x];guard=protected[y,x]
        _,indices=ndimage.distance_transform_edt(~region,return_indices=True)
        # Padding is built separately for each chart, so no other chart can
        # contribute to either the bilateral filter or broad-light correction.
        extension=local[indices[0],indices[1]]
        distance=ndimage.distance_transform_edt(~guard)
        amount=np.clip((distance-1)/3,0,1).astype(np.float32)*region
        for i in range(3):
            m=i+1;diameter=40*m+1
            smooth=cv2.bilateralFilter(extension,diameter,32*m,12*m)
            smooth=cv2.bilateralFilter(smooth,diameter,24*m,18*m)
            delta=smooth.astype(np.float32)-extension
            # Only change detail finer than three atlas pixels. At the review
            # scale, a wider cutoff also attenuated the 16-48px fold band.
            delta-=cv2.GaussianBlur(delta,(0,0),3)
            filtered=np.rint(np.clip(local.astype(float)+delta*amount[:,:,None],0,255)).astype(np.uint8)
            filtered[guard]=local[guard]
            result[i][y,x][region]=filtered[region]
        if label%500==0:log(f'body: smoothed chart {label}/{len(objects)}')
    return result

def process():
    report={'resolution':4096,'edge_detection':{'source_size':4096,'space':'CIELab','guide_sigma':.65,'difference_span_px':4,'deltaE_threshold':13,'guard_dilation_radius_px':3},'strength':'Body xm: two bilateral passes with sigmaColor32m/24m, sigmaSpace12m/18m, diameter40m+1. x1 matches texture spatial scale at4096. Remove Gaussian sigma3 of the filter delta to preserve broad illumination. Filter each independently extended UV chart, then fade in3px inside the source-color guard.','face':'Same weak22% skin-only pair repeated; saturated red cheeks, hair, dark eye/brow/mouth features, source color edges are protected. Separate iris unchanged.','resampling':'center-sampled barycentric newUV->originalUV; nearest at source color guards, bilinear elsewhere; nearest occupied atlas-texel gutter extension','parts':{}}
    for name,source in [('body',WORK/'img3d/out/v4-noglasses_base.png'),('head_face',WORK/'display/source-head-2.png')]:
        image=rgb(source);edge,protected=guards(image)
        save(OUT/(name+'-source-edges.png'),edge*255);save(OUT/(name+'-source-guard.png'),protected.astype(np.uint8)*255)
        x,y,coverage,island=transfer_map(name)
        p=cv2.remap(protected.astype(np.uint8),x,y,cv2.INTER_NEAREST).astype(bool)
        save(OUT/(name+'-atlas-guard.png'),p.astype(np.uint8)*255)
        linear=cv2.remap(image,x,y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
        nearest=cv2.remap(image,x,y,cv2.INTER_NEAREST,borderMode=cv2.BORDER_REPLICATE);linear[p]=nearest[p]
        save(OUT/(name+'-transfer4096.png'),linear)
        if name=='body':
            variants=atlas_variants(linear,p,coverage,island)
            for i,filtered in enumerate(variants,1):
                # Extend the processed island colors through the gutters again.
                _,indices=ndimage.distance_transform_edt(~coverage,return_indices=True)
                extended=filtered[indices[0],indices[1]]
                save(OUT/f'body-x{i}.png',extended)
                save(OUT/f'body-x{i}-before-seams.png',extended)
            amount=(~protected).astype(np.float32)
        else:
            variants,amount=filter_variants(image,protected,face=True)
        save(OUT/(name+'-source-amount.png'),np.uint8(amount*255))
        for i,filtered in enumerate(variants,1):
            if name=='body':continue
            linear=cv2.remap(filtered,x,y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
            nearest=cv2.remap(filtered,x,y,cv2.INTER_NEAREST,borderMode=cv2.BORDER_REPLICATE)
            linear[p]=nearest[p]
            save(OUT/(('body' if name=='body' else 'head')+f'-x{i}.png'),linear)
        exact=all(bool(np.array_equal(v[p&coverage],linear[p&coverage])) for v in variants) if name=='body' else all(bool(np.array_equal(v[protected],image[protected])) for v in variants)
        report['parts'][name]={'source':str(source.relative_to(ROOT)),'guard_pixels':int(protected.sum()),'changed_fraction_allowed':float(np.mean(amount>0)),'atlas_coverage_fraction':float(coverage.mean()),'guard_exact':exact}
        log(f'{name}: transferred x1/x2/x3')
    # Keep each blink frame separate; the protected facial feature pixels and
    # pink cheek pixels are copied exactly, including at frame boundaries.
    eye=rgb(WORK/'display/eye-lids-display.png');frames=np.split(eye,3,axis=1);outputs=[[] for _ in range(3)];protected_count=0
    for f in frames:
        _,guard=guards(f);vs,amount=filter_variants(f,guard,face=True);protected_count+=int((amount==0).sum())
        for i,v in enumerate(vs):outputs[i].append(v)
    for i,frames in enumerate(outputs,1):save(OUT/f'eye-lids-x{i}.png',np.concatenate(frames,axis=1))
    report['eyes']={'iris_image_unchanged':True,'protected_pixels':protected_count,'total_pixels':eye.shape[0]*eye.shape[1],'skin_only_strength':.22}
    from edges_seams import correct
    correct()
    report['uv_seams']='Average only the filter delta at shared-position UV-seam vertices; skip every vertex touching the source-color guard. Interpolate the delta correction and reapply the unchanged guard. Geometry and original color boundaries are unchanged.'
    (OUT/'filter.json').write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':process()
