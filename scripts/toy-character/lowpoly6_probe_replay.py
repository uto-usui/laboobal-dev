"""Replay the supplied probe verbatim and compare the complete generated surface."""
from pathlib import Path
import numpy as np,subprocess,json
import sys
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]);replay=out/'probe-replay';replay.mkdir(exist_ok=True)
d=np.load(out/'source.npz');w=np.load(out/'winding.npz');np.savez(replay/'sol_20_7.npz',lo=w['lo'],h=w['h']);np.save(replay/'faceattr_part_id.npy',d['labels'])
for target,src in [('body.npz','../source.npz'),('cnt20.npy','../escape-counts.npy')]:
 p=replay/target
 if not p.exists():p.symlink_to(src)
with (replay/'stdout.log').open('w') as f:subprocess.run([str(root/'.work/toy-character/venv-geo/bin/python'),str(root/'.work/toy-character/solidify-probe/final.py')],cwd=replay,stdout=f,stderr=subprocess.STDOUT,check=True)
a=np.load(out/'filled-grid.npz')['solid'];b=np.load(replay/'final_solid.npz')['Sol'];v=np.load(out/'filled.npz');r=np.load(replay/'final_mc.npz')
result={'same_solid_grid':bool(np.array_equal(a,b)),'differing_grid_cells':int((a!=b).sum()),'same_marching_cubes_faces':bool(np.array_equal(v['F'],r['F'])),'max_marching_cubes_vertex_difference_m':float(abs(v['V']-r['V']).max()),'probe_script_sha256':__import__('hashlib').sha256((root/'.work/toy-character/solidify-probe/final.py').read_bytes()).hexdigest()}
(out/'probe-reproduction.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
