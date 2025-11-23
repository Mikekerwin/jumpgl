import { Assets, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { calculateResponsiveSizes } from './config';
import { BiomeSequenceManager, BIOME_CONFIGS } from './biomeSystem';
import type { BiomeType } from './biomeSystem';

const FRAMES_PER_SECOND = 60;
const SPEED_MULTIPLIER = 1.2; // 20% faster overall
const BASE_GROUND_SCROLL_SPEED = 1.0 * FRAMES_PER_SECOND * SPEED_MULTIPLIER; // 72 px/sec
const BASE_BACKGROUND_SPEED = 0.5 * FRAMES_PER_SECOND * SPEED_MULTIPLIER; // ~36 px/sec
const TRANSITION_SPEED_MULTIPLIER = 1.15;

/**
 * Segment types: biome segments that repeat, or transition segments between biomes
 */
type SegmentType = BiomeType | 'transition';

interface SegmentTextures {
  [key: string]: Texture; // Dynamic based on loaded biomes
}

/**
 * Improved SegmentScroller with biome system integration
 * Fixes the cloud-flashing bug by using BiomeSequenceManager for state
 */
class SegmentScroller {
  private container: Container;
  private textures: SegmentTextures;
  private biomeManager: BiomeSequenceManager;
  private viewportWidth: number;
  private segmentHeight: number;
  private offsetY: number;
  private segments: Array<{ sprite: Sprite; width: number; type: SegmentType }> = [];
  private pendingSegments: SegmentType[] = [];
  private maxSegmentWidth = 0;

  constructor(
    parent: Container,
    textures: SegmentTextures,
    biomeManager: BiomeSequenceManager,
    viewportWidth: number,
    segmentHeight: number,
    offsetY: number
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.biomeManager = biomeManager;
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    this.buildInitialSegments();
  }

  private buildInitialSegments(): void {
    this.segments.forEach(({ sprite }) => sprite.destroy());
    this.segments = [];
    this.maxSegmentWidth = 0;
    let cursor = 0;
    while (cursor < this.viewportWidth * 2) {
      const next = this.createSegment(this.getNextSegmentType(), cursor);
      cursor += next.width;
    }
  }

  private createSegment(type: SegmentType, x: number): { sprite: Sprite; width: number; type: SegmentType } {
    const sprite = new Sprite(this.textures[type]);
    const textureHeight = sprite.texture.height || 1;
    const scale = this.segmentHeight / textureHeight;
    sprite.scale.set(scale);
    sprite.x = x;
    sprite.y = this.offsetY;
    this.container.addChild(sprite);
    const width = (sprite.texture.width || 1) * scale;
    this.maxSegmentWidth = Math.max(this.maxSegmentWidth, width);
    const segment = { sprite, width, type };
    this.segments.push(segment);
    return segment;
  }

  /**
   * Get next segment type - either from pending queue or current biome
   * During transition, returns next biome after pending queue is empty
   */
  private getNextSegmentType(): SegmentType {
    // First priority: pending segments from transition queue
    if (this.pendingSegments.length > 0) {
      return this.pendingSegments.shift()!;
    }

    // Second priority: if in transition, return next biome (not current!)
    if (this.biomeManager.isInTransition()) {
      const nextBiome = this.biomeManager.getNextBiome();
      if (nextBiome) {
        return nextBiome;
      }
    }

    // Third priority: use current biome from manager
    const currentBiome = this.biomeManager.getCurrentBiome();
    return currentBiome;
  }

  /**
   * Get scroll speed for current state
   */
  private getCurrentScrollSpeed(): number {
    const currentBiome = this.biomeManager.getCurrentBiome();
    const config = BIOME_CONFIGS[currentBiome];
    const baseSpeed = BASE_GROUND_SCROLL_SPEED * config.scrollSpeed;

    // Speed up during transition
    if (this.biomeManager.isInTransition()) {
      return baseSpeed * TRANSITION_SPEED_MULTIPLIER;
    }

    return baseSpeed;
  }

  update(deltaSeconds: number, speedMultiplier: number = 1): void {
    if (this.segments.length === 0) {
      this.buildInitialSegments();
    }

    const scrollSpeed = this.getCurrentScrollSpeed() * speedMultiplier;
    this.segments.forEach(({ sprite }) => {
      sprite.x -= scrollSpeed * deltaSeconds;
    });

    // Remove segments that scrolled off-screen
    while (this.segments.length && this.segments[0].sprite.x + this.segments[0].width <= 0) {
      const removed = this.segments.shift();
      removed?.sprite.destroy();
    }

    // Add new segments to fill screen
    let cursor = this.segments.length
      ? this.segments[this.segments.length - 1].sprite.x + this.segments[this.segments.length - 1].width
      : 0;
    const coverTarget = this.viewportWidth + this.maxSegmentWidth * 1.2;
    while (cursor < coverTarget) {
      const next = this.createSegment(this.getNextSegmentType(), cursor);
      cursor += next.width;
    }

    // Check if transition is complete (no more transition segments visible)
    if (this.biomeManager.isInTransition() && this.pendingSegments.length === 0) {
      const hasTransitionSegment = this.segments.some((seg) => seg.type === 'transition');
      if (!hasTransitionSegment) {
        // Transition complete! Update biome manager
        this.biomeManager.completeTransition();
        // Rebuild all segments with new biome to ensure clean state
        const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
        this.rebuildWithBiome(this.biomeManager.getCurrentBiome(), firstX);
        // Skip rest of update this frame - segments are rebuilt fresh
        return;
      }
    }
  }

  /**
   * Rebuild all segments with a specific biome
   * Ensures consistent state without cloud-flashing bug
   */
  private rebuildWithBiome(biome: BiomeType, startX: number = 0): void {
    this.segments.forEach(({ sprite }) => sprite.destroy());
    this.segments = [];
    this.maxSegmentWidth = 0;
    this.pendingSegments = []; // Clear any pending

    let cursor = startX;
    const coverTarget = startX + this.viewportWidth + Math.abs(startX) + 200;
    while (cursor < coverTarget) {
      const next = this.createSegment(biome, cursor);
      cursor += next.width;
    }
  }

  resize(viewportWidth: number, segmentHeight: number, offsetY: number): void {
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
    // Rebuild with current biome (preserves state during resize)
    this.rebuildWithBiome(this.biomeManager.getCurrentBiome(), firstX);
  }

  /**
   * Trigger transition to next biome
   * Immediately appends transition segment to current segments
   */
  triggerTransition(): boolean {
    if (!this.biomeManager.startTransition()) {
      return false; // Already transitioning or no next biome
    }

    const nextBiome = this.biomeManager.getNextBiome();
    if (!nextBiome) {
      return false;
    }

    // Remove ALL off-screen segments
    this.trimFutureSegments();

    // Find the last segment that's actually visible
    // We want to append transition RIGHT after the last visible segment
    let lastVisibleSegment = null;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i].sprite.x < this.viewportWidth) {
        lastVisibleSegment = this.segments[i];
        break;
      }
    }

    // Calculate cursor position - right after last visible segment
    let cursor = lastVisibleSegment
      ? lastVisibleSegment.sprite.x + lastVisibleSegment.width
      : 0;

    // Create transition segment immediately
    this.createSegment('transition', cursor);
    cursor += this.segments[this.segments.length - 1].width;

    // Create first forest segment immediately
    this.createSegment(nextBiome, cursor);

    // Note: After this, getNextSegmentType() will return nextBiome during transition
    // so forest will continue repeating

    return true;
  }

  /**
   * Remove segments that are beyond the last visible segment
   * When transitioning, we only keep segments currently on screen
   */
  private trimFutureSegments(): void {
    // Find the last segment that's currently visible on screen
    // Keep everything that's on screen, remove everything else
    const kept: typeof this.segments = [];
    for (const segment of this.segments) {
      // Keep if any part is visible (x < viewport width)
      if (segment.sprite.x < this.viewportWidth) {
        kept.push(segment);
      } else {
        segment.sprite.destroy();
      }
    }

    if (kept.length === 0) {
      // Fallback: ensure at least one segment
      kept.push(this.createSegment(this.biomeManager.getCurrentBiome(), 0));
    }

    this.segments = kept;
  }
}

