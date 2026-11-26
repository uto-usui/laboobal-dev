"""Compose labeled review sheets; no image warp or silhouette fitting is used."""
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
FONT='/System/Library/Fonts/Helvetica.ttc'

def tile(path,label,size=640):
    im=Image.open(path).convert('RGB').resize((size,size))
    panel=Image.new('RGB',(size,size+42),'#fafafa');panel.paste(im,(0,42))
    ImageDraw.Draw(panel).text((14,10),label,fill='#222222',font=ImageFont.truetype(FONT,20))
    return panel

def sheet(rows,out):
    width=sum(p.width for p in rows[0]);height=sum(max(p.height for p in row) for row in rows)
    canvas=Image.new('RGB',(width,height),'#fafafa');y=0
    for row in rows:
        x=0
        for panel in row:canvas.paste(panel,(x,y));x+=panel.width
        y+=max(p.height for p in row)
    canvas.save(out)

def reference(out):
    # Physical framing is derived from the reference's 1177 px full height. Both
    # model states share the same camera; reference is cropped once without fitting.
    ref=Image.open(ROOT/'docs/toy-character/design/v4.png').convert('RGB')
    ref.crop((397,10,857,470)).resize((720,720)).save(out/'reference-v4-face.png')


def main():
    stage=sys.argv[1];out=Path(sys.argv[2])
    if stage=='prepare':
        sheet([[tile(out/f'parts-{name}.png',label,600) for name,label in [('front','Front (-Y)'),('left','Left (+X)'),('back','Back (+Y)'),('right','Right (-X)')]]],out/'parts.png')
        rows=[]
        for names in [['front','side'],['hand-L','hand-R']]:
            row=[]
            for name in names:
                body=Image.open(out/f'landmark-body-{name}.png').convert('RGBA')
                dots=Image.open(out/f'landmark-dots-{name}.png').convert('RGBA')
                base=Image.new('RGBA',body.size,'#efeff2')
                base=Image.alpha_composite(base,body)
                base=Image.blend(base,Image.new('RGBA',body.size,'#efeff2'),.26)
                base=Image.alpha_composite(base,dots)
                base.save(out/f'landmark-overlay-{name}.png')
                row.append(tile(out/f'landmark-overlay-{name}.png',name+' | internal joint estimates',720))
            rows.append(row)
        sheet(rows,out/'landmarks.png')
        # A separate numbered legend avoids treating a dark hair label as original color.
        parts=json.loads((out/'parts.json').read_text())['parts']
        legend=Image.new('RGB',(1000,42*len(parts)+30),'white');d=ImageDraw.Draw(legend)
        for row,(name,info) in enumerate(parts.items()):
            y=15+row*42;rgb=tuple(round(c*255) for c in info['display_rgb'])
            d.rectangle((15,y,43,y+25),fill=rgb)
            d.text((60,y),f'{info["id"]}: {name}  ({info["triangles"]:,} triangles)',font=ImageFont.truetype(FONT,22),fill='black')
        legend.save(out/'parts-legend.png')
    else:
        reference(out)
        # There is no true 45-degree design. Repeat the authoritative FRONT image
        # with an explicit label rather than inventing an unprovided reference.
        rows=[]
        for view in ['front','45']:
            rows.append([tile(out/'reference-v4-face.png','Design v4 | FRONT reference'),
                         tile(out/f'before-{view}.png','Before | '+view),
                         tile(out/f'after-{view}.png','After | preview eyes + frame | '+view)])
        sheet(rows,out/'compare-face.png')
        sheet([[tile(out/f'clay-{state}-{view}.png',state+' | '+view) for view in ['front','45','side']] for state in ['before','after']],out/'clay-face.png')
        sheet([[tile(out/f'body-{view}.png','After | '+view,760) for view in ['front','45']]],out/'body-face.png')

if __name__=='__main__':main()
