/**
 * WindSprites - Anime-style wind effect lines that swoosh and tumble across the sky
 * Similar to JumpDustParticles but renders rotating lines instead of circles
 */

interface WindSprite {
  x: number;
  y: number;
  vx: number; // Horizontal velocity (left to right)
  vy: number; // Vertical drift
  rotation: number; // Current rotation angle
  angularVelocity: number; // Rotation speed
  length: number; // Line length
  life: number; // Current lifetime
  maxLife: number; // Max lifetime before removal
  isPaired: boolean; // Part of a pair (gust effect)
  amplitude: number; // Offset amplitude for snaking path
  wavelength: number; // Wavelength for snaking path
  phase: number; // Current phase for path offset
  phaseSpeed: number; // Speed to advance phase
  fadeIn: number; // fraction of lifetime to fade in
  doLoop: boolean; // Should do a loop mid-path
  loopPhase: number; // 0-1
  loopDuration: number; // seconds
}

export class WindSpriteSystem {
  private sprites: WindSprite[] = [];
  private maxSprites = 18; // Maximum active sprites (sparser)
  private largeSingleCount = 0;
  private lastSpawnY: number | null = null;
  private longCooldown = 0;

  constructor(maxSprites = 25) {
    this.maxSprites = maxSprites;
  }

  /**
   * Spawn a large single wind sprite (long gust). Every 5th large gets a loop.
   */
  public spawnLargeSingle(x: number, y: number): void {
    if (this.sprites.length >= this.maxSprites) return;
    this.largeSingleCount++;
    const loopThis = false; // disable loop effect on long gusts

    const sprite: WindSprite = {
      x,
      y,
      vx: 80 + Math.random() * 60, // 80-140 px/s
      vy: -10 + Math.random() * 20,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 2,
      length: 130 + Math.random() * 70, // Slightly shorter longs (~130-200px)
      life: 0,
      maxLife: 8 + Math.random() * 3, // 8-11s
      isPaired: false,
      amplitude: 2 + Math.random() * 8.5, // deeper sway
      wavelength: 240 + Math.random() * 140, // tighter to show motion
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 2.6 + Math.random() * 2, // faster snaking to show motion
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: loopThis,
      loopPhase: 0,
      loopDuration: 2.5 + Math.random() * 0.5,
    };
    this.sprites.push(sprite);
  }

  /**
   * Spawn a single wind sprite
   */
  public spawnSingle(x: number, y: number): void {
    if (this.sprites.length >= this.maxSprites) return;

    const sprite: WindSprite = {
      x,
      y,
      vx: 60 + Math.random() * 40, // slower drift
      vy: -10 + Math.random() * 20,
      rotation: Math.random() * Math.PI * 2, // Random starting angle
      angularVelocity: (Math.random() - 0.5) * 3, // -1.5 to +1.5 rad/s tumbling
      length: 35 + Math.random() * 35, // singles: 35-70px
      life: 0,
      maxLife: 7 + Math.random() * 3, // 7-10 seconds
      isPaired: false,
      amplitude: 2 + Math.random() * 8.5, // 12-22px sway
      wavelength: 140 + Math.random() * 90, // tighter arcs to read speed
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 3.0 + Math.random() * 2, // much faster snaking along the spline
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: false,
      loopPhase: 0,
      loopDuration: 2.0,
    };

    this.sprites.push(sprite);
  }

  /**
   * Spawn a pair of wind sprites (gust effect)
   */
  public spawnPair(x: number, y: number): void {
    if (this.sprites.length >= this.maxSprites - 1) return;

    const baseVx = 60 + Math.random() * 40;
    const baseVy = -10 + Math.random() * 20;
    const baseRotation = Math.random() * Math.PI * 2;
    const baseAngularVelocity = (Math.random() - 0.5) * 3;
    const baseLength = 90 + Math.random() * 40; // primary long
    const baseMaxLife = 7 + Math.random() * 3;
    const baseAmplitude = 7 + Math.random() * 5;
    const baseWavelength = 180 + Math.random() * 100;
    const basePhase = Math.random() * Math.PI * 2;
    const basePhaseSpeed = 3.0 + Math.random() * 1.5;

    // First sprite of pair
    const sprite1: WindSprite = {
      x,
      y: y - 5, // Offset vertically
      vx: baseVx,
      vy: baseVy,
      rotation: baseRotation,
      angularVelocity: baseAngularVelocity,
      length: baseLength,
      life: 0,
      maxLife: baseMaxLife,
      isPaired: true,
      amplitude: baseAmplitude,
      wavelength: baseWavelength,
      phase: basePhase,
      phaseSpeed: basePhaseSpeed,
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: false,
      loopPhase: 0,
      loopDuration: 2.0,
    };

    // Second sprite of pair (slightly offset)
    const sprite2: WindSprite = {
      x: x + 5,
      y: y + 5,
      vx: baseVx + (Math.random() - 0.5) * 10, // Slight variation
      vy: baseVy + (Math.random() - 0.5) * 10,
      rotation: baseRotation + 0.3, // Slight angle difference
      angularVelocity: baseAngularVelocity * 1.1,
      length: Math.max(40, baseLength * 0.5 + Math.random() * 15), // ensure smaller companion
      life: 0,
      maxLife: baseMaxLife,
      isPaired: true,
      amplitude: baseAmplitude * 0.5,
      wavelength: baseWavelength * 0.9,
      phase: basePhase + 0.5,
      phaseSpeed: basePhaseSpeed * 1.05,
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: false,
      loopPhase: 0,
      loopDuration: 2.0,
    };

    this.sprites.push(sprite1, sprite2);
  }

