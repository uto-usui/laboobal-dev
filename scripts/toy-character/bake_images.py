"""UV measurements, within-part hole fill, atlas downsampling and contact sheets.

Runs in the existing geometry environment (NumPy/SciPy/Pillow). Shapely is loaded
from the bake-local vendor folder for exact polygon overlap and gap checks.
"""
import json
from pathlib import Path
import sys
import time
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import distance_transform_edt

OUT=Path(sys.argv[1]);PHASE=sys.argv[2]
sys.path.insert(0,str(OUT/'vendor'))


def write(name,value):
    (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def log(message):
    print(message,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+message+'\n')


def charts(uv,faces):
    parent=np.arange(len(faces));edge={}
    def find(a):
        while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
        return a
    for i,(tri,tex) in enumerate(zip(faces,uv)):
        for a,b in [(0,1),(1,2),(2,0)]:
            va,vb=int(tri[a]),int(tri[b]);ta,tb=tex[a],tex[b]
            if va>vb:va,vb=vb,va;ta,tb=tb,ta
            key=(va,vb,*np.round(ta,7),*np.round(tb,7))
            if key in edge:parent[find(i)]=find(edge[key])
            else:edge[key]=i
    roots=np.array([find(i) for i in range(len(faces))]);return np.unique(roots,return_inverse=True)[1]


def raster(uv,values,size=4096):
    """Pixel-center coverage, including tiny slivers when a center is covered."""
    arr=np.full((size,size),-1,np.int32)
    for t,value in zip(uv*size,values):
        lo=np.maximum(0,np.ceil(t.min(0)-.5).astype(int));hi=np.minimum(size-1,np.floor(t.max(0)-.5).astype(int))
        if np.any(hi<lo):continue
        x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
        a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-15:continue
        u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;mask=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7);view=arr[lo[1]:hi[1]+1,lo[0]:hi[0]+1];view[mask]=value
    return arr


def uv_measure():
    from shapely import Polygon,STRtree,union_all
    d=np.load(OUT/'uv-fields.npz');alluv=[];allparts=[];allcharts=[];uvmetrics=[];offset=0;density=[]
    palette=[(55,95,170),(190,115,60),(65,160,100),(200,95,115),(140,110,185)]
    canvas=Image.new('RGB',(2048,2048),'white');draw=ImageDraw.Draw(canvas)
    for i in range(2):
        uv=d[f'uv{i}'];f=d[f'f{i}'];p=d[f'p{i}'];part=d[f'part{i}'];ch=charts(uv,f);da=uv[:,1]-uv[:,0];db=uv[:,2]-uv[:,0];area=np.abs(da[:,0]*db[:,1]-da[:,1]*db[:,0])/2;geo=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)/2
        for label in np.unique(part):
            ids=part==label;density.append({'mesh':i,'label':int(label),'sqrt_uv_area_per_surface_area':float(np.sqrt(area[ids].sum()/geo[ids].sum()))})
        uvmetrics.append({'mesh':i,'islands':int(ch.max()+1),'out_of_range_corners':int(np.any((uv<0)|(uv>1),axis=2).sum()),'zero_area_triangles':int((area<1e-15).sum()),'zero_area_islands':int(sum(area[ch==c].sum()<1e-15 for c in np.unique(ch))),'minimum':uv.min((0,1)).tolist(),'maximum':uv.max((0,1)).tolist()})
        for k,t in zip(ch,uv):draw.polygon([(float(v[0]*2048),float((1-v[1])*2048)) for v in t],fill=palette[(k+offset)%len(palette)],outline=(35,35,35))
        alluv.append(uv);allparts.append(part if i==0 else part+20);allcharts.append(ch+offset);offset+=ch.max()+1
    uv=np.concatenate(alluv);part=np.concatenate(allparts);ch=np.concatenate(allcharts);polys=np.array([Polygon(t) for t in uv],object);tree=STRtree(polys);pairs=tree.query(polys,predicate='intersects');pairs=pairs[:,pairs[0]<pairs[1]];intersections=[]
    for a,b in pairs.T:
        area=polys[a].intersection(polys[b]).area
        if area>1e-13:intersections.append({'faces':[int(a),int(b)],'area_uv':float(area),'charts':[int(ch[a]),int(ch[b])]})
    islands=np.array([union_all(polys[ch==c]) for c in range(offset)],object);itree=STRtree(islands);ij,gaps=itree.query_nearest(islands,exclusive=True,return_distance=True,all_matches=False);gap=float(gaps.min()) if len(gaps) else 1.;which=int(np.argmin(gaps));pair=ij[:,which].tolist()
    result={'meshes':uvmetrics,'out_of_range_corners':sum(m['out_of_range_corners'] for m in uvmetrics),'overlap_area_tolerance_uv':1e-13,'unintended_triangle_overlap_pairs':len(intersections),'overlap_area_uv':sum(x['area_uv'] for x in intersections),'zero_area_islands':sum(m['zero_area_islands'] for m in uvmetrics),'zero_area_triangles':sum(m['zero_area_triangles'] for m in uvmetrics),'islands':int(offset),'minimum_island_gap_px_2048':gap*2048,'minimum_gap_island_pair':pair,'requested_gap_px_2048':40,'padding_px_4096_each_side':32,'density':density,'method':'ANGLE_BASED; average island scale; head skin charts linear x1.5; shared CONCAVE FRACTION pack; exact Shapely triangle intersections and polygon-to-polygon distance','overlaps':intersections[:200]}
    bad=set(a for row in intersections for a in row['faces'])
    for i,t in enumerate(uv):
        a,b=t[1]-t[0],t[2]-t[0]
        if abs(a[0]*b[1]-a[1]*b[0])<2e-15:bad.add(i)
    np.save(OUT/'uv-bad-faces.npy',np.array(sorted(bad),np.int32))
    write('uv-metrics.json',result);canvas.save(OUT/'uv.png');np.savez_compressed(OUT/'atlas-fields.npz',uv=uv,part=part,chart=ch)
    if not bad:
        np.save(OUT/'part-raster.npy',raster(uv,part));np.save(OUT/'chart-raster.npy',raster(uv,ch))
    log('UVの実測 '+json.dumps({k:v for k,v in result.items() if k not in ['density','method','overlaps','meshes']},ensure_ascii=False))


