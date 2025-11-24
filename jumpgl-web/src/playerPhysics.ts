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
  private readonly jumpForce: number;
  private readonly bounceDamping = 0.45;
  private readonly minBounceVelocity = 140;
  private scaleX = 1;
  private scaleY = 1;
  private jumpCount = 0; // Track number of jumps (0, 1, or 2 for double jump)
  private screenWidth: number;
  private horizontalRangeLeft = 250; // Pixels player can move left from initialX (increased for more range)
  private horizontalRangeRight = 150; // Pixels player can move right from initialX (reduced to stop at ~45% screen)
  private lastCursorX = 0; // Track the actual cursor position for speed calculation

  // Jump input state (tracks whether jump button is held)
  private isCharging = false;

  // Hold boost state (in-air)
  private isHolding = false;
  private holdStartTime = 0;
  private readonly holdBoost: number;
  private readonly maxHoldTime = MAX_HOLD_TIME_MS; // ms

  // Platform surface override
  private surfaceOverrideY: number | null = null;
  private platformBounceCount: number = 0;
  private groundCollisionEnabled = true;

  constructor(opts: PlayerPhysicsOptions) {
    this.radius = opts.radius;
    this.gravity = opts.gravity ?? 9000; // Increased from 6525 (~38% increase to lower jump height)
    this.jumpForce = opts.jumpForce ?? 2250; // Base jump force
    this.holdBoost = this.gravity * HOLD_FORCE_RATIO; // Match original hold/grav ratio
    this.groundSurface = opts.groundSurface;
    this.restCenterY = this.groundSurface - this.radius;
    this.y = this.restCenterY;
    this.initialX = opts.initialX;
    this.x = this.initialX;
    this.screenWidth = opts.screenWidth;
  }

  update(deltaSeconds: number): PlayerPhysicsState {
    // Apply gravity
    this.velocity += this.gravity * deltaSeconds;

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

    // Determine effective ground (platform override or default ground)
    const effectiveGround = this.surfaceOverrideY ?? this.restCenterY;
    const isOnPlatform = this.surfaceOverrideY !== null;

    if (this.groundCollisionEnabled && this.y > effectiveGround) {
      this.y = effectiveGround;
      this.jumpCount = 0; // Reset jump count when touching ground/platform
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
   */
  landOnSurface(surfaceY: number): void {
    // Only set override if it's a new platform or first landing
    const isNewPlatform = this.surfaceOverrideY !== surfaceY;
    this.surfaceOverrideY = surfaceY;

    // Reset bounce counter when landing on a new platform
    if (isNewPlatform) {
      this.platformBounceCount = 0;
    }
    // Don't force position or velocity - let physics handle bouncing naturally
  }

  /**
   * Clear platform surface override (return to normal ground physics)
   */
  clearSurfaceOverride(): void {
    this.surfaceOverrideY = null;
    this.platformBounceCount = 0; // Reset bounce counter when leaving platform
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
  }

  /**
   * Update player's horizontal position based on mouse/touch input.
   * Maps a small cursor range (150px - ~middle) to full player range.
   * This amplifies cursor movement so you move less than the player moves.
   */
  setMousePosition(clientX: number): void {
    this.lastCursorX = clientX; // Store cursor position for speed calculation

    // Cursor control range: 150px to middle of screen (~screenWidth/2)
    const cursorMinX = 150;
    const cursorMaxX = this.screenWidth / 2;

    // Player visual range: far left to far right
    const playerMinX = this.initialX - this.horizontalRangeLeft;
    const playerMaxX = this.initialX + this.horizontalRangeRight;

    // Map cursor position to player position
    // Clamp cursor to control range
    const clampedCursor = Math.max(cursorMinX, Math.min(cursorMaxX, clientX));
    const cursorRatio = (clampedCursor - cursorMinX) / (cursorMaxX - cursorMinX);

    this.x = playerMinX + cursorRatio * (playerMaxX - playerMinX);
  }

  /**
   * Update screen width (for window resize)
   */
  updateScreenWidth(newWidth: number): void {
    this.screenWidth = newWidth;
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
}
