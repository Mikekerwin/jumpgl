# Platform Collision Replacement Notes

Date: February 17, 2026

This note tracks exactly what was replaced in the platform reliability refactor so we can revert specific parts quickly.

## Replacements

1. Single implicit hitbox split -> explicit acquire/hold hitboxes
- Replaced:
  - `PLAYER_PLATFORM_HITBOX_HORIZONTAL_SCALE`
- With:
  - `PLAYER_PLATFORM_HITBOX_HOLD_SCALE`
  - `PLAYER_PLATFORM_HITBOX_ACQUIRE_SCALE`
- Where:
  - `jumpgl-web/src/main.ts`
- Behavior:
  - Hold checks use tighter bounds.
  - Landing acquisition uses wider bounds.

2. Immediate lock drop on first unsupported frame -> conditional support-loss hysteresis
- Replaced:
  - Direct clear on `walkedOff` / `!stillOverPlatform`.
- With:
  - `platformSupportLostAt` timer + `PLATFORM_SUPPORT_LOSS_GRACE_MS`
  - `hasGraceEligiblePlatformSupport(...)` guard
- Where:
  - `jumpgl-web/src/main.ts`

3. Immediate hole fall on first unsupported overlap -> conditional hole-contact hysteresis
- Replaced:
  - Immediate `triggerFallIntoHole(...)` once unsupported + colliding.
- With:
  - `holeContactStartedAt` timer + `HOLE_CONTACT_GRACE_MS`
- Where:
  - `jumpgl-web/src/main.ts`

4. Repeated lock-release blocks -> shared helper
- Replaced:
  - Repeated sequences of:
    - `physics.clearSurfaceOverride()`
    - `clearPlatformJumpedThrough(...)`
    - `lastLeftPlatformId` updates
    - `activePlatformId = null`
- With:
  - `releaseActivePlatformLock(...)`
  - `resetPlatformContactTimers()`
- Where:
  - `jumpgl-web/src/main.ts`

5. Debug overlay with only one player box -> explicit full/acquire/hold visualization
- Replaced:
  - Single player rect in debug hitbox draw.
- With:
  - Full body (red)
  - Acquire bounds (orange)
  - Hold bounds (magenta)
- Where:
  - `jumpgl-web/src/main.ts`

6. Strict impact-time-only acquisition -> impact + late-catch acquisition
- Replaced:
  - Landing detection that required horizontal overlap exactly at impact time.
- With:
  - Speed-gated confidence catch for large lateral travel that estimates bottom position at horizontal overlap entry time.
- Where:
  - `jumpgl-web/src/floatingPlatforms.ts`

## Fast Rollback Options

1. Roll back only hysteresis (keep other changes):
- Remove usage of:
  - `platformSupportLostAt`, `holeContactStartedAt`
  - `PLATFORM_SUPPORT_LOSS_GRACE_MS`, `HOLE_CONTACT_GRACE_MS`
  - `hasGraceEligiblePlatformSupport(...)`
- Revert affected `walkedOff` / `stillOverPlatform` branches and hole block in `jumpgl-web/src/main.ts`.

2. Roll back only hitbox sizing split:
- Replace:
  - `PLAYER_PLATFORM_HITBOX_HOLD_SCALE` and `PLAYER_PLATFORM_HITBOX_ACQUIRE_SCALE`
- With:
  - `PLAYER_PLATFORM_HITBOX_HORIZONTAL_SCALE`
- Revert the bounds math in collision setup (`playerBounds`, `prevBounds`, `platformLandingBounds`, `platformPrevLandingBounds`).

3. Roll back only helper consolidation:
- Inline `releaseActivePlatformLock(...)` call sites back to previous direct clear blocks.

## Primary File

- `jumpgl-web/src/main.ts`

No gameplay flow outside platform/hole contact handling was intentionally changed.

## June 8, 2026 Refinement

- Floating platforms now retain their previous X and surface Y each frame.
- Landing acquisition uses relative swept motion between the player and moving platform.
- Removed the broad fast-confidence catch that could snap the player upward from far below.
- A player in direct contact is carried by platform Y motion only; horizontal position always follows mouse/touch input.
- Active support is retained through jumps and bounces so the same platform can catch the player again.
- Floating-platform support maintenance uses the full acquisition hitbox with direct current overlap.
- A crossing from above may land on direct end-of-frame overlap after very fast mouse movement, without any below-platform catch pad.
- Treehouse jump grace remains unchanged.
