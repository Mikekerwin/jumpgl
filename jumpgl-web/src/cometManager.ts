import { Container } from 'pixi.js';
import { AnimatedSprite } from './animatedSprite';

export interface CometConfig {
  screenWidth: number;
  screenHeight: number;
  speed: number; // pixels per second
  yPosition: number; // vertical position on screen (0-1, where 0.5 is middle)
  scale: number;
}

export class CometManager {
  private container: Container;
  private comet: AnimatedSprite | null = null;
  private config: CometConfig;
  private isActive: boolean = false;
  private totalAnimationDuration: number = 0; // Total time for the entire animation in seconds
  private currentTime: number = 0;
  private startX: number = 0;
  private endX: number = 0;

  constructor(container: Container, config: CometConfig) {
    this.container = container;
    this.config = config;

    // Create the animated sprite
    this.comet = new AnimatedSprite({
      frameBasePath: 'comet/Comet_',
      frameCount: 152,
      frameRate: 30, // 30 FPS animation
      loop: false,
    });

    this.comet.setScale(config.scale);
    this.container.addChild(this.comet.getView());

    // Calculate total duration based on frame count and frame rate
    this.totalAnimationDuration = 152 / 30; // ~5.07 seconds for the animation

    // Position comet off-screen to the left initially
    this.startX = -200; // Start off-screen left
    this.endX = config.screenWidth + 200; // End off-screen right
    this.comet.setPosition(this.startX, config.screenHeight * config.yPosition);
    this.comet.getView().visible = false;
  }

  public spawn(): void {
    if (!this.comet || this.isActive) {
      return;
    }

    // Check if frames are loaded before spawning
    if (!this.comet.getIsLoaded()) {
      console.warn('[COMET] Frames not loaded yet, waiting...');
      // Retry after a short delay
      setTimeout(() => this.spawn(), 100);
      return;
    }

    this.isActive = true;
    this.currentTime = 0;

    // Start position: top-left corner, half size
    const startY = -this.config.screenHeight * 0.1; // Start just above top-left corner
    this.comet.setPosition(this.startX, startY);
    this.comet.setScale(this.config.scale * 0.5); // Start at half size
    this.comet.getView().visible = true;

    // Start animation
    this.comet.play(() => {
      // Animation complete callback
      this.onAnimationComplete();
    });
  }

  private onAnimationComplete(): void {
    // Hide the comet when animation is done
    if (this.comet) {
      this.comet.getView().visible = false;
    }
    this.isActive = false;
  }

  public update(deltaSeconds: number): void {
    if (!this.isActive || !this.comet) {
      return;
    }

    // Update animation frame
    this.comet.update(deltaSeconds);

    // Update position - move from left to right over the duration of the animation
    this.currentTime += deltaSeconds;
    const progress = Math.min(1, this.currentTime / this.totalAnimationDuration);

    // Linear interpolation from startX to endX
    const currentX = this.startX + (this.endX - this.startX) * progress;

    // Interpolate Y position: start at top-left, descend diagonally to 2/3 down screen
    const startY = -this.config.screenHeight * 0.1; // Top-left corner
    const endY = this.config.screenHeight * this.config.yPosition; // 2/3 down (1/3 from bottom)
    const currentY = startY + (endY - startY) * progress;

    // Interpolate scale: grow from 0.5x to 1.0x
    const startScale = this.config.scale * 0.5;
    const endScale = this.config.scale;
    const currentScale = startScale + (endScale - startScale) * progress;

    this.comet.setPosition(currentX, currentY);
    this.comet.setScale(currentScale);

    // Check if comet has moved off-screen
    if (progress >= 1) {
      this.onAnimationComplete();
    }
  }

  public updateDimensions(width: number, height: number): void {
    this.config.screenWidth = width;
    this.config.screenHeight = height;
    this.endX = width + 200;

    // Update comet position if not active
    if (!this.isActive && this.comet) {
      this.comet.setPosition(this.startX, height * this.config.yPosition);
    }
  }

  public isActiveComet(): boolean {
    return this.isActive;
  }

  public destroy(): void {
    if (this.comet) {
      this.comet.destroy();
      this.comet = null;
    }
  }
}
