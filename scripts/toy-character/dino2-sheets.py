from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,subprocess,math
out=Path('.work/toy-character/dino2');font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',14)
def label(draw,xy,text):draw.text(xy,text,font=font,fill='#292e2b')
if (out/'stills.json').exists():
 sheet=Image.new('RGB',(1550,850),'#f3f3ef');d=ImageDraw.Draw(sheet)
 for name,x,y,w,h in [('desktop',10,40,960,600),('embed',10,665,288,180),('mobile',1000,40,365,790)]:
  im=Image.open(out/f'still-{name}.png').convert('RGB');im.thumbnail((w,h));sheet.paste(im,(x,y));label(d,(x,y-25),name+' | 30 deg')
 sheet.save(out/'stills.png')
 legs=Image.new('RGB',(900,850),'#f3f3ef');d=ImageDraw.Draw(legs)
 for i in range(9):
  im=Image.open(out/f'leg-{i}.png').convert('RGB');im.thumbnail((295,250));x=i%3*300;y=i//3*280;legs.paste(im,(x,y+25));label(d,(x+8,y+4),f'{i/12:.3f} s')
 legs.save(out/'legs-desktop.png')
if (out/'loading.json').exists():
 rows=json.loads((out/'loading.json').read_text())[0]['frames'];cols=8;cw,ch=202,108
 sheet=Image.new('RGB',(cols*cw,math.ceil(len(rows)/cols)*ch),'#f3f3ef');d=ImageDraw.Draw(sheet)
 for i,r in enumerate(rows):
  raw=Image.open(out/r['file']).convert('RGB')
  if r['done']:
   raw.thumbnail((200,64));im=Image.new('RGB',(200,64),'#e0e6e7');im.paste(raw,((200-raw.width)//2,0))
  else: im=raw.crop((290,215,510,285)).resize((200,64))
  x=i%cols*cw;y=i//cols*ch;sheet.paste(im,(x,y+24));label(d,(x+4,y+3),f"{r['seconds']:.1f}s"+(' | 100% done' if r['done'] else ''))
 sheet.save(out/'loading-strip.png')
for name in ['desktop','mobile']:
 movie=out/f'{name}.webm'
 if not movie.exists():continue
 folder=out/f'{name}-frames';folder.mkdir(exist_ok=True)
 subprocess.run(['ffmpeg','-y','-i',str(movie),'-vf','fps=1/2',str(folder/'%03d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 files=sorted(folder.glob('*.png'));w,h=(320,200) if name=='desktop' else (156,338);cols=7 if name=='desktop' else 9;cell=h+25
 sheet=Image.new('RGB',(w*cols,math.ceil(len(files)/cols)*cell),'#f3f3ef');d=ImageDraw.Draw(sheet)
 for i,f in enumerate(files):
  im=Image.open(f).convert('RGB').resize((w,h));x=i%cols*w;y=i//cols*cell;sheet.paste(im,(x,y+25));label(d,(x+6,y+3),f'{i*2:03d}s')
 sheet.save(out/f'{name}-strip.png')
