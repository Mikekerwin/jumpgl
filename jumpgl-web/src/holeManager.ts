import { Container, Sprite, Texture } from 'pixi.js';

export type HoleSize = 'small' | 'large';

type HoleInstance = {
  id: number;
  x: number; // world coordinate (left)
  width: number;
  height: number;
  renderY: number; // top of the hole sprite
  active: boolean;
  size: HoleSize;
  sprite?: Sprite;
  spriteSize?: HoleSize;
};

type PlayerBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export class HoleManager {
  private holes: HoleInstance[] = [];
  private nextId = 0;
  private readonly hitboxInset = 75; // Pull both sides inward by 75px (150px total) to better match art

  private smallImage: HTMLImageElement | null = null;
  private largeImage: HTMLImageElement | null = null;
  private smallLoaded = false;
  private largeLoaded = false;

  constructor(smallImagePath: string, largeImagePath: string) {
    this.smallImage = new Image();
    this.smallImage.onload = () => { this.smallLoaded = true; };
    this.smallImage.onerror = () => { this.smallLoaded = false; };
    this.smallImage.src = smallImagePath;

    this.largeImage = new Image();
    this.largeImage.onload = () => { this.largeLoaded = true; };
    this.largeImage.onerror = () => { this.largeLoaded = false; };
    this.largeImage.src = largeImagePath;
  }

  /**
   * Spawn a hole anchored to the ground.
   * @param worldX world position for the left edge
   * @param groundY ground plane Y (player feet). Hole art bottom will align here.
   * @param size hole art size
   */
  spawn(worldX: number, groundY: number, size: HoleSize): void {
    const isLarge = size === 'large';
    const image = isLarge ? this.largeImage : this.smallImage;
    const loaded = isLarge ? this.largeLoaded : this.smallLoaded;

    if (!image || !loaded) {
      console.warn('[HOLE] Cannot spawn - image not loaded');
      return;
    }

    const hole = this.holes.find(h => !h.active) ?? this.createHole();

    hole.id = this.nextId++;
    hole.x = worldX;
    hole.width = image.width;
    hole.height = image.height;
    hole.renderY = groundY - image.height; // align bottom of hole art to ground plane
    hole.active = true;
    hole.size = size;
  }

  /**
   * Scroll holes with the ground.
   */
  update(deltaSeconds: number, groundSpeed: number, screenWidth: number): void {
    const leftCull = -screenWidth * 0.5;

    this.holes.forEach((hole) => {
      if (!hole.active) return;

      hole.x -= groundSpeed * deltaSeconds;

      if (hole.x + hole.width < leftCull) {
        hole.active = false;
      }
    });
  }

  /**
   * Render to a Pixi container. Hole sprites sit above the player for masking effect.
   */
  renderToContainer(container: Container, cameraX: number = 0): void {
    container.removeChildren();

    this.holes.forEach((hole) => {
      if (!hole.active) return;

      const image = hole.size === 'large' ? this.largeImage : this.smallImage;
      const loaded = hole.size === 'large' ? this.largeLoaded : this.smallLoaded;
      if (!image || !loaded) return;

      if (!hole.sprite) {
        const texture = Texture.from(image);
        hole.sprite = new Sprite(texture);
        hole.spriteSize = hole.size;
      } else if (hole.spriteSize !== hole.size) {
        hole.sprite.texture = Texture.from(image);
        hole.spriteSize = hole.size;
        hole.sprite.width = image.width;
        hole.sprite.height = image.height;
      }

      const screenX = hole.x - cameraX;
      // Draw the sprite lower so its center lines up closer to the player (visual only)
      const renderOffsetY = hole.height * 0.5;
      hole.sprite.position.set(screenX, hole.renderY + renderOffsetY);
      hole.sprite.width = image.width;
      hole.sprite.height = image.height;

      container.addChild(hole.sprite);
    });
  }

  /**
   * Check for collision with a hole (simple AABB overlap).
   */
  getCollidingHole(bounds: PlayerBounds): HoleInstance | null {
    for (const hole of this.holes) {
      if (!hole.active) continue;

      const left = hole.x + this.hitboxInset;
      const right = hole.x + hole.width - this.hitboxInset;
      const top = hole.renderY;
      const bottom = top + hole.height;

      const horizontal = bounds.right > left && bounds.left < right;
      const vertical = bounds.bottom > top && bounds.top < bottom;

      if (horizontal && vertical) {
        return hole;
      }
    }
    return null;
  }

  reset(): void {
    this.holes.forEach(h => h.active = false);
  }

  getImageDimensions(size: HoleSize): { width: number; height: number } | null {
    const image = size === 'large' ? this.largeImage : this.smallImage;
    const loaded = size === 'large' ? this.largeLoaded : this.smallLoaded;
    if (!image || !loaded) return null;
    return { width: image.width, height: image.height };
  }

  getDebugHitboxes(): Array<{ id: number; size: HoleSize; left: number; top: number; width: number; height: number }> {
    return this.holes
      .filter(h => h.active)
      .map(h => ({
        id: h.id,
        size: h.size,
        left: h.x + this.hitboxInset,
        top: h.renderY,
        width: Math.max(0, h.width - this.hitboxInset * 2),
        height: h.height,
      }));
  }

  private createHole(): HoleInstance {
    const hole: HoleInstance = {
      id: this.nextId++,
      x: 0,
      width: 0,
      height: 0,
      renderY: 0,
      active: false,
      size: 'small',
    };
    this.holes.push(hole);
    return hole;
  }
}
