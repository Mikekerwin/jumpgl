export type PlayerPhysicsState = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

const ORIGINAL_GRAVITY = 0.42;
const ORIGINAL_HOLD_BOOST = 0.2;
const HOLD_FORCE_RATIO = ORIGINAL_HOLD_BOOST / ORIGINAL_GRAVITY;
const MAX_HOLD_TIME_MS = 2700;

export interface PlayerPhysicsOptions {
  radius: number;
  groundSurface: number;
  initialX: number;
  screenWidth: number;
  gravity?: number;
  jumpForce?: number;
}

export class PlayerPhysics {
  private readonly radius: number;
  private groundSurface: number;
  private restCenterY: number;
  private x: number;
  private initialX: number;
  private y: number;
  private velocity = 0;
  private readonly gravity: number;
  private currentGravity: number; // Can be temporarily modified for intro animations
  private readonly jumpForce: number;
  private readonly bounceDamping = 0.45;
  private readonly minBounceVelocity = 140;
  private scaleX = 1;
  private scaleY = 1;
  private jumpCount = 0; // Track number of jumps (0, 1, or 2 for double jump)
  private hasJumpedFlag = false;
  private screenWidth: number;
  private horizontalRangeLeft = 250; // Pixels player can move left from initialX (increased for more range)
  private horizontalRangeRight = 150; // Pixels player can move right from initialX (reduced to stop at ~45% screen)
  private readonly DEFAULT_RANGE_LEFT = 250; // Original left range for reset
  private readonly DEFAULT_RANGE_RIGHT = 150; // Original right range for reset
  private lastCursorX = 0; // Track the actual cursor position for speed calculation
  private horizontalVelocity = 0; // Horizontal movement velocity (pixels per second)
  private targetX = 0; // Target X position from mouse
  private readonly DECELERATION_ZONE = 100; // Start slowing down 100px from edges
  private softFollowMode = false; // If true, lerp to mouse instead of instant snap
  private softFollowLerp = 0.08; // Lerp factor for soft follow

  // Jump input state (tracks whether jump button is held)
  private isCharging = false;

  // Hold boost state (in-air)
  private isHolding = false;
  private holdStartTime = 0;
  private readonly holdBoost: number;
  private readonly maxHoldTime = MAX_HOLD_TIME_MS; // ms

  // Platform surface override
  private surfaceOverrideY: number | null = null;
  private currentPlatformId: number | null = null;
  private platformBounceCount: number = 0;
  private groundCollisionEnabled = true;
  private platformsJumpedThrough: Set<number> = new Set(); // Track platform IDs jumped through from below

  // Height tracking for fall-based compression
  private highestYSinceLastPlatform: number = 0; // Track peak height for fall distance calculation
  private wasOnPlatformLastFrame: boolean = false; // Track if we just left a platform

  constructor(opts: PlayerPhysicsOptions) {
    this.radius = opts.radius;
    this.gravity = opts.gravity ?? 9000; // Increased from 6525 (~38% increase to lower jump height)
    this.currentGravity = this.gravity; // Start with normal gravity
    this.jumpForce = opts.jumpForce ?? 2250; // Base jump force
    this.holdBoost = this.gravity * HOLD_FORCE_RATIO; // Match original hold/grav ratio
    this.groundSurface = opts.groundSurface;
    this.restCenterY = this.groundSurface - this.radius;
    this.y = this.restCenterY;
    this.initialX = opts.initialX;
    this.x = this.initialX;
    this.targetX = this.initialX; // Initialize target to starting position
    this.screenWidth = opts.screenWidth;
  }

