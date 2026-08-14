# Modular Forest Tree Workflow

## Goal

Build concept-quality foreground trees that can grow to arbitrary gameplay height
without visible seams, white fringes, incompatible widths, or repetitive whole-tree
silhouettes.

The authoritative visual target is `Desktop/trees/referenceFull.png`. The generated
master tree in `forest-art-workbench/generated/master-tree-v1.png` is the first
art-direction prototype produced from that target and the stronger Desktop concept
sheets. It is not yet a production module set.

## Findings From The Source Art

- `referenceFull.png` / `reference.png` define the target palette, lighting, depth,
  bark mass, branch-platform language, and overall finish.
- `background.png` succeeds because its atmosphere and depth are composed as one
  continuous image. It should remain a far-background plate, not be decomposed into
  foreground gameplay pieces.
- `custom.png` contains the strongest concept-derived foreground trunks and roots,
  but its dark blocks, damaged transparency, and partial scene pixels make automatic
  extraction unsuitable.
- `mid.png`, `middleground.png`, and the June 5 mid/canopy sheets provide good shape
  vocabulary. Their pieces were generated independently, so their trunk widths,
  lighting, bark flow, and endpoints do not form a shared connector system.
- `singleTreeExplode.png` is a useful design diagram, but its white sheet and separately
  invented variants cannot guarantee seamless stacking.
- The current Pixi connection-ratio scaling compensates for mismatched widths. It
  cannot repair incompatible bark flow or exposed cut edges; reversing draw order
  merely reveals the opposite source seam.
- The current white-background extractor assigns alpha to near-white pixels without
  replacing their RGB color. Resampling and WebGL filtering can therefore reveal
  white RGB stored under semi-transparent edge pixels as a halo.

## Tree Grammar

Do not generate bases, trunks, and crowns independently. Create one coherent gold
master tree, approve its art direction, and derive every initial module from it.

The runtime tree graph is:

```text
ROOT_BASE -> LOWER_TAPER -> MID_SHAFT* -> UPPER_TAPER -> CANOPY
```

- `ROOT_BASE`: unique roots and ground contact; no repeat requirement.
- `LOWER_TAPER`: transitions once from the wide roots into the standard shaft port.
- `MID_SHAFT`: constant connector width and centerline; repeat zero or many times.
- `UPPER_TAPER`: transitions once from the standard shaft into crown branching.
- `CANOPY`: unique crown and sky-transition silhouette.

This keeps the tree visually tapered while allowing the player to climb an arbitrary
number of middle sections. The repeatable middle must not continue the taper.

## Connector Contract

All repeatable pieces share one normalized port rather than being scaled by their
outer sprite bounds.

- Fixed vertical trunk centerline across all modules.
- Identical top and bottom port width for every `MID_SHAFT` variant.
- A calm bark-only overlap belt at both ends; no platforms, vines, mushrooms, knots,
  holes, leaves, or strong highlights may cross a connector belt.
- Adjacent pieces overlap inside the belt. They never meet with two hard cut edges.
- The receiving piece draws over the overlap, with a short alpha feather/crossfade if
  needed. Bark grain continues through the belt before decorative overlays are added.
- Each exported sprite includes transparent padding and color-bleed pixels outside
  the visible alpha edge so texture filtering cannot sample white.
- Connector position, width, overlap depth, trunk centerline, platform surfaces, and
  attachment sockets live in metadata. They are not inferred from sprite dimensions.

Exact pixel measurements should be locked only after the master silhouette is
approved. The normalized contract lets us regenerate at a higher authoring resolution
without changing assembly behavior.

## Variation Without Repetition

Variation should happen away from the connector belts:

1. Start with the approved master and preserve both seam belts exactly.
2. Create three to five `MID_SHAFT` interiors: left platform, right platform,
   alternating platforms, sparse bark, and knot/hollow variants.
3. Keep platform collision surfaces as authored metadata, not alpha-derived bounds.
4. Add separate socketed overlays for small leaves, mushrooms, vines, flowers, and
   minor limbs. These can vary heavily without risking trunk continuity.
5. Allow horizontal mirroring only for approved overlays. Do not mirror the lit trunk
   core because the concept lighting is directional.
6. Use weighted sequences that avoid the same interior twice in a row and separate
   distinctive knots or flowers by several modules.

### Smart branch sockets

The sequence previews are not fixed whole-tree variants. Production trees use three
shaft heights (`compact`, `standard`, and `tall`) with discrete lower/middle/upper
attachment sockets on both sides. Branch overlays are authored independently for
left and right so directional lighting is never mirrored.

The approved family has four branch classes: decorative non-playable nub, small,
medium, and long. The oversized experimental `veryLong` class is disabled; the old
second-longest branch is now the maximum. Each class needs at least three silhouettes
per side. Every size/side combination must also have at least two genuinely different
trunk fitments, even when the outward branch silhouette is similar: for example a
bark fork/collar, rear brace, moss-grown joint, root-like joint, or healed scar. The
fitment is part of the authored attachment sprite, so swapping a medium branch does
not repeatedly reveal the same connection graphic. At a minimum, the silhouette set
creates 24 authored branch choices before fitment variants, shaft height, socket
position, empty sides, bark/hollow interiors, vines, flowers, and sequence order are
considered.

Placement is intentionally discrete instead of continuous. A rear brace, playable
surface, and front bark collar hide the attachment while keeping branch tops and
colliders readable. All fitment variants for a size/side share the same normalized
socket anchor, allowing the generator to exchange them without moving the platform or
collider. The generator can therefore vary when and where branches appear—and how the
same branch class grows from the trunk—without visible paste seams.

