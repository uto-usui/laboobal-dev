"""Fixed scanlines: 10-90 color projection widths, fine variation and fold band RMS."""
import os,json,csv
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.optimize import isotonic_regression
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('TOY_EDGES_OUT',ROOT/'.work/toy-character/edges')).resolve()
# Coordinates are physical pixels in the 2880x1800 body capture. Parallel
# lines are measured separately: averaging images first would blur sloped edges.
LINES={
 'cuff_sleeve':[[450,780],[450,842]],
 'cuff_hand':[[450,843],[450,910]],
 'hem_navy':[[1200,1125],[1200,1210]],
 'pocket_navy':[[1020,800],[1100,800]],
}
# Flat interiors measure fine variation; separate sleeve regions measure folds.
# The chest rectangles stop above the buckle, which is a different color edge.
BOXES={'blue_sleeve':[760,210,880,360],'orange_sleeve':[1990,170,2110,320], 'red_chest':[1190,15,1340,100], 'blue_chest':[1550,15,1670,100], 'navy_chest':[1180,620,1340,900]}
FOLD_BOXES={'blue_sleeve':[610,330,820,540],'orange_sleeve':[2160,320,2310,510]}

def scan(rgb,p0,p1,offset):
 p0=np.array(p0,float);p1=np.array(p1,float);delta=p1-p0;length=np.linalg.norm(delta);normal=np.array([-delta[1],delta[0]])/length
 t=np.arange(int(length)+1,dtype=float);xy=p0+normal*offset+t[:,None]*delta/length
 # Bilinear readout at physical-pixel centers; no spatial prefilter.
 samples=cv2.remap(rgb.astype(np.float32),xy[:,0].astype(np.float32)[None,:],xy[:,1].astype(np.float32)[None,:],cv2.INTER_LINEAR)[0]
 left=np.median(samples[:10],axis=0);right=np.median(samples[-10:],axis=0);axis=right-left
 q=(samples-left)@axis/max(float(axis@axis),1e-6)
 fit=isotonic_regression(q,increasing=True).x
 x10=float(np.interp(.1,fit,t));x90=float(np.interp(.9,fit,t))
 return {'width':x90-x10,'x10':x10,'x90':x90,'left':left.tolist(),'right':right.tolist(),'q':q.tolist(),'fit':fit.tolist()}

