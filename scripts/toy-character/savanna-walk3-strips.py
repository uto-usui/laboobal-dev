from pathlib import Path
import subprocess
from PIL import Image, ImageDraw
out = Path('.work/toy-character/savanna-walk3')
for name, columns, width in [('desktop', 4, 480), ('mobile', 8, 195)]:
    frames = out / f'{name}-frames'
    frames.mkdir(exist_ok=True)
    for i in range(33):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(i * 2), '-i', str(out / f'{name}.webm'), '-frames:v', '1', '-vf', f'scale={width}:-1', str(frames / f'{i+1:03}.png')], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    files = [frames / f'{i+1:03}.png' for i in range(33)]
    w, h = Image.open(files[0]).size
    strip = Image.new('RGB', (columns * w, ((len(files)+columns-1)//columns) * (h+24)), '#faf8f1')
    draw = ImageDraw.Draw(strip)
    for i, f in enumerate(files):
        x, y = (i % columns) * w, (i // columns) * (h+24)
        strip.paste(Image.open(f), (x, y+24))
        draw.text((x+8, y+5), f'{i*2:02d}s', fill='#343936')
    strip.save(out / f'{name}-strip.png')
    print(name, len(files), strip.size)
