import { Assets, Sprite, Texture } from 'pixi.js';

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
};

class Butterfly {
  public sprite: Sprite;
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

  // Motion
  private baseX: number;
  private baseY: number;
  private t = 0;
  private speed: number;
  private amplitude: number;
  private omega: number;
  private lastY: number;
  private spawnDelay: number;
  private alive: boolean;
  private movingUp = false;

  constructor(frames: Texture[], opts: ButterflyOptions) {
    this.frames = frames;
    this.sprite = new Sprite(frames[3]); // frame 4 as glide
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

    // Slight randomness so multiples don't sync perfectly
    this.frameDuration = 0.045 + Math.random() * 0.02;
    this.baseFrameDuration = this.frameDuration;
    this.frameDurationCurrent = this.frameDuration;
    this.glideDuration = 0.7 + Math.random() * 0.25;

    // Motion params
    this.speed = opts.baseSpeed ?? (50 + Math.random() * 30); // px/s
    this.amplitude = opts.amplitude ?? (40 + Math.random() * 25);
    this.omega = opts.frequency ?? (0.8 + Math.random() * 0.4); // rad/s multiplier
  }

  update(dt: number): void {
    if (!this.alive) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.alive = true;
      } else {
        return;
      }
    }
    // Move along a gentle sine path left→right
    this.t += dt;
    const x = this.baseX + this.speed * this.t;
    const y = this.baseY + Math.sin(this.t * this.omega) * this.amplitude;
    this.sprite.position.set(x, y);

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

  destroy(): void {
    this.sprite.destroy();
  }
}

export class ButterflyManager {
  private frames: Texture[] = [];
  private butterflies: Butterfly[] = [];
  private loaded = false;

  async loadFrames(): Promise<void> {
    if (this.loaded) return;
    try {
      const loads: Promise<Texture>[] = [];
      for (let i = 1; i <= 7; i++) {
        // Use relative path so it respects Vite base (/jumpgl/)
        loads.push(Assets.load<Texture>(`blueButterfly/butterfly${i}.png`));
      }
      this.frames = await Promise.all(loads);
      this.loaded = true;
      console.log('[BUTTERFLY] Loaded frames');
    } catch (err) {
      console.error('[BUTTERFLY] Failed to load frames', err);
      this.loaded = false;
    }
  }

  spawn(opts: ButterflyOptions): void {
    if (!this.loaded || this.frames.length === 0) return;
    this.butterflies.push(new Butterfly(this.frames, opts));
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
}
