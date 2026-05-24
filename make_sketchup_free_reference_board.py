import os
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = "/Users/gaia/Documents/Codex/2026-05-24/design-inside-sketchup-a-cost-effective"
OUT = os.path.join(ROOT, "6x12_trailer_tiny_home_SKETCHUP_FREE_reference_board.png")


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size, index=1 if bold else 0)
            except Exception:
                try:
                    return ImageFont.truetype(path, size=size)
                except Exception:
                    pass
    return ImageFont.load_default()


W, H = 2600, 1580
img = Image.new("RGB", (W, H), (244, 242, 235))
draw = ImageDraw.Draw(img)

title_font = font(54, True)
subtitle_font = font(28, False)
head_font = font(31, True)
body_font = font(23, False)
small_font = font(20, False)

draw.text((70, 46), "6 ft x 12 ft Trailer Tiny Home: Five Buildable Design Studies", font=title_font, fill=(24, 26, 27))
draw.text(
    (70, 116),
    "Use with the SketchUp Free STL model. The raised block numbers 1-5 in the STL match these columns.",
    font=subtitle_font,
    fill=(70, 72, 72),
)
draw.text(
    (70, 158),
    "Free SketchUp limitation: STL carries geometry only. Materials, text, groups, and scene tabs are documented here as an importable PNG board.",
    font=small_font,
    fill=(105, 81, 54),
)

studies = [
    (
        "1. Wright / Usonian",
        (156, 96, 45),
        [
            "Philosophy: low, horizontal, warm, integrated built-ins. No RV styling.",
            "Cost-saving move: one continuous plywood storage/kitchen/bed edge.",
            "Main material system: plywood box, dark trim, simple steel, stock windows.",
            "Strongest spatial idea: compressed central path beside a thick useful wall.",
            "Sacrifice: low headroom and little loose furniture.",
        ],
    ),
    (
        "2. Shigeru Ban Shelter",
        (178, 206, 211),
        [
            "Philosophy: lightweight emergency shelter, modular and replaceable.",
            "Cost-saving move: repeated 24-inch bays and simple removable panels.",
            "Main material system: 2x frame, polycarbonate, canvas, crate modules.",
            "Strongest spatial idea: clear service path with replaceable room parts.",
            "Sacrifice: limited acoustic and thermal privacy.",
        ],
    ),
    (
        "3. Lacaton & Vassal",
        (154, 178, 180),
        [
            "Philosophy: maximum usable space for minimum money.",
            "Cost-saving move: one generous translucent shell, few finish layers.",
            "Main material system: polycarbonate, galvanized frame, raw plywood.",
            "Strongest spatial idea: larger light volume makes 6x12 feel less punishing.",
            "Sacrifice: refinement, insulation, and cabinetry detail.",
        ],
    ),
    (
        "4. Alexander Cabin",
        (171, 92, 60),
        [
            "Philosophy: human patterns: entry pause, sleeping nook, window place.",
            "Cost-saving move: one thick plywood edge stores, cooks, seats, divides.",
            "Main material system: plywood shell, metal roof, canvas curtain.",
            "Strongest spatial idea: small rooms within one room.",
            "Sacrifice: more carpentry cuts than the plain version.",
        ],
    ),
    (
        "5. Contractor Reality",
        (132, 132, 118),
        [
            "Philosophy: no architect ego; cheapest plausible shelter build.",
            "Cost-saving move: square cuts, common studs, plywood/OSB, one metal roof.",
            "Main material system: off-the-shelf trailer, 2x studs, plywood, bins.",
            "Strongest spatial idea: obvious to build, replace, and repair.",
            "Sacrifice: beauty, finesse, and spatial generosity.",
        ],
    ),
]

margin = 70
gap = 24
col_w = (W - margin * 2 - gap * 4) // 5
top = 230
bottom = 1170

for idx, (title, color, lines) in enumerate(studies):
    x = margin + idx * (col_w + gap)
    draw.rounded_rectangle((x, top, x + col_w, bottom), radius=12, fill=(255, 254, 249), outline=(92, 92, 86), width=2)
    draw.rectangle((x, top, x + col_w, top + 18), fill=color)
    draw.text((x + 22, top + 38), title, font=head_font, fill=(24, 26, 27))

    y = top + 100
    for line in lines:
        wrapped = textwrap.wrap(line, width=34)
        for wline in wrapped:
            draw.text((x + 22, y), wline, font=body_font, fill=(34, 36, 36))
            y += 31
        y += 16

draw.rounded_rectangle((70, 1210, W - 70, 1510), radius=12, fill=(232, 229, 218), outline=(102, 102, 96), width=2)
draw.text((100, 1238), "SketchUp Free Import Notes", font=head_font, fill=(24, 26, 27))
notes = [
    "1. Import the STL file as inches. Overall board should read about 708 in wide, 256 in deep, and 104 in tall.",
    "2. Every concept includes sleeping area, kitchenette, storage, fold-down work/eating surface, utility zone, and central path.",
    "3. STL is one geometry-only model. Apply simple SketchUp materials after import if you want color.",
    "4. Import this PNG as an image and place it beside or behind the STL as the study-board legend.",
    "5. Scene tabs are not possible through STL import; use the raised numbers and orbit/zoom to review each concept.",
]
y = 1286
for note in notes:
    draw.text((100, y), note, font=subtitle_font, fill=(54, 56, 56))
    y += 34

img.save(OUT, "PNG", optimize=True)
print(OUT)
