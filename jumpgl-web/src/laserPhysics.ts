import {
  BASE_LASER_SPEED,
  BASE_LASER_RANDOMNESS,
  CHAOS_INCREMENT_INTERVAL,
  CHAOS_MULTIPLIER_PER_INTERVAL,
  LASER_HEIGHT,
  LASER_WIDTH,
  MAX_LASERS,
  SCORE_PER_LASER_UNLOCK,
  WIDE_LASER_UNLOCK_SCORE,
  WIDE_LASER_WIDTH,
} from './config';

export type LaserState = {
  x: number;
  y: number;
  width: number;
  hit: boolean;
  scored: boolean;
  passed: boolean;
  nextY: number;
};

type UpdateParams = {
  score: number;
  playerX: number;
  playerY: number;
  playerRadius: number;
  playerHasJumped: boolean;
  enemyX: number;
  enemyY: number;
  isHovering: boolean;
  introComplete: boolean;
  stopSpawning?: boolean;
};

export class LaserPhysics {
  private lasers: LaserState[] = [];
  private numLasers: number = 1;
  private baseSpeed: number = BASE_LASER_SPEED;
  private currentScore: number = 0;
  private lastWideLaserFireCount: number = 0;
  private lastFireTime: number = 0;
  private nextFireDelayMs: number = 400;
  private burstShotsRemaining: number = 0;
  private lasersSinceLock: number = 0;
  private calmPatternIndex: number = 0;
  private calmPatternDelays: number[] = [650, 700, 260, 260, 700, 280, 260, 700];
  private enemyX: number;
  private centerY: number;
  private minLaserY: number;
  private chaosBoost: number = 1;
  private laserWidth: number = LASER_WIDTH;
  private laserHeight: number = LASER_HEIGHT;
  private isCalmProfile: boolean = true;
  private scrollSpeedPerFrame: number = 0;

  constructor(_screenWidth: number, screenHeight: number, centerY: number, enemyX: number) {
    this.centerY = centerY;
    this.minLaserY = screenHeight * 0.2;
    this.enemyX = enemyX;
    this.lastFireTime = Date.now();
    this.initializeLasers();
    this.scheduleNextFire();
  }

  setChaosBoost(boost: number): void {
    this.chaosBoost = Math.max(0.5, boost);
    if (!this.isCalmProfile) {
      this.scheduleNextFire(true);
    }
  }

  setShotProfile(profile: 'calm' | 'aggressive'): void {
    this.isCalmProfile = profile === 'calm';
    this.calmPatternIndex = 0;
    this.burstShotsRemaining = 0;
    this.lastFireTime = Date.now();
    this.scheduleNextFire(true);
  }

  setBaseSpeed(speed: number): void {
    this.baseSpeed = speed;
  }

  setMaxLasersAllowed(count: number): void {
    this.numLasers = Math.max(1, Math.min(MAX_LASERS, Math.floor(count)));
    while (this.lasers.length < this.numLasers) {
      this.lasers.push(this.createLaser(-1000, this.centerY));
    }
    while (this.lasers.length > this.numLasers) {
      this.lasers.pop();
    }
  }

  private getNextLaserWidth(): number {
    const isWideLaserTime =
      this.currentScore >= WIDE_LASER_UNLOCK_SCORE &&
      this.lasersSinceLock > 0 &&
      this.lasersSinceLock % 15 === 0;

    if (isWideLaserTime && this.lasersSinceLock !== this.lastWideLaserFireCount) {
      this.lastWideLaserFireCount = this.lasersSinceLock;
      return WIDE_LASER_WIDTH;
    }
    return this.laserWidth;
  }

