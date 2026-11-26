"""Stage 9 image registration, camera bake and review sheets. No generated skin is used."""
import sys,json,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import gaussian_filter,map_coordinates,distance_transform_edt,binary_erosion
OUT=Path(sys.argv[1]);PHASE=sys.argv[2]
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT/'.work/toy-character';DESIGN=ROOT/'docs/toy-character/design'

def log(s):
    print('EYES',s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def write(n,d):(OUT/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def reference():
    Image.open(DESIGN/'v4.png').crop((427,100,827,500)).resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/'v4-face.png')
    Image.open(WORK/'img3d/input/v4-noglasses.png').crop((427,100,827,500)).resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/'v4-face-noglasses.png')
    log('1: v4の顔を同じ投影範囲で切り抜き。入力モデルには画像の旧黒目が残っている。')

if PHASE=='reference':reference()

def save(n,a):
    Image.fromarray(np.uint8(np.clip(a,0,1)*255+.5)).save(OUT/n)

def rgb(n):return np.array(Image.open(n).convert('RGB'),float)/255

def sample(a,xx,yy):
    return np.stack([map_coordinates(a[:,:,c],[yy,xx],order=1,mode='constant',cval=0) for c in range(a.shape[2])],-1)

def assets():
    ref=rgb(OUT/'face-front-unlit.png');h,w=ref.shape[:2];yy,xx=np.indices((h,w));reg=json.loads(Path(__file__).with_name('eye-registration.json').read_text())
    radii=[np.sqrt(((xx-360)/88)**2+((yy-410)/64)**2),np.sqrt(((xx-656)/88)**2+((yy-410)/64)**2)]
    radius=np.minimum(*radii);patch=np.clip((1.25-radius)/.25,0,1);clean=ref.copy()
    # Fit only the existing nearby skin. No image-generated skin enters the asset.
    for cx in [360,656]:
        r=np.sqrt(((xx-cx)/88)**2+((yy-410)/64)**2);ring=(r>1.12)&(r<1.60)&(yy>325)&(yy<510)&(ref[:,:,0]>.7)&(ref[:,:,1]>.43)&(ref[:,:,1]<.85)
        x=(xx-cx)/100;y=(yy-410)/100;basis=np.stack([np.ones_like(x),x,y,x*x,x*y,y*y],-1)
        fit=np.linalg.lstsq(basis[ring],ref[ring],rcond=None)[0];skin=np.clip(basis@fit,0,1);a=np.clip((1.25-r)/.25,0,1)
        clean=clean*(1-a[:,:,None])+skin*a[:,:,None]
    save('skin-without-old-eyes.png',clean);save('eye-patch-mask.png',patch)
    frames=[];masks=[];alignments={};previews=[];feature_masks=[]
    for key in ['open','half','closed']:
        gen=rgb(OUT/'generated'/f'{key}.png');gen=np.array(Image.fromarray(np.uint8(gen*255)).resize((w,h),Image.Resampling.LANCZOS),float)/255
        composite=clean.copy();aligned=np.zeros_like(gen);feature=np.zeros((h,w));alignments[key]={}
        for side,cx in [('L',360),('R',656)]:
            src=np.array(reg[key][side],float);dst=np.array(reg['target'][side] if key=='open' else reg['blink_target'][key][side],float)
            matrix=np.linalg.solve(np.c_[src,np.ones(3)],dst).T
            inv=np.linalg.inv(np.vstack([matrix,[0,0,1]]));p=np.stack([xx,yy,np.ones_like(xx)],-1)@inv.T
            warp=sample(gen,p[:,:,0],p[:,:,1]);local=(abs(xx-cx)<92)&(abs(yy-410)<80)
            # Isolate only the generated sclera and dark lid strokes; reject peach skin.
            dark=np.clip((.56-warp[:,:,1])/.17,0,1)*np.clip((.78-warp[:,:,0])/.18,0,1)
            white=np.clip((.24-(warp[:,:,0]-warp[:,:,1]))/.10,0,1)*np.clip((warp[:,:,2]-.52)/.16,0,1)
            alpha=np.maximum(dark,white if key!='closed' else 0)*local
            composite=composite*(1-alpha[:,:,None])+warp*alpha[:,:,None]
            aligned+=warp*local[:,:,None];feature=np.maximum(feature,alpha)
            alignments[key][side]={'source_points':src.tolist(),'target_points':dst.tolist(),'affine_source_to_target':matrix.tolist(),'fitted_correspondence_residual_px':float(np.max(abs(np.c_[src,np.ones(3)]@matrix.T-dst))),'annotation_uncertainty_px':2}
        # The source-independent skin restoration and generated features share a fixed mask.
        frame=ref*(1-patch[:,:,None])+composite*patch[:,:,None];frames.append(frame);feature_masks.append(feature)
        save(f'projection-{key}.png',frame)
        # Accepted source images retain full framing; only eye features are consumed later.
        Image.fromarray(np.uint8(np.clip(frame,0,1)*255+.5)).save(DESIGN/f'eyes-{key}.png')
        if key=='closed':mask=np.zeros((h,w))
        else:
            # A conservative one-pixel inset protects eyelid lines under bilinear filtering.
            white=(aligned[:,:,2]>.60)&((aligned[:,:,0]-aligned[:,:,1])<.16)&(aligned[:,:,1]>.65)&(feature>.4)
            mask=np.clip(distance_transform_edt(white)-1,0,1)
        masks.append(mask);save(f'aperture-{key}.png',mask)
        marked=Image.fromarray(np.uint8(frame*255));d=ImageDraw.Draw(marked)
        for side in ['L','R']:
            pts=alignments[key][side]['target_points']
            for x,y in pts:d.ellipse((x-4,y-4,x+4,y+4),outline=(0,180,220),width=2)
        marked.save(OUT/f'aligned-{key}.png')
    save('eyelid-atlas.png',np.concatenate(frames,axis=1));save('aperture-atlas.png',np.concatenate(masks,axis=1))
    source=np.array(Image.open(OUT/'generated/iris.png').convert('RGBA').resize((w,h),Image.Resampling.LANCZOS),float)/255
    iris=np.zeros((h,w,4));ir=reg['iris'];diam=ir['target_diameter'];scale=ir['source_diameters'][0]/diam
    for center,target in zip(ir['source_centers'],ir['target_centers']):
        p=sample(source,(xx-target[0])*scale+center[0],(yy-target[1])*scale+center[1]);p*=((xx-target[0])**2+(yy-target[1])**2<(diam/2+2)**2)[:,:,None]
        iris+=p
    iris=np.clip(iris,0,1);save('iris-layer.png',iris);Image.open(OUT/'iris-layer.png').save(DESIGN/'eyes-iris.png')
    write('registration.json',alignments)
    # Measure an allowed control rectangle before an iris disappears, preserving >=55%
    # of its area. Physical containment is independently enforced by the fixed mask.
    ranges={};alpha=iris[:,:,3]
    for direction,axis,sign in [('left','x',-1),('right','x',1),('up','y',-1),('down','y',1)]:
        last=0
        for dist in range(1,65):
            dx=dist*sign if axis=='x' else 0;dy=dist*sign if axis=='y' else 0
            moved=sample(iris,xx-dx,yy-dy)[:,:,3];ratios=[]
            for cx in [360,656]:
                roi=abs(xx-cx)<110;ratios.append(float((moved*masks[0]*roi).sum()/max((alpha*roi).sum(),1)))
            if min(ratios)<.55:break
            last=dist
        ranges[direction]={'pixels':last,'measured_visible_55pct_limit_pixels':last,'camera_uv':last/w,'face_mm':last/(1024*1177/400)*1000,'criterion':'both irises retain >=55% of alpha area; remaining alpha is clipped at fixed aperture'}
    # A slightly smaller operational range is robust at combined horizontal/vertical limits.
    ranges={k:{**v,'pixels':min(v['pixels'],18 if k in ['left','right'] else 10)} for k,v in ranges.items()}
    for v in ranges.values():v['camera_uv']=v['pixels']/w;v['face_mm']=v['pixels']/(1024*1177/400)*1000
    write('gaze-ranges.json',ranges)
    leakage=[]
    for key,mask in zip(['open','half','closed'],masks):
        for dx in [-ranges['left']['pixels'],0,ranges['right']['pixels']]:
            for dy in [-ranges['up']['pixels'],0,ranges['down']['pixels']]:
                a=sample(iris,xx-dx,yy-dy)[:,:,3]*mask
                ratios=[float((a*(abs(xx-cx)<110)).sum()/max((alpha*(abs(xx-cx)<110)).sum(),1)) for cx in [360,656]]
                leakage.append({'frame':key,'dx':dx,'dy':dy,'outside_aperture_pixels':int(((a>.01)&(mask==0)).sum()),'visible_iris_area_fractions':ratios})
    outside=patch==0
    write('image-verification.json',{'outside_eye_patch_max_rgb_difference':max(float(abs(f-ref)[outside].max()) for f in frames),'closed_mask_nonzero_pixels':int((masks[2]>0).sum()),'gaze_tests':leakage,'iris_alpha_nonzero_pixels':int((iris[:,:,3]>0).sum()),'raw_generated_size':[1254,1254],'registered_size':[1024,1024],'registration_annotation_uncertainty_px':2})
    # A compact sheet shows raw generated coordinates, landmarks, and the accepted result.
    sheet=Image.new('RGB',(1200,800),'#eee9e1');d=ImageDraw.Draw(sheet)
    for col,key in enumerate(['open','half','closed']):
        for row,n in enumerate([OUT/'generated'/f'{key}.png',OUT/f'aligned-{key}.png']):
            im=Image.open(n).convert('RGB').resize((380,380));sheet.paste(im,(col*400,row*400+20));d.text((col*400+8,row*400+4),f'{key}: '+('generated' if row==0 else 'registered / cyan landmarks'),fill='#222222')
    sheet.save(OUT/'registration.png')
    log('2-4: 目頭・目尻・まぶた上端で各眼をアフィン位置合わせ。生成した肌は破棄。既存の肌を周囲から補完し全3コマに共用。投影UVの3コマアトラスと白黒開口マスク、透明黒目を保存。')

