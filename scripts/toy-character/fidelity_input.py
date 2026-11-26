"""Freeze manual v4 annotations and a non-generative, alpha-preserving head crop."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.work/toy-character/fidelity'
GEN=ROOT/'.work/toy-character/img3d/fidelity'
CROP=(397,10,857,470)
# L/R refer to image left/right, independent of anatomical side.
POINTS={
 'crown':[611,36], 'chin':[627,390],
 'temple_L':[499,234], 'temple_R':[749,234],
 'cheek_L':[511,323], 'cheek_R':[735,323],
 'jaw_L':[550,367], 'jaw_R':[700,367],
 'eye_L_left':[538,259], 'eye_L_right':[590,267],
 'eye_L_top':[564,241], 'eye_L_bottom':[566,278],
 'eye_R_left':[661,267], 'eye_R_right':[714,259],
 'eye_R_top':[686,241], 'eye_R_bottom':[684,278],
 'iris_L_center':[571,261], 'iris_L_left':[554,261], 'iris_L_right':[588,261],
 'iris_R_center':[681,261], 'iris_R_left':[664,261], 'iris_R_right':[698,261],
 'nose_tip':[626,303], 'nose_top':[626,286], 'nose_bottom':[626,316],
 'ala_L':[604,307], 'ala_R':[648,307],
 'mouth_L':[594,338], 'mouth_R':[660,338], 'mouth_center':[627,341],
 'lip_top':[627,334], 'lip_bottom':[627,350],
 'ear_L':[470,285], 'ear_R':[774,285],
 'ear_L_bottom':[504,329], 'ear_R_bottom':[747,329],
}
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def main():
 OUT.mkdir(parents=True,exist_ok=True);(GEN/'input').mkdir(parents=True,exist_ok=True)
 ref=Image.open(ROOT/'docs/toy-character/design/v4.png').convert('RGBA')
 matte=Image.open(ROOT/'.work/toy-character/img3d/input/v4-noglasses__matted.png').convert('RGBA')
 assert ref.size==matte.size==(1254,1254)
 keep=np.zeros((1254,1254),bool);keep[:391]=True
 # Fixed jaw outline removes collar pixels in the concavity beneath the hair.
 jaw_x=[553,565,580,600,627,650,675,690,699]
 jaw_y=[378,378,383,388,391,389,381,375,376]
 for x in range(553,700):
  keep[round(np.interp(x,jaw_x,jaw_y))+1:,x]=False
 neck=Image.new('L',ref.size)
 ImageDraw.Draw(neck).polygon([(580,383),(670,383),(670,393),(659,398),
  (645,404),(636,416),(620,416),(612,404),(592,398),(580,393)],fill=255)
 keep|=np.array(neck)>0
 rgb=np.array(matte)[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
 keep[370:] &= ~((b>=g)&(r>40))[370:]
 cut=Image.fromarray((keep*255).astype('uint8'))
 alpha=ImageChops.multiply(matte.getchannel('A'),cut)
 matte.putalpha(alpha)
 head=matte.crop(CROP).resize((1024,1024),Image.Resampling.LANCZOS)
 input_path=GEN/'input/head-front-rgba.png'
 # Pillow versions may encode the same pixels differently. Preserve a verified
 # input byte-for-byte on reruns so the existing provenance hashes remain valid.
 same=input_path.exists() and np.array_equal(np.array(Image.open(input_path).convert('RGBA')),np.array(head))
 if not same:
  if input_path.exists() and (OUT/'generation.json').exists():
   raise RuntimeError('Input pixels changed; archive previous generation outputs before rebuilding.')
  head.save(input_path)
 alpha.save(OUT/'design-head-mask-with-neck.png')
 # Head silhouette stops at the chin; neck is excluded from head IoU.
 design_alpha=Image.open(ROOT/'.work/toy-character/img3d/input/v4__matted.png').getchannel('A')
 a=np.array(ImageChops.multiply(design_alpha,cut));a[391:]=0
 Image.fromarray(a).save(OUT/'design-head-mask.png')
 save(OUT/'design-landmarks.json',{'image':'docs/toy-character/design/v4.png',
  'image_size':[1254,1254],'axes':'image left/right; origin upper left; pixels',
  'annotation':'manual visible-feature annotation; glasses excluded from eye boundary',
  'estimated_annotation_uncertainty_px':1.5,'points':POINTS,
  'iris_diameters_px':{'L':34,'R':34},'head_height_px':354,
  'face_width_px':250,'head_mask':'design-head-mask.png'})
 save(OUT/'camera.json',{'projection':'ORTHO','front':'-Y','up':'+Z',
  'image_to_world':'X=(x-627)/1177; Z=(1213-y)/1177',
  'full_image':{'resolution':[1254,1254],'ortho_scale':1254/1177,'target':[0,0,(1213-627)/1177]},
  'head':{'crop':list(CROP),'resolution':[920,920],'ortho_scale':460/1177,
  'target':[0,0,(1213-240)/1177]},'45_degree':'horizontal +X/-Y, same target, scale and light; design front repeated and labeled'})
 im=ref.crop(CROP).resize((920,920));d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14)
 for i,(name,(x,y)) in enumerate(POINTS.items()):
  x=(x-397)*2;y=(y-10)*2
  d.ellipse((x-3,y-3,x+3,y+3),fill='#00ffff',outline='black')
  d.text((x+5,y-15 if i%2 else y+3),name,fill='#06ffff',stroke_width=1,stroke_fill='black',font=font)
 im.convert('RGB').save(OUT/'design-landmarks.png')
 # Checkerboard makes clipped alpha and any surviving clothing readily visible.
 im=Image.open(GEN/'input/head-front-rgba.png');check=Image.new('RGBA',im.size,'#dddddd');d=ImageDraw.Draw(check)
 for y in range(0,1024,32):
  for x in range(0,1024,32):
   if (x//32+y//32)%2:d.rectangle((x,y,x+31,y+31),fill='#aaaaaa')
 Image.alpha_composite(check,im).convert('RGB').save(OUT/'input-alpha-check.png')
if __name__=='__main__':main()
