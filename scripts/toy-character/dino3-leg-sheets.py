from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,sys
stage=sys.argv[1] if len(sys.argv)>1 else 'before';out=Path('.work/toy-character/dino3');info=json.loads((out/f'{stage}-legs.json').read_text());font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',14)
cols=12;cw,ch=200,168;heights=[math.ceil((math.ceil(s['duration']*12)+1)/cols)*(ch*2+40)+35 for s in info];sheet=Image.new('RGB',(cols*cw,sum(heights)),'#f4f3ec');d=ImageDraw.Draw(sheet);y=0
for s,h in zip(info,heights):
 d.text((8,y+4),s['name']+' | top: original Walk; bottom: '+stage+' | animation time, 1/12 s',font=font,fill='#202921');y+=35
 count=math.ceil(s['duration']*12)+1
 for i in range(count):
  x=i%cols*cw;row=i//cols;base=y+row*(ch*2+40)
  for k,mode in enumerate(['raw','current']):
   im=Image.open(out/f'{stage}-legs'/f"{s['name']}-{mode}-{i:03d}.png").convert('RGB').resize((200,150));sheet.paste(im,(x,base+20+k*(ch+10)));d.text((x+5,base+k*(ch+10)),f'{min(i/12,s["duration"]):.3f}s',font=font,fill='#202921')
 y+=h-35
sheet.save(out/f'front-legs-{stage}.png')
