"""External geometry, measured UVs, hair-only padding, and image comparison."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from scipy.spatial import cKDTree
import bake_images as bi

OUT=Path(sys.argv[1]);PHASE=sys.argv[2]
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'.work/toy-character/bake/vendor'))


def write(name,value):
    (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def solid():
    import igl
    from skimage.measure import marching_cubes
    from solidify import escape_counts,largest,note
    d=np.load(OUT/'source.npz');v=d['V'].astype(float);f=d['F'].astype(np.int64);lab=d['labels'];h=.001
    lo=v.min(0)-10*h;axes=[np.arange(lo[k],v[:,k].max()+11*h,h) for k in range(3)];shape=tuple(map(len,axes));digest=hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest();cache=OUT/'winding.npz'
    if cache.exists() and str(np.load(cache)['source_sha256'])==digest:shell=np.load(cache)['shell']
    else:
        shell=np.empty(shape,bool);yz=np.stack(np.meshgrid(axes[1],axes[2],indexing='ij'),-1).reshape(-1,2)
        for i in range(0,shape[0],4):
            xs=axes[0][i:i+4];q=np.empty((len(xs),len(yz),3));q[:,:,0]=xs[:,None];q[:,:,1:]=yz
            shell[i:i+len(xs)]=(abs(igl.fast_winding_number(v,f,q.reshape(-1,3)))>.5).reshape(len(xs),shape[1],shape[2])
            if i%40==0:note(OUT,f'B winding {i}/{shape[0]}')
        np.savez_compressed(cache,shell=shell,source_sha256=digest)
    st=ndimage.generate_binary_structure(3,1);wall=ndimage.binary_dilation(shell,st,iterations=1);note(OUT,'B 26方向の見通し');counts=escape_counts(wall)
    filled=ndimage.binary_erosion(largest(ndimage.binary_fill_holes(counts<5)),st,iterations=1);np.savez_compressed(OUT/'filled-grid.npz',solid=filled,lo=lo,h=h)
    vv,ff,_,_=marching_cubes(filled.astype(np.float32),.5,spacing=(h,h,h),allow_degenerate=False);vv+=lo
    # Exact nearest triangles, rather than nearest centroids, define labels.
    centers=vv[ff].mean(1);dist,fi,_=igl.point_mesh_squared_distance(centers,v,f);hairf=f[lab==1];hd,_,_=igl.point_mesh_squared_distance(centers,v,hairf)
    keep=(lab[fi]==1)|(np.sqrt(hd)<=np.sqrt(dist)+.001)
    np.savez(OUT/'B-full.npz',V=vv,F=ff)
    used,inv=np.unique(ff[keep],return_inverse=True);newv=vv[used];newf=inv.reshape(-1,3)
    np.savez(OUT/'B-filled.npz',V=newv,F=newf)
    report={'source_sha256':digest,'cap_included':False,'grid_m':h,'shape':list(shape),'wall_dilation_cells':1,'escape_threshold':'<5 of 26','fill_holes':True,'largest_volume':True,'erosion_cells':1,'label_method':'exact closest original head triangle; extend hair nearest-distance margin 1mm for overlap strip','hair_selection_margin_m':.001,'filled_triangles':len(ff),'hair_triangles_before_collapse':len(newf)}
    write('solid.json',report);note(OUT,'B 充填 '+json.dumps(report))


def uv():
    from shapely import Polygon,STRtree,union_all
    d=np.load(OUT/'uv-fields.npz');u=d['uv'];f=d['F'];ch=bi.charts(u,f);polys=np.array([Polygon(t) for t in u],object);tree=STRtree(polys);pairs=tree.query(polys,predicate='intersects');pairs=pairs[:,pairs[0]<pairs[1]];bad=set();area=0.;overlaps=0
    for a,b in pairs.T:
        x=polys[a].intersection(polys[b]).area
        if x>1e-13:bad.update([int(a),int(b)]);area+=x;overlaps+=1
    aa=u[:,1]-u[:,0];bb=u[:,2]-u[:,0];triangle_area=np.abs(aa[:,0]*bb[:,1]-aa[:,1]*bb[:,0])/2
    bad.update(np.flatnonzero(triangle_area<1e-15).tolist());islands=np.array([union_all(polys[ch==cid]) for cid in range(ch.max()+1)],object);itree=STRtree(islands);_,gap=itree.query_nearest(islands,exclusive=True,return_distance=True,all_matches=False)
    metric={'out_of_range_corners':int(np.any((u<0)|(u>1),axis=2).sum()),'overlap_pairs':overlaps,'overlap_area_uv':area,'zero_area_triangles':int((triangle_area<1e-15).sum()),'islands':len(islands),'min_gap_px_2048':float(gap.min()*2048) if len(gap) else 2048.,'method':'stage7 semantic/back-path seams + ANGLE_BASED; average density; CONCAVE FRACTION pack; measured foldovers split recursively'}
    write('uv-metrics.json',metric);np.save(OUT/'uv-bad-faces.npy',np.array(sorted(bad),int));np.save(OUT/'chart.npy',ch)
    canvas=Image.new('RGB',(1024,1024),'white');draw=ImageDraw.Draw(canvas)
    for t,c in zip(u,ch):draw.polygon([(float(v[0]*1024),float((1-v[1])*1024)) for v in t],fill=(50+int(c*83)%160,50+int(c*47)%160,50+int(c*29)%160),outline='black')
    canvas.save(OUT/'uv.png');print(json.dumps(metric),flush=True)
    if not bad:np.save(OUT/'face-raster.npy',bi.raster(u,np.arange(len(u))));np.save(OUT/'chart-raster.npy',bi.raster(u,ch))


def finish():
    d=np.load(OUT/'uv-fields.npz');u=d['uv'];v=d['V'];f=d['F'];ids=np.load(OUT/'face-raster.npy');ch=np.load(OUT/'chart-raster.npy');coverage=ids>=0;yy,xx=np.where(coverage);ii=ids[yy,xx];t=u[ii];q=np.c_[(xx+.5)/4096,(yy+.5)/4096];a,b,c=t[:,0],t[:,1],t[:,2];den=(b[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,1]-c[:,1]);uu=((b[:,1]-c[:,1])*(q[:,0]-c[:,0])+(c[:,0]-b[:,0])*(q[:,1]-c[:,1]))/den;vv=((c[:,1]-a[:,1])*(q[:,0]-c[:,0])+(a[:,0]-c[:,0])*(q[:,1]-c[:,1]))/den
    xyz=np.zeros((4096,4096,3),np.float32);xyz[yy,xx]=uu[:,None]*v[f[ii,0]]+vv[:,None]*v[f[ii,1]]+(1-uu-vv)[:,None]*v[f[ii,2]]
    read=lambda kind:bi.read(OUT/(kind+'-raw.png'))
    hit=coverage&(read('mask')[:,:,0]>127);images={k:read(k) for k in ['color','normal','roughness','metallic']};normalvalid=hit&(images['normal'][:,:,2]>=128);miss=coverage&~hit;hy,hx=np.where(hit);my,mx=np.where(miss);tree=cKDTree(xyz[hy,hx]);_,near=tree.query(xyz[my,mx],workers=-1)
    for k in ['color','roughness','metallic']:images[k][my,mx]=images[k][hy[near],hx[near]]
    atlas={k:np.zeros((4096,4096,3),np.uint8) for k in images};atlas['normal'][:]=(128,128,255)
    boxes=ndimage.find_objects(ch+1)
    for cid in np.unique(ch[coverage]):
        by,bx=boxes[cid];y0,y1=max(0,by.start-7),min(4096,by.stop+7);x0,x1=max(0,bx.start-7),min(4096,bx.stop+7);local=ch[y0:y1,x0:x1]==cid;good=normalvalid[y0:y1,x0:x1]&local;dist,idx=ndimage.distance_transform_edt(~local,return_indices=True);pad=dist<=6
        for kind,img in images.items():
            if kind=='normal':
                if good.any():
                    _,ni=ndimage.distance_transform_edt(~good,return_indices=True);sample=img[ni[0]+y0,ni[1]+x0]
                else:sample=np.broadcast_to(np.array([128,128,255],np.uint8),(*local.shape,3))
            else:sample=img[idx[0]+y0,idx[1]+x0]
            atlas[kind][y0:y1,x0:x1][pad]=sample[pad]
    color=bi.srgb(bi.half(bi.linear(atlas['color'].astype(np.float32)/255)));bi.save('basecolor.png',np.round(color*255));n=bi.half(atlas['normal'].astype(np.float32)/127.5-1);n/=np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-8);bi.save('normal.png',np.round((n+1)*127.5));bi.save('roughness.png',np.round(bi.half(atlas['roughness'].astype(np.float32))));bi.save('metallic.png',np.round(bi.half(atlas['metallic'].astype(np.float32))))
    write('bake-metrics.json',{'resolution_bake':4096,'resolution_final':2048,'coverage_texels':int(coverage.sum()),'ray_miss_texels':int(miss.sum()),'ray_miss_fraction':float(miss.sum()/coverage.sum()),'opposed_normal_texels':int((hit&~normalvalid).sum()),'normal_unmatched_fraction':float((coverage&~normalvalid).sum()/coverage.sum()),'padding_px_4096':6,'method':'same as stage7; color/roughness fill nearest supported hair texel in 3D; tangent normal fill same UV island or neutral; 4096 downsample in linear color, renormalize normals','extrusion_mm':3,'max_ray_distance_mm':5})


def rgb(name):
    im=Image.open(OUT/name).convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);return np.asarray(bg.convert('RGB'))


def semantic(name):
    a=np.asarray(Image.open(OUT/name).convert('RGBA'));col=a[:,:,:3];alpha=a[:,:,3]>250
    return {'hair':alpha&(col[:,:,1]>220)&(col[:,:,0]<30)&(col[:,:,2]<30),
            'skin':alpha&(col[:,:,0]>220)&(col[:,:,1]<30)&(col[:,:,2]<30),
            'head':alpha&((col[:,:,0]>220)|(col[:,:,1]>220))&(col[:,:,2]<30)}


def metrics():
    views=['demo-rest','face-0','face-35'];rows={t:{} for t in ['high','stage7','A','B']}
    for view in views:
        kind,angle=view.split('-');suffix='rest' if kind=='demo' else angle
        ref=semantic(f'mask-{kind}-high-{suffix}.png');region=ndimage.binary_erosion(ref['hair'],iterations=1);colorref=rgb(f'{kind}-high-{suffix}.png')
        Image.fromarray(region.astype(np.uint8)*255).save(OUT/f'metric-region-{view}.png')
        for tag in rows:
            mask=semantic(f'mask-{kind}-{tag}-{suffix}.png');color=rgb(f'{kind}-{tag}-{suffix}.png');skin=region&mask['skin'];difference=np.abs(color.astype(float)-colorref.astype(float)).mean(2)
            rows[tag][view]={'hair_region_pixels':int(region.sum()),'skin_pixels_in_hair':int(skin.sum()),'skin_fraction':float(skin.sum()/region.sum()),'mean_abs_srgb_difference_0_255':float(difference[region].mean())}
            Image.fromarray(skin.astype(np.uint8)*255).save(OUT/f'metric-holes-{tag}-{view}.png')
    silhouettes={}
    for tag in rows:
        silhouettes[tag]={}
        for angle in [0,90,180]:
            ref=semantic(f'mask-face-high-{angle}.png')['head'];low=semantic(f'mask-face-{tag}-{angle}.png')['head'];silhouettes[tag][str(angle)]=float((ref&low).sum()/(ref|low).sum())
    report={'stage':'hair','texture_strategy':'hair-only separate 2048px color / tangent normal +Y / roughness / source metallic per candidate; stage7 body, skin and cap use original atlas unchanged',
            'measurement':{'resolution':[1280,800],'camera':'same stage6/7 vertical FOV25, demo framing1.25m, head closeup0.38m; fixed camera/lights for all candidates',
                           'holes':'count actually rendered skin-ID pixels inside a one-pixel-eroded visible high-density hair+cap mask; alpha>250, ID channel>220 and other channels<30; antialias border excluded',
                           'appearance':'mean absolute RGB channel difference in composited sRGB byte values on the same eroded reference hair mask; includes lighting and baked normal',
                           'silhouette':'head+hair+cap rendered semantic union; thresholded pixel IoU front/side/back',
                           'aggregation':'holes=sum across demo-rest and face0/35; color=equal-view mean across same3; silhouette=equal-view mean across0/90/180; one vote each, winner at least2/3'},
            'candidates':{},'reference':{'views':rows['high'],'silhouette_iou':silhouettes['high']},'stage7':{'views':rows['stage7'],'silhouette_iou':silhouettes['stage7']}}
    for tag in ['A','B']:
        geom=json.loads((OUT/(tag+'-geometry.json')).read_text());top=geom['after'];tri=top['triangles']
        report['candidates'][tag]={'triangles':tri,'boundary_edges':top['boundary_edges'],'connected_components':top['connected_components'],'topology':top,'views':rows[tag],
                                   'skin_pixels_in_hair_total':sum(v['skin_pixels_in_hair'] for v in rows[tag].values()),
                                   'mean_abs_srgb_difference_0_255':float(np.mean([v['mean_abs_srgb_difference_0_255'] for v in rows[tag].values()])),
                                   'silhouette_iou':silhouettes[tag],'mean_silhouette_iou':float(np.mean(list(silhouettes[tag].values()))),
                                   'uv':json.loads((OUT/tag/'uv-metrics.json').read_text()),'bake':json.loads((OUT/tag/'bake-metrics.json').read_text())}
    aa=report['candidates']['A'];bb=report['candidates']['B'];votes={}
    for key,higher in [('skin_pixels_in_hair_total',False),('mean_abs_srgb_difference_0_255',False),('mean_silhouette_iou',True)]:
        votes[key]='tie' if aa[key]==bb[key] else ('A' if (aa[key]>bb[key])==higher else 'B')
    counts={t:sum(v==t for v in votes.values()) for t in ['A','B']};selected=max(counts,key=counts.get)
    if counts[selected]<2:raise RuntimeError('No 2-of-3 winner; do not silently change selection rule')
    report.update(votes=votes,selected=selected,assumptions=['髪はheadへ重み1.0の固定で、キャップは工程7のまま保持する。','Bは1セルの壁膨張、26方向の5未満、穴埋め・最大領域・1セルの収縮を工程6と同じ順で使い、キャップは入れない。','Bは最近傍面ラベルを使い、顔側へ1mmの距離差で帯を延ばす。境界から3mm内の帯だけ、近傍の肌の1mm下へなだらかに重ねる。','色差はsRGBの各チャンネル絶対差の平均、3画角を等しい重みで平均する。輪郭は頭全体を正面・横・後ろで計る。','穴は高密度で髪が見える領域に低密度の肌が見える画素とする。高密度ですでにあるすき間は増分に含めない。'])
    report['assumptions'] += ['Aの内外の向きの判定には、充填した頭の最寄り面の法線を補助に使う。外向きの面は陰にあっても残し、内向きかつ外部から見えない面だけ除く。', '溶接は0.1um以内。非多様体のためCollapseが止まる場合は面のファンを分けて同じCollapseを続ける。ゼロ面積・重複の面は除くため15,000は減面の予算とする。', 'UVは工程7と同じ縫い目・ANGLE_BASED・重なり実測修復・CONCAVE packを使う。多数の島を専用2048pxへ収めるため島間は8pxを要求し、実測A7.899px/B7.861px、パディングは4096pxで各側6pxとする。', '元の髪のmetallic画像も維持する。0へ変更すると色の見え方が変わるため、色・法線・粗さに加えて2048pxへ焼く。', '顔とキャップを髪から分けるとき、頂点位置・面順・UV・スムーズ設定・ウェイト・材質を保持する。法線の再格納には最大0.1003度の丸め誤差がある。']
    write('metrics.json',report);print(json.dumps({'selected':selected,'votes':votes,'values':{t:{k:report['candidates'][t][k] for k in ['triangles','boundary_edges','connected_components','skin_pixels_in_hair_total','mean_abs_srgb_difference_0_255','mean_silhouette_iou']} for t in ['A','B']}},ensure_ascii=False),flush=True)


def sheet():
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    def make(name,files,labels,cols,width):
        ims=[Image.fromarray(rgb(f)) for f in files];height=round(ims[0].height*width/ims[0].width);head=32;canvas=Image.new('RGB',(width*cols,(height+head)*int(np.ceil(len(files)/cols))),'white');draw=ImageDraw.Draw(canvas)
        for i,(im,label) in enumerate(zip(ims,labels)):
            x=i%cols*width;y=i//cols*(height+head);canvas.paste(im.resize((width,height),Image.Resampling.LANCZOS),(x,y+head));draw.text((x+12,y+5),label,font=font,fill='black')
        canvas.save(OUT/name)
    tags=['high','stage7','A','B'];angles=[0,35,90,180]
    make('hair-compare.png',[f'face-{t}-{a}.png' for t in tags for a in angles],[f'{t} / {a} deg' for t in tags for a in angles],4,640)
    make('demo-color.png',[f'demo-selected-{p}.png' for p in ['rest','combo_left','neck_up10']],['Rest','Neck left 25 + upper left 8','Neck up 10'],3,640)
    make('hair-under.png',[f'under-selected-{a}.png' for a in [0,55,-55]],[f'Neck up10 / camera {a}' for a in [0,55,-55]],3,850)
    (OUT/'review.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>髪の比較</title><style>body{font:16px system-ui;margin:24px;background:#eee}img{max-width:100%;display:block;margin:16px 0}</style><h1>髪だけの作り直し</h1><p>上から高密度、工程7、A、B。左から正面、35度、横、後ろ。</p>'+''.join(f'<a href="{n}">{n}<img src="{n}"></a>' for n in ['hair-compare.png','demo-color.png','hair-under.png'])+'<p><a href="character-hair.blend">character-hair.blend</a> / <a href="metrics.json">metrics.json</a> / <a href="log.md">log.md</a></p></html>')


if __name__=='__main__':
    {'solid':solid,'uv':uv,'finish':finish,'metrics':metrics,'sheet':sheet}[PHASE]()
