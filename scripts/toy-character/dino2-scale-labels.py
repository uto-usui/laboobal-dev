from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json
out=Path('.work/toy-character/dino2')
im=Image.open(out/'scale.png').convert('RGB');d=ImageDraw.Draw(im)
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',16)
data=json.loads((out/'assets.json').read_text())
d.text((30,25),'Same ground / child ~1 m / dinosaur length: nose to tail at Walk 0 s',font=font,fill='#303832')
for x,a in zip([500,790,1000,1300,1600,2150],data['assets'][:6]):
    label=a['name']+'  '+str(round(a['bodyLengthM'],1))+' m'
    d.text((x-80,630),label,font=font,fill='#303832')
    d.text((x-80,655),f"height {a['walkPoseHeightM']:.2f} m",font=font,fill='#303832')
d.text((170,605),'child ~1 m',font=font,fill='#303832')
d.text((25,700),'Palms 6.3-9.35 m | fern 0.48-1.2 m | bush 0.54-1.35 m | grasses 0.21-0.5 m | rocks and pebbles 0.08-0.83 m',font=font,fill='#303832')
im.save(out/'scale.png')
