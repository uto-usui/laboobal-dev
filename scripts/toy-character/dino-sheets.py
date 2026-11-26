from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess
out=Path('.work/toy-character/dino')
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',16)
sheet=Image.new('RGB',(1580,1010),'#f3f3ef');d=ImageDraw.Draw(sheet)
for row,angle in enumerate([30,50]):
 for name,x,w,h in [('desktop',10,720,450),('embed',740,640,400),('mobile',1385,185,400)]:
  im=Image.open(out/f'still-{name}-{angle}.png').convert('RGB');im.thumbnail((w,h));sheet.paste(im,(x,row*500+40));d.text((x,row*500+12),f'{name} {angle} deg',font=font,fill='#222222')
sheet.save(out/'stills.png')
legsheet=Image.new('RGB',(900,810),'#f3f3ef');d=ImageDraw.Draw(legsheet)
for i in range(9):
 im=Image.open(out/f'leg-{i}.png').convert('RGB');im.thumbnail((295,240));x=i%3*300;y=i//3*270;legsheet.paste(im,(x,y+25));d.text((x+8,y+4),f'{i/12:.3f} s',font=font,fill='#222222')
legsheet.save(out/'legs-desktop.png')
for name in ['desktop','mobile']:
 for angle in [30,50]:
  stem=f'{name}-{angle}';folder=out/f'{stem}-frames';folder.mkdir(exist_ok=True)
  subprocess.run(['ffmpeg','-y','-i',str(out/f'{stem}.webm'),'-vf','fps=1/2',str(folder/'%03d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  files=sorted(folder.glob('*.png'));width,height=(360,225) if name=='desktop' else (156,338);cols=6 if name=='desktop' else 8;cellh=height+25
  strip=Image.new('RGB',(cols*width,((len(files)+cols-1)//cols)*cellh),'#f3f3ef');d=ImageDraw.Draw(strip)
  for i,f in enumerate(files):
   im=Image.open(f).convert('RGB').resize((width,height));x=i%cols*width;y=i//cols*cellh;strip.paste(im,(x,y+25));d.text((x+6,y+4),f'{i*2:02d}s',font=font,fill='#222222')
  strip.save(out/f'{stem}-strip.png')