def read(name):return np.asarray(Image.open(name).convert('RGB'))[::-1].copy()
def save(name,rgb):Image.fromarray(np.uint8(np.clip(rgb,0,255))[::-1]).save(OUT/name)
def linear(x):return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def srgb(x):return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055)
def half(x):return x.reshape(x.shape[0]//2,2,x.shape[1]//2,2,*x.shape[2:]).mean((1,3))


def finish():
    from bake_settings import PART_CODES,DISTANCES
    parts=np.load(OUT/'part-raster.npy');chart=np.load(OUT/'chart-raster.npy');coverage=parts>=0;rows={};atlas={k:np.zeros((4096,4096,3),np.uint8) for k in ['color','normal','roughness','metallic']};atlas['normal'][:]=(128,128,255)
    from scipy.spatial import cKDTree
    fields=np.load(OUT/'uv-fields.npz');alluv=np.concatenate([fields['uv0'],fields['uv1']]);allv=np.concatenate([fields['p0'][fields['f0']],fields['p1'][fields['f1']]])
    faceids=raster(alluv,np.arange(len(alluv)));yy,xx=np.where(coverage);ids=faceids[yy,xx];t=alluv[ids];q=np.c_[(xx+.5)/4096,(yy+.5)/4096];a=t[:,0];b=t[:,1];c=t[:,2];den=(b[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,1]-c[:,1]);u=((b[:,1]-c[:,1])*(q[:,0]-c[:,0])+(c[:,0]-b[:,0])*(q[:,1]-c[:,1]))/den;v=((c[:,1]-a[:,1])*(q[:,0]-c[:,0])+(a[:,0]-c[:,0])*(q[:,1]-c[:,1]))/den
    xyz=np.zeros((4096,4096,3),np.float32);xyz[yy,xx]=u[:,None]*allv[ids,0]+v[:,None]*allv[ids,1]+(1-u-v)[:,None]*allv[ids,2]
    # Padding is constructed per island, so colors never cross semantic labels.
    for name,pid in PART_CODES.items():
        mask=parts==pid;raw=read(OUT/'parts'/name/'mask.png')[:,:,0];images={k:read(OUT/'parts'/name/(k+'.png')) for k in atlas}
        hit=mask&(raw>127)
        # A thin inner shell can be hit within the correct part. Its reversed
        # normal points below the target tangent plane and must not become an
        # inverted normal-map patch. Treat that hit as unsupported before fill.
        opposed=hit&(images['normal'][:,:,2]<128)
        valid=hit;normalvalid=hit&~opposed;miss=mask&~valid;count=int(mask.sum());filled=np.zeros_like(mask)
        assert valid.any(), 'No valid source hit for '+name
        rows[name]={'extrusion_mm':DISTANCES[name][0]*1000,'max_ray_distance_mm':DISTANCES[name][1]*1000,'covered_texels_4096':count,'ray_miss_texels':int((mask&~hit).sum()),'opposed_shell_hits_rejected':int(opposed.sum()),'unmatched_texels_before_fill':int(miss.sum()),'unmatched_fraction_before_fill':float(miss.sum()/max(count,1)),'normal_unmatched_texels_before_fill':int((mask&~normalvalid).sum()),'entirely_unmatched_islands':[]}
        # Color/roughness/metallicity holes use neighbors on the actual 3D
        # surface. Atlas-nearest can map an unsupported shoe island to trousers.
        hy,hx=np.where(hit);my,mx=np.where(miss);tree=cKDTree(xyz[hy,hx]);_,nearest=tree.query(xyz[my,mx],workers=-1)
        for kind,img in images.items():
            if kind!='normal':img[my,mx]=img[hy[nearest],hx[nearest]]
        for cid in np.unique(chart[mask]):
            cm=(chart==cid)&mask;ys,xs=np.where(cm);y0,y1=max(0,ys.min()-33),min(4096,ys.max()+34);x0,x1=max(0,xs.min()-33),min(4096,xs.max()+34);local=cm[y0:y1,x0:x1];good=normalvalid[y0:y1,x0:x1]&local;dist,padidx=distance_transform_edt(~local,return_indices=True);pad=dist<=32
            if not (hit[y0:y1,x0:x1]&local).any():rows[name]['entirely_unmatched_islands'].append(int(cid))
            for kind,img in images.items():
                if kind=='normal':
                    if good.any():
                        _,idx=distance_transform_edt(~good,return_indices=True);sampled=img[idx[0]+y0,idx[1]+x0].copy()
                    else:sampled=np.broadcast_to(np.array([128,128,255],np.uint8),(*local.shape,3))
                else:sampled=img[padidx[0]+y0,padidx[1]+x0]
                view=atlas[kind][y0:y1,x0:x1];view[pad]=sampled[pad]
            filled[y0:y1,x0:x1]|=pad
        rows[name]['unmatched_texels_after_fill']=int((mask&~filled).sum())
        assert rows[name]['unmatched_texels_after_fill']==0
        log(name+' 未対応 '+str(rows[name]['unmatched_texels_before_fill'])+'/'+str(count)+' ('+str(round(rows[name]['unmatched_fraction_before_fill']*100,3))+'%)。同じ部位で埋めた。')
    # The old body's neck label contains baked red-collar colors. Matching a
    # channel gain also boosts those green contaminants. Use the adjacent head
    # skin's robust median only on this synthetic transition instead.
    uv=fields['uv1'];p=fields['p1'];f=fields['f1'];lab=fields['part1'];cent=p[f].mean(1);neckfaces=(lab==0)&(cent[:,2]<.712)&(cent[:,1]<.015);headneck=raster(uv[neckfaces],np.ones(neckfaces.sum(),int))>=0;headneck&=parts==20;bodyneck=parts==2
    headmedian=np.median(atlas['color'][headneck],axis=0);bodymedian=np.median(atlas['color'][bodyneck],axis=0);bodypad=distance_transform_edt(~bodyneck)<=32;atlas['color'][bodypad]=np.uint8(headmedian)
    neck={'head_neck_median_srgb_before':headmedian.tolist(),'body_neck_median_srgb_before':bodymedian.tolist(),'body_neck_median_srgb_after':np.median(atlas['color'][bodyneck],axis=0).tolist(),'head_neck_samples':int(headneck.sum()),'body_neck_samples':int(bodyneck.sum()),'scope':'only body neck label2 replaced by adjacent head skin median; no design-image projection; no geometry changes'}
    for kind,rgb in atlas.items():save(kind+'-4096.png',rgb)
    color=srgb(half(linear(atlas['color'].astype(np.float32)/255)));save('basecolor.png',np.round(color*255))
    n=half(atlas['normal'].astype(np.float32)/127.5-1);n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-8);save('normal.png',np.round((n+1)*127.5));rough=half(atlas['roughness'].astype(np.float32));save('roughness.png',np.round(rough));mr=np.zeros((1024,1024,3),np.uint8);mr[:,:,1]=np.round(half(rough)[:,:,0]);mr[:,:,2]=np.round(half(half(atlas['metallic'].astype(np.float32)))[:,:,0]);save('metallic-roughness.png',mr)
    result={'stage':'bake','uv':json.loads((OUT/'uv-metrics.json').read_text()),'bake':{'parts':rows,'type':'Cycles selected-to-active EMIT / tangent NORMAL +Y / roughness via EMIT','bake_resolution':4096,'final_color_normal_roughness_resolution':2048,'metallic_roughness_resolution':1024,'explicit_cage':False,'padding_px_4096':32,'unmatched_definition':'low UV pixel centers with no corresponding high-part hit; white EMIT probe before fill; background/padding excluded; opposed normal hits are separately rejected for NORMAL only','fill':'color/roughness/metallic: same-part nearest supported texel in 3D; normal: outward-facing nearest within same island, or neutral; per-island 32px dilation','unmatched_after_fill':sum(r['unmatched_texels_after_fill'] for r in rows.values())},'neck_color':neck,'assumptions':['距離制限を有効にするため明示cageなし。押し出し3mm、最大光線4–5mm。','元GLBと同形・同UVのラベル付き高密度体に、元GLBの材質を復元して使う。','顔密度1.5倍は連続する頭の肌と首の島へ適用する。','キャップは元ファイルで画像を持たない黒の定数材質なので、その色と粗さを焼く。','同部位でも裏向きの殻を拾った法線は未対応へ含める。色のヒットは保持する。','体の首ラベルだけを頭の首元の肌の中央値で埋める。デザイン画の投影はしない。']}
    write('metrics.json',result);log('4096→2048の縮小と法線の再正規化、1024のG=粗さ/B=元のmetallic値、首の色合わせを完了。 '+json.dumps(neck,ensure_ascii=False))


