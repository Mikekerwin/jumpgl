import { Container, Sprite, Texture } from 'pixi.js';

export interface PlatformCollision {
  id: number;
  surfaceY: number;
  left: number;
  right: number;
}

export interface PlayerBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PlatformInstance {
  id: number;
  x: number; // world coordinate
  surfaceY: number; // Y position where player should be placed when standing
  renderY: number; // Y position for rendering the image
  width: number; // hitbox width
  height: number; // hitbox height
  imageWidth: number; // actual image width for rendering
  imageHeight: number; // actual image height for rendering
  active: boolean;
  platformType: 'large' | 'small';
  sprite?: Sprite; // PixiJS sprite for rendering
   spriteType?: 'large' | 'small';
}

export class FloatingPlatforms {
  private platforms: PlatformInstance[] = [];
  private nextId: number = 0;
  private largeImage: HTMLImageElement | null = null;
  private smallImage: HTMLImageElement | null = null;
  private largeImageLoaded: boolean = false;
  private smallImageLoaded: boolean = false;

  constructor(largeImagePath: string, smallImagePath: string) {
    // Load large platform image
    this.largeImage = new Image();
    this.largeImage.onload = () => {
      this.largeImageLoaded = true;
      console.log('[PLATFORM] Large platform image loaded:', this.largeImage!.width, 'x', this.largeImage!.height);
    };
    this.largeImage.onerror = () => {
      console.error('[PLATFORM] Failed to load large platform image');
      this.largeImageLoaded = false;
    };
    this.largeImage.src = largeImagePath;

    // Load small platform image
    this.smallImage = new Image();
    this.smallImage.onload = () => {
      this.smallImageLoaded = true;
      console.log('[PLATFORM] Small platform image loaded:', this.smallImage!.width, 'x', this.smallImage!.height);
    };
    this.smallImage.onerror = () => {
      console.error('[PLATFORM] Failed to load small platform image');
      this.smallImageLoaded = false;
    };
    this.smallImage.src = smallImagePath;
  }

  /**
   * Spawn a platform at a world position
   * @param worldX X position in world coordinates
   * @param groundCenterY Ground center Y position
   * @param playerRadius Player radius for surface Y calculation
   * @param platformType Type of platform to spawn
   * @param verticalOffset Pixels above ground center (default: 200)
   */
  spawn(
    worldX: number,
    groundCenterY: number,
    playerRadius: number,
    platformType: 'large' | 'small',
    verticalOffset: number = 200
  ): number | null {
    const isLarge = platformType === 'large';
    const image = isLarge ? this.largeImage : this.smallImage;
    const imageLoaded = isLarge ? this.largeImageLoaded : this.smallImageLoaded;

    if (!imageLoaded || !image) {
      console.warn('[PLATFORM] Cannot spawn - image not loaded yet');
      return null;
    }

    // Reuse inactive platform or create new one
    const plat = this.platforms.find(p => !p.active) || this.createPlatform();

    const imageWidth = image.width;
    const imageHeight = image.height;

    // Hitbox is narrower than the image for visual accuracy
    // Large platform: 22px narrower (original), Small platform: proportionally narrower
    const hitboxReduction = isLarge ? 22 : 11;
    const hitboxWidth = imageWidth - hitboxReduction;

    // Calculate surface Y - where the player's center should be when standing on platform
    const surfaceCenterY = groundCenterY - verticalOffset;

    // Render Y - where to draw the image (centered on surfaceCenterY)
    const renderY = surfaceCenterY - imageHeight / 2;

    // Player top position when their bottom sits on the platform's top edge
    // Graphics use y as center, so top = renderY - diameter
    const playerDiameter = playerRadius * 2;
    const surfaceY = renderY - playerDiameter;

    // Position hitbox offset to the right (5px for large, proportional for small)
    const hitboxOffsetX = isLarge ? 10 : 5;

    plat.id = this.nextId++;
    plat.x = worldX + hitboxOffsetX;
    plat.surfaceY = surfaceY;
    plat.renderY = renderY;
    plat.width = hitboxWidth;
    plat.height = imageHeight;
    plat.imageWidth = imageWidth;
    plat.imageHeight = imageHeight;
    plat.platformType = platformType;
    plat.active = true;

    console.log(
      `[PLATFORM SPAWN] Type=${platformType} X=${worldX.toFixed(0)} SurfaceY=${surfaceY.toFixed(0)} ` +
      `PlatformMiddle=${surfaceCenterY.toFixed(0)} RenderY=${renderY.toFixed(0)} GroundY=${groundCenterY.toFixed(0)}`
    );

    return plat.id;
  }

