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

export type PlatformType = 'large' | 'small' | 'smallfire1' | 'smallfire2' | 'largefire1' | 'largefire2' | 'largefire3';

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
  platformType: PlatformType;
  sprite?: Sprite; // PixiJS sprite for rendering
  spriteType?: PlatformType;

  // Oscillation state
  baseX: number; // Original X (before oscillation)
  baseSurfaceY: number; // Original surface Y (before oscillation)
  baseRenderY: number; // Original render Y (before oscillation)
  oscillationPhase: number; // Random starting phase for variety
  oscillationSpeed: number; // Speed of oscillation (radians per second)
  oscillationAmplitudeY: number; // Vertical amplitude (pixels)
  oscillationAmplitudeX: number; // Horizontal amplitude (pixels)
  shouldOscillate: boolean; // Not all platforms oscillate
  isGapMover: boolean; // Moves within large gaps to help the player
  gapMovePhase: number;
  gapMoveSpeed: number;
  gapMoveMaxLeft: number;
  gapMoveMaxRight: number;

  // Landing compression state
  compressionOffset: number; // Current downward compression offset
  compressionProgress: number; // Animation progress (0 to 1)
  compressionAmount: number; // Max compression for this landing (velocity-based)
}

export class FloatingPlatforms {
  private platforms: PlatformInstance[] = [];
  private nextId: number = 0;
  private images: Map<PlatformType, HTMLImageElement> = new Map();
  private imagesLoaded: Map<PlatformType, boolean> = new Map();
  private elapsedTime: number = 0; // For oscillation timing

  // Backwards compatibility
  private get largeImage() { return this.images.get('large') || null; }
  private get smallImage() { return this.images.get('small') || null; }

