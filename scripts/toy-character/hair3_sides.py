"""Count new interiors against the actually visible old cap, not a guessed ROI."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
OUT=Path(sys.argv[1])

def read(path):return np.array(Image.open(path).convert('RGBA'))

def color(a,c):return (a[:,:,3]>250)&np.all(np.abs(a[:,:,:3].astype(float)-np.array(c))<20,axis=2)

def components(mask):
    ids,n=ndimage.label(mask);result=[]
    for i,sl in enumerate(ndimage.find_objects(ids),1):
        size=int((ids[sl]==i).sum())
        if size>=2:result.append({'pixels':size,'bbox_xyxy':[sl[1].start,sl[0].start,sl[1].stop,sl[0].stop]})
    return sorted(result,key=lambda q:-q['pixels'])[:30]


def run():
    rows={}
    for path in sorted(OUT.glob('sides-*-hair2.png')):
        name=path.name[len('sides-'):-len('-hair2.png')];a=read(path);b=read(OUT/f'sides-{name}-hair3.png');cap=color(a,(0,255,255));frontskin=color(b,(255,255,0));backskin=color(b,(255,0,0));backhair=color(b,(255,0,255));background=b[:,:,3]<5
        masks={'new_skin_back':cap&backskin,'new_hair_back':cap&backhair,'new_background':cap&background,'new_skin_front':cap&frontskin}
        rows[name]={'old_visible_cap_pixels':int(cap.sum()),'all_skin_back_pixels_before':int(color(a,(255,0,0)).sum()),'all_skin_back_pixels_after':int(backskin.sum()),**{k:{'pixels':int(m.sum()),'components':components(m)} for k,m in masks.items()}}
        image=read(OUT/f'{name}-hair3.png');overlay=image.copy()
        for k,c in [('new_skin_back',(255,0,0,255)),('new_hair_back',(255,0,255,255)),('new_background',(0,200,255,255)),('new_skin_front',(255,160,0,255))]:overlay[masks[k]]=c
        Image.fromarray(overlay).save(OUT/f'exposed-{name}.png')
    (OUT/'visibility.json').write_text(json.dumps({'method':'16-sample emission IDs, alpha>250, RGB tolerance20; compare old visible cap (cyan) to new skin front(yellow), skin back(red), hair back(magenta), alpha<5(background); background silhouette changes are separately distinguished by viewing image. No repairs.','views':rows},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(rows),flush=True)
if __name__=='__main__':run()
