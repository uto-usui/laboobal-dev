"""Compose stage-6 retry sheets and calculate opaque silhouette agreement."""
import json,sys
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw,ImageFont
OUT=Path(sys.argv[1]);FONT='/System/Library/Fonts/Helvetica.ttc'
font=ImageFont.truetype(FONT,17)

def panel(path,label,size=450):
    im=Image.open(OUT/path).convert('RGBA');bg=Image.new('RGBA',im.size,'#e0e2e5');bg=Image.alpha_composite(bg,im).convert('RGB')
    bg.thumbnail((size,size));tile=Image.new('RGB',(size,size+40),'#fafafa');tile.paste(bg,((size-bg.width)//2,40))
    ImageDraw.Draw(tile).text((10,10),label,font=font,fill='#20242a');return tile

def sheet(rows,name):
    canvas=Image.new('RGB',(max(sum(p.width for p in r) for r in rows),sum(max(p.height for p in r) for r in rows)),'#fafafa');y=0
    for row in rows:
        x=0
        for p in row:canvas.paste(p,(x,y));x+=p.width
        y+=max(p.height for p in row)
    canvas.save(OUT/name)

def silhouette(a,b):
    a=np.asarray(Image.open(a))[:,:,3]>127;b=np.asarray(Image.open(b))[:,:,3]>127
    kernel=np.ones((3,3),np.uint8);ac=a&~cv2.erode(a.astype('uint8'),kernel).astype(bool);bc=b&~cv2.erode(b.astype('uint8'),kernel).astype(bool)
    da=cv2.distanceTransform((~ac).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE);db=cv2.distanceTransform((~bc).astype('uint8'),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    d=np.r_[da[bc],db[ac]];iou=np.logical_and(a,b).sum()/np.logical_or(a,b).sum()
    return {'iou':float(iou),'contour_p95_px':float(np.percentile(d,95)),'contour_max_px':float(d.max()),'pass':bool(iou>=.99)}

metrics=json.loads((OUT/'metrics.json').read_text())
metrics['silhouette']={str(a):silhouette(OUT/f'mask-high-{a}.png',OUT/f'mask-low-{a}.png') for a in range(0,360,45)}
metrics['acceptance'].update({'distance_p95':all(v[d]['p95_pass'] for v in metrics['distances_full_source'].values() for d in ['high_to_low','low_to_high']), 'silhouette':all(v['pass'] for v in metrics['silhouette'].values()), 'topology':all(t['boundary_edges']==0 and t['edges_shared_by_3_or_more_faces']==0 and t['connected_components']==1 for t in metrics['topology'].values())})
(OUT/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
sheet([[panel(f'view-{label}-{a}.png',f'{label} | {a} deg') for label in ['high','low']] for a in [0,90,180,270]],'lowpoly-views.png')
sheet([[panel(f'clay-{a}.png',f'White material | {a} deg') for a in row] for row in [[0,90],[180,270]]],'clay-body.png')
sheet([[panel(f'wire-{v}.png',v) for v in row] for row in [['front','side'],['face','shoulder','elbow']]],'wire.png')
poses=list(metrics['poses'])
sheet([[panel(f'pose-{pose}-{a}.png',f'{pose} | {a} deg') for a in [0,35]] for pose in poses],'poses.png')
sheet([[panel(f'close-{pose}-{v}.png',pose+' | '+v,360) for v in ['shoulder','elbow','armpit','neck']] for pose in poses],'pose-close.png')
sheet([[panel(f'neck-{pose}-{a}.png',f'{pose} | {a} deg',400) for a in [0,90,180]] for pose in poses if pose=='rest' or pose.startswith('neck_')],'neck.png')
for mode,name in [('current','outliers.png')]:
    sheet([[panel(f'outlier-{mode}-{a}.png',f'{mode} | {a} deg | green 0 / yellow 1 / red >=2 mm') for a in row] for row in [[0,90],[180,270],['face']]],name)
print(json.dumps({'triangles':metrics['triangles'],'acceptance':metrics['acceptance']}))

sheet([[panel(f'face-{label}-{a}.png',f'{label} | {a} deg',600) for label in ['original','voxel','selected']] for a in [0,25]],'face-close.png')
from lowpoly3_report import report
report(OUT)
