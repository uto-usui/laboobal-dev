"""Fixed definitions and contact sheets for the backing-free B rebake."""
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy import ndimage
import hair_images as hi

OUT=Path(sys.argv[1]);OLD=OUT.parent/'hair'
VIEWS=['demo-rest','face-0','face-35']

def write(name,data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


def dark(ref,low,region):
    # Byte-domain brightness matches the existing sRGB appearance measurement.
    weights=np.array([.2126,.7152,.0722])
    return region&((ref@weights-low@weights)>=25)


def prepare():
    for pattern in ['face-high-*.png','face-B-*.png','mask-face-high-*.png','mask-face-B-*.png','demo-high-rest.png','demo-B-rest.png','mask-demo-high-rest.png','mask-demo-B-rest.png']:
        for p in OLD.glob(pattern):shutil.copyfile(p,OUT/p.name)
    probes={}
    for view in VIEWS+['face-90','face-180']:
        kind,suffix=view.split('-');region=ndimage.binary_erosion(ndimage.binary_fill_holes(hi.semantic(f'mask-{kind}-high-{suffix}.png')['hair']))
        mask=dark(hi.rgb(f'{kind}-high-{suffix}.png'),hi.rgb(f'{kind}-B-{suffix}.png'),region)
        probes[view]=np.array(np.where(mask)).T
        Image.fromarray(mask.astype(np.uint8)*255).save(OUT/f'dark-before-{view}.png')
    np.savez(OUT/'dark-pixels-before.npz',**probes)


def sheet(name,files,labels,columns,width=640):
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20);ims=[Image.fromarray(hi.rgb(n)) for n in files];h=round(ims[0].height*width/ims[0].width);canvas=Image.new('RGB',(columns*width,((len(ims)+columns-1)//columns)*(h+32)),'white');draw=ImageDraw.Draw(canvas)
    for i,(im,label) in enumerate(zip(ims,labels)):
        x=i%columns*width;y=i//columns*(h+32);canvas.paste(im.resize((width,h),Image.Resampling.LANCZOS),(x,y+32));draw.text((x+10,y+5),label,font=font,fill='black')
    canvas.save(OUT/name)


def measure():
    shutil.copyfile(OUT/'demo-selected-rest.png',OUT/'demo-new-rest.png')
    rows={}
    for tag in ['B','new']:
        views={}
        for view in VIEWS+['face-90','face-180']:
            kind,suffix=view.split('-');ref=hi.semantic(f'mask-{kind}-high-{suffix}.png');region=ndimage.binary_erosion(ref['hair']);low=hi.semantic(f'mask-{kind}-{tag}-{suffix}.png');a=hi.rgb(f'{kind}-high-{suffix}.png');b=hi.rgb(f'{kind}-{tag}-{suffix}.png');black_region=ndimage.binary_erosion(ndimage.binary_fill_holes(ref['hair']));black=dark(a,b,black_region)
            views[view]={'skin_pixels_in_hair':int((region&low['skin']).sum()),'mean_abs_srgb_difference_0_255':float(np.abs(a.astype(float)-b).mean(2)[region].mean()),'black_patch_pixels':int(black.sum())}
            Image.fromarray(black.astype(np.uint8)*255).save(OUT/f'dark-{tag}-{view}.png')
        iou={}
        for angle in [0,90,180]:
            a=hi.semantic(f'mask-face-high-{angle}.png')['head'];b=hi.semantic(f'mask-face-{tag}-{angle}.png')['head'];iou[str(angle)]=float((a&b).sum()/(a|b).sum())
        rows[tag]={'views':views,'skin_pixels_in_hair_total':sum(views[v]['skin_pixels_in_hair'] for v in VIEWS),'mean_abs_srgb_difference_0_255':float(np.mean([views[v]['mean_abs_srgb_difference_0_255'] for v in VIEWS])),'black_patch_pixels_total':sum(views[v]['black_patch_pixels'] for v in VIEWS),'silhouette_iou':iou,'mean_silhouette_iou':float(np.mean(list(iou.values())))}
    previous=json.loads((OLD/'metrics.json').read_text())['candidates']['B']
    for key in ['skin_pixels_in_hair_total','mean_abs_srgb_difference_0_255','mean_silhouette_iou']:
        assert abs(previous[key]-rows['B'][key])<1e-9,(key,previous[key],rows['B'][key])
    report={'measurement':{'original_three_views':VIEWS,'black_patch':'one-pixel-eroded high-density hair+cap mask after filling enclosed mask holes (the original mask incorrectly excludes the main patches); sRGB Rec709 weighted brightness high minus candidate >=25/255; no absolute-black threshold; front35/side/back also reported separately','skin_color_iou':'identical to previous hair stage; skin=sum, color=equal-view mean, IoU front/side/back'},'comparison':rows,'diagnosis':json.loads((OUT/'diagnosis.json').read_text()),'bake':json.loads((OUT/'B/bake-metrics.json').read_text()),'verification':json.loads((OUT/'verification.json').read_text())}
    write('metrics.json',report)
    angles=[0,35,90,180];tags=['high','B','new'];sheet('hair-compare.png',[f'face-{t}-{a}.png' for t in tags for a in angles],[f'{t} / {a} deg' for t in tags for a in angles],4)
    poses=['rest','combo_left','neck_up10'];sheet('demo-color.png',[f'demo-selected-{p}.png' for p in poses],['Rest','Neck left 25 + upper left 8','Neck up 10'],3)
    for p in poses:shutil.copyfile(OLD/f'demo-selected-{p}.png',OUT/f'demo-before-{p}.png')
    sheet('demo-before-after.png',[f'demo-before-{p}.png' for p in poses]+[f'demo-selected-{p}.png' for p in poses],[f'{t} / {p}' for t in ['B','new'] for p in poses],3)
    (OUT/'review.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>髪の焼き直し</title><style>body{font:16px system-ui;margin:24px;background:#eee}img{max-width:100%;display:block}</style><p>上から高密度・前回B・今回。左から正面・35度・横・後ろ。</p>'+''.join(f'<p><a href="{n}">{n}<img src="{n}"></a></p>' for n in ['hair-compare.png','demo-color.png','demo-before-after.png']))
    print(json.dumps(rows,ensure_ascii=False),flush=True)
    with (OUT/'log.md').open('a') as f:
        f.write('\n## 同一定義での前後比較\n\n'+json.dumps(rows,ensure_ascii=False,indent=2)+'\n\n仮定: 黒い斑点は、従来の髪マスクの閉じた穴を埋めた領域でsRGBのRec709加重明るさが高密度の同じ画素より25/255以上暗い画素。3画角の合計を主指標とし、横・後ろも別記する。metallicは前回画像を保持。色・粗さは工程7の髪の3D最近傍、法線は同じUV島の有効画素か中立値で補う。\n')

if __name__=='__main__':{'prepare':prepare,'measure':measure}[sys.argv[2]]()
