"""Measured image comparisons and compact review sheets, using venv-geo."""
import json,re,shutil,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from skimage.metrics import structural_similarity
OUT=Path('.work/toy-character/display')
def sheet(paths,dest,width=512,columns=None):
    ims=[]
    for path,title in paths:
        im=Image.open(path).convert('RGB');im.thumbnail((width,round(width*im.height/im.width)))
        cell=Image.new('RGB',(width,im.height+28),'white');cell.paste(im,(0,28));ImageDraw.Draw(cell).text((8,8),title,fill='black');ims.append(cell)
    cols=columns or len(ims);rows=(len(ims)+cols-1)//cols;h=max(im.height for im in ims);result=Image.new('RGB',(width*cols,h*rows),'white')
    for i,im in enumerate(ims):result.paste(im,((i%cols)*width,(i//cols)*h))
    result.save(dest)
report={}
for part in ['full','face','body']:
    a=np.array(Image.open(OUT/'source'/f'{part}.png').convert('RGB'));use=np.ones(a.shape[:2],bool)
    # Eye art is intentionally replaced; isolate geometry/color differences on
    # the remaining face, including the hair, cheeks, nose, mouth and silhouette.
    if part=='face':use[470:685,250:785]=False
    entries=[(OUT/'source'/f'{part}.png','Original high density')]
    report[part]={}
    for level in [100000,200000,400000]:
        b=np.array(Image.open(OUT/str(level)/f'{part}.png').convert('RGB'));delta=np.abs(a.astype(float)-b)
        _,ss=structural_similarity(a,b,channel_axis=2,data_range=255,full=True)
        report[part][level]={'mean_rgb_abs_0_255':float(delta[use].mean()),'p95_rgb_abs_0_255':float(np.percentile(delta[use],95)),'fraction_pixels_rgb_max_difference_over_10':float((delta.max(2)[use]>10).mean()),'ssim_mean':float(ss.mean(2)[use].mean()),'eye_art_excluded':part=='face'}
        entries.append((OUT/str(level)/f'{part}.png',f'{level//1000}k target'))
        Image.fromarray(np.uint8(np.clip(delta*5,0,255))).save(OUT/str(level)/f'difference-{part}-5x.png')
    sheet(entries,OUT/f'comparison-{part}.png')
(OUT/'render-differences.json').write_text(json.dumps(report,indent=2))
for level in [100000,200000,400000]:
    p=OUT/str(level)/'parts.json';d=json.loads(p.read_text());print(level,sum(v['triangles'] for v in d.values()),json.loads((p.parent/'compression.json').read_text())['MiB'])
if (OUT/'web-follow-left-up.png').exists():sheet([(OUT/f'web-follow-{c}.png',c) for c in ['left-up','right-up','left-down','right-down']],OUT/'web-follow.png',720,2)
if (OUT/'400000/web-face.png').exists():
    for part in ['face','body']:sheet([(OUT.parent/'demo/zoom'/f'{part}.png','Previous Web surface'),(OUT/'400000'/f'web-{part}.png','Original-color display surface')],OUT/f'web-comparison-{part}.png',640)