  /**
   * Spawn a long-medium pair (one long, one medium)
   */
  public spawnLongMedPair(x: number, y: number): void {
    if (this.sprites.length >= this.maxSprites - 1) return;

    const baseVx = 70 + Math.random() * 50;
    const baseVy = -10 + Math.random() * 20;
    const baseRotation = Math.random() * Math.PI * 2;
    const baseAngularVelocity = (Math.random() - 0.5) * 2.5;
    const baseMaxLife = 7 + Math.random() * 3;
    const baseAmplitude = 5 + Math.random() * 7;
    const baseWavelength = 200 + Math.random() * 120;
    const basePhase = Math.random() * Math.PI * 2;
    const basePhaseSpeed = 2.8 + Math.random() * 1.8;

    // Long sprite
    const longSprite: WindSprite = {
      x,
      y: y - 8, // Offset vertically
      vx: baseVx,
      vy: baseVy,
      rotation: baseRotation,
      angularVelocity: baseAngularVelocity,
      length: 150 + Math.random() * 60, // 150-210px long
      life: 0,
      maxLife: baseMaxLife,
      isPaired: true,
      amplitude: baseAmplitude,
      wavelength: baseWavelength,
      phase: basePhase,
      phaseSpeed: basePhaseSpeed,
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: false,
      loopPhase: 0,
      loopDuration: 2.0,
    };

    // Medium sprite
    const medSprite: WindSprite = {
      x: x + 8,
      y: y + 8,
      vx: baseVx + (Math.random() - 0.5) * 15, // Slight variation
      vy: baseVy + (Math.random() - 0.5) * 10,
      rotation: baseRotation + 0.4, // Slight angle difference
      angularVelocity: baseAngularVelocity * 1.15,
      length: 80 + Math.random() * 30, // 80-110px medium
      life: 0,
      maxLife: baseMaxLife,
      isPaired: true,
      amplitude: baseAmplitude * 0.8,
      wavelength: baseWavelength * 0.85,
      phase: basePhase + 0.6,
      phaseSpeed: basePhaseSpeed * 1.1,
      fadeIn: 0.05 + Math.random() * 0.07,
      doLoop: false,
      loopPhase: 0,
      loopDuration: 2.0,
    };

    this.sprites.push(longSprite, medSprite);
  }

  /**
   * Spawn a random wind effect (single, pair, long-med pair, or long)
   */
  public spawnRandom(screenWidth: number, _screenHeight: number, groundY: number): 'single' | 'pair' | 'long' | 'longmed' | null {
    // Random spawn position across screen width (slightly off-screen both sides)
    const x = (Math.random() * 1.2 - 0.1) * screenWidth; // -10% to 110% of width

    // Random Y position across sky, keep a buffer above the ground (at least 150px)
    const minY = 0;
    const maxY = Math.max(minY + 10, groundY - 150);
    let y = minY + Math.random() * (maxY - minY);
    // Avoid stacking on the same Y to keep the sky varied
    if (this.lastSpawnY !== null && Math.abs(y - this.lastSpawnY) < 40) {
      for (let i = 0; i < 3 && Math.abs(y - this.lastSpawnY) < 40; i++) {
        y = minY + Math.random() * (maxY - minY);
      }
      if (Math.abs(y - this.lastSpawnY) < 40) {
        y = Math.max(minY, Math.min(maxY, y + (Math.random() > 0.5 ? 60 : -60)));
      }
    }
    this.lastSpawnY = y;

    // Make long gusts rarer with a simple cooldown
    // Bias toward pairs/longs near the top of the screen (y closer to 0)
    const yRatio = y / maxY; // 0 = top, 1 = near ground
    const topBias = 1 - yRatio; // 1 = top, 0 = near ground

    const allowLong = this.longCooldown <= 0;
    const r = Math.random();
    let spawned: 'single' | 'pair' | 'long' | 'longmed' | null = null;

    // Near top (topBias > 0.7): 30% long, 25% longmed, 25% pair, 20% single
    // Near ground (topBias < 0.3): 10% long, 10% longmed, 20% pair, 60% single
    const longThreshold = 0.75 - (topBias * 0.25); // 0.5-0.75
    const longMedThreshold = longThreshold - (0.15 + topBias * 0.1); // varies by height
    const pairThreshold = longMedThreshold - (0.2 + topBias * 0.05); // varies by height

    if (allowLong && r > longThreshold) {
      this.spawnLargeSingle(x, y); // occasional long gust
      this.longCooldown = 2 + Math.random() * 1.5; // 2-3.5s before another long
      spawned = 'long';
    } else if (r > longMedThreshold) {
      this.spawnLongMedPair(x, y); // long-medium pairs
      spawned = 'longmed';
    } else if (r > pairThreshold) {
      this.spawnPair(x, y); // regular pairs
      spawned = 'pair';
    } else {
      this.spawnSingle(x, y); // mostly singles
      spawned = 'single';
    }
    return spawned;
  }

