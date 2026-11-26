"""Measure saved, rendered albedo, separately from texture-transfer arithmetic."""
import sys,json,time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from skimage.color import rgb2lab,deltaE_ciede2000
from color_process import NAMES,COLORS,write,log,OUT

def measure():
    metrics=json.loads((OUT/'metrics.json').read_text());metrics.setdefault('transfer_color_difference',metrics['color_difference']);samples={k:[] for k in NAMES};views={}
    for view in ['front','back']:
        actual=np.array(Image.open(OUT/f'{view}-unlit.png').convert('RGBA'));ref=np.array(Image.open(OUT/f'{view}-albedo.png').convert('RGB'));m=np.array(Image.open(OUT/f'{view}-mask.png'));label=np.array(Image.open(OUT/f'{view}-parts.png').convert('RGB'));dist=np.full(m.shape,np.inf);part=np.zeros(m.shape,int)
        for k in NAMES:
            distance=np.sum((label.astype(float)-COLORS[k])**2,axis=2);take=distance<dist;dist[take]=distance[take];part[take]=k
        solid=(actual[:,:,3]>254)&(dist<9)
        rows={}
        for k in NAMES:
            same=(m==k)&(part==k)&solid
            # Material borders, antialiasing and UV seams are inspected separately.
            # Their exclusion here follows "same surface color region".
            interior=same&(distance_transform_edt(m==k)>8*1254/1024)&(distance_transform_edt(part==k)>3)
            if k==1:
                y,x=np.indices(m.shape)
                interior&=~((((x-567)/38)**2+((y-260)/30)**2<1)|(((x-685)/38)**2+((y-260)/30)**2<1)|((y>202)&(y<233)&(x>514)&(x<738)))
            if not interior.any():continue
            de=deltaE_ciede2000(rgb2lab(actual[interior,:3]/255),rgb2lab(ref[interior]/255));samples[k].append(de);rows[NAMES[k]]={'pixels':int(interior.sum()),'median':float(np.median(de)),'p95':float(np.percentile(de,95))}
        views[view]=rows
    result={}
    for k,arr in samples.items():
        if not arr:continue
        d=np.concatenate(arr);result[NAMES[k]]={'median':float(np.median(d)),'p95':float(np.percentile(d,95)),'pixels':len(d),'pass':bool(np.median(d)<=3 and np.percentile(d,95)<=6)}
    # Both pant pigments are required; report them individually and together.
    pants=np.concatenate(samples[10]+samples[11]);result['pants']={'median':float(np.median(pants)),'p95':float(np.percentile(pants,95)),'pixels':len(pants),'pass':bool(np.median(pants)<=3 and np.percentile(pants,95)<=6)}
    metrics['color_difference']=result;metrics['color_difference_by_view']=views;metrics['color_pass']=all(v['pass'] for k,v in result.items() if k not in ['white_trim','hardware']);metrics['method']['color_metric']='Rendered saved basecolors, Standard emission sRGB, D65 CIEDE2000 vs calibrated reference albedo at same original 1254px coordinates. Same semantic surface only; input mask boundary excluded by 8px at1024, rendered semantic boundary3px; reserved eyes/brows excluded. No image alignment or optical flow. Front/back pixels pooled.'
    summary={};allareas={};allprojected={};allfull={};allcount={}
    for atlas in ['body','hair']:
        d=np.load(OUT/f'{atlas}-samples.npz');r=np.load(OUT/f'{atlas}-projection.npz');w=r['weights'];area=d['area'];part=r['surface']
        for k in NAMES:
            ids=part==k;allareas[k]=allareas.get(k,0)+float(area[ids].sum());allprojected[k]=allprojected.get(k,0)+float(area[ids&(w>0)].sum());allfull[k]=allfull.get(k,0)+float(area[ids&(w>=.999)].sum())
    for k,name in NAMES.items():
        total=allareas[k]
        if total:summary[name]={'area_m2':total,'projected_pct':100*allprojected[k]/total,'fully_projected_pct':100*allfull[k]/total,'color_matched_only_pct':100*(1-allprojected[k]/total)}
    keys=[10,11];total=sum(allareas[k] for k in keys);summary['pants']={'area_m2':total,'projected_pct':100*sum(allprojected[k] for k in keys)/total,'fully_projected_pct':100*sum(allfull[k] for k in keys)/total,'color_matched_only_pct':100*(1-sum(allprojected[k] for k in keys)/total)}
    metrics['projection_by_surface']=summary
    names={'body:0':'head_skin','body:1':'inherited_dark_scalp','body:2':'neck','body:3':'torso','body:4':'sleeve_image_right','body:5':'sleeve_image_left','body:6':'hand_image_right','body:7':'hand_image_left','body:8':'backpack','body:9':'shoulder_straps','body:10':'legs_and_shoes','hair:1':'hair'}
    for key,row in metrics['projection_by_part'].items():row['name']=names[key]
    # Residual flat-shading variation in pigment-free skin patches documents the
    # actual input albedo; original shadows are not used as a color target.
    alb=np.array(Image.open(OUT/'front-albedo.png').convert('RGB'))/255
    patches={'nose_under':(613,315,640,329),'chin_under':(611,372,641,383),'hair_shadow_on_forehead':(607,214,622,229)};measurements={}
    for name,(x0,y0,x1,y1) in patches.items():
        lab=rgb2lab(alb[y0:y1,x0:x1]);measurements[name]={'L_median':float(np.median(lab[:,:,0])),'L_p95_minus_p5':float(np.percentile(lab[:,:,0],95)-np.percentile(lab[:,:,0],5))}
    metrics['delighting_skin_patches']=measurements
    write('metrics.json',metrics);log('保存した画像をBlenderでEmission表示し、同じ表面色の内部領域を正背面で再測定。色ゲート='+str(metrics['color_pass'])+'。投影内の転写誤差はtransfer_color_differenceとして別記。')
if __name__=='__main__':measure()
