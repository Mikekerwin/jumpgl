/**
 * Enemy Movement System for JumpGL
 * Handles floating/hover mode with oscillation and squash/stretch
 */

export interface EnemyMovementState {
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface EnemyMovementOptions {
  initialY: number;
  floatAmplitude?: number;
  floatFrequency?: number;
}

export class EnemyMovement {
  private y: number;
  private targetY: number;
  private startY: number;
  private velocity = 0;
  private scaleX = 1;
  private scaleY = 1;

  // Transition state (from physics to hover)
  private transitionVelocity = 0;
  private readonly transitionDamping = 0.92;

  // Floating oscillation
  private floatPhase = 0;
  private readonly floatAmplitude: number;
  private readonly floatFrequency: number;

  // Settle bounce (after reaching target)
  private settlePhase = 0;
  private settleAmplitude = 0;
  private isSettling = false;

  // Movement config
  private readonly moveSpeed = 0.015;

  constructor(opts: EnemyMovementOptions) {
    this.y = opts.initialY;
    this.targetY = opts.initialY;
    this.startY = opts.initialY;
    this.floatAmplitude = opts.floatAmplitude ?? 3;
    this.floatFrequency = opts.floatFrequency ?? 0.04;
  }

  /**
   * Start hover mode with initial velocity from physics transition
   */
  startTransition(initialVelocity: number, currentY: number): void {
    this.transitionVelocity = initialVelocity;
    this.y = currentY;
    this.targetY = currentY;
    this.startY = currentY;
  }

  /**
   * Set target position for enemy to move to
   */
  setTarget(targetY: number): void {
    this.startY = this.y;
    this.targetY = targetY;
    this.isSettling = false;
  }

  /**
   * Get current Y position
   */
  getY(): number {
    return this.y;
  }

  /**
   * Update for one frame
   */
  update(deltaSeconds: number): EnemyMovementState {
    const previousY = this.y;

    // Apply transition velocity (decelerating from physics mode)
    if (Math.abs(this.transitionVelocity) > 0.1) {
      this.y += this.transitionVelocity * deltaSeconds;
      this.transitionVelocity *= this.transitionDamping;

      if (Math.abs(this.transitionVelocity) < 0.1) {
        this.transitionVelocity = 0;
        this.targetY = this.y;
        this.startY = this.y;
      }
    } else {
      // Normal hover movement with ease-in
      const distanceToTarget = Math.abs(this.targetY - this.y);
      const totalDistance = Math.abs(this.targetY - this.startY);
      const distanceTraveled = Math.abs(this.y - this.startY);
      const progress = totalDistance > 0 ? distanceTraveled / totalDistance : 1;
      const easeInSpeed = this.moveSpeed + progress * this.moveSpeed * 4;

      this.y += (this.targetY - this.y) * easeInSpeed;

      // Trigger settle bounce when reaching target
      if (distanceToTarget < 0.5) {
        this.y = this.targetY;
        if (!this.isSettling) {
          this.isSettling = true;
          this.settlePhase = 0;
          // Reduced settle amplitude to prevent huge size oscillations
          this.settleAmplitude = this.floatAmplitude * 0.5; // Changed from 1.5 to 0.5
        }
      }
    }

    // Apply floating oscillation
    this.applyFloating();

    // Calculate velocity as pixels per frame (NOT per second like original)
    // This matches the original Jump game
    this.velocity = this.y - previousY;

    this.updateScale();

    return {
      y: this.y,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  /**
   * Apply continuous floating + settle bounce
   */
  private applyFloating(): void {
    // Continuous bobbing
    this.floatPhase += this.floatFrequency;
    if (this.floatPhase > Math.PI * 2) {
      this.floatPhase -= Math.PI * 2;
    }
    const floatOffset = Math.sin(this.floatPhase) * this.floatAmplitude;

    // Settle bounce (dampened oscillation after reaching target)
    let settleOffset = 0;
    if (this.isSettling && this.settleAmplitude > 0.1) {
      this.settlePhase += this.floatFrequency * 2;
      settleOffset = Math.sin(this.settlePhase) * this.settleAmplitude;
      this.settleAmplitude *= 0.85; // Faster damping (was 0.95)

      const oscillationsCompleted = this.settlePhase / (Math.PI * 2);
      if (oscillationsCompleted >= 1) { // Stop after 1 oscillation instead of 2
        this.isSettling = false;
        this.settleAmplitude = 0;
        this.settlePhase = 0;
      }
    }

    this.y += floatOffset + settleOffset;
  }

  /**
   * Apply squash/stretch based on velocity
   * Matches original Jump game logic exactly
   */
  private updateScale(): void {
    let targetX = 1;
    let targetY = 1;
    const onFloor = Math.abs(this.y - this.targetY) < 1;

    // Apply squash/stretch based on velocity
    if (Math.abs(this.velocity) > 0.1) {
      if (this.velocity < 0) {
        // Moving up
        targetY = 1 - Math.abs(this.velocity) / 15;
        targetX = 1 + Math.abs(this.velocity) / 15;
      } else {
        // Moving down
        targetY = 1 + Math.abs(this.velocity) / 15;
        targetX = 1 - Math.abs(this.velocity) / 15;
      }
    }

    // Squash when at target with low velocity
    if (onFloor && Math.abs(this.velocity) < 0.5) {
      targetY = 0.7;
      targetX = 1.3;
    }

    // Return to normal when completely settled
    if (onFloor && Math.abs(this.velocity) < 0.01) {
      targetX = 1;
      targetY = 1;
    }

    const lerp = 0.15;
    this.scaleX += (targetX - this.scaleX) * lerp;
    this.scaleY += (targetY - this.scaleY) * lerp;
  }
}
