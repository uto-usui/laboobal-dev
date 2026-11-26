"""Recolor baked pigments in Lab, keeping L residuals and the existing UVs."""
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
from scipy.spatial import cKDTree
from skimage.color import rgb2lab, lab2rgb, deltaE_ciede2000
import color_process as cp

OUT = Path(sys.argv[1])
WORK = OUT.parent
COLOR = WORK / 'color'
NAMES = dict(cp.NAMES, **{})
NAMES.update({16: 'zipper', 17: 'pocket_piping'})
SIGMA = 2.0


def log(s):
    print('RECOLOR', s, flush=True)
    with (OUT/'log.md').open('a') as f:
        f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')


def write(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 1)*255+.5)).save(OUT/name)


def sparse_lookup(d, q, nd):
    """Use the nearest covered UV texel, never an unrelated surface in 3D."""
    n = int(d['size']); nn = int(nd['size'])
    oldidx = d['idx']; grid = np.full(n*n, -1, np.int32)
    grid[oldidx] = np.arange(len(oldidx))
    idx = nd['idx']; x = (idx % nn+.5)*n/nn-.5; y = (idx//nn+.5)*n/nn-.5
    nearest = grid[np.clip(np.rint(y).astype(int), 0, n-1)*n+np.clip(np.rint(x).astype(int), 0, n-1)]
    missing = nearest < 0
    if missing.any():
        tree = cKDTree(np.c_[oldidx % n, oldidx//n])
        nearest[missing] = tree.query(np.c_[x[missing], y[missing]])[1]
    return {k: q[k][nearest] for k in ['surface', 'final', 'source', 'weights', 'reserved']}


def regions(d, q):
    p = d['p']; part = d['part']; old = rgb2lab(d['old'])
    k = q['surface'].copy(); z = p[:, 2]; x = abs(p[:, 0]); chroma = np.linalg.norm(old[:, 1:], axis=1)
    # The previous image-plane annotation crossed the curved cuff onto the hand.
    # The baked white pigment identifies its actual position on the unchanged mesh.
    white = (old[:, 0] > 65) & (chroma < 14)
    wrist = np.isin(part, [4,5,6,7]) & (z < .49)
    for side in [-1, 1]:
        sel = wrist & (p[:, 0]*side > 0)
        band = sel & white
        t = z-.6*x
        low = np.percentile(t[band], 15)
        k[sel & (t < low)] = 1
        k[sel & (t >= low)] = 4 if side > 0 else 3
        k[band] = 14
    # Restore the baked curved hem rather than a horizontal projected polygon.
    hem = np.isin(part, [3,10]) & (z > .335) & (z < .415)
    k[hem] = np.where(z[hem] > .374, 7, 10)
    k[hem & white] = 14
    legs = (part == 10) & (z < .35) & (z > .095)
    k[legs] = np.where(old[legs, 2] < -3, 11, 10)
    k[(part == 10) & (z <= .095)] = 12
    # Distinguish gray cross-webbing, golden zipper, and golden pocket piping.
    zipper = (part == 3) & (x < .012) & (z > .385) & (z < .655)
    pocket = (part == 3) & (z > .417) & (z < .505) & (x > .055) & (old[:,1] > 20) & (old[:,2] > 10)
    k[zipper] = 16; k[pocket] = 17
    return k


def feather(k, idx, n):
    occupied = np.zeros(n*n, np.float32); occupied[idx] = 1
    norm = gaussian_filter(occupied.reshape(n,n), SIGMA)
    weights = np.zeros((len(idx), max(NAMES)+1), np.float32)
    for key in np.unique(k):
        a = np.zeros(n*n, np.float32); a[idx[k == key]] = 1
        a = gaussian_filter(a.reshape(n,n), SIGMA)
        weights[:, key] = a.ravel()[idx]/np.maximum(norm.ravel()[idx], 1e-10)
    return weights


def gamut_lab(lab):
    # Explicitly measure the final encoded RGB, including gamut clipping.
    return np.clip(lab2rgb(lab.reshape(-1,1,3)).reshape(-1,3),0,1)


def stats(a):
    return {'mean':float(a.mean()), 'std':float(a.std()), 'p05':float(np.percentile(a,5)), 'p95':float(np.percentile(a,95)), 'p95_minus_p05':float(np.percentile(a,95)-np.percentile(a,5))}


def recolor():
    targets0=json.loads((COLOR/'reference-patches.json').read_text())
    targets={k:np.array(targets0[v]['target_Lab']) for k,v in cp.NAMES.items()}
    metrics={}; transforms={}; masks_report={}
    for atlas in ['body','hair']:
        d=np.load(OUT/f'{atlas}-samples.npz'); n=int(d['size']); idx=d['idx']; oldlab=rgb2lab(d['old']); area=d['area']
        od=np.load(COLOR/f'{atlas}-samples.npz'); oq=np.load(COLOR/f'{atlas}-projection.npz'); q=sparse_lookup(od,oq,d)
        k=regions(d,q) if atlas=='body' else np.full(len(idx),2)
        # Separate zipper and piping targets come from the existing delit projection.
        for key in [16,17]:
            sel=k==key
            if sel.any(): targets[key]=np.median(rgb2lab(q['final'][sel]),axis=0)
        soft=feather(k,idx,n)
        np.savez_compressed(OUT/f'masks-{atlas}.npz',idx=idx,labels=k,weights=soft,size=n,legend=json.dumps(NAMES))
        final=np.zeros_like(oldlab); atlas_transforms={}
        for key in np.unique(k):
            sel=(k==key)&(soft[:,key]>.98)
            if not sel.any():sel=k==key
            target=targets[int(key)]; mean=oldlab[sel].mean(0)
            new=oldlab-mean+target
            pattern=key in [9,13]
            if pattern:
                patternlab=rgb2lab(q['final']); delta=patternlab-patternlab[sel].mean(0)
                # L of the delit projection supplies pattern contrast only; the
                # full baked L residual is added on top, without a second AO bake.
                new=target+delta
                new[:,0]+=oldlab[:,0]-mean[0]
            if key==1:
                pts=cp.LANDMARKS;p=d['p'];xy=cp.projection_xy(p,'front')
                cheek=np.zeros(len(idx))
                # Move in from the annotated face contour by 24px toward the nose.
                for side in ['L','R']:
                    a=np.array(pts['cheek_'+side],float);a[0]+=24 if side=='L' else -24
                    cheek=np.maximum(cheek,np.exp(-1.6*(((xy[:,0]-a[0])/31)**2+((xy[:,1]-a[1])/24)**2)))
                cheek*= (p[:,1]<-.055)&(d['part']==0)
                new[:,1]+=9*cheek;new[:,2]+=2*cheek
            # Recenter encoded colors to compensate for any out-of-gamut pixels.
            offset=np.zeros(3)
            for _ in range(5):
                check=rgb2lab(gamut_lab(new[sel]+offset));offset+=target-check.mean(0)
            rgb=gamut_lab(new+offset)
            final+=rgb*soft[:,key,None]
            atlas_transforms[NAMES[int(key)]]={'source_mean_Lab':mean.tolist(),'target_Lab':target.tolist(),'encoding_correction_Lab':offset.tolist(),'L_residual_scale':1.0,'ab_residual_scale':1.0,'pattern_projection':bool(pattern),'interior_samples':int(sel.sum())}
        # Preserve the eye/brow pigment in its exact original UV footprint. The
        # actual stage-9 eye/lid/iris materials are separately left byte-identical.
        if atlas=='body':
            p=d['p'];xy=cp.projection_xy(p,'front');xx,yy=xy.T
            reserve=(d['part']==0)&(((((xx-567)/32)**2+((yy-260)/24)**2)<1)|((((xx-685)/32)**2+((yy-260)/24)**2)<1)|((yy>207)&(yy<229)&(xx>519)&(xx<733)&(oldlab[:,0]<40)))
            final[reserve]=d['old'][reserve]
        else:reserve=np.zeros(len(idx),bool)
        tex=np.zeros((n*n,3),np.float32);tex[idx]=final;occ=np.zeros(n*n,bool);occ[idx]=True
        # UV gutters are extended after the masks have been feathered.
        _,near=distance_transform_edt(~occ.reshape(n,n),return_indices=True)
        tex=tex.reshape(n,n,3)[near[0],near[1]]
        save(f'basecolor-{atlas}-{n}.png',tex)
        im=Image.fromarray(np.uint8(np.clip(tex,0,1)*255+.5))
        if n>2048:im=im.resize((2048,2048),Image.Resampling.LANCZOS)
        im.save(OUT/f'basecolor-{atlas}.png')
        # Metrics read the saved 2048px delivery pixels using bilinear sampling.
        encoded=np.array(im,np.float32)/255;tx=(idx%n+.5)*2048/n-.5;ty=(idx//n+.5)*2048/n-.5
        encoded=np.stack([map_coordinates(encoded[:,:,c],[ty,tx],order=1,mode='nearest') for c in range(3)],1);lab=rgb2lab(encoded)
        for key in np.unique(k):
            sel=(k==key)&(soft[:,key]>.98)&~reserve
            if not sel.any():continue
            a=lab[sel];b=oldlab[sel];target=targets[int(key)];de=deltaE_ciede2000(a,target[None,:]);ca=a.copy();ca[:,0]=target[0];dc=deltaE_ciede2000(ca,target[None,:]);avg=a.mean(0)
            metric={'samples':int(sel.sum()),'mean_Lab':avg.tolist(),'target_Lab':target.tolist(),'mean_deltaE00':float(deltaE_ciede2000(avg,target)),'deltaE00_median':float(np.median(de)),'deltaE00_p95':float(np.percentile(de,95)),'chroma_only_deltaE00_median':float(np.median(dc)),'chroma_only_deltaE00_p95':float(np.percentile(dc,95)),'L_hair4':stats(b[:,0]),'L_recolor':stats(a[:,0]),'L_residual_correlation':float(np.corrcoef(b[:,0],a[:,0])[0,1]),'L_scale_requested':1.,'average_color_pass':bool(deltaE_ciede2000(avg,target)<=5)}
            metric['L_width_ratio']=metric['L_recolor']['p95_minus_p05']/max(metric['L_hair4']['p95_minus_p05'],1e-6)
            metrics[atlas+':'+NAMES[int(key)]]=metric
        # Show the actual soft labels before downsampling, not a resized hard map.
        palette=np.vstack([cp.COLORS,[[240,174,50],[240,135,35]]])/255
        rgb=soft@palette;preview=np.ones((n*n,3),np.float32)*.8;preview[idx]=rgb
        save(f'masks-{atlas}.png',preview.reshape(n,n,3))
        interior=soft.max(1)>.98
        masks_report[atlas]={'work_size':n,'delivery_size':2048,'sigma_work_pixels':SIGMA,'approx_10_90_width_work_pixels':2.563*SIGMA,'soft_boundary_texels':int((~interior).sum()),'regions':{NAMES[int(key)]:int((k==key).sum()) for key in np.unique(k)},'feather_before_downsample':True}
        transforms[atlas]=atlas_transforms
        log(f'{atlas}: {n}px のUVマスクをσ={SIGMA}pxで平滑化してからLab変換。L偏差は1.0倍、a/b偏差も1.0倍。柄は投影色＋工程7のL偏差。最後にLanczosで2048px。')
    write('metrics.json',{'method':{'metric':'CIEDE2000 D65 sRGB; delivery 2048px sampled bilinearly; UV-texel weighted interior (weight>0.98), eye paint excluded','mean_gate':'DeltaE00(mean Lab, delit target)<=5; pixel median/P95 include retained baked shadows and pigment variation','L_width':'P95-P05 and standard deviation; no intentional L contraction; clipping measured after encoding','patterns':'stage8 delit projection contrast + stage7 L residual; pattern target uses the stage8 calibrated ground patch','mask_sigma_4096':SIGMA,'cheek_landmarks':{k:cp.LANDMARKS[k] for k in ['cheek_L','cheek_R']},'cheek_inward_offset_px':24,'cheek_added_ab':[9,2]},'parts':metrics,'masks':masks_report,'color_pass':all(m['average_color_pass'] for m in metrics.values()),'visual_pass':None})
    write('transforms.json',transforms)
    log('2048pxの保存画像から色差とL幅を再測定しmetrics.jsonへ。平均色の合格と画素ごとの差を分けて記録。')


if __name__=='__main__':
    if sys.argv[2]=='raster':cp.raster(body_size=4096)
    elif sys.argv[2]=='recolor':recolor()
