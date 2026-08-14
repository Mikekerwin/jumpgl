#!/usr/bin/env python3
"""Extract low-resolution socketed branches and build two assembly proofs."""

from __future__ import annotations

import json
import hashlib
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "jumpgl-web" / "forest-art-workbench" / "generated" / "attachment-proof"
RUNTIME = ROOT / "jumpgl-web" / "public" / "forest-sandbox" / "assets" / "attachment-proof"
OVERRIDES = ROOT / "jumpgl-web" / "forest-art-workbench" / "source-overrides" / "attachment-proof"
DETAILS = OVERRIDES / "details"
BRANCH_VARIANTS = OVERRIDES / "branch-variants"
NEUTRAL_PATH = WORKBENCH / "neutral-tree-1024x1536.png"
LEFT_SOURCE = WORKBENCH / "left-heavy-alpha.png"
RIGHT_SOURCE = WORKBENCH / "right-heavy-alpha.png"
MIDLONG_LEFT_SOURCE = BRANCH_VARIANTS / "midlong-left-b-alpha.png"
MIDLONG_RIGHT_SOURCE = BRANCH_VARIANTS / "midlong-right-b-alpha.png"
BACKGROUND_PATH = ROOT / "jumpgl-web" / "public" / "forest-sandbox" / "assets" / "trees" / "background.jpg"
DIRECT_GRADE_AUDIT: dict[str, dict[str, object]] = {}


def save_immutable_review(source: Path, label: str) -> Path:
    """Copy a proof to a never-reused, content-addressed review filename."""
    payload = source.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()[:12]
    review_directory = WORKBENCH / "reviews"
    review_directory.mkdir(parents=True, exist_ok=True)
    target = review_directory / f"{label}-{digest}.png"
    if not target.exists():
        target.write_bytes(payload)
    return target


@dataclass(frozen=True)
class BranchSpec:
    name: str
    source: str
    branch_class: str
    side: str
    fitment: str
    box: tuple[int, int, int, int]
    socket: tuple[int, int]
    target_socket: tuple[int, int]
    socket_band: str
    collar_radius: tuple[int, int] = (82, 72)
    lower_support: float = 0.52
    canonical_inward_start: float = 0.16
    canonical_inward_end: float = 0.44
    collar_lift: tuple[int, int, int] = (0, 0, 0)
    inward_scale: float = 0.72
    exclusions: tuple[tuple[int, int, int, int], ...] = ()


@dataclass(frozen=True)
class TrunkPatchSpec:
    name: str
    source: str
    fitment: str
    box: tuple[int, int, int, int]
    anchor: tuple[int, int]
    radius: tuple[int, int]
    target_anchor: tuple[int, int]
    detail_profile: str
    sequence: str
    sequence_order: int
    vine_lane: str | None = None


SPECS = (
    BranchSpec("nub-right-a", "left", "nub", "right", "fork-a", (440, 824, 680, 984), (560, 904), (558, 565), "canopy", (115, 80), 0.44, inward_scale=0.88),
    BranchSpec("nub-right-b", "right", "nub", "right", "scar-b", (440, 545, 690, 715), (558, 625), (558, 570), "canopy", (115, 80), 0.44, inward_scale=0.88),
    BranchSpec(
        "small-left-a", "left", "small", "left", "brace-a",
        (272, 550, 610, 790), (470, 642), (468, 1165), "lower", (135, 100), 0.66, inward_scale=0.88,
    ),
    BranchSpec(
        "small-left-b", "right", "small", "left", "root-b",
        (292, 950, 610, 1210), (472, 1064), (468, 995), "middle", (135, 100), 0.66, inward_scale=0.88,
    ),
    BranchSpec("medium-right-a", "left", "medium", "right", "moss-a", (400, 1050, 800, 1450), (558, 1168), (558, 1170), "lower", (155, 112), 1.08, inward_scale=0.92),
    BranchSpec(
        "medium-right-b", "right", "medium", "right", "root-fork-b",
        (400, 1070, 750, 1450), (558, 1197), (558, 1170), "root-lower", (155, 112), 1.08, inward_scale=0.92,
        exclusions=((610, 1235, 660, 1310),),
    ),
    BranchSpec(
        "medium-right-straight-c", "right", "medium", "right", "straight-fork-c",
        (400, 1070, 750, 1400), (558, 1197), (558, 980), "middle", (150, 104), 0.76,
        canonical_inward_start=0.02, canonical_inward_end=0.20, inward_scale=0.90,
        exclusions=((610, 1235, 660, 1310),),
    ),
    BranchSpec("long-right-a", "left", "long", "right", "brace-a", (350, 600, 1000, 945), (555, 735), (558, 770), "upper", (195, 126), 1.40, inward_scale=0.95),
    BranchSpec(
        "long-left-a", "right", "long", "left", "fork-b",
        (75, 620, 640, 965), (470, 744), (468, 755), "upper", (158, 118), 1.22, inward_scale=0.92,
    ),
    BranchSpec(
        "midlong-left-b", "midlong-left", "medium", "left", "twin-brace-b",
        (95, 820, 620, 1075), (438, 920), (468, 920), "middle", (170, 116), 1.20,
        canonical_inward_start=0.04, canonical_inward_end=0.24, inward_scale=0.94,
    ),
    BranchSpec(
        "midlong-right-b", "midlong-right", "long", "right", "sweep-brace-b",
        (350, 820, 990, 1120), (580, 946), (558, 946), "middle", (185, 120), 1.18,
        canonical_inward_start=0.04, canonical_inward_end=0.24, inward_scale=0.94,
    ),
)


TRUNK_PATCH_SPECS = (
    # These are full vertical sections rather than narrow decorative strips. Their
    # source samples are branch-free regions of the neutral trunk; only fine bark,
    # vine, and leaf detail is remapped onto canonical target lighting.
    TrunkPatchSpec("trunk-small-a", "neutral", "small-a", (382, 700, 642, 860), (512, 780), (122, 76), (512, 625), "rich", "trunk-a", 0, "small"),
    TrunkPatchSpec("trunk-small-b", "neutral", "small-b", (382, 880, 642, 1040), (512, 960), (122, 76), (512, 625), "rich", "trunk-b", 0, "small"),
    TrunkPatchSpec("trunk-small-c", "neutral", "small-c", (382, 540, 642, 700), (512, 620), (122, 76), (512, 625), "rich", "trunk-c", 0, "small"),
    TrunkPatchSpec("trunk-small-e", "neutral", "small-e", (382, 760, 642, 920), (512, 840), (122, 76), (512, 625), "rich", "trunk-e", 0, "small"),
    TrunkPatchSpec("trunk-medium-a", "neutral", "medium-a", (382, 570, 642, 830), (512, 700), (122, 126), (512, 830), "rich", "trunk-a", 1, "medium"),
    TrunkPatchSpec("trunk-medium-b", "neutral", "medium-b", (382, 850, 642, 1110), (512, 980), (122, 126), (512, 830), "rich", "trunk-b", 1, "medium"),
    TrunkPatchSpec("trunk-large-a", "neutral", "large-a", (372, 510, 652, 870), (512, 690), (132, 176), (512, 1125), "rich", "trunk-a", 2, "large"),
    TrunkPatchSpec("trunk-large-b", "neutral", "large-b", (372, 750, 652, 1110), (512, 930), (132, 176), (512, 1125), "rich", "trunk-b", 2, "large"),
)


PROOF_TREES = {
    "tree-a": (
        ("trunk-small-c", 512, 625),
        ("trunk-medium-a", 512, 830),
        ("trunk-large-a", 512, 1125),
        ("medium-right-a", 560, 1170),
        ("small-left-b", 468, 995),
        ("long-right-a", 558, 770),
        ("nub-right-b", 558, 570),
    ),
    "tree-b": (
        ("trunk-small-e", 512, 625),
        ("trunk-medium-b", 512, 830),
        ("trunk-large-b", 512, 1125),
        ("small-left-a", 468, 1165),
        ("medium-right-straight-c", 558, 980),
        ("long-left-a", 468, 755),
        ("nub-right-a", 558, 565),
    ),
}