  update(deltaSeconds: number): PlayerPhysicsState {
    // Apply gravity (use currentGravity which can be temporarily modified)
    this.velocity += this.currentGravity * deltaSeconds;

    // Apply hold boost (counteracts gravity to extend jump)
    if (this.isHolding) {
      const heldTime = performance.now() - this.holdStartTime;
      if (heldTime < this.maxHoldTime) {
        this.velocity -= this.holdBoost * deltaSeconds;
      } else {
        this.isHolding = false;
      }
    }

    this.y += this.velocity * deltaSeconds;

    // Update horizontal position with instant tracking except near boundaries
    const playerMinX = this.initialX - this.horizontalRangeLeft;
    const playerMaxX = this.initialX + this.horizontalRangeRight;
    const distanceToTarget = this.targetX - this.x;

    // Calculate current distance from boundaries (based on current player position)
    const distFromLeft = this.x - playerMinX;
    const distFromRight = playerMaxX - this.x;

    // Check if we're in a deceleration zone AND moving toward that boundary
    const approachingLeftBoundary = distFromLeft < this.DECELERATION_ZONE && distanceToTarget < 0;
    const approachingRightBoundary = distFromRight < this.DECELERATION_ZONE && distanceToTarget > 0;

    if (approachingLeftBoundary || approachingRightBoundary) {
      // Approaching a boundary - apply smooth deceleration
      const baseSpeed = 2000; // pixels per second
      let maxSpeed = baseSpeed;

      // Apply deceleration based on distance from boundary
      if (approachingLeftBoundary) {
        // Moving left and close to left boundary
        const slowFactor = Math.max(0.1, distFromLeft / this.DECELERATION_ZONE);
        maxSpeed *= slowFactor * slowFactor; // Quadratic slowdown
      } else if (approachingRightBoundary) {
        // Moving right and close to right boundary
        const slowFactor = Math.max(0.1, distFromRight / this.DECELERATION_ZONE);
        maxSpeed *= slowFactor * slowFactor; // Quadratic slowdown
      }

      // Smoothly accelerate toward target position
      const targetVelocity = Math.sign(distanceToTarget) * Math.min(Math.abs(distanceToTarget) * 8, maxSpeed);
      const acceleration = 12000; // pixels per second squared

      if (Math.abs(targetVelocity - this.horizontalVelocity) < acceleration * deltaSeconds) {
        this.horizontalVelocity = targetVelocity;
      } else {
        this.horizontalVelocity += Math.sign(targetVelocity - this.horizontalVelocity) * acceleration * deltaSeconds;
      }

      // Apply horizontal velocity
      this.x += this.horizontalVelocity * deltaSeconds;
    } else {
      // Not approaching a boundary - use soft follow if enabled, otherwise instant tracking
      if (this.softFollowMode) {
        // Lerp to mouse position instead of instant snap
        this.x += (this.targetX - this.x) * this.softFollowLerp;
        this.horizontalVelocity = 0;
      } else {
        // Normal instant tracking
        this.x = this.targetX;
        this.horizontalVelocity = 0;
      }
    }

    // Clamp to boundaries
    this.x = Math.max(playerMinX, Math.min(playerMaxX, this.x));

    // Determine effective ground (platform override or default ground)
    const effectiveGround = this.surfaceOverrideY ?? this.restCenterY;
    const isOnPlatform = this.surfaceOverrideY !== null;

    // Track highest Y position when in air (for fall distance calculation)
    if (!isOnPlatform || this.velocity < 0) {
      // Not on platform or jumping up - track the highest point
      if (this.wasOnPlatformLastFrame) {
        // Just left platform - start tracking from current position
        this.highestYSinceLastPlatform = this.y;
      } else {
        // In air - track the highest point reached (remember: lower Y = higher position)
        this.highestYSinceLastPlatform = Math.min(this.highestYSinceLastPlatform, this.y);
      }
    }
    this.wasOnPlatformLastFrame = isOnPlatform;

    if (this.groundCollisionEnabled && this.y > effectiveGround) {
      this.y = effectiveGround;
      this.jumpCount = 0; // Reset jump count when touching ground/platform
      this.hasJumpedFlag = false;
      this.platformsJumpedThrough.clear(); // Clear tracked platforms when touching ground
      if (this.velocity > 0) {
        if (isOnPlatform) {
          // Platform collision: allow 3 bounces then stop
          this.platformBounceCount++;
          if (this.platformBounceCount >= 3) {
            this.velocity = 0;
          } else {
            // Apply bounce damping
            this.velocity = -this.velocity * this.bounceDamping;
            if (Math.abs(this.velocity) < this.minBounceVelocity) {
              this.velocity = 0;
              this.platformBounceCount = 3; // Prevent further bouncing
            }
          }
        } else {
          // Ground collision: normal bounce damping (infinite bounces allowed)
          this.velocity = -this.velocity * this.bounceDamping;
          if (Math.abs(this.velocity) < this.minBounceVelocity) {
            this.velocity = 0;
          }
        }
      }
    }

    this.applySquashStretch();

    return {
      x: this.x,
      y: this.y,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  /**
   * Start a jump immediately (called on pointer/key down).
   * Returns true if a jump was executed.
   */
  startJump(): boolean {
    if (this.jumpCount >= 2 || this.isCharging) return false;

    // Second jump is weaker (60% of first jump power)
    const jumpPower = this.jumpCount === 0 ? this.jumpForce : this.jumpForce * 0.6;
    this.velocity = -jumpPower;
    this.jumpCount++;

    // Track held input for variable jump height
    this.isCharging = true;
    this.isHolding = true;
    this.holdStartTime = performance.now();
    this.hasJumpedFlag = true;

    return true;
  }

  /**
   * Compatibility alias for existing callers expecting startJumpCharge()
   */
  startJumpCharge(): boolean {
    return this.startJump();
  }

  /**
   * Stop holding jump (called on pointer/key up)
   */
  endJump(): void {
    this.isCharging = false;
    this.isHolding = false;
  }

  setGroundSurface(surface: number): void {
    this.groundSurface = surface;
    this.restCenterY = this.groundSurface - this.radius;
    if (this.y > this.restCenterY) {
      this.y = this.restCenterY;
    }
  }

  private applySquashStretch(): void {
    const grounded = this.isGrounded();
    let targetX = 1;
    let targetY = 1;

    // DISABLED: Charging squash animation
    // if (this.isCharging) {
    //   targetX = 1.2;
    //   targetY = 0.82;
    // } else
    if (this.velocity < -220) {
      targetX = 0.78;
      targetY = 1.22;
    } else if (this.velocity > 220) {
      targetX = 1.18;
      targetY = 0.86;
    } else if (grounded) {
      targetX = 1;
      targetY = 1;
    }

    const lerp = 0.18;
    this.scaleX += (targetX - this.scaleX) * lerp;
    this.scaleY += (targetY - this.scaleY) * lerp;
  }

  private isGrounded(): boolean {
    const effectiveGround = this.surfaceOverrideY ?? this.restCenterY;
    return (
      Math.abs(this.y - effectiveGround) < 0.5 &&
      Math.abs(this.velocity) < this.minBounceVelocity
    );
  }

  /**
   * Land the player on a platform surface (allows bouncing with limit)
   * @param surfaceY Y position where player's top should be
   * @param platformId Platform ID to clear from jumped-through list
   */
  landOnSurface(surfaceY: number, platformId?: number): void {
    // Only set override if it's a new platform or first landing
    const isNewPlatform = platformId !== undefined
      ? platformId !== this.currentPlatformId
      : this.surfaceOverrideY !== surfaceY;
    this.surfaceOverrideY = surfaceY;

    // Reset bounce counter when landing on a new platform
    if (isNewPlatform) {
      this.platformBounceCount = 0;
    }
    // Clear this platform from the jumped-through list when we land on it
    if (platformId !== undefined) {
      this.currentPlatformId = platformId;
      this.platformsJumpedThrough.delete(platformId);
    }
    // Don't force position or velocity - let physics handle bouncing naturally
  }

  /**
   * Clear platform surface override (return to normal ground physics)
   */
  clearSurfaceOverride(): void {
    this.surfaceOverrideY = null;
    this.currentPlatformId = null;
    this.platformBounceCount = 0; // Reset bounce counter when leaving platform
  }

  /**
   * Mark a platform as jumped through from below
   * @param platformId Platform ID that player jumped through
   */
  markPlatformJumpedThrough(platformId: number): void {
    this.platformsJumpedThrough.add(platformId);
  }

  /**
   * Check if a specific platform was jumped through
   * @param platformId Platform ID to check
   */
  wasPlatformJumpedThrough(platformId: number): boolean {
    return this.platformsJumpedThrough.has(platformId);
  }

  /**
   * Clear all jumped-through platforms
   */
  clearJumpedThroughPlatforms(): void {
    this.platformsJumpedThrough.clear();
  }

  /**
   * Get the set of platforms jumped through (for collision detection)
   */
  getJumpedThroughPlatforms(): Set<number> {
    return this.platformsJumpedThrough;
  }

  /**
   * Get current vertical velocity (positive = falling down, negative = moving up)
   */
  getVerticalVelocity(): number {
    return this.velocity;
  }

  /**
   * Get the fall height (distance from highest point to current position)
   * Used for calculating landing compression based on fall distance
   * @returns Fall height in pixels (positive = fell down from higher position)
   */
  getFallHeight(): number {
    // Remember: lower Y = higher position in screen coordinates
    // So fall height = current Y - highest Y (which is the minimum Y value)
    return this.y - this.highestYSinceLastPlatform;
  }

  /**
   * Reset fall height tracking (called when landing on a platform)
   */
  resetFallHeight(): void {
    this.highestYSinceLastPlatform = this.y;
  }

  /**
   * Set player position (for intro animations, respawn, etc.)
   */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.targetX = x; // Also reset target to prevent drift
  }

  /**
   * Temporarily increase gravity (for intro animations)
   * @param multiplier Gravity multiplier (e.g., 3.0 for 3x gravity)
   */
  setGravityMultiplier(multiplier: number): void {
    this.currentGravity = this.gravity * multiplier;
  }

  /**
   * Restore gravity to normal
   */
  restoreNormalGravity(): void {
    this.currentGravity = this.gravity;
  }

  /**
   * Reset scale to normal (1.0, 1.0)
   */
  resetScale(): void {
    this.scaleX = 1.0;
    this.scaleY = 1.0;
  }

  /**
   * Enable soft mouse following (lerp to mouse instead of instant snap)
   */
  setSoftFollowMode(enabled: boolean): void {
    this.softFollowMode = enabled;
  }

  getState() {
    return {
      x: this.x,
      y: this.y,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      velocity: this.velocity,
    };
  }

  getRadius(): number {
    return this.radius;
  }

  setGroundCollisionEnabled(enabled: boolean): void {
    this.groundCollisionEnabled = enabled;
  }

  forceVelocity(newVelocity: number): void {
    this.velocity = newVelocity;
  }

  respawn(initialX: number, groundSurface: number): void {
    this.initialX = initialX;
    this.groundSurface = groundSurface;
    this.restCenterY = this.groundSurface - this.radius;
    this.x = this.initialX;
    this.y = this.restCenterY;
    this.velocity = 0;
    this.jumpCount = 0;
    this.platformBounceCount = 0;
    this.surfaceOverrideY = null;
    this.isCharging = false;
    this.isHolding = false;
    this.holdStartTime = 0;
    this.groundCollisionEnabled = true;
    this.platformsJumpedThrough.clear();
    this.highestYSinceLastPlatform = this.y;
    this.wasOnPlatformLastFrame = false;
  }

  /**
   * Update player's target horizontal position based on mouse/touch input.
   * Player directly follows mouse with deceleration only near boundaries.
   */
  setMousePosition(clientX: number): void {
    this.lastCursorX = clientX; // Store cursor position for speed calculation

    // Player boundary limits
    const playerMinX = this.initialX - this.horizontalRangeLeft;
    const playerMaxX = this.initialX + this.horizontalRangeRight;

    // Set target to cursor position, clamped to boundaries
    this.targetX = Math.max(playerMinX, Math.min(playerMaxX, clientX));
  }

  /**
   * Update screen width (for window resize)
   */
  updateScreenWidth(newWidth: number): void {
    this.screenWidth = newWidth;
  }

  /**
   * Set horizontal movement range dynamically
   * Used to expand/contract player movement based on game state (e.g., enemy visibility)
   */
  setHorizontalRange(left: number, right: number): void {
    this.horizontalRangeLeft = left;
    this.horizontalRangeRight = right;
  }

  /**
   * Reset horizontal range to default values
   */
  resetHorizontalRange(): void {
    this.horizontalRangeLeft = this.DEFAULT_RANGE_LEFT;
    this.horizontalRangeRight = this.DEFAULT_RANGE_RIGHT;
  }

  /**
   * Get current charge level (0.0 to 1.0) for particle system
   * Returns 0 if not charging
   */
  getChargeLevel(): number {
    if (!this.isCharging) return 0;
    const holdTime = performance.now() - this.holdStartTime;
    const clampedHoldTime = Math.min(holdTime, this.maxHoldTime);
    return clampedHoldTime / this.maxHoldTime;
  }

  /**
   * Check if currently charging a jump
   */
  isChargingJump(): boolean {
    return this.isCharging;
  }

  /**
   * Calculate scroll speed multiplier based on actual cursor position.
   * Mapping:
   * - Cursor at 0-10% screen: Speed = 0.1 → 1.5 (slow crawl to walk)
   * - Cursor at 10-25% screen: Speed = 1.5 (default walk speed)
   * - Cursor at 25-50% screen: Speed = 1.5 → 3.0 (walk to sprint)
   * - Cursor at 50%+ screen: Speed = 3.0 (max sprint speed)
   */
  getScrollSpeedMultiplier(): number {
    // Use actual cursor position (not the mapped player position)
    const cursorX = this.lastCursorX;

    // Calculate screen percentages
    const screen10Percent = this.screenWidth * 0.10;
    const screen25Percent = this.screenWidth * 0.25;
    const screen50Percent = this.screenWidth * 0.50;

    const minSpeed = 0.1; // 10% speed at far left
    const walkSpeed = 1.5; // Default walking speed
    const maxSpeed = 3.0; // Sprint speed

    if (cursorX <= 0) {
      return minSpeed;
    } else if (cursorX <= screen10Percent) {
      // 0% to 10% screen: 0.1 → 1.5 (fast ramp to walk)
      const progress = cursorX / screen10Percent;
      return minSpeed + progress * (walkSpeed - minSpeed);
    } else if (cursorX <= screen25Percent) {
      // 10% to 25% screen: 1.5 (maintain walk speed)
      return walkSpeed;
    } else if (cursorX <= screen50Percent) {
      // 25% to 50% screen: 1.5 → 3.0 (walk to sprint)
      const progress = (cursorX - screen25Percent) / (screen50Percent - screen25Percent);
      return walkSpeed + progress * (maxSpeed - walkSpeed);
    } else {
      // Beyond 50% screen: 3.0 (max sprint speed)
      return maxSpeed;
    }
  }

  hasPlayerJumped(): boolean {
    return this.hasJumpedFlag;
  }
}
