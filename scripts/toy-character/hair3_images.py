"""Same hair2 measurements, exact fill replay, and inspection contact sheets."""
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
import hair_images as hi
import hair2_images as h2

OUT=Path(sys.argv[1]);OLD=OUT.parent/'hair2';REF=OUT.parent/'hair'
hi.OUT=OUT;h2.OUT=OUT


def write(name,data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


def measure():
    rows={}
    for tag in ['hair2','hair3']:
        views={}
        for view in h2.VIEWS+['face-90','face-180']:
            kind,suffix=view.split('-');ref=hi.semantic(f'mask-{kind}-high-{suffix}.png');region=ndimage.binary_erosion(ref['hair']);low=hi.semantic(f'mask-{view}-{tag}.png');a=hi.rgb(f'{kind}-high-{suffix}.png');b=hi.rgb(f'{view}-{tag}.png');black=h2.dark(a,b,ndimage.binary_erosion(ndimage.binary_fill_holes(ref['hair'])))
            views[view]={'skin_pixels_in_hair':int((region&low['skin']).sum()),'mean_abs_srgb_difference_0_255':float(np.abs(a.astype(float)-b).mean(2)[region].mean()),'black_patch_pixels':int(black.sum())}
            Image.fromarray(black.astype(np.uint8)*255).save(OUT/f'dark-{view}-{tag}.png')
            overlay=b.copy();overlay[black]=(255,30,100);Image.fromarray(overlay).save(OUT/f'patches-{view}-{tag}.png')
        iou={}
        for angle in [0,90,180]:
            a=hi.semantic(f'mask-face-high-{angle}.png')['head'];b=hi.semantic(f'mask-face-{angle}-{tag}.png')['head'];iou[str(angle)]=float((a&b).sum()/(a|b).sum())
        rows[tag]={'views':views,'skin_pixels_in_hair_total':sum(views[v]['skin_pixels_in_hair'] for v in h2.VIEWS),'mean_abs_srgb_difference_0_255':float(np.mean([views[v]['mean_abs_srgb_difference_0_255'] for v in h2.VIEWS])),'black_patch_pixels_total':sum(views[v]['black_patch_pixels'] for v in h2.VIEWS),'silhouette_iou':iou,'mean_silhouette_iou':float(np.mean(list(iou.values())))}
    previous=json.loads((OLD/'metrics.json').read_text())['comparison']['new']
    for v in views:
        for key,value in rows['hair2']['views'][v].items():
            assert abs(previous['views'][v][key]-value)<1e-5,(v,key,value)
    assert previous['silhouette_iou']==rows['hair2']['silhouette_iou']
    rerender=rows['hair2'];rows['hair2']=previous
    verification=json.loads((OUT/'verification.json').read_text())
    for tag,key in [('hair2','total_triangles_before'),('hair3','total_triangles')]:rows[tag]['total_triangles']=verification[key]
    write('metrics.json',{'measurement':json.loads((OLD/'metrics.json').read_text())['measurement'],'comparison':rows,'hair2_rerender':rerender,'rerender_tolerance':'Eevee repeated color mean differs <1e-5 byte levels; counts and IoU exact. Published hair2 values used for before column.','verification':verification,'visibility':json.loads((OUT/'visibility.json').read_text()),'miss_fill_verification':json.loads((OUT/'fill-verification.json').read_text())})
    return rows


def fill_replay():
    folder=OUT/'fill-replay';folder.mkdir(exist_ok=True)
    for name in ['uv-fields.npz','face-raster.npy','chart-raster.npy','mask-raw.png','color-raw.png','normal-raw.png','roughness-raw.png','metallic-raw.png']:shutil.copyfile(OLD/'B'/name,folder/name)
    oldout=hi.OUT;hi.OUT=folder;hi.bi.OUT=folder
    # Re-run the same 3D-nearest fill, island padding and linear downsampling.
    hi.finish()
    hi.OUT=oldout;hi.bi.OUT=oldout
    exact={n:(folder/n).read_bytes()==(OLD/'B'/n).read_bytes() for n in ['basecolor.png','normal.png','roughness.png']};assert all(exact.values()),exact
    ids=np.load(folder/'face-raster.npy');mask=hi.bi.read(folder/'mask-raw.png')[:,:,0]>127
    raw=hi.bi.read(folder/'color-raw.png');final=hi.bi.read(folder/'basecolor.png');probes=np.load(OUT/'original-miss-samples.npz');rows={}
    for view in probes.files:
        p=probes[view];y,x=p[:,2],p[:,3];coverage=ids[y,x]>=0;hit=mask[y,x];rgb=final[y//2,x//2];rows[view]={'screen_samples':len(p),'covered_ray_misses_filled':int((coverage&~hit).sum()),'coverage_edge_samples':int((~coverage).sum()),'color_mask_hit_despite_material_id_miss':int((coverage&hit).sum()),'raw_exact_black':int(np.all(raw[y,x]==0,axis=1).sum()),'final_exact_black':int(np.all(rgb==0,axis=1).sum()),'final_rgb_min':rgb.min(0).tolist(),'final_rgb_max':rgb.max(0).tolist()}
    report={'original_screen_samples':json.loads((OUT/'miss-probes.json').read_text()),'exact_replayed_png_bytes':exact,'all_coverage_ray_misses_3d_nearest_filled':json.loads((folder/'bake-metrics.json').read_text())['ray_miss_texels'],'samples':rows,'method':'Replay unchanged hair2 raw maps through original 3D nearest valid hair texel color fill, 6px island padding, linear-light 4096-to-2048 downsample. All output PNG bytes equal hair2; hair3 packed maps separately verified exact. Sample final texture nearest texel; rendered darkness also includes normal/light/occlusion, not just texture color.'}
    write('fill-verification.json',report)


def sheets():
    angles=[0,35,90,180];h2.sheet('hair-compare.png',[f'face-high-{a}.png' for a in angles]+[f'face-{a}-{t}.png' for t in ['hair2','hair3'] for a in angles],[f'{t} / {a} deg' for t in ['high','hair2','hair3'] for a in angles],4)
    poses=['rest','combo_left','neck_up10'];h2.sheet('demo-color.png',[f'demo-{p}-{t}.png' for t in ['hair2','hair3'] for p in poses],[f'{t} / {p}' for t in ['hair2','hair3'] for p in poses],3)
    h2.sheet('hair-under.png',[f'under-{a}-{t}.png' for t in ['hair2','hair3'] for a in [0,55,-55]],[f'{t} / neck up10 / {a} deg' for t in ['hair2','hair3'] for a in [0,55,-55]],3,850)
    h2.sheet('remaining-patches.png',[f'patches-face-{a}-hair3.png' for a in angles],[f'hair3 patches / {a} deg' for a in angles],4)
    h2.sheet('newly-exposed.png',[f'exposed-face-{a}.png' for a in angles],['New exposure / '+str(a)+' deg' for a in angles],4)
    names=['hair-compare.png','demo-color.png','hair-under.png','remaining-patches.png','newly-exposed.png']
    (OUT/'review.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>キャップを外した比較</title><style>body{font:16px system-ui;margin:24px;background:#eee}img{max-width:100%;display:block}</style><p>顔は高密度・hair2・hair3。デモと髪裏はhair2・hair3の順。</p>'+''.join(f'<p>{n}<a href="{n}"><img src="{n}"></a></p>' for n in names))


if __name__=='__main__':
    for pattern in ['face-high-*.png','mask-face-high-*.png','demo-high-rest.png','mask-demo-high-rest.png']:
        for p in REF.glob(pattern):shutil.copyfile(p,OUT/p.name)
    fill_replay();rows=measure();sheets();from hair3_report import report;report(OUT);print(json.dumps(rows,ensure_ascii=False),flush=True)
