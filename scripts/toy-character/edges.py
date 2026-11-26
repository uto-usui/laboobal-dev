"""Reproducible edge diagnosis and image-only candidates; never install a GLB."""
import hashlib,json,os,subprocess
from pathlib import Path
from lowpoly import WORK
HERE=Path(__file__).resolve().parent

def run(out,studio,render):
    phase=os.environ.get('EDGES_PHASE','all')
    asset=HERE.parents[1]/'src/demos/toy-figure/assets/character.glb'
    before=hashlib.sha256(asset.read_bytes()).hexdigest()
    env={**os.environ,'TOY_EDGES_OUT':str(out),'EDGES_UV':'atlas'}
    python=str(WORK/'venv-geo/bin/python')
    def execute(label,command,extra=None):
        with (out/(label+'.log')).open('w') as log:
            subprocess.run(command,cwd=HERE.parents[1],env={**env,**(extra or {})},stdout=log,stderr=subprocess.STDOUT,check=True)
        print('edges:',label,'complete',flush=True)
    def node(label,mode):
        execute(label,['pnpm','dlx','--package=@gltf-transform/cli@4.5.1','--package=gltf-validator','-c','node "$TOY_EDGES_SCRIPT"'],{'TOY_EDGES_SCRIPT':str(HERE/'edges_gltf.mjs'),'EDGES_GLTF_PHASE':mode})
    if phase in ['all','diagnose']:
        node('diagnostic-gltf','diagnose')
        execute('web-diagnosis',[python,str(HERE/'edges_web.py')],{'EDGES_CANDIDATES':'a,b,c,d,e,b-control,c-control,b-png,d4096,d-lossless'})
        execute('measurement-diagnosis',[python,str(HERE/'edges_measure.py')])
    if phase in ['all','process']:execute('process',[python,str(HERE/'edges_process.py')])
    if phase in ['all','package']:node('package','package')
    if phase in ['all','web']:execute('web-variants',[python,str(HERE/'edges_web.py')],{'EDGES_CANDIDATES':'x1,x2,x3'})
    if phase in ['all','measure']:execute('measurement-final',[python,str(HERE/'edges_measure.py')])
    assert hashlib.sha256(asset.read_bytes()).hexdigest()==before,'Installed asset changed'
    (out/'installed-preservation.json').write_text(json.dumps({'sha256_before':before,'sha256_after':hashlib.sha256(asset.read_bytes()).hexdigest(),'unchanged':True},indent=2)+'\n')
    if phase in ['all','measure']:execute('report',[python,str(HERE/'edges_report.py')])
