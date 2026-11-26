"""Generate requested heads once, recording commands and wall time."""
import argparse, datetime, hashlib, json, subprocess, sys, time
from pathlib import Path
from fidelity_options import add_seed_argument, unique_seeds
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.work/toy-character/img3d'
OUT=WORK/'fidelity'
REPORT=ROOT/'.work/toy-character/fidelity/generation.json'
def completed(seed, records):
 output=OUT/f'head-s{seed}.glb';record=records.get(str(seed),{})
 if not output.exists():
  if record.get('exit_code')==0:raise RuntimeError(f'Completed output is missing; regeneration refused: {output.name}')
  return False
 # Existing geometry is never overwritten, even if its metadata is missing.
 if record.get('exit_code')!=0:
  raise RuntimeError(f'Existing output retained; missing successful record: {output.name}')
 input_hash=hashlib.sha256((OUT/'input/head-front-rgba.png').read_bytes()).hexdigest()
 if record.get('input_sha256')!=input_hash:
  raise RuntimeError('Input changed after generation; existing output retained.')
 provenance=json.loads((OUT/f'head-s{seed}.provenance.json').read_text())
 expected={'res':1024,'steps':12,'gss':10.,'gsh':7.5,'fov':0.3490658503988659,'seed':seed}
 if not all(provenance['parameters'].get(k)==v for k,v in expected.items()):
  raise RuntimeError(f'Generation parameters changed; existing output retained: {output.name}')
 if provenance['input']['sha256']!=input_hash or provenance['output']['sha256']!=hashlib.sha256(output.read_bytes()).hexdigest():
  raise RuntimeError(f'Provenance mismatch; existing output retained: {output.name}')
 return True

def main():
 parser=argparse.ArgumentParser();add_seed_argument(parser);args=parser.parse_args()
 records=json.loads(REPORT.read_text()) if REPORT.exists() else {}
 for seed in unique_seeds(args.seeds):
  key=str(seed);output=OUT/f'head-s{seed}.glb'
  if completed(seed, records):
   print(f'seed {seed}: completed, retained',flush=True);continue
  command=[sys.executable,str(WORK/'AssetFurnace/scripts/pixal3d_generate.py'),str(OUT/'input/head-front-rgba.png'),str(output),'--res','1024','--steps','12','--gss','10','--gsh','7.5','--fov','0.3490658503988659','--seed',str(seed),'--no-matte']
  record={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'input_sha256':hashlib.sha256((OUT/'input/head-front-rgba.png').read_bytes()).hexdigest()}
  start=time.monotonic()
  with (OUT/f'seed-{seed}.log').open('w') as log:
   p=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
  record.update(seconds=round(time.monotonic()-start,2),exit_code=p.returncode)
  records[key]=record;REPORT.write_text(json.dumps(records,indent=2)+'\n')
  print(f'seed {seed}: {record["seconds"]}s; exit {p.returncode}',flush=True)
  if p.returncode:raise SystemExit(p.returncode)
if __name__=='__main__':main()
