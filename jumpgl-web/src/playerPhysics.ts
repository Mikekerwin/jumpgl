export type PlayerPhysicsState = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

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
  private readonly chargeDuration = 0.12;
  private isCharging = false;
  private chargeTimer = 0;
  private scaleX = 1;
  private scaleY = 1;
  private jumpCount = 0; // Track number of jumps (0, 1, or 2 for double jump)
  private screenWidth: number;
  private horizontalRangeLeft = 250; // Pixels player can move left from initialX (increased for more range)
  private horizontalRangeRight = 150; // Pixels player can move right from initialX (reduced to stop at ~45% screen)
  private lastCursorX = 0; // Track the actual cursor position for speed calculation

  constructor(opts: PlayerPhysicsOptions) {
    this.radius = opts.radius;
    this.gravity = opts.gravity ?? 3000; // Increased from 2500 (20% faster)
    this.jumpForce = opts.jumpForce ?? 1800; // Increased from 1500 (20% faster)
    this.groundSurface = opts.groundSurface;
    this.restCenterY = this.groundSurface - this.radius;
    this.y = this.restCenterY;
    this.initialX = opts.initialX;
    this.x = this.initialX;
    this.screenWidth = opts.screenWidth;
  }

  update(deltaSeconds: number): PlayerPhysicsState {
    if (this.isCharging) {
      this.chargeTimer += deltaSeconds;
      if (this.chargeTimer >= this.chargeDuration) {
        this.isCharging = false;
        // Second jump is weaker than first jump (60% power)
        const jumpPower = this.jumpCount === 0 ? this.jumpForce : this.jumpForce * 0.6;
        this.velocity = -jumpPower;
        this.jumpCount++;
      }
    }

    this.velocity += this.gravity * deltaSeconds;
    this.y += this.velocity * deltaSeconds;

    if (this.y > this.restCenterY) {
      this.y = this.restCenterY;
      this.jumpCount = 0; // Reset jump count when touching ground
      if (this.velocity > 0) {
        this.velocity = -this.velocity * this.bounceDamping;
        if (Math.abs(this.velocity) < this.minBounceVelocity) {
          this.velocity = 0;
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

  startJumpCharge(): void {
    // Allow jump if we haven't used both jumps yet
    if (this.jumpCount < 2 && !this.isCharging) {
      this.isCharging = true;
      this.chargeTimer = 0;
    }
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

    if (this.isCharging) {
      targetX = 1.2;
      targetY = 0.82;
    } else if (this.velocity < -220) {
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
    return (
      Math.abs(this.y - this.restCenterY) < 0.5 &&
      Math.abs(this.velocity) < this.minBounceVelocity
    );
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
   * Calculate scroll speed multiplier based on actual cursor position.
   * Mapping:
   * - Cursor at 0px (far left): Speed = 0 (stopped)
   * - Cursor at 150px from left: Speed = 1 (normal walk speed)
   * - Cursor at 300px from left and beyond: Speed = 2.3 (max run speed)
   *
   * This creates easy control where you only need to move your cursor 150px
   * to walk, and 300px (about middle of most screens) to reach max speed.
   */
  getScrollSpeedMultiplier(): number {
    // Use actual cursor position (not the mapped player position)
    const cursorX = this.lastCursorX;

    // Walk speed at 150px, max speed (2.3x) at 300px
    const walkSpeedThreshold = 150;
    const maxSpeedThreshold = 300;
    const maxSpeed = 2.3;

    if (cursorX <= 0) {
      return 0; // Stopped at far left
    } else if (cursorX <= walkSpeedThreshold) {
      // 0px to 150px: 0 → 1 (stopped to walk)
      return cursorX / walkSpeedThreshold;
    } else if (cursorX <= maxSpeedThreshold) {
      // 150px to 300px: 1 → 2.3 (walk to max run)
      const progress = (cursorX - walkSpeedThreshold) / (maxSpeedThreshold - walkSpeedThreshold);
      return 1 + progress * (maxSpeed - 1);
    } else {
      // Beyond 300px: stay at max speed (2.3)
      return maxSpeed;
    }
  }
}