  constructor(
    largeImagePath: string,
    smallImagePath: string,
    smallFire1Path?: string,
    smallFire2Path?: string,
    largeFire1Path?: string,
    largeFire2Path?: string,
    largeFire3Path?: string
  ) {
    // Load all platform images
    const imagePaths: Record<PlatformType, string | undefined> = {
      large: largeImagePath,
      small: smallImagePath,
      smallfire1: smallFire1Path,
      smallfire2: smallFire2Path,
      largefire1: largeFire1Path,
      largefire2: largeFire2Path,
      largefire3: largeFire3Path,
    };

    Object.entries(imagePaths).forEach(([type, path]) => {
      if (path) {
        const platformType = type as PlatformType;
        const img = new Image();
        img.onload = () => {
          this.imagesLoaded.set(platformType, true);
          console.log(`[PLATFORM] ${type} platform image loaded:`, img.width, 'x', img.height);
        };
        img.onerror = () => {
          console.error(`[PLATFORM] Failed to load ${type} platform image`);
          this.imagesLoaded.set(platformType, false);
        };
        img.src = path;
        this.images.set(platformType, img);
      }
    });
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
    platformType: PlatformType,
    verticalOffset: number = 200
  ): number | null {
    const image = this.images.get(platformType);
    const imageLoaded = this.imagesLoaded.get(platformType);

    if (!imageLoaded || !image) {
      console.warn(`[PLATFORM] Cannot spawn ${platformType} - image not loaded yet`);
      return null;
    }

    // Determine if this is a "large" type platform for sizing
    const isLarge = platformType === 'large' || platformType.startsWith('largefire');

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
    plat.baseX = worldX + hitboxOffsetX;
    plat.x = plat.baseX;
    plat.surfaceY = surfaceY;
    plat.renderY = renderY;
    plat.width = hitboxWidth;
    plat.height = imageHeight;
    plat.imageWidth = imageWidth;
    plat.imageHeight = imageHeight;
    plat.platformType = platformType;
    plat.active = true;

    // Initialize oscillation properties
    plat.baseSurfaceY = surfaceY;
    plat.baseRenderY = renderY;

    // All platforms oscillate
    plat.shouldOscillate = true;

    if (plat.shouldOscillate) {
      // Random starting phase so platforms aren't synchronized
      plat.oscillationPhase = Math.random() * Math.PI * 2;

      // Random speed for visible oscillation
      plat.oscillationSpeed = 0.5 + Math.random() * 0.7; // 0.5-1.2 rad/sec

      // All platforms use the same oscillation range now
      if (isLarge) {
        plat.oscillationAmplitudeY = 12 + Math.random() * 18; // 12-30 pixels
        plat.oscillationAmplitudeX = 8 + Math.random() * 10; // 8-18 pixels
      } else {
        plat.oscillationAmplitudeY = 10 + Math.random() * 18; // 10-28 pixels
        plat.oscillationAmplitudeX = 6 + Math.random() * 12; // 6-18 pixels
      }
    } else {
      // Static platform - no oscillation
      plat.oscillationPhase = 0;
      plat.oscillationSpeed = 0;
      plat.oscillationAmplitudeY = 0;
      plat.oscillationAmplitudeX = 0;
    }

    plat.isGapMover = false;
    plat.gapMovePhase = Math.random() * Math.PI * 2;
    plat.gapMoveSpeed = 0.4 + Math.random() * 0.3;
    plat.gapMoveMaxLeft = 0;
    plat.gapMoveMaxRight = 0;

    // Initialize compression state
    plat.compressionOffset = 0;
    plat.compressionProgress = 0;
    plat.compressionAmount = 0;

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
   * @param shouldCull Optional callback to determine if platform should be culled
   */
  update(deltaSeconds: number, groundSpeed: number, shouldCull?: (x: number, w: number) => boolean): void {
    // Update elapsed time for oscillation
    this.elapsedTime += deltaSeconds;

    // Scroll base X for all active platforms
    const activePlatforms = this.platforms.filter(p => p.active);
    activePlatforms.forEach((platform) => {
      platform.baseX -= groundSpeed * deltaSeconds;
    });

    // Select a platform to move within large gaps
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const LARGE_GAP_THRESHOLD = 350;
    const GAP_MOVE_LIMIT = 100;
    const buffer = 20;
    const wasGapMover = new Map<number, boolean>();

    activePlatforms.forEach((platform) => {
      wasGapMover.set(platform.id, platform.isGapMover);
      platform.isGapMover = false;
      platform.gapMoveMaxLeft = 0;
      platform.gapMoveMaxRight = 0;
    });

    if (screenWidth > 0 && activePlatforms.length > 2) {
      const sorted = [...activePlatforms].sort((a, b) => a.baseX - b.baseX);

      for (let i = 1; i < sorted.length - 1; i++) {
        const platform = sorted[i];
        const leftNeighbor = sorted[i - 1];
        const rightNeighbor = sorted[i + 1];

        const leftGap = platform.baseX - (leftNeighbor.baseX + leftNeighbor.width);
        const rightGap = rightNeighbor.baseX - (platform.baseX + platform.width);

        const isLarge = platform.platformType === 'large' || platform.platformType.startsWith('largefire');
        if (!isLarge && leftGap >= LARGE_GAP_THRESHOLD && rightGap >= LARGE_GAP_THRESHOLD) {
          const maxLeft = Math.max(0, platform.baseX - (leftNeighbor.baseX + leftNeighbor.width + buffer));
          const maxRight = Math.max(0, (rightNeighbor.baseX - buffer - platform.width) - platform.baseX);
          platform.isGapMover = true;
          platform.gapMoveMaxLeft = Math.min(GAP_MOVE_LIMIT, maxLeft);
          platform.gapMoveMaxRight = Math.min(GAP_MOVE_LIMIT, maxRight);

          if (!wasGapMover.get(platform.id)) {
            platform.gapMovePhase = Math.random() * Math.PI * 2;
            platform.gapMoveSpeed = 0.9 + Math.random() * 0.6;
          } else if (platform.gapMoveSpeed === 0) {
            platform.gapMoveSpeed = 0.9 + Math.random() * 0.6;
          }
        }
      }
    }

    this.platforms.forEach((platform) => {
      if (!platform.active) return;

      let offsetX = 0;
      let offsetY = 0;

      // Cull platform if needed
      if (platform.shouldOscillate) {
        const time = this.elapsedTime;
        const phase = platform.oscillationPhase;
        const speed = platform.oscillationSpeed;

        offsetY = Math.sin(time * speed + phase) * platform.oscillationAmplitudeY;
        offsetX = Math.cos(time * speed * 0.7 + phase) * platform.oscillationAmplitudeX;

        offsetY += Math.sin(time * speed * 1.9 + phase * 1.3) * (platform.oscillationAmplitudeY * 0.35);
        offsetX += Math.cos(time * speed * 1.4 + phase * 0.6) * (platform.oscillationAmplitudeX * 0.45);
      }

      if (platform.isGapMover) {
        const s = Math.sin(this.elapsedTime * platform.gapMoveSpeed + platform.gapMovePhase);
        const gapOffset = s < 0 ? s * platform.gapMoveMaxLeft : s * platform.gapMoveMaxRight;
        offsetX += gapOffset;
      }

      platform.x = platform.baseX + offsetX;

      if (shouldCull && shouldCull(platform.x, platform.width)) {
        platform.active = false;
        platform.sprite?.destroy();
        platform.sprite = undefined;
        return;
      }

      // Apply oscillation if enabled (both visual and collision move together)
      if (platform.shouldOscillate) {
        // Apply oscillation to both collision surface and visual position
        // This makes the player ride the platform as it floats up and down
        platform.surfaceY = platform.baseSurfaceY + offsetY;
        platform.renderY = platform.baseRenderY + offsetY;
      } else {
        // Static platforms stay at their base positions
        platform.surfaceY = platform.baseSurfaceY;
        platform.renderY = platform.baseRenderY;
      }

      // Apply landing compression animation (visual squash effect)
      if (platform.compressionProgress > 0) {
        const COMPRESSION_SPEED = 4.0; // How fast the animation plays

        // Advance animation progress
        platform.compressionProgress += deltaSeconds * COMPRESSION_SPEED;

        // Animation completes when progress >= 1
        if (platform.compressionProgress >= 1.0) {
          platform.compressionProgress = 0;
          platform.compressionOffset = 0;
          platform.compressionAmount = 0;
        } else {
          // Use sine wave for smooth down-and-back motion
          const t = platform.compressionProgress;
          const compressionCurve = Math.sin(t * Math.PI);
          // Use the velocity-based compressionAmount instead of fixed value
          platform.compressionOffset = compressionCurve * platform.compressionAmount;
        }

        // Apply compression ONLY to visual position (renderY)
        // Player stays locked to surfaceY (collision) which has oscillation only
        platform.renderY += platform.compressionOffset;
      }

      // Keep all platforms active; do not cull when off-screen so collisions persist when rewinding
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

      const image = this.images.get(platform.platformType);
      const imageLoaded = this.imagesLoaded.get(platform.platformType);

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

      // Update sprite position (renderY already includes oscillation and compression from update())
      platform.sprite.position.set(platform.x - cameraX, platform.renderY);
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
   * @param platformsJumpedThrough Set of platform IDs that player jumped through from below
   * @returns Platform collision info or null
   */
  getSupportingPlatform(
    currentBounds: PlayerBounds,
    previousBounds: PlayerBounds,
    playerVelocity: number,
    platformsJumpedThrough: Set<number> = new Set()
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

      // Check if this specific platform was jumped through from below
      // If so, allow landing on it regardless of previous position
      const wasJumpedThrough = platformsJumpedThrough.has(platform.id);

      // Treat platforms that were jumped through as if approaching from above
      const effectiveApproachingFromAbove = approachingFromAbove || wasJumpedThrough;

      // Check if player crossed the platform surface this frame (descending from above)
      const crossedThisFrame =
        descending &&
        effectiveApproachingFromAbove &&
        previousBounds.bottom <= platformBottomCollision + tolerance &&
        currentBounds.bottom >= platformBottomCollision - tolerance;

      // Check if player is resting on the platform (already on it, minimal velocity)
      const resting =
        Math.abs(currentBounds.bottom - platformBottomCollision) <= tolerance &&
        Math.abs(playerVelocity) < 0.8;

      // Return platform collision if any landing condition is met
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
   * Get platforms that player is currently passing through while ascending
   * Used to mark platforms as "jumped through" so player can land on them later
   *
   * @param currentBounds Player bounds this frame
   * @param previousBounds Player bounds last frame
   * @param playerVelocity Player's vertical velocity
   * @returns Array of platform IDs being passed through or overlapping
   */
  getPlatformsPassedThrough(
    currentBounds: PlayerBounds,
    previousBounds: PlayerBounds,
    playerVelocity: number
  ): number[] {
    const platformsPassed: number[] = [];

    // Only detect when ascending (moving upward with negative velocity)
    if (playerVelocity >= 0) return platformsPassed;

    const playerHeight = currentBounds.bottom - currentBounds.top;
    const tolerance = Math.max(2, playerHeight * 0.05);

    // When jumping, mark ALL platforms above the player within a generous range
    // This ensures platforms are marked even when jumping from far below
    const DETECTION_RANGE = 800; // pixels - mark platforms up to this distance horizontally

    for (const platform of this.platforms) {
      if (!platform.active) continue;

      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;
      const platformCenterX = platformLeft + (platformRight - platformLeft) / 2;
      const playerCenterX = (currentBounds.left + currentBounds.right) / 2;

      // Check if platform is within detection range horizontally
      const horizontalDistance = Math.abs(platformCenterX - playerCenterX);
      const withinRange = horizontalDistance < DETECTION_RANGE;

      // Also check if there's current horizontal overlap
      const horizontalOverlap = !(
        currentBounds.right < platformLeft ||
        currentBounds.left > platformRight
      );

      // Skip if platform is too far away horizontally
      if (!withinRange && !horizontalOverlap) continue;

      // Mark platform if ANY of these conditions are true while ascending:

      // Case 1: Player is currently below the platform and moving upward toward it
      // This catches jumping from far below - mark it immediately so it's ready when we reach it
      const isBelowAndAscending = currentBounds.top > platform.surfaceY;

      // Case 2: Player passed through the platform surface this frame
      const wasBelow = previousBounds.top > platform.surfaceY;
      const isNowAbove = currentBounds.bottom <= platform.surfaceY + playerHeight;
      const crossedThisFrame = wasBelow && isNowAbove;

      // Case 3: Player is jumping while already at platform level (overlapping vertically)
      const verticallyOverlapping =
        currentBounds.top <= platform.surfaceY + tolerance &&
        currentBounds.bottom >= platform.surfaceY - tolerance;

      if (isBelowAndAscending || crossedThisFrame || verticallyOverlapping) {
        platformsPassed.push(platform.id);
      }
    }

    return platformsPassed;
  }

  /**
   * Get all platform IDs that are currently above the player
   * Used to mark platforms when player jumps in the air
   *
   * @param playerTop Top Y position of player
   * @returns Array of platform IDs above the player
   */
  getPlatformsAbovePlayer(playerTop: number): number[] {
    const platformsAbove: number[] = [];

    for (const platform of this.platforms) {
      if (!platform.active) continue;

      // Platform is above player if its surface Y is less than player's top
      if (platform.surfaceY < playerTop) {
        platformsAbove.push(platform.id);
      }
    }

    return platformsAbove;
  }

  /**
   * Trigger landing compression on a platform
   * @param platformId Platform ID to compress
   * @param fallHeight Distance player fell from highest point (positive = fell down)
   */
  triggerLandingCompression(platformId: number, fallHeight: number = 0): void {
    const platform = this.platforms.find(p => p.id === platformId && p.active);
    if (!platform) return;

    // Calculate compression amount based on fall height (distance from peak to landing)
    // Short falls (jumping up to platform): 8-10 pixels
    // Medium falls (normal jumps): 12-16 pixels
    // Long falls (falling down to platform): 18-22 pixels
    const MIN_COMPRESSION = 8;   // Gentle landing (short fall)
    const MAX_COMPRESSION = 22;  // Hard landing (long fall)

    // Define fall height thresholds
    const SHORT_FALL = 50;   // 0-50px fall = minimal compression
    const LONG_FALL = 300;   // 300+ px fall = maximum compression

    // Calculate compression based on fall height with smooth curve
    let compressionFactor: number;
    if (fallHeight <= SHORT_FALL) {
      // Short falls: 0-50px → 0.0-0.2 factor (gentle compression)
      compressionFactor = (fallHeight / SHORT_FALL) * 0.2;
    } else if (fallHeight >= LONG_FALL) {
      // Long falls: 300+ px → 1.0 factor (max compression)
      compressionFactor = 1.0;
    } else {
      // Medium falls: 50-300px → 0.2-1.0 factor (interpolated)
      const range = LONG_FALL - SHORT_FALL;
      const progress = (fallHeight - SHORT_FALL) / range;
      compressionFactor = 0.2 + (progress * 0.8); // Lerp from 0.2 to 1.0
    }

    platform.compressionAmount = MIN_COMPRESSION + (MAX_COMPRESSION - MIN_COMPRESSION) * compressionFactor;

    console.log(`[COMPRESSION] Fall height: ${fallHeight.toFixed(1)}px → Compression: ${platform.compressionAmount.toFixed(1)}px (factor: ${compressionFactor.toFixed(2)})`);

    // Start compression animation from the beginning
    platform.compressionProgress = 0.001; // Small value > 0 to start animation
    platform.compressionOffset = 0;
  }

  /**
   * Reset all platforms (deactivate)
   */
  reset(): void {
    this.platforms.forEach(p => {
      p.active = false;
    });
    this.elapsedTime = 0; // Reset oscillation time
  }

  /**
   * Get the loaded image dimensions for a platform type (null if not loaded yet)
   */
  getImageDimensions(type: PlatformType): { width: number; height: number } | null {
    const image = this.images.get(type);
    const loaded = this.imagesLoaded.get(type);
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
  getDebugHitboxes(playerDiameter: number): Array<{ id: number; type: PlatformType; left: number; top: number; width: number; height: number }> {
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
      baseX: 0,
      surfaceY: 0,
      renderY: 0,
      width: 0,
      height: 0,
      imageWidth: 0,
      imageHeight: 0,
      active: false,
      platformType: 'large',
      baseSurfaceY: 0,
      baseRenderY: 0,
      oscillationPhase: 0,
      oscillationSpeed: 0,
      oscillationAmplitudeY: 0,
      oscillationAmplitudeX: 0,
      shouldOscillate: false,
      isGapMover: false,
      gapMovePhase: 0,
      gapMoveSpeed: 0,
      gapMoveMaxLeft: 0,
      gapMoveMaxRight: 0,
      compressionOffset: 0,
      compressionProgress: 0,
      compressionAmount: 0,
    };
    this.platforms.push(platform);
    return platform;
  }
}
