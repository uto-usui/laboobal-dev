"""Install the chosen texture and verify an isolated, source-identical copy."""
import os,json,hashlib,shutil,subprocess,re,time
from pathlib import Path
from datetime import datetime
from PIL import Image,ImageDraw
OUT=Path(os.environ.get('TOY_TEXTURE_OUT','.work/toy-character/texture')).resolve();ROOT=Path.cwd();HERE=Path(__file__).resolve().parent
read=lambda name:json.loads((OUT/name).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    measure=read('measurements.json');variants=measure['variants'];selected=int(os.environ.get('TEXTURE_SELECTED',str(read('selection.json')['selected'])))
    compression=next(c for c in read('compression.json') if c['variant']==selected)
    assert compression['bytes']<=15*1048576,'GLB exceeds budget'
    source=OUT/str(selected)/'character.glb';asset=ROOT/'src/demos/toy-figure/assets/character.glb'
    shutil.copy2(source,asset)
    env=os.environ.copy();env['TEXTURE_INSTALLED']='1';env['TOY_TEXTURE_OUT']=str(OUT)
    subprocess.run([str(OUT.parent/'venv-geo/bin/python'),str(HERE/'texture_web.py')],env=env,check=True)
    assert read('web-installed.json')['runs'][0]['sha256']==sha(asset)
    # Full body, facial detail and chest/sleeves all keep the exact DPR2 source.
    sheet=Image.new('RGB',(2880,2410),'white');d=ImageDraw.Draw(sheet)
    for col,v in enumerate(['0','installed']):
        folder=OUT/v;x=col*1440;d.text((x+20,15),'display2' if col==0 else f'texture {selected}',fill='black')
        full=Image.open(folder/'web-full.png').resize((1440,900),Image.Resampling.LANCZOS);sheet.paste(full,(x,45))
        face=Image.open(folder/'web-face.png');sheet.paste(face,(x+400,960))
        sleeve=Image.open(folder/'web-sleeve.png').resize((1440,900),Image.Resampling.LANCZOS);sheet.paste(sleeve,(x,1490))
    sheet.save(OUT/'web-desktop.png')
    verify=OUT/'verify-workspace';verify.mkdir(exist_ok=True)
    # Build/test writes remain inside .work; no changes to the running server.
    for name in ['src','public','scripts','e2e','docs','.github','.claude']:
        shutil.copytree(ROOT/name,verify/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','worktrees'))
    for p in ROOT.iterdir():
        if p.is_file() and p.name not in ['.git','.DS_Store'] and not p.is_symlink():shutil.copy2(p,verify/p.name)
    if not (verify/'node_modules').exists():os.symlink(ROOT/'node_modules',verify/'node_modules',target_is_directory=True)
    if not (verify/'.git').exists():subprocess.run(['git','init','-q',str(verify)],check=True)
    config=(ROOT/'playwright.config.ts').read_text().replace('fullyParallel: true,','fullyParallel: true,\n  workers: 4,').replace("...devices['Desktop Chrome'],","...devices['Desktop Chrome'],\n    channel: 'chrome',\n    launchOptions: { args: ['--enable-gpu', '--use-angle=metal'] },")
    (verify/'playwright.config.ts').write_text(config)
    with (OUT/'verify.log').open('w') as log:
        result=subprocess.run(['pnpm','verify'],cwd=verify,env={**os.environ,'E2E_PORT':'4423'},stdout=log,stderr=subprocess.STDOUT)
    equality={}
    for name in ['src','e2e','scripts']:
        files=[p for p in (ROOT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        equality[name]=all(sha(p)==sha(verify/p.relative_to(ROOT)) for p in files)
    assert all(equality.values())
    log=(OUT/'verify.log').read_text();passed=re.search(r'(\d+) passed \(([^)]+)\)',log)
    metric={'stage':'texture','completed_at':datetime.now().astimezone().isoformat(),'selected':selected,'measurement':measure,'uv':read('uv.json'),'atlas':{name:read(name+'-uv-atlas.json') for name in ['body','head_face']},'filter':read('filter.json'),'source_check':read('source-check.json'),'asset':{'bytes':asset.stat().st_size,'MiB':asset.stat().st_size/1048576,'sha256':sha(asset),'under_15_MiB':asset.stat().st_size<=15*1048576,'triangles':404807},'preservation':{'blender':read('blender-preservation.json'),'gltf':compression},'validator':{'compressed':read(str(selected)+'/validator.json')['issues'],'decoded':read(str(selected)+'/validator-decoded.json')['issues']},'web':read('web.json'),'installed':read('web-installed.json'),'verify':{'command':'pnpm verify','cwd':'texture/verify-workspace','exit_code':result.returncode,'passed':int(passed[1]) if passed else None,'duration':passed[2] if passed else None,'source_equality':equality,'browser':'installed Chrome / ANGLE Metal','config_difference':'Verification copy only: Chrome channel, Metal GPU and 4 workers; port4423. Source config unchanged.'},'assumptions':['15 MiB = 15*1024*1024 bytes.','Variant1 preserves the full4096 source losslessly; variant0 was2048/q75. Their difference includes resizing, mip selection and previous lossy encoding.','Screenshot crop approximates the described author chest/sleeves/hands because the original author screenshot is not attached; exact crop and camera are recorded.','High-frequency energy and small contrasting blobs are proxies, not ground-truth triangle-face labels.','The UV proxy is position-welded and relaxed only for unwrapping; the accepted visible surface and skinning are preserved.','Roughness/metallic are also transferred to the new UVs, without bilateral smoothing; values are not artistically retuned.','Body collar n-gons retain their original topology and normals; planar UVs occupy a reserved atlas strip.']}
    if (OUT/'visual-review.json').exists():metric['visual_review']=read('visual-review.json')
    (OUT/'metrics.json').write_text(json.dumps(metric,ensure_ascii=False,indent=2)+'\n')
    if result.returncode:raise RuntimeError('pnpm verify failed; see verify.log')
    print(json.dumps(metric['asset'],indent=2));print(metric['verify'])
if __name__=='__main__':main()
