"""Run each comparison input once and sample the whole process tree's RSS."""
import csv
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.work/toy-character/img3d'


def tree_rss(pid):
    rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss='], text=True)
    processes = [tuple(map(int, line.split())) for line in rows.splitlines()]
    selected = {pid}
    while True:
        descendants = {p for p, parent, _ in processes if parent in selected}
        if descendants <= selected:
            break
        selected |= descendants
    return sum(rss for p, _, rss in processes if p in selected)


def main():
    summary = {}
    for name in ['v4', 'v4-noglasses']:
        output = WORK / 'out' / f'{name}.glb'
        if output.exists():
            raise SystemExit(f'Refusing to regenerate existing {output.name}')
        command = [sys.executable, str(WORK / 'AssetFurnace/scripts/pixal3d_generate.py'),
                   str(WORK / f'input/{name}.png'), str(output),
                   '--seed', '42', '--res', '1024', '--steps', '12']
        start = time.monotonic()
        started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        peak = 0
        with (WORK / f'logs/{name}.log').open('w') as log, \
                (WORK / f'logs/{name}-rss.csv').open('w') as samples:
            writer = csv.writer(samples)
            writer.writerow(['elapsed_seconds', 'process_tree_rss_kib'])
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                       cwd=ROOT, env=os.environ.copy())
            while process.poll() is None:
                rss = tree_rss(process.pid)
                peak = max(peak, rss)
                writer.writerow([round(time.monotonic() - start, 2), rss])
                samples.flush()
                time.sleep(2)
        summary[name] = {'started_at': started_at, 'seconds': round(time.monotonic() - start, 2),
                         'peak_process_tree_rss_kib': peak, 'exit_code': process.returncode,
                         'seed': 42, 'res': 1024, 'steps': 12}
        (WORK / 'generation-metrics.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(name, summary[name], flush=True)
        if process.returncode:
            raise SystemExit(process.returncode)


if __name__ == '__main__':
    main()
