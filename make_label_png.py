import json
import os
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont


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


def main():
    payload = json.load(sys.stdin)
    out = payload["path"]
    text = payload["text"]
    requested_size = float(payload.get("size", 1.5))
    wrap = int(payload.get("wrap", 62))

    pixel_size = max(22, min(48, int(requested_size * 17)))
    title_font = font(pixel_size + 6, bold=True)
    body_font = font(pixel_size, bold=False)

    raw_lines = []
    for line in text.splitlines():
        if len(line) > wrap:
            raw_lines.extend(textwrap.wrap(line, width=wrap))
        else:
            raw_lines.append(line)

    lines = raw_lines or [""]
    padding = 16
    line_gap = max(6, int(pixel_size * 0.28))
    draw_probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = []
    heights = []
    for i, line in enumerate(lines):
        use_font = title_font if i == 0 and len(lines) > 1 else body_font
        bbox = draw_probe.textbbox((0, 0), line, font=use_font)
        widths.append(max(1, bbox[2] - bbox[0]))
        heights.append(max(pixel_size, bbox[3] - bbox[1]))

    image_w = min(1600, max(160, max(widths) + padding * 2))
    image_h = min(900, max(48, sum(heights) + line_gap * (len(lines) - 1) + padding * 2))
    img = Image.new("RGBA", (image_w, image_h), (248, 247, 240, 238))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, image_w - 1, image_h - 1), outline=(70, 70, 64, 210), width=2)

    y = padding
    for i, line in enumerate(lines):
        use_font = title_font if i == 0 and len(lines) > 1 else body_font
        draw.text((padding, y), line, font=use_font, fill=(22, 24, 24, 255))
        y += heights[i] + line_gap

    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG", optimize=True)


if __name__ == "__main__":
    main()
