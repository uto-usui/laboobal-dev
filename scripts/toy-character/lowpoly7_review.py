"""Lay out the actual close renders centered on every pose's most stretched edge."""
import sys,json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path(sys.argv[1]);m=json.loads((out/'metrics.json').read_text());rows=m['stretch_over_3x'];im=Image.new('RGB',(1500,550*math.ceil(len(rows)/3)),'#fafafa');d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18)
for i,(name,r) in enumerate(rows.items()):
 e=r['max_edge'];tile=Image.open(out/e['close_render']).convert('RGBA');bg=Image.new('RGBA',tile.size,'#e0e2e5');bg=Image.alpha_composite(bg,tile).convert('RGB');bg.thumbnail((500,470));x=i%3*500;y=i//3*550;im.paste(bg,(x,y+80));d.text((x+8,y+6),name+' '+str(round(e['stretch'],3))+'x',font=font,fill='black');d.text((x+8,y+30),'/'.join(e['parts']),font=font,fill='black');d.text((x+8,y+52),f"z={min(e['height_range_mm']):.2f}..{max(e['height_range_mm']):.2f}mm",font=font,fill='black')
im.save(out/'stretch-maxima.png')
