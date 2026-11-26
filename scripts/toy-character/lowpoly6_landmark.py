"""Locate the visible V bottom where the two gold zipper edges meet in the source render."""
import sys,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
out=Path(sys.argv[1]);im=Image.open(out/'collar-source-color.png');rgb=np.asarray(im)[:,:,:3].astype(float)
gold=(rgb[:,:,0]>120)&(rgb[:,:,0]>rgb[:,:,1]*1.12)&(rgb[:,:,1]>rgb[:,:,2]*1.35)
# The selected feature is the end of the open space between the two gold edges,
# above the zipper slider. It is measured in a known orthographic projection.
row=None
for y in range(600,751):
    xs=np.flatnonzero(gold[y,400:600])+400;runs=np.split(xs,np.flatnonzero(np.diff(xs)>1)+1)
    if any(len(run)>4 and run[0]<500 and run[-1]>550 for run in runs):row=y;break
if row is None:raise RuntimeError('The source V landmark was not located')
z=.685-((row-.5)-500)*.18/1000
m={'front_opening_bottom_m':float(z),'method':'first row where the two visible gold zipper edges join; orthographic source texture render','source_image':'collar-source-color.png','pixel_row':row,'camera_target_z_m':.685,'orthographic_scale_m':.18,'image_height_px':1000,'measurement_uncertainty_mm':.5,'gold_threshold':'R>120, R>1.12G, G>1.35B; contiguous gold run spans x=500..550; row 600..750'}
(out/'collar-landmark.json').write_text(json.dumps(m,indent=2)+'\n')
d=ImageDraw.Draw(im);d.line((350,row,650,row),fill='white',width=2);d.text((660,row),f'V bottom {z*1000:.2f} mm',fill='white');im.save(out/'collar-measure.png');print(json.dumps(m),flush=True)
