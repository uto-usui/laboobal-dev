"""Atlas review, masked bilateral filtering and measurements in native screenshots."""
import os,sys,json
from pathlib import Path
import numpy as np,cv2
from scipy import ndimage,sparse
from scipy.sparse.csgraph import connected_components
from PIL import Image,ImageDraw
OUT=Path(os.environ.get('TOY_TEXTURE_OUT','.work/toy-character/texture')).resolve()
def save_json(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def islands(f,uv):
    # A UV vertex is a geometric vertex AND a texture coordinate. Connecting
    # triangle corners this way also counts islands split at original UV seams.
    keys=np.column_stack((f.reshape(-1),np.round(uv.reshape(-1,2)*1e6).astype(np.int64)))
    _,inv=np.unique(keys,axis=0,return_inverse=True);v=inv.reshape(-1,3)
    a=np.concatenate([v[:,0],v[:,1],v[:,2]]);b=np.concatenate([v[:,1],v[:,2],v[:,0]])
    graph=sparse.coo_matrix((np.ones(len(a),np.uint8),(a,b)),shape=(inv.max()+1,)*2)
    count,labels=connected_components(graph,directed=False)
    return int(count),labels[v[:,0]]
def draw_uv(uv,labels,size=1000):
    im=np.full((size,size,3),245,np.uint8);rng=np.random.default_rng(42);palette=rng.integers(40,220,(labels.max()+1,3)).astype(np.uint8)
    points=np.round(uv*np.array([size-1,-(size-1)])+[0,size-1]).astype(np.int32)
    for p,label in zip(points,labels):cv2.fillConvexPoly(im,p,palette[label].tolist())
    # Island outlines remain readable; drawing every dense triangle would
    # obscure the new large regions with a solid black wireframe.
    label_image=np.zeros((size,size),np.int32)
    for p,label in zip(points,labels):cv2.fillConvexPoly(label_image,p,int(label)+1)
    edge=np.zeros((size,size),bool);edge[1:]|=label_image[1:]!=label_image[:-1];edge[:,1:]|=label_image[:,1:]!=label_image[:,:-1]
    im[edge]=(35,35,40)
    return Image.fromarray(im)
def smooth(im,name):
    rgb=np.array(im.convert('RGB'));hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV)
    # Clothing boundaries are categorical masks: a pixel never receives color
    # from another mask. Bilateral range weights retain folds inside each part.
    h,s,v=cv2.split(hsv);labels=np.zeros(h.shape,np.uint8)
    labels[(h<5)|(h>165)]=1
    labels[(h>=5)&(h<25)]=2
    labels[(h>=25)&(h<45)]=3
    labels[(h>=45)&(h<95)]=4
    labels[(h>=95)&(h<122)]=5
    labels[(h>=122)&(h<=165)]=6
    labels[s<46]=7
    result=rgb.copy()
    for label in np.unique(labels):
        mask=labels==label
        if mask.sum()<10:continue
        ys,xs=np.where(mask);x0=max(0,xs.min()-12);x1=min(rgb.shape[1],xs.max()+13);y0=max(0,ys.min()-12);y1=min(rgb.shape[0],ys.max()+13)
        region=mask[y0:y1,x0:x1];crop=rgb[y0:y1,x0:x1]
        _,indices=ndimage.distance_transform_edt(~region,return_indices=True)
        extended=crop[indices[0],indices[1]]
        filtered=cv2.bilateralFilter(extended,21,32,6)
        filtered=cv2.bilateralFilter(filtered,21,24,9)
        view=result[y0:y1,x0:x1];view[region]=filtered[region]
    if name=='head_face':
        # Limit filtering to dark regions, predominantly generated hair.
        # Eye-overlay objects and their independent images are never edited.
        dark=(v<95)&(s<160)
        amount=cv2.GaussianBlur(dark.astype(np.float32),(0,0),1)
        result=np.round(rgb*(1-amount[:,:,None])+result*amount[:,:,None]).astype(np.uint8)
    return Image.fromarray(result)
def process():
    requested=Image.open(OUT.parent/'img3d/out/v4-noglasses_base.png');embedded=Image.open(OUT.parent/'display/source-body-0.png')
    x=np.array(requested.convert('RGB')).astype(np.float32);y=np.array(embedded.convert('RGB')).astype(np.float32)
    save_json('source-check.json',{'variant123_color_source':'img3d/out/v4-noglasses_base.png','baseline_embedded_source':'display/source-body-0.png','source_format':requested.format,'embedded_format':embedded.format,'dimensions':[4096,4096],'pixel_exact':bool(np.array_equal(x,y)),'embedded_vs_requested_mae_255':float(np.mean(abs(x-y))),'interpretation':'Baseline uses the encoded WebP embedded in the generated GLB. Variants1..3 use the requested original PNG;0->1 includes the previous encoding loss.'})
    report={};sheet=Image.new('RGB',(2040,2110),'white');d=ImageDraw.Draw(sheet)
    for row,name in enumerate(['body','head_face']):
        a=np.load(OUT/(name+'-uv.npz'));report[name]={}
        for col,key in enumerate(['old','new']):
            count,label=islands(a['f'],a[key]);report[name][key+'_islands']=count
            sheet.paste(draw_uv(a[key],label),(col*1020,row*1050+40));d.text((col*1020+12,row*1050+12),f'{name} {key}: {count} islands',fill='black')
        im=Image.open(OUT/(name+'-bake4096.png')).convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS)
        Image.open(OUT/(name+'-orm4096.png')).convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS).save(OUT/(name+'-orm2048.png'))
        im.save(OUT/(name+'-2.png'));smooth(im,name).save(OUT/(name+'-3.png'))
    sheet.save(OUT/'uv-before-after.png');save_json('uv.json',report)
    save_json('filter.json',{'method':'two bilateral passes within disjoint hue/achromatic masks; nearest same-mask extension; no cross-mask contributions','size':2048,'diameter':21,'passes':[{'sigmaColor':32,'sigmaSpace':6},{'sigmaColor':24,'sigmaSpace':9}],'head':'Dark low-saturation regions, predominantly generated hair. Bright skin is preserved; dark facial shading can also be filtered. Separate eye surfaces, UVs and images are unchanged.','bake_margin_4096':32,'uv_padding': 'xatlas16 at native atlas; scaled to4096 then2048; emission extension32 at4096'})