def sheet(name,files,columns,labels=None):
    images=[Image.open(OUT/f).convert('RGB') for f in files];w,h=images[0].size;header=36;rows=(len(images)+columns-1)//columns;canvas=Image.new('RGB',(w*columns,(h+header)*rows),'white');d=ImageDraw.Draw(canvas)
    for i,(im,label) in enumerate(zip(images,labels or files)):
        x=(i%columns)*w;y=(i//columns)*(h+header);canvas.paste(im,(x,y+header));d.text((x+16,y+9),label,fill='black',font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20))
    canvas.save(OUT/name)


def review():
    for pattern in ['compare-*-*.png','face-*-*.png','demo-*.png','neck-*.png','under-*.png']:
        for path in OUT.glob(pattern):
            rgba=Image.open(path).convert('RGBA');white=Image.new('RGBA',rgba.size,'white');white.alpha_composite(rgba);white.convert('RGB').save(path)
    sheet('compare-4.png',[f'compare-{tag}-{a}.png' for tag in ['high','low'] for a in [0,90,180,270]],4)
    sheet('demo-color.png',[f'demo-{p}.png' for p in ['rest','combo_left','neck_up10']],3)
    sheet('face-color.png',[f'face-{tag}-{a}.png' for tag in ['high','low'] for a in [0,35]],2)
    sheet('neck-color.png',[f'neck-{p}.png' for p in ['rest','neck_left25','neck_right25']],3)
    sheet('hair-under.png',[f'under-{a}.png' for a in [0,55,-55]],3)
    names=['compare-4.png','demo-color.png','face-color.png','neck-color.png','hair-under.png','uv.png'];(OUT/'review.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>工程7 ベイク比較</title><style>body{font:16px system-ui;margin:20px;background:#eee}img{display:block;max-width:100%;height:auto;margin:16px 0}a{color:#1460aa}</style><h1>工程7 色・法線・粗さ</h1><p>比較は上が高密度、下が低密度。各画像を開くと原寸で確認できます。</p>'+''.join(f'<a href="{n}">{n}<img src="{n}"></a>' for n in names)+'<p><a href="metrics.json">metrics.json</a> / <a href="log.md">log.md</a></p></html>')

if __name__=='__main__':
    if PHASE=='uv':uv_measure()
    elif PHASE=='finish':finish()
    elif PHASE=='review':review()
    else:raise ValueError(PHASE)