  /**
   * Update platform positions (scrolling left with ground speed)
   * @param deltaSeconds Time elapsed in seconds
   * @param groundSpeed Ground scroll speed in pixels/second
   * @param screenWidth Screen width for culling off-screen platforms
   */
  update(deltaSeconds: number, groundSpeed: number, screenWidth: number): void {
    const leftCull = -screenWidth * 0.5; // Cull platforms that are well off-screen left

    this.platforms.forEach((platform) => {
      if (!platform.active) return;

      // Move platform left at ground speed
      platform.x -= groundSpeed * deltaSeconds;

      // Deactivate platforms that have scrolled off-screen left
      if (platform.x + platform.imageWidth < leftCull) {
        platform.active = false;
        console.log(`[PLATFORM] Culled platform ${platform.id} at X=${platform.x.toFixed(0)}`);
      }
    });
  }

  /**
   * Render all active platforms to a PixiJS container
   * @param container PixiJS Container to add platform sprites to
   * @param cameraX Camera X offset for scrolling
   */
  renderToContainer(container: Container, cameraX: number = 0): void {
    // Remove all existing children (we'll re-add active platforms)
    container.removeChildren();

    this.platforms.forEach((platform) => {
      if (!platform.active) return;

      const image = platform.platformType === 'large' ? this.largeImage : this.smallImage;
      const imageLoaded = platform.platformType === 'large' ? this.largeImageLoaded : this.smallImageLoaded;

      if (!image || !imageLoaded) return;

      // Create sprite if it doesn't exist
      if (!platform.sprite) {
        const texture = Texture.from(image);
        platform.sprite = new Sprite(texture);
        platform.spriteType = platform.platformType;
      } else if (platform.spriteType !== platform.platformType) {
        // Update texture and dimensions when reusing a platform slot for a different type
        platform.sprite.texture = Texture.from(image);
        platform.spriteType = platform.platformType;
        platform.sprite.width = image.width;
        platform.sprite.height = image.height;
      }

      // Update sprite position
      const screenX = platform.x - cameraX;
      platform.sprite.position.set(screenX, platform.renderY);
      platform.sprite.width = image.width;
      platform.sprite.height = image.height;

      // Add to container
      container.addChild(platform.sprite);
    });
  }

  /**
   * Render all active platforms (legacy canvas method, kept for compatibility)
   * @param ctx Canvas rendering context (2D)
   * @param cameraX Camera X offset for scrolling
   */
  render(ctx: any, cameraX: number = 0): void {
    this.platforms.forEach((platform) => {
      if (!platform.active) return;

      const image = platform.platformType === 'large' ? this.largeImage : this.smallImage;
      if (!image) return;

      const screenX = platform.x - cameraX;

      // Draw the platform image
      ctx.drawImage(image, screenX, platform.renderY);

      // Optional: Draw debug hitbox overlay
      const DEBUG_OVERLAY = false;
      if (DEBUG_OVERLAY) {
        ctx.fillStyle = 'rgba(0, 255, 127, 0.35)';
        ctx.fillRect(screenX, platform.renderY, platform.width, platform.height);
      }
    });
  }

