from pathlib import Path
from PIL import Image, ImageDraw
out = Path('.work/toy-character/savanna-walk2')
sheet = Image.new('RGB', (360 * 9, 310), '#faf8f1')
draw = ImageDraw.Draw(sheet)
for i in range(9):
    sheet.paste(Image.open(out / f'legs-{i}.png'), (i * 360, 25))
    draw.text((i * 360 + 5, 5), f'{i / 12:.3f}s', fill='black')
sheet.save(out / 'legs-desktop.png')
for view in ['side', 'front']:
    sheet = Image.new('RGB', (1600, 1100), '#faf8f1')
    draw = ImageDraw.Draw(sheet)
    for i in range(8):
        x, y = i % 4 * 400, i // 4 * 550
        sheet.paste(Image.open(out / f'cycle-{view}-{i}.png'), (x, y))
        draw.text((x + 10, y + 10), f'{i}/8', fill='black')
    sheet.save(out / f'cycle-{view}.png')
