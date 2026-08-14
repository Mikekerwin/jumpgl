#!/usr/bin/env python3
"""Build connector-locked mid/far display-tree families from approved sprite sheets."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "jumpgl-web"
SOURCE = WEB / "forest-art-workbench/source-overrides/background-tree-families"
GENERATED = WEB / "forest-art-workbench/generated/background-tree-families"
RUNTIME = WEB / "public/forest-sandbox/assets/background-tree-families"

CANVAS_WIDTH = 1024
CONNECTOR_HEIGHT = 64
MIDDLE_HEIGHT = 400
MIDDLE_STEP = MIDDLE_HEIGHT - CONNECTOR_HEIGHT


@dataclass(frozen=True)
class FamilySpec:
    name: str
    source: str
    base_box: tuple[int, int, int, int]
    middle_box: tuple[int, int, int, int]
    canopy_box: tuple[int, int, int, int]
    right_box: tuple[int, int, int, int]
    left_box: tuple[int, int, int, int]
    base_height: int
    canopy_height: int
    right_socket: tuple[int, int]
    left_socket: tuple[int, int]
    label: str


SPECS = (
    FamilySpec(
        name="mid-cool-broad",
        source="mid-cool-broad-kit-alpha.png",
        base_box=(50, 296, 354, 724),
        middle_box=(423, 160, 525, 715),
        canopy_box=(592, 96, 1008, 715),
        right_box=(1032, 66, 1746, 420),
        left_box=(1031, 502, 1686, 805),
        base_height=540,
        canopy_height=640,
        right_socket=(35, 210),
        left_socket=(625, 126),
        label="cool broad woodland",
    ),
    FamilySpec(
        name="far-cool-slender",
        source="far-cool-slender-kit-alpha.png",
        base_box=(35, 410, 274, 929),
        middle_box=(387, 98, 459, 920),
        canopy_box=(530, 40, 820, 920),
        right_box=(893, 612, 1508, 839),
        left_box=(852, 249, 1468, 486),
        base_height=520,
        canopy_height=720,
        right_socket=(24, 104),
        left_socket=(592, 120),
        label="cool slender understory",
    ),
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Asset crop is empty")
    return bbox


def trim(image: Image.Image, padding: int = 4) -> Image.Image:
    left, top, right, bottom = alpha_bbox(image)
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def center_on_canvas(image: Image.Image, height: int, *, align: str) -> Image.Image:
    output = Image.new("RGBA", (CANVAS_WIDTH, height), (0, 0, 0, 0))
    y = 0 if align == "top" else height - image.height if align == "bottom" else (height - image.height) // 2
    output.alpha_composite(image, ((CANVAS_WIDTH - image.width) // 2, y))
    return output


def make_middle(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    trunk = trim(source.crop(box), 0).resize(
        (box[2] - box[0], 560),
        Image.Resampling.LANCZOS,
    )
    # Generated sheets have a dark antialiased cut at their literal top edge.
    # Build the repeat from an interior bark belt instead: the top flows into
    # the body naturally, while the body's final 64 px crossfade toward the
    # pixels immediately preceding that same belt. The next copy therefore
    # begins with a continuous bark row rather than a dark horizontal scar.
    connector_start = 80
    connector_end = connector_start + CONNECTOR_HEIGHT
    body_height = MIDDLE_HEIGHT - CONNECTOR_HEIGHT * 2
    local = Image.new("RGBA", (trunk.width, MIDDLE_HEIGHT), (0, 0, 0, 0))
    connector = trunk.crop((0, connector_start, trunk.width, connector_end))
    body = trunk.crop((0, connector_end, trunk.width, connector_end + body_height))
    local.alpha_composite(connector, (0, 0))
    local.alpha_composite(body, (0, CONNECTOR_HEIGHT))

    transition_start = MIDDLE_HEIGHT - CONNECTOR_HEIGHT * 2
    target = trunk.crop((0, connector_start - CONNECTOR_HEIGHT, trunk.width, connector_start))
    pixels = local.load()
    target_pixels = target.load()
    for row in range(CONNECTOR_HEIGHT):
        amount = (row + 1) / CONNECTOR_HEIGHT
        y = transition_start + row
        for x in range(trunk.width):
            old = pixels[x, y]
            new = target_pixels[x, row]
            pixels[x, y] = tuple(round(old[i] * (1 - amount) + new[i] * amount) for i in range(4))
    local.alpha_composite(connector, (0, MIDDLE_HEIGHT - CONNECTOR_HEIGHT))
    return center_on_canvas(local, MIDDLE_HEIGHT, align="top")


def lock_top_connector(image: Image.Image, connector: Image.Image) -> Image.Image:
    output = image.copy()
    output.alpha_composite(connector, (0, 0))
    return output


def lock_bottom_connector(image: Image.Image, connector: Image.Image) -> Image.Image:
    output = image.copy()
    output.alpha_composite(connector, (0, output.height - CONNECTOR_HEIGHT))
    return output


def save_webp(image: Image.Image, name: str) -> dict[str, object]:
    GENERATED.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    png = GENERATED / f"{name}.png"
    webp = RUNTIME / f"{name}.webp"
    image.save(png)
    image.save(webp, "WEBP", quality=92, method=6)
    return {"path": f"assets/background-tree-families/{name}.webp", "width": image.width, "height": image.height}


def decoration(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return trim(source.crop(box), 2)


def build_family(spec: FamilySpec) -> dict[str, object]:
    source = Image.open(SOURCE / spec.source).convert("RGBA")
    middle = make_middle(source, spec.middle_box)
    connector = middle.crop((0, 0, CANVAS_WIDTH, CONNECTOR_HEIGHT))

    base_crop = trim(source.crop(spec.base_box), 0).resize(
        (spec.base_box[2] - spec.base_box[0], spec.base_height),
        Image.Resampling.LANCZOS,
    )
    base = lock_top_connector(center_on_canvas(base_crop, spec.base_height, align="top"), connector)

    canopy_crop = trim(source.crop(spec.canopy_box), 0).resize(
        (spec.canopy_box[2] - spec.canopy_box[0], spec.canopy_height),
        Image.Resampling.LANCZOS,
    )
    canopy = lock_bottom_connector(center_on_canvas(canopy_crop, spec.canopy_height, align="bottom"), connector)

    right = decoration(source, spec.right_box)
    left = decoration(source, spec.left_box).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    left_socket = (left.width - spec.left_socket[0], spec.left_socket[1])

    middle_record = {"id": f"{spec.name}-middle", "label": f"{spec.label} bark", **save_webp(middle, f"{spec.name}-middle")}
    base_record = {"id": f"{spec.name}-base", "label": f"{spec.label} roots", **save_webp(base, f"{spec.name}-base")}
    canopy_record = {"id": f"{spec.name}-canopy", "label": f"{spec.label} crown", **save_webp(canopy, f"{spec.name}-canopy")}
    right_record = {
        "id": f"{spec.name}-sweep-right",
        "label": f"{spec.label} long right sweep",
        "side": "right",
        "socket": list(spec.right_socket),
        **save_webp(right, f"{spec.name}-sweep-right"),
    }
    left_record = {
        "id": f"{spec.name}-sweep-left",
        "label": f"{spec.label} long left sweep",
        "side": "left",
        "socket": list(left_socket),
        **save_webp(left, f"{spec.name}-sweep-left"),
    }
    return {
        "width": CANVAS_WIDTH,
        "connector": {"height": CONNECTOR_HEIGHT, "width": CANVAS_WIDTH, **save_webp(connector, f"{spec.name}-connector")},
        "layout": {
            "canopyHeight": spec.canopy_height,
            "middleHeight": MIDDLE_HEIGHT,
            "middleStep": MIDDLE_STEP,
            "baseHeight": spec.base_height,
            "treeScale": 1,
            "defaultMiddleCount": 24,
        },
        "middles": [middle_record],
        "bases": [base_record],
        "canopies": [canopy_record],
        "decorations": [left_record, right_record],
    }


def main() -> None:
    manifest = {
        "status": "cool modular background tree families",
        "families": {spec.name: build_family(spec) for spec in SPECS},
    }
    manifest_path = RUNTIME / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    (GENERATED / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"manifest": str(manifest_path), "families": list(manifest["families"])}, indent=2))


if __name__ == "__main__":
    main()