def collar_factor(
    x: int,
    y: int,
    socket_x: int,
    socket_y: int,
    radius_x: int,
    radius_y: int,
    side: str,
    inward_scale: float,
    lower_support: float,
) -> float:
    upper_radius_y = radius_y * 0.84
    lower_radius_y = radius_y * lower_support
    resolved_radius_y = lower_radius_y if y > socket_y else upper_radius_y
    is_inward = (side == "right" and x < socket_x) or (side == "left" and x > socket_x)
    resolved_radius_x = radius_x * inward_scale if is_inward else radius_x
    distance = math.sqrt(((x - socket_x) / resolved_radius_x) ** 2 + ((y - socket_y) / resolved_radius_y) ** 2)
    if distance <= 0.68:
        return 1.0
    if distance >= 1.0:
        return 0.0
    amount = (1.0 - distance) / 0.32
    return amount * amount * (3.0 - 2.0 * amount)


def smoothstep(edge_start: float, edge_end: float, value: float) -> float:
    amount = max(0.0, min(1.0, (value - edge_start) / (edge_end - edge_start)))
    return amount * amount * (3.0 - 2.0 * amount)


def opaque_color_stats(
    image: Image.Image,
    box: tuple[int, int, int, int] | None = None,
) -> dict[str, object]:
    """Measure opaque artwork without letting transparent padding skew color."""
    sample = image.crop(box) if box is not None else image
    count = 0
    sums = [0.0, 0.0, 0.0]
    square_sums = [0.0, 0.0, 0.0]
    saturation_sum = 0.0
    luma_sum = 0.0
    luma_square_sum = 0.0
    for red, green, blue, alpha in sample.getdata():
        if alpha < 230:
            continue
        count += 1
        channels = (red, green, blue)
        for index, channel in enumerate(channels):
            sums[index] += channel
            square_sums[index] += channel * channel
        maximum = max(channels)
        minimum = min(channels)
        saturation_sum += 0.0 if maximum == 0 else (maximum - minimum) / maximum
        luma = red * 0.2126 + green * 0.7152 + blue * 0.0722
        luma_sum += luma
        luma_square_sum += luma * luma
    if count == 0:
        raise RuntimeError("Cannot measure an image without opaque pixels")
    means = [value / count for value in sums]
    deviations = [
        math.sqrt(max(0.0, square_sums[index] / count - means[index] ** 2))
        for index in range(3)
    ]
    luma_mean = luma_sum / count
    luma_deviation = math.sqrt(max(0.0, luma_square_sum / count - luma_mean ** 2))
    return {
        "pixels": count,
        "meanRgb": [round(value, 3) for value in means],
        "stdRgb": [round(value, 3) for value in deviations],
        "meanSaturation": round(saturation_sum / count, 5),
        "meanLuma": round(luma_mean, 3),
        "stdLuma": round(luma_deviation, 3),
    }


def opaque_luma_profile(
    image: Image.Image,
    box: tuple[int, int, int, int],
    bin_count: int = 4,
) -> list[float]:
    """Measure the broad left-to-right lighting field across opaque trunk art."""
    left, top, right, bottom = box
    profile: list[float] = []
    for bin_index in range(bin_count):
        bin_left = round(left + (right - left) * bin_index / bin_count)
        bin_right = round(left + (right - left) * (bin_index + 1) / bin_count)
        luma_sum = 0.0
        pixel_count = 0
        for y in range(top, bottom):
            for x in range(bin_left, bin_right):
                red, green, blue, alpha = image.getpixel((x, y))
                if alpha < 230:
                    continue
                luma_sum += red * 0.2126 + green * 0.7152 + blue * 0.0722
                pixel_count += 1
        if pixel_count == 0:
            raise RuntimeError("Cannot measure a luma-profile bin without opaque pixels")
        profile.append(luma_sum / pixel_count)
    return profile


def uniformly_grade_direct_cartridge(
    image: Image.Image,
    trunk_left: int,
    canonical_trunk: Image.Image,
) -> tuple[Image.Image, dict[str, object]]:
    """Apply one global color transform; never replace or spatially blend pixels.

    The transform is measured only from the central opaque trunk areas, then applied
    identically to the complete branch, root flare, leaves, moss, and trunk artwork.
    Alpha is preserved byte-for-byte by this stage.
    """
    vertical_margin = round(image.height * 0.18)
    source_box = (
        trunk_left,
        vertical_margin,
        image.width,
        max(vertical_margin + 1, image.height - vertical_margin),
    )
    target_margin_x = round(canonical_trunk.width * 0.10)
    target_margin_y = round(canonical_trunk.height * 0.18)
    target_box = (
        target_margin_x,
        target_margin_y,
        canonical_trunk.width - target_margin_x,
        canonical_trunk.height - target_margin_y,
    )
    before = opaque_color_stats(image, source_box)
    target = opaque_color_stats(canonical_trunk, target_box)

    source_means = [float(value) for value in before["meanRgb"]]
    source_deviations = [float(value) for value in before["stdRgb"]]
    target_means = [float(value) for value in target["meanRgb"]]
    target_deviations = [float(value) for value in target["stdRgb"]]
    gains = [
        max(0.78, min(1.08, target_deviations[index] / max(1.0, source_deviations[index])))
        for index in range(3)
    ]
    offsets = [
        target_means[index] - source_means[index] * gains[index]
        for index in range(3)
    ]

    # The generated bark is more chromatic than the canonical shaft. Use a single
    # saturation multiplier for the entire opaque illustration after RGB alignment.
    # This retains authored hue relationships without selectively repainting bark.
    provisional_saturation = 0.0
    provisional_count = 0
    pixels = image.load()
    for y in range(source_box[1], source_box[3]):
        for x in range(source_box[0], source_box[2]):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 230:
                continue
            corrected = [
                max(0.0, min(255.0, channel * gains[index] + offsets[index]))
                for index, channel in enumerate((red, green, blue))
            ]
            maximum = max(corrected)
            minimum = min(corrected)
            provisional_saturation += 0.0 if maximum == 0 else (maximum - minimum) / maximum
            provisional_count += 1
    provisional_mean_saturation = provisional_saturation / max(1, provisional_count)
    saturation_scale = max(
        0.68,
        min(1.0, float(target["meanSaturation"]) / max(0.001, provisional_mean_saturation)),
    )

    alpha_before = image.getchannel("A").tobytes()
    graded = image.copy()
    graded_pixels = graded.load()
    for y in range(graded.height):
        for x in range(graded.width):
            red, green, blue, alpha = graded_pixels[x, y]
            if alpha == 0:
                continue
            corrected = [
                max(0.0, min(255.0, channel * gains[index] + offsets[index]))
                for index, channel in enumerate((red, green, blue))
            ]
            luma = corrected[0] * 0.2126 + corrected[1] * 0.7152 + corrected[2] * 0.0722
            corrected = [luma + (channel - luma) * saturation_scale for channel in corrected]
            graded_pixels[x, y] = (
                max(0, min(255, round(corrected[0]))),
                max(0, min(255, round(corrected[1]))),
                max(0, min(255, round(corrected[2]))),
                alpha,
            )
    source_luma_profile = opaque_luma_profile(graded, source_box)
    target_luma_profile = opaque_luma_profile(canonical_trunk, target_box)
    luma_offsets = [
        max(-18.0, min(18.0, target_value - source_value))
        for source_value, target_value in zip(source_luma_profile, target_luma_profile)
    ]

    # Match the canonical shaft's broad bright-left/dark-right division. This is
    # a smooth RGB lighting field over the complete one-piece illustration; it
    # neither substitutes canonical pixels nor changes any alpha value.
    last_profile_index = len(luma_offsets) - 1
    for y in range(graded.height):
        for x in range(graded.width):
            red, green, blue, alpha = graded_pixels[x, y]
            if alpha == 0:
                continue
            normalized_x = max(
                0.0,
                min(1.0, (x - trunk_left) / max(1, graded.width - 1 - trunk_left)),
            )
            profile_position = normalized_x * len(luma_offsets) - 0.5
            if profile_position <= 0.0:
                luma_offset = luma_offsets[0]
            elif profile_position >= last_profile_index:
                luma_offset = luma_offsets[last_profile_index]
            else:
                lower_index = math.floor(profile_position)
                blend = profile_position - lower_index
                luma_offset = (
                    luma_offsets[lower_index] * (1.0 - blend)
                    + luma_offsets[lower_index + 1] * blend
                )
            graded_pixels[x, y] = (
                max(0, min(255, round(red + luma_offset))),
                max(0, min(255, round(green + luma_offset))),
                max(0, min(255, round(blue + luma_offset))),
                alpha,
            )

    if graded.getchannel("A").tobytes() != alpha_before:
        raise RuntimeError("Uniform direct-cartridge grading unexpectedly changed alpha")

    after = opaque_color_stats(graded, source_box)
    return graded, {
        "sourceSampleBox": list(source_box),
        "canonicalSampleBox": list(target_box),
        "before": before,
        "canonicalTarget": target,
        "transform": {
            "rgbGain": [round(value, 5) for value in gains],
            "rgbOffset": [round(value, 5) for value in offsets],
            "saturationScale": round(saturation_scale, 5),
            "scope": "uniform color transform plus smooth canonical x-lighting profile over every nontransparent RGB pixel",
            "sourceLumaProfile": [round(value, 3) for value in source_luma_profile],
            "canonicalLumaProfile": [round(value, 3) for value in target_luma_profile],
            "lumaOffsets": [round(value, 3) for value in luma_offsets],
            "alphaChanged": False,
        },
        "after": after,
    }


