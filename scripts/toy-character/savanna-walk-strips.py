from pathlib import Path
import subprocess
from PIL import Image, ImageDraw
out=Path('.work/toy-character/savanna-walk')
for name, columns, width in [('desktop',4,480),('mobile',8,195)]:
    frames=out/f'{name}-frames'
    frames.mkdir(exist_ok=True)
    subprocess.run(['ffmpeg','-y','-i',str(out/f'{name}.webm'),'-vf',f'fps=1/2,scale={width}:-1',str(frames/'%03d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    files=sorted(frames.glob('*.png'))
    first=Image.open(files[0]); w,h=first.size
    rows=(len(files)+columns-1)//columns
    strip=Image.new('RGB',(columns*w,rows*(h+24)),'#faf8f1')
    draw=ImageDraw.Draw(strip)
    for i,f in enumerate(files):
        x,y=(i%columns)*w,(i//columns)*(h+24)
        strip.paste(Image.open(f),(x,y+24))
        draw.text((x+8,y+5),f'{i*2:02d}s',fill='#343936')
    strip.save(out/f'{name}-strip.png')
    print(name,len(files),strip.size)
