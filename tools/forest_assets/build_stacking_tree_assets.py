#!/usr/bin/env python3
"""Build a connector-locked vertical tree family from the approved neutral tree.

The generated base/canopy sources are allowed to contribute only away from the
straight-shaft connector. Every module shares the exact same 64px canonical
connector belt, so bases, middles, and canopies can be rearranged freely.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "jumpgl-web"
CANONICAL_PATH = WEB / "public/forest-sandbox/assets/attachment-proof/neutral-tree.png"
ATTACHMENT_DIR = WEB / "public/forest-sandbox/assets/attachment-proof"
SOURCES = WEB / "forest-art-workbench/source-overrides/stacking-tree"
GENERATED = WEB / "forest-art-workbench/generated/stacking-tree"
RUNTIME = WEB / "public/forest-sandbox/assets/stacking-tree"

WIDTH = 1024
SOURCE_HEIGHT = 1536
CONNECTOR_Y = 800
CONNECTOR_HEIGHT = 64
MIDDLE_HEIGHT = 400
MIDDLE_STEP = MIDDLE_HEIGHT - CONNECTOR_HEIGHT
CANOPY_HEIGHT = 864
BASE_HEIGHT = CONNECTOR_HEIGHT + (SOURCE_HEIGHT - (CONNECTOR_Y + CONNECTOR_HEIGHT))


def normalized(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != (WIDTH, SOURCE_HEIGHT):
        image = image.resize((WIDTH, SOURCE_HEIGHT), Image.Resampling.LANCZOS)
    return image


def vertical_mask(size: tuple[int, int], start: int, end: int) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    span = max(1, end - start)
    for y in range(max(0, start), height):
        amount = 255 if y >= end else round(255 * (y - start) / span)
        for x in range(width):
            pixels[x, y] = amount
    return mask


def save_asset(image: Image.Image, filename: str) -> dict[str, object]:
    GENERATED.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    generated_path = GENERATED / filename
    runtime_path = RUNTIME / filename
    image.save(generated_path)
    shutil.copy2(generated_path, runtime_path)
    return {
        "path": f"assets/stacking-tree/{filename}",
        "width": image.width,
        "height": image.height,
    }


def make_middle(canonical: Image.Image, overlay_name: str | None, overlay_socket: tuple[int, int] | None) -> Image.Image:
    # The top starts at the canonical connector. The final 64px repeats that
    # exact belt, with a broad transition before it to avoid a hard internal cut.
    middle = canonical.crop((0, CONNECTOR_Y, WIDTH, CONNECTOR_Y + MIDDLE_HEIGHT))
    if overlay_name and overlay_socket:
        detail = Image.open(ATTACHMENT_DIR / overlay_name).convert("RGBA")
        target_socket = (WIDTH // 2, MIDDLE_HEIGHT // 2)
        origin = (target_socket[0] - overlay_socket[0], target_socket[1] - overlay_socket[1])
        middle.alpha_composite(detail, origin)

    connector = canonical.crop((0, CONNECTOR_Y, WIDTH, CONNECTOR_Y + CONNECTOR_HEIGHT))
    transition = canonical.crop(
        (
            0,
            CONNECTOR_Y - 72,
            WIDTH,
            CONNECTOR_Y + CONNECTOR_HEIGHT,
        )
    )
    connector_layer = Image.new("RGBA", middle.size, (0, 0, 0, 0))
    connector_layer.alpha_composite(transition, (0, MIDDLE_HEIGHT - CONNECTOR_HEIGHT - 72))
    # Fade toward the repeated connector across 72px; the connector itself is
    # then pasted once more so its seam pixels remain byte-identical.
    blend_start = MIDDLE_HEIGHT - CONNECTOR_HEIGHT - 72
    mask = vertical_mask(middle.size, blend_start, MIDDLE_HEIGHT - CONNECTOR_HEIGHT)
    middle = Image.composite(connector_layer, middle, mask)
    middle.alpha_composite(connector, (0, MIDDLE_HEIGHT - CONNECTOR_HEIGHT))
    return middle


def make_base(canonical: Image.Image, generated: Image.Image | None) -> Image.Image:
    connector = canonical.crop((0, CONNECTOR_Y, WIDTH, CONNECTOR_Y + CONNECTOR_HEIGHT))
    canonical_tail = canonical.crop((0, CONNECTOR_Y + CONNECTOR_HEIGHT, WIDTH, SOURCE_HEIGHT))
    output = Image.new("RGBA", (WIDTH, BASE_HEIGHT), (0, 0, 0, 0))
    output.alpha_composite(connector, (0, 0))
    output.alpha_composite(canonical_tail, (0, CONNECTOR_HEIGHT))
    if generated is None:
        return output

    generated_tail = generated.crop((0, CONNECTOR_Y + CONNECTOR_HEIGHT, WIDTH, SOURCE_HEIGHT))
    generated_layer = Image.new("RGBA", output.size, (0, 0, 0, 0))
    generated_layer.alpha_composite(generated_tail, (0, CONNECTOR_HEIGHT))
    # The approved shaft remains exact well into the base. Generated pixels take
    # over only as the root flare begins, where variation is intentional.
    mask = vertical_mask(output.size, 250, 370)
    output = Image.composite(generated_layer, output, mask)
    output.alpha_composite(connector, (0, 0))
    return output


def make_canopy(canonical: Image.Image, generated: Image.Image | None, source_scale: float = 1.0) -> Image.Image:
    if generated is None:
        return canonical.crop((0, 0, WIDTH, CANOPY_HEIGHT))

    if source_scale != 1.0:
        scaled = generated.resize(
            (round(WIDTH * source_scale), round(SOURCE_HEIGHT * source_scale)),
            Image.Resampling.LANCZOS,
        )
        scaled_canvas = Image.new("RGBA", (WIDTH, SOURCE_HEIGHT), (0, 0, 0, 0))
        scaled_canvas.alpha_composite(scaled, ((WIDTH - scaled.width) // 2, 8))
        generated = scaled_canvas
    output = generated.crop((0, 0, WIDTH, CANOPY_HEIGHT))
    # Restore the canonical receiving shaft in the lower canopy. Outside this
    # central strip, generated foliage and limbs remain untouched.
    canonical_crop = canonical.crop((0, 0, WIDTH, CANOPY_HEIGHT))
    trunk_mask = Image.new("L", output.size, 0)
    pixels = trunk_mask.load()
    for y in range(620, CANOPY_HEIGHT):
        vertical = min(1.0, max(0.0, (y - 620) / 110))
        for x in range(400, 624):
            edge = min((x - 400) / 28, (623 - x) / 28, 1.0)
            pixels[x, y] = round(255 * vertical * max(0.0, edge))
    output = Image.composite(canonical_crop, output, trunk_mask)
    connector = canonical.crop((0, CONNECTOR_Y, WIDTH, CONNECTOR_Y + CONNECTOR_HEIGHT))
    output.alpha_composite(connector, (0, CANOPY_HEIGHT - CONNECTOR_HEIGHT))
    return output


def make_leaf_decoration(
    source_name: str,
    side: str,
    socket: tuple[int, int],
    x_full: int,
    x_zero: int,
    y_start: int,
    y_end: int,
    y_feather: int = 22,
) -> Image.Image:
    """Keep the authored leafy limb/root while removing its old trunk rectangle."""
    source = Image.open(ATTACHMENT_DIR / source_name).convert("RGBA")
    pixels = source.load()
    for y in range(source.height):
        if y < y_start - y_feather or y > y_end + y_feather:
            y_alpha = 0.0
        elif y < y_start:
            y_alpha = (y - (y_start - y_feather)) / y_feather
        elif y > y_end:
            y_alpha = ((y_end + y_feather) - y) / y_feather
        else:
            y_alpha = 1.0
        for x in range(source.width):
            if side == "left":
                if x <= x_full:
                    x_alpha = 1.0
                elif x >= x_zero:
                    x_alpha = 0.0
                else:
                    x_alpha = (x_zero - x) / max(1, x_zero - x_full)
            else:
                if x >= x_full:
                    x_alpha = 1.0
                elif x <= x_zero:
                    x_alpha = 0.0
                else:
                    x_alpha = (x - x_zero) / max(1, x_full - x_zero)
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, round(alpha * x_alpha * y_alpha))
    return source


def main() -> None:
    canonical = normalized(CANONICAL_PATH)
    sparse = normalized(SOURCES / "base-sparse-v1.png")
    rock = normalized(SOURCES / "base-rock-v1.png")
    full = normalized(SOURCES / "canopy-full-v1.png")
    open_crown = normalized(SOURCES / "canopy-open-v1.png")

    middles = [
        ("middle-calm", None, None, "calm canonical bark"),
        ("middle-moss", "trunk-medium-a.png", (274, 127), "moss and fungi cluster"),
        ("middle-vine", "trunk-large-a.png", (278, 176), "long running vine"),
        ("middle-sparse", "trunk-small-b.png", (272, 78), "sparse moss detail"),
    ]
    middle_records = []
    for identifier, overlay, socket, label in middles:
        record = save_asset(make_middle(canonical, overlay, socket), f"{identifier}.png")
        middle_records.append({"id": identifier, "label": label, **record})

    base_records = []
    for identifier, source, label in [
        ("base-original", None, "approved lush roots"),
        ("base-sparse", sparse, "lighter sparse roots"),
        ("base-rock", rock, "roots around mossy rock"),
    ]:
        record = save_asset(make_base(canonical, source), f"{identifier}.png")
        base_records.append({"id": identifier, "label": label, **record})

    canopy_records = []
    for identifier, source, label, scale in [
        ("canopy-original", None, "approved broad crown", 1.0),
        ("canopy-full", full, "larger full crown", 0.94),
        ("canopy-open", open_crown, "asymmetric open crown", 1.0),
    ]:
        record = save_asset(make_canopy(canonical, source, scale), f"{identifier}.png")
        canopy_records.append({"id": identifier, "label": label, **record})

    decoration_records = []
    for identifier, source_name, side, socket, x_full, x_zero, y_start, y_end, label in [
        ("leafy-left-a", "trunk-small-a.png", "left", (257, 273), 190, 260, 145, 345, "small rising leafy limb"),
        ("leafy-left-c", "trunk-small-c.png", "left", (344, 245), 270, 340, 95, 335, "wide irregular leafy limb"),
        ("leafy-right-e", "trunk-small-e.png", "right", (140, 247), 215, 150, 135, 345, "small dark-side leafy limb"),
    ]:
        image = make_leaf_decoration(source_name, side, socket, x_full, x_zero, y_start, y_end)
        record = save_asset(image, f"decoration-{identifier}.png")
        decoration_records.append({
            "id": identifier,
            "label": label,
            "side": side,
            "socket": list(socket),
            **record,
        })

    connector_record = save_asset(
        canonical.crop((0, CONNECTOR_Y, WIDTH, CONNECTOR_Y + CONNECTOR_HEIGHT)),
        "connector-canonical.png",
    )
    manifest = {
        "status": "canonical connector-locked stacking tree preview family",
        "source": str(CANONICAL_PATH.relative_to(ROOT)),
        "width": WIDTH,
        "connector": {"sourceY": CONNECTOR_Y, "height": CONNECTOR_HEIGHT, **connector_record},
        "layout": {
            "canopyHeight": CANOPY_HEIGHT,
            "middleHeight": MIDDLE_HEIGHT,
            "middleStep": MIDDLE_STEP,
            "baseHeight": BASE_HEIGHT,
            "treeScale": 0.64,
            "defaultMiddleCount": 12,
        },
        "middles": middle_records,
        "bases": base_records,
        "canopies": canopy_records,
        "decorations": decoration_records,
        "references": {
            "customBaseSheet": "forest-art-workbench/source/custom.png",
            "note": "Original base remains active; custom.png root and hollow silhouettes guide later color-matched variants.",
        },
    }
    GENERATED.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    for path in (GENERATED / "manifest.json", RUNTIME / "manifest.json"):
        path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"runtime": str(RUNTIME), "middleCount": len(middle_records), "baseCount": len(base_records), "canopyCount": len(canopy_records), "decorationCount": len(decoration_records)}, indent=2))


if __name__ == "__main__":
    main()
