/**
 * Enemy Physics System for JumpGL
 * Handles gravity-based bouncing with squash/stretch animations
 * Can transition smoothly between physics mode and hover mode
 */

export interface EnemyPhysicsState {
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface EnemyPhysicsOptions {
  groundSurface: number;
  gravity?: number;
  jumpForce?: number;
  energyLoss?: number;
}

export class EnemyPhysics {
  private groundSurface: number;
  private restCenterY: number;
  private y: number;
  private velocity = 0;
  private readonly gravity: number;
  private readonly jumpForce: number;
  private readonly bounceDamping: number;
  private readonly minBounceVelocity = 140;
  private scaleX = 1;
  private scaleY = 1;
  private isPhysicsEnabled = true;

  // Jump sequence state
  private jumpSequenceActive = false;
  private jumpSequenceStep = 0;
  private waitingForGround = false;
  private groundWaitTimer = 0;

  // Hold boost state (for jump sequences)
  private isHolding = false;
  private holdStartTime = 0;
  private readonly holdBoost: number;
  private readonly maxHoldTime = 2200; // ms

  constructor(opts: EnemyPhysicsOptions) {
    this.gravity = opts.gravity ?? 3000;
    this.jumpForce = opts.jumpForce ?? 1800;
    this.bounceDamping = opts.energyLoss ?? 0.45;
    this.holdBoost = 0.16 * (this.gravity / 3000); // Scale with gravity
    this.groundSurface = opts.groundSurface;
    this.restCenterY = this.groundSurface;
    this.y = this.restCenterY;
  }

  /**
   * Start the 3-jump intro sequence
   */
  startJumpSequence(): void {
    this.jumpSequenceActive = true;
    this.jumpSequenceStep = 0;
    this.waitingForGround = true;
    this.groundWaitTimer = 0;
  }

  /**
   * Check if ready to transition to hover (after 3rd jump peak)
   */
  isReadyForHover(): boolean {
    return this.jumpSequenceStep === 4 && this.velocity > 0;
  }

  /**
   * Enable hover mode - returns current velocity for smooth transition
   */
  enableHoverMode(): number {
    this.isPhysicsEnabled = false;
    return this.velocity;
  }

  /**
   * Enable physics mode with optional initial state
   */
  enablePhysicsMode(currentY?: number, initialVelocity: number = 0): void {
    this.isPhysicsEnabled = true;
    if (currentY !== undefined) {
      this.y = currentY;
    }
    this.velocity = initialVelocity;
  }

  /**
   * Check if in hover mode
   */
  isHoverMode(): boolean {
    return !this.isPhysicsEnabled;
  }

  /**
   * Get current velocity (for transitions)
   */
  getVelocity(): number {
    return this.velocity;
  }

  /**
   * Update physics for one frame
   */
  update(deltaSeconds: number): EnemyPhysicsState {
    if (!this.isPhysicsEnabled) {
      return {
        y: this.y,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
      };
    }

    // Apply hold boost if holding
    if (this.isHolding) {
      const heldTime = performance.now() - this.holdStartTime;
      if (heldTime < this.maxHoldTime) {
        this.velocity -= this.holdBoost * deltaSeconds;
      } else {
        this.isHolding = false;
      }
    }

    // Apply gravity
    this.velocity += this.gravity * deltaSeconds;
    this.y += this.velocity * deltaSeconds;

    // Floor collision
    if (this.y > this.restCenterY) {
      this.y = this.restCenterY;
      if (this.velocity > 0) {
        this.velocity = -this.velocity * this.bounceDamping;
        if (Math.abs(this.velocity) < this.minBounceVelocity) {
          this.velocity = 0;
        }
      }

      // Mark on ground for jump sequence
      if (this.jumpSequenceActive && !this.waitingForGround && this.jumpSequenceStep < 3) {
        this.waitingForGround = true;
        this.groundWaitTimer = 0;
      }
    }

    // Handle jump sequence timing
    if (this.jumpSequenceActive) {
      const isOnGround = Math.abs(this.y - this.restCenterY) < 0.5 && Math.abs(this.velocity) < 1;

      if (isOnGround && this.waitingForGround) {
        this.groundWaitTimer += deltaSeconds * 1000; // Convert to ms

        // Wait 300ms on ground between jumps
        if (this.groundWaitTimer >= 300) {
          this.executeNextJump();
          this.waitingForGround = false;
          this.groundWaitTimer = 0;
        }
      }

      // Check if 3rd jump has reached peak and is descending
      if (this.jumpSequenceStep === 3 && this.velocity > 0) {
        this.jumpSequenceStep = 4; // Mark as ready for hover transition
      }
    }

    this.applySquashStretch();

    return {
      y: this.y,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  /**
   * Execute next jump in sequence (1: small, 2: medium, 3: large)
   */
  private executeNextJump(): void {
    this.jumpSequenceStep++;

    const jumpHoldTimes = [0, 400, 1275]; // ms to hold for small, medium, large jumps
    const holdDuration = jumpHoldTimes[this.jumpSequenceStep - 1];

    // Start jump with simulated hold
    this.velocity = -this.jumpForce;
    this.isHolding = true;
    this.holdStartTime = performance.now() - (this.maxHoldTime - holdDuration);
  }

  /**
   * Apply squash/stretch based on velocity
   */
  private applySquashStretch(): void {
    let targetX = 1;
    let targetY = 1;

    const isGrounded = Math.abs(this.y - this.restCenterY) < 0.5 && Math.abs(this.velocity) < 1;

    if (Math.abs(this.velocity) > 10) {
      if (this.velocity < 0) {
        // Moving up - stretch vertically
        targetY = 1 - Math.abs(this.velocity) / 5000;
        targetX = 1 + Math.abs(this.velocity) / 5000;
      } else {
        // Moving down - stretch horizontally
        targetY = 1 + Math.abs(this.velocity) / 5000;
        targetX = 1 - Math.abs(this.velocity) / 5000;
      }
    }

    if (isGrounded) {
      targetY = 0.7;
      targetX = 1.3;
    }

    const lerp = 0.18;
    this.scaleX += (targetX - this.scaleX) * lerp;
    this.scaleY += (targetY - this.scaleY) * lerp;
  }

  /**
   * Set ground surface (for resize)
   */
  setGroundSurface(surface: number): void {
    this.groundSurface = surface;
    this.restCenterY = this.groundSurface;
    if (this.y > this.restCenterY) {
      this.y = this.restCenterY;
    }
  }
}
