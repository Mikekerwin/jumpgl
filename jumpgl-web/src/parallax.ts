import { Assets, Container, Sprite, Texture, TilingSprite } from 'pixi.js';

export type SegmentType = 'cloud' | 'transition' | 'forest';

const FRAMES_PER_SECOND = 60;
const CLOUD_BACKGROUND_SPEED = 0.5 * FRAMES_PER_SECOND; // ~30 px/sec
const FOREST_BACKGROUND_MULTIPLIER = 1.05;
const GROUND_SCROLL_SPEED = 1.0 * FRAMES_PER_SECOND; // 60 px/sec
const TRANSITION_SPEED_MULTIPLIER = 1.15;
const GROUND_HEIGHT_RATIO = 0.35;

interface SegmentTextures {
  cloud: Texture;
  transition: Texture;
  forest: Texture;
}

class SegmentScroller {
  private container: Container;
  private textures: SegmentTextures;
  private speedByMode: Record<SegmentType, number>;
  private viewportWidth: number;
  private segmentHeight: number;
  private offsetY: number;
  private segments: Array<{ sprite: Sprite; width: number; type: SegmentType }> = [];
  private pendingQueue: SegmentType[] = [];
  private mode: SegmentType = 'cloud';
  private maxSegmentWidth = 0;

  constructor(
    parent: Container,
    textures: SegmentTextures,
    viewportWidth: number,
    segmentHeight: number,
    offsetY: number,
    speedByMode: Record<SegmentType, number>
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.speedByMode = speedByMode;
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    this.buildInitialSegments();
  }

  private rebuildWithType(type: SegmentType, startX: number = 0): void {
    this.segments.forEach(({ sprite }) => sprite.destroy());
    this.segments = [];
    this.maxSegmentWidth = 0;
    let cursor = startX;
    const coverTarget = startX + this.viewportWidth + Math.abs(startX) + 200;
    while (cursor < coverTarget) {
      const next = this.createSegment(type, cursor);
      cursor += next.width;
    }
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

    const scrollSpeed = this.speedByMode[this.mode];
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
    const coverTarget = this.viewportWidth + this.maxSegmentWidth * 1.2;
    while (cursor < coverTarget) {
      const next = this.createSegment(this.getNextType(), cursor);
      cursor += next.width;
    }

    if (this.mode === 'transition' && this.pendingQueue.length === 0) {
      const transitionOnScreen = this.segments.some((segment) => segment.type === 'transition');
      if (!transitionOnScreen) {
        const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
        this.mode = 'forest';
        this.pendingQueue = [];
        this.rebuildWithType('forest', firstX);
      }
    }
  }

  resize(viewportWidth: number, segmentHeight: number, offsetY: number): void {
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
    if (this.mode === 'forest') {
      this.rebuildWithType('forest', firstX);
    } else {
      this.buildInitialSegments();
    }
  }

  triggerTransition(): void {
    if (this.mode !== 'cloud' || this.pendingQueue.length > 0) return;
    this.mode = 'transition';
    this.pendingQueue.push('transition', 'forest');
    this.trimFutureSegments();
    this.appendPendingSegments();
  }

  private trimFutureSegments(): void {
    const futureThreshold = this.viewportWidth;
    const kept: typeof this.segments = [];
    this.segments.forEach((segment) => {
      if (segment.sprite.x < futureThreshold) {
        kept.push(segment);
      } else {
        segment.sprite.destroy();
      }
    });
    if (kept.length === 0) {
      const fallbackType = this.mode === 'forest' ? 'forest' : 'cloud';
      kept.push(this.createSegment(fallbackType, 0));
    }
    this.segments = kept;
  }

  private appendPendingSegments(): void {
    let cursor = this.segments[this.segments.length - 1].sprite.x + this.segments[this.segments.length - 1].width;
    while (this.pendingQueue.length) {
      const nextType = this.pendingQueue.shift()!;
      const seg = this.createSegment(nextType, cursor);
      cursor += seg.width;
    }
  }

}

