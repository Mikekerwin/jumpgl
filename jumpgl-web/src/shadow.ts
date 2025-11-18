import { Graphics, BlurFilter } from 'pixi.js';

export interface ShadowOptions {
  playerWidth: number; // Player's width (diameter = radius * 2)
  maxBlur?: number; // Maximum blur at highest point (default 15px)
  minOpacity?: number; // Minimum opacity at highest point (default 0.2)
}

export class Shadow {
  private shadow: Graphics;
  private readonly playerWidth: number;
  private readonly maxBlur: number;
  private readonly minOpacity: number;
  private readonly maxOpacity = 0.7;
  private blurFilter: BlurFilter;

  constructor(opts: ShadowOptions) {
    this.playerWidth = opts.playerWidth;
    this.maxBlur = opts.maxBlur ?? 15;
    this.minOpacity = opts.minOpacity ?? 0.2;

    this.shadow = new Graphics();
    this.shadow.alpha = this.maxOpacity;

    // Create blur filter
    this.blurFilter = new BlurFilter();
    this.blurFilter.blur = 0; // Start with no blur
    this.shadow.filters = [this.blurFilter];
  }

  /**
   * Update shadow based on player position and ground level
   * @param playerX Player's X position (center)
   * @param playerY Player's Y position (center)
   * @param groundY Ground surface Y position
   */
  update(playerX: number, playerY: number, groundY: number): void {
    // Calculate distance from floor (0 = on floor, positive = in air)
    // playerY is the center of the ball, so we need to add radius to get bottom edge
    const playerRadius = this.playerWidth / 2;
    const playerBottom = playerY + playerRadius;
    const distanceFromFloor = groundY - playerBottom;
    const maxDistance = groundY * 0.5; // Maximum distance we calculate shadow for

    // Normalize distance (0 = on floor, 1 = far away)
    const normalizedDistance = Math.min(Math.max(distanceFromFloor / maxDistance, 0), 1);

    // Calculate shadow properties based on distance
    const opacity = this.maxOpacity - (normalizedDistance * (this.maxOpacity - this.minOpacity));
    const blur = normalizedDistance * this.maxBlur; // 0 when close, maxBlur when far
    const widthScale = 1 - (normalizedDistance * 0.5); // 1.0 when close, 0.5 when far

    // Shadow dimensions (dynamically scales with player width)
    const shadowWidth = this.playerWidth * widthScale;
    const shadowHeight = 8; // Fixed short height for shadow

    // Update shadow graphics
    this.shadow.clear();
    this.shadow.ellipse(0, 0, shadowWidth / 2, shadowHeight / 2);
    this.shadow.fill({ color: 0x000000, alpha: opacity });

    // Update blur filter
    this.blurFilter.blur = blur;

    // Position shadow at ground level, centered under player
    this.shadow.position.set(playerX, groundY);
  }

  getView(): Graphics {
    return this.shadow;
  }

  destroy(): void {
    this.shadow.destroy();
  }
}