def branch_light_influence(
    x: int,
    y: int,
    socket_x: int,
    socket_y: int,
    radius_x: int,
    radius_y: int,
    side: str,
    inward_scale: float,
    lower_support: float,
) -> float:
    collar = collar_factor(
        x, y, socket_x, socket_y,
        radius_x * 1.08, radius_y * 1.10, side, inward_scale, lower_support,
    )
    inward = socket_x - x if side == "right" else x - socket_x
    if inward < 0:
        return collar
    horizontal = 1.0 - smoothstep(0.62, 0.92, inward / max(1.0, radius_x * inward_scale))
    vertical_limit = radius_y * (lower_support if y > socket_y else 0.88)
    vertical = 1.0 - smoothstep(0.62, 0.98, abs(y - socket_y) / max(1.0, vertical_limit))
    return max(collar, horizontal * vertical)


def normalize_to_canonical_light(
    crop: Image.Image,
    source_blur: Image.Image,
    neutral: Image.Image,
    neutral_blur: Image.Image,
    source_origin: tuple[int, int],
    source_anchor: tuple[int, int],
    target_anchor: tuple[int, int],
    influence_at,
    statistics_at=None,
) -> None:
    """Transfer only broad lighting; retain the source's bark/leaf detail.

    A blurred source pixel represents illumination and broad color, while the
    difference between the original and that blur is the useful high-frequency
    artwork. Replacing the former with the neutral trunk's field prevents each
    cartridge from importing a different bright/dark vertical band.
    """
    pixels = crop.load()
    source_pixels = source_blur.load()
    target_pixels = neutral_blur.load()
    source_original = {
        (x, y): pixels[x, y]
        for y in range(crop.height)
        for x in range(crop.width)
        if pixels[x, y][3] >= 8
    }
    origin_x, origin_y = source_origin
    source_anchor_x, source_anchor_y = source_anchor
    target_anchor_x, target_anchor_y = target_anchor
    source_residuals: list[float] = []
    target_residuals: list[float] = []

    # Match high-frequency contrast as well as broad illumination. The target
    # residual is measured from the canonical neutral tree at the mapped pixels.
    residual_gain = 1.0
    residual_bias = 0.0
    for local_y in range(crop.height):
        global_y = origin_y + local_y
        target_y = target_anchor_y + global_y - source_anchor_y
        if not 0 <= target_y < neutral_blur.height:
            continue
        for local_x in range(crop.width):
            original = source_original.get((local_x, local_y))
            if original is None:
                continue
            global_x = origin_x + local_x
            target_x = target_anchor_x + global_x - source_anchor_x
            statistics_weight = statistics_at(global_x, global_y) if statistics_at else influence_at(global_x, global_y)
            if not 0 <= target_x < neutral_blur.width or statistics_weight < 0.72:
                continue
            target_original = neutral.getpixel((target_x, target_y))
            if target_original[3] < 96:
                continue
            source_low = source_pixels[global_x, global_y]
            target_low = target_pixels[target_x, target_y]
            source_luma = 0.2126 * (original[0] - source_low[0]) + 0.7152 * (original[1] - source_low[1]) + 0.0722 * (original[2] - source_low[2])
            target_luma = 0.2126 * (target_original[0] - target_low[0]) + 0.7152 * (target_original[1] - target_low[1]) + 0.0722 * (target_original[2] - target_low[2])
            source_residuals.append(source_luma)
            target_residuals.append(target_luma)
    if len(source_residuals) >= 32:
        source_mean = sum(source_residuals) / len(source_residuals)
        target_mean = sum(target_residuals) / len(target_residuals)
        source_std = math.sqrt(sum((value - source_mean) ** 2 for value in source_residuals) / len(source_residuals))
        target_std = math.sqrt(sum((value - target_mean) ** 2 for value in target_residuals) / len(target_residuals))
        residual_gain = max(0.78, min(1.22, target_std / max(1.0, source_std)))
        residual_bias = max(-18.0, min(18.0, target_mean - source_mean * residual_gain))

    for local_y in range(crop.height):
        global_y = origin_y + local_y
        target_y = target_anchor_y + global_y - source_anchor_y
        if not 0 <= target_y < neutral_blur.height:
            continue
        for local_x in range(crop.width):
            red, green, blue, alpha = source_original.get((local_x, local_y), pixels[local_x, local_y])
            if alpha < 8:
                continue
            global_x = origin_x + local_x
            target_x = target_anchor_x + global_x - source_anchor_x
            if not 0 <= target_x < neutral_blur.width:
                continue
            target_red, target_green, target_blue, target_alpha = target_pixels[target_x, target_y]
            if target_alpha < 96:
                continue
            influence = max(0.0, min(1.0, float(influence_at(global_x, global_y))))
            if influence <= 0.001:
                continue
            source_red, source_green, source_blue, _ = source_pixels[global_x, global_y]
            # Clamp extreme differences at silhouettes; the useful correction is a
            # restrained broad field, not a repaint of the branch artwork.
            deltas = (
                max(-42, min(42, target_red - source_red)),
                max(-42, min(42, target_green - source_green)),
                max(-42, min(42, target_blue - source_blue)),
            )
            # Re-scale the source's fine detail around its own broad field, then
            # place that residual on the canonical broad field.
            corrected_channels = []
            for original_channel, source_channel, target_channel, delta in zip(
                (red, green, blue),
                (source_red, source_green, source_blue),
                (target_red, target_green, target_blue),
                deltas,
            ):
                exact = target_channel + (original_channel - source_channel) * residual_gain + residual_bias
                corrected_channels.append(max(0, min(255, round(original_channel * (1.0 - influence) + exact * influence))))
            pixels[local_x, local_y] = (
                corrected_channels[0],
                corrected_channels[1],
                corrected_channels[2],
                alpha,
            )