const createFittedSprite = (texture: Texture, width: number, height: number): Sprite => {
  const sprite = new Sprite(texture);
  const texWidth = texture.width || 1;
  const texHeight = texture.height || 1;
  const scale = Math.max(width / texWidth, height / texHeight);
  sprite.scale.set(scale);
  sprite.x = 0;
  sprite.y = 0;
  sprite.width = texWidth * scale;
  sprite.height = texHeight * scale;
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
  private container: Container;
  private cloudSprite: Sprite;
  private transitionGroup: Container | null = null;
  private forestLoop: TilingSprite | null = null;
  private textures: ParallaxTextures;
  private state: 'cloud' | 'transition' | 'forest' = 'cloud';
  private viewportWidth: number;
  private viewportHeight: number;
  private onForestVisible?: () => void;

  constructor(
    parent: Container,
    textures: ParallaxTextures,
    width: number,
    height: number,
    onForestVisible?: () => void
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.cloudSprite = createFittedSprite(textures.cloudSky, width, height);
    this.onForestVisible = onForestVisible;
    this.container.addChild(this.cloudSprite);
  }

  update(deltaSeconds: number): void {
    if (this.state === 'transition' && this.transitionGroup) {
      this.transitionGroup.x -= CLOUD_BACKGROUND_SPEED * deltaSeconds;
      const transitionSprite = this.transitionGroup.children[0] as Sprite;
      const forestSprite = this.transitionGroup.children[1] as Sprite;
      const transitionRight = this.transitionGroup.x + (transitionSprite?.width || 0);
      const forestRight =
        this.transitionGroup.x + (transitionSprite?.width || 0) + (forestSprite?.width || 0);

      if (transitionRight <= 0 && this.container.children.includes(this.cloudSprite)) {
        this.container.removeChild(this.cloudSprite);
      }

      if (forestRight <= this.viewportWidth) {
        this.startForestLoop();
      }
    } else if (this.state === 'forest' && this.forestLoop) {
      this.forestLoop.tilePosition.x -=
        CLOUD_BACKGROUND_SPEED * FOREST_BACKGROUND_MULTIPLIER * deltaSeconds;
    }
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.cloudSprite.texture = this.textures.cloudSky;
    const newCloud = createFittedSprite(this.textures.cloudSky, width, height);
    this.container.removeChild(this.cloudSprite);
    this.cloudSprite.destroy();
    this.cloudSprite = newCloud;
    if (this.state === 'cloud') {
      this.container.addChild(this.cloudSprite);
    }

    if (this.transitionGroup) {
      const transitionSprite = createFittedSprite(this.textures.forestTransition, width, height);
      const forestSprite = createFittedSprite(this.textures.forestTrees, width, height);
      forestSprite.x = transitionSprite.width;
      this.transitionGroup.removeChildren();
      this.transitionGroup.addChild(transitionSprite, forestSprite);
      this.transitionGroup.x = Math.min(this.transitionGroup.x, width);
    }

    if (this.forestLoop) {
      this.forestLoop.destroy();
      this.forestLoop = null;
      this.startForestLoop();
    }
  }

  triggerForestTransition(): void {
    if (this.state !== 'cloud' || this.transitionGroup) return;
    this.state = 'transition';
    const group = new Container();
    const transitionSprite = createFittedSprite(
      this.textures.forestTransition,
      this.viewportWidth,
      this.viewportHeight
    );
    const forestSprite = createFittedSprite(
      this.textures.forestTrees,
      this.viewportWidth,
      this.viewportHeight
    );
    forestSprite.x = transitionSprite.width;
    group.addChild(transitionSprite, forestSprite);
    group.x = Math.max(0, this.viewportWidth - transitionSprite.width * 0.2);
    this.transitionGroup = group;
    this.container.addChild(group);
  }

  private startForestLoop(): void {
    if (this.forestLoop) return;
    this.state = 'forest';
    if (this.transitionGroup) {
      this.transitionGroup.destroy({ children: true });
      this.transitionGroup = null;
    }
    this.forestLoop = new TilingSprite({
      texture: this.textures.forestTrees,
      width: this.viewportWidth,
      height: this.viewportHeight,
    });
    const scale = this.viewportHeight / (this.textures.forestTrees.height || 1);
    this.forestLoop.tileScale.set(scale);
    this.forestLoop.tilePosition.set(0, 0);
    this.container.addChild(this.forestLoop);
    this.onForestVisible?.();
  }
}

export class ParallaxGrounds {
  private scroller: SegmentScroller;
  private groundTop: number;
  private groundHeight: number;

  constructor(parent: Container, textures: ParallaxTextures, width: number, height: number) {
    this.groundHeight = Math.max(140, height * GROUND_HEIGHT_RATIO);
    this.groundTop = height - this.groundHeight;
    this.scroller = new SegmentScroller(
      parent,
      {
        cloud: textures.cloudGround,
        transition: textures.transitionGround,
        forest: textures.forestGround,
      },
      width,
      this.groundHeight,
      this.groundTop,
      {
        cloud: GROUND_SCROLL_SPEED,
        transition: GROUND_SCROLL_SPEED * TRANSITION_SPEED_MULTIPLIER,
        forest: GROUND_SCROLL_SPEED,
      }
    );
  }

  update(deltaSeconds: number): void {
    this.scroller.update(deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.groundHeight = Math.max(140, height * GROUND_HEIGHT_RATIO);
    this.groundTop = height - this.groundHeight;
    this.scroller.resize(width, this.groundHeight, this.groundTop);
  }

  triggerForestTransition(): void {
    this.scroller.triggerTransition();
  }

  getSurfaceY(): number {
    return this.groundTop;
  }
}