const createFittedSprite = (texture: Texture, width: number, height: number): Sprite => {
  const sprite = new Sprite(texture);
  const texWidth = texture.width || 1;
  const texHeight = texture.height || 1;
  // Scale to fit width, keep aspect, anchor bottom
  const scale = width / texWidth;
  const scaledHeight = texHeight * scale;
  sprite.scale.set(scale);
  sprite.x = 0;
  sprite.y = height - scaledHeight;
  sprite.width = texWidth * scale;
  sprite.height = scaledHeight;
  return sprite;
};

export type ParallaxTextures = {
  cloudSky: Texture;
  forestTrees: Texture;
  forestTransition: Texture;
  cloudGround: Texture;
  transitionGround: Texture;
  forestGround: Texture;
};

let bundleRegistered = false;

export const loadParallaxTextures = async (): Promise<ParallaxTextures> => {
  if (!bundleRegistered) {
    Assets.addBundle('jump-parallax', {
      cloudSky: 'cloud_light_sky.webp',
      forestTrees: 'RepeatTreeLineWithTop.webp',
      forestTransition: 'TransitionTreeLineWithTop.webp',
      cloudGround: 'cloud_light_ground.webp',
      transitionGround: 'cloud_light_ground_forest_transition.webp',
      forestGround: 'forest_light_ground.webp',
    });
    bundleRegistered = true;
  }
  return Assets.loadBundle('jump-parallax') as Promise<ParallaxTextures>;
};

