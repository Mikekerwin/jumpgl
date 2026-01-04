/**
 * AnimatedSkyBackground - Manages crossfade animation between sky frames
 * Double-buffers two sprites to smoothly fade between 200 WebP frames
 * Memory-efficient: only 2 frames loaded at once
 */

import { Container, Sprite, Texture, Assets } from 'pixi.js';

export class AnimatedSkyBackground {
  private container: Container;
  private layerA: Sprite;  // Current frame
  private layerB: Sprite;  // Next frame (fading in)

  private currentFrameIndex: number = 0;
  private totalFrames: number = 209; // clouds000.webp through clouds208.webp
  private frameTransitionDuration: number = 0.05; // seconds for each frame transition (includes fade)
  private elapsedTime: number = 0;

  private currentTexture: Texture | null = null;
  private nextTexture: Texture | null = null;

  // Preload next frame during crossfade
  private isTransitioning: boolean = false;
  private transitionProgress: number = 0; // 0 to 1
  private isLoadingNextFrame: boolean = false; // Track if next frame is loading
  private targetWidth: number;
  private targetHeight: number;

  constructor(container: Container, width: number, height: number) {
    this.targetWidth = width;
    this.targetHeight = height;

    // Create container with two sprite layers
    this.container = new Container();

    // Layer A: current frame (will maintain aspect ratio)
    this.layerA = new Sprite();
    this.layerA.alpha = 1.0;

    // Layer B: next frame (fading in, will maintain aspect ratio)
    this.layerB = new Sprite();
    this.layerB.alpha = 0.0;

    this.container.addChild(this.layerA, this.layerB);
    container.addChildAt(this.container, 0); // Add at index 0 (bottom layer)

    // Load first frame asynchronously
    this.loadInitialFrame();
  }

  /**
   * Scale sprite to cover the target area while maintaining aspect ratio
   * Anchors the bottom edge to the bottom of the target area
   */
  private scaleSpriteToCover(sprite: Sprite): void {
    if (!sprite.texture) return;

    const textureWidth = sprite.texture.width;
    const textureHeight = sprite.texture.height;

    // Calculate scale to cover the entire area (like CSS background-size: cover)
    const scaleX = this.targetWidth / textureWidth;
    const scaleY = this.targetHeight / textureHeight;
    const scale = Math.max(scaleX, scaleY);

    sprite.width = textureWidth * scale;
    sprite.height = textureHeight * scale;

    // Center horizontally
    sprite.x = (this.targetWidth - sprite.width) / 2;
    // Anchor bottom edge to bottom of target area
    sprite.y = this.targetHeight - sprite.height;
  }

  /**
   * Load the first frame on initialization
   */
  private async loadInitialFrame(): Promise<void> {
    try {
      this.currentTexture = await this.loadFrame(0);
      this.layerA.texture = this.currentTexture;
      this.scaleSpriteToCover(this.layerA);
    } catch (error) {
      console.error('Failed to load initial sky frame:', error);
    }
  }

  /**
   * Load a specific frame from the skyAnimate folder
   */
  private async loadFrame(frameIndex: number): Promise<Texture> {
    // Format: skyAnimate/clouds000.webp, clouds001.webp, etc.
    const framePath = `skyAnimate/clouds${String(frameIndex).padStart(3, '0')}.webp`;
    const texture = await Assets.load(framePath);
    return texture;
  }

  /**
   * Start loading next frame (non-blocking)
   */
  private startLoadingNextFrame(): void {
    if (this.isLoadingNextFrame) return;

    // Calculate next frame index (loop back to 0 after 208)
    const nextFrameIndex = (this.currentFrameIndex + 1) % this.totalFrames;

    this.isLoadingNextFrame = true;

    // Load next texture asynchronously (non-blocking)
    this.loadFrame(nextFrameIndex)
      .then((texture) => {
        this.nextTexture = texture;
        this.layerB.texture = this.nextTexture;
        this.scaleSpriteToCover(this.layerB);
        this.layerB.alpha = 0.0;

        // Start transition immediately after loading
        this.isTransitioning = true;
        this.transitionProgress = 0;
        this.isLoadingNextFrame = false;
      })
      .catch((error) => {
        console.error(`Failed to load sky frame ${nextFrameIndex}:`, error);
        this.isLoadingNextFrame = false;
      });
  }

  /**
   * Update animation - called every frame
   */
  public update(deltaSeconds: number): void {
    this.elapsedTime += deltaSeconds;

    // Check if it's time to start loading next frame
    if (!this.isTransitioning && !this.isLoadingNextFrame && this.elapsedTime >= this.frameTransitionDuration) {
      this.startLoadingNextFrame();
      this.elapsedTime = 0;
    }

    // Animate fade-in (runs after next frame is loaded)
    // LayerA stays at full opacity, LayerB fades in on top
    if (this.isTransitioning) {
      this.transitionProgress += deltaSeconds / this.frameTransitionDuration;

      if (this.transitionProgress >= 1.0) {
        // Transition complete - swap layers
        this.completeTransition();
      } else {
        // Smooth fade-in using ease-in-out curve
        // LayerA (old frame) stays at full opacity
        this.layerA.alpha = 1.0;
        // LayerB (new frame) fades in from 0 to 1
        const alpha = this.easeInOutSine(this.transitionProgress);
        this.layerB.alpha = alpha;
      }
    }
  }

  /**
   * Complete transition and swap layers
   */
  private completeTransition(): void {
    // Destroy old texture to free memory
    if (this.currentTexture) {
      this.currentTexture.destroy(true);
    }

    // Swap textures: B becomes A
    this.currentTexture = this.nextTexture;
    this.nextTexture = null;

    // Swap sprites: move B to A
    this.layerA.texture = this.layerB.texture;
    this.scaleSpriteToCover(this.layerA);
    this.layerA.alpha = 1.0;
    this.layerB.alpha = 0.0;

    // Update frame index
    this.currentFrameIndex = (this.currentFrameIndex + 1) % this.totalFrames;

    // Reset transition state
    this.isTransitioning = false;
    this.transitionProgress = 0;
  }

  /**
   * Ease-in-out sine interpolation for smooth fading
   */
  private easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  /**
   * Set position of the sky background
   */
  public setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.currentTexture) this.currentTexture.destroy(true);
    if (this.nextTexture) this.nextTexture.destroy(true);
    this.container.destroy({ children: true });
  }
}
