#!/usr/bin/env python3
"""Extract an antialiased RGBA sprite from an image-gen magenta backing."""

from __future__ import annotations

import argparse
import math
import statistics
from pathlib import Path

from PIL import Image


def smoothstep(start: float, end: float, value: float) -> float:
    amount = max(0.0, min(1.0, (value - start) / (end - start)))
    return amount * amount * (3.0 - 2.0 * amount)


def extract(source_path: Path, output_path: Path) -> None:
    source = Image.open(source_path).convert("RGB")
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels = source.load()
    output_pixels = output.load()

    border_samples = []
    stride = max(1, min(source.size) // 160)
    for x in range(0, source.width, stride):
        border_samples.extend((source_pixels[x, 0], source_pixels[x, source.height - 1]))
    for y in range(0, source.height, stride):
        border_samples.extend((source_pixels[0, y], source_pixels[source.width - 1, y]))
    key_red, key_green, key_blue = (
        round(statistics.median(pixel[channel] for pixel in border_samples))
        for channel in range(3)
    )

    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = source_pixels[x, y]
            # Image generation does not return a perfectly uniform #ff00ff field;
            # key on magenta dominance instead of exact RGB distance. Golden bark,
            # green leaves, and cyan shadow all have a negative/low score.
            magenta_score = min(red, blue) - green
            alpha = 1.0 - smoothstep(72.0, 176.0, magenta_score)
            if alpha <= 0.002:
                continue

            # Remove magenta spill from antialiased edge pixels. The generated
            # artwork is treated as foreground composited over #ff00ff.
            resolved_alpha = max(0.035, alpha)
            foreground_red = round((red - key_red * (1.0 - resolved_alpha)) / resolved_alpha)
            foreground_green = round((green - key_green * (1.0 - resolved_alpha)) / resolved_alpha)
            foreground_blue = round((blue - key_blue * (1.0 - resolved_alpha)) / resolved_alpha)
            output_pixels[x, y] = (
                max(0, min(255, foreground_red)),
                max(0, min(255, foreground_green)),
                max(0, min(255, foreground_blue)),
                round(255 * alpha),
            )

    # Ignore isolated low-alpha chroma noise when finding the useful sprite box.
    alpha_box = output.getchannel("A").point(lambda value: 255 if value >= 64 else 0).getbbox()
    if alpha_box is None:
        raise RuntimeError(f"No non-magenta artwork found in {source_path}")
    padding = 8
    left, top, right, bottom = alpha_box
    crop_box = (
        max(0, left - padding),
        max(0, top - padding),
        min(output.width, right + padding),
        min(output.height, bottom + padding),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.crop(crop_box).save(output_path, "PNG", optimize=True)
    print(
        f"{output_path}: key={(key_red, key_green, key_blue)} "
        f"crop={crop_box} size={output.crop(crop_box).size}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    extract(args.source, args.output)


if __name__ == "__main__":
    main()