if PHASE=='assets':assets()

def pasted(sheet,path,box,crop=None):
    im=Image.open(path).convert('RGBA')
    if crop:im=im.crop(crop)
    im=im.resize((box[2],box[3]),Image.Resampling.LANCZOS);bg=Image.new('RGBA',im.size,(239,235,228,255));bg.alpha_composite(im);sheet.paste(bg.convert('RGB'),(box[0],box[1]))

def report():
    tags=['open','half','closed','left','right','up','down'];sheet=Image.new('RGB',(2240,920),'#efece5');d=ImageDraw.Draw(sheet)
    for row,a in enumerate([0,25]):
        for col,k in enumerate(tags):
            x=col*320;y=row*450;d.text((x+8,y+6),f'{k} / {a} deg',fill='#222')
            pasted(sheet,OUT/f'eyes-{k}-{a}.png',(x,y+25,320,320))
            pasted(sheet,OUT/f'eyes-{k}-{a}.png',(x,y+350,320,93),(80,250,580,395))
    sheet.save(OUT/'eyes-frames.png')
    sheet=Image.new('RGB',(2048,550),'#efece5');d=ImageDraw.Draw(sheet)
    for col,(title,path) in enumerate([('Front',OUT/'glasses-0.png'),('35 deg',OUT/'glasses-35.png'),('Side',OUT/'glasses-90.png'),('v4 design',OUT/'v4-face.png')]):
        d.text((col*512+12,8),title,fill='#222');pasted(sheet,path,(col*512,30,512,512))
    sheet.save(OUT/'glasses.png')
    sheet=Image.new('RGB',(1920,680),'#efece5');d=ImageDraw.Draw(sheet)
    for col,(tag,title) in enumerate([('rest','Standing / open'),('left','Neck left 25 deg / gaze left'),('closed','Closed')]):
        d.text((col*640+12,7),title,fill='#222');pasted(sheet,OUT/f'demo-{tag}.png',(col*640,30,640,400));pasted(sheet,OUT/f'demo-{tag}.png',(col*640+110,450,420,210),(510,95,760,220))
    sheet.save(OUT/'demo-eyes.png')
    # Directly compare the fixed camera's pixels outside the true eye footprint.
    a=rgb(OUT/'eyes-open-0.png');frame_changes={}
    yy,xx=np.indices(a.shape[:2]);sx=xx/768*1024;sy=yy/768*1024
    # Broader than the generated feature but excludes hair, nose and skin beyond eye surroundings.
    eye_roi=(((sx-360)/110)**2+((sy-410)/85)**2<1)|(((sx-656)/110)**2+((sy-410)/85)**2<1)
    for tag in ['half','closed']:
        b=rgb(OUT/f'eyes-{tag}-0.png');diff=abs(a-b);frame_changes[tag]={'outside_eye_max_8bit':float(diff[~eye_roi].max()*255),'outside_eye_changed_pixels_gt_1':int((np.max(diff,2)[~eye_roi]>1/255+1e-6).sum())}
    write('render-verification.json',{'fixed_unlit_camera_outside_eye_difference':frame_changes})
    glasses=json.loads((OUT/'glasses-metrics.json').read_text());images=json.loads((OUT/'image-verification.json').read_text());gaze=json.loads((OUT/'gaze-ranges.json').read_text())
    metrics={'stage':'eyes','input':'color/character-color.blend','output':'character-eyes.blend','iris_movement':{'coordinate_system':'camera UV, visible displacement; +x=image right, +y=up; shader samples texture with negative offset','ranges':gaze,'enforcement':'binary iris alpha multiplied by the frame-specific fixed aperture; 1px eroded aperture protects lid line','qualification':'operational rectangle, not an unbounded maximum of the masked shader; >=55% visible iris area on both eyes in single-axis scan, capped at 18px horizontal /10px vertical for toy gaze'},'glasses_triangles':glasses['glasses_triangles'],'total_triangles':glasses['total_triangles'],'triangle_budget':65000,'glasses':glasses,'image_verification':images,'render_verification':frame_changes,'assumptions':['既存の仮骨を工程9でも使い、最終の骨への置換は後工程で行う。','視線の左右は画面の左右。UVは正面投影画像の正規化座標。mmは現在のモデル単位（m）から換算し、実在人物の寸法ではない。','開口マスクで虹彩をまぶたの下へ隠すことを許す。視線の範囲は両眼で虹彩の55%以上が残る範囲から保守的に制限する。','design-landmarks.jsonには眼鏡の対応点がないため、既存の目の対応点に加えてv4の縁を目視で注記した（許容1.5px）。','工程8で承認済みの照明とAgXを継承し、最終の色・照明調整とWebのUV制御は工程11〜12で行う。'],'limitations':['画像生成で描かれた目はv4に近づけた素材であり、原画の線や黒目の微細な描写を完全複製したものではない。','照明付きの淡い色と髪の凹凸は工程8からの継承。今回の形状変更の対象外。','閉眼時には元の顔の目周辺の浅いくぼみが残る。元の黒目色と焼いた法線は除いたが、頂点とカスタム法線は保持している。','汎用GLB単体の視線アニメーションは作らない。Blenderではリグのカスタムプロパティ、Webでは別々のUV制御が必要。']}
    if (OUT/'surface-ranges.json').exists():metrics['iris_movement']['surface_mm']=json.loads((OUT/'surface-ranges.json').read_text())
    write('metrics.json',metrics)
    log('検証画像3枚と生成位置合わせの比較を保存。照明なしの3コマで目周辺外の画素差を測定。')

if PHASE=='report':report()
