#!/usr/bin/env python3
"""Build high-quality WebP runtime copies for manifest-referenced forest PNGs."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "jumpgl-web" / "public" / "forest-sandbox"
MANIFESTS = (
    PUBLIC_ROOT / "manifest.json",
    PUBLIC_ROOT / "assets" / "master-tree" / "manifest.json",
    PUBLIC_ROOT / "assets" / "stacking-tree" / "manifest.json",
    PUBLIC_ROOT / "assets" / "attachment-proof" / "manifest.json",
)


def convert_record(value: object, converted: dict[Path, Path]) -> None:
    if isinstance(value, list):
        for item in value:
            convert_record(item, converted)
        return
    if not isinstance(value, dict):
        return

    path_value = value.get("path")
    if isinstance(path_value, str) and path_value.lower().endswith(".png"):
        source = PUBLIC_ROOT / path_value
        target = source.with_suffix(".webp")
        if source not in converted:
            with Image.open(source) as image:
                rendered = image.convert("RGBA") if "A" in image.getbands() else image.convert("RGB")
                rendered.save(target, "WEBP", quality=92, method=6, exact=True)
            with Image.open(target) as check:
                if check.size != rendered.size:
                    raise RuntimeError(f"Dimension mismatch for {target}")
            converted[source] = target
        value["path"] = target.relative_to(PUBLIC_ROOT).as_posix()

    for child in value.values():
        convert_record(child, converted)


def main() -> None:
    converted: dict[Path, Path] = {}
    for manifest_path in MANIFESTS:
        manifest = json.loads(manifest_path.read_text())
        convert_record(manifest, converted)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    png_bytes = sum(source.stat().st_size for source in converted)
    webp_bytes = sum(target.stat().st_size for target in converted.values())
    print(f"Converted {len(converted)} runtime images")
    print(f"PNG masters: {png_bytes / 1024 / 1024:.2f} MiB")
    print(f"WebP runtime: {webp_bytes / 1024 / 1024:.2f} MiB")
    print(f"Reduction: {(1 - webp_bytes / png_bytes) * 100:.1f}%")


if __name__ == "__main__":
    main()