/**
 * Improved ParallaxBackgrounds with biome system
 */
export class ParallaxBackgrounds {
  private container: Container;
  private biomeManager: BiomeSequenceManager;
  private currentBackground: TilingSprite | null = null;
  private transitionGroup: Container | null = null;
  private textures: ParallaxTextures;
  private viewportWidth: number;
  private viewportHeight: number;
  private onBiomeChange?: (biome: BiomeType) => void;

  constructor(
    parent: Container,
    textures: ParallaxTextures,
    biomeManager: BiomeSequenceManager,
    width: number,
    height: number,
    onBiomeChange?: (biome: BiomeType) => void
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.biomeManager = biomeManager;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.onBiomeChange = onBiomeChange;
    this.setupBackground(this.biomeManager.getCurrentBiome());
  }

  private setupBackground(_biome: BiomeType): void {
    if (this.currentBackground) {
      this.currentBackground.destroy();
    }
    // Always keep cloud sky as the backdrop, even in forest biome
    const texture = this.textures.cloudSky;
    const isCloudSky = true;
    const heightMultiplier = isCloudSky ? 1.5 : 1;
    const baseHeight = this.viewportHeight * heightMultiplier;
    const baseScale = isCloudSky ? baseHeight / (texture.height || 1) : this.viewportWidth / (texture.width || 1);
    const backgroundHeight = isCloudSky ? baseHeight : (texture.height || 1) * baseScale;

    this.currentBackground = new TilingSprite({
      texture,
      width: this.viewportWidth,
      height: backgroundHeight,
    });

    this.currentBackground.tileScale.set(baseScale);
    this.currentBackground.tilePosition.set(0, 0);

    // Anchor at bottom: move up by any extra height so the bottom stays near the screen bottom
    const extraHeight = Math.max(0, backgroundHeight - this.viewportHeight);
    this.currentBackground.y = -extraHeight;

    this.container.addChildAt(this.currentBackground, 0);
  }

  getRoot(): Container {
    return this.container;
  }

