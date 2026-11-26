"""Signed collision depths on the closed body, restricted to clothing contacts."""
import sys,json
from pathlib import Path
import numpy as np,igl
out=Path(sys.argv[1]);rows=json.loads((out/'neck-range-initial.json').read_text())
for row in rows:
    d=np.load(out/f"neck-contact-{row['pose']}.npz");v=d['V'].astype(float);f=d['F'].astype(np.int64);points=d['points'].astype(float)
    sd,fi,closest=igl.point_mesh_squared_distance(points,v,f);inside=abs(igl.fast_winding_number(v,f,points))>.5
    contact=inside&d['clothmask'][fi];depth=np.sqrt(sd)*1000;index=int(np.argmax(np.where(contact,depth,-1)))
    row['penetration_mm']=float(depth[contact].max(initial=0));row['penetration_sample_count']=len(points);row['penetrating_clothing_samples']=int(contact.sum());row['deepest_contact']=({'point_mm':(points[index]*1000).tolist(),'closest_body_mm':(closest[index]*1000).tolist(),'body_face':int(fi[index]),'body_label':int(d['labels'][fi[index]])} if contact.any() else None)
    row['numeric_neck_pass']=row['gap_mm']<=.05 and row['penetration_mm']<=2 and row['missing_angular_sections']==0
    print('CONTACT8',row['pose'],row['penetration_mm'],row['numeric_neck_pass'],flush=True)
ranges={};restpass=rows[0]['numeric_neck_pass']
for direction in ['left','right','up','down']:
    maximum=0
    if restpass:
        for row in rows:
            if not row['pose'].startswith('neck_'+direction):continue
            if not row['numeric_neck_pass']:break
            maximum=row['angle_deg']
    ranges[direction]=maximum
result={'rows':rows,'continuous_safe_range_degrees':ranges,'range_pass':min(ranges['left'],ranges['right'])>=20 and min(ranges['up'],ranges['down'])>=10,'method':{'radial':'head skin clipped on its ORIGINAL z<=700mm (exclude chin from neck radius), transformed rigidly; 128 horizontal rays, 1mm vertical samples 640..730mm, fitted axis x(z),y(z); compare radii only where BOTH surfaces intersect; missing stays null','gap':'per direction: lowest posed head neck-skin section minus highest body neck-skin section, half-cell corrections; positive interval candidates retained only if no outward hit on either complete body or complete head (including hair); unknown directions fail. Vertical angular profile estimate, resolution 1mm','protrusion':'positive head-radius minus body-radius on common rays in overlap; outward clothing and full-head rays distinguish visible protrusion','penetration':'40000 fixed area-weighted samples + head vertices, hair or original skin z>=705mm (chin), inside closed posed body by abs(winding)>0.5; nearest body surface must be upper clothing/shoulder/straps; maximum signed closest distance. Buried neck skin is excluded','range':'largest continuous 5-degree prefix from rest in EACH direction; gap hidden <=0.05mm numerical tolerance and clothing penetration <=2mm; final visual review can reduce but never enlarge this range','sampling_limit':'surface samples approximate maxima; radial gap quantization is 1mm, and grazing/oblique views require image review'}}
(out/'neck-range-metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