def measure():
    names=['0 display2 / 2048','1 original UV / 4096','2 new UV / 2048','3 new UV + bilateral / 2048']
    sheet=Image.new('RGB',(2880,510),'white');d=ImageDraw.Draw(sheet)
    for i,name in enumerate(names):
        im=Image.open(OUT/str(i)/'web-sleeve.png').convert('RGB');sheet.paste(im.resize((720,450),Image.Resampling.LANCZOS),(720*i,45));d.text((720*i+16,15),name,fill='black')
    sheet.save(OUT/'compare-sleeve.png')
    # Coordinates refer to 2880x1800 zoomed Web screenshots (DPR2).
    # These interior patches avoid silhouette, straps, zip and color boundaries.
    boxes={'blue_sleeve':[650,700,850,950],'orange_sleeve':[2100,700,2250,930],'red_chest':[1180,410,1340,570],'blue_chest':[1540,420,1670,570],'lower_chest':[1160,970,1350,1330]}
    results=[]
    for i in range(4):
        rgb=np.array(Image.open(OUT/str(i)/'web-sleeve.png').convert('RGB'));lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(np.float32);lum=lab[:,:,0]
        residual=lum-cv2.GaussianBlur(lum,(0,0),3)
        slow=cv2.GaussianBlur(lum,(0,0),16)-cv2.GaussianBlur(lum,(0,0),48)
        rows={};totalpix=0;totalhf=0;totaldots=0
        marked=rgb.copy()
        for part,(x0,y0,x1,y1) in boxes.items():
            r=residual[y0:y1,x0:x1];hf=float(np.mean(r*r));totalpix+=r.size;totalhf+=np.sum(r*r)
            local=lab[y0:y1,x0:x1];base=cv2.GaussianBlur(local,(0,0),5)
            delta=np.linalg.norm(local-base,axis=2);binary=(delta>10).astype(np.uint8)
            n,labels,stats,centers=cv2.connectedComponentsWithStats(binary,8);count=0
            for k in range(1,n):
                x,y,w,h,area=stats[k]
                # Small, compact, high-contrast components are a reproducible
                # proxy for triangular dots, not a claim of mesh-face identity.
                if 3<=area<=180 and max(w,h)<=28 and area/(w*h)>.2:
                    count+=1;cv2.rectangle(marked,(x0+x,y0+y),(x0+x+w,y0+y+h),(255,0,255),2)
            totaldots+=count;rows[part]={'hf_energy':hf,'dots':count,'pixels':int(r.size),'fold_band_rms':float(np.sqrt(np.mean(slow[y0:y1,x0:x1]**2)))}
            cv2.rectangle(marked,(x0,y0),(x1,y1),(0,255,0),2)
        Image.fromarray(marked).resize((1440,900)).save(OUT/str(i)/'measurement-regions.png')
        results.append({'variant':i,'name':names[i],'hf_energy':float(totalhf/totalpix),'dot_count':totaldots,'parts':rows})
    save_json('measurements.json',{'definition':{'hf':'sRGB-derived Lab L (0..255) minus Gaussian sigma=3 native physical pixels; mean squared residual; flat interior fixed ROIs','dots':'Lab distance from Gaussian sigma=5 >10; 8-connected components 3..180 pixels, max side28, fill>0.2; proxy for small contrasting blobs, includes non-triangle spots','fold':'RMS bandpass sigma16 minus sigma48; broad folds plus shading','boxes_native_pixels':boxes,'pose':'neutral, no breathing or blink; identical actual demo lighting/tone mapping; 1440x900 DPR2; camera setViewOffset(1440,900,500,300,440,275)'},'variants':results})
    similar=all(abs(r['hf_energy']/results[0]['hf_energy']-1)<.05 and abs(r['dot_count']-results[0]['dot_count'])<=2 for r in results[1:])
    best=2 if similar else min(results[1:],key=lambda r:r['hf_energy'])['variant']
    save_json('selection.json',{'selected':best,'reason':'no meaningful difference: choose2' if similar else 'lowest fixed-ROI high-frequency energy; inspect folds and boundaries in comparison before acceptance'})
    print(json.dumps(results,indent=2),flush=True)
if __name__=='__main__':measure() if 'measure' in sys.argv else process()
