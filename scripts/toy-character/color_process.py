"""Non-Blender stage-8 masks, calibrated intrinsics, UV raster, and honest metrics.

Reference masks and fixed sample patches are annotated in the original 1254px
coordinates. No optical flow, image warping, shape fitting or new UVs are used.
"""
import sys,json,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import distance_transform_edt,gaussian_filter,map_coordinates
from skimage.color import rgb2lab,lab2rgb,deltaE_ciede2000
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character'
OUT=Path(sys.argv[1])
N=2048
LANDMARKS=json.loads((WORK/'fidelity/design-landmarks.json').read_text())['points']
IMAGE_CENTER_X=LANDMARKS['mouth_center'][0]
PIXELS_PER_METER=1213-LANDMARKS['crown'][1]
NAMES={1:'skin',2:'hair',3:'sleeve_image_left',4:'sleeve_image_right',5:'chest_burgundy',6:'chest_green',7:'chest_navy',8:'collar',9:'shoulder_straps',10:'pants_red',11:'pants_navy',12:'shoes',13:'backpack',14:'white_trim',15:'hardware'}
# Original midtone samples; independent of projected output and IID prediction.
PATCH={1:(625,323,6),2:(630,120,14),3:(422,551,10),4:(824,555,10),5:(581,474,10),6:(665,474,10),7:(575,613,10),8:(577,406,6),9:(517,434,5),10:(570,877,12),11:(493,908,8),12:(506,1152,8),13:(579,557,6),14:(565,785,5),15:(583,515,5)}
COLORS=np.array([[0,0,0],[235,173,135],[50,43,39],[40,80,131],[201,128,47],[120,29,48],[20,68,75],[21,43,70],[113,24,43],[108,155,159],[165,39,36],[25,45,70],[35,34,35],[109,151,151],[235,226,220],[113,117,116]],np.uint8)

def log(s):
    print('COLOR',s,flush=True)
    with (OUT/'log.md').open('a') as f:f.write('\n'+time.strftime('%Y-%m-%d %H:%M:%S')+' '+s+'\n')

