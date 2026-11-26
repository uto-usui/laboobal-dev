"""Export-stage image measurements, channel packing and labelled review sheets."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt,map_coordinates
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character'

def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def measure(out):
    a=np.array(Image.open(ROOT/'docs/toy-character/design/v4.png').convert('RGB'),float)
    rows=[]
    for cx in [563.5,689.5]:
        for dx in [-10,0,10]:
            x=int(round(cx+dx))
            for sign in [-1,1]:
                y0=268+sign*40*np.sqrt(1-(dx/43.5)**2)
                yy=np.arange(y0-7,y0+7,.025)
                rgb=np.stack([map_coordinates(a[:,:,c],[yy,np.full_like(yy,x)],order=1) for c in range(3)],-1)
                chroma=rgb[:,0]-rgb[:,2];k=int(np.argmin(chroma));background=float(np.median(np.r_[chroma[:50],chroma[-50:]]));threshold=(3*background+chroma[k])/4
                lo=k;hi=k
                while lo>0 and chroma[lo]<threshold:lo-=1
                while hi<len(yy)-1 and chroma[hi]<threshold:hi+=1
                # Quarter contrast crossings exclude the cast shadow and highlight bloom.
                width=float(yy[hi]-yy[lo]);rows.append({'x':x,'expected_y':float(y0),'edges_y':[float(yy[lo]),float(yy[hi])],'width_px':width,'threshold_r_minus_b':float(threshold)})
    width=float(np.median([r['width_px'] for r in rows]));d=width/1177*1000
    result={'method':'12 vertical cross-sections near the horizontal tangents of the two v4 rims; quarter contrast edge of R-B relative to adjacent skin; not the cast shadow','samples':rows,'median_design_px':width,'design_px_per_m':1177,'diameter_mm':d,'annotation_uncertainty_px':.5,'diameter_uncertainty_mm':.5/1177*1000,'previous_diameter_mm':1.56,'assumption':'single constant circular tube diameter uses median rim width; bridge and temples use the same diameter'}
    write(out/'glasses-measurement.json',result)
    im=Image.open(ROOT/'docs/toy-character/design/v4.png').convert('RGB');draw=ImageDraw.Draw(im)
    for r in rows:draw.line([(r['x'],r['edges_y'][0]),(r['x'],r['edges_y'][1])],fill='red',width=1)
    im.crop((505,215,750,320)).resize((980,420)).save(out/'glasses-measurement.png')
    print(json.dumps(result,ensure_ascii=False))

def pack(out):
    def rgb(path):return np.array(Image.open(path).convert('RGB'))
    # Both the body and the nonhair head occupy disjoint islands in BakeUV.
    body=rgb(out/'ao-body.png')[:,:,0];head=rgb(out/'ao-head.png')[:,:,0]
    ao=np.minimum(body,head)
    rough=rgb(out/'roughness.png')[:,:,0];metal=rgb(out/'metallic-roughness.png')[:,:,2]
    metal=np.array(Image.fromarray(metal).resize((2048,2048),Image.Resampling.BILINEAR))
    Image.fromarray(np.stack([ao,rough,metal],-1)).save(out/'character-orm.png')
    hairao=rgb(out/'ao-hair.png')[:,:,0];hr=rgb(out/'hair-roughness.png')[:,:,0];hm=rgb(out/'hair-metallic.png')[:,:,0]
    Image.fromarray(np.stack([hairao,hr,hm],-1)).save(out/'hair-orm.png')
    Image.open(out/'hair-orm.png').resize((1024,1024),Image.Resampling.LANCZOS).save(out/'hair-orm.png')
    # Hair's scalar fields and fine normal detail need less resolution than the face.
    hn=np.array(Image.open(out/'hair-normal.png').convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS),float)/255*2-1
    hn/=np.maximum(np.linalg.norm(hn,axis=2,keepdims=True),1e-8)
    Image.fromarray(np.uint8(np.clip((hn+1)*127.5,0,255)+.5)).save(out/'hair-normal.png')
    # Three whole projection frames remain equal-width and each has a power-of-two size.
    frames=[Image.open(out/f'lids-{f}.png').convert('RGB') for f in range(3)]
    atlas=Image.new('RGB',(1536,512))
    for i,im in enumerate(frames):atlas.paste(im,(i*512,0))
    atlas.save(out/'eye-lids-atlas.png')
    ap=Image.open(WORK/'eyes/aperture-atlas.png').convert('L').resize((1536,512),Image.Resampling.LANCZOS)
    ap=np.array(ap);orm=np.zeros((512,1536,3),np.uint8);orm[:,:,0]=ap;orm[:,:,1]=102
    Image.fromarray(orm).save(out/'eye-aperture-orm.png')
    # The atlas carries the fixed aperture in R, independent of the moving iris UV.
    stats={}
    for name,v in [('body_head',ao),('hair',hairao)]:
        stats[name]={'min':float(v.min()/255),'p05':float(np.percentile(v,5)/255),'median':float(np.median(v)/255),'mean':float(v.mean()/255)}
    write(out/'ao-image-statistics.json',stats)

def sheet(out):
    def panel(path,w,h):
        im=Image.open(path).convert('RGBA');im.thumbnail((w,h),Image.Resampling.LANCZOS);bg=Image.new('RGBA',(w,h),'#e7e3e7');bg.alpha_composite(im,((w-im.width)//2,(h-im.height)//2));return bg.convert('RGB')
    def grid(name,rows,w=640,h=400):
        im=Image.new('RGB',(len(rows[0])*w,len(rows)*(h+32)),'#f7f5f2');d=ImageDraw.Draw(im)
        for y,row in enumerate(rows):
            for x,(path,label) in enumerate(row):
                im.paste(panel(path,w,h),(x*w,y*(h+32)+32));d.text((x*w+12,y*(h+32)+9),label,fill='#222222')
        im.save(out/name)
    grid('export-check.png',[[ (WORK/'eyes'/f'demo-{p}.png',f'Stage 9 / {label}'),(out/f'roundtrip-{q}.png',f'Compressed GLB read back / AO / {label}') ] for p,q,label in [('rest','rest','Rest'),('left','combo_left','Neck left 25 + torso left 8 (stage 9: neck only)'),('closed','closed','Closed eyes')]])
    grid('ao-compare.png',[[ (out/f'ao-off-{view}.png',f'AO off / {view}'),(out/f'ao-on-{view}.png',f'AO on / {view}') ] for view in ['face','body']])
    grid('glasses-thickness.png',[[ (WORK/'eyes/v4-face.png','v4 / fixed reference scale'),(out/'glasses-face.png','Export / measured tube diameter')]],512,512)
    grid('eye-downsize-check.png',[[ (WORK/'eyes'/f'eyes-{f}-0.png',f'Stage 9 / {f}'),(out/f'eye-512-{f}.png',f'512px per frame / {f}') ] for f in ['open','half','closed']],512,512)

if __name__=='__main__':
    globals()[sys.argv[2]](Path(sys.argv[1]))
