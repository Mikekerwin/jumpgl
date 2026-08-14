#!/usr/bin/env python3
"""Build repeatable tree modules from a resolution-independent master image."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "jumpgl-web" / "forest-art-workbench" / "generated" / "master-tree-v2.png"
WORKBENCH_OUTPUT = ROOT / "jumpgl-web" / "forest-art-workbench" / "generated"
RUNTIME_OUTPUT = ROOT / "jumpgl-web" / "public" / "forest-sandbox" / "assets" / "master-tree"

REFERENCE_WIDTH = 1024
REFERENCE_HEIGHT = 1536

# The three crops overlap at source-identical calm trunk bands. A repeated middle
# introduces one non-identical join, which is covered by the feathered connector belt.
CANOPY_RANGE = (0, 724)
MID_RANGE = (700, 1034)
BASE_RANGE = (1010, 1536)
MID_STEP = 310
FIRST_MID_Y = 700
BASE_Y_FOR_ONE_MID = 1010
CONNECTOR_SOURCE_RANGE = (820, 900)
CONNECTOR_FEATHER = 18
CONNECTOR_X_RANGE = (400, 610)
SEAM_CLEAN_DEPTH = 48


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Transparent source-of-truth master PNG.",
    )
    parser.add_argument(
        "--runtime-output",
        type=Path,
        default=RUNTIME_OUTPUT,
        help="Directory for derived runtime modules and manifest.",
    )
    parser.add_argument(
        "--workbench-output",
        type=Path,
        default=WORKBENCH_OUTPUT,
        help="Directory for stack and seam-inspection previews.",
    )
    parser.add_argument(
        "--runtime-max-width",
        type=int,
        default=0,
        help="Optionally downsample the master before slicing; 0 preserves full resolution.",
    )
    return parser.parse_args()


def scale_x(value: int, width: int) -> int:
    return round(value * width / REFERENCE_WIDTH)


def scale_y(value: int, height: int) -> int:
    return round(value * height / REFERENCE_HEIGHT)


def scale_range_x(row_range: tuple[int, int], width: int) -> tuple[int, int]:
    return (scale_x(row_range[0], width), scale_x(row_range[1], width))


def scale_range_y(row_range: tuple[int, int], height: int) -> tuple[int, int]:
    return (scale_y(row_range[0], height), scale_y(row_range[1], height))


def crop_rows(image: Image.Image, row_range: tuple[int, int]) -> Image.Image:
    top, bottom = row_range
    return image.crop((0, top, image.width, bottom))


def feather_connector(
    image: Image.Image,
    feather: int,
    horizontal_range: tuple[int, int],
) -> Image.Image:
    output = image.copy().convert("RGBA")
    alpha = output.getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    left, right = horizontal_range
    for y in range(height):
        edge_distance = min(y, height - 1 - y)
        factor = min(1.0, edge_distance / max(1, feather))
        factor = factor * factor * (3.0 - 2.0 * factor)
        for x in range(width):
            pixels[x, y] = round(pixels[x, y] * factor) if left <= x < right else 0
    output.putalpha(alpha)
    return output


def clean_connector_edge(
    image: Image.Image,
    edge: str,
    depth: int,
    horizontal_range: tuple[int, int],
) -> Image.Image:
    output = image.copy().convert("RGBA")
    alpha = output.getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    left, right = horizontal_range
    rows = range(min(depth, height)) if edge == "top" else range(max(0, height - depth), height)
    for y in rows:
        for x in range(width):
            if x < left or x >= right:
                pixels[x, y] = 0
    output.putalpha(alpha)
    return output


def composite_at(canvas: Image.Image, piece: Image.Image, y: int) -> None:
    canvas.alpha_composite(piece, (0, y))


def build_stack_preview(
    canopy: Image.Image,
    middle: Image.Image,
    base: Image.Image,
    connector: Image.Image,
    middle_count: int,
    first_mid_y: int,
    mid_step: int,
    base_y_for_one_mid: int,
) -> Image.Image:
    base_y = base_y_for_one_mid + (middle_count - 1) * mid_step
    height = base_y + base.height
    canvas = Image.new("RGBA", (canopy.width, height), (0, 0, 0, 0))

    composite_at(canvas, canopy, 0)
    for index in range(middle_count):
        composite_at(canvas, middle, first_mid_y + index * mid_step)
    composite_at(canvas, base, base_y)

    connector_half = connector.height // 2
    for index in range(middle_count - 1):
        seam_y = base_y_for_one_mid + index * mid_step
        composite_at(canvas, connector, seam_y - connector_half)

    return canvas


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (30, 42, 38, 255))
    pixels = image.load()
    colors = ((30, 42, 38, 255), (54, 69, 61, 255))
    for y in range(height):
        for x in range(width):
            pixels[x, y] = colors[((x // cell) + (y // cell)) % 2]
    return image


def build_seam_inspection(
    preview: Image.Image,
    middle_count: int,
    mid_step: int,
    base_y_for_one_mid: int,
    design_pixels_per_unit_x: float,
    design_pixels_per_unit_y: float,
) -> Image.Image:
    crop_width = round(420 * design_pixels_per_unit_x)
    crop_height = round(220 * design_pixels_per_unit_y)
    left = (preview.width - crop_width) // 2
    seams = [base_y_for_one_mid + index * mid_step for index in range(middle_count - 1)]
    sheet = checkerboard(
        (crop_width * len(seams), crop_height),
        max(8, round(16 * design_pixels_per_unit_x)),
    )
    for index, seam_y in enumerate(seams):
        top = seam_y - crop_height // 2
        crop = preview.crop((left, top, left + crop_width, top + crop_height))
        sheet.alpha_composite(crop, (index * crop_width, 0))
    return sheet


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    runtime_output = args.runtime_output.resolve()
    workbench_output = args.workbench_output.resolve()
    master = Image.open(source).convert("RGBA")
    source_size = master.size
    if args.runtime_max_width > 0 and master.width > args.runtime_max_width:
        runtime_scale = args.runtime_max_width / master.width
        runtime_size = (
            args.runtime_max_width,
            max(1, round(master.height * runtime_scale)),
        )
        master = master.resize(runtime_size, Image.Resampling.LANCZOS)

    design_pixels_per_unit_x = master.width / REFERENCE_WIDTH
    design_pixels_per_unit_y = master.height / REFERENCE_HEIGHT
    canopy_range = scale_range_y(CANOPY_RANGE, master.height)
    mid_range = scale_range_y(MID_RANGE, master.height)
    base_range = scale_range_y(BASE_RANGE, master.height)
    connector_source_range = scale_range_y(CONNECTOR_SOURCE_RANGE, master.height)
    connector_x_range = scale_range_x(CONNECTOR_X_RANGE, master.width)
    connector_feather = scale_y(CONNECTOR_FEATHER, master.height)
    seam_clean_depth = scale_y(SEAM_CLEAN_DEPTH, master.height)
    first_mid_y = scale_y(FIRST_MID_Y, master.height)
    mid_step = scale_y(MID_STEP, master.height)
    base_y_for_one_mid = scale_y(BASE_Y_FOR_ONE_MID, master.height)

    canopy = clean_connector_edge(
        crop_rows(master, canopy_range),
        "bottom",
        seam_clean_depth,
        connector_x_range,
    )
    middle = clean_connector_edge(
        clean_connector_edge(
            crop_rows(master, mid_range),
            "top",
            seam_clean_depth,
            connector_x_range,
        ),
        "bottom",
        seam_clean_depth,
        connector_x_range,
    )
    base = clean_connector_edge(
        crop_rows(master, base_range),
        "top",
        seam_clean_depth,
        connector_x_range,
    )
    connector = feather_connector(
        crop_rows(master, connector_source_range),
        connector_feather,
        connector_x_range,
    )

    runtime_output.mkdir(parents=True, exist_ok=True)
    assets = {
        "canopy": canopy,
        "middle": middle,
        "base": base,
        "connector": connector,
    }
    records: dict[str, dict[str, object]] = {}
    for name, image in assets.items():
        filename = f"master-tree-{name}.png"
        save_png(image, runtime_output / filename)
        records[name] = {
            "path": f"assets/master-tree/{filename}",
            "width": image.width,
            "height": image.height,
        }

    manifest = {
        "source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
        "sourceSize": {"width": source_size[0], "height": source_size[1]},
        "runtimeSize": {"width": master.width, "height": master.height},
        "designPixelsPerUnit": {
            "x": design_pixels_per_unit_x,
            "y": design_pixels_per_unit_y,
        },
        "assets": records,
        "layout": {
            "firstMiddleY": first_mid_y,
            "middleStep": mid_step,
            "baseYForOneMiddle": base_y_for_one_mid,
            "connectorCenterOffset": 0,
            "minimumMiddleCount": 1,
        },
    }
    (runtime_output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    preview_middle_count = 4
    preview = build_stack_preview(
        canopy,
        middle,
        base,
        connector,
        middle_count=preview_middle_count,
        first_mid_y=first_mid_y,
        mid_step=mid_step,
        base_y_for_one_mid=base_y_for_one_mid,
    )
    preview_path = workbench_output / f"{source.stem}-stack-4.png"
    save_png(preview, preview_path)
    seam_inspection = build_seam_inspection(
        preview,
        middle_count=preview_middle_count,
        mid_step=mid_step,
        base_y_for_one_mid=base_y_for_one_mid,
        design_pixels_per_unit_x=design_pixels_per_unit_x,
        design_pixels_per_unit_y=design_pixels_per_unit_y,
    )
    seam_path = workbench_output / f"{source.stem}-stack-4-seams.png"
    save_png(seam_inspection, seam_path)

    print(
        json.dumps(
            {
                "source": str(source),
                "sourceSize": list(source_size),
                "runtime": str(runtime_output),
                "runtimeSize": list(master.size),
                "preview": str(preview_path),
                "previewSize": list(preview.size),
                "seamInspection": str(seam_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