def write(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def load(name):return np.array(Image.open(name).convert('RGB'),np.float32)/255

def image(name,a):Image.fromarray(np.uint8(np.clip(a,0,1)*255+.5)).save(OUT/name)

def poly(mask,pts,k):
    im=Image.fromarray(mask);ImageDraw.Draw(im).polygon(pts,fill=k);mask[:]=np.array(im)

def masks(view,rgb,iid):
    m=np.zeros(rgb.shape[:2],np.uint8);y,x=np.indices(m.shape)
    # Surface categories describe the image, not arbitrary UV islands.
    if view in ['front','noglasses','back']:
        back=view=='back'
        poly(m,[(476,776),(775,776),(808,1045),(775,1100),(680,1100),(625,850),(579,1100),(471,1100),(438,1045)],10)
        poly(m,[(478,791),(523,798),(503,1065),(482,1091),(454,1072),(441,1044)],11)
        poly(m,[(730,796),(767,791),(802,1049),(780,1086),(743,1075)],11)
        for a,b in [(442,578),(675,804)]:poly(m,[(a+18,1082),(b-15,1082),(b,1208),(a,1214),(a,1141)],12)
        poly(m,[(542,405),(700,403),(769,459),(777,746),(760,779),(484,778),(469,745),(475,464)],7)
        poly(m,[(482,443),(551,401),(699,402),(767,447),(744,573),(501,573)],5)
        if not back:poly(m,[(632,432),(695,420),(715,566),(635,572)],6)
        poly(m,[(554,378),(693,379),(692,426),(641,450),(610,450),(554,429)],8)
        left=[(463,465),(502,507),(491,560),(433,655),(398,705),(337,670),(337,628),(386,554)]
        right=[(782,467),(746,511),(761,567),(817,663),(849,707),(913,670),(910,628),(866,552)]
        poly(m,left,4 if back else 3);poly(m,right,3 if back else 4)
        # Red shoulder panels remain red; sleeve ground colors must not consume them.
        poly(m,[(464,463),(498,430),(532,457),(504,522),(486,513)],5)
        poly(m,[(748,434),(784,464),(762,514),(743,523),(718,459)],5)
        poly(m,[(337,664),(399,699),(385,714),(329,679)],14);poly(m,[(850,697),(910,665),(919,681),(863,715)],14)
        poly(m,[(470,755),(776,755),(774,798),(648,808),(471,793)],14)
        for pts in [[(338,679),(386,708),(354,762),(327,791),(288,790),(288,741)],[(866,708),(914,681),(949,735),(961,786),(931,791),(895,765)]]:poly(m,pts,1)
        if not back:
            poly(m,[(579,385),(669,385),(654,423),(619,425)],1)
            for pts in [[(506,413),(543,402),(564,449),(563,506),(544,565),(521,608),(489,592),(506,532)],[(698,403),(739,416),(748,495),(748,554),(765,597),(733,610),(708,561),(694,494)]]:poly(m,pts,9)
            poly(m,[(550,507),(704,507),(704,526),(546,526)],15)
            poly(m,[(620,441),(638,441),(638,758),(620,758)],15)
        else:
            poly(m,[(505,425),(546,405),(582,467),(548,499)],9);poly(m,[(697,406),(738,421),(709,498),(676,468)],9)
            poly(m,[(619,430),(662,436),(695,459),(731,490),(751,554),(752,707),(737,749),(681,756),(555,755),(515,734),(504,680),(508,558),(526,496),(562,466)],13)
        pants=np.isin(m,[10,11]);blue=(rgb[:,:,2]>rgb[:,:,0]*.9)&(rgb[:,:,0]<.5);m[pants&blue]=11;m[pants&~blue]=10
        # Hair and skin are selected within silhouettes by image color, which
        # excludes the background and prevents hair pixels entering the skin mask.
        area=(y<394)&(x>420)&(x<823)
        dark=(iid.max(2)<.57)&area
        m[dark]=2
        if not back:
            skin=area&(y>150)&(rgb[:,:,0]>rgb[:,:,1]*1.12)&(rgb[:,:,1]>rgb[:,:,2]*1.08)&(rgb[:,:,0]>.48)
            m[skin]=1
            # Eyeballs, eyelids and brows are left for stage 9; no reference eye
            # colors are assigned to skin in this stage.
            for cx in [567,685]:m[((x-cx)/30)**2+((y-260)/23)**2<1]=0
    else:
        area=(y<396)&(x>410)&(x<800)
        m[area&(iid.max(2)<.57)]=2
        m[area&(rgb[:,:,0]>rgb[:,:,1]*1.16)&(rgb[:,:,1]>rgb[:,:,2]*1.12)&(rgb[:,:,0]>.5)]=1
        # Side drawing includes spectacles: reject a band, not just dark frames.
        m[(y>245)&(y<282)&(x>675)]=0
        poly(m,[(455,461),(483,442),(534,450),(567,494),(568,690),(542,740),(463,750),(407,718),(389,654),(398,536),(418,482)],13)
    gold=np.isin(m,[5,6,7,8])&(rgb[:,:,0]>.55)&(rgb[:,:,0]>rgb[:,:,1]*1.25)&(rgb[:,:,1]>rgb[:,:,2]*1.3)
    m[gold]=15
    return m

def albedo():
    front=load(ROOT/'docs/toy-character/design/v4.png');back=load(ROOT/'docs/toy-character/design/turnaround-back.png')
    targets={}
    for k,(x,y,r) in PATCH.items():
        source=back if k==13 else front;targets[k]=np.median(rgb2lab(source[y-r:y+r+1,x-r:x+r+1]).reshape(-1,3),axis=0)
    write('reference-patches.json',{NAMES[k]:{'center_radius_px':list(PATCH[k]),'target_Lab':v.tolist()} for k,v in targets.items()})
    for view in ['front','back','side','noglasses']:
        path=ROOT/'docs/toy-character/design'/({'front':'v4.png','back':'turnaround-back.png','side':'turnaround-side.png'}.get(view,'v4.png')) if view!='noglasses' else WORK/'img3d/input/v4-noglasses.png'
        rgb=load(path);iid=np.load(OUT/f'{view}-iid.npz')['prediction'][0];m=masks(view,rgb,iid);lab=rgb2lab(rgb);ilab=rgb2lab(iid);out=rgb.copy();high=lab[:,:,0]-gaussian_filter(lab[:,:,0],2)
        for k in NAMES:
            mask=m==k
            if not mask.any():continue
            target=targets[k];q=lab[mask];iq=ilab[mask];mid=np.median(q,axis=0)
            new=np.empty_like(q)
            # IID supplies broad illumination removal, source chroma retains
            # mustard/green correctly where the estimator invents orange/blue.
            new[:,0]=target[0]+.12*(iq[:,0]-np.median(iq[:,0]))+.25*high[mask]
            new[:,1:]=target[1:]+.22*(q[:,1:]-mid[1:])
            if k in [9,13,15]:
                # Keep animal patterns, fittings and piping at source resolution.
                ground=mask&(rgb[:,:,1]>rgb[:,:,0]*1.05)&(rgb[:,:,2]>rgb[:,:,0]*.95)
                ground_mid=np.median(lab[ground],axis=0) if ground.any() else mid
                delta=q-mid;new[:,0]=target[0]+.65*delta[:,0]-.65*(gaussian_filter(lab[:,:,0],18)[mask]-np.median(gaussian_filter(lab[:,:,0],18)[mask]))+.15*(iq[:,0]-np.median(iq[:,0]));new[:,1:]=q[:,1:]+target[1:]-ground_mid[1:]
                if k==13:
                    yy,xx=np.indices(m.shape);brown=mask&(yy>700)&(rgb[:,:,0]>rgb[:,:,1]*1.15)&(rgb[:,:,1]>rgb[:,:,2]*1.15)
                    br=brown[mask]
                    if br.any():new[br]=q[br];new[br,0]=np.median(q[br,0])+.12*(q[br,0]-np.median(q[br,0]))
            if k==15:
                # Grey webbing, blue buckle and gold zips share a geometric
                # part, but must not be calibrated to a single median pigment.
                new=q.copy();new[:,0]=np.clip(new[:,0],25,90)
            if k==1:
                new[:]=target
                yy,xx=np.indices(m.shape);cheek=np.maximum(np.exp(-(((xx-538)/31)**2+((yy-321)/24)**2)*1.6),np.exp(-(((xx-714)/31)**2+((yy-321)/24)**2)*1.6)) if view in ['front','noglasses'] else np.zeros_like(xx,float)
                new[:,1]+=9*cheek[mask];new[:,2]+=2*cheek[mask];new[:,0]-=1.5*cheek[mask]
                # Original lip chroma and contour survive; nose/under-chin shadows
                # have no pigment mask and therefore become the base skin color.
                if view in ['front','noglasses']:
                    lip=(((xx-627)/39)**2+((yy-342)/11)**2<1)&mask
                    where=lip[mask];new[where]=target+np.array([-3,12,8])+.25*(q[where]-np.median(q[where],axis=0))
            if k==2:new[:,0]=target[0]+.06*(q[:,0]-mid[0]);new[:,1:]=target[1:]+.1*(q[:,1:]-mid[1:])
            out[mask]=lab2rgb(new.reshape(-1,1,3)).reshape(-1,3)
        image(f'{view}-albedo.png',out);Image.fromarray(m).save(OUT/f'{view}-mask.png');Image.fromarray(COLORS[m]).save(OUT/f'{view}-mask-color.png')
    # The edited image supplies only skin around the eyes; clothing, hair and
    # all other frontal pigments still come from the original v4 drawing.
    front=load(OUT/'front-albedo.png');ng=load(OUT/'noglasses-albedo.png');m=np.array(Image.open(OUT/'front-mask.png'));nm=np.array(Image.open(OUT/'noglasses-mask.png'));yy,xx=np.indices(m.shape)
    eye_skin=(yy>211)&(yy<296)&(xx>492)&(xx<754)&(nm==1)
    front[eye_skin]=ng[eye_skin];m[eye_skin]=1;image('front-albedo.png',front);Image.fromarray(m).save(OUT/'front-mask.png');Image.fromarray(COLORS[m]).save(OUT/'front-mask-color.png');Image.fromarray(np.uint8(eye_skin)*255).save(OUT/'front-noglasses-skin-mask.png')
    write('mask-legend.json',{str(k):v for k,v in NAMES.items()})
    log('albedo: Marigoldの広い陰影を除いた推定を部位別に原画の固定中間調パッチへ校正。肌は原画肌色＋頬・唇の色マスク、髪は低コントラスト化。動物柄は原画の色差と細部を保持。目周辺のみnoglasses。')

def raster(body_size=8192):
    global N
    d=np.load(OUT/'mesh.npz')
    for atlas,indices in [('body',[0,1]),('hair',[2])]:
        N=body_size if atlas=='body' else 2048
        P=[];NN=[];PART=[];IDX=[];AREA=[];FACE=[];old=load(OUT/f'baked-{atlas}.png');RGB=[]
        for oi in indices:
            v=d[f'p{oi}'];f=d[f'f{oi}'];uv=d[f'uv{oi}'];cn=d[f'n{oi}'];part=d[f'part{oi}']
            for fi,t in enumerate(uv):
                a=t*np.array([N,-N])+np.array([0,N]);lo=np.maximum(np.ceil(a.min(0)-.5).astype(int),0);hi=np.minimum(np.floor(a.max(0)-.5).astype(int),N-1)
                if np.any(hi<lo):continue
                xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));points=np.c_[xx.ravel()+.5,yy.ravel()+.5];mat=np.c_[a[1]-a[0],a[2]-a[0]]
                if abs(np.linalg.det(mat))<1e-10:continue
                b=(points-a[0])@np.linalg.inv(mat).T;b=np.c_[1-b.sum(1),b];inside=(b>=-1e-7).all(1)
                if not inside.any():continue
                b=b[inside];x=xx.ravel()[inside];y=yy.ravel()[inside];pos=b@v[f[fi]];normal=np.einsum('ni,ij->nj',b,cn[fi]);normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-10)
                if oi==1:
                    # The inherited head's custom normals mostly face inward.
                    # Orient only the projection test; saved normals stay exact.
                    inward=np.sum(normal*(pos-np.array([-.004,-.02,.84])),axis=1)<0;normal[inward]*=-1
                P.append(pos);NN.append(normal);PART.append(np.full(len(b),part[fi] if oi==0 else 0 if oi==1 else 1,int));IDX.append(y*N+x);RGB.append(old[np.minimum((y+.5)*len(old)/N,len(old)-1).astype(int),np.minimum((x+.5)*len(old)/N,len(old)-1).astype(int)]);AREA.append(np.full(len(b),np.linalg.norm(np.cross(v[f[fi,1]]-v[f[fi,0]],v[f[fi,2]]-v[f[fi,0]]))*.5/len(b)));FACE.append(np.full(len(b),oi*1000000+fi,int))
        fields={'p':np.concatenate(P).astype(np.float32),'n':np.concatenate(NN).astype(np.float32),'part':np.concatenate(PART),'idx':np.concatenate(IDX),'old':np.concatenate(RGB),'area':np.concatenate(AREA),'face':np.concatenate(FACE)}
        idx=fields['idx'];tx=(idx%N+.5)*len(old)/N-.5;ty=(idx//N+.5)*len(old)/N-.5
        fields['old']=np.stack([map_coordinates(old[:,:,c],[ty,tx],order=1,mode='nearest') for c in range(3)],axis=1)
        old=fields['old'];p=fields['p'];lab=fields['part']
        scalp=(lab==0)&(old.mean(1)<.48)&((p[:,2]>.85)|(abs(p[:,0])>.115)|(p[:,1]>.025))
        fields['part'][scalp]=1;fields['size']=N
        np.savez_compressed(OUT/f'{atlas}-samples.npz',**fields);log(atlas+' UV画素 '+str(len(fields['p']))+'。画像サイズ '+str(N)+'px。頭は内向きの既存カスタム法線を投影の向き判定でだけ外向きに解釈し、保存する法線は変更しない。')

def projection_xy(p,view):
    return np.c_[IMAGE_CENTER_X+PIXELS_PER_METER*p[:,0]*(1 if view=='front' else -1),1213-PIXELS_PER_METER*p[:,2]] if view!='side' else np.c_[572-1177*p[:,1],1213-PIXELS_PER_METER*p[:,2]]

def smoothstep(x):x=np.clip(x,0,1);return x*x*(3-2*x)

def allowed(part,k,p):
    clothing=np.isin(part,[3,4,5,9])&np.isin(k,[3,4,5,6,7,8,9,14,15])
    neck=(part==2)&np.isin(k,[1,8])
    return clothing|neck|((part==0)&(k==1))|((part==1)&(k==2))|((part==2)&(k==1))|((part==3)&np.isin(k,[5,6,7,8,14,15]))|((part==4)&np.isin(k,[4,5,14]))|((part==5)&np.isin(k,[3,5,14]))|((part==6)&(k==1))|((part==7)&(k==1))|((part==8)&(k==13))|((part==9)&np.isin(k,[9,15]))|((part==10)&np.isin(k,[10,11,12,14]))

def project():
    global N
    visibility=np.load(OUT/'visibility.npz');targets0=json.loads((OUT/'reference-patches.json').read_text());targets={k:np.array(targets0[v]['target_Lab']) for k,v in NAMES.items()};results={};parts_summary={};transform_rows={};metric_samples={k:[] for k in NAMES};metric_weights={k:[] for k in NAMES}
    for atlas in ['body','hair']:
        d=np.load(OUT/f'{atlas}-samples.npz');N=int(d['size']);p=d['p'];n=d['n'];part=d['part'];old=d['old'];area=d['area'];idx=d['idx'];count=len(p);weights=np.zeros(count);chosen=np.full(count,-1,int);source=np.zeros((count,3));surface=np.zeros(count,int)
        for vi,(view,dr) in enumerate([('front',(0,-1,0)),('back',(0,1,0)),('side',(-1,0,0))]):
            xy=projection_xy(p,view);xx=np.clip(np.rint(xy[:,0]).astype(int),0,1253);yy=np.clip(np.rint(xy[:,1]).astype(int),0,1253);m=np.array(Image.open(OUT/f'{view}-mask.png'));k=m[yy,xx];valid=(xy[:,0]>=0)&(xy[:,0]<1254)&(xy[:,1]>=0)&(xy[:,1]<1254)&visibility[atlas][vi]&allowed(part,k,p)
            if view=='side':valid&=np.isin(part,[0,1,8])
            dist=np.zeros(m.shape,float)
            for key in np.unique(k[valid]):dist[m==key]=distance_transform_edt(m==key)[m==key]
            w=smoothstep((n@np.array(dr)-.35)/.4)*smoothstep(dist[yy,xx]/(8*1254/1024));w*=valid
            # Priority, rather than average, avoids doubled faces and animals.
            take=(weights==0)&(w>0)
            color=load(OUT/f'{view}-albedo.png');src=color[yy,xx]
            if view=='front':
                ng=load(OUT/'noglasses-albedo.png');nm=np.array(Image.open(OUT/'noglasses-mask.png'));eye=(yy>211)&(yy<296)&(xx>492)&(xx<754)&(part==0)&(nm[yy,xx]==1);src[eye]=ng[yy[eye],xx[eye]]
            source[take]=src[take];weights[take]=w[take];chosen[take]=vi;surface[take]=k[take]
        # Unobserved semantic identity uses position plus original pigment class;
        # this does not create or move a geometric surface.
        fallback=np.zeros(count,int);fallback[np.isin(part,[0,2,6,7])]=1;fallback[part==1]=2;fallback[part==4]=4;fallback[part==5]=3;fallback[part==8]=13;fallback[part==9]=9
        torso=part==3;fallback[torso]=7;fallback[torso&(p[:,2]>.544)]=5;fallback[torso&(p[:,2]>.544)&(p[:,0]>.005)&(p[:,1]<0)]=6;fallback[torso&(p[:,2]>.647)]=8;fallback[torso&(p[:,2]<.382)]=14
        fallback[np.isin(part,[4,5])&(p[:,2]>.615)]=5
        fallback[np.isin(part,[4,5])&(p[:,2]<.438)&(old.min(1)>.55)]=14
        legs=part==10;fallback[legs]=10;fallback[legs&(p[:,2]<.103)]=12;fallback[legs&(p[:,2]>=.103)&(old[:,2]>old[:,0]*.88)]=11
        olab=rgb2lab(old);neutral_white=(olab[:,0]>80)&(np.linalg.norm(olab[:,1:],axis=1)<17)
        fallback[np.isin(part,[2,3,4,5,9,10])&neutral_white]=14
        # Face labels in the inherited bake have visibly jagged boundaries.
        # Annotate pigment regions per texel from the fixed reference masks,
        # including unobserved cloth. Only the fitted color transform is used
        # there; source pixels still require first-hit visibility and facing.
        for view,front_side in [('back',False),('front',True)]:
            xy=projection_xy(p,view);xx=np.clip(np.rint(xy[:,0]).astype(int),0,1253);yy=np.clip(np.rint(xy[:,1]).astype(int),0,1253)
            mask=np.array(Image.open(OUT/f'{view}-mask.png'));k=mask[yy,xx]
            side=(p[:,1]<=0) if front_side else (p[:,1]>0)
            cloth=np.isin(part,[2,3,4,5,9,10])&side&np.isin(k,[3,4,5,6,7,8,9,14,15])
            fallback[cloth]=k[cloth]
        pocket=(part==3)&(p[:,2]>.417)&(p[:,2]<.505)&(abs(p[:,0])>.055)&(olab[:,1]>20)&(olab[:,2]>10)
        fallback[pocket]=15
        # A source semantic label wins only where projection is genuinely visible.
        fallback[weights>0]=surface[weights>0];lab=rgb2lab(old);converted=lab.copy();transforms={}
        for k in np.unique(fallback):
            sel=fallback==k;paired=sel&(weights>.75);base=np.median(lab[paired],axis=0) if paired.sum()>30 else np.median(lab[sel],axis=0);target=np.median(rgb2lab(source[paired]),axis=0) if paired.sum()>30 else targets[int(k)]
            # Fit a color transform on actually projected correspondences. A
            # bounded slope suppresses inherited illumination and prevents an
            # unseen red patch becoming a saturated cyan seam on the backpack.
            A=np.zeros((3,3));center=target.copy()
            if paired.sum()>30:
                X=lab[paired]-base;Y=rgb2lab(source[paired])-target
                A=np.linalg.solve(X.T@X+np.eye(3)*len(X)*4,X.T@Y)
                U,S,V=np.linalg.svd(A);limit=.12 if k in [9,13,15] else .05;A=(U*np.minimum(S,limit))@V
                if k==1:A[:]=0
            converted[sel]=target+(lab[sel]-base)@A
            transforms[str(k)]={'name':NAMES[int(k)],'fit_pairs':int(paired.sum()),'baked_center_Lab':base.tolist(),'projected_center_Lab':target.tolist(),'matrix':A.tolist(),'offset':(target-base@A).tolist(),'fit':'ridge least squares, singular-value bounded to remove baked shading'}
        # Existing eye/brow paint belongs to stage 9. Retain those exact UV pixels.
        xy_front=projection_xy(p,'front');xxf,yyf=xy_front.T
        reserved=(part==0)&((((xxf-567)/32)**2+((yyf-260)/24)**2<1)|(((xxf-685)/32)**2+((yyf-260)/24)**2<1)|((yyf>207)&(yyf<229)&(xxf>519)&(xxf<733)&(lab[:,0]<40)))
        weights[reserved]=0;chosen[reserved]=-1
        hardware=fallback==15
        pigment=np.where(np.linalg.norm(lab[:,1:],axis=1)<17,0,np.where(lab[:,2]<-12,1,2))
        for pigment_id in [0,1,2]:
            sel=hardware&(pigment==pigment_id);paired=sel&(weights>.7)
            if paired.sum()>20:
                base=np.median(lab[paired],axis=0);target=np.median(rgb2lab(source[paired]),axis=0);converted[sel]=target+(lab[sel]-base)*.03
                transforms['15_'+str(pigment_id)]={'fit_pairs':int(paired.sum()),'baked_center_Lab':base.tolist(),'projected_center_Lab':target.tolist(),'diagonal_gain':[.03,.03,.03],'offset':(target-.03*base).tolist(),'submaterial':['neutral webbing','blue buckle','gold zip and pockets'][pigment_id]}
        transformed=np.clip(lab2rgb(converted.reshape(-1,1,3)).reshape(-1,3),0,1)
        # Blend in linear light so material borders do not form dark halos.
        def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
        lin=linear(transformed)*(1-weights[:,None])+linear(source)*weights[:,None];final=np.where(lin<=.0031308,lin*12.92,1.055*lin**(1/2.4)-.055)
        final[reserved]=old[reserved]
        tex=np.array(Image.open(OUT/f'baked-{atlas}.png').convert('RGB').resize((N,N),Image.Resampling.BILINEAR),np.float32)/255;flat=tex.reshape(-1,3);flat[idx]=final;occupied=np.zeros(N*N,bool);occupied[idx]=True
        # Copy the final colors into UV gutters; a nearest texel extends each
        # island without mixing another material's colors into its boundary.
        _,near=distance_transform_edt(~occupied.reshape(N,N),return_indices=True);tex=tex[near[0],near[1]]
        image(f'basecolor-{atlas}.png',tex)
        trust=np.zeros(N*N);trust[idx]=weights;image(f'projection-{atlas}.png',trust.reshape(N,N));labels=np.zeros(N*N,int);labels[idx]=fallback;Image.fromarray(COLORS[labels.reshape(N,N)]).save(OUT/f'parts-{atlas}.png')
        np.savez_compressed(OUT/f'{atlas}-projection.npz',weights=weights,chosen=chosen,surface=fallback,final=final,source=source,transformed=transformed,reserved=reserved)
        transform_rows[atlas]=transforms
        for part_id in np.unique(part):
            selected=part==part_id;key=f'{atlas}:{int(part_id)}';total=area[selected].sum();parts_summary[key]={'surface_area_m2':float(total),'projected_pct':float(100*area[selected&(weights>0)].sum()/total),'fully_projected_pct':float(100*area[selected&(weights>=.999)].sum()/total),'blended_pct':float(100*area[selected&(weights>0)&(weights<.999)].sum()/total),'color_matched_only_pct':float(100*area[selected&(weights==0)].sum()/total),'by_view_pct':{v:float(100*area[selected&(chosen==i)].sum()/total) for i,v in enumerate(['front','back','side'])}}
        # Color gate includes the boundary blend, with >0.05 source confidence.
        # These are corresponding albedo regions, never lit design RGB.
        for k in NAMES:
            sel=(fallback==k)&(weights>.05)
            if sel.any():metric_samples[k].append(deltaE_ciede2000(rgb2lab(final[sel]),rgb2lab(source[sel])));metric_weights[k].append(area[sel])
    for k in NAMES:
        if not metric_samples[k]:continue
        vals=np.concatenate(metric_samples[k]);w=np.concatenate(metric_weights[k]);order=np.argsort(vals);cdf=np.cumsum(w[order])/w.sum();median=float(np.interp(.5,cdf,vals[order]));p95=float(np.interp(.95,cdf,vals[order]));results[NAMES[k]]={'median':median,'p95':p95,'samples':len(vals),'pass':median<=3 and p95<=6}
    write('color-transforms.json',transform_rows);write('metrics.json',{'color_difference':results,'projection_by_part':parts_summary,'method':{'color_metric':'CIEDE2000, D65 sRGB to Lab; world-area weighted UV samples; corresponding calibrated source albedo and final texture; includes projection blend with confidence >0.05','unobserved_color_difference':'Not measurable against absent views. Not included in color pass; coverage and transformed-only percentages reported separately.','projection_percent':'world surface area; projected means weight>0; all percentages include hidden/internal surfaces in denominator','view_priority':['front','back','side'],'normal_fade':[.35,.75],'edge_fade_input1024_px':8,'visibility_tolerance_m':.00002,'no_automatic_image_alignment':True,'backpack_geometry_preserved':True},'color_pass':all(q['pass'] for q in results.values()),'visual_pass':None})
    log('投影・未観測色合わせ完了。部位別の面積割合をmetrics.json、対応色から求めたLab対角変換をcolor-transforms.jsonへ保存。色差は陰影付き原画でなく校正済みalbedoとの対応領域で測定。')

FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
def sheet(name,rows,width=500):
    panels=[]
    for row in rows:
        items=[]
        for label,path in row:
            im=Image.open(path).convert('RGBA');bg=Image.new('RGBA',im.size,'#eeeeee');bg.alpha_composite(im);im=bg.convert('RGB');im.thumbnail((width,width));cell=Image.new('RGB',(width,width+32),'white');cell.paste(im,((width-im.width)//2,32+(width-im.height)//2));ImageDraw.Draw(cell).text((8,8),label,fill='black',font=ImageFont.truetype(FONT,18));items.append(cell)
        panel=Image.new('RGB',(width*len(items),width+32),'white')
        for i,im in enumerate(items):panel.paste(im,(i*width,0))
        panels.append(panel)
    out=Image.new('RGB',(max(p.width for p in panels),sum(p.height for p in panels)),'white');y=0
    for p in panels:out.paste(p,(0,y));y+=p.height
    out.save(OUT/name)

def report():
    sheet('compare-design.png',[[(v+' design',ROOT/'docs/toy-character/design'/('v4.png' if v=='front' else 'turnaround-back.png')),(v+' unlit',OUT/f'{v}-unlit.png'),(v+' lit',OUT/f'{v}-lit.png')] for v in ['front','back']],600)
    # Crop only for contact sheets; original 1280x800 renders are retained.
    for p in ['rest','combo_left','neck_up10']:
        im=Image.open(OUT/f'demo-{p}.png');im.crop((330,0,950,800)).save(OUT/f'demo-crop-{p}.png')
    sheet('demo-color.png',[[('rest',OUT/'demo-crop-rest.png'),('neck left25 + torso left8',OUT/'demo-crop-combo_left.png'),('neck up10',OUT/'demo-crop-neck_up10.png')]],650)
    seams=['neck','ear-left','ear-right','hairline','cuff-left','cuff-right','strap-left','strap-right','backpack','backpack-side']
    sheet('seams.png',[[(name+' '+mode,OUT/f'seam-{name}-{mode}.png') for mode in ['unlit','lit']] for name in seams],450)
    sheet('albedo.png',[[(v+' Marigold raw',OUT/f'{v}-estimate-0.png'),(v+' calibrated albedo',OUT/f'{v}-albedo.png'),(v+' surface mask',OUT/f'{v}-mask-color.png')] for v in ['front','back']],600)
    sheet('relight.png',[[('light left',OUT/'relight--1.png'),('light right',OUT/'relight-1.png')]],650)
    log('比較画像4枚と再照明画像を保存。数値合格と見た目の合格は分けて記録する。')

if __name__=='__main__':globals()[sys.argv[2]]()
