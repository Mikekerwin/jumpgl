#!/usr/bin/env python3
"""Replace chroma-key contamination with nearby opaque artwork colors.

This intentionally leaves alpha and all non-magenta pixels untouched.  It is a
post-key edge decontaminator, not a color grade or an opacity treatment.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def is_magenta_contamination(
    pixel: tuple[int, int, int, int],
    dominance: int,
    min_red_blue: int,
) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and red > min_red_blue
        and blue > min_red_blue
        and min(red, blue) - green >= dominance
    )


def clean(
    input_path: Path,
    output_path: Path,
    dominance: int,
    min_red_blue: int,
    regions: list[tuple[int, int, int, int]],
) -> tuple[int, int]:
    image = Image.open(input_path).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    if not regions:
        regions = [(0, 0, width, height)]
    contaminated: set[tuple[int, int]] = set()
    for left, top, right, bottom in regions:
        for y in range(max(0, top), min(height, bottom)):
            for x in range(max(0, left), min(width, right)):
                if is_magenta_contamination(pixels[x, y], dominance, min_red_blue):
                    contaminated.add((x, y))
    original_count = len(contaminated)

    for _ in range(64):
        if not contaminated:
            break
        replacements: dict[tuple[int, int], tuple[int, int, int, int]] = {}
        for x, y in contaminated:
            neighbors: list[tuple[int, int, int, int]] = []
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_x = x + offset_x
                    neighbor_y = y + offset_y
                    if not (0 <= neighbor_x < width and 0 <= neighbor_y < height):
                        continue
                    if (neighbor_x, neighbor_y) in contaminated:
                        continue
                    neighbor = pixels[neighbor_x, neighbor_y]
                    if neighbor[3] > 0:
                        neighbors.append(neighbor)
            if not neighbors:
                continue
            alpha = pixels[x, y][3]
            replacements[(x, y)] = (
                round(sum(pixel[0] for pixel in neighbors) / len(neighbors)),
                round(sum(pixel[1] for pixel in neighbors) / len(neighbors)),
                round(sum(pixel[2] for pixel in neighbors) / len(neighbors)),
                alpha,
            )
        if not replacements:
            break
        for coordinate, replacement in replacements.items():
            pixels[coordinate] = replacement
        contaminated.difference_update(replacements)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, "PNG", optimize=True)
    return original_count, len(contaminated)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--dominance", type=int, default=18)
    parser.add_argument("--min-red-blue", type=int, default=70)
    parser.add_argument(
        "--region",
        action="append",
        default=[],
        metavar="LEFT,TOP,RIGHT,BOTTOM",
        help="Limit cleanup to a rectangle; may be repeated.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.out.exists() and not args.force:
        parser.error(f"output exists: {args.out}; pass --force to overwrite")
    regions = [tuple(map(int, raw.split(","))) for raw in args.region]
    if any(len(region) != 4 for region in regions):
        parser.error("each --region must contain four comma-separated integers")
    cleaned, unresolved = clean(
        args.input,
        args.out,
        args.dominance,
        args.min_red_blue,
        regions,
    )
    print(f"Cleaned {cleaned - unresolved}/{cleaned} magenta-contaminated pixels")
    if unresolved:
        print(f"Warning: {unresolved} pixels had no non-magenta opaque neighbor")


if __name__ == "__main__":
    main()
