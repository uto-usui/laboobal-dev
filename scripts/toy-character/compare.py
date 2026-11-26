"""ImageMagick comparisons, using fixed reference coordinates and camera scale."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def magick(*args):
    subprocess.run(['magick', *map(str, args)], check=True)


def main(out):
    for view, x in [('front', 397), ('side', 370)]:
        ref = out / f'reference-{view}.png'
        magick(ROOT / f'docs/toy-character/design/turnaround-{view}.png', '-crop', f'460x420+{x}+10', '+repage', '-background', '#dad9df', '-gravity', 'center', '-extent', '460x460', '-resize', '1024x1024!', ref)
        magick(ref, out / f'{view}.png', '+append', out / f'compare-{view}.png')
        magick(ref, out / f'{view}.png', '-evaluate-sequence', 'mean', out / f'overlay-{view}.png')
    magick(out / 'blink-0.png', out / 'blink-0.5.png', out / 'blink-1.png', '+append', out / 'blink.png')
    magick(out / 'reference-front.png', out / 'lookdev-front.png', out / 'lookdev-3q.png', '+append', out / 'lookdev-compare.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
