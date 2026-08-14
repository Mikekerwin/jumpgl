#!/usr/bin/env python3
"""Prepare a small optimized runtime set for the WebGL forest sandbox."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "jumpgl-web" / "forest-art-workbench"
RUNTIME = ROOT / "jumpgl-web" / "public" / "forest-sandbox" / "assets"
DESKTOP_SOURCE = Path("/Users/OCSAdmin/Desktop/trees")

SELECTIONS = {
    "far": [
        "background/background-007.png",
        "background/background-009.png",
        "background/background-012.png",
        "background/background-014.png",
        "background/background-017.png",
        "background/background-018.png",
        "background/background-039.png",
        "background/background-040.png",
        "background/background-046.png",
        "background/background-049.png",
    ],
    "mid": [
        "middleground/middleground-006.png",
        "middleground/middleground-007.png",
        "middleground/middleground-008.png",
        "middleground/middleground-010.png",
        "mid/mid-001.png",
        "mid/mid-002.png",
        "mid/mid-003.png",
        "mid/mid-004.png",
        "mid/mid-005.png",
    ],
    "base": [
        "single-tree/single-tree-030.png",
        "single-tree/single-tree-031.png",
        "single-tree/single-tree-032.png",
        "single-tree/single-tree-033.png",
        "single-tree/single-tree-045.png",
        "single-tree/single-tree-046.png",
        "single-tree/single-tree-047.png",
    ],
    "trunk": [
        "single-tree/single-tree-012.png",
        "single-tree/single-tree-013.png",
        "single-tree/single-tree-014.png",
        "single-tree/single-tree-015.png",
        "single-tree/single-tree-021.png",
        "single-tree/single-tree-022.png",
        "single-tree/single-tree-023.png",
        "single-tree/single-tree-024.png",
    ],
    "canopy": [
        "single-tree/single-tree-004.png",
        "single-tree/single-tree-005.png",
        "single-tree/single-tree-006.png",
        "single-tree/single-tree-007.png",
        "middleground/middleground-034.png",
        "middleground/middleground-035.png",
        "middleground/middleground-036.png",
    ],
    "platform": [
        "single-tree/single-tree-048.png",
        "single-tree/single-tree-049.png",
        "single-tree/single-tree-050.png",
        "single-tree/single-tree-051.png",
        "single-tree/single-tree-052.png",
        "single-tree/single-tree-056.png",
        "single-tree/single-tree-066.png",
        "single-tree/single-tree-073.png",
    ],
    "detail": [
        "middleground/middleground-058.png",
        "middleground/middleground-059.png",
        "middleground/middleground-060.png",
        "middleground/middleground-069.png",
        "middleground/middleground-070.png",
        "middleground/middleground-079.png",
        "background/background-084.png",
        "background/background-085.png",
        "background/background-088.png",
        "background/background-089.png",
    ],
}

GROUND_ROWS = (
    (90, 418),
    (468, 786),
    (843, 1158),
    (1212, 1527),
    (1588, 1901),
    (1953, 2271),
    (2328, 2643),
)


def soft_white_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    output = []
    for red, green, blue, _ in pixels:
        distance = 255 - min(red, green, blue)
        alpha = max(0, min(255, int((distance - 7) * 12)))
        output.append((red, green, blue, alpha))
    rgba.putdata(output)
    return rgba


def save_webp(source: Path, destination: Path, max_dimension: int = 2048) -> dict:
    image = Image.open(source).convert("RGBA")
    if max(image.size) > max_dimension:
        scale = max_dimension / max(image.size)
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", lossless=True, method=6)
    return {"path": f"assets/{destination.relative_to(RUNTIME)}", "width": image.width, "height": image.height}


def main() -> None:
    if RUNTIME.exists():
        shutil.rmtree(RUNTIME)
    RUNTIME.mkdir(parents=True)

    manifest: dict[str, list[dict]] = {}
    extracted = WORKBENCH / "extracted"
    for category, selections in SELECTIONS.items():
        records = []
        for index, relative in enumerate(selections, start=1):
            source = extracted / relative
            destination = RUNTIME / category / f"{category}-{index:02d}.webp"
            records.append(save_webp(source, destination))
        manifest[category] = records

    ground_source = Image.open(DESKTOP_SOURCE / "ground.png").convert("RGB")
    ground_records = []
    for index, (top, bottom) in enumerate(GROUND_ROWS, start=1):
        crop = soft_white_alpha(ground_source.crop((0, top, ground_source.width, bottom)))
        if crop.width > 4096:
            crop = crop.resize((4096, round(crop.height * 4096 / crop.width)), Image.Resampling.LANCZOS)
        destination = RUNTIME / "ground" / f"ground-{index:02d}.webp"
        destination.parent.mkdir(parents=True, exist_ok=True)
        crop.save(destination, "WEBP", lossless=True, method=6)
        ground_records.append(
            {"path": f"assets/{destination.relative_to(RUNTIME)}", "width": crop.width, "height": crop.height}
        )
    manifest["ground"] = ground_records

    (RUNTIME.parent / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({category: len(records) for category, records in manifest.items()}, indent=2))


if __name__ == "__main__":
    main()
