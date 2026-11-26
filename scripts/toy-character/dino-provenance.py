import json,hashlib
from pathlib import Path
base=Path('.work/toy-character/dino');vendor=base/'vendor'
rows=[]
for name,url in [('dinosaur','https://quaternius.itch.io/animated-lowpoly-dinosaurs'),('nature','https://quaternius.itch.io/stylized-nature-megakit'),('ultimate-nature','https://quaternius.itch.io/150-lowpoly-nature-models')]:
 f=vendor/(name+'.zip');rows.append(dict(file=f.name,url=url,bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
for p in sorted(vendor.glob('*.html'))+sorted(vendor.glob('*License.txt')):
 rows.append(dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(vendor/'manifest.json').write_text(json.dumps(rows,indent=2));(vendor/'SHA256SUMS').write_text('\n'.join(r['sha256']+'  '+r['file'] for r in rows)+'\n')
a=json.loads((base/'assets.json').read_text())
for part in a['assets']:
 name=part['name']
 if name.startswith('Palm'):source=vendor/'ultimate/Blends'/(name+'.blend')
 elif name in ['Fern_1','Grass_Common_Short','Rock_Medium_1']:source=vendor/'nature/glTF'/(name+'.gltf')
 else:source=vendor/'dinosaur/Dinosaur Animated Pack - Dec 2018/Blends'/(name+'.blend')
 part['source']=str(source.relative_to(vendor));part['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
a['conversion']={'blender':'5.2.2 LTS','clips':['Walk','Idle'],'velociraptorWalkFrames':[0,28],'fps':24,'textures':0,'colors':'Muted sage, brown and grey; roughness 0.94-0.95; no outlines','compression':'EXT_meshopt_compression'}
a['unchanged']={}
for name in ['character.glb','walk.ts']:
 p=Path('src/demos/toy-figure')/('assets' if name.endswith('glb') else '')/name
 backup=Path('.work/toy-character/backup-savanna3/toy-figure')/('assets' if name.endswith('glb') else '')/name
 digest=hashlib.sha256(p.read_bytes()).hexdigest();a['unchanged'][name]={'sha256':digest,'matchesBackup':digest==hashlib.sha256(backup.read_bytes()).hexdigest()}
(base/'assets.json').write_text(json.dumps(a,indent=2))
print(a['totalBytes'],a['totalBytes']/1024/1024)
