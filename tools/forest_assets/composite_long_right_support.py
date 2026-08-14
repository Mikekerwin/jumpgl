#!/usr/bin/env python3
"""Composite only an AI-painted long-branch buttress onto the approved cartridge."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "jumpgl-web" / "forest-art-workbench"
ORIGINAL = WORKBENCH / "source-overrides" / "attachment-proof" / "long-right-a-original.png"
PAINT = WORKBENCH / "previews" / "long-right-base" / "generated-two-part-support-alpha.png"
OUTPUT = WORKBENCH / "previews" / "long-right-base" / "long-right-a-support-preview.png"
ASSEMBLY = WORKBENCH / "previews" / "long-right-base" / "long-right-a-support-assembly.png"
NEUTRAL = WORKBENCH / "generated" / "attachment-proof" / "neutral-tree-1024x1536.png"


def main() -> None:
    original = Image.open(ORIGINAL).convert("RGBA")
    generated = Image.open(PAINT).convert("RGBA")

    scale = original.width / generated.width
    generated = generated.resize(
        (original.width, round(generated.height * scale)), Image.Resampling.LANCZOS
    )
    painted = Image.new("RGBA", original.size)
    painted.alpha_composite(generated, (0, 0))

    # Restrict the model edit to the branch's lower joint. The platform top and
    # the approved trunk remain original pixels; the soft edge avoids a cut seam.
    region = Image.new("L", original.size, 0)
    draw = ImageDraw.Draw(region)
    draw.polygon(
        [
            (102, 104),
            (319, 104),
            (321, 131),
            (282, 151),
            (246, 181),
            (211, 219),
            (176, 257),
            (113, 270),
            (88, 230),
            (91, 151),
        ],
        fill=255,
    )
    region = region.filter(ImageFilter.GaussianBlur(7.0))
    source_alpha = painted.getchannel("A")
    source_alpha = Image.composite(source_alpha, Image.new("L", original.size), region)
    painted.putalpha(source_alpha)

    candidate = original.copy()
    candidate.alpha_composite(painted)
    candidate.save(OUTPUT, "PNG", optimize=True)

    neutral = Image.open(NEUTRAL).convert("RGBA")
    assembly = neutral.copy()
    # Manifest socket: local (127, 105), canonical (558, 770).
    assembly.alpha_composite(candidate, (558 - 127, 770 - 105))
    assembly.crop((250, 450, 1024, 1180)).save(ASSEMBLY, "PNG", optimize=True)


if __name__ == "__main__":
    main()