  private scheduleNextFire(forceImmediate: boolean = false): void {
    if (forceImmediate) {
      this.lastFireTime = Date.now();
    }

    if (this.isCalmProfile) {
      const delay = this.calmPatternDelays[this.calmPatternIndex % this.calmPatternDelays.length];
      this.nextFireDelayMs = delay;
      this.calmPatternIndex++;
      this.burstShotsRemaining = 0;
      return;
    }

    if (this.chaosBoost > 1 && this.burstShotsRemaining > 0) {
      this.nextFireDelayMs = 70 + Math.random() * 70;
      this.burstShotsRemaining--;
      return;
    }

    const baseDelay = this.numLasers <= 1 ? 520 : 320;
    const variance = this.chaosBoost > 1 ? 1.15 : 0.4;
    this.nextFireDelayMs = baseDelay * (0.6 + Math.random() * variance);

    if (this.chaosBoost > 1.05 && Math.random() < 0.4) {
      this.burstShotsRemaining = 1 + Math.floor(Math.random() * 3);
    } else {
      this.burstShotsRemaining = 0;
    }
  }

  private generateRandomLaserY(score: number, playerY?: number): number {
    // Occasionally lock to player position for aimed shots once difficulty ramps up
    if (score >= 75 && playerY !== undefined && this.lasersSinceLock >= 5) {
      this.lasersSinceLock = 0;
      return playerY;
    }

    const scoreInCycle = score % SCORE_PER_LASER_UNLOCK;
    const chaosIntervals = Math.floor(scoreInCycle / CHAOS_INCREMENT_INTERVAL);
    const currentChaos = BASE_LASER_RANDOMNESS + chaosIntervals * CHAOS_MULTIPLIER_PER_INTERVAL;
    const fullRange = this.centerY - this.minLaserY;
    const effectiveChaos = currentChaos * this.chaosBoost;
    const rangeFactor = Math.min(1, 0.5 + 0.5 * effectiveChaos);
    const randomRange = Math.max(fullRange * 0.25, fullRange * rangeFactor);
    const jitter = fullRange * 0.35 * (effectiveChaos - 1) * (Math.random() - 0.5);
    let centerPosition = this.minLaserY + fullRange / 2 + jitter;
    centerPosition = Math.max(this.minLaserY, Math.min(centerPosition, this.minLaserY + fullRange));
    let start = centerPosition - randomRange / 2;
    start = Math.max(this.minLaserY, Math.min(start, this.minLaserY + fullRange - randomRange));
    return start + Math.random() * randomRange;
  }

  private getInitialLaserX(): number {
    return this.enemyX;
  }

  private createLaser(x: number, y: number): LaserState {
    return {
      x,
      y,
      width: this.laserWidth,
      hit: false,
      scored: false,
      passed: false,
      nextY: this.generateRandomLaserY(this.currentScore),
    };
  }

  private initializeLasers(): void {
    const firstLaserY = this.centerY;
    const nextLaserY = this.generateRandomLaserY(0);
    this.lasers = [
      {
        x: -this.laserWidth - 100,
        y: firstLaserY,
        hit: false,
        scored: false,
        passed: false,
        nextY: nextLaserY,
        width: this.getNextLaserWidth(),
      },
    ];
  }

  private updateLaserCount(score: number): void {
    this.currentScore = score;
    const laserUnlocks = Math.floor(score / SCORE_PER_LASER_UNLOCK);
    const prevNumLasers = this.numLasers;
    this.numLasers = Math.min(laserUnlocks + 3, MAX_LASERS);

    if (this.numLasers > prevNumLasers) {
      while (this.lasers.length < this.numLasers) {
        const newLaserY = this.generateRandomLaserY(score);
        this.lasers.push({
          x: -1000,
          y: newLaserY,
          hit: false,
          scored: false,
          passed: false,
          nextY: this.generateRandomLaserY(score),
          width: this.getNextLaserWidth(),
        });
      }
    }

    while (this.lasers.length > this.numLasers) {
      this.lasers.pop();
    }
  }

