#!/usr/bin/env python3
"""Extract isolated forest assets from white-background concept sheets."""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class SheetConfig:
    name: str
    filename: str
    min_area: int
    min_width: int
    min_height: int
    crop: tuple[int, int, int, int] | None = None
    white_threshold: int = 244
    group_radius: int = 9
    use_existing_alpha: bool = False
    manual_boxes: tuple[tuple[int, int, int, int], ...] | None = None


SHEETS = (
    SheetConfig("background", "background.png", 1800, 18, 45, group_radius=11),
    SheetConfig("middleground", "middleground.png", 1800, 22, 45, group_radius=11),
    SheetConfig(
        "mid",
        "mid.png",
        1200,
        30,
        80,
        group_radius=7,
        manual_boxes=(
            (0, 0, 305, 1024),
            (305, 0, 307, 1024),
            (612, 0, 307, 1024),
            (919, 0, 307, 1024),
            (1226, 0, 310, 1024),
        ),
    ),
    SheetConfig("single-tree", "singleTreeExplode.png", 1600, 20, 45, group_radius=9),
    # The upper scene is reference art. Extract only the lower catalog.
    SheetConfig("reference-catalog", "reference.png", 1600, 20, 45, crop=(0, 1360, 6144, 4096), group_radius=9),
    SheetConfig("custom", "custom.png", 1800, 20, 45, group_radius=9, use_existing_alpha=True),
)


def soft_white_alpha(rgb: np.ndarray, white_threshold: int) -> np.ndarray:
    darkest = rgb.min(axis=2).astype(np.float32)
    distance = 255.0 - darkest
    transparent_distance = 255 - white_threshold
    opaque_distance = 30.0
    alpha = (distance - transparent_distance) / max(1.0, opaque_distance - transparent_distance)
    return np.clip(alpha * 255.0, 0, 255).astype(np.uint8)


def remove_small_islands(mask: np.ndarray, min_area: int) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    cleaned = np.zeros_like(mask)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= min_area:
            cleaned[labels == label] = 255
    return cleaned


