import { Assets, Sprite, Texture, Graphics } from 'pixi.js';

/**
 * Simple butterfly wing-flap animation.
 * Uses frames 1→7 for wings closing, then 7→1 for opening = 1 flap.
 * Pattern: 3 flaps, 1 flap, glide on frame 4, repeat with slight timing variance.
 */

export type ButterflyOptions = {
  x: number;
  y: number;
  scale?: number;
  tint?: number;
  baseSpeed?: number;
  amplitude?: number;
  frequency?: number;
  spawnDelay?: number;
  initialPhaseOffset?: number; // Phase offset for sine wave only (doesn't affect horizontal position)
  specialTakeoff?: boolean; // If true, does 3 stationary flaps before flying
  useOrangeFrames?: boolean; // If true, uses orange butterfly frames instead of blue
};

interface TrailPoint {
  x: number;
  y: number;
  age: number; // Time since this point was created
}

class Butterfly {
  public sprite: Sprite;
  public trailGraphics: Graphics;
  private frames: Texture[];
  private currentFrame = 0;
  private time = 0;
  private readonly frameDuration: number;
  private baseFrameDuration: number;
  private frameDurationCurrent: number;
  private flapsDone = 0;
  private phase: 'down' | 'up' | 'glide' = 'glide';
  private glideTime = 0;
  private readonly glideDuration: number;

  // Special takeoff mode (3 flaps in place before flying)
  private specialTakeoff: boolean = false;
  private takeoffFlaps = 0;
  private readonly TAKEOFF_FLAP_COUNT = 3;
  private inTakeoff = false;
  private takeoffFlapsDone = false;
  private takeoffHoldTimer = 0;
  private readonly TAKEOFF_HOLD_DURATION = 1.8; // Seconds to hold on fence after flaps before flying

  // Motion
  private baseX: number;
  private baseY: number;
  private t: number = 0;
  private phaseOffset: number = 0; // Separate phase offset for sine wave
  private speed: number;
  private amplitude: number;
  private omega: number;
  private lastY: number;
  private spawnDelay: number;
  private alive: boolean;
  private movingUp = false;

  // Trailing effect
  private trailPoints: TrailPoint[] = [];
  private readonly TRAIL_LIFETIME = 2; // 1.5x longer trail (1.8 seconds)
  private readonly TRAIL_POINT_INTERVAL = 0.015; // Add new point every 15ms for smoother trail
  private trailTimer = 0;
  private readonly TRAIL_START_DISTANCE = 18; // Pixels of gap behind butterfly before trail starts (increased from 5)

  constructor(frames: Texture[], opts: ButterflyOptions) {
    this.frames = frames;
    this.specialTakeoff = opts.specialTakeoff ?? false;

    // Start with wings closed if special takeoff, otherwise glide pose
    const initialFrame = this.specialTakeoff ? 0 : 3;
    this.sprite = new Sprite(frames[initialFrame]);
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(opts.x, opts.y);
    this.baseX = opts.x;
    this.baseY = opts.y;
    this.lastY = opts.y;
    this.spawnDelay = opts.spawnDelay ?? 0;
    this.alive = this.spawnDelay <= 0;
    if (opts.scale !== undefined) this.sprite.scale.set(opts.scale);
    if (opts.tint !== undefined) this.sprite.tint = opts.tint;
    // Tilt slightly clockwise
    this.sprite.rotation = Math.PI / 12;

    // Initialize special takeoff if enabled and butterfly is already alive
    if (this.specialTakeoff && this.alive) {
      this.inTakeoff = true;
      this.phase = 'down'; // Start flapping
      this.currentFrame = 0;
      this.takeoffFlaps = 0;
      this.takeoffFlapsDone = false;
      this.takeoffHoldTimer = 0;
    }

    // Slight randomness so multiples don't sync perfectly
    this.frameDuration = 0.045 + Math.random() * 0.02;
    this.baseFrameDuration = this.frameDuration;
    this.frameDurationCurrent = this.frameDuration;
    this.glideDuration = 0.7 + Math.random() * 0.25;

    // Motion params
    this.speed = opts.baseSpeed ?? (50 + Math.random() * 30); // px/s
    this.amplitude = opts.amplitude ?? (40 + Math.random() * 25);
    this.omega = opts.frequency ?? (0.8 + Math.random() * 0.4); // rad/s multiplier

    // Initialize phase offset (affects only sine wave, not horizontal position)
    this.phaseOffset = opts.initialPhaseOffset ?? 0;

    // Initialize trail graphics
    this.trailGraphics = new Graphics();
  }

