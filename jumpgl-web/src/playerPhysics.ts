export type PlayerPhysicsState = {
  y: number;
  scaleX: number;
  scaleY: number;
};

export interface PlayerPhysicsOptions {
  radius: number;
  groundSurface: number;
  gravity?: number;
  jumpForce?: number;
}

export class PlayerPhysics {
  private readonly radius: number;
  private groundSurface: number;
  private restCenterY: number;
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

  constructor(opts: PlayerPhysicsOptions) {
    this.radius = opts.radius;
    this.gravity = opts.gravity ?? 3000; // Increased from 2500 (20% faster)
    this.jumpForce = opts.jumpForce ?? 1800; // Increased from 1500 (20% faster)
    this.groundSurface = opts.groundSurface;
    this.restCenterY = this.groundSurface - this.radius;
    this.y = this.restCenterY;
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
}