  update(deltaSeconds: number, speedMultiplier: number = 1): void {
    const currentBiome = this.biomeManager.getCurrentBiome();
    const config = BIOME_CONFIGS[currentBiome];
    const scrollSpeed = BASE_BACKGROUND_SPEED * config.backgroundSpeedMultiplier * speedMultiplier;

    // During transition, only scroll the transition group (not the background)
    // OR if transition group exists (even if biome switched)
    if (this.transitionGroup) {
      // Scroll transition group
      this.transitionGroup.x -= scrollSpeed * deltaSeconds;

      // Check if transition is done scrolling
      const transitionSprite = this.transitionGroup.children[0] as Sprite;
      const transitionRight = this.transitionGroup.x + (transitionSprite?.width || 0);

      if (transitionRight <= 0) {
        // Transition visual complete, switch to current biome (not next!)
        // Because ground already completed transition and updated biome manager
        const currentBiome = this.biomeManager.getCurrentBiome();
        this.setupBackground(currentBiome);
        this.onBiomeChange?.(currentBiome);

        this.transitionGroup.destroy({ children: true });
        this.transitionGroup = null;
      }
    } else {
      // Not in transition - scroll the current background (if not cloud)
      // Cloud sky is static (doesn't scroll), forest scrolls
      if (currentBiome !== 'cloud' && this.currentBackground) {
        this.currentBackground.tilePosition.x -= scrollSpeed * deltaSeconds;
      }
    }
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;

    if (this.currentBackground) {
      const texture = this.currentBackground.texture;
      const isCloudSky = BIOME_CONFIGS[this.biomeManager.getCurrentBiome()].backgroundTexture === 'cloudSky';
      const heightMultiplier = isCloudSky ? 1.5 : 1;
      const baseHeight = height * heightMultiplier;
      const baseScale = isCloudSky ? baseHeight / (texture.height || 1) : width / (texture.width || 1);
      const backgroundHeight = isCloudSky ? baseHeight : (texture.height || 1) * baseScale;
      this.currentBackground.width = width;
      this.currentBackground.height = backgroundHeight;
      this.currentBackground.tileScale.set(baseScale);
      const extraHeight = Math.max(0, backgroundHeight - height);
      this.currentBackground.y = -extraHeight;
    }

    if (this.transitionGroup) {
      const transitionSprite = createFittedSprite(this.textures.forestTransition, width, height);
      const forestSprite = createFittedSprite(this.textures.forestTrees, width, height);
      forestSprite.x = transitionSprite.width;
      this.transitionGroup.removeChildren();
      this.transitionGroup.addChild(transitionSprite, forestSprite);
      this.transitionGroup.x = Math.min(this.transitionGroup.x, width);
    }
  }

  /**
   * Trigger visual transition for background
   * Starts immediately at right edge of viewport
   */
  triggerTransition(): boolean {
    if (this.biomeManager.isInTransition() && !this.transitionGroup) {
      const nextBiome = this.biomeManager.getNextBiome();
      if (!nextBiome) return false;

      // Create transition visual (only for cloud→forest for now)
      // TODO: Make this dynamic based on biome transitions
      const group = new Container();
      const transitionSprite = createFittedSprite(
        this.textures.forestTransition,
        this.viewportWidth,
        this.viewportHeight
      );
      const nextBgTexture = this.textures.cloudSky;
      const nextSprite = createFittedSprite(nextBgTexture, this.viewportWidth, this.viewportHeight);
      nextSprite.x = transitionSprite.width;
      group.addChild(transitionSprite, nextSprite);
      // Start immediately at right edge of viewport (x = viewportWidth)
      group.x = this.viewportWidth;
      this.transitionGroup = group;
      this.container.addChild(group);
      return true;
    }
    return false;
  }

  /**
   * Get transition progress (0 = not started, 1 = complete)
   */
  getTransitionProgress(): number {
    if (!this.biomeManager.isInTransition()) return 0;
    if (!this.transitionGroup) return 0;
    const transitionSprite = this.transitionGroup.children[0] as Sprite | undefined;
    if (!transitionSprite) return 0;
    const traveled = this.viewportWidth - this.transitionGroup.x;
    const totalWidth = transitionSprite.width;
    return Math.min(1, Math.max(0, traveled / totalWidth));
  }
}

/**
 * Improved ParallaxGrounds with biome system
 */
export class ParallaxGrounds {
  private scroller: SegmentScroller;
  private groundTop: number;
  private groundHeight: number;

  constructor(
    parent: Container,
    textures: ParallaxTextures,
    biomeManager: BiomeSequenceManager,
    width: number,
    height: number
  ) {
    const sizes = calculateResponsiveSizes(height);
    this.groundHeight = sizes.groundHeight;
    this.groundTop = height - this.groundHeight;

    // Map biome ground textures to segment types
    const segmentTextures: SegmentTextures = {
      cloud: textures.cloudGround,
      forest: textures.forestGround,
      transition: textures.transitionGround,
    };

    this.scroller = new SegmentScroller(
      parent,
      segmentTextures,
      biomeManager,
      width,
      this.groundHeight,
      this.groundTop
    );
  }

  update(deltaSeconds: number, speedMultiplier: number = 1): void {
    this.scroller.update(deltaSeconds, speedMultiplier);
  }

  resize(width: number, height: number): void {
    const sizes = calculateResponsiveSizes(height);
    this.groundHeight = sizes.groundHeight;
    this.groundTop = height - this.groundHeight;
    this.scroller.resize(width, this.groundHeight, this.groundTop);
  }

  triggerTransition(): boolean {
    return this.scroller.triggerTransition();
  }

  getSurfaceY(): number {
    return this.groundTop;
  }
}
