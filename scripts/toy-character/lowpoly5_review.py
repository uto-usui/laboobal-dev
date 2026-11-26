"""Inspection sheets and independent alpha-mask measurements for lowpoly4."""
import json,sys
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw,ImageFont
OUT=Path(sys.argv[1]);FONT='/System/Library/Fonts/Helvetica.ttc';font=ImageFont.truetype(FONT,18)

def panel(path,label,size=450):
    if (OUT/path).exists():
        im=Image.open(OUT/path).convert('RGBA');bg=Image.new('RGBA',im.size,'#e0e2e5');bg=Image.alpha_composite(bg,im).convert('RGB');bg.thumbnail((size,size))
        tile=Image.new('RGB',(size,size+40),'#fafafa');tile.paste(bg,((size-bg.width)//2,40))
    else:tile=Image.new('RGB',(size,size+40),'#eee')
    draw=ImageDraw.Draw(tile);draw.text((10,10),label,font=font,fill='#20242a')
    if not (OUT/path).exists() and path.startswith('ab-B-'):
        draw.multiline_text((30,100),'QuadriFlow CANCELLED\nNo quad candidate\nNot available for pose comparison',font=font,fill='#444',spacing=12)
    return tile

def sheet(rows,name):
    canvas=Image.new('RGB',(max(sum(p.width for p in r) for r in rows),sum(max(p.height for p in r) for r in rows)),'#fafafa');y=0
    for row in rows:
        x=0
        for p in row:canvas.paste(p,(x,y));x+=p.width
        y+=max(p.height for p in row)
    canvas.save(OUT/name)

def sections():
    data=json.loads((OUT/'sections.json').read_text());names=list(data['after'])
    im=Image.new('RGB',(1200,340*len(names)),'white')
    for row,name in enumerate(names):
        for col,key in enumerate(['after','reduced']):
            r=data[key][name];tile=Image.new('RGB',(600,340),'#fafafa');draw=ImageDraw.Draw(tile)
            draw.text((10,10),f'{name} {key}: {r["filled_regions"]} filled / {r["holes"]} holes',font=font,fill='black')
            draw.text((10,35),'Bone midpoint plane; fused contours may leave crop',font=font,fill='#666')
            scale=min(1.2,125/(r['anatomical_radius_m']*1000));x0,y0=300,195
            contours=r['contours']
            def area(loop):
                p=np.array(loop['points_mm']);return abs(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1)))/2
            def inside(q,poly):
                a=np.array(poly);b=np.roll(a,-1,axis=0)
                return int((((a[:,1]>q[1])!=(b[:,1]>q[1]))&(q[0]<(b[:,0]-a[:,0])*(q[1]-a[:,1])/(b[:,1]-a[:,1]+1e-30)+a[:,0])).sum())%2
            for loop in sorted(contours,key=area,reverse=True):
                pts=[(x0+x*scale,y0-y*scale) for x,y in loop['points_mm']]
                depth=sum(inside(loop['points_mm'][0],other['points_mm']) for other in contours if other is not loop)
                if len(pts)>2:draw.polygon(pts,fill='white' if depth%2 else '#bbd7ed');draw.line(pts+[pts[0]],fill='#004c99',width=2)
            draw.ellipse((x0-3,y0-3,x0+3,y0+3),fill='black');im.paste(tile,(col*600,row*340))
    im.save(OUT/'sections.png')


def silhouette(a,b):
    a=np.asarray(Image.open(a))[:,:,3]>127;b=np.asarray(Image.open(b))[:,:,3]>127
    kernel=np.ones((3,3),np.uint8);ac=a&~cv2.erode(a.astype('uint8'),kernel).astype(bool);bc=b&~cv2.erode(b.astype('uint8'),kernel).astype(bool)
    da=cv2.distanceTransform((~ac).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE);db=cv2.distanceTransform((~bc).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    d=np.r_[da[bc],db[ac]];iou=np.logical_and(a,b).sum()/np.logical_or(a,b).sum()
    return {'iou':float(iou),'contour_p95_px':float(np.percentile(d,95)),'contour_max_px':float(d.max()),'pass':bool(iou>=.99)}

sections()
if (OUT/'ab-A-elbow.png').exists():
    sheet([[panel(f'ab-{letter}-{view}.png',f'{letter} | {view}',600) for letter in ['A','B']] for view in ['elbow','elbow-back','wire']],'ab-elbow.png')
    sheet([[panel(f'ab-{letter}-{view}.png',f'{letter} | 45 deg | {view}',450) for view in ['gaps','armpit','crotch','straps-front','straps-back']] for letter in ['A','B']],'ab-gaps.png')
if not (OUT/'metrics.json').exists():sys.exit(0)
metrics=json.loads((OUT/'metrics.json').read_text())
metrics['silhouette']={str(a):silhouette(OUT/f'mask-high-{a}.png',OUT/f'mask-low-{a}.png') for a in range(0,360,45)}
metrics['acceptance']['silhouette']=all(v['pass'] for v in metrics['silhouette'].values())
(OUT/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
sheet([[panel(f'view-{label}-{a}.png',f'{label} | {a} deg') for label in ['high','low']] for a in [0,90,180,270]],'lowpoly-views.png')
sheet([[panel(f'clay-{a}.png',f'White material | {a} deg') for a in row] for row in [[0,90],[180,270]]],'clay-body.png')
sheet([[panel(f'wire-{v}.png',v) for v in row] for row in [['front','side'],['face','shoulder','elbow']]],'wire.png')
poses=list(metrics['poses'])
sheet([[panel(f'pose-{pose}-{a}.png',f'{pose} | {a} deg') for a in [0,35]] for pose in poses],'poses.png')
sheet([[panel(f'close-{pose}-{v}.png',pose+' | '+v,360) for v in ['shoulder','elbow','armpit','neck']] for pose in poses],'pose-close.png')
sheet([[panel(f'neck-{pose}-{a}.png',f'{pose} | {a} deg',400) for a in [0,90,180]] for pose in poses if pose=='rest' or pose.startswith('neck_')],'neck.png')
sheet([[panel(f'outlier-current-{a}.png',f'{a} deg | green 0 / yellow 1 / red >=2 mm') for a in row] for row in [[0,90],[180,270],['face']]],'outliers.png')
print(json.dumps({'triangles':metrics['triangles'],'acceptance':metrics['acceptance']}))

sheet([[panel(f"elbow-{side}-{kind}-{angle}.png",f"{side} | {kind} | {angle}",500) for kind in ["white","wire"] for angle in [25,205]] for side in ["L","R"]],"elbow.png")
