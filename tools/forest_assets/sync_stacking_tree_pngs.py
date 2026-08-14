#!/usr/bin/env python3
"""Sync hand-authored stacking-tree PNG sources to lossless runtime WebP."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "jumpgl-web/public/forest-sandbox/assets/stacking-tree"
AUTHORED_STEMS = (
    "middle-calm",
    "middle-hollow-v1",
    "middle-hollow-v1-overlay",
    "middle-moss",
    "middle-sparse",
    "decoration-leafy-left-c",
    "decoration-leafy-right-e",
)


def main() -> None:
    results = []
    for stem in AUTHORED_STEMS:
        source_path = RUNTIME / f"{stem}.png"
        output_path = RUNTIME / f"{stem}.webp"
        source = Image.open(source_path).convert("RGBA")
        source.save(output_path, "WEBP", lossless=True, quality=100, method=6, exact=True)

        decoded = Image.open(output_path).convert("RGBA")
        if decoded.size != source.size:
            raise RuntimeError(f"WebP dimensions changed for {stem}: {decoded.size} != {source.size}")
        if ImageChops.difference(decoded.getchannel("A"), source.getchannel("A")).getbbox():
            raise RuntimeError(f"WebP alpha changed for {stem}")

        # Transparent RGB is not visible and some WebP decoders normalize it.
        # Every visible or feathered source pixel must remain byte-exact.
        source_pixels = source.load()
        decoded_pixels = decoded.load()
        visible_mismatch = 0
        for y in range(source.height):
            for x in range(source.width):
                if source_pixels[x, y][3] and source_pixels[x, y] != decoded_pixels[x, y]:
                    visible_mismatch += 1
        if visible_mismatch:
            raise RuntimeError(f"WebP visible pixels changed for {stem}: {visible_mismatch}")

        results.append({
            "source": source_path.name,
            "runtime": output_path.name,
            "size": list(source.size),
            "sourceBytes": source_path.stat().st_size,
            "runtimeBytes": output_path.stat().st_size,
        })
    for result in results:
        print(result)


if __name__ == "__main__":
    main()