def remake_trunk_detail_on_canonical(
    crop: Image.Image,
    source: Image.Image,
    source_blur: Image.Image,
    neutral: Image.Image,
    neutral_blur: Image.Image,
    source_origin: tuple[int, int],
    source_anchor: tuple[int, int],
    target_anchor: tuple[int, int],
    influence_at,
    detail_strength_max: float = 0.62,
) -> None:
    """Rebuild a trunk overlay from canonical pixels plus source detail only.

    Unlike broad color transfer, this never substitutes the source trunk's base
    lighting. Feathered pixels therefore blend back into identical neutral pixels,
    eliminating bright-face bands while retaining knots, leaf edges, and bark cuts.
    """
    pixels = crop.load()
    source_pixels = source.load()
    source_low_pixels = source_blur.load()
    neutral_pixels = neutral.load()
    neutral_low_pixels = neutral_blur.load()
    origin_x, origin_y = source_origin
    source_anchor_x, source_anchor_y = source_anchor
    target_anchor_x, target_anchor_y = target_anchor
    for local_y in range(crop.height):
        source_y = origin_y + local_y
        target_y = target_anchor_y + source_y - source_anchor_y
        if not 0 <= target_y < neutral.height:
            continue
        for local_x in range(crop.width):
            _, _, _, alpha = pixels[local_x, local_y]
            if alpha < 8:
                continue
            source_x = origin_x + local_x
            target_x = target_anchor_x + source_x - source_anchor_x
            if not 0 <= target_x < neutral.width:
                continue
            influence = max(0.0, min(1.0, float(influence_at(source_x, source_y))))
            if influence <= 0.001:
                continue
            target_red, target_green, target_blue, target_alpha = neutral_pixels[target_x, target_y]
            if target_alpha < 96:
                pixels[local_x, local_y] = (0, 0, 0, 0)
                continue
            source_red, source_green, source_blue, _ = source_pixels[source_x, source_y]
            source_low_red, source_low_green, source_low_blue, _ = source_low_pixels[source_x, source_y]
            target_low_red, target_low_green, target_low_blue, _ = neutral_low_pixels[target_x, target_y]
            detail_strength = detail_strength_max * influence
            channels = []
            for source_channel, source_low, target_channel, target_low in zip(
                (source_red, source_green, source_blue),
                (source_low_red, source_low_green, source_low_blue),
                (target_red, target_green, target_blue),
                (target_low_red, target_low_green, target_low_blue),
            ):
                source_residual = source_channel - source_low
                target_residual = target_channel - target_low
                detail_delta = max(-34, min(34, source_residual - target_residual))
                channels.append(max(0, min(255, round(target_channel + detail_delta * detail_strength))))
            pixels[local_x, local_y] = (channels[0], channels[1], channels[2], alpha)


def remove_disconnected_artifacts(image: Image.Image, remove_all_secondary: bool) -> None:
    """Remove chroma specks and specifically unwanted detached source decorations."""
    alpha = image.getchannel("A")
    width, height = image.size
    remaining = {
        (x, y)
        for y in range(height)
        for x in range(width)
        if alpha.getpixel((x, y)) >= 8
    }
    components: list[list[tuple[int, int]]] = []
    while remaining:
        start = remaining.pop()
        queue = [start]
        component = [start]
        for x, y in queue:
            for neighbor_x in (x - 1, x, x + 1):
                for neighbor_y in (y - 1, y, y + 1):
                    point = (neighbor_x, neighbor_y)
                    if point in remaining:
                        remaining.remove(point)
                        queue.append(point)
                        component.append(point)
        components.append(component)
    if not components:
        return
    largest = max(components, key=len)
    pixels = image.load()
    for component in components:
        should_remove = len(component) < 40 or (remove_all_secondary and component is not largest)
        if not should_remove:
            continue
        for x, y in component:
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)


def extract_branch(
    source: Image.Image,
    source_blur: Image.Image,
    neutral: Image.Image,
    neutral_blur: Image.Image,
    spec: BranchSpec,
) -> tuple[Image.Image, tuple[int, int]]:
    left, top, right, bottom = spec.box
    crop = source.crop(spec.box).convert("RGBA")
    pixels = crop.load()
    source_alpha = crop.getchannel("A")
    socket_x, socket_y = spec.socket
    radius_x, radius_y = spec.collar_radius

    # Track the width of the opaque run containing each source pixel. Far below the
    # platform, thin runs are vines/branch braces; wide runs are the continuing trunk
    # and must not be mistaken for branch art.
    run_widths = [[0] * crop.width for _ in range(crop.height)]
    for local_y in range(crop.height):
        local_x = 0
        while local_x < crop.width:
            if source_alpha.getpixel((local_x, local_y)) < 8:
                local_x += 1
                continue
            run_start = local_x
            while local_x < crop.width and source_alpha.getpixel((local_x, local_y)) >= 8:
                local_x += 1
            run_width = local_x - run_start
            for run_x in range(run_start, local_x):
                run_widths[local_y][run_x] = run_width

    for local_y in range(crop.height):
        global_y = top + local_y
        for local_x in range(crop.width):
            global_x = left + local_x
            original_alpha = pixels[local_x, local_y][3]
            if original_alpha == 0:
                continue
            collar = collar_factor(
                global_x, global_y, socket_x, socket_y,
            radius_x, radius_y, spec.side, spec.inward_scale,
            spec.lower_support,
            )
            if spec.side == "right":
                outward_position = (global_x - socket_x) / radius_x
            else:
                outward_position = (socket_x - global_x) / radius_x
            # A hard body threshold produced the straight clipped edges visible at
            # high zoom. Blend into the guaranteed branch body over an organic-width
            # belt while the collar hides the inner part of the transition.
            outward = smoothstep(0.42, 0.72, outward_position)
            above_position = (socket_y - global_y) / radius_y
            if above_position > 0.70:
                outward *= 1.0 - smoothstep(0.70, 0.90, above_position)
            outside_branch_body = (
                global_y > socket_y + radius_y * 0.88
                or global_y < socket_y - radius_y * 1.08
            )
            if outside_branch_body and run_widths[local_y][local_x] > 30:
                outward = 0.0
            factor = max(collar, outward)
            red, green, blue, _ = pixels[local_x, local_y]
            if any(spec.collar_lift):
                joint_distance = abs(global_x - socket_x) / radius_x
                joint_weight = collar * max(0.0, 1.0 - joint_distance * 0.72)
                red = max(0, min(255, round(red + spec.collar_lift[0] * joint_weight)))
                green = max(0, min(255, round(green + spec.collar_lift[1] * joint_weight)))
                blue = max(0, min(255, round(blue + spec.collar_lift[2] * joint_weight)))
            resolved_alpha = round(original_alpha * factor)
            if outward < 0.01 and resolved_alpha < 14:
                resolved_alpha = 0
            pixels[local_x, local_y] = (red, green, blue, resolved_alpha)

    for exclusion_left, exclusion_top, exclusion_right, exclusion_bottom in spec.exclusions:
        for global_y in range(max(top, exclusion_top), min(bottom, exclusion_bottom)):
            for global_x in range(max(left, exclusion_left), min(right, exclusion_right)):
                local_x = global_x - left
                local_y = global_y - top
                red, green, blue, _ = pixels[local_x, local_y]
                pixels[local_x, local_y] = (red, green, blue, 0)

    remove_disconnected_artifacts(
        crop,
        remove_all_secondary=spec.name in {"small-left-b", "medium-right-a", "medium-right-b", "medium-right-straight-c"},
    )

    normalize_to_canonical_light(
        crop,
        source_blur,
        neutral,
        neutral_blur,
        (left, top),
        spec.socket,
        spec.target_socket,
        lambda global_x, global_y: branch_light_influence(
            global_x,
            global_y,
            socket_x,
            socket_y,
            radius_x,
            radius_y,
            spec.side,
            spec.inward_scale,
            spec.lower_support,
        ),
        lambda global_x, global_y: 1.0 if (
            0 <= ((socket_x - global_x) if spec.side == "right" else (global_x - socket_x)) <= radius_x * 0.62
            and abs(global_y - socket_y) <= radius_y * 0.58
        ) else 0.0,
    )

    if spec.side == "right":
        remake_trunk_detail_on_canonical(
            crop,
            source,
            source_blur,
            neutral,
            neutral_blur,
            (left, top),
            spec.socket,
            spec.target_socket,
            lambda global_x, global_y: smoothstep(
                spec.canonical_inward_start,
                spec.canonical_inward_end,
                (socket_x - global_x) / max(1.0, radius_x),
            ) if global_x <= socket_x else 0.0,
            detail_strength_max=0.0 if spec.source.startswith("midlong") else 0.62,
        )
    elif spec.side == "left":
        remake_trunk_detail_on_canonical(
            crop,
            source,
            source_blur,
            neutral,
            neutral_blur,
            (left, top),
            spec.socket,
            spec.target_socket,
            lambda global_x, global_y: smoothstep(
                spec.canonical_inward_start,
                spec.canonical_inward_end,
                (global_x - socket_x) / max(1.0, radius_x),
            ) if global_x >= socket_x else 0.0,
            detail_strength_max=0.0 if spec.source.startswith("midlong") else 0.62,
        )

    alpha_box = crop.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"Empty attachment crop: {spec.name}")
    padding = 4
    alpha_left, alpha_top, alpha_right, alpha_bottom = alpha_box
    alpha_left = max(0, alpha_left - padding)
    alpha_top = max(0, alpha_top - padding)
    alpha_right = min(crop.width, alpha_right + padding)
    alpha_bottom = min(crop.height, alpha_bottom + padding)
    trimmed = crop.crop((alpha_left, alpha_top, alpha_right, alpha_bottom))
    local_socket = (socket_x - left - alpha_left, socket_y - top - alpha_top)
    return trimmed, local_socket


