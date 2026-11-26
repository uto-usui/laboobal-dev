"""Build comparison contact sheets from the actual browser screenshots."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,shutil,numpy as np
O=Path('.work/toy-character/display2');B=O/'baseline';F=O/'installed'
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
def sheet(images,labels,path,columns=2):
 loaded=[Image.open(p).convert('RGB') for p in images];w=max(p.width for p in loaded);h=max(p.height for p in loaded);out=Image.new('RGB',(w*columns,(h+32)*((len(images)+columns-1)//columns)),(238,238,238));d=ImageDraw.Draw(out)
 for i,(im,label) in enumerate(zip(loaded,labels)):
  x=(i%columns)*w;y=(i//columns)*(h+32);out.paste(im,(x,y+32));d.text((x+8,y+3),label,fill=(20,20,20),font=font)
 out.save(path)
for part in ['desktop','face','body','mobile']:
 shutil.copy2(F/f'web-{part}.png',O/f'web-{part}.png')
 sheet([B/f'web-{part}.png',F/f'web-{part}.png'],['display / original','display2 / selected'],O/f'comparison-{part}.png')
shutil.copy2(F/'web-desktop.png',O/'web-full.png')
poses=['rest','left','right','up','down']
sheet([F/f'web-neck-{p}.png' for p in poses],poses,O/'web-neck.png',3)
sheet([d/f'web-neck-{p}.png' for p in poses for d in [B,F]],[f'{p} / {stage}' for p in poses for stage in ['display','display2']],O/'comparison-neck.png')
corners=['left-up','right-up','left-down','right-down']
sheet([F/f'web-follow-{p}.png' for p in corners],corners,O/'web-follow.png',2)
sheet([d/f'web-neck-{p}.png' for p in corners for d in [B,F]],[f'{p} / {s}' for p in corners for s in ['display','display2']],O/'comparison-combinations.png')
sheet([F/'web-neck-up.png',B/'web-neck-up.png'],['display2 / up 10deg','display / up 10deg'],O/'comparison-hair-up.png')
# Unchanged crop coordinates at display's DPR 2; do not enlarge or sharpen.
sheet([O/'2048-q75/web-face.png',O/'3072-q75/web-face.png',F/'web-face.png',B/'web-face.png'],['2048 / q75','3072 / q75','selected: head 3072 / q80','original: 4096'],O/'comparison-texture-face.png')
sheet([O/'2048-q75/web-body.png',O/'3072-q75/web-body.png',F/'web-body.png',B/'web-body.png'],['2048 / q75','3072 / q75','selected: body 2048 / q75','original: 4096'],O/'comparison-texture-body.png')
# The desktop overview includes full body and crops; original screenshots remain separate.
full=Image.open(F/'web-desktop.png').convert('RGB');full.thumbnail((960,600));canvas=Image.new('RGB',(1600,1392),(238,238,238));canvas.paste(full,(0,32));d=ImageDraw.Draw(canvas);d.text((8,3),'display2: actual Web view and native DPR2 crops',fill=(20,20,20),font=font)
for part,xy in [('face',(960,32)),('neck',(960,552)),('body',(0,632))]:canvas.paste(Image.open(F/f'web-{part}.png').convert('RGB'),xy)
canvas.save(O/'web-desktop.png')
runs=[]
for name in ['baseline','2048-q75','3072-q75','installed']:
 p=O/name/'web-metrics.json'
 if p.exists():runs.extend(json.loads(p.read_text())['runs'])
(O/'all-web-runs.json').write_text(json.dumps(runs,indent=2))
diff={}
for part in ['face','body']:
 a=np.asarray(Image.open(B/f'web-{part}.png').convert('RGB')).astype(float);b=np.asarray(Image.open(F/f'web-{part}.png').convert('RGB')).astype(float)
 # Exclude neck edits from the body aggregate; the face crop ends above them.
 diff[part]={'mean_rgb_absolute_error_255':float(abs(a-b).mean()),'p95_rgb_absolute_error_255':float(np.percentile(abs(a-b),95)),'note':'includes texture resampling and small view/runtime differences; no perceptual pass threshold'}
(O/'image-differences.json').write_text(json.dumps(diff,indent=2))
print('saved comparison sheets and all-web-runs.json')

for part in ['desktop','face','body']:
 sheet([O.parent/'display'/f'web-{part}.png',F/f'web-{part}.png'],['display / recorded screenshot','display2 / selected'],O/f'comparison-recorded-{part}.png')