def split_spaced_row(
    box: tuple[int, int, int, int],
    solid: np.ndarray,
    config: SheetConfig,
) -> list[tuple[int, int, int, int]]:
    x, y, width, height = box
    if width < height * 0.75:
        return [box]

    projection = np.any(solid[y : y + height, x : x + width] > 0, axis=0)
    minimum_gap = max(6, config.group_radius)
    cuts = [0]
    gap_start = None
    for index, occupied in enumerate(projection):
        if not occupied and gap_start is None:
            gap_start = index
        elif occupied and gap_start is not None:
            if index - gap_start >= minimum_gap:
                cuts.append((gap_start + index) // 2)
            gap_start = None
    cuts.append(width)

    pieces = []
    for left, right in zip(cuts, cuts[1:]):
        segment = solid[y : y + height, x + left : x + right]
        points = cv2.findNonZero(segment)
        if points is None:
            continue
        sx, sy, sw, sh = cv2.boundingRect(points)
        raw_area = int(np.count_nonzero(segment))
        if raw_area < config.min_area or sw < config.min_width or sh < config.min_height:
            continue
        pieces.append((x + left + sx, y + sy, sw, sh))
    return pieces if len(pieces) > 1 else [box]


def find_grouped_boxes(alpha: np.ndarray, config: SheetConfig) -> list[tuple[int, int, int, int]]:
    solid = np.where(alpha >= 32, 255, 0).astype(np.uint8)
    solid = remove_small_islands(solid, max(12, config.min_area // 80))
    radius = config.group_radius
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    grouped = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, kernel)
    grouped = cv2.dilate(grouped, kernel, iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(grouped, connectivity=8)

    boxes: list[tuple[int, int, int, int]] = []
    for label in range(1, count):
        x, y, width, height, _ = stats[label]
        raw_area = int(np.count_nonzero(solid[y : y + height, x : x + width]))
        if raw_area < config.min_area:
            continue
        if width < config.min_width or height < config.min_height:
            continue
        # Removes the long, shallow section titles while keeping branches.
        if height < 70 and width > height * 9:
            continue
        boxes.extend(split_spaced_row((int(x), int(y), int(width), int(height)), solid, config))

    return sorted(boxes, key=lambda box: (box[1], box[0]))


def is_probably_label(rgba: np.ndarray) -> bool:
    if rgba.shape[0] > 240:
        return False
    rgb = rgba[:, :, :3].astype(np.float32)
    alpha = rgba[:, :, 3] >= 32
    opaque_count = int(np.count_nonzero(alpha))
    if opaque_count == 0:
        return True
    navy = (
        (rgb[:, :, 2] > 55)
        & (rgb[:, :, 2] > rgb[:, :, 0] * 1.35)
        & (rgb[:, :, 2] > rgb[:, :, 1] * 1.18)
        & alpha
    )
    return np.count_nonzero(navy) / opaque_count > 0.22


def tight_crop(rgba: np.ndarray, padding: int = 8) -> np.ndarray:
    alpha = rgba[:, :, 3]
    points = cv2.findNonZero(np.where(alpha >= 8, 255, 0).astype(np.uint8))
    if points is None:
        return rgba
    x, y, width, height = cv2.boundingRect(points)
    x0 = max(0, x - padding)
    y0 = max(0, y - padding)
    x1 = min(rgba.shape[1], x + width + padding)
    y1 = min(rgba.shape[0], y + height + padding)
    return rgba[y0:y1, x0:x1]


def checkerboard(width: int, height: int, cell: int = 16) -> Image.Image:
    yy, xx = np.indices((height, width))
    values = np.where(((xx // cell) + (yy // cell)) % 2 == 0, 238, 210).astype(np.uint8)
    rgb = np.stack([values, values, values], axis=2)
    return Image.fromarray(rgb)


def make_contact_sheet(asset_paths: list[Path], output: Path, title: str) -> None:
    tile_width, tile_height = 280, 260
    columns = 4
    rows = max(1, (len(asset_paths) + columns - 1) // columns)
    sheet = Image.new("RGB", (columns * tile_width, 55 + rows * tile_height), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 16), f"{title}: {len(asset_paths)} extracted assets", fill="black")

    for index, path in enumerate(asset_paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((tile_width - 28, tile_height - 48), Image.Resampling.LANCZOS)
        tile = checkerboard(tile_width - 12, tile_height - 34)
        x = (tile.width - image.width) // 2
        y = (tile.height - image.height) // 2
        tile.paste(image, (x, y), image)
        left = (index % columns) * tile_width + 6
        top = 48 + (index // columns) * tile_height
        sheet.paste(tile, (left, top))
        draw.text((left + 4, top + tile.height + 2), path.stem, fill="black")

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)


def extract_sheet(source_root: Path, output_root: Path, contacts_root: Path, config: SheetConfig) -> dict:
    source = source_root / config.filename
    image = cv2.imread(str(source), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(source)
    if image.shape[2] == 4:
        rgb = cv2.cvtColor(image[:, :, :3], cv2.COLOR_BGR2RGB)
        source_alpha = image[:, :, 3]
    else:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        source_alpha = None

    crop_x = crop_y = 0
    if config.crop:
        x0, y0, x1, y1 = config.crop
        rgb = rgb[y0:y1, x0:x1]
        if source_alpha is not None:
            source_alpha = source_alpha[y0:y1, x0:x1]
        crop_x, crop_y = x0, y0

    alpha = (
        source_alpha
        if config.use_existing_alpha and source_alpha is not None
        else soft_white_alpha(rgb, config.white_threshold)
    )
    boxes = list(config.manual_boxes) if config.manual_boxes else find_grouped_boxes(alpha, config)
    destination = output_root / config.name
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    records = []
    asset_paths: list[Path] = []
    for index, (x, y, width, height) in enumerate(boxes, start=1):
        rgba = np.dstack((rgb[y : y + height, x : x + width], alpha[y : y + height, x : x + width]))
        rgba = tight_crop(rgba)
        if is_probably_label(rgba):
            continue
        asset_name = f"{config.name}-{index:03d}.png"
        asset_path = destination / asset_name
        Image.fromarray(rgba).save(asset_path, optimize=True)
        asset_paths.append(asset_path)
        records.append(
            {
                "file": str(asset_path.relative_to(output_root.parent)),
                "source": config.filename,
                "source_bbox": [x + crop_x, y + crop_y, width, height],
                "output_size": [rgba.shape[1], rgba.shape[0]],
            }
        )

    make_contact_sheet(asset_paths, contacts_root / f"{config.name}.jpg", config.name)
    return {"sheet": config.name, "source": config.filename, "asset_count": len(records), "assets": records}


def write_catalog(output_root: Path, manifest: dict) -> None:
    sections = []
    for sheet in manifest["sheets"]:
        sections.append(
            f"""
            <section>
              <h2>{sheet["sheet"]} <span>{sheet["asset_count"]} assets</span></h2>
              <p>Source: <code>{sheet["source"]}</code></p>
              <a href="contact-sheets/{sheet["sheet"]}.jpg">
                <img src="contact-sheets/{sheet["sheet"]}.jpg" alt="{sheet["sheet"]} contact sheet">
              </a>
            </section>
            """
        )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>JumpGL Forest Asset Catalog</title>
  <style>
    body {{ margin: 0 auto; max-width: 1500px; padding: 28px; color: #17251c; background: #edf3ed; font: 16px/1.45 system-ui, sans-serif; }}
    h1 {{ margin-bottom: 4px; }}
    h2 {{ margin-top: 0; display: flex; justify-content: space-between; gap: 20px; }}
    h2 span {{ color: #557160; font-size: 0.7em; }}
    section {{ margin: 28px 0; padding: 20px; background: white; border: 1px solid #cad8cd; border-radius: 12px; }}
    img {{ display: block; width: 100%; height: auto; background: white; border-radius: 6px; }}
    code {{ color: #365542; }}
  </style>
</head>
<body>
  <h1>JumpGL Forest Asset Catalog</h1>
  <p>First-pass transparent extractions. Click a contact sheet to inspect it at full resolution.</p>
  {"".join(sections)}
</body>
</html>
"""
    (output_root / "catalog.html").write_text(html)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    output_root = args.output / "extracted"
    contacts_root = args.output / "contact-sheets"
    source_copy_root = args.output / "source"
    output_root.mkdir(parents=True, exist_ok=True)
    contacts_root.mkdir(parents=True, exist_ok=True)
    source_copy_root.mkdir(parents=True, exist_ok=True)

    for source in args.source.iterdir():
        if source.is_file():
            shutil.copy2(source, source_copy_root / source.name)

    manifest = {
        "source_root": str(args.source),
        "notes": [
            "First-pass automated extraction from near-white backgrounds.",
            "Assets still require contact-sheet review before gameplay integration.",
            "Reference upper scene and custom composite cleanup are intentionally deferred.",
        ],
        "sheets": [
            extract_sheet(args.source, output_root, contacts_root, config)
            for config in SHEETS
        ],
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    write_catalog(args.output, manifest)
    print(json.dumps({sheet["sheet"]: sheet["asset_count"] for sheet in manifest["sheets"]}, indent=2))


if __name__ == "__main__":
    main()
