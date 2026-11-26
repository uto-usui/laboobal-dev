"""Verify only requested seeds, source immutability and deliverable files."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
from fidelity_options import add_seed_argument, unique_seeds
from fidelity_generate import completed
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.work/toy-character/fidelity';GEN=ROOT/'.work/toy-character/img3d/fidelity'
def read(name):return json.loads((OUT/name).read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 parser=argparse.ArgumentParser();add_seed_argument(parser)
 parser.add_argument('--stage',choices=['generation','final'],default='final');args=parser.parse_args()
 seed_list=unique_seeds(args.seeds);generation=read('generation.json')
 runs={}
 for seed in seed_list:
  ok=completed(seed,generation)
  assert ok, f'Missing completed seed {seed}'
  runs[str(seed)]={'parameters_match':ok,'input_hash_match':ok,'glb_hash_match':ok,
   'exit_code':generation[str(seed)]['exit_code'],'seconds':generation[str(seed)]['seconds']}
 result={'requested_seeds':seed_list,'generation':runs,
  'total_generation_seconds':sum(v['seconds'] for v in runs.values())}
 if args.stage=='generation':
  result['verification_pass']=True
  (OUT/'generation-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(result,indent=2));return
 norm=read('body-normalization.json');fit=read('fit-landmarks.json')
 source_ok=sha(ROOT/'.work/toy-character/img3d/out/v4-noglasses.glb')==norm['sha256']
 names=['seeds.png','compare-head.png','overlay-front.png','body-with-head.png','design-landmarks.png','metrics.json','seed-scores.json','log.md','fidelity.blend']
 files={name:{'exists':(OUT/name).is_file(),'bytes':(OUT/name).stat().st_size if (OUT/name).exists() else 0} for name in names}
 for name in names:
  if name.endswith('.png') and files[name]['exists']:
   with Image.open(OUT/name) as im:files[name]['size']=list(im.size);im.verify()
 result.update(source_glb_unchanged=source_ok,body_height_m=norm['result_height_m'],shoe_bottom_z=norm['shoe_bottom_z'],
  files=files,cage_in_2000_5000_vertices=2000<=fit['geometry']['cage_vertices']<=5000,
  neck_connected=fit['geometry']['head_neck_connected'],fixed_cage_max_drift_m=fit['geometry']['cage_fixed_max_drift_m'])
 result['verification_pass']=source_ok and all(v['exists'] and v['bytes']>0 for v in files.values()) and result['cage_in_2000_5000_vertices'] and not result['neck_connected'] and result['fixed_cage_max_drift_m']<1e-6 and fit['selected_seed'] in seed_list
 (OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k not in ['files','generation']},indent=2))
 assert result['verification_pass']
if __name__=='__main__':main()
