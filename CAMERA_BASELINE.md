# Camera System Baseline - Working Perfectly

**Date**: 2025-11-22
**Commit**: 9c5a737 (fix: resolve TypeScript unused variable warnings)
**Previous Commit**: f36572b (feat: perfect up and down camera cycling)

## Current Behavior (WORKING PERFECTLY)

The camera system works flawlessly with these characteristics:

### Camera Movement
- **Locks to platform heights**: When landing on a platform, camera sets `cameraFloorY` to that platform's `surfaceY`
- **Stays locked above floor**: Camera remains at locked height while player is at or above the floor
- **Follows downward**: When player falls >20px below camera floor, camera smoothly tracks downward at 0.5x fall distance
- **Resets at ground**: Camera returns to default (0) when player reaches baseline ground
- **Smooth interpolation**: 0.15 lerp speed for smooth transitions

### Implementation Details
Location: `jumpgl-web/src/main.ts` lines 220-431

```typescript
// Camera tracking variables
let cameraY = 0; // Current camera Y offset
let cameraFloorY = Infinity; // The Y position the camera is locked to
const CAMERA_LERP_SPEED = 0.15;
const CAMERA_FOLLOW_THRESHOLD = 20; // Pixels below floor before following

// Lock on platform landing
if (supportingPlatform.surfaceY < cameraFloorY) {
  cameraFloorY = supportingPlatform.surfaceY;
}

// Camera logic
const platformHeight = baselineRestY - cameraFloorY;
const lockedCameraY = platformHeight * 0.5; // 50% of platform height

// Follow player downward if they fall below floor
if (playerTop > cameraFloorY + CAMERA_FOLLOW_THRESHOLD) {
  const fallDistance = playerTop - cameraFloorY;
  targetCameraY = lockedCameraY - fallDistance * 0.5;
  targetCameraY = Math.max(0, targetCameraY);
}

// Apply to scene (positive Y = scene moves down = camera moves up)
scene.position.y = cameraY;
```

### Visual Effect
- No black space at bottom ✓
- Smooth camera transitions ✓
- Proper upward/downward tracking ✓
- Correct Y-axis direction (positive Y moves scene down) ✓

## Next Enhancement: Vertical Parallax

The background layers should move with camera at proportional rates matching their horizontal parallax:
- If a layer moves at 50% speed horizontally, it should move at 50% speed vertically
- This maintains consistent depth perception in all directions
- Prevents backgrounds from moving "too fast" when camera adjusts

**Issue to fix**: Currently all scene elements (including backgrounds) move at 100% of camera movement. Backgrounds should move slower based on their parallax factor.

## Reversion Instructions

If changes break the camera system, revert to commit `9c5a737`:

```bash
git checkout 9c5a737 -- jumpgl-web/src/main.ts
```

Or restore these key values:
- `CAMERA_LERP_SPEED = 0.15`
- `CAMERA_FOLLOW_THRESHOLD = 20`
- `lockedCameraY = platformHeight * 0.5`
- `scene.position.y = cameraY` (positive Y)
