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

  // Hold boost state
  private isHolding = false;
  private holdStartTime = 0;
  private readonly holdBoost: number;
  private readonly maxHoldTime = 2200; // ms

  constructor(opts: PlayerPhysicsOptions) {
    this.radius = opts.radius;
    this.gravity = opts.gravity ?? 4500; // Increased from 2500 (20% faster)
    this.jumpForce = opts.jumpForce ?? 2100; // Increased from 1500 (20% faster)
    this.holdBoost = 0.16 * (this.gravity / 3000); // Scale with gravity
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
        const jumpPower = this.jumpCount === 0 ? this.jumpForce : this.jumpForce * 0.52;
        this.velocity = -jumpPower;
        this.jumpCount++;
      }
    }

    // Apply gravity
    this.velocity += this.gravity * deltaSeconds;

    // Apply hold boost (counteracts gravity to extend jump)
    if (this.isHolding) {
      const heldTime = performance.now() - this.holdStartTime;
      if (heldTime < this.maxHoldTime) {
        this.velocity -= this.holdBoost * (deltaSeconds * 1000); // Convert to per-ms
      } else {
        this.isHolding = false;
      }
    }

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
      this.isHolding = true;
      this.holdStartTime = performance.now();
    }
  }

  /**
   * Stop holding jump (called on pointer/key up)
   */
  endJump(): void {
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
