import { Assets, Container, Sprite, Texture, TilingSprite } from 'pixi.js';

const FRAMES_PER_SECOND = 60;
const BACKGROUND_SCROLL_SPEED = 0.5 * FRAMES_PER_SECOND; // 30 px / second
const FOREST_SCROLL_MULTIPLIER = 1.1;
const GROUND_SCROLL_SPEED = 1 * FRAMES_PER_SECOND; // 60 px / second
const TRANSITION_SCROLL_SPEED = GROUND_SCROLL_SPEED * 1.15;
const GROUND_SURFACE_RATIO = 0.78;
const GROUND_HEIGHT_RATIO = 0.32;

class ScrollLayer {
  public sprite: TilingSprite;
  private texture: Texture;
  private speed: number;

  constructor(texture: Texture, width: number, height: number, y: number, speed: number) {
    this.texture = texture;
    this.sprite = new TilingSprite({ texture, width, height });
    this.speed = speed;
    this.resize(width, height, y);
  }

  resize(width: number, height: number, y: number): void {
    const scale = height / (this.texture.height || 1);
    this.sprite.tileScale.set(scale, scale);
    this.sprite.width = width;
    this.sprite.height = height;
    this.sprite.y = y;
  }

  update(deltaSeconds: number): void {
    this.sprite.tilePosition.x -= this.speed * deltaSeconds;
  }

  set alpha(value: number) {
    this.sprite.alpha = value;
  }

  get alpha(): number {
    return this.sprite.alpha;
  }

  set visible(value: boolean) {
    this.sprite.visible = value;
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
  private container: Container;
  private cloudLayer: ScrollLayer;
  private forestLayer: ScrollLayer;
  private transitionTexture: Texture;
  private transitionSprite: Sprite | null = null;
  private state: 'cloud' | 'transition' | 'forest' = 'cloud';
  private transitionTimer = 0;

  constructor(parent: Container, textures: ParallaxTextures, width: number, height: number) {
    this.container = new Container();
    parent.addChild(this.container);

    this.cloudLayer = new ScrollLayer(textures.cloudSky, width, height, 0, BACKGROUND_SCROLL_SPEED);
    this.forestLayer = new ScrollLayer(
      textures.forestTrees,
      width,
      height,
      0,
      BACKGROUND_SCROLL_SPEED * FOREST_SCROLL_MULTIPLIER
    );
    this.forestLayer.alpha = 0;
    this.transitionTexture = textures.forestTransition;

    this.container.addChild(this.cloudLayer.sprite, this.forestLayer.sprite);
  }

  update(deltaSeconds: number): void {
    this.cloudLayer.update(deltaSeconds);
    if (this.state !== 'cloud') {
      this.forestLayer.update(deltaSeconds);
    }

    if (this.state === 'transition' && this.transitionSprite) {
      this.transitionTimer += deltaSeconds;
      this.transitionSprite.x -= TRANSITION_SCROLL_SPEED * deltaSeconds;
      const fadeProgress = Math.min(1, this.transitionTimer / 3.2);
      this.cloudLayer.alpha = 1 - fadeProgress;
      this.forestLayer.alpha = fadeProgress;

      if (this.transitionSprite.x + this.transitionSprite.width <= 0) {
        this.container.removeChild(this.transitionSprite);
        this.transitionSprite.destroy();
        this.transitionSprite = null;
        this.state = 'forest';
        this.cloudLayer.alpha = 0;
        this.forestLayer.alpha = 1;
      }
    }
  }

  resize(width: number, height: number): void {
    this.cloudLayer.resize(width, height, 0);
    this.forestLayer.resize(width, height, 0);
    if (this.transitionSprite) {
      const scale = height / (this.transitionTexture.height || 1);
      this.transitionSprite.scale.set(scale);
      this.transitionSprite.y = 0;
      this.transitionSprite.x = Math.min(this.transitionSprite.x, width);
    }
  }

  triggerForestTransition(): void {
    if (this.state !== 'cloud' || this.transitionSprite) return;
    this.state = 'transition';
    this.transitionTimer = 0;
    const sprite = new Sprite(this.transitionTexture);
    const scale = this.cloudLayer.sprite.height / (this.transitionTexture.height || 1);
    sprite.scale.set(scale);
    sprite.y = 0;
    sprite.x = this.cloudLayer.sprite.width;
    this.transitionSprite = sprite;
    this.container.addChild(sprite);
  }
}

export class ParallaxGrounds {
  private container: Container;
  private cloudLayer: ScrollLayer;
  private forestLayer: ScrollLayer;
  private transitionTexture: Texture;
  private transitionSprite: Sprite | null = null;
  private state: 'cloud' | 'transition' | 'forest' = 'cloud';
  private surfaceY: number;
  private groundHeight: number;

  constructor(parent: Container, textures: ParallaxTextures, width: number, height: number) {
    this.container = new Container();
    parent.addChild(this.container);
    this.surfaceY = height * GROUND_SURFACE_RATIO;
    this.groundHeight = Math.max(120, height * GROUND_HEIGHT_RATIO);
    const groundY = this.surfaceY - this.groundHeight;

    this.cloudLayer = new ScrollLayer(textures.cloudGround, width, this.groundHeight, groundY, GROUND_SCROLL_SPEED);
    this.forestLayer = new ScrollLayer(textures.forestGround, width, this.groundHeight, groundY, GROUND_SCROLL_SPEED);
    this.forestLayer.visible = false;
    this.transitionTexture = textures.transitionGround;

    this.container.addChild(this.cloudLayer.sprite, this.forestLayer.sprite);
  }

  update(deltaSeconds: number): void {
    this.cloudLayer.update(deltaSeconds);
    if (this.state !== 'cloud') {
      this.forestLayer.update(deltaSeconds);
    }

    if (this.transitionSprite) {
      this.transitionSprite.x -= TRANSITION_SCROLL_SPEED * deltaSeconds;
      if (this.transitionSprite.x + this.transitionSprite.width <= 0) {
        this.container.removeChild(this.transitionSprite);
        this.transitionSprite.destroy();
        this.transitionSprite = null;
        this.state = 'forest';
        this.cloudLayer.visible = false;
        this.forestLayer.visible = true;
      }
    }
  }

  resize(width: number, height: number): void {
    this.surfaceY = height * GROUND_SURFACE_RATIO;
    this.groundHeight = Math.max(120, height * GROUND_HEIGHT_RATIO);
    const groundY = this.surfaceY - this.groundHeight;
    this.cloudLayer.resize(width, this.groundHeight, groundY);
    this.forestLayer.resize(width, this.groundHeight, groundY);
    if (this.transitionSprite) {
      const scale = this.groundHeight / (this.transitionTexture.height || 1);
      this.transitionSprite.scale.set(scale);
      this.transitionSprite.y = groundY;
    }
  }

  getSurfaceY(): number {
    return this.surfaceY;
  }

  triggerForestTransition(): void {
    if (this.state !== 'cloud' || this.transitionSprite) return;
    this.state = 'transition';
    this.forestLayer.visible = true;
    const sprite = new Sprite(this.transitionTexture);
    const scale = this.groundHeight / (this.transitionTexture.height || 1);
    sprite.scale.set(scale);
    sprite.y = this.surfaceY - this.groundHeight;
    sprite.x = this.cloudLayer.sprite.width;
    this.transitionSprite = sprite;
    this.container.addChild(sprite);
  }
}
