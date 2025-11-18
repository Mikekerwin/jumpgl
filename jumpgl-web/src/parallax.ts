import { Assets, Container, Sprite, Texture } from 'pixi.js';

export type SegmentType = 'cloud' | 'transition' | 'forest';

const FRAMES_PER_SECOND = 60;
const CLOUD_BACKGROUND_SPEED = 0.5 * FRAMES_PER_SECOND; // ~30 px/sec
const FOREST_BACKGROUND_MULTIPLIER = 1.05;
const GROUND_SCROLL_SPEED = 1.0 * FRAMES_PER_SECOND; // 60 px/sec
const TRANSITION_SPEED_MULTIPLIER = 1.15;
const GROUND_SURFACE_RATIO = 0.9; // near bottom
const GROUND_HEIGHT_RATIO = 0.35;

interface SegmentTextures {
  cloud: Texture;
  transition: Texture;
  forest: Texture;
}

class SegmentScroller {
  private container: Container;
  private textures: SegmentTextures;
  private speed: number;
  private transitionSpeed: number;
  private viewportWidth: number;
  private segmentHeight: number;
  private offsetY: number;
  private segments: Array<{ sprite: Sprite; width: number; type: SegmentType }> = [];
  private pendingQueue: SegmentType[] = [];
  private mode: 'cloud' | 'transition' | 'forest' = 'cloud';
  private maxSegmentWidth = 0;

  constructor(
    parent: Container,
    textures: SegmentTextures,
    viewportWidth: number,
    segmentHeight: number,
    offsetY: number,
    speed: number,
    transitionSpeed: number
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.speed = speed;
    this.transitionSpeed = transitionSpeed;
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
      const next = this.createSegment(this.getNextType(), cursor);
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

  private getNextType(): SegmentType {
    if (this.pendingQueue.length > 0) {
      return this.pendingQueue.shift()!;
    }
    if (this.mode === 'forest') {
      return 'forest';
    }
    return 'cloud';
  }

  update(deltaSeconds: number): void {
    if (this.segments.length === 0) {
      this.buildInitialSegments();
    }

    const scrollSpeed = this.mode === 'transition' ? this.transitionSpeed : this.speed;
    this.segments.forEach(({ sprite }) => {
      sprite.x -= scrollSpeed * deltaSeconds;
    });

    while (this.segments.length && this.segments[0].sprite.x + this.segments[0].width <= 0) {
      const removed = this.segments.shift();
      removed?.sprite.destroy();
    }

    let cursor = this.segments.length
      ? this.segments[this.segments.length - 1].sprite.x + this.segments[this.segments.length - 1].width
      : 0;
    const coverTarget = this.viewportWidth + this.maxSegmentWidth * 1.5;
    while (cursor < coverTarget) {
      const next = this.createSegment(this.getNextType(), cursor);
      cursor += next.width;
    }

    if (this.mode === 'transition' && this.pendingQueue.length === 0) {
      const transitionOnScreen = this.segments.some((segment) => segment.type === 'transition');
      if (!transitionOnScreen) {
        this.mode = 'forest';
      }
    }
  }

  resize(viewportWidth: number, segmentHeight: number, offsetY: number): void {
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    this.buildInitialSegments();
  }

  triggerTransition(): void {
    if (this.mode !== 'cloud' || this.pendingQueue.length > 0) return;
    this.pendingQueue.push('transition', 'forest');
    this.mode = 'transition';
  }
}

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
      forestTrees: 'forest_light_trees.webp',
      forestTransition: 'forestTransition.webp',
      cloudGround: 'cloud_light_ground.webp',
      transitionGround: 'cloud_light_ground_forest_transition.webp',
      forestGround: 'forest_light_ground.webp',
    });
    bundleRegistered = true;
  }
  return Assets.loadBundle('jump-parallax') as Promise<ParallaxTextures>;
};

export class ParallaxBackgrounds {
  private scroller: SegmentScroller;

  constructor(parent: Container, textures: ParallaxTextures, width: number, height: number) {
    this.scroller = new SegmentScroller(
      parent,
      {
        cloud: textures.cloudSky,
        transition: textures.forestTransition,
        forest: textures.forestTrees,
      },
      width,
      height,
      0,
      CLOUD_BACKGROUND_SPEED,
      CLOUD_BACKGROUND_SPEED * FOREST_BACKGROUND_MULTIPLIER
    );
  }

  update(deltaSeconds: number): void {
    this.scroller.update(deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.scroller.resize(width, height, 0);
  }

  triggerForestTransition(): void {
    this.scroller.triggerTransition();
  }
}

export class ParallaxGrounds {
  private scroller: SegmentScroller;
  private surfaceY: number;
  private groundHeight: number;

  constructor(parent: Container, textures: ParallaxTextures, width: number, height: number) {
    this.surfaceY = height * GROUND_SURFACE_RATIO;
    this.groundHeight = Math.max(140, height * GROUND_HEIGHT_RATIO);
    const offsetY = this.surfaceY - this.groundHeight;
    this.scroller = new SegmentScroller(
      parent,
      {
        cloud: textures.cloudGround,
        transition: textures.transitionGround,
        forest: textures.forestGround,
      },
      width,
      this.groundHeight,
      offsetY,
      GROUND_SCROLL_SPEED,
      GROUND_SCROLL_SPEED * TRANSITION_SPEED_MULTIPLIER
    );
  }

  update(deltaSeconds: number): void {
    this.scroller.update(deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.surfaceY = height * GROUND_SURFACE_RATIO;
    this.groundHeight = Math.max(140, height * GROUND_HEIGHT_RATIO);
    const offsetY = this.surfaceY - this.groundHeight;
    this.scroller.resize(width, this.groundHeight, offsetY);
  }

  triggerForestTransition(): void {
    this.scroller.triggerTransition();
  }

  getSurfaceY(): number {
    return this.surfaceY;
  }
}