  /**
   * Get the platform the player is currently standing on (if any)
   * This is the critical collision detection logic that took days to perfect!
   *
   * @param currentBounds Player bounds this frame
   * @param previousBounds Player bounds last frame
   * @param playerVelocity Player's vertical velocity
   * @returns Platform collision info or null
   */
  getSupportingPlatform(
    currentBounds: PlayerBounds,
    previousBounds: PlayerBounds,
    playerVelocity: number
  ): PlatformCollision | null {
    const playerHeight = currentBounds.bottom - currentBounds.top;
    const tolerance = Math.max(2, playerHeight * 0.05);

    for (const platform of this.platforms) {
      if (!platform.active) continue;

      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;

      // platform.surfaceY is where player's TOP should be when standing on platform
      // So player's BOTTOM should be at surfaceY + playerHeight
      const platformBottomCollision = platform.surfaceY + playerHeight;

      // Check horizontal overlap
      const horizontalOverlap = !(
        currentBounds.right < platformLeft ||
        currentBounds.left > platformRight
      );
      if (!horizontalOverlap) continue;

      // Check if player is descending (moving down or velocity is downward)
      const descending = playerVelocity <= 0 || currentBounds.bottom > previousBounds.bottom;

      // Check if approaching from above (previous position was above platform)
      const approachingFromAbove = previousBounds.top + tolerance <= platform.surfaceY;

      // Check if player crossed the platform surface this frame
      const crossedThisFrame =
        descending &&
        approachingFromAbove &&
        previousBounds.bottom <= platformBottomCollision + tolerance &&
        currentBounds.bottom >= platformBottomCollision - tolerance;

      // Check if player is resting on the platform (already on it, minimal velocity)
      const resting =
        Math.abs(currentBounds.bottom - platformBottomCollision) <= tolerance &&
        Math.abs(playerVelocity) < 0.8;

      // Return platform collision if either condition is met
      if (crossedThisFrame || resting) {
        return {
          id: platform.id,
          surfaceY: platform.surfaceY,
          left: platformLeft,
          right: platformRight,
        };
      }
    }

    return null;
  }

  /**
   * Reset all platforms (deactivate)
   */
  reset(): void {
    this.platforms.forEach(p => {
      p.active = false;
    });
  }

  /**
   * Get the loaded image dimensions for a platform type (null if not loaded yet)
   */
  getImageDimensions(type: 'large' | 'small'): { width: number; height: number } | null {
    const image = type === 'large' ? this.largeImage : this.smallImage;
    const loaded = type === 'large' ? this.largeImageLoaded : this.smallImageLoaded;
    if (!image || !loaded) return null;
    return { width: image.width, height: image.height };
  }

  /**
   * Get count of active platforms
   */
  getActivePlatformCount(): number {
    return this.platforms.filter(p => p.active).length;
  }

  /**
   * Debug helper: return simple hitbox data for active platforms
   */
  getDebugHitboxes(playerDiameter: number): Array<{ id: number; type: 'large' | 'small'; left: number; top: number; width: number; height: number }> {
    return this.platforms
      .filter(p => p.active)
      .map(p => ({
        id: p.id,
        type: p.platformType,
        left: p.x,
        top: p.surfaceY,
        width: p.width,
        height: playerDiameter,
      }));
  }

  /**
   * Get live bounds for a platform by id (returns null if deactivated)
   */
  getPlatformBounds(id: number): PlatformCollision | null {
    const platform = this.platforms.find(p => p.id === id && p.active);
    if (!platform) return null;

    return {
      id: platform.id,
      surfaceY: platform.surfaceY,
      left: platform.x,
      right: platform.x + platform.width,
    };
  }

  /**
   * Get all platforms (for shadow projection and other systems)
   */
  getAllPlatforms(): PlatformInstance[] {
    return this.platforms;
  }

  private createPlatform(): PlatformInstance {
    const platform: PlatformInstance = {
      id: this.nextId++,
      x: 0,
      surfaceY: 0,
      renderY: 0,
      width: 0,
      height: 0,
      imageWidth: 0,
      imageHeight: 0,
      active: false,
      platformType: 'large',
    };
    this.platforms.push(platform);
    return platform;
  }
}
