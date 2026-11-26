"""Assemble labeled comparisons with fixed source-image coordinates."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.work/toy-character/img3d'
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
BG = (239, 239, 242)


def reference(scale, target_z):
    source = Image.open(WORK / 'input/v4.png').convert('RGB')
    side = round(scale * 1177)
    center_y = 1213 - target_z * 1177
    canvas = Image.new('RGB', (side, side), (218, 217, 223))
    canvas.paste(source, (round(side / 2 - 627), round(side / 2 - center_y)))
    return canvas


def image(path):
    return Image.open(path).convert('RGB')


def board(rows, labels, row_labels, output, cell, note):
    header, rowtitle, footer = 62, 42, 48
    result = Image.new('RGB', (len(labels) * cell, header + len(rows) * (cell + rowtitle) + footer), BG)
    draw = ImageDraw.Draw(result)
    font = ImageFont.truetype(FONT, 24)
    small = ImageFont.truetype(FONT, 18)
    for col, label in enumerate(labels):
        draw.text((col * cell + 14, 18), label, font=font, fill=(30, 30, 35))
    for row, (pictures, label) in enumerate(zip(rows, row_labels)):
        y = header + row * (cell + rowtitle)
        draw.text((14, y + 8), label, font=small, fill=(55, 55, 60))
        for col, picture in enumerate(pictures):
            pos = (col * cell, y + rowtitle)
            if picture is None:
                draw.text((pos[0] + 30, pos[1] + cell // 2), '45度の原画なし', font=font, fill=(70, 70, 75))
            else:
                result.paste(picture.resize((cell, cell), Image.Resampling.LANCZOS), pos)
    draw.text((14, result.height - footer + 12), note, font=small, fill=(55, 55, 60))
    result.save(WORK / output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--best', choices=['v4', 'v4-noglasses'], required=True)
    args = parser.parse_args()
    renders = WORK / 'renders'
    head = ROOT / '.work/toy-character/head'
    rows = []
    for view, baseline in [('front', 'lookdev-front.png'), ('45', 'lookdev-3q.png')]:
        rows.append([reference(.405, .852) if view == 'front' else None,
                     image(head / baseline),
                     image(renders / 'v4' / f'head-{view}.png'),
                     image(renders / 'v4-noglasses' / f'head-{view}.png')])
    board(rows, ['デザイン画 v4', 'Blender Python / 8版', 'Pixal3D / v4', 'Pixal3D / 眼鏡なし'],
          ['正面', '水平45度 / 既存lookdevと同じ軽い俯角'], 'compare-head.png', 600,
          '全高1m・頭の画角0.405m。既存lookdevの照明とカメラを共用。原画は正面のみ。')
    chosen = renders / args.best
    board([[reference(1.12, .5)] + [image(chosen / f'body-{v}.png') for v in ['front', '45', 'side', 'back']]],
          ['デザイン画 v4', '正面', '45度', '横', '背面'], [f'全身 / {args.best}'],
          'body-views.png', 480, '全高1m・正投影・同じ照明。背面は正面画像から推定された形。')
    board([[image(chosen / f'clay-body-{v}.png') for v in ['front', '45']],
           [image(chosen / f'clay-head-{v}.png') for v in ['front', '45']]],
          ['正面', '45度'], [f'全身 / {args.best}', '頭の拡大'], 'clay.png', 700,
          '白い材質へ置換。色・法線・粗さなどの生成テクスチャをすべて外して形を確認。')


if __name__ == '__main__':
    main()