def extract_trunk_patch(
    source: Image.Image,
    source_blur: Image.Image,
    neutral: Image.Image,
    neutral_blur: Image.Image,
    spec: TrunkPatchSpec,
) -> tuple[Image.Image, tuple[int, int]]:
    left, top, right, bottom = spec.box
    crop = source.crop(spec.box).convert("RGBA")
    pixels = crop.load()
    anchor_x, anchor_y = spec.anchor
    radius_x, radius_y = spec.radius
    for local_y in range(crop.height):
        global_y = top + local_y
        for local_x in range(crop.width):
            global_x = left + local_x
            red, green, blue, alpha = pixels[local_x, local_y]
            if alpha == 0:
                continue
            normalized_x = abs(global_x - anchor_x) / radius_x
            normalized_y = abs(global_y - anchor_y) / radius_y
            # A fourth-power superellipse keeps a useful rectangular trunk interior
            # while rounding and feathering every edge of the cartridge.
            distance = (normalized_x ** 4 + normalized_y ** 4) ** 0.25
            factor = 1.0 - smoothstep(0.82, 1.0, distance)
            resolved_alpha = round(alpha * factor)
            pixels[local_x, local_y] = (red, green, blue, resolved_alpha if resolved_alpha >= 8 else 0)

    remake_trunk_detail_on_canonical(
        crop,
        source,
        source_blur,
        neutral,
        neutral_blur,
        (left, top),
        spec.anchor,
        spec.target_anchor,
        lambda global_x, global_y: 1.0 - smoothstep(
            0.64,
            0.98,
            (
                (abs(global_x - anchor_x) / radius_x) ** 4
                + (abs(global_y - anchor_y) / radius_y) ** 4
            ) ** 0.25,
        ),
        detail_strength_max=0.92,
    )

    alpha_box = crop.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"Empty trunk patch: {spec.name}")
    padding = 4
    alpha_left, alpha_top, alpha_right, alpha_bottom = alpha_box
    alpha_left = max(0, alpha_left - padding)
    alpha_top = max(0, alpha_top - padding)
    alpha_right = min(crop.width, alpha_right + padding)
    alpha_bottom = min(crop.height, alpha_bottom + padding)
    trimmed = crop.crop((alpha_left, alpha_top, alpha_right, alpha_bottom))
    local_anchor = (anchor_x - left - alpha_left, anchor_y - top - alpha_top)
    return trimmed, local_anchor