  /**
   * Update all sprites
   */
  public update(deltaSeconds: number): void {
    if (this.longCooldown > 0) {
      this.longCooldown = Math.max(0, this.longCooldown - deltaSeconds);
    }
    // Update sprites backwards for safe removal
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sprite = this.sprites[i];

      // Increment lifetime
      sprite.life += deltaSeconds;

      // Remove dead sprites
      if (sprite.life >= sprite.maxLife) {
        this.sprites.splice(i, 1);
        continue;
      }

      // Update position
      sprite.x += sprite.vx * deltaSeconds;
      sprite.y += sprite.vy * deltaSeconds;

      // Update rotation (tumbling effect)
      sprite.rotation += sprite.angularVelocity * deltaSeconds;
      sprite.phase += sprite.phaseSpeed * deltaSeconds;
      if (sprite.doLoop) {
        sprite.loopPhase = Math.min(1, sprite.loopPhase + deltaSeconds / sprite.loopDuration);
      }
    }
  }

  /**
   * Render all sprites to canvas
   */
  public render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    this.sprites.forEach((sprite) => {
      // Skip if off-screen
      if (sprite.x > canvasWidth + 50 || sprite.y < -50 || sprite.y > canvasHeight + 50) {
        return;
      }

      // Calculate fade based on lifetime (fade in/out)
      const lifeRatio = sprite.life / sprite.maxLife;
      const fadeIn = sprite.fadeIn || 0.1;
      const fadeOut = 0.15;
      const baseAlpha = 0.7;
      let alpha = baseAlpha;
      if (lifeRatio < fadeIn) {
        alpha *= lifeRatio / fadeIn;
      } else if (lifeRatio > 1 - fadeOut) {
        alpha *= (1 - lifeRatio) / fadeOut;
      }

      // Direction and normal for path
      const dirX = sprite.vx !== 0 || sprite.vy !== 0 ? sprite.vx : 1;
      const dirY = sprite.vy;
      const len = Math.hypot(dirX, dirY) || 1;
      const nx = -(dirY / len);
      const ny = dirX / len;

      // Build a snaking polyline along the motion direction
      const segments = 12;

      ctx.save();
      ctx.translate(sprite.x, sprite.y);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const baseX = (dirX / len) * (t * sprite.length - sprite.length / 2);
        const baseY = (dirY / len) * (t * sprite.length - sprite.length / 2);
        const offset = Math.sin(sprite.phase + (t * sprite.length) / sprite.wavelength * Math.PI * 2) * sprite.amplitude;
        const ox = nx * offset;
        const oy = ny * offset;
        let px = baseX + ox;
        let py = baseY + oy;
        if (sprite.doLoop) {
          const loopProgress = sprite.loopPhase;
          const angle = loopProgress * Math.PI * 2;
          const loopRadius = sprite.length * 0.15;
          const influence = Math.max(0, 1 - Math.pow(Math.abs(t - 0.5) / 0.4, 1.35)); // smoother bell near center
          const tx = dirX / len;
          const ty = dirY / len;
          px += influence * (Math.cos(angle) * nx * loopRadius + Math.sin(angle) * tx * loopRadius);
          py += influence * (Math.cos(angle) * ny * loopRadius + Math.sin(angle) * ty * loopRadius);
        }
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  /**
   * Get current sprite count
   */
  public getCount(): number {
    return this.sprites.length;
  }

  /**
   * Clear all sprites
   */
  public clear(): void {
    this.sprites = [];
  }
}
