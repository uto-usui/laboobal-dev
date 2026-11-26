"""Source-label audit and unchanged screen measurements for hair4."""
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
import hair_images as hi
import hair2_images as h2
OUT=Path(sys.argv[1]);WORK=OUT.parent
hi.OUT=OUT;h2.OUT=OUT


def write(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


def diagnose():
    sys.path.insert(0,str(WORK/'bake/vendor'));import igl
    src=np.load(WORK/'hair/source.npz');full=np.load(WORK/'hair/B-full.npz');v=full['V'];f=full['F'];sv=src['V'].astype(float);sf=src['F'].astype(np.int64);labels=src['labels'];cent=v[f].mean(1)
    dist,nearest,_=igl.point_mesh_squared_distance(cent,sv,sf)
    hd,_,_=igl.point_mesh_squared_distance(cent,sv,sf[labels==1])
    keep=(labels[nearest]==1)|(np.sqrt(hd)<=np.sqrt(dist)+.001)
    assert int(keep.sum())==962438
    geom=json.loads((OUT/'geometry.json').read_text());b=np.load(OUT/'boundary-input.npz');rim=np.unique([j for r in geom['loops'] if r['action']=='fill' for j in r['vertices']]);distance,_=cKDTree(b['V'][rim]).query(cent,workers=-1)
    ids=np.flatnonzero((~keep)&(distance<=.003));np.savez(OUT/'diagnosis-samples.npz',full_face=ids,source_face=nearest[ids],labels=labels[nearest[ids]],distance_to_original_m=np.sqrt(dist[ids]),distance_to_hair_m=np.sqrt(hd[ids]))
    write('diagnosis.json',{'filled_head_triangles':len(f),'selected_hair_triangles_before_collapse':int(keep.sum()),'removed_triangles':int((~keep).sum()),'near_internal_hole_rim_removed_faces':len(ids),'nearest_original_labels':{str(k):int((labels[nearest[ids]]==k).sum()) for k in np.unique(labels[nearest[ids]])},'sample_definition':'Removed B-full triangle centroids within 3mm of vertices of final B internal hole rims selected for filling; exact original-triangle distances reproduce the original label + 1mm hair margin rule. Full raw face and source IDs in diagnosis-samples.npz.','distance_to_original_mm_quantiles':np.quantile(np.sqrt(dist[ids])*1000,[0,.5,.95,1]).tolist(),'hair_distance_excess_mm_quantiles':np.quantile((np.sqrt(hd[ids])-np.sqrt(dist[ids]))*1000,[0,.5,.95,1]).tolist()})


def measure():
    previous=json.loads((WORK/'hair3/metrics.json').read_text());rows=previous['comparison']
    for p in (WORK/'hair3').glob('*.png'):shutil.copyfile(p,OUT/p.name)
    views={}
    for view in h2.VIEWS+['face-90','face-180']:
        kind,suffix=view.split('-');ref=hi.semantic(f'mask-{kind}-high-{suffix}.png');region=ndimage.binary_erosion(ref['hair']);low=hi.semantic(f'mask-{view}-hair4.png');a=hi.rgb(f'{kind}-high-{suffix}.png');b=hi.rgb(f'{view}-hair4.png').copy();black=h2.dark(a,b,ndimage.binary_erosion(ndimage.binary_fill_holes(ref['hair'])))
        views[view]={'skin_pixels_in_hair':int((region&low['skin']).sum()),'mean_abs_srgb_difference_0_255':float(np.abs(a.astype(float)-b).mean(2)[region].mean()),'black_patch_pixels':int(black.sum())}
        Image.fromarray(black.astype(np.uint8)*255).save(OUT/f'dark-{view}-hair4.png');b[black]=(255,30,100);Image.fromarray(b).save(OUT/f'patches-{view}-hair4.png')
    iou={}
    for angle in [0,90,180]:
        a=hi.semantic(f'mask-face-high-{angle}.png')['head'];b=hi.semantic(f'mask-face-{angle}-hair4.png')['head'];iou[str(angle)]=float((a&b).sum()/(a|b).sum())
    verification=json.loads((OUT/'verification.json').read_text())
    rows['hair4']={'views':views,'skin_pixels_in_hair_total':sum(views[v]['skin_pixels_in_hair'] for v in h2.VIEWS),'mean_abs_srgb_difference_0_255':float(np.mean([views[v]['mean_abs_srgb_difference_0_255'] for v in h2.VIEWS])),'black_patch_pixels_total':sum(views[v]['black_patch_pixels'] for v in h2.VIEWS),'silhouette_iou':iou,'mean_silhouette_iou':float(np.mean(list(iou.values()))),'total_triangles':verification['total_triangles'],'boundary_edges':verification['topology']['boundary_edges']}
    for t in ['hair2','hair3']:rows[t]['boundary_edges']=1816
    # Look at the exact exposure regions previously uncovered by cap removal.
    from hair3_sides import color,read,components
    exposure={}
    for path in (WORK/'hair3').glob('sides-*-hair2.png'):
        name=path.name[6:-10];a=read(path);b=read(OUT/f'sides-{name}-hair4.png');cap=color(a,(0,255,255));masks={'skin_back':cap&color(b,(255,0,0)),'hair_back':cap&color(b,(255,0,255)),'background':cap&(b[:,:,3]<5),'skin_front':cap&color(b,(255,255,0))}
        exposure[name]={k:{'pixels':int(m.sum()),'components':components(m)} for k,m in masks.items()}
    write('metrics.json',{'measurement':previous['measurement'],'comparison':rows,'geometry':json.loads((OUT/'geometry.json').read_text()),'diagnosis':json.loads((OUT/'diagnosis.json').read_text()),'verification':verification,'bake':json.loads((OUT/'B/bake-metrics.json').read_text()),'previous_cap_region_exposure':exposure,'baseline':'hair2/hair3 published same-camera values and unchanged PNGs; hair4 is a fresh render. No cap in hair4.'})
    angles=[0,35,90,180];tags=['hair2','hair3','hair4'];h2.sheet('hair-compare.png',[f'face-high-{a}.png' for a in angles]+[f'face-{a}-{t}.png' for t in tags for a in angles],[f'{t} / {a} deg' for t in ['high']+tags for a in angles],4)
    poses=['rest','combo_left','neck_up10'];h2.sheet('demo-color.png',[f'demo-{p}-{t}.png' for t in tags for p in poses],[f'{t} / {p}' for t in tags for p in poses],3)
    h2.sheet('hair-under.png',[f'under-{a}-{t}.png' for t in tags for a in [0,55,-55]],[f'{t} / up10 / {a} deg' for t in tags for a in [0,55,-55]],3,850)
    h2.sheet('remaining-patches.png',[f'patches-face-{a}-hair4.png' for a in angles],[f'hair4 patches / {a} deg' for a in angles],4)
    (OUT/'review.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>髪の穴を塞いだ比較</title><style>body{font:16px system-ui;margin:24px;background:#eee}img{max-width:100%;display:block}</style><p>顔は高密度、hair2、hair3、hair4の順。デモと髪裏はhair2、hair3、hair4。</p>'+''.join(f'<p>{n}<a href="{n}"><img src="{n}"></a></p>' for n in ['hair-compare.png','demo-color.png','hair-under.png','remaining-patches.png']))
    from hair4_report import report
    report(OUT)
    print(json.dumps({t:{k:v for k,v in row.items() if k!='views'} for t,row in rows.items()},ensure_ascii=False),flush=True)

if __name__=='__main__':{'diagnose':diagnose,'measure':measure}[sys.argv[2]]()
