import { Sprite, Texture, Assets } from 'pixi.js';

export interface AnimatedSpriteConfig {
  frameBasePath: string; // e.g., "comet/comet2_0000s_"
  frameCount: number;
  frameRate: number; // frames per second
  loop: boolean;
}

export class AnimatedSprite {
  private sprite: Sprite;
  private textures: Texture[] = [];
  private currentFrame: number = 0;
  private frameTime: number = 0;
  private frameDuration: number;
  private isPlaying: boolean = false;
  private loop: boolean;
  private onComplete?: () => void;
  private isLoaded: boolean = false;

  constructor(config: AnimatedSpriteConfig) {
    this.loop = config.loop;
    this.frameDuration = 1 / config.frameRate;

    // Create initial sprite with placeholder
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.5);

    // Load all frames
    this.loadFrames(config.frameBasePath, config.frameCount);
  }

  private async loadFrames(basePath: string, frameCount: number): Promise<void> {
    // Load frames in batches to balance speed and reliability
    const BATCH_SIZE = 20;
    const allTextures: Texture[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let batchStart = 0; batchStart < frameCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, frameCount);
      const batchPromises: Promise<Texture>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const framePath = `${basePath}${i + 1}.webp`;

        batchPromises.push(
          Assets.load(framePath)
            .then((texture) => texture as Texture)
            .catch(() => {
              console.warn(`Failed to load frame ${i}: ${framePath}`);
              failCount++;
              return Texture.EMPTY;
            })
        );
      }

      const batchTextures = await Promise.all(batchPromises);
      allTextures.push(...batchTextures);
      successCount += batchTextures.filter(t => t !== Texture.EMPTY).length;

      // Small delay between batches
      if (batchEnd < frameCount) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    this.textures = allTextures;

    // Set initial texture
    if (this.textures.length > 0 && successCount > 0) {
      this.sprite.texture = this.textures[0];

      // Find and log the maximum dimensions across all frames
      let maxWidth = 0;
      let maxHeight = 0;

      this.textures.forEach(texture => {
        if (texture !== Texture.EMPTY) {
          maxWidth = Math.max(maxWidth, texture.width);
          maxHeight = Math.max(maxHeight, texture.height);
        }
      });

      this.isLoaded = true;
      console.log(`AnimatedSprite: Loaded ${successCount}/${frameCount} frames (${failCount} failed)`);
      console.log(`⚠️ MAXIMUM FRAME DIMENSIONS: ${maxWidth}x${maxHeight} - Resize all frames to this size to prevent jumping`);
    } else {
      console.error(`AnimatedSprite: Failed to load any frames`);
    }
  }

  public play(onComplete?: () => void): void {
    if (!this.isLoaded) {
      console.warn('AnimatedSprite: Attempted to play before textures loaded');
      return;
    }

    this.isPlaying = true;
    this.currentFrame = 0;
    this.frameTime = 0;
    this.onComplete = onComplete;
    this.sprite.texture = this.textures[0];
  }

  public stop(): void {
    this.isPlaying = false;
    this.currentFrame = 0;
    this.frameTime = 0;
  }

  public update(deltaSeconds: number): void {
    if (!this.isPlaying || !this.isLoaded || this.textures.length === 0) {
      return;
    }

    this.frameTime += deltaSeconds;

    // Check if we need to advance to the next frame
    if (this.frameTime >= this.frameDuration) {
      this.frameTime -= this.frameDuration;
      this.currentFrame++;

      // Check if animation is complete
      if (this.currentFrame >= this.textures.length) {
        if (this.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = this.textures.length - 1;
          this.isPlaying = false;

          if (this.onComplete) {
            this.onComplete();
          }
          return;
        }
      }

      // Update sprite texture
      this.sprite.texture = this.textures[this.currentFrame];
    }
  }

  public getView(): Sprite {
    return this.sprite;
  }

  public setPosition(x: number, y: number): void {
    this.sprite.position.set(x, y);
  }

  public setScale(scale: number): void {
    this.sprite.scale.set(scale);
  }

  public setAlpha(alpha: number): void {
    this.sprite.alpha = alpha;
  }

  public isAnimationPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsLoaded(): boolean {
    return this.isLoaded;
  }

  public destroy(): void {
    this.sprite.destroy();
    // Note: Textures are managed by PixiJS cache, so we don't destroy them
  }
}