  update(dt: number): void {
    if (!this.alive) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.alive = true;
        // Start takeoff sequence if special takeoff enabled
        if (this.specialTakeoff) {
          this.inTakeoff = true;
          this.phase = 'down'; // Start flapping
          this.currentFrame = 0;
          this.takeoffFlaps = 0;
          this.takeoffFlapsDone = false;
          this.takeoffHoldTimer = 0;
        }
      } else {
        return;
      }
    }

    // Special takeoff: 3 flaps in place before flying
    if (this.inTakeoff) {
      // Stay at spawn position during takeoff (don't move, just animate)
      this.sprite.position.set(this.baseX, this.baseY);

      if (this.takeoffFlapsDone) {
        // Hold for a brief moment before flying off
        this.takeoffHoldTimer += dt;
        this.sprite.texture = this.frames[3]; // relaxed glide pose while holding
        if (this.takeoffHoldTimer >= this.TAKEOFF_HOLD_DURATION) {
          this.inTakeoff = false;
          this.phase = 'down';
          this.currentFrame = 0;
          this.time = 0;
          // Fence position (baseY) is the CENTER of the sine wave - no adjustment needed
          console.log('[BUTTERFLY] Takeoff complete, starting flight from fence position (center of wave)');
        }
      } else {
        // Handle takeoff flapping animation (just animate, don't move)
        this.handleTakeoffFlapping(dt);
      }

      // Update trail even during takeoff
      this.trailTimer += dt;
      if (this.trailTimer >= this.TRAIL_POINT_INTERVAL) {
        this.trailTimer = 0;
        this.trailPoints.push({ x: this.baseX, y: this.baseY, age: 0 });
      }

      // Age trail points
      this.trailPoints = this.trailPoints.filter(point => {
        point.age += dt;
        return point.age < this.TRAIL_LIFETIME;
      });

      this.drawTrail();
      this.lastY = this.baseY;
      return; // Don't move until takeoff complete
    }

    // Normal flight: Move along a gentle sine path left→right
    this.t += dt;
    const x = this.baseX + this.speed * this.t;
    const y = this.baseY + Math.sin((this.t + this.phaseOffset) * this.omega) * this.amplitude;
    this.sprite.position.set(x, y);

    // Update trail points
    this.trailTimer += dt;
    if (this.trailTimer >= this.TRAIL_POINT_INTERVAL) {
      this.trailTimer = 0;
      this.trailPoints.push({ x, y, age: 0 });
    }

    // Age all trail points and remove old ones
    this.trailPoints = this.trailPoints.filter(point => {
      point.age += dt;
      return point.age < this.TRAIL_LIFETIME;
    });

    // Redraw trail
    this.drawTrail();

    // Adjust flap speed based on vertical direction: faster when moving up, slower when moving down
    const movingUp = y < this.lastY;
    this.movingUp = movingUp;
    // Faster when moving up, slower when moving down
    this.frameDurationCurrent = this.baseFrameDuration * (movingUp ? 0.7 : 1.25);
    this.lastY = y;

    if (this.phase === 'glide') {
      this.glideTime += dt;
      if (this.glideTime >= this.glideDuration) {
        this.glideTime = 0;
        this.phase = 'down';
        this.currentFrame = 0;
      }
      return;
    }

    this.time += dt;
    if (this.time < this.frameDurationCurrent) return;
    this.time = 0;

    if (this.phase === 'down') {
      this.currentFrame++;
      if (this.currentFrame >= this.frames.length) {
        this.currentFrame = this.frames.length - 2;
        this.phase = 'up';
      }
    } else {
      this.currentFrame--;
      if (this.currentFrame < 0) {
        this.flapsDone++;
        this.currentFrame = 0;
        this.phase = 'down';
        const targetFlaps = this.flapsDone >= 3 ? 4 : 3; // 3 then 1 (total 4) then glide
        if (this.flapsDone >= targetFlaps) {
          // Only glide when moving downward; if moving up, keep flapping
          if (this.movingUp) {
            this.flapsDone = 0;
            this.phase = 'down';
            this.currentFrame = 0;
          } else {
            this.flapsDone = 0;
            this.phase = 'glide';
            this.currentFrame = 3;
            this.sprite.texture = this.frames[3];
            return;
          }
        }
      }
    }

    this.sprite.texture = this.frames[this.currentFrame];
  }

  /**
   * Handle takeoff flapping animation (3 flaps in place before flying)
   */
  private handleTakeoffFlapping(dt: number): void {
    this.time += dt;
    if (this.time < this.frameDurationCurrent) return;
    this.time = 0;

    if (this.phase === 'down') {
      this.currentFrame++;
      if (this.currentFrame >= this.frames.length) {
        this.currentFrame = this.frames.length - 2;
        this.phase = 'up';
      }
    } else if (this.phase === 'up') {
      this.currentFrame--;
      if (this.currentFrame < 0) {
        // Completed one flap
        this.takeoffFlaps++;
        this.currentFrame = 0;

        if (this.takeoffFlaps >= this.TAKEOFF_FLAP_COUNT) {
          // Takeoff flaps done - enter brief hold before flight
          this.takeoffFlapsDone = true;
          this.time = 0;
          this.sprite.texture = this.frames[3]; // settle on glide pose
          return;
        } else {
          // Continue takeoff flapping
          this.phase = 'down';
        }
      }
    }

    this.sprite.texture = this.frames[this.currentFrame];
  }

  private drawTrail(): void {
    this.trailGraphics.clear();

    if (this.trailPoints.length < 2) return;

    // Draw trail as animated dashed line that flows from butterfly outward
    // Longer dashes for anime-style motion lines
    const dashPattern = 20; // Length of each dash segment (in points) - increased from 8
    const gapPattern = 15; // Length of gap between dashes (in points) - increased from 5
    const animationSpeed = 40; // Speed of dash animation (points per second) - increased for faster outward flow

    // Animation flows from newest (index 0, near butterfly) to oldest (high index, far away)
    // Add animationOffset to push dashes outward (away from butterfly)
    const animationOffset = performance.now() * 0.001 * animationSpeed;

    // Get current butterfly position for distance calculation
    const butterflyX = this.sprite.position.x;
    const butterflyY = this.sprite.position.y;

    for (let i = 0; i < this.trailPoints.length - 1; i++) {
      const point = this.trailPoints[i];
      const nextPoint = this.trailPoints[i + 1];

      // Skip points that are too close to butterfly (distance-based, more robust)
      const dx = butterflyX - point.x;
      const dy = butterflyY - point.y;
      const distanceSquared = dx * dx + dy * dy;
      const minDistanceSquared = this.TRAIL_START_DISTANCE * this.TRAIL_START_DISTANCE;

      if (distanceSquared < minDistanceSquared) {
        continue; // Skip this segment, too close to butterfly
      }

      // Calculate fade based on age (older = more faded)
      const fadeProgress = point.age / this.TRAIL_LIFETIME;
      const baseAlpha = Math.max(0, 1 - fadeProgress);

      // Apply overall opacity reduction to 40%
      const alpha = baseAlpha * 0.37;

      // Line width decreases with age for tapering effect
      const lineWidth = Math.max(0.5, 2.5 * baseAlpha);

      // Animated dash pattern - dashes move away from butterfly
      // Add animationOffset so dashes flow outward (from low index to high index)
      const positionInPattern = (i + animationOffset) % (dashPattern + gapPattern);
      const isDash = positionInPattern < dashPattern;

      if (isDash && alpha > 0.05) {
        // Draw this segment
        this.trailGraphics.moveTo(point.x, point.y);
        this.trailGraphics.lineTo(nextPoint.x, nextPoint.y);
        this.trailGraphics.stroke({ width: lineWidth, color: 0xffffff, alpha });
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.trailGraphics.destroy();
  }
}

export class ButterflyManager {
  private blueFrames: Texture[] = [];
  private orangeFrames: Texture[] = [];
  private butterflies: Butterfly[] = [];
  private loaded = false;

  async loadFrames(): Promise<void> {
    if (this.loaded) return;
    try {
      // Load blue butterfly frames
      const blueLoads: Promise<Texture>[] = [];
      for (let i = 1; i <= 7; i++) {
        blueLoads.push(Assets.load<Texture>(`blueButterfly/butterfly${i}.png`));
      }
      this.blueFrames = await Promise.all(blueLoads);

      // Load orange butterfly frames
      const orangeLoads: Promise<Texture>[] = [];
      for (let i = 21; i <= 27; i++) {
        orangeLoads.push(Assets.load<Texture>(`orangeButterfly/butterfly${i}.png`));
      }
      this.orangeFrames = await Promise.all(orangeLoads);

      this.loaded = true;
      console.log('[BUTTERFLY] Loaded blue and orange frames');
    } catch (err) {
      console.error('[BUTTERFLY] Failed to load frames', err);
      this.loaded = false;
    }
  }

  spawn(opts: ButterflyOptions): void {
    if (!this.loaded || (this.blueFrames.length === 0 && this.orangeFrames.length === 0)) return;
    const frames = opts.useOrangeFrames ? this.orangeFrames : this.blueFrames;
    this.butterflies.push(new Butterfly(frames, opts));
  }

  clear(): void {
    this.butterflies.forEach(b => b.destroy());
    this.butterflies = [];
  }

  update(dt: number): void {
    this.butterflies.forEach(b => b.update(dt));
  }

  getSprites(): Sprite[] {
    return this.butterflies.map(b => b.sprite);
  }

  getTrailGraphics(): Graphics[] {
    return this.butterflies.map(b => b.trailGraphics);
  }
}