def measure():
 labels=os.environ.get('EDGES_CANDIDATES','a,b,c,d,e,b-control,c-control,b-png,d4096,d-lossless,x1,x2,x3').split(',')
 rows=[];profiles={}
 for label in labels:
  if not (OUT/label/'body.png').exists():continue
  rgb=np.array(Image.open(OUT/label/'body.png').convert('RGB'));marked=Image.fromarray(rgb.copy());draw=ImageDraw.Draw(marked);widths={};unlit={};profiles[label]={}
  for name,(p0,p1) in LINES.items():
   traces=[scan(rgb,p0,p1,offset) for offset in range(-4,5)]
   widths[name]=float(np.median([a['width'] for a in traces]));profiles[label][name]=traces
   u=np.array(Image.open(OUT/label/'body-unlit.png').convert('RGB'))
   unlit[name]=float(np.median([scan(u,p0,p1,offset)['width'] for offset in range(-4,5)]))
   draw.line([tuple(p0),tuple(p1)],fill=(0,255,0),width=2);draw.text((p1[0]+8,p1[1]),f'{name}: {widths[name]:.2f}px',fill=(0,255,0))
  lab=cv2.cvtColor(rgb.astype(np.float32)/255,cv2.COLOR_RGB2LAB);lum=lab[:,:,0]*2.55
  fine=lum-cv2.GaussianBlur(lum,(0,0),3)
  fold=cv2.GaussianBlur(lum,(0,0),16)-cv2.GaussianBlur(lum,(0,0),48)
  parts={}
  for name,(x0,y0,x1,y1) in BOXES.items():
   parts[name]={'fine_mse':float(np.mean(fine[y0:y1,x0:x1]**2)),'fold_rms':float(np.sqrt(np.mean(fold[y0:y1,x0:x1]**2))),'pixels':(x1-x0)*(y1-y0)}
   draw.rectangle((x0,y0,x1,y1),outline=(0,255,255),width=2)
  fold_parts={}
  for name,(x0,y0,x1,y1) in FOLD_BOXES.items():
   fold_parts[name]={'rms':float(np.sqrt(np.mean(fold[y0:y1,x0:x1]**2))),'pixels':(x1-x0)*(y1-y0)}
   draw.rectangle((x0,y0,x1,y1),outline=(255,180,0),width=2)
  pix=sum(v['pixels'] for v in parts.values())
  row={'case':label,'widths_px':widths,'unlit_widths_px':unlit,'fine_mse':sum(v['fine_mse']*v['pixels'] for v in parts.values())/pix,'fold_rms':float(np.sqrt(sum(v['rms']**2*v['pixels'] for v in fold_parts.values())/sum(v['pixels'] for v in fold_parts.values()))),'parts':parts,'fold_parts':fold_parts}
  rows.append(row);marked.save(OUT/label/'regions.png');print(json.dumps(row),flush=True)
 report={'definition':{'units':'physical pixels (CSS width is half at DPR2)','edge':'sRGB RGB projected onto the vector between median first/last10 samples; monotone isotonic fit; subpixel 10%-90% crossings. Median of9 separately measured parallel scanlines, offsets -4..4px. No image preblur. Lit includes shading; unlit control separates texture mixing from shading.','lines':LINES,'fine':'MSE of Lab L*2.55 minus Gaussian sigma3 pixels in flat cloth interiors, excluding buckle/edges/folds','fold':'RMS of Gaussian sigma16 minus sigma48 in separate sleeve fold ROIs','boxes':BOXES,'fold_boxes':FOLD_BOXES},'rows':rows}
 (OUT/'measurements.json').write_text(json.dumps(report,indent=2)+'\n');(OUT/'profiles.json').write_text(json.dumps(profiles,indent=2)+'\n')
 with (OUT/'measurements.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['case',*LINES,'fine_mse','fold_rms']);w.writerows([[r['case'],*[r['widths_px'][k] for k in LINES],r['fine_mse'],r['fold_rms']] for r in rows])
 # Native screenshots stay in each case folder; this sheet is a viewing aid.
 for filename,cases in [('diagnosis.png',[r['case'] for r in rows if r['case'] in list('abcde')]),('compare.png',[r['case'] for r in rows if r['case'].startswith('x')])]:
  if not cases:continue
  sheet=Image.new('RGB',(1440*len(cases),2280),'white');d=ImageDraw.Draw(sheet)
  for col,label in enumerate(cases):
   x=col*1440;d.text((x+20,15),label,fill='black')
   for name,y,size in [('body',45,(1440,900)),('full',980,(1440,900)),('face',1900,(448,364))]:
    im=Image.open(OUT/label/(name+'.png')).convert('RGB').resize(size,Image.Resampling.LANCZOS)
    sheet.paste(im,(x+(1440-size[0])//2,y))
  sheet.save(OUT/filename)
 # Raw and fitted central traces make each reported threshold reviewable.
 colors=['#555','#08b','#090','#c70','#d04','#709']
 svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000"><rect width="1200" height="1000" fill="white"/>']
 selected=[v for v in ['a','b','c','d','e','x1','x2','x3'] if v in profiles]
 for n,name in enumerate(LINES):
  ox=(n%2)*600;oy=(n//2)*500;svg.append(f'<text x="{ox+25}" y="{oy+25}" font-size="18">{name}</text>')
  for k,label in enumerate(selected):
   trace=profiles[label][name][4];points=' '.join(f'{ox+45+i*5:.2f},{oy+420-max(-.1,min(1.1,q))*300:.2f}' for i,q in enumerate(trace['q']))
   color=colors[k%len(colors)];svg.append(f'<polyline fill="none" stroke="{color}" stroke-width="1.5" points="{points}"/><text x="{ox+450}" y="{oy+45+k*22}" fill="{color}">{label}</text>')
  for q in [.1,.9]:svg.append(f'<path d="M {ox+40} {oy+420-q*300} h 430" stroke="#aaa" stroke-dasharray="4 4"/>')
 svg.append('</svg>');(OUT/'profiles.svg').write_text(''.join(svg))
if __name__=='__main__':measure()