  update(params: UpdateParams): { wasHit: boolean; scoreChange: number; laserFired: boolean; targetY: number | null; hitPosition: { x: number; y: number } | null } {
    const {
      score,
      playerX,
      playerY,
      playerRadius,
      enemyX,
      enemyY,
      isHovering,
      introComplete,
      stopSpawning = false,
    } = params;

    this.enemyX = enemyX;
    this.updateLaserCount(score);
    const now = Date.now();
    let laserFired = false;
    let targetY: number | null = null;

    // Spawn new laser only when enemy is hovering and intro is complete
    if (
      !stopSpawning &&
      introComplete &&
      isHovering &&
      now - this.lastFireTime > this.nextFireDelayMs
    ) {
      const inactiveLaser = this.lasers.find(l => l.x < -this.laserWidth);
      if (inactiveLaser) {
        this.lastFireTime = now;
        this.scheduleNextFire();
        this.lasersSinceLock++;

        inactiveLaser.x = this.getInitialLaserX();
        inactiveLaser.y = enemyY;
        inactiveLaser.hit = false;
        inactiveLaser.scored = false;
        inactiveLaser.passed = false;
        inactiveLaser.width = this.getNextLaserWidth();
        inactiveLaser.nextY = this.generateRandomLaserY(this.currentScore, playerY);
        targetY = inactiveLaser.nextY;
        laserFired = true;
      } else if (now - this.lastFireTime > this.nextFireDelayMs * 2) {
        this.scheduleNextFire();
      }
    }

    const currentSpeed = this.baseSpeed + this.scrollSpeedPerFrame;

    // Debug logging - log every 300 frames (~5 seconds at 60fps)
    if (Math.random() < 0.003) {
      console.log(`[LASER SPEED DEBUG] baseSpeed: ${this.baseSpeed.toFixed(2)}, scrollSpeed: ${this.scrollSpeedPerFrame.toFixed(2)}, total: ${currentSpeed.toFixed(2)} px/frame`);
    }

    let wasHit = false;
    let scoreChange = 0;
    let hitPosition: { x: number; y: number } | null = null;

    this.lasers.forEach((laser) => {
      // Skip inactive lasers (waiting to be recycled) - performance optimization
      if (laser.x < -this.laserWidth) {
        return;
      }

      // Move laser horizontally
      laser.x -= currentSpeed;

      // Mark passed/scored
      if (!laser.hit && !laser.passed && playerX > laser.x + laser.width) {
        laser.passed = true;
        // Only score when player actually jumped the laser
        if (params.playerHasJumped) {
          laser.scored = true;
          scoreChange += 1;
        }
      }

      // Cull inactive lasers
      if (laser.x + laser.width < -this.laserWidth) {
        laser.x = -this.laserWidth - 100;
        return; // Skip collision check for this frame
      }

      // Collision check
      const playerLeft = playerX - playerRadius;
      const playerRight = playerX + playerRadius;
      const playerTop = playerY - playerRadius;
      const playerBottom = playerY + playerRadius;

      if (
        !laser.hit &&
        playerRight > laser.x &&
        playerLeft < laser.x + laser.width &&
        playerBottom > laser.y &&
        playerTop < laser.y + this.laserHeight
      ) {
        laser.hit = true;
        wasHit = true;
        hitPosition = { x: laser.x + laser.width * 0.5, y: laser.y + this.laserHeight * 0.5 };
        laser.x = -this.laserWidth - 100;
      }
    });

    return { wasHit, scoreChange, laserFired, targetY, hitPosition };
  }

  getLasers(): LaserState[] {
    return this.lasers;
  }

  reset(): void {
    this.numLasers = 1;
    this.baseSpeed = BASE_LASER_SPEED;
    this.chaosBoost = 1;
    this.lastWideLaserFireCount = 0;
    this.lasersSinceLock = 0;
    this.nextFireDelayMs = 400;
    this.burstShotsRemaining = 0;
    this.lastFireTime = Date.now();
    this.initializeLasers();
    this.scheduleNextFire();
  }

  updateDimensions(_screenWidth: number, screenHeight: number, centerY: number, enemyX: number): void {
    this.centerY = centerY;
    this.minLaserY = screenHeight * 0.2;
    this.enemyX = enemyX;
  }

  /**
   * Adjust laser movement to track world scroll speed (pixels per second)
   */
  setScrollSpeed(pixelsPerSecond: number): void {
    // Convert to per-frame speed assuming ~60fps
    this.scrollSpeedPerFrame = pixelsPerSecond / 60;
  }
}
