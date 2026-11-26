import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

out = Path(".work/toy-character/dino4")
font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 14)
small = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 11)
paper = "#f4f3ed"
ink = "#272c28"
species = {"Triceratops": 2, "Stegosaurus": 4, "Apatosaurus": 5}
modes = {
    "raw": "(a) Original Walk",
    "previous": "(b) Before this change",
    "corrected": "(c) Balanced Walk",
}


def compare():
    columns, cell_w, cell_h, gutter = 12, 246, 146, 178
    frames = out / "compare-frames"
    groups = []
    for name in species:
        files = sorted(frames.glob(f"{name}-raw-*.png"))
        for start in range(0, len(files), columns):
            groups.append((name, [file.stem.split("-")[-1] for file in files[start:start + columns]]))
    section = 26 + len(modes) * cell_h
    sheet = Image.new("RGB", (gutter + columns * cell_w, len(groups) * section), paper)
    draw = ImageDraw.Draw(sheet)
    for idx, (name, numbers) in enumerate(groups):
        y = idx * section
        draw.text((8, y + 5), f"{name} | fixed side camera | ground marks every 0.5 m", font=font, fill=ink)
        for j, (mode, label) in enumerate(modes.items()):
            yy = y + 26 + j * cell_h
            draw.text((8, yy + 24), label, font=font, fill=ink)
            for n, number in enumerate(numbers):
                x = gutter + n * cell_w
                draw.text((x + 3, yy + 3), f"{int(number) / 12:.3f} s", font=small, fill=ink)
                image = Image.open(frames / f"{name}-{mode}-{number}.png")
                image.thumbnail((cell_w - 2, cell_h - 17))
                sheet.paste(image, (x, yy + 17))
    sheet.save(out / "legs-compare.png")

    keyframes = Image.new("RGB", (1270, 1100), paper)
    draw = ImageDraw.Draw(keyframes)
    for k, name in enumerate(species):
        selected = sorted(frames.glob(f"{name}-raw-*.png"))
        chosen = [selected[round(i * (len(selected) - 1) / 4)].stem.split("-")[-1] for i in range(5)]
        y = 365 * k
        draw.text((8, y + 4), name, font=font, fill=ink)
        for j, mode in enumerate(modes):
            for i, number in enumerate(chosen):
                image = Image.open(frames / f"{name}-{mode}-{number}.png")
                image.thumbnail((248, 104))
                keyframes.paste(image, (254 * i, y + 25 + 113 * j))
            draw.text((6, y + 26 + 113 * j), modes[mode], font=small, fill=ink, stroke_width=2, stroke_fill=paper)
    keyframes.save(out / "legs-keyframes.png")


def quadrupeds():
    data = json.loads((out / "desktop-metrics.json").read_text())
    frames = out / "quadruped-frames"
    frames.mkdir(exist_ok=True)
    columns, cell_w, cell_h = 8, 235, 154
    sheet = Image.new("RGB", (columns * cell_w, len(species) * 2 * cell_h + 42), paper)
    draw = ImageDraw.Draw(sheet)
    moments = []
    for idx, (name, species_id) in enumerate(species.items()):
        visible = []
        for row in data["timeline"]:
            for bounds in row["view"]["animalBounds"]:
                if bounds["species"] != species_id or not 0 < bounds["depth"] < 180:
                    continue
                if abs(bounds["minX"]) > .90 or abs(bounds["maxX"]) > .90 or bounds["maxY"] > .95:
                    continue
                width = bounds["maxX"] - bounds["minX"]
                if row["elapsed"] < 171:
                    covered = sum(
                        max(0, min(bounds["maxX"], other["maxX"]) - max(bounds["minX"], other["minX"]))
                        for other in row["view"]["animalBounds"]
                        if other["species"] != species_id and 0 < other["depth"] < bounds["depth"]
                    )
                    center_distance = abs(bounds["maxX"] + bounds["minX"])
                    score = center_distance + 0.05 / width + 6 * covered / width
                    visible.append((score, row["elapsed"], bounds))
        _, start, bounds = min(visible)
        if start > 2:
            start -= .25
        moments.append({"name": name, "seconds": start})
        width, height = 1440, 900
        x1 = max(0, int((bounds["minX"] + 1) * width / 2) - 120)
        x2 = min(width, int((bounds["maxX"] + 1) * width / 2) + 120)
        y1 = max(0, int((1 - bounds["maxY"]) * height / 2) - 25)
        y2 = min(height, int((1 - bounds["minY"]) * height / 2) + 45)
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(start),
            "-i", str(out / "desktop.webm"), "-vf", f"fps=12,crop={x2-x1}:{y2-y1}:{x1}:{y1}",
            "-frames:v", str(columns * 2), str(frames / f"{name}-%02d.png"),
        ], check=True)
        for n, file in enumerate(sorted(frames.glob(f"{name}-*.png"))):
            x = n % columns * cell_w
            y = idx * (2 * cell_h + 14) + n // columns * cell_h
            draw.text((x + 4, y + 3), f"{name} | {start + n/12:.3f}s", font=small, fill=ink)
            image = Image.open(file)
            image.thumbnail((cell_w - 2, cell_h - 19))
            sheet.paste(image, (x + 1, y + 18))
    sheet.save(out / "quadruped-walk.png")
    (out / "quadruped-moments.json").write_text(json.dumps(moments, indent=2) + "\n")


if "compare" in sys.argv:
    compare()
if "quadrupeds" in sys.argv:
    quadrupeds()
