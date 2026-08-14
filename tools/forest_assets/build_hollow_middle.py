#!/usr/bin/env python3
"""Build a connector-locked hollow variation from the approved straight middle."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "jumpgl-web"
RUNTIME = WEB / "public/forest-sandbox/assets/stacking-tree"
WORKBENCH = WEB / "forest-art-workbench"
ORIGINAL = RUNTIME / "middle-calm.png"
GENERATED = WORKBENCH / "source-overrides/stacking-tree/middle-hollow-v1-generated.png"
OUTPUT_PNG = RUNTIME / "middle-hollow-v1.png"
OUTPUT_WEBP = RUNTIME / "middle-hollow-v1.webp"
OVERLAY_PNG = RUNTIME / "middle-hollow-v1-overlay.png"
OVERLAY_WEBP = RUNTIME / "middle-hollow-v1-overlay.webp"
PROOF = WORKBENCH / "generated/stacking-tree/middle-hollow-v1-repeat-proof.png"

WIDTH = 1024
HEIGHT = 400
LOCKED_BAND = 85


def build_asset() -> Image.Image:
    original = Image.open(ORIGINAL).convert("RGBA")
    generated = Image.open(GENERATED).convert("RGB").resize(
        original.size,
        Image.Resampling.LANCZOS,
    ).convert("RGBA")
    generated.putalpha(original.getchannel("A"))

    # Limit the generative edit to the hollow and its immediate bark rim. The
    # wide feather absorbs small lighting differences without changing either
    # connector band or the authored outer trunk silhouette.
    mask = Image.new("L", original.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((420, 87, 606, 313), radius=48, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(18))
    mask_pixels = mask.load()
    for y in range(HEIGHT):
        if y < LOCKED_BAND or y >= HEIGHT - LOCKED_BAND:
            for x in range(WIDTH):
                mask_pixels[x, y] = 0

    # Never introduce opaque pixels outside the exact canonical alpha shape.
    mask = ImageChops.multiply(mask, original.getchannel("A"))
    output = Image.composite(generated, original, mask)
    output.putalpha(original.getchannel("A"))

    # Restore the connector bands byte-for-byte after compositing.
    output.paste(original.crop((0, 0, WIDTH, LOCKED_BAND)), (0, 0))
    output.paste(
        original.crop((0, HEIGHT - LOCKED_BAND, WIDTH, HEIGHT)),
        (0, HEIGHT - LOCKED_BAND),
    )
    return output


def build_proof(asset: Image.Image) -> None:
    proof = Image.new("RGBA", (WIDTH, 1008), (12, 24, 20, 255))
    # Modules advance by 336 px, matching the live 64 px overlap.
    for y in (0, 336, 672):
        proof.alpha_composite(asset, (0, y))
    PROOF.parent.mkdir(parents=True, exist_ok=True)
    proof.save(PROOF, "PNG", optimize=True)


def build_foreground_overlay(asset: Image.Image) -> Image.Image:
    """Keep the near bark/rim but punch out the hollow's dark interior."""
    outer = Image.new("L", asset.size, 0)
    ImageDraw.Draw(outer).rounded_rectangle((410, 78, 614, 326), radius=30, fill=255)
    outer = outer.filter(ImageFilter.GaussianBlur(3))
    outer = ImageChops.multiply(outer, asset.getchannel("A"))

    # The opening follows the generated inner lip rather than a geometric oval.
    # A tiny feather prevents a cutout halo while retaining the irregular bark rim.
    opening = Image.new("L", asset.size, 0)
    ImageDraw.Draw(opening).polygon([
        (507, 136), (528, 142), (543, 157), (551, 181),
        (551, 215), (543, 242), (530, 262), (510, 272),
        (490, 266), (475, 249), (467, 225), (466, 190),
        (474, 164), (489, 145),
    ], fill=255)
    opening = opening.filter(ImageFilter.GaussianBlur(1.5))
    overlay_alpha = ImageChops.subtract(outer, opening)
    overlay = asset.copy()
    overlay.putalpha(overlay_alpha)
    return overlay


def main() -> None:
    # Once the hollow PNG has been hand-edited it becomes authoritative. Keep
    # later proof/background rebuilds from replacing an artist's saved source.
    if OUTPUT_PNG.exists():
        asset = Image.open(OUTPUT_PNG).convert("RGBA")
        authored_hollow_preserved = True
    else:
        asset = build_asset()
        asset.save(OUTPUT_PNG, "PNG", optimize=True)
        authored_hollow_preserved = False
    asset.save(OUTPUT_WEBP, "WEBP", lossless=True, method=6)
    # The PNG becomes hand-authored once an artist refines it. Never overwrite
    # that source-of-truth during later background/seam rebuilds.
    if OVERLAY_PNG.exists():
        overlay = Image.open(OVERLAY_PNG).convert("RGBA")
        authored_overlay_preserved = True
    else:
        overlay = build_foreground_overlay(asset)
        overlay.save(OVERLAY_PNG, "PNG", optimize=True)
        authored_overlay_preserved = False
    overlay.save(OVERLAY_WEBP, "WEBP", lossless=True, method=6)
    build_proof(asset)

    original = Image.open(ORIGINAL).convert("RGBA")
    top_equal = list(asset.crop((0, 0, WIDTH, LOCKED_BAND)).getdata()) == list(
        original.crop((0, 0, WIDTH, LOCKED_BAND)).getdata()
    )
    bottom_equal = list(
        asset.crop((0, HEIGHT - LOCKED_BAND, WIDTH, HEIGHT)).getdata()
    ) == list(original.crop((0, HEIGHT - LOCKED_BAND, WIDTH, HEIGHT)).getdata())
    alpha_equal = list(asset.getchannel("A").getdata()) == list(
        original.getchannel("A").getdata()
    )
    if not authored_hollow_preserved and not (top_equal and bottom_equal and alpha_equal):
        raise RuntimeError("Hollow middle failed connector/alpha invariants")
    print(
        {
            "png": str(OUTPUT_PNG),
            "webp": str(OUTPUT_WEBP),
            "overlay": str(OVERLAY_WEBP),
            "authoredOverlayPreserved": authored_overlay_preserved,
            "proof": str(PROOF),
            "authoredHollowPreserved": authored_hollow_preserved,
            "topLocked": top_equal,
            "bottomLocked": bottom_equal,
            "alphaLocked": alpha_equal,
        }
    )


if __name__ == "__main__":
    main()