def add_trunk_decoration(
    image: Image.Image,
    local_anchor: tuple[int, int],
    name: str,
    canonical_target: tuple[int, int],
) -> tuple[Image.Image, tuple[int, int], Image.Image]:
    """Add authored interior detail while preserving generous seam-safe margins."""
    pad_left = 190
    pad_right = 24
    output = Image.new("RGBA", (image.width + pad_left + pad_right, image.height), (0, 0, 0, 0))
    output.alpha_composite(image, (pad_left, 0))
    lighting_reference = output.copy()
    anchor = (local_anchor[0] + pad_left, local_anchor[1])
    direct_limb_specs = {
        # filename, source crop height, target height, trunk-center x/y,
        # trunk-left/right bounds,
        # measured grade. The v3 sources were authored against the locked canonical
        # trunk and stay direct/ungraded so no post-generation color pipeline can
        # flatten or disguise the one-piece artwork.
        # The decorative limbs stay intentionally smaller than playable branches.
        # No pixels are reconstructed or composited with canonical bark.
        "trunk-small-a": ("decorative-fork-v5-compact-light.png", 0.761, 0.548, 0.538, 1.000, "left"),
        "trunk-small-c": ("decorative-long-fork-v5-hero-light.png", 0.813, 0.596, 0.625, 1.000, "left"),
        "trunk-small-e": ("dark-right-compact-v5-light.png", 0.283, 0.557, 0.000, 0.542, "right"),
    }
    direct_spec = direct_limb_specs.get(name)
    if direct_spec is not None:
        (
            filename,
            anchor_x_ratio,
            anchor_y_ratio,
            trunk_left_ratio,
            trunk_right_ratio,
            branch_side,
        ) = direct_spec
        direct = Image.open(DETAILS / filename).convert("RGBA")
        alpha_box = direct.getchannel("A").getbbox()
        if alpha_box is None:
            raise RuntimeError(f"Empty direct limb cartridge: {filename}")
        direct = direct.crop(alpha_box)
        source_trunk_left = round(direct.width * trunk_left_ratio)
        source_trunk_right = round(direct.width * trunk_right_ratio)
        source_trunk_width = max(1, source_trunk_right - source_trunk_left)

        # The canonical trunk width is the sole scale authority. Generated canvas
        # height is deliberately ignored: it previously made wide source trunks
        # (especially the hero limb) render nearly twice size.
        canonical_alpha_box = image.getchannel("A").getbbox()
        if canonical_alpha_box is None:
            raise RuntimeError(f"Empty canonical trunk patch: {name}")
        canonical_trunk_width = canonical_alpha_box[2] - canonical_alpha_box[0]
        scale = canonical_trunk_width / source_trunk_width
        direct = direct.resize(
            (
                max(1, round(direct.width * scale)),
                max(1, round(direct.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )

        direct_anchor = (
            round(direct.width * anchor_x_ratio),
            round(direct.height * anchor_y_ratio),
        )
        trunk_left = round(direct.width * trunk_left_ratio)
        trunk_right = round(direct.width * trunk_right_ratio)
        trunk_width = max(1, trunk_right - trunk_left)

        # Retain the authored branch plus only a narrow root taper at the outer
        # bark edge.  A previous elliptical collar reached across most of the
        # shaft and visibly replaced canonical bark with the generated trunk's
        # darker, differently grained pixels.  The root is now opaque at the
        # silhouette and fades out within the outer ~30% of the trunk; the broad
        # canonical face can never be modified by this cartridge.
        direct_alpha = direct.getchannel("A")
        masked_alpha = Image.new("L", direct.size, 0)
        source_alpha_pixels = direct_alpha.load()
        mask_pixels = masked_alpha.load()
        branch_vertical_radius = trunk_width * 1.55
        for pixel_y in range(direct.height):
            for pixel_x in range(direct.width):
                source_alpha = source_alpha_pixels[pixel_x, pixel_y]
                if source_alpha == 0:
                    continue
                outside_trunk = (
                    pixel_x < trunk_left
                    if branch_side == "left"
                    else pixel_x >= trunk_right
                )
                branch_weight = (
                    1.0
                    if outside_trunk
                    and abs(pixel_y - direct_anchor[1]) <= branch_vertical_radius
                    else 0.0
                )
                inside_depth = (
                    pixel_x - trunk_left
                    if branch_side == "left"
                    else trunk_right - 1 - pixel_x
                )
                if inside_depth < 0:
                    collar_weight = 0.0
                else:
                    depth_weight = 1.0 - smoothstep(
                        trunk_width * 0.06,
                        trunk_width * 0.32,
                        inside_depth,
                    )
                    vertical_distance = abs(pixel_y - direct_anchor[1])
                    vertical_weight = 1.0 - smoothstep(
                        trunk_width * 0.55,
                        trunk_width * 1.05,
                        vertical_distance,
                    )
                    collar_weight = depth_weight * vertical_weight
                weight = max(branch_weight, collar_weight)
                mask_pixels[pixel_x, pixel_y] = round(source_alpha * weight)
        direct.putalpha(masked_alpha)

        # Copy a taller strip straight from the canonical tree at native 1:1
        # pixels. Only its top/bottom alpha is faded for vertical repetition.
        neutral = Image.open(NEUTRAL_PATH).convert("RGBA")
        strip_height = 470
        strip_half_width = 130
        target_x, target_y = canonical_target
        strip_box = (
            target_x - strip_half_width,
            target_y - strip_height // 2,
            target_x + strip_half_width,
            target_y + strip_height // 2,
        )
        canonical_strip = neutral.crop(strip_box)
        canonical_alpha = canonical_strip.getchannel("A")
        canonical_alpha_pixels = canonical_alpha.load()
        fade_depth = 54
        for pixel_y in range(canonical_strip.height):
            vertical = min(
                smoothstep(0.0, fade_depth, pixel_y),
                1.0 - smoothstep(
                    canonical_strip.height - fade_depth,
                    canonical_strip.height - 1,
                    pixel_y,
                ),
            )
            if vertical >= 0.999:
                continue
            for pixel_x in range(canonical_strip.width):
                canonical_alpha_pixels[pixel_x, pixel_y] = round(
                    canonical_alpha_pixels[pixel_x, pixel_y] * vertical
                )
        canonical_strip.putalpha(canonical_alpha)

        padding = 10
        canonical_anchor = (strip_half_width, strip_height // 2)
        direct_origin = (
            canonical_anchor[0] - direct_anchor[0],
            canonical_anchor[1] - direct_anchor[1],
        )
        minimum_x = min(0, direct_origin[0])
        minimum_y = min(0, direct_origin[1])
        maximum_x = max(canonical_strip.width, direct_origin[0] + direct.width)
        maximum_y = max(canonical_strip.height, direct_origin[1] + direct.height)
        output = Image.new(
            "RGBA",
            (
                maximum_x - minimum_x + padding * 2,
                maximum_y - minimum_y + padding * 2,
            ),
            (0, 0, 0, 0),
        )
        canonical_origin = (padding - minimum_x, padding - minimum_y)
        resolved_direct_origin = (
            direct_origin[0] + padding - minimum_x,
            direct_origin[1] + padding - minimum_y,
        )
        output.alpha_composite(canonical_strip, canonical_origin)
        lighting_reference = output.copy()
        output.alpha_composite(direct, resolved_direct_origin)
        resolved_anchor = (
            canonical_origin[0] + canonical_anchor[0],
            canonical_origin[1] + canonical_anchor[1],
        )
        DIRECT_GRADE_AUDIT[name] = {
            "source": filename,
            "mode": "canonical-trunk-width-locked",
            "canonicalTrunkWidth": canonical_trunk_width,
            "sourceTrunkWidth": source_trunk_width,
            "scale": round(scale, 5),
            "generatedTrunkDiscardedOutsideCollar": True,
            "collarMode": "outer-edge-taper",
            "maximumCanonicalOverlap": round(trunk_width * 0.32),
            "canonicalPixelsRegraded": False,
            "branchAlphaPreservedOutsideCollar": True,
        }
        return output, resolved_anchor, lighting_reference

    decoration_specs = {
        # filename, target height, center x relative to trunk anchor, center y offset
        "trunk-small-b": ("moss-fungi.png", 82, -54, 2),
        "trunk-medium-a": ("moss-fungi.png", 190, -58, 0),
        "trunk-large-a": ("long-vine.png", 310, -52, 0),
    }
    decoration_spec = decoration_specs.get(name)
    if decoration_spec is None:
        return output, anchor, lighting_reference

    filename, target_height, center_x_offset, center_y_offset = decoration_spec
    decoration = Image.open(DETAILS / filename).convert("RGBA")
    alpha_box = decoration.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"Empty trunk decoration: {filename}")
    decoration = decoration.crop(alpha_box)
    scale = target_height / decoration.height
    decoration = decoration.resize(
        (max(1, round(decoration.width * scale)), target_height),
        Image.Resampling.LANCZOS,
    )
    center_x = anchor[0] + center_x_offset
    center_y = anchor[1] + center_y_offset
    x = round(center_x - decoration.width / 2)
    y = round(center_y - decoration.height / 2)
    output.alpha_composite(decoration, (x, y))
    return output, anchor, lighting_reference


def composite_attachment(
    tree: Image.Image,
    attachment: Image.Image,
    local_socket: tuple[int, int],
    target_socket: tuple[int, int],
) -> None:
    x = round(target_socket[0] - local_socket[0])
    y = round(target_socket[1] - local_socket[1])
    tree.alpha_composite(attachment, (x, y))


def checkerboard(size: tuple[int, int], cell: int = 20) -> Image.Image:
    output = Image.new("RGBA", size, (32, 43, 39, 255))
    draw = ImageDraw.Draw(output)
    colors = ((32, 43, 39, 255), (58, 72, 65, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=colors[((x // cell) + (y // cell)) % 2])
    return output


def build_attachment_sheet(records: dict[str, dict[str, object]], images: dict[str, Image.Image]) -> Image.Image:
    cell_width = 500
    cell_height = 260
    sheet = checkerboard((cell_width * 2, cell_height * math.ceil(len(SPECS) / 2)))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    for index, spec in enumerate(SPECS):
        column = index % 2
        row = index // 2
        image = images[spec.name]
        x = column * cell_width + (cell_width - image.width) // 2
        y = row * cell_height + max(28, (cell_height - image.height) // 2)
        sheet.alpha_composite(image, (x, y))
        record = records[spec.name]
        label = f"{spec.name}  {spec.branch_class}  {spec.fitment}"
        draw.text((column * cell_width + 12, row * cell_height + 8), label, font=font, fill=(235, 255, 241, 255))
        socket_x, socket_y = record["socket"]
        marker_x = x + int(socket_x)
        marker_y = y + int(socket_y)
        draw.ellipse((marker_x - 4, marker_y - 4, marker_x + 4, marker_y + 4), fill=(80, 220, 255, 255))
    return sheet


def build_trunk_patch_sheet(records: dict[str, dict[str, object]], images: dict[str, Image.Image]) -> Image.Image:
    cell_width = 430
    cell_height = 470
    sheet = checkerboard((cell_width * len(TRUNK_PATCH_SPECS), cell_height))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    for index, spec in enumerate(TRUNK_PATCH_SPECS):
        image = images[spec.name]
        x = index * cell_width + (cell_width - image.width) // 2
        y = max(32, (cell_height - image.height) // 2)
        sheet.alpha_composite(image, (x, y))
        draw.text((index * cell_width + 12, 8), f"{spec.name}  {spec.fitment}", font=font, fill=(235, 255, 241, 255))
        socket_x, socket_y = records[spec.name]["socket"]
        marker_x = x + int(socket_x)
        marker_y = y + int(socket_y)
        draw.ellipse((marker_x - 4, marker_y - 4, marker_x + 4, marker_y + 4), fill=(80, 220, 255, 255))
    return sheet


def build_two_tree_preview(
    neutral: Image.Image,
    records: dict[str, dict[str, object]],
    images: dict[str, Image.Image],
) -> Image.Image:
    background = Image.open(BACKGROUND_PATH).convert("RGBA")
    target_height = 1536
    scale = target_height / background.height
    background = background.resize((round(background.width * scale), target_height), Image.Resampling.LANCZOS)
    if background.width < 2048:
        raise RuntimeError("Background plate is unexpectedly narrow")
    crop_left = max(0, (background.width - 2048) // 2)
    preview = background.crop((crop_left, 0, crop_left + 2048, target_height))
    overlay = Image.new("RGBA", preview.size, (4, 18, 14, 35))
    preview.alpha_composite(overlay)

    for tree_index, placements in enumerate(PROOF_TREES.values()):
        tree = neutral.copy()
        for name, target_x, target_y in placements:
            record = records[name]
            composite_attachment(
                tree,
                images[name],
                tuple(record["socket"]),
                (target_x, target_y),
            )
        # Front attachments include their own individually calibrated bark collars.
        preview.alpha_composite(tree, (tree_index * 1024, 0))
    return preview


def audit_attachment(
    neutral: Image.Image,
    image: Image.Image,
    local_socket: tuple[int, int],
    target_socket: tuple[int, int],
    side: str,
) -> tuple[dict[str, object], Image.Image]:
    composed = neutral.copy()
    composite_attachment(composed, image, local_socket, target_socket)
    half_height = 48
    if side == "right":
        left = max(0, target_socket[0] - 68)
        right = min(neutral.width, target_socket[0] - 8)
    elif side == "left":
        left = max(0, target_socket[0] + 8)
        right = min(neutral.width, target_socket[0] + 68)
    else:
        left = max(0, target_socket[0] - 62)
        right = min(neutral.width, target_socket[0] + 62)
    top = max(0, target_socket[1] - half_height)
    bottom = min(neutral.height, target_socket[1] + half_height)
    reference = neutral.crop((left, top, right, bottom)).convert("RGB")
    resolved = composed.crop((left, top, right, bottom)).convert("RGB")
    reference_low = reference.filter(ImageFilter.GaussianBlur(10))
    resolved_low = resolved.filter(ImageFilter.GaussianBlur(10))
    difference = ImageChops.difference(reference_low, resolved_low).convert("L")
    low_frequency_mae = round(ImageStat.Stat(difference).mean[0], 2)
    reference_luma = ImageStat.Stat(reference.convert("L"))
    resolved_luma = ImageStat.Stat(resolved.convert("L"))
    mean_delta = round(resolved_luma.mean[0] - reference_luma.mean[0], 2)
    contrast_ratio = round(resolved_luma.stddev[0] / max(1.0, reference_luma.stddev[0]), 3)
    bright_side_delta: float | None = None
    dark_side_delta: float | None = None
    def zone_delta(zone_left: int, zone_right: int) -> float:
        zone_box = (
            max(0, zone_left),
            max(0, target_socket[1] - 42),
            min(neutral.width, zone_right),
            min(neutral.height, target_socket[1] + 42),
        )
        zone_reference = ImageStat.Stat(neutral.crop(zone_box).convert("L")).mean[0]
        zone_resolved = ImageStat.Stat(composed.crop(zone_box).convert("L")).mean[0]
        return round(zone_resolved - zone_reference, 2)

    if side == "center":
        bright_side_delta = zone_delta(target_socket[0] - 92, target_socket[0] - 24)
        dark_side_delta = zone_delta(target_socket[0] + 24, target_socket[0] + 92)
    elif side == "right":
        bright_side_delta = zone_delta(target_socket[0] - 130, target_socket[0] - 60)
    elif side == "left":
        dark_side_delta = zone_delta(target_socket[0] + 60, target_socket[0] + 130)
    alpha = image.getchannel("A")
    edge_alpha = max(
        max(alpha.crop((0, 0, image.width, 1)).getextrema()),
        max(alpha.crop((0, image.height - 1, image.width, image.height)).getextrema()),
        max(alpha.crop((0, 0, 1, image.height)).getextrema()),
        max(alpha.crop((image.width - 1, 0, image.width, image.height)).getextrema()),
    )
    passed = (
        low_frequency_mae <= 9.0
        and abs(mean_delta) <= 5.0
        and 0.78 <= contrast_ratio <= 1.28
        and edge_alpha == 0
        and (bright_side_delta is None or abs(bright_side_delta) <= 3.0)
        and (dark_side_delta is None or abs(dark_side_delta) <= 3.0)
    )
    preview_box = (
        max(0, target_socket[0] - 150),
        max(0, target_socket[1] - 92),
        min(neutral.width, target_socket[0] + 150),
        min(neutral.height, target_socket[1] + 92),
    )
    return {
        "targetSocket": list(target_socket),
        "lowFrequencyMae": low_frequency_mae,
        "meanLumaDelta": mean_delta,
        "contrastRatio": contrast_ratio,
        "brightSideLumaDelta": bright_side_delta,
        "darkSideLumaDelta": dark_side_delta,
        "edgeAlpha": edge_alpha,
        "pass": passed,
    }, composed.crop(preview_box)


def auto_calibrate_mean_luminance(
    neutral: Image.Image,
    image: Image.Image,
    local_socket: tuple[int, int],
    target_socket: tuple[int, int],
    side: str,
) -> None:
    """Close the last small alpha-compositing bias using the same audit window."""
    for _ in range(3):
        metrics, _ = audit_attachment(neutral, image, local_socket, target_socket, side)
        delta = float(metrics["meanLumaDelta"])
        if abs(delta) <= 1.25:
            return
        pixels = image.load()
        socket_x, socket_y = local_socket
        correction = max(-12.0, min(12.0, -delta * 1.18))
        for y in range(image.height):
            vertical_distance = abs(y - socket_y)
            if vertical_distance > 54:
                continue
            vertical_weight = 1.0 - smoothstep(0.72, 1.0, vertical_distance / 54)
            for x in range(image.width):
                if side == "right":
                    inward = socket_x - x
                elif side == "left":
                    inward = x - socket_x
                else:
                    inward = abs(x - socket_x)
                limit = 74 if side != "center" else 66
                if not 0 <= inward <= limit:
                    continue
                horizontal_weight = 1.0 - smoothstep(0.72, 1.0, inward / limit)
                red, green, blue, alpha = pixels[x, y]
                if alpha < 8:
                    continue
                amount = correction * horizontal_weight * vertical_weight
                pixels[x, y] = (
                    max(0, min(255, round(red + amount))),
                    max(0, min(255, round(green + amount))),
                    max(0, min(255, round(blue + amount))),
                    alpha,
                )


def build_lighting_audit_sheet(
    audit: dict[str, dict[str, object]],
    previews: dict[str, Image.Image],
) -> Image.Image:
    columns = 2
    cell_width = 620
    cell_height = 255
    rows = math.ceil(len(audit) / columns)
    sheet = checkerboard((cell_width * columns, cell_height * rows), 24)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    for index, (name, metrics) in enumerate(audit.items()):
        column = index % columns
        row = index // columns
        x = column * cell_width
        y = row * cell_height
        preview = previews[name].resize((450, 225), Image.Resampling.LANCZOS)
        sheet.alpha_composite(preview, (x + 165, y + 28))
        passed = bool(metrics["pass"])
        draw.rectangle((x, y, x + cell_width - 1, y + cell_height - 1), outline=(72, 220, 130, 255) if passed else (255, 92, 68, 255), width=4)
        draw.text((x + 12, y + 12), name, font=font, fill=(238, 255, 244, 255))
        draw.text((x + 12, y + 48), "PASS" if passed else "FAIL", font=font, fill=(72, 240, 138, 255) if passed else (255, 110, 84, 255))
        draw.multiline_text(
            (x + 12, y + 82),
            f"light MAE {metrics['lowFrequencyMae']}\nmean delta {metrics['meanLumaDelta']}\ncontrast {metrics['contrastRatio']}\nleft/right {metrics['brightSideLumaDelta']} / {metrics['darkSideLumaDelta']}\nedge alpha {metrics['edgeAlpha']}",
            font=font,
            fill=(220, 236, 226, 255),
            spacing=9,
        )
    return sheet


def main() -> None:
    DIRECT_GRADE_AUDIT.clear()
    WORKBENCH.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    neutral = Image.open(NEUTRAL_PATH).convert("RGBA")
    sources = {
        "neutral": neutral,
        "left": Image.open(LEFT_SOURCE).convert("RGBA"),
        "right": Image.open(RIGHT_SOURCE).convert("RGBA"),
        "midlong-left": Image.open(MIDLONG_LEFT_SOURCE).convert("RGBA"),
        "midlong-right": Image.open(MIDLONG_RIGHT_SOURCE).convert("RGBA"),
    }
    neutral_blur = neutral.filter(ImageFilter.GaussianBlur(22))
    source_blurs = {
        name: source.filter(ImageFilter.GaussianBlur(22))
        for name, source in sources.items()
    }
    images: dict[str, Image.Image] = {}
    lighting_audit_images: dict[str, Image.Image] = {}
    records: dict[str, dict[str, object]] = {}
    canonical_targets: dict[str, tuple[int, int]] = {}

    for spec in SPECS:
        image, local_socket = extract_branch(sources[spec.source], source_blurs[spec.source], neutral, neutral_blur, spec)
        images[spec.name] = image
        lighting_audit_images[spec.name] = image
        filename = f"{spec.name}.png"
        image.save(RUNTIME / filename, "PNG", optimize=True)
        image.save(WORKBENCH / filename, "PNG", optimize=True)
        records[spec.name] = {
            "path": f"assets/attachment-proof/{filename}",
            "width": image.width,
            "height": image.height,
            "socket": list(local_socket),
            "class": spec.branch_class,
            "side": spec.side,
            "fitment": spec.fitment,
            "socketBand": spec.socket_band,
            "detailProfile": "branch",
            "canonicalSocket": list(spec.target_socket),
            "lowerSupport": spec.lower_support,
            "canonicalInwardRange": [spec.canonical_inward_start, spec.canonical_inward_end],
        }
        canonical_targets[spec.name] = spec.target_socket

    for spec in TRUNK_PATCH_SPECS:
        image, local_anchor = extract_trunk_patch(sources[spec.source], source_blurs[spec.source], neutral, neutral_blur, spec)
        image, local_anchor, lighting_reference = add_trunk_decoration(
            image,
            local_anchor,
            spec.name,
            spec.target_anchor,
        )
        images[spec.name] = image
        lighting_audit_images[spec.name] = lighting_reference
        filename = f"{spec.name}.png"
        image.save(RUNTIME / filename, "PNG", optimize=True)
        image.save(WORKBENCH / filename, "PNG", optimize=True)
        records[spec.name] = {
            "path": f"assets/attachment-proof/{filename}",
            "width": image.width,
            "height": image.height,
            "socket": list(local_anchor),
            "class": "trunk",
            "side": "center",
            "fitment": spec.fitment,
            "socketBand": "trunk",
            "detailProfile": spec.detail_profile,
            "sequence": spec.sequence,
            "sequenceOrder": spec.sequence_order,
            "vineLane": spec.vine_lane,
            "canonicalSocket": list(spec.target_anchor),
        }
        canonical_targets[spec.name] = spec.target_anchor

    # Run the same measurable inspection loop used by the review sheet, then
    # persist the calibrated pixels. This replaces hand-entered per-asset lifts.
    for name, record in records.items():
        if record["class"] != "trunk":
            auto_calibrate_mean_luminance(
                neutral,
                images[name],
                tuple(record["socket"]),
                canonical_targets[name],
                str(record["side"]),
            )
        filename = Path(str(record["path"])).name
        images[name].save(RUNTIME / filename, "PNG", optimize=True)
        images[name].save(WORKBENCH / filename, "PNG", optimize=True)

    # Hand-refined cartridges live outside the generated directory so rebuilding
    # the extraction pass cannot destroy approved pixel edits. Overrides must keep
    # the generated canvas dimensions and socket coordinates from the manifest.
    for name, record in records.items():
        override_path = OVERRIDES / f"{name}.png"
        if not override_path.exists():
            continue
        override = Image.open(override_path).convert("RGBA")
        expected_size = (int(record["width"]), int(record["height"]))
        if override.size != expected_size:
            raise ValueError(
                f"Override {override_path} is {override.size}; expected {expected_size}"
            )
        images[name] = override
        if record["class"] != "trunk":
            lighting_audit_images[name] = override
        filename = Path(str(record["path"])).name
        images[name].save(RUNTIME / filename, "PNG", optimize=True)
        images[name].save(WORKBENCH / filename, "PNG", optimize=True)

    audit: dict[str, dict[str, object]] = {}
    audit_previews: dict[str, Image.Image] = {}
    for name, record in records.items():
        metrics, _ = audit_attachment(
            neutral,
            lighting_audit_images[name],
            tuple(record["socket"]),
            canonical_targets[name],
            str(record["side"]),
        )
        _, audit_preview = audit_attachment(
            neutral,
            images[name],
            tuple(record["socket"]),
            canonical_targets[name],
            str(record["side"]),
        )
        audit[name] = metrics
        audit_previews[name] = audit_preview

    manifest = {
        "status": "low-resolution attachment proof; not production art",
        "neutralTree": {
            "path": "assets/attachment-proof/neutral-tree.png",
            "width": neutral.width,
            "height": neutral.height,
        },
        "attachments": records,
        "lightingAudit": {
            "path": "assets/attachment-proof/lighting-audit.json",
            "pass": sum(1 for result in audit.values() if result["pass"]),
            "total": len(audit),
        },
        "directGradeAudit": {
            "path": "assets/attachment-proof/direct-cartridge-grade.json",
            "assets": list(DIRECT_GRADE_AUDIT),
            "alphaPreserved": True,
        },
        "proofTrees": {
            name: [
                {"attachment": attachment, "socket": [target_x, target_y]}
                for attachment, target_x, target_y in placements
            ]
            for name, placements in PROOF_TREES.items()
        },
    }
    (RUNTIME / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (WORKBENCH / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (RUNTIME / "lighting-audit.json").write_text(json.dumps(audit, indent=2) + "\n")
    (WORKBENCH / "lighting-audit.json").write_text(json.dumps(audit, indent=2) + "\n")
    (RUNTIME / "direct-cartridge-grade.json").write_text(
        json.dumps(DIRECT_GRADE_AUDIT, indent=2) + "\n"
    )
    (WORKBENCH / "direct-cartridge-grade.json").write_text(
        json.dumps(DIRECT_GRADE_AUDIT, indent=2) + "\n"
    )

    sheet = build_attachment_sheet(records, images)
    sheet.save(WORKBENCH / "attachment-kit-sheet.png", "PNG", optimize=True)
    trunk_sheet = build_trunk_patch_sheet(records, images)
    trunk_sheet.save(WORKBENCH / "trunk-variation-sheet.png", "PNG", optimize=True)
    preview = build_two_tree_preview(neutral, records, images)
    preview.save(WORKBENCH / "attachment-proof-two-trees.png", "PNG", optimize=True)
    audit_sheet = build_lighting_audit_sheet(audit, audit_previews)
    audit_sheet.save(WORKBENCH / "lighting-audit-sheet.png", "PNG", optimize=True)

    immutable_reviews = {
        "twoTreeProof": save_immutable_review(
            WORKBENCH / "attachment-proof-two-trees.png",
            "exact-runtime-two-tree-proof",
        ),
        "straightDecorativeLimb": save_immutable_review(
            WORKBENCH / "trunk-small-a.png",
            "exact-runtime-trunk-small-a",
        ),
        "upwardDecorativeLimb": save_immutable_review(
            WORKBENCH / "trunk-small-c.png",
            "exact-runtime-trunk-small-c",
        ),
        "darkRightCompactDecorativeLimb": save_immutable_review(
            WORKBENCH / "trunk-small-e.png",
            "exact-runtime-trunk-small-e",
        ),
    }

    print(json.dumps({
        "attachmentCount": len(records),
        "runtime": str(RUNTIME),
        "sheet": str(WORKBENCH / "attachment-kit-sheet.png"),
        "trunkSheet": str(WORKBENCH / "trunk-variation-sheet.png"),
        "preview": str(WORKBENCH / "attachment-proof-two-trees.png"),
        "lightingAudit": str(WORKBENCH / "lighting-audit-sheet.png"),
        "directGradeAudit": str(WORKBENCH / "direct-cartridge-grade.json"),
        "immutableReviews": {
            name: str(path)
            for name, path in immutable_reviews.items()
        },
        "auditPass": sum(1 for result in audit.values() if result["pass"]),
        "auditTotal": len(audit),
    }, indent=2))


if __name__ == "__main__":
    main()
