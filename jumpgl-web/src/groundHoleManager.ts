/**
 * GroundHoleManager - Manages hole hitboxes in ground textures
 * Unlike platform holes, these are synchronized with ground texture segments
 */

export type GroundHoleType = 'meteor_transition' | 'full_hole' | 'hole_transition_back';

export interface GroundHoleInstance {
  x: number; // World X position (left edge)
  width: number; // Hitbox width
  groundY: number; // Ground plane Y
  type: GroundHoleType;
  active: boolean;
}

export interface PlayerBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface DebugHitbox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  type: GroundHoleType;
}

export class GroundHoleManager {
  private holes: GroundHoleInstance[] = [];
  private readonly HOLE_DEPTH = 150; // Hitbox extends down from ground (matches platform hole depth)
  private readonly HOLE_TOP_OFFSET = 110; // Push hole hitbox down from ground

  constructor() {}

  /**
   * Spawn a ground hole synchronized with a ground segment
   */
  public spawnGroundHole(
    segmentX: number,
    segmentWidth: number,
    groundY: number,
    type: GroundHoleType
  ): void {
    let holeX: number;
    let holeWidth: number;

    switch (type) {
      case 'meteor_transition':
        // Hole on RIGHT ~66% of texture (starts a bit later, slightly narrower)
        // Anchor the right edge to the segment end so gaps don't appear
        holeWidth = segmentWidth * 0.66;
        holeX = segmentX + segmentWidth - holeWidth;
        break;

      case 'full_hole':
        // Entire texture is a hole (100%)
        holeX = segmentX;
        holeWidth = segmentWidth;
        break;

      case 'hole_transition_back':
        // Hole on LEFT ~28% of texture (slightly narrower)
        holeX = segmentX;
        holeWidth = segmentWidth * 0.28;
        break;
    }

    const hole: GroundHoleInstance = {
      x: holeX,
      width: holeWidth,
      groundY,
      type,
      active: true,
    };

    this.holes.push(hole);
  }

  /**
   * Check if player is overlapping any ground hole
   */
  public getCollidingHole(bounds: PlayerBounds): GroundHoleInstance | null {
    for (const hole of this.holes) {
      if (!hole.active) continue;

      // Calculate hole hitbox bounds
      const holeLeft = hole.x;
      const holeRight = hole.x + hole.width;
      // Holes extend downward from ground (like platform holes)
      const holeTop = hole.groundY + this.HOLE_TOP_OFFSET; // Lower hitbox so player falls into hole
      const holeBottom = holeTop + this.HOLE_DEPTH; // Extends deep below hole top

      // AABB collision check
      const overlapsX = bounds.right > holeLeft && bounds.left < holeRight;
      const overlapsY = bounds.bottom > holeTop && bounds.top < holeBottom;

      if (overlapsX && overlapsY) {
        return hole;
      }
    }

    return null;
  }

  /**
   * Update holes - scroll left and cull off-screen
   */
  public update(deltaSeconds: number, groundSpeed: number, shouldCull?: (x: number, w: number) => boolean): void {
    const scrollAmount = groundSpeed * deltaSeconds;

    // Scroll all holes left
    for (const hole of this.holes) {
      hole.x -= scrollAmount;
    }

    // Cull holes if culling function provided
    if (shouldCull) {
      this.holes = this.holes.filter((hole) => {
        if (!hole.active) return false;
        return !shouldCull(hole.x, hole.width);
      });
    }
  }

  /**
   * Get debug hitbox info for visualization
   */
  public getDebugHitboxes(): DebugHitbox[] {
    return this.holes
      .filter((hole) => hole.active)
      .map((hole) => ({
        left: hole.x,
        right: hole.x + hole.width,
        top: hole.groundY + this.HOLE_TOP_OFFSET, // Lower hitbox so player falls into hole
        bottom: hole.groundY + this.HOLE_TOP_OFFSET + this.HOLE_DEPTH, // Extends deep below hole top
        type: hole.type,
      }));
  }

  /**
   * Clear all ground holes
   */
  public clear(): void {
    this.holes = [];
  }

  /**
   * Get count of active holes
   */
  public getCount(): number {
    return this.holes.filter((h) => h.active).length;
  }
}