The current proof uses a hybrid **branch-and-trunk cartridge** rather than reducing
every branch to a tiny collar. Each branch sprite preserves a larger local section of
the stronger source tree's bark, vines, knots, and natural lighting, so changing a
branch also changes the shaft around it. Branchless bark cartridges fill levels between
platforms. These remain front-layer pieces with discrete per-variant X/Y/light tuning;
their feathered bounds must pass the automated transparent-margin audit before visual
calibration. This trades completely free continuous placement for substantially richer,
less repetitive trunks and more convincing authored branch roots.

Every cartridge now declares a canonical socket band (`lower`, `middle`, `upper`, or
`canopy`). Its broad color and lighting are transferred from the neutral trunk at that
exact socket, while its high-frequency bark, knot, moss, and vine residual is retained
and contrast-matched. An alpha-aware audit measures the receiving trunk side rather
than the outward branch and rejects excessive low-frequency color error, luminance
drift, contrast drift, or nontransparent export edges. Do not restore free vertical
placement or cross-band A/B swaps: nearby bark lines make these cartridges band-specific.

Branchless trunk detail is sequenced by profile. `calm` means the untouched canonical
trunk; it must never contain an orphan branch scar. `rich` pieces are grouped into runs.
Multi-piece vine runs share a named X lane and preserve source order, so top/middle/
bottom ports can continue through adjacent pieces. A generator may leave a calm run or
choose a complete compatible rich run, but it must not scatter isolated vine fragments
or alternate calm/rich every section.

Rich trunk overlays are rebuilt on the neutral trunk's exact mapped pixels. Source art
contributes only bounded high-frequency detail; it never supplies the base light field.
This is stricter than average brightness matching and prevents a source branch shadow
or dark bark band from contaminating the bright left face. The audit checks bright-left
and dark-right luminance independently in addition to mean light and contrast.

The same rule applies to the far receiving-trunk area carried by right-facing branch
cartridges. Rebuild that sunlit area on canonical pixels, but stop the replacement
before the socket so the authored load-bearing wedge and underside contact shadow stay
intact. Audit the far bright face separately from the near-socket joint.

Branch support depth scales with platform length. A nub keeps a shallow collar; small
and medium branches retain progressively deeper trunk roots; a long playable platform
must preserve the full load-bearing wedge and its underside contact shadow. This depth
is recorded as `lowerSupport` metadata and is part of the authored cartridge—not a
runtime drop shadow. The source crop and mask must have enough lower area to feather the
support naturally without fading or clipping its bottom edge.

Root-flare joints and straight-shaft joints are separate fitment families even when
their outward branch silhouette is reused. A root fitment is locked to `root-lower`
and may preserve buttress/root geometry. Its straight variant is rebuilt against a
middle-band canonical trunk, uses a shallower support, and canonicalizes farther toward
the socket. Never move a root-flare cartridge upward merely because its branch length
fits the desired gameplay slot.

Vertical spacing is driven by the largest branch at the current level: compact after
a nub/small branch, standard after medium, and tall after long. Long branches allow
only an empty opposite side or a nub. Final numeric distances are calibrated against
the player's jump arc; the current values are art-direction targets only.

## Layering Inside One Tree

For reliable depth and platform readability, author a tree module as a small stack:

1. Rear vines and rear branch braces.
2. Trunk core.
3. Playable branch/platform surface.
4. Front bark, moss, leaves, and flowers.
5. Hanging foreground vines.

The collider belongs to the platform surface layer. Decorative alpha never defines
gameplay geometry.

## Asset Pipeline

1. Generate a 1024 x 1536 art-direction preview with the built-in image tool. Save
   its exact prompt and checksum, show it to the user, and do not make an API call.
2. Promote only an explicitly approved preview. First create a deterministic enlarged
   copy whose composition is mathematically identical. Then make one paid
   high-resolution detail-enhancement edit using the approved preview as Image 1.
   Treat the enhanced output as a separate approval gate because a generative edit
   can preserve composition closely but cannot promise identical pixels.
3. Generate or paint one complete gold master at the highest approved authoring
   resolution against flat magenta, never white. Preserve this lossless master as the
   source of truth; never replace it with a runtime-optimized derivative.
4. Remove chroma with a soft matte and despill.
5. Validate transparent corners, partial-alpha edges, and residual key color.
6. Fill RGB under transparent border pixels from nearby opaque tree colors (edge
   dilation/extrusion), then add export padding.
7. Choose connector belts on calm areas of the approved master.
8. Slice modules deterministically from the same master with overlap preserved.
9. Create variants by editing only module interiors while locking connector belts.
   Prefer paid edits of the smaller module crop instead of regenerating an entire
   8-megapixel tree for every variation.
10. Export lossless PNG for workbench masters. Derive runtime PNG/WebP/atlas textures
   at a selectable resolution from the master. The manifest records independent X/Y
   authoring-pixel density so changing resolution never changes the tree's gameplay
   size or the sandbox's master-scale control.
11. Test on black, white, magenta, and the real forest background at several scales.
12. Run an automated stack matrix: every middle bottom against every middle top.
13. Preview a tall randomized tree in the standalone sandbox before adding it to the
    live game.

## First Production Set

- 1 root base
- 1 lower taper adapter
- 4 repeatable middle-shaft variants
- 1 upper taper adapter
- 2 canopy crowns
- 6 to 10 socketed branch/detail overlays
- Connector and collision metadata for every piece

The first acceptance gate is the complete master tree. Slicing and generating variants
before its silhouette, bark rendering, lighting, canopy, and platform language are
approved would multiply the wrong decisions.
