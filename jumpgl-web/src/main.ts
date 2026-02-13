import './style.css';
import { Application, Container, Graphics, Sprite, Texture, Ticker, RenderTexture, Text, TextStyle } from 'pixi.js';
import { PlayerPhysics } from './playerPhysics';
import { EnemyPhysics } from './enemyPhysics';
import { EnemyMovement } from './enemyMovement';
import { loadParallaxTextures, ParallaxBackgrounds, ParallaxGrounds } from './parallaxNew';
import { BiomeSequenceManager } from './biomeSystem';
import { ForestDustField } from './forestDustField';
import { JumpDustParticles } from './jumpDustParticles';
import { ChargeParticles } from './chargeParticles';
import { Shadow } from './shadow';
import { FloatingPlatforms, type PlatformCollision, type PlayerBounds } from './floatingPlatforms';
import { LaserPhysics } from './laserPhysics';
import { HoleManager } from './holeManager';
import { SparkParticles } from './sparkParticles';
import { CometManager } from './cometManager';
import { WindSpriteSystem } from './windSprites';
import { ButterflyManager } from './butterflyAnimation';
import { GroundHoleManager } from './groundHoleManager';
import { EmberParticles } from './emberParticles';
import { useMeteorOrb } from './meteorOrb';
import {
  calculateResponsiveSizes,
  GROUND_PLAYER_DEPTH,
  LASER_HEIGHT,
  LASER_WIDTH,
  HOLE_LARGE_IMAGE_PATH,
  HOLE_SMALL_IMAGE_PATH,
  PLATFORM_LARGE_IMAGE_PATH,
  PLATFORM_SMALL_IMAGE_PATH,
  PLATFORM_SMALL_FIRE_1_IMAGE_PATH,
  PLATFORM_SMALL_FIRE_2_IMAGE_PATH,
  PLATFORM_LARGE_FIRE_1_IMAGE_PATH,
  PLATFORM_LARGE_FIRE_2_IMAGE_PATH,
  PLATFORM_LARGE_FIRE_3_IMAGE_PATH,
  PLATFORM_VERTICAL_OFFSET,
} from './config';

const createGroundGradientSprite = (width: number, height: number): Sprite => {
  const gradientHeight = Math.max(200, height * 0.45);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(gradientHeight));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, gradientHeight, 0, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = Texture.from(canvas);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0, 1);
  sprite.position.set(0, height);
  sprite.width = width;
  sprite.height = gradientHeight;
  return sprite;
};

const init = async () => {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x040612,
    antialias: true,
  });

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Root container #app not found');
  }
  mount.replaceChildren(app.canvas);

  // Loading screen overlay
  const MIN_LOADING_MS = 1000;
  const loadingStartTime = performance.now();
  let loadingScreenActive = true;
  let pendingIntroReset = false;

  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.position = 'fixed';
  loadingOverlay.style.inset = '0';
  loadingOverlay.style.background = '#000';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.flexDirection = 'column';
  loadingOverlay.style.alignItems = 'center';
  loadingOverlay.style.justifyContent = 'center';
  loadingOverlay.style.zIndex = '9999';
  loadingOverlay.style.opacity = '1';
  loadingOverlay.style.transition = 'opacity 0.6s ease';

  const loadingTitle = document.createElement('div');
  loadingTitle.textContent = 'Jump!';
  loadingTitle.style.fontFamily = '"Times New Roman", Times, serif';
  loadingTitle.style.fontSize = '17rem';
  loadingTitle.style.fontWeight = 'bold';
  loadingTitle.style.color = '#fff';
  loadingTitle.style.letterSpacing = '2px';
  loadingTitle.style.marginBottom = '24px';

  const loadingBar = document.createElement('div');
  loadingBar.style.width = 'min(200px, 30vw)';
  loadingBar.style.height = '6px';
  loadingBar.style.border = '1px solid #fff';
  loadingBar.style.borderRadius = '999px';
  loadingBar.style.overflow = 'hidden';

  const loadingBarFill = document.createElement('div');
  loadingBarFill.style.width = '0%';
  loadingBarFill.style.height = '100%';
  loadingBarFill.style.background = '#fff';
  loadingBarFill.style.transition = 'width 0.3s ease';

  loadingBar.appendChild(loadingBarFill);
  loadingOverlay.appendChild(loadingTitle);
  loadingOverlay.appendChild(loadingBar);
  document.body.appendChild(loadingOverlay);

  const levelOverlay = document.createElement('div');
  levelOverlay.style.position = 'fixed';
  levelOverlay.style.inset = '0';
  levelOverlay.style.display = 'flex';
  levelOverlay.style.flexDirection = 'column';
  levelOverlay.style.alignItems = 'center';
  levelOverlay.style.justifyContent = 'center';
  levelOverlay.style.color = '#fff';
  levelOverlay.style.pointerEvents = 'none';
  levelOverlay.style.opacity = '0';
  levelOverlay.style.transition = 'opacity 0.6s ease';
  levelOverlay.style.zIndex = '2000';
  levelOverlay.style.fontFamily = '"Times New Roman", Times, serif';

  const levelOverlayTitle = document.createElement('div');
  levelOverlayTitle.textContent = 'Jump!';
  levelOverlayTitle.style.fontSize = '6rem';
  levelOverlayTitle.style.textShadow = '0 0 20px rgba(255,255,255,0.85)';

  const levelOverlaySubtitle = document.createElement('div');
  levelOverlaySubtitle.style.fontSize = '2.4rem';
  levelOverlaySubtitle.style.marginTop = '10px';
  levelOverlaySubtitle.style.opacity = '0.92';

  levelOverlay.appendChild(levelOverlayTitle);
  levelOverlay.appendChild(levelOverlaySubtitle);
  document.body.appendChild(levelOverlay);

  // Tutorial UI elements
  const tutorialContainer = document.createElement('div');
  tutorialContainer.style.position = 'fixed';
  tutorialContainer.style.inset = '0';
  tutorialContainer.style.display = 'flex';
  tutorialContainer.style.flexDirection = 'column';
  tutorialContainer.style.alignItems = 'center';
  tutorialContainer.style.justifyContent = 'flex-start';
  tutorialContainer.style.paddingTop = '10vh';
  tutorialContainer.style.pointerEvents = 'none';
  tutorialContainer.style.zIndex = '1000';
  tutorialContainer.style.opacity = '0';
  tutorialContainer.style.transition = 'opacity 1.6s ease';

  // Double Jump tutorial elements
  const doubleJumpContainer = document.createElement('div');
  doubleJumpContainer.style.display = 'none';
  doubleJumpContainer.style.flexDirection = 'column';
  doubleJumpContainer.style.alignItems = 'center';
  doubleJumpContainer.style.gap = '20px';

  const doubleJumpHeading = document.createElement('div');
  doubleJumpHeading.textContent = 'Double Jump';
  doubleJumpHeading.style.fontFamily = '"Times New Roman", Times, serif';
  doubleJumpHeading.style.fontSize = '5rem';
  doubleJumpHeading.style.fontWeight = 'bold';
  doubleJumpHeading.style.color = '#fff';
  doubleJumpHeading.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.8)';
  doubleJumpHeading.style.letterSpacing = '2px';

  const doubleJumpSubtext = document.createElement('div');
  doubleJumpSubtext.textContent = 'Press Twice to Double Jump!';
  doubleJumpSubtext.style.fontFamily = 'Arial, sans-serif';
  doubleJumpSubtext.style.fontSize = '1.5rem';
  doubleJumpSubtext.style.color = '#fff';
  doubleJumpSubtext.style.textAlign = 'center';

  const createRoundedArrow = (direction: 'up' | 'right') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.width = '8rem';
    svg.style.height = '8rem';
    svg.style.display = 'block';
    svg.style.filter = 'drop-shadow(0 0 18px rgba(255, 255, 255, 0.85))';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = direction === 'up'
      ? 'M50 86 V18 M50 18 L24 44 M50 18 L76 44'
      : 'M14 50 H82 M82 50 L56 24 M82 50 L56 76';
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '12');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    return svg;
  };

  const upArrow = createRoundedArrow('up');
  upArrow.style.animation = 'bobUp 1.5s ease-in-out infinite';
  const upArrowContainer = document.createElement('div');
  upArrowContainer.style.marginTop = 'calc(4vh - 8px)';
  upArrowContainer.style.transition = 'transform 0.25s ease';
  upArrowContainer.appendChild(upArrow);

  doubleJumpContainer.appendChild(doubleJumpHeading);
  doubleJumpContainer.appendChild(doubleJumpSubtext);
  doubleJumpContainer.appendChild(upArrowContainer);

  // Dash Jump tutorial elements
  const dashJumpContainer = document.createElement('div');
  dashJumpContainer.style.display = 'none';
  dashJumpContainer.style.flexDirection = 'column';
  dashJumpContainer.style.alignItems = 'center';
  dashJumpContainer.style.gap = '20px';

  const dashJumpHeading = document.createElement('div');
  dashJumpHeading.textContent = 'Dash Jump';
  dashJumpHeading.style.fontFamily = '"Times New Roman", Times, serif';
  dashJumpHeading.style.fontSize = '5rem';
  dashJumpHeading.style.fontWeight = 'bold';
  dashJumpHeading.style.color = '#fff';
  dashJumpHeading.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.8)';
  dashJumpHeading.style.letterSpacing = '2px';

  const dashJumpSubtext = document.createElement('div');
  dashJumpSubtext.textContent = 'Double Jump near the Butterfly';
  dashJumpSubtext.style.fontFamily = 'Arial, sans-serif';
  dashJumpSubtext.style.fontSize = '1.5rem';
  dashJumpSubtext.style.color = '#fff';
  dashJumpSubtext.style.textAlign = 'center';
  dashJumpSubtext.style.maxWidth = '600px';

  const rightArrowContainer = document.createElement('div');
  rightArrowContainer.style.position = 'absolute';
  rightArrowContainer.style.left = '50%';
  rightArrowContainer.style.top = '50%';
  rightArrowContainer.style.transform = 'translate(-50%, -50%)';
  rightArrowContainer.style.transition = 'transform 0.25s ease';
  rightArrowContainer.style.display = 'none';

  const rightArrow = createRoundedArrow('right');
  rightArrow.style.animation = 'bobRight 1.5s ease-in-out infinite';

  rightArrowContainer.appendChild(rightArrow);
  dashJumpContainer.appendChild(dashJumpHeading);
  dashJumpContainer.appendChild(dashJumpSubtext);
  dashJumpContainer.appendChild(rightArrowContainer);

  tutorialContainer.appendChild(doubleJumpContainer);
  tutorialContainer.appendChild(dashJumpContainer);
  document.body.appendChild(tutorialContainer);

  const nudgeUpArrow = () => {
    upArrow.style.animation = 'none';
    upArrowContainer.getAnimations().forEach(anim => anim.cancel());
    upArrowContainer.animate(
      [
        { transform: 'translateY(0)', opacity: 1, offset: 0 },
        { transform: 'translateY(-20px)', opacity: 0, offset: 0.55 },
        { transform: 'translateY(-70px)', opacity: 0, offset: 1 },
      ],
      { duration: 950, easing: 'ease-out', fill: 'forwards' }
    );
  };
  let dashArrowSlid = false;
  let dashArrowNudged = false;
  const startDashArrowSlide = () => {
    if (dashArrowSlid || rightArrowContainer.style.display === 'none') return;
    dashArrowSlid = true;
    rightArrowContainer.getAnimations().forEach(anim => anim.cancel());
    rightArrowContainer.style.left = '50%';
    rightArrowContainer.style.transform = 'translate(-50%, -50%)';
    rightArrowContainer.animate(
      [
        { left: '50%', transform: 'translate(-50%, -50%)' },
        { left: '88%', transform: 'translate(-50%, -50%)' },
      ],
      { duration: 1200, easing: 'ease-out', fill: 'forwards' }
    );
  };
  const startDashArrowNudge = () => {
    if (dashArrowNudged || rightArrowContainer.style.display === 'none') return;
    dashArrowNudged = true;
    rightArrow.style.animation = 'none';
    rightArrowContainer.getAnimations().forEach(anim => anim.cancel());
    rightArrowContainer.animate(
      [
        { left: '88%', transform: 'translate(-50%, -50%)', opacity: 1, offset: 0 },
        { left: '94%', transform: 'translate(-50%, -50%)', opacity: 0, offset: 0.5 },
        { left: '98%', transform: 'translate(-50%, -50%)', opacity: 0, offset: 1 },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' }
    );
  };
  const nudgeRightArrow = () => {
    startDashArrowSlide();
    startDashArrowNudge();
  };

  // Add CSS animations for bobbing
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bobUp {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-15px); }
    }
    @keyframes bobRight {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(15px); }
    }
  `;
  document.head.appendChild(style);

  const animateLoadingBar = () => {
    if (!loadingScreenActive) return;
    const elapsed = performance.now() - loadingStartTime;
    const autoProgress = Math.min(0.85, (elapsed / MIN_LOADING_MS) * 0.85);
    loadingBarFill.style.width = `${(autoProgress * 100).toFixed(0)}%`;
    requestAnimationFrame(animateLoadingBar);
  };
  animateLoadingBar();

  const scene = new Container();
  app.stage.addChild(scene);
  const uiContainer = new Container();
  app.stage.addChild(uiContainer);

  const backgroundContainer = new Container();
  const overlayContainer = new Container();
  const groundContainer = new Container();
  const platformContainer = new Container();
  const laserContainer = new Container();
  const holeContainer = new Container();
  const projectileContainer = new Container();
  const playfieldContainer = new Container();
  const butterflyContainer = new Container();
  const cometContainer = new Container();
  const debugPlatformHitboxContainer = new Container(); // Debug visualization for platform hitboxes

  const emberContainer = new Container();

  scene.addChild(
    backgroundContainer,
    overlayContainer,
    groundContainer,
    emberContainer, // Embers render in front of ground
    platformContainer,
    playfieldContainer,
    cometContainer
  );
  // Attach debug hitboxes to playfield so they follow the same world scroll as platforms/ground
  playfieldContainer.addChild(debugPlatformHitboxContainer);

  // Spawn point debug indicator (50% opacity magenta overlay)
  // Add to playfieldContainer so it moves with the world
  const spawnPointDebug = new Graphics();
  spawnPointDebug.rect(-50, -300, 100, 600); // 100px wide, 600px tall centered on spawn
  spawnPointDebug.fill({ color: 0xff00ff, alpha: 0.5 }); // Magenta at 50% opacity
  spawnPointDebug.visible = false; // Hidden until spawn point is set
  playfieldContainer.addChild(spawnPointDebug);

  // Stars temporarily disabled
  const parallaxTextures = await loadParallaxTextures();
  const loadingElapsed = performance.now() - loadingStartTime;
  const remainingDelay = Math.max(0, MIN_LOADING_MS - loadingElapsed);
  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
  loadingBarFill.style.width = '100%';
  setTimeout(() => {
    loadingOverlay.style.opacity = '0';
    loadingScreenActive = false;
    pendingIntroReset = true;
    setTimeout(() => {
      loadingOverlay.remove();
    }, 650);
  }, 200);

  const biomeManager = new BiomeSequenceManager('cloud');
  biomeManager.setSequence(['cloud', 'forest']);

  const backgrounds = new ParallaxBackgrounds(
    backgroundContainer,
    parallaxTextures,
    biomeManager,
    app.renderer.width,
    app.renderer.height,
    () => {}
  );
  const starContainer = new Container();
  backgrounds.getRoot().addChildAt(starContainer, 1);

  const dustField = new ForestDustField(app.renderer.width, app.renderer.height);
  dustField.reset();
  const dustCompositeCanvas = document.createElement('canvas');
  dustCompositeCanvas.width = app.renderer.width;
  dustCompositeCanvas.height = app.renderer.height;
  const dustCtx = dustCompositeCanvas.getContext('2d');
  if (!dustCtx) {
    throw new Error('Failed to create dust composite context');
  }
  // Create texture from canvas - it will be manually updated each frame
  const dustTexture = Texture.from(dustCompositeCanvas);
  const dustSprite = new Sprite(dustTexture);
  dustSprite.blendMode = 'normal';
  dustSprite.alpha = 0; // stays hidden until reveal triggers

  // Initialize jump dust particle system
  const jumpDust = new JumpDustParticles();
  const jumpDustCanvas = document.createElement('canvas');
  jumpDustCanvas.width = app.renderer.width;
  jumpDustCanvas.height = app.renderer.height;
  const jumpDustCtx = jumpDustCanvas.getContext('2d');
  if (!jumpDustCtx) {
    throw new Error('Failed to create jump dust context');
  }
  const jumpDustTexture = Texture.from(jumpDustCanvas);
  const jumpDustSprite = new Sprite(jumpDustTexture);
  jumpDustSprite.blendMode = 'normal';

  // Butterflies (meadow only)
  const butterflyManager = new ButterflyManager();
  try {
    await butterflyManager.loadFrames();
  } catch (e) {
    console.error('[BUTTERFLY] Failed to load frames', e);
  }
  // Butterfly variant controls: counts and colors (tint)
  const butterflyVariants: Array<{ count: number; tint?: number; useOrange?: boolean }> = [
    { count: 1 }, // First butterfly (larger, blue)
    { count: 1, useOrange: true }, // Second butterfly (smaller, orange)
    { count: 1 }, // Third butterfly (smaller, blue)
  ];

  // Initialize wind sprite system (anime-style wind lines)
  const windSprites = new WindSpriteSystem(24);
  const windCanvas = document.createElement('canvas');
  windCanvas.width = app.renderer.width;
  windCanvas.height = app.renderer.height;
  const windCtx = windCanvas.getContext('2d');
  if (!windCtx) {
    throw new Error('Failed to create wind sprite context');
  }
  const windTexture = Texture.from(windCanvas);
  const windSprite = new Sprite(windTexture);
  windSprite.blendMode = 'normal';
  let nextWindSpawnTime = 1.2 + Math.random() * 0.8; // Random spawn interval (more breathing room)

  // Initialize spark particles (for laser hits)
  const sparkParticles = new SparkParticles();
  const sparkCanvas = document.createElement('canvas');
  sparkCanvas.width = app.renderer.width;
  sparkCanvas.height = app.renderer.height;
  const sparkCtx = sparkCanvas.getContext('2d');
  if (!sparkCtx) {
    throw new Error('Failed to create spark canvas');
  }
  const sparkTexture = Texture.from(sparkCanvas);
  const sparkSprite = new Sprite(sparkTexture);
  sparkSprite.blendMode = 'normal';

  // Enemy charge particles (red)
  const enemyChargeParticles = new ChargeParticles(0xff2020);
  const enemyChargeCanvas = document.createElement('canvas');
  enemyChargeCanvas.width = app.renderer.width;
  enemyChargeCanvas.height = app.renderer.height;
  const enemyChargeCtx = enemyChargeCanvas.getContext('2d');
  if (!enemyChargeCtx) {
    throw new Error('Failed to create enemy charge canvas');
  }
  const enemyChargeTexture = Texture.from(enemyChargeCanvas);
  const enemyChargeSprite = new Sprite(enemyChargeTexture);
  enemyChargeSprite.blendMode = 'add';

  // Separate halo pass (normal blend) so large particles stay solid red
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = app.renderer.width;
  haloCanvas.height = app.renderer.height;
  const haloCtx = haloCanvas.getContext('2d');
  if (!haloCtx) {
    throw new Error('Failed to create halo canvas');
  }
  const haloTexture = Texture.from(haloCanvas);
  const haloSprite = new Sprite(haloTexture);
  haloSprite.blendMode = 'normal';
  type ChargeFX = { x: number; y: number; vx: number; vy: number; size: number; life: number; maxLife: number };
  const enemyChargeHalo: ChargeFX[] = [];
  const enemyChargeOrbit: ChargeFX[] = [];

  // Initialize charge particle system (currently disabled but keeping structure for future re-enable)
  // @ts-expect-error - Keeping for future re-enable
  const chargeParticles = new ChargeParticles();
  const chargeCanvas = document.createElement('canvas');
  chargeCanvas.width = app.renderer.width;
  chargeCanvas.height = app.renderer.height;
  const chargeCtx = chargeCanvas.getContext('2d');
  if (!chargeCtx) {
    throw new Error('Failed to create charge particle context');
  }
  const chargeTexture = Texture.from(chargeCanvas);
  const chargeSprite = new Sprite(chargeTexture);
  chargeSprite.blendMode = 'normal';
  // Don't center the sprite anchor - keep it at default (0,0) like other canvas-based sprites

  // Make ground gradient and ground segments wider to account for camera zoom (0.90 scale)
  // At 0.90 zoom, we see ~11% more width, so use 1.25x multiplier for extra right-side coverage
  const groundWidthMultiplier = 1.25;
  const effectiveGroundWidth = app.renderer.width * groundWidthMultiplier;

  let gradientSprite = createGroundGradientSprite(effectiveGroundWidth, app.renderer.height);
  // Position gradient with more coverage on the right (30% left, 70% right)
  const extraWidth = effectiveGroundWidth - app.renderer.width;
  gradientSprite.x = -extraWidth * 0.3;

  overlayContainer.addChild(dustSprite);
  overlayContainer.addChild(gradientSprite);
  const grounds = new ParallaxGrounds(
    groundContainer,
    parallaxTextures,
    biomeManager,
    effectiveGroundWidth,
    app.renderer.height
  );

  // Initialize platform system with fire variants
  const platforms = new FloatingPlatforms(
    PLATFORM_LARGE_IMAGE_PATH,
    PLATFORM_SMALL_IMAGE_PATH,
    PLATFORM_SMALL_FIRE_1_IMAGE_PATH,
    PLATFORM_SMALL_FIRE_2_IMAGE_PATH,
    PLATFORM_LARGE_FIRE_1_IMAGE_PATH,
    PLATFORM_LARGE_FIRE_2_IMAGE_PATH,
    PLATFORM_LARGE_FIRE_3_IMAGE_PATH
  );
  const holes = new HoleManager(HOLE_SMALL_IMAGE_PATH, HOLE_LARGE_IMAGE_PATH);

  // Initialize ground hole system for comet hole level
  const groundHoles = new GroundHoleManager();

  // Initialize ember particle system for ground holes
  const emberParticles = new EmberParticles(app.renderer.width, app.renderer.height);
  const emberCanvas = document.createElement('canvas');
  emberCanvas.width = app.renderer.width;
  emberCanvas.height = app.renderer.height;
  const emberCtx = emberCanvas.getContext('2d');
  if (!emberCtx) {
    throw new Error('Failed to create ember particle context');
  }
  const emberTexture = Texture.from(emberCanvas);
  const emberSprite = new Sprite(emberTexture);
  emberSprite.blendMode = 'normal';
  emberContainer.addChild(emberSprite);

  // Initialize comet system
  const cometManager = new CometManager(cometContainer, {
    screenWidth: app.renderer.width,
    screenHeight: app.renderer.height,
    speed: 400, // pixels per second
    yPosition: 0.667, // 2/3 down from top (1/3 from bottom)
    scale: 0.85, // 15% smaller
  });
  let activePlatformId: number | null = null;
  let lastLeftPlatformId: number | null = null;
  // Meteor hitbox for landing on the meteor overlay
  let meteorHitbox: { x: number; width: number; surfaceY: number } | null = null;
  const TREEHOUSE_PLATFORM_ID_BASE = 10000;
  const TREEHOUSE_SURFACE_EXTRA = 0;
  const TREEHOUSE_BLEND_HEIGHT = 120;
  const TREEHOUSE_VERTICAL_LOCK = 65;
  const TREEHOUSE_RAMP_STEP = 75;
  const TREEHOUSE_STEP_Z_BUFFER = 2;
  const PLATFORM_EDGE_TOLERANCE = 8; // Horizontal forgiveness so we don't drop too early
  const PLATFORM_LANDING_OFFSET = 30; // Extra pixels to sink into platform at rest
  const TREEHOUSE_LANDING_OFFSET = PLATFORM_LANDING_OFFSET - 22;
  const PLAYER_PLATFORM_HITBOX_HORIZONTAL_SCALE = 0.6; // 20% inset per side (60% width)
  type TreehousePlatform = {
    id: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    halfWidth: number;
    halfHeight: number;
    rotation: number;
    key?: string;
  };
  let platformAscendBonus = 0; // Additional vertical offset for successive spawns after landings
  const PLATFORM_ASCEND_STEP = 40; // Pixels higher per qualifying landing
  const PLATFORM_ASCEND_MAX = Number.POSITIVE_INFINITY; // Cap climb bonus (effectively unlimited)
  const HOLE_PLATFORM_OFFSET = 115; // Further lowered platforms with holes (100px lower than before)
  const HOLE_ALIGNMENT_TWEAK = 25; // Shift hole right to better center on platform art
  let isOnBaselineGround = true; // Tracks when player is resting on main ground
  let fallingIntoHole = false;
  const projectiles: { x: number; y: number; active: boolean }[] = [];
  const PROJECTILE_SPEED = 700; // pixels per second (20 * 60fps) - much faster than enemy lasers
  const PROJECTILE_WIDTH = 25; // Same width as enemy lasers
  const PROJECTILE_HEIGHT = 2; // Same height as enemy lasers
  let useStraightBlueLasers = false;
  let nextShotTime = 0;
  const MAX_SHOOT_SPEED = 25; // Fastest cooldown at 80%+ energy (ms)
  const MIN_SHOOT_SPEED = 350; // Slowest cooldown at 20% or less energy (ms)
  let canShoot = false; // Unlocks after collecting the treehouse orb
  let shootUnlocked = false;
  let orbShootingUnlocked = false; // Shooting is only active after collecting the treehouse orb
  let scenarioActive = false;
  let scenarioSmallId: number | null = null;
  let scenarioStage: 'idle' | 'awaiting' | 'prep' | 'charging' | 'firing' = 'idle';
  let megaLaserActive = false;
  let megaLaserStart = 0;
  let megaLaserStartTick = 0;
  const MEGA_LASER_DURATION = 1200;
  const MEGA_LASER_CHARGE = 3000;
  const MEGA_LASER_GROWTH = 150; // ms for beam to fully extend (slightly faster)
  let megaLaserHeight = 0;
  let megaLaserHitPlayer = false;
  let freezePlayer = false;
  let shakeActive = false;
  let shakeEndTime = 0;
  let lastHoleStartX: number | null = null; // track first hole start for respawn
  const megaLaserGraphic = new Graphics();
  megaLaserGraphic.blendMode = 'add';
  let energy = 0;
  let energyDisplay = 0;
  let energyRevealActive = false;
  let energyRevealStart = 0;
  const ENERGY_REVEAL_DURATION = 1.25;
  let energyActivated = false;
  let orbChargeActive = false;
  let orbChargeStart = 0;
  let orbChargeKey: 'KeyS' | 'KeyF' | null = null;
  const ORB_CHARGE_MAX_SECONDS = 1.25;
  const ORB_CHARGE_MID_SECONDS = 0.6;
  const ORB_SHOT_BASE_BONUS_PX = 2;
  const ORB_SHOT_MIN_DELTA_PX = -5;
  const ORB_SHOT_MAX_DELTA_PX = 5;
  const ORB_CHARGE_SPEED_BOOST = 5.0;
  const ORB_CHARGE_COLLAPSE_START = 0.35;
  let playerFlashUntil = 0;
  let enemyFlashUntil = 0;
  let blueHits = 0;
  let blueOuts = 0;
  let redHits = 0;
  let redOuts = 0;
  let playerGrowthLevel = 0;
  let enemyGrowthLevel = 0;
  let treehouseQueued = false;
  let firstOutMade = false;
  let scoreVisible = false;
  let revealEnergyBar: (() => void) | null = null;
  const HITS_PER_OUT = 20;
  const MAX_GROWTH_LEVELS = 10;
  const GROWTH_SCALE_PER_LEVEL = 0.2;
  let autoScenarioPending = false;
  let butterfliesSpawned = false;

  const getPlayerGrowthScale = () => 1 + playerGrowthLevel * GROWTH_SCALE_PER_LEVEL;
  const getEnemyGrowthScale = () => 1 + enemyGrowthLevel * GROWTH_SCALE_PER_LEVEL;
  const getPlayerHitRadius = () => playerRadius * getPlayerGrowthScale();
  const getEnemyHitRadius = () => playerRadius * getEnemyGrowthScale();
  const getGrowthYOffset = (growthScale: number) => playerRadius * Math.max(0, growthScale - 1);
  const getPlayerRenderY = (physicsCenterY: number) => physicsCenterY - getGrowthYOffset(getPlayerGrowthScale());
  const getEnemyRenderY = (physicsCenterY: number) => physicsCenterY - getGrowthYOffset(getEnemyGrowthScale());

  type SpecialOutNumber = 0 | 4 | 7 | 10;
  type SpecialChargeStage =
    | 'idle'
    | 'windup'
    | 'charging'
    | 'hitWall'
    | 'returning'
    | 'postReturn'
    | 'smallJump'
    | 'midJump'
    | 'largeJump'
    | 'done';
  type FinalTransitionStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

  let specialOutNumber: SpecialOutNumber = 0;
  let specialChargeStage: SpecialChargeStage = 'idle';
  let specialOutActive = false;
  let specialWindupStart = 0;
  let specialChargeStart = 0;
  let specialChargeStartX = 0;
  let specialChargeTargetX = 0;
  let specialOriginalEnemyX = 0;
  let specialHitWallStart = 0;
  let specialReturnStart = 0;
  let specialReturnFromX = 0;
  let specialReturnToX = 0;
  let specialPostReturnStart = 0;
  let specialSmallJumpStart = 0;
  let specialSmallJumpTriggered = false;
  let specialMidJumpTriggered = false;
  let specialLargeJumpTriggered = false;
  let specialLastCollisionAt = 0;
  let finalSequenceActive = false;
  let finalReturning = false;
  let finalNextChargeTime = 0;
  let finalChargeActive = false;
  let finalChargeStart = 0;
  let finalChargeStartX = 0;
  let finalChargeTargetX = 0;
  let finalLastCollisionTime = 0;
  let finalTransitionActive = false;
  let finalTransitionStage: FinalTransitionStage = 0;
  let finalTransitionDelayUntil = 0;
  let finalTransitionStage3Start = 0;
  let finalTransitionStage4Start = 0;
  let finalTransitionStage4Executed = false;
  let finalTransitionStage6Start = 0;
  let specialCameraPanX = 0;
  let battleLevel = 1;
  let stopScrollForFinal = false;
  let finalScrollSlowdownStart = 0;
  const FINAL_SCROLL_SLOWDOWN_MS = 2200;
  const SPECIAL_WALL_BOUNCE_BACK_PX = 210;
  const SPECIAL_WALL_BOUNCE_LERP_MS = 900;
  const SPECIAL_WALL_BOUNCE_JUMP_SCALE = 0.52;
  const SPECIAL_RETURN_ROLL_MS = 2500;

  // Comet Hole Level state
  let cometHoleLevelActive = false;
  let lastPlatformX = 0; // Track last platform X position
  const PLATFORM_MIN_SPACING = 500; // Minimum pixels between platforms (doubled to have half as many)
  const PLATFORM_MAX_SPACING = 900; // Maximum pixels between platforms (doubled to have half as many)
  let leftmostHoleX = Infinity; // Track hole area boundaries for culling
  let rightmostHoleX = -Infinity;

  // Red enemy state for hole level
  let redEnemyActive = false;
  let forceEnemyJumpOut = false;
  let redEnemyState: 'on_platform' | 'falling' | 'rolling_in' | 'jumping_intro' | 'shooting' = 'on_platform';
  let redEnemyVelocityY = 0;
  let redEnemyVelocityX = 0;
  let enemyEverVisible = false; // Track if enemy has ever been shown (for player movement range)
  let enemyIntroMoveActive = false;
  let enemyIntroMoveStartX = 0;
  let enemyIntroMoveStartTime = 0;
  let playerReturnStartTime = 0; // When player started returning to left half
  let playerReturnStartX = 0; // Player X when return animation started
  let playerReturnTargetX = 0; // Target X for return animation
  const RED_ENEMY_ROLL_SPEED = 700; // Faster horizontal roll-in speed

  const RESPAWN_WAIT_TIME = 0.2; // Shorter wait before animating back
  const RESPAWN_HEIGHT_ABOVE_SCREEN = -200; // Spawn player this many pixels above top of screen
  const RESUME_WAIT_TIME = 1.0; // Pause before moving forward after respawn
  const RESUME_RAMP_DURATION = 0.6; // Ease into forward motion
  const BASE_GROUND_SCROLL_SPEED = 72; // pixels per second (from parallaxNew.ts)
  // Respawn system state
  let respawnState: 'normal' | 'dying' | 'waiting' | 'animating_back' | 'respawning' | 'resume_pause' | 'resume_ramp' = 'normal';
  let respawnTimer = 0;
  let respawnInputLocked = false;
  // Spawn point tracking for smart culling system
  let spawnPoints: number[] = []; // Array of spawn X positions (sorted left to right)
  let currentSpawnIndex = -1; // Which spawn player is "after" (-1 means before first spawn)
  let nextSpawnIndex = 0; // Next spawn ahead
  let debugFastForwardToSecondSpawn = false;
  let debugSpawnDropPending = false;
  const DEBUG_FAST_FORWARD_MIN = 40;
  const DEBUG_FAST_FORWARD_MAX = 200;
  let spawnPointX = 0; // X position to respawn at (start of meteor transition) - FIXED, set once when meteor spawns
  let deathPlayerX = 0; // Player's world X position when they died
  let remainingRewindDistance = 0; // Fixed distance to scroll back to spawn (updated each frame by deltaX)
  let respawnClampToScreen = false;
  let respawnClampDistance = 0;
  let resumeRampTimer = 0;

  // Automatic hole level trigger tracking
  let fencePassedTriggered = false; // Track if we've already triggered hole level after fence

  // Platform height configuration - gradual progression from ground to final platform
  // Most platforms stay near ground level, with gradual increase toward the end
  const FIRST_PLATFORM_HEIGHT = 30; // Base height above ground for the first platform
  const FIRST_PLATFORM_DROP = 95; // Lower the first platform by 10px
  const FINAL_PLATFORM_HEIGHT = 300; // Highest platform (largePlatformfire3)

  let isFirstPlatformSpawned = false; // Track if first platform has been spawned
  let platformSequenceIndex = 0; // Track position in fire platform sequence
  let totalPlatformsSpawned = 0; // Total count of platforms spawned in this hole sequence
  let estimatedTotalPlatforms = 0; // Estimated total platforms for this hole sequence (for height progression)
  const holeSequencePlatformIds: number[] = [];
  const holeSequencePlatformIndex = new Map<number, number>();
  let holeSequenceLastIndex: number | null = null;
  let holeSequencePenultimateIndex: number | null = null;
  let lastLandedSequenceIndex: number | null = null;
  const processedSegments = new Set<string>(); // Track which segments have spawned holes
  type MeteorSwirlOrb = {
    id: number;
    offsetX: number;
    offsetY: number;
    jitterX: number;
    jitterY: number;
    radius: number;
    arc: number;
    speed: number;
    phase: number;
    sizeScale: number;
    currentX: number;
    currentY: number;
    collected: boolean;
  };
  type MeteorSwirlFollower = {
    id: number;
    radius: number;
    arc: number;
    speed: number;
    phase: number;
    sizeScale: number;
    currentX: number;
    currentY: number;
  };
  type MeteorSwirlShot = {
    x: number;
    y: number;
    radius: number;
    speed: number;
    active: boolean;
    hits: number;
    speedScale?: number;
    maxSpeedScale?: number;
  };
  const METEOR_SWIRL_ORB_COUNT = 4;
  const METEOR_SWIRL_ORB_ARC = 1.6;
  const METEOR_SWIRL_ORB_RADIUS_MIN = 110;
  const METEOR_SWIRL_ORB_RADIUS_MAX = 180;
  const METEOR_SWIRL_ORB_SPEED_MIN = 7.5;
  const METEOR_SWIRL_ORB_SPEED_MAX = 11.5;
  const METEOR_SWIRL_ORB_SIZE_MIN = 0.5;
  const METEOR_SWIRL_ORB_SIZE_MAX = 0.82;
  const METEOR_SWIRL_ORB_SIZE_JITTER = 0.06;
  const METEOR_SWIRL_SHOT_SPEED_START = 0.95;
  const METEOR_SWIRL_SHOT_SPEED_MAX = 1.35;
  const METEOR_SWIRL_SHOT_ACCEL = 2.6;
  const METEOR_SWIRL_SHOT_OFFSCREEN_PAD = 260;
  const METEOR_SWIRL_ORB_COLLECT_PAD = 4;
  const METEOR_SWIRL_FOLLOW_X_OFFSET = 2.6;
  const METEOR_SWIRL_FOLLOW_Y_OFFSET = 0.6;
  const METEOR_SWIRL_FOLLOW_SPACING = 0.5;
  const meteorSwirlOrbs: MeteorSwirlOrb[] = [];
  const meteorSwirlFollowers: MeteorSwirlFollower[] = [];
  const meteorSwirlShots: MeteorSwirlShot[] = [];
  let meteorSwirlSpawned = false;

  // Fire platform sequence: smallPlatformfire1, smallPlatformfire2, largePlatformfire1, largePlatformfire2, largePlatformfire3
  const firePlatformSequence = ['smallfire1', 'smallfire2', 'largefire1', 'largefire2'] as const;

  // Helper to get next platform type in the sequence
  const getNextPlatformType = (isLastPlatform: boolean): 'small' | 'smallfire1' | 'smallfire2' | 'largefire1' | 'largefire2' | 'largefire3' => {
    if (!isFirstPlatformSpawned) {
      // First platform is always regular smallPlatform
      return 'small';
    }

    if (isLastPlatform) {
      // Final platform is always largePlatformfire3
      return 'largefire3';
    }

    // Cycle through fire platform sequence
    const platformType = firePlatformSequence[platformSequenceIndex % firePlatformSequence.length];
    return platformType;
  };

  // Camera system for hole levels
  let cameraZoom = 1.0;
  let hasLandedOnFirstPlatform = false;
  let cameraPanX = 0;
  let cameraPanY = 0;
  let firstZoomProgress = 0;
  let lateZoomProgress = 0;
  let panEaseProgress = 0;
  let respawnHoldProgress = 0;
  let respawnHoldActive = false;
  let respawnHoldStartZoom = 1.0;
  let respawnLandProgress = 0;
  let respawnLandActive = false;


  // Stars disabled for now

  // Calculate initial responsive sizes
  let sizes = calculateResponsiveSizes(app.renderer.height, app.renderer.width);
  let playerRadius = sizes.playerRadius;
  let playerDiameter = sizes.playerDiameter;
  megaLaserHeight = playerDiameter * 1.2;

  const groundSurface = () => grounds.getSurfaceY();
  const computePlayerGround = () => groundSurface() + playerDiameter * GROUND_PLAYER_DEPTH;
  let playerInitialX = app.renderer.width * 0.32;

  // Create shadow (added before player so it appears behind)
  const playerShadow = new Shadow({ playerWidth: playerDiameter });
  playfieldContainer.addChild(playerShadow.getView());

  // Add jump dust sprite (before player so it appears behind player but in front of ground)
  playfieldContainer.addChild(jumpDustSprite);

  // Add charge particle sprite (same layer as jump dust)
  playfieldContainer.addChild(chargeSprite);

  // Meteor swirl orb visuals (layered above meteor overlay, below player)
  const meteorSwirlGraphics = new Graphics();
  meteorSwirlGraphics.blendMode = 'screen';

  // Player intro animation state - declare before ball setup
  let playerIntroActive = true;
  const playerIntroStartSize = playerDiameter * 0.75; // 75% of normal size (25% smaller)

  const ballBaseColor = 0x4fc3f7;
  const ballHitColor = 0xff2020;
  let currentBallColor = ballBaseColor;
  const ball = new Graphics();
  const setBallColor = (color: number) => {
    currentBallColor = color;
    // During intro, don't redraw - size is managed by intro animation
    if (playerIntroActive) return;
    ball.clear();
    ball.circle(0, 0, playerRadius).fill({ color });
  };

  // Draw ball initially at intro size (don't call setBallColor since intro is active)
  const initialRadius = playerIntroActive ? playerIntroStartSize / 2 : playerRadius;
  ball.clear();
  ball.circle(0, 0, initialRadius).fill({ color: ballBaseColor });

  const initialGround = computePlayerGround();
  ball.position.set(playerInitialX, initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
    initialX: playerInitialX,
    screenWidth: app.renderer.width,
  });

  let currentGroundSurface = initialGround;

  // Rest of player intro animation state
  let playerIntroPhase: 'initial' | 'moveout' | 'jump1' | 'jump2' | 'grow' | 'delay' | 'complete' = 'initial';
  let playerIntroStartTime = performance.now();
  const playerIntroNormalSize = playerDiameter; // Normal size
  let playerIntroCurrentSize = playerIntroStartSize;

  // Post-intro easing state
  let postIntroEaseActive = false;
  let postIntroEaseStartTime = 0;
  const postIntroEaseDuration = 1.5; // 1.5 seconds to ease into full speed
  let postIntroInitialMouseX = 0; // Store initial mouse X when control is enabled
  let postIntroPlayerStartX = 0; // Store player X when control is enabled
  let introLandingLeftLockActive = false; // Prevent immediate pull-back toward hidden mouse
  let introLandingLeftLockX = 0; // World-space lock at landing point
  let introLandingLeftLockOffsetFromCottageX = 0; // Keeps the lock moving with the cottage segment
  let respawnEaseActive = false;
  let respawnEaseStartTime = 0;
  let respawnEaseStartX = 0;
  const RESPAWN_EASE_DURATION = 1.2;

  // Parallax boost on jump near the right edge
  const PARALLAX_BOOST_MAX_DURATION_MS = 750;
  const PARALLAX_BOOST_MULTIPLIER = 7;
  let parallaxBoostActive = false;
  let parallaxBoostStartTime = 0;
  // Dash charge attack once enemy lasers are active
  const DASH_CHARGE_DURATION = 0.22;
  const DASH_RETURN_DURATION = 0.28;
  const DASH_TARGET_BUFFER = playerRadius * 0.8;
  const DASH_HIT_SHAKE_MS = 220;
  const DASH_HIT_SQUISH_MS = 220;
  let dashChargeActive = false;
  let dashChargeReturning = false;
  let dashChargeStartTime = 0;
  let dashChargeReturnStartTime = 0;
  let dashChargeStartX = 0;
  let dashChargeTargetX = 0;
  let dashChargeReturnFromX = 0;
  let dashChargeReturnToX = 0;
  let dashReturnEaseActive = false;
  let dashReturnEaseStartTime = 0;
  const DASH_RETURN_EASE_DURATION = 3;
  let enemySquishUntil = 0;

  // Tutorial system state
  let tutorialActive = true;
  let tutorialStage: 'waiting' | 'doubleJump' | 'dashJump' | 'complete' = 'waiting';
  let tutorialDashJumpShown = false;
  let tutorialDoubleJumpCompleted = false;
  let tutorialDashJumpCompleted = false;
  const TUTORIAL_FIRST_DELAY = 6; // seconds after loading screen clears
  let tutorialFirstDelayElapsed = 0;

  // Tutorial parallax control
  let tutorialParallaxStopped = false;
  let tutorialParallaxSlowFactor = 1;

  let treehouseHoldActive = false;
  let treehouseHoldProgress = 0;
  let treehousePanX = 0;
  let treehouseOrbCollectedPrev = false;
  let treehousePanReleaseActive = false;
  let treehousePanReleaseStart = 0;
  let treehouseEnemyHidden = false;
  let treehouseEnemyReturnActive = false;
  let treehouseEnemyReturnStart = 0;
  let treehouseEnemyAutoEaseActive = false;
  let treehouseEnemyAutoEaseStart = 0;
  let treehouseEnemyExitActive = false;
  let treehouseEnemyExitStart = 0;
  let treehouseEnemyExitFromX = 0;
  let treehouseEnemyExitTargetX = 0;
  const TREEHOUSE_ENEMY_EXIT_LERP = 0.08;
  const TREEHOUSE_ENEMY_RETURN_LERP = 0.02;
  const TREEHOUSE_ENEMY_EXIT_SCREEN_MULT = 1.85;
  const TREEHOUSE_ENEMY_RETURN_SNAP = 8;
  const TREEHOUSE_ENEMY_RETURN_MAX_MS = 3200;
  const TREEHOUSE_ENEMY_AUTO_LERP = 0.025;
  const TREEHOUSE_ENEMY_EXIT_DURATION_MS = 1800;
  const TREEHOUSE_STOP_RANGE = 260;
  const TREEHOUSE_STOP_DURATION = 1.6;
  const TREEHOUSE_EDGE_PAN = 100;
  const TREEHOUSE_PAN_LERP = 0.08;
  const TREEHOUSE_PAN_RELEASE_LERP = 0.02;
  const TREEHOUSE_PAN_RESET_SPEED = 0.001;
  const TREEHOUSE_PAN_RESET_DELAY_MS = 2000;

  // Meeting title reveal (Pixi UI)
  const MEETING_REVEAL_DURATION_MS = 3200;
  const MEETING_RISE_PX = 12;
  let meetingRevealActive = false;
  let meetingRevealStartTime = 0;
  let meetingTitleBaseY = 64;
  let meetingTitleContainer: Container | null = null;
  let meetingTitleText: Text | null = null;

  // Calculate cottage door position in world coordinates
  // Cottage image is 2048x900, player starts at 655px from left (door position)
  const cottageImageHeight = 900;
  const playerInCottageX = 655; // X position within cottage image (door location)

  // Get actual cottage scale and position from parallax system
  const groundHeight = grounds.getSurfaceY();
  const cottageScale = groundHeight / cottageImageHeight;

  // Convert cottage-relative position to world position
  const playerIntroStartX = playerInCottageX * cottageScale;

  // Slow parallax during intro
  let introParallaxSpeed = 0.2; // 20% of normal speed

  // Start with full-screen movement range (enemy not visible yet)
  // Keep fixed edge margins so wider screens don't add extra dead space.
  const PLAYER_EDGE_MARGIN_LEFT = 120;
  const PLAYER_EDGE_MARGIN_RIGHT = 200;
  const PLAYER_LEFT_HALF_RIGHT_PERCENT = 0.55;
  let playerRangeMode: 'full' | 'leftHalf' = 'full';
  const getPlayerRangeBounds = (screenWidth: number) => ({
    full: {
      left: PLAYER_EDGE_MARGIN_LEFT,
      right: screenWidth - PLAYER_EDGE_MARGIN_RIGHT,
    },
    leftHalf: {
      left: PLAYER_EDGE_MARGIN_LEFT,
      right: Math.min(screenWidth - PLAYER_EDGE_MARGIN_RIGHT, screenWidth * PLAYER_LEFT_HALF_RIGHT_PERCENT),
    },
  });
  let playerRangeBounds = getPlayerRangeBounds(app.renderer.width);

  const updatePlayerHorizontalRangeForCamera = (cameraX: number, zoom: number) => {
    const bounds = playerRangeBounds[playerRangeMode];
    const safeZoom = Math.max(0.0001, zoom);
    const worldLeft = (bounds.left - cameraX) / safeZoom;
    const worldRight = (bounds.right - cameraX) / safeZoom;
    const leftRange = Math.max(0, playerInitialX - worldLeft);
    const rightRange = Math.max(0, worldRight - playerInitialX);
    physics.setHorizontalRange(leftRange, rightRange);
  };

  updatePlayerHorizontalRangeForCamera(0, 1);
  console.log('[PLAYER RANGE] Initial: Full screen (fixed edge margins)');

  // Create enemy at 90% of screen width
  let enemyBaseColor = 0xff0000;
  let enemyHitColor = 0x4fc3f7;
  let currentEnemyColor = enemyBaseColor;
  const enemyBall = new Graphics();
  const setEnemyColor = (color: number) => {
    currentEnemyColor = color;
    enemyBall.clear();
    enemyBall.circle(0, 0, playerRadius).fill({ color });
  };
  setEnemyColor(enemyBaseColor);
  const enemyX = app.renderer.width * 0.9;
  enemyBall.position.set(enemyX, initialGround - playerRadius);
  enemyBall.visible = false; // Hidden initially, will be shown in hole level
  playfieldContainer.addChild(enemyBall);
  const enemyShadow = new Shadow({ playerWidth: playerDiameter });
  enemyShadow.getView().visible = false;
  enemyShadow.getView().alpha = 0.85;
  playfieldContainer.addChildAt(enemyShadow.getView(), playfieldContainer.getChildIndex(enemyBall));
  const enemyBounds = () => {
    const r = getEnemyHitRadius();
    return {
      left: enemyBall.position.x - r,
      right: enemyBall.position.x + r,
      top: enemyBall.position.y - r,
      bottom: enemyBall.position.y + r,
    };
  };

  // Add ground middleground container (meteor overlay) - renders above enemy, below player
  playfieldContainer.addChild(grounds.getMiddlegroundContainer());

  // Meteor swirl orbs sit above the meteor overlay but below the player
  playfieldContainer.addChild(meteorSwirlGraphics);

  // Re-order rendering layers for proper z-index:
  // Move player ball to render after middleground (above meteor overlay)
  playfieldContainer.removeChild(ball);
  playfieldContainer.addChild(ball);

  // Lasers render above players
  playfieldContainer.addChild(laserContainer);

  // Holes render above the player so the player can sink beneath them
  playfieldContainer.addChild(holeContainer);
  playfieldContainer.addChild(sparkSprite);
  playfieldContainer.addChild(megaLaserGraphic);
  playfieldContainer.addChild(haloSprite);
  const meteorOrb = useMeteorOrb({
    app,
    playfieldContainer,
    orbContainer: grounds.getMiddlegroundContainer(),
    platforms,
  });
  playfieldContainer.addChild(enemyChargeSprite);
  playfieldContainer.addChild(projectileContainer);
  const meteorSwirlShotGraphics = new Graphics();
  playfieldContainer.addChild(meteorSwirlShotGraphics);
  const meteorOrbChargePreviewGraphics = new Graphics();
  playfieldContainer.addChild(meteorOrbChargePreviewGraphics);
  playfieldContainer.addChild(butterflyContainer);

  // Add ground foreground container (cottage overlay, etc.) above player
  playfieldContainer.addChild(grounds.getForegroundContainer());

  // Place wind on the sky layer: between sky (index 0) and forest/transition (index 1)
  backgrounds.getRoot().addChildAt(windSprite, 1);

  // Enemy systems
  const enemyPhysics = new EnemyPhysics({
    groundSurface: initialGround - playerRadius,
  });

  const enemyMovement = new EnemyMovement({
    initialY: initialGround - playerRadius,
  });

  const laserPhysics = new LaserPhysics(
    app.renderer.width,
    app.renderer.height,
    initialGround - playerRadius,
    enemyX
  );
  let laserScore = 0;
  let introComplete = false;

  // Laser visuals - create custom textures with edge pixels
  const beamHeight = LASER_HEIGHT;

  // Enemy laser texture - solid red
  const enemyLaserCanvas = document.createElement('canvas');
  enemyLaserCanvas.width = LASER_WIDTH;
  enemyLaserCanvas.height = beamHeight;
  const enemyLaserCtx = enemyLaserCanvas.getContext('2d')!;
  enemyLaserCtx.fillStyle = '#ff4040'; // Red
  enemyLaserCtx.fillRect(0, 0, LASER_WIDTH, beamHeight);
  const enemyBeamTexture = Texture.from(enemyLaserCanvas);

  // Player laser texture - blue with 4-pixel white block on the right
  const playerLaserCanvas = document.createElement('canvas');
  playerLaserCanvas.width = PROJECTILE_WIDTH;
  playerLaserCanvas.height = PROJECTILE_HEIGHT;
  const playerLaserCtx = playerLaserCanvas.getContext('2d')!;
  playerLaserCtx.fillStyle = '#4fc3f7'; // Blue
  playerLaserCtx.fillRect(0, 0, PROJECTILE_WIDTH, PROJECTILE_HEIGHT);
  playerLaserCtx.fillStyle = '#ffffff'; // White 4-pixel block on right edge
  playerLaserCtx.fillRect(PROJECTILE_WIDTH - 4, 0, 4, PROJECTILE_HEIGHT);
  const playerBeamTexture = Texture.from(playerLaserCanvas);

  const laserSprites: Sprite[] = [];

  const triggerFallIntoHole = (currentVelocity: number, plumeX: number, plumeY: number) => {
    // Disable ground collision and let player fall through
    // The respawn state machine will handle the rest when player falls below screen
    fallingIntoHole = true;
    respawnInputLocked = true;
    physics.setMousePosition(physics.getState().x);
    physics.clearSurfaceOverride();
    physics.setGroundCollisionEnabled(false);
    physics.forceVelocity(Math.max(300, Math.abs(currentVelocity) + 150));
    dashChargeActive = false;
    dashChargeReturning = false;
    hasLandedOnFirstPlatform = false;
    firstZoomProgress = 0;
    lateZoomProgress = 0;
    panEaseProgress = 0;
    enemyHoverZoomTriggered = false;
    zoomHoldUntilEnemyHover = false;
    holeExitCameraEaseActive = false;
    holeExitCameraEaseStart = 0;
    respawnHoldProgress = 0;
    respawnHoldActive = false;
    respawnHoldStartZoom = 1.0;
    respawnLandProgress = 0;
    respawnLandActive = false;
    lastLandedSequenceIndex = null;
    jumpDust.spawnSmokePlume(plumeX, plumeY);
    console.log('[HOLE] Player falling into hole, ground collision disabled');
  };

  // Check if debug UI should be shown (development only)
  const SHOW_DEBUG_UI = import.meta.env.VITE_SHOW_DEBUG_UI === 'true';
  const SHOW_HITBOXES = import.meta.env.VITE_SHOW_HITBOXES === 'true';
  const HITBOX_DEFAULT_VISIBLE: boolean = false;
  let DEBUG_DRAW_HITBOXES: boolean = SHOW_DEBUG_UI && SHOW_HITBOXES && HITBOX_DEFAULT_VISIBLE;
  const DEBUG_PLATFORM_SNAP = SHOW_DEBUG_UI;
  let platformSnapLogTime = 0;
  const logPlatformSnap = (message: string, data?: Record<string, unknown>, throttleMs?: number) => {
    if (!DEBUG_PLATFORM_SNAP) return;
    const now = performance.now();
    if (throttleMs !== undefined && now - platformSnapLogTime < throttleMs) return;
    if (throttleMs !== undefined) platformSnapLogTime = now;
    if (data) {
      console.log(`[PLATFORM SNAP] ${message}`, data);
    } else {
      console.log(`[PLATFORM SNAP] ${message}`);
    }
  };

  debugPlatformHitboxContainer.visible = DEBUG_DRAW_HITBOXES;

  // Debug hitbox overlay
  const hitboxOverlay = SHOW_DEBUG_UI ? new Graphics() : null;
  if (hitboxOverlay) {
    hitboxOverlay.visible = DEBUG_DRAW_HITBOXES;
    playfieldContainer.addChild(hitboxOverlay);
  }
  const hitboxLogCache = new Map<number, string>();

  // Start enemy dormant; it will roll in later and then run its jump intro
  let enemyMode: 'physics' | 'hover' | 'sleep' = 'sleep';

  let dustRevealStartTime: number | null = null;
  const DUST_FADE_DURATION = 5000; // 5 seconds
  const TRANSITION_VISIBLE_THRESHOLD = 0.15; // Start dust when transition is ~15% visible

  // Jump dust tracking
  let wasGrounded = false;
  let previousVelocity = 0;

  // Platform jump tracking - prevent fall-through on jump execution
  let lastJumpTime = 0;
  const JUMP_GRACE_PERIOD = 380; // ms - ignore downward movement for this long after jump

  // Platform fall-through control - Down arrow key to drop through platforms
  let isPressingDown = false;

  // Camera tracking - locks to platform heights and follows player downward
  let cameraY = 0; // Current camera Y offset
  let cameraFloorY = Infinity; // The Y position the camera is locked to (follows player if they go below this)
  const CAMERA_LERP_SPEED = 0.15; // How quickly camera follows (faster for downward tracking)
  const CAMERA_FOLLOW_THRESHOLD = 20; // How far below floor before camera starts following down
  const CAMERA_TOP_MARGIN = 100; // Keep player at least this many pixels from top of screen
  let backgroundParallaxY = 0; // Smoothed sky parallax to prevent jumpy camera transitions
  let backgroundZoomCurrent = 1.0;
  let holeExitCameraEaseActive = false;
  let holeExitCameraEaseStart = 0;
  let zoomHoldUntilEnemyHover = false;
  let enemyHoverZoomTriggered = false;
  const HOLE_EXIT_CAMERA_EASE_DURATION = 2.5; // seconds
  const RESPAWN_HOLD_ZOOM_DURATION = 4; // Seconds to ease toward 0.9 after falling in
  const RESPAWN_LAND_ZOOM_DURATION = 2.5; // Seconds to ease from 0.9 -> 1.0 after landing
  const RESPAWN_HOLD_ZOOM = 0.9; // Hold zoom during respawn until player is set down

  // Minimap setup - picture-in-picture zoomed-out view (dev only)
  const MINIMAP_WIDTH = 450;
  const MINIMAP_HEIGHT = 200;
  let minimapZoom = 0.02; // Show ~8.3x more area (adjustable with +/- buttons)
  const MINIMAP_PADDING = 20;
  let minimapPanWorldX = 0;
  let minimapPanWorldY = 0;
  let minimapDragging = false;
  let minimapDragLastX = 0;
  let minimapDragLastY = 0;
  let minimapDragStartX = 0;
  let minimapDragStartY = 0;
  let minimapDragMoved = false;

  // Create render texture for minimap (only if debug UI enabled)
  const minimapRenderTexture = SHOW_DEBUG_UI ? RenderTexture.create({
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
  }) : null;

  // Create sprite to display the minimap
  const minimapSprite = SHOW_DEBUG_UI ? new Sprite(minimapRenderTexture!) : null;
  if (minimapSprite) {
    minimapSprite.x = app.renderer.width - MINIMAP_WIDTH - MINIMAP_PADDING;
    minimapSprite.y = MINIMAP_PADDING;
  }

  // Create border for minimap
  const minimapBorder = SHOW_DEBUG_UI ? new Graphics() : null;
  if (minimapBorder) {
    minimapBorder.rect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    minimapBorder.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    minimapBorder.position.set(minimapSprite!.x, minimapSprite!.y);
  }

  // Create semi-transparent background for minimap
  const minimapBackground = SHOW_DEBUG_UI ? new Graphics() : null;
  if (minimapBackground) {
    minimapBackground.rect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    minimapBackground.fill({ color: 0x000000, alpha: 0.3 });
    minimapBackground.position.set(minimapSprite!.x, minimapSprite!.y);
  }

  // Add minimap to stage (on top of everything) - only if debug UI enabled
  if (SHOW_DEBUG_UI && minimapBackground && minimapSprite && minimapBorder) {
    app.stage.addChild(minimapBackground);
    app.stage.addChild(minimapSprite);
    app.stage.addChild(minimapBorder);
  }

  // Hitbox toggle button (debug mode only)
  let hitboxToggleButton: HTMLButtonElement | null = null;
  if (SHOW_DEBUG_UI) {
    hitboxToggleButton = document.createElement('button');
    hitboxToggleButton.id = 'hitboxToggleButton';
    hitboxToggleButton.className = 'transition-btn';
    hitboxToggleButton.textContent = DEBUG_DRAW_HITBOXES ? 'Hide Hitboxes' : 'Show Hitboxes';
    hitboxToggleButton.style.top = '104px';

    hitboxToggleButton.addEventListener('click', () => {
      DEBUG_DRAW_HITBOXES = !DEBUG_DRAW_HITBOXES;
      hitboxToggleButton!.textContent = DEBUG_DRAW_HITBOXES ? 'Hide Hitboxes' : 'Show Hitboxes';
      debugPlatformHitboxContainer.visible = DEBUG_DRAW_HITBOXES;
      if (hitboxOverlay) {
        hitboxOverlay.visible = DEBUG_DRAW_HITBOXES;
      }
    });

    document.body.appendChild(hitboxToggleButton);
  }

  const getPointerCanvasPosition = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const scaleX = app.renderer.width / rect.width;
    const scaleY = app.renderer.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const screenToWorldX = (screenX: number) => {
    const safeZoom = Math.max(0.0001, cameraZoom);
    const adjustedX = screenX - scene.position.x - cameraPanX - treehousePanX - specialCameraPanX;
    return adjustedX / safeZoom;
  };

  const getCottageStartSegment = () => {
    const segments = grounds.getSegments();
    for (const segment of segments) {
      if (segment.type !== 'cottage_start') continue;
      return segment;
    }
    return null;
  };

  const getEnemyTargetX = () => screenToWorldX(app.renderer.width * 0.9);
  const startRespawnEaseToCursor = () => {
    respawnEaseActive = true;
    respawnEaseStartTime = performance.now();
    respawnEaseStartX = physics.getState().x;
    const pointerX = app.renderer.events.pointer?.global?.x ?? app.renderer.width * 0.5;
    physics.setSoftFollowMode(true);
    physics.setMousePosition(screenToWorldX(pointerX));
  };
  const startDashCharge = (startX: number) => {
    dashChargeActive = true;
    dashChargeReturning = false;
    dashChargeStartTime = performance.now();
    dashChargeStartX = startX;
    const targetX = enemyBall.position.x - (playerRadius + DASH_TARGET_BUFFER);
    dashChargeTargetX = Math.max(startX, targetX);
    parallaxBoostActive = false;
  };

  const showLevelOverlay = (subtitle: string) => {
    levelOverlaySubtitle.textContent = subtitle;
    levelOverlay.style.opacity = '1';
  };

  const hideLevelOverlay = () => {
    levelOverlay.style.opacity = '0';
  };

  const resetSpecialOutState = () => {
    specialOutActive = false;
    specialOutNumber = 0;
    specialChargeStage = 'idle';
    specialWindupStart = 0;
    specialChargeStart = 0;
    specialChargeStartX = 0;
    specialChargeTargetX = 0;
    specialOriginalEnemyX = 0;
    specialHitWallStart = 0;
    specialReturnStart = 0;
    specialReturnFromX = 0;
    specialReturnToX = 0;
    specialPostReturnStart = 0;
    specialSmallJumpStart = 0;
    specialSmallJumpTriggered = false;
    specialMidJumpTriggered = false;
    specialLargeJumpTriggered = false;
    specialLastCollisionAt = 0;
    finalSequenceActive = false;
    finalReturning = false;
    finalNextChargeTime = 0;
    finalChargeActive = false;
    finalChargeStart = 0;
    finalChargeStartX = 0;
    finalChargeTargetX = 0;
    finalLastCollisionTime = 0;
    stopScrollForFinal = false;
  };

  const beginSpecialOutSequence = (outNumber: 4 | 7 | 10) => {
    if (finalTransitionActive) return;
    specialOutActive = true;
    specialOutNumber = outNumber;
    specialChargeStage = 'windup';
    specialWindupStart = 0;
    specialOriginalEnemyX = enemyBall.position.x;
    specialHitWallStart = 0;
    specialSmallJumpTriggered = false;
    specialMidJumpTriggered = false;
    specialLargeJumpTriggered = false;
    specialLastCollisionAt = 0;
    finalSequenceActive = false;
    finalReturning = false;
    finalChargeActive = false;
    finalChargeStart = 0;
    finalChargeStartX = 0;
    finalChargeTargetX = 0;
    finalLastCollisionTime = 0;
    redEnemyState = 'shooting';
    enemyIntroMoveActive = false;
    enemyMode = 'physics';
    const specialGroundY = computePlayerGround() - playerRadius;
    enemyPhysics.setGroundSurface(specialGroundY);
    enemyPhysics.enablePhysicsMode(enemyBall.position.y, 220);
    introComplete = true;
    scenarioActive = false;
    scenarioStage = 'idle';
    megaLaserActive = false;
    treehouseEnemyHidden = false;
    treehouseEnemyReturnActive = false;
    treehouseEnemyReturnStart = 0;
    treehouseEnemyAutoEaseActive = false;
    treehouseEnemyAutoEaseStart = 0;
    treehouseEnemyExitActive = false;
    treehouseEnemyExitStart = 0;

    if (outNumber === 10) {
      stopScrollForFinal = true;
      finalScrollSlowdownStart = performance.now();
    }
  };

  const maybeTriggerSpecialOut = (previousOuts: number, nextOuts: number) => {
    if (!specialOutActive && previousOuts < 4 && nextOuts >= 4) {
      beginSpecialOutSequence(4);
      return;
    }
    if (!specialOutActive && previousOuts < 7 && nextOuts >= 7) {
      beginSpecialOutSequence(7);
      return;
    }
    if (!specialOutActive && previousOuts < 10 && nextOuts >= 10) {
      beginSpecialOutSequence(10);
    }
  };

  const applyGrowthFromRedOuts = (outsGained: number) => {
    if (outsGained <= 0) return;
    enemyGrowthLevel = Math.min(MAX_GROWTH_LEVELS, enemyGrowthLevel + outsGained);
    playerGrowthLevel = Math.max(0, playerGrowthLevel - outsGained);
  };

  const applyGrowthFromBlueOuts = (outsGained: number) => {
    if (outsGained <= 0) return;
    playerGrowthLevel = Math.min(MAX_GROWTH_LEVELS, playerGrowthLevel + outsGained);
    enemyGrowthLevel = Math.max(0, enemyGrowthLevel - outsGained);
  };

  const applyRedHits = (hits: number) => {
    if (hits <= 0) return;
    redHits += hits;
    if (redHits >= HITS_PER_OUT) {
      const previousOuts = redOuts;
      const outsGained = Math.floor(redHits / HITS_PER_OUT);
      redOuts = Math.min(10, redOuts + outsGained);
      redHits = redHits % HITS_PER_OUT;
      const appliedOuts = Math.max(0, redOuts - previousOuts);
      applyGrowthFromRedOuts(appliedOuts);
      maybeTriggerSpecialOut(previousOuts, redOuts);
    }
    if (!firstOutMade && (redOuts + blueOuts) > 0) {
      firstOutMade = true;
    }
    updateScoreUI();
  };

  const applyBlueHits = (hits: number) => {
    if (hits <= 0) return;
    blueHits += hits;
    if (blueHits >= HITS_PER_OUT) {
      const outsGained = Math.floor(blueHits / HITS_PER_OUT);
      blueHits = blueHits % HITS_PER_OUT;
      applyBlueOutPenalty(outsGained);
    }
    if (!firstOutMade && (blueOuts + redOuts) > 0) {
      firstOutMade = true;
    }
    updateScoreUI();
  };

  const applyBlueOutPenalty = (outs: number) => {
    if (outs <= 0) return;
    const previousOuts = blueOuts;
    blueOuts = Math.min(10, blueOuts + outs);
    const appliedOuts = Math.max(0, blueOuts - previousOuts);
    applyGrowthFromBlueOuts(appliedOuts);
    updateScoreUI();
  };

  const isPointerOverMinimap = (event: PointerEvent): boolean => {
    if (!SHOW_DEBUG_UI || !minimapSprite) return false;
    const { x, y } = getPointerCanvasPosition(event);
    return (
      x >= minimapSprite.x &&
      x <= minimapSprite.x + MINIMAP_WIDTH &&
      y >= minimapSprite.y &&
      y <= minimapSprite.y + MINIMAP_HEIGHT
    );
  };

  const updateMinimapCursor = (event: PointerEvent) => {
    if (!SHOW_DEBUG_UI || !minimapSprite) return;
    if (event.pointerType !== 'mouse') return;
    const overMinimap = isPointerOverMinimap(event);
    if (minimapDragging) {
      app.canvas.style.cursor = 'grabbing';
    } else if (overMinimap) {
      app.canvas.style.cursor = 'grab';
    } else {
      app.canvas.style.cursor = '';
    }
  };

  // Minimap zoom control buttons (on top of minimap)
  if (SHOW_DEBUG_UI && minimapSprite) {
    const buttonSize = 30;
    const buttonPadding = 5;
    const minimapRight = minimapSprite.x + MINIMAP_WIDTH;
    const minimapBottom = minimapSprite.y + MINIMAP_HEIGHT;

    // Zoom In (+) button - bottom right of minimap
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.style.position = 'absolute';
    zoomInBtn.style.width = `${buttonSize}px`;
    zoomInBtn.style.height = `${buttonSize}px`;
    zoomInBtn.style.right = `${app.renderer.width - minimapRight + buttonPadding}px`;
    zoomInBtn.style.top = `${minimapBottom - buttonSize - buttonPadding}px`;
    zoomInBtn.style.fontSize = '18px';
    zoomInBtn.style.fontWeight = 'bold';
    zoomInBtn.style.padding = '0';
    zoomInBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    zoomInBtn.style.color = 'white';
    zoomInBtn.style.border = '1px solid white';
    zoomInBtn.style.cursor = 'pointer';
    zoomInBtn.style.zIndex = '1000';
    zoomInBtn.addEventListener('click', () => {
      minimapZoom = Math.min(1.0, minimapZoom * 1.1); // Zoom in 10%
    });
    document.body.appendChild(zoomInBtn);

    // Zoom Out (-) button - left of zoom in button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '-';
    zoomOutBtn.style.position = 'absolute';
    zoomOutBtn.style.width = `${buttonSize}px`;
    zoomOutBtn.style.height = `${buttonSize}px`;
    zoomOutBtn.style.right = `${app.renderer.width - minimapRight + buttonSize + buttonPadding * 2}px`;
    zoomOutBtn.style.top = `${minimapBottom - buttonSize - buttonPadding}px`;
    zoomOutBtn.style.fontSize = '18px';
    zoomOutBtn.style.fontWeight = 'bold';
    zoomOutBtn.style.padding = '0';
    zoomOutBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    zoomOutBtn.style.color = 'white';
    zoomOutBtn.style.border = '1px solid white';
    zoomOutBtn.style.cursor = 'pointer';
    zoomOutBtn.style.zIndex = '1000';
    zoomOutBtn.addEventListener('click', () => {
      minimapZoom = Math.max(0.005, minimapZoom * 0.9); // Zoom out 10%
    });
    document.body.appendChild(zoomOutBtn);
  }

  /**
   * Update spawn indices based on player position
   * Determines which spawn point is "current" (player passed it) and "next" (ahead of player)
   */
  const updateSpawnIndices = () => {
    const playerX = physics.getState().x;

    // Get current ground segments to check spawn positions
    const segments = grounds.getSegments();

    const prevIndex = currentSpawnIndex;
    currentSpawnIndex = -1;

    // Update spawnPoints array with current segment positions (for culling)
    // This ensures the culling function uses real-time scrolling positions
    const meteorSegment = segments.find((seg: any) => seg.type === 'meteor_transition');
    const holeBackSegment = segments.find((seg: any) => seg.type === 'hole_transition_back');

    if (meteorSegment && holeBackSegment) {
      const firstSpawnX = meteorSegment.x;
      const secondSpawnX = holeBackSegment.x + holeBackSegment.width - 100;

      // Update spawn points with current positions (keeps array sorted)
      spawnPoints = [firstSpawnX, secondSpawnX];
    }

    // Check first spawn: meteor_transition segment start
    if (meteorSegment && meteorSegment.x < playerX) {
      currentSpawnIndex = 0;
    }

    // Check second spawn: end of hole_transition_back segment (100px from right edge)
    if (holeBackSegment) {
      const secondSpawnX = holeBackSegment.x + holeBackSegment.width - 100;
      if (secondSpawnX < playerX) {
        currentSpawnIndex = 1;
      }
    }

    // Log ONLY when we pass a spawn point for the first time (index changes)
    if (currentSpawnIndex !== prevIndex && currentSpawnIndex >= 0) {
      console.log(`[SPAWN PASSED] ✅ Player passed spawn ${currentSpawnIndex + 1} (playerX=${playerX.toFixed(0)})`);

      // Special log for second spawn - disable hole area protection to allow culling
      if (currentSpawnIndex === 1) {
        console.log(`[SECOND SPAWN] ✅✅✅ PASSED SECOND SPAWN! Now culling should begin for old assets.`);
        cometHoleLevelActive = false; // Disable hole area protection so spawn-based culling works
        zoomHoldUntilEnemyHover = enemyMode !== 'hover' && !enemyHoverZoomTriggered;
        console.log(`[CULLING] Hole area protection disabled - old assets can now be culled`);
        console.log(`[CULLING] Current spawn points:`, spawnPoints.map(x => x.toFixed(0)));
        console.log(`[CULLING] Player X: ${playerX.toFixed(0)}, currentSpawnIndex: ${currentSpawnIndex}, nextSpawnIndex: ${nextSpawnIndex}`);
      }
    }

    // Next spawn is the one ahead
    nextSpawnIndex = currentSpawnIndex + 1;
  };

  /**
   * Determine if an object should be culled based on spawn points
   * @param objectX Object's world X position
   * @param objectWidth Object's width
   * @returns true if should be culled (removed), false if should be kept
   */
  const shouldCullObject = (objectX: number, objectWidth: number): boolean => {
    const screenWidth = app.renderer.width;
    const playerX = physics.getState().x;
    const objectRight = objectX + objectWidth;

    // Add buffer to ensure objects are COMPLETELY off-screen before culling
    // Wait for one full ground segment width past the left edge of screen
    const CULL_BUFFER = screenWidth * 1.5; // Extra buffer to ensure object is fully invisible
    const KEEP_GROUNDS_BEFORE_SPAWN = 2; // Keep two ground segments before the last spawn
    const KEEP_BEFORE_SPAWN_DISTANCE = screenWidth * KEEP_GROUNDS_BEFORE_SPAWN;

    // NEVER cull during respawn (player rewinding to spawn)
    if (respawnState !== 'normal') return false;

    // NEVER cull hole area while hole level is active
    if (cometHoleLevelActive && leftmostHoleX !== Infinity) {
      const inHoleArea = objectRight >= leftmostHoleX && objectX <= rightmostHoleX;
      if (inHoleArea) return false;
    }

    // Case 1: No spawn points yet or player is before the first spawn
    // Use normal culling - remove when off-screen to the left with buffer
    if (spawnPoints.length === 0 || currentSpawnIndex < 0) {
      const cullBoundary = playerX - CULL_BUFFER;
      return objectRight < cullBoundary;
    }

    // Case 2: We have spawn points
    const currentSpawn = spawnPoints[currentSpawnIndex];
    const nextSpawn = nextSpawnIndex < spawnPoints.length ? spawnPoints[nextSpawnIndex] : null;
    const currentKeepStart = currentSpawn - KEEP_BEFORE_SPAWN_DISTANCE;

    // If we're between spawns, keep the interval plus two grounds before the current spawn
    if (nextSpawn !== null && playerX < nextSpawn) {
      const inProtectedRange = objectRight >= currentKeepStart && objectX <= nextSpawn;
      if (inProtectedRange) return false;
      const cullBoundary = Math.min(playerX - CULL_BUFFER, currentKeepStart);
      return objectRight < cullBoundary;
    }

    // Once we pass the last spawn, aggressively cull everything behind us
    // except what's visible on screen (normal off-screen culling)
    const cullBoundary = playerX - CULL_BUFFER;
    return objectRight < cullBoundary;
  };

  const updateMeteorHitbox = (meteorBounds: { x: number; width: number; height: number }) => {
    const hitboxX = meteorBounds.x + 50;
    const hitboxWidth = 420;
    const groundY = computePlayerGround();
    const hitboxSurfaceY = groundY - 160;

    if (!meteorHitbox) {
      meteorHitbox = {
        x: hitboxX,
        width: hitboxWidth,
        surfaceY: hitboxSurfaceY,
      };
      console.log(
        `[METEOR HITBOX] Created at x=${hitboxX.toFixed(0)} surfaceY=${hitboxSurfaceY.toFixed(0)} width=${hitboxWidth}px (groundY=${groundY.toFixed(0)})`
      );
      return;
    }

    meteorHitbox.x = hitboxX;
    meteorHitbox.width = hitboxWidth;
    meteorHitbox.surfaceY = hitboxSurfaceY;
  };

  const getTreehousePlatforms = (): TreehousePlatform[] => {
    const hitboxes = grounds.getTreehouseHitboxes();
    return hitboxes.map((hitbox, index) => {
      const width = hitbox.width;
      const height = hitbox.height;
      const centerX = hitbox.left + width / 2;
      const centerY = hitbox.top + height / 2;
      return {
        id: TREEHOUSE_PLATFORM_ID_BASE + index,
        left: hitbox.left,
        right: hitbox.right,
        top: hitbox.top,
        bottom: hitbox.bottom,
        width,
        height,
        centerX,
        centerY,
        halfWidth: width / 2,
        halfHeight: height / 2,
        rotation: hitbox.rotation ?? 0,
        key: hitbox.key,
      };
    });
  };

  const getMeteorSwirlOrbBaseSize = () => Math.max(7, playerRadius * 0.22);

  const spawnMeteorSwirlOrbs = (area: { left: number; right: number; top: number; bottom: number }) => {
    meteorSwirlOrbs.length = 0;
    meteorSwirlFollowers.length = 0;
    meteorSwirlShots.length = 0;
    for (let i = 0; i < METEOR_SWIRL_ORB_COUNT; i += 1) {
      const t = (i + 1) / (METEOR_SWIRL_ORB_COUNT + 1);
      const jitterX = (Math.random() - 0.5) * 110;
      const jitterY = (Math.random() - 0.5) * 90;
      const radius =
        METEOR_SWIRL_ORB_RADIUS_MIN +
        Math.random() * (METEOR_SWIRL_ORB_RADIUS_MAX - METEOR_SWIRL_ORB_RADIUS_MIN);
      const speed =
        METEOR_SWIRL_ORB_SPEED_MIN +
        Math.random() * (METEOR_SWIRL_ORB_SPEED_MAX - METEOR_SWIRL_ORB_SPEED_MIN);
      const spreadT = METEOR_SWIRL_ORB_COUNT > 1 ? i / (METEOR_SWIRL_ORB_COUNT - 1) : 0.5;
      const baseSizeScale =
        METEOR_SWIRL_ORB_SIZE_MIN +
        (METEOR_SWIRL_ORB_SIZE_MAX - METEOR_SWIRL_ORB_SIZE_MIN) * spreadT;
      const sizeScale = Math.max(
        METEOR_SWIRL_ORB_SIZE_MIN,
        Math.min(
          METEOR_SWIRL_ORB_SIZE_MAX,
          baseSizeScale + (Math.random() - 0.5) * METEOR_SWIRL_ORB_SIZE_JITTER * 2
        )
      );
      meteorSwirlOrbs.push({
        id: i,
        offsetX: t,
        offsetY: 0.35 + Math.random() * 0.4,
        jitterX,
        jitterY,
        radius,
        arc: METEOR_SWIRL_ORB_ARC + Math.random() * 0.6,
        speed,
        phase: Math.random() * Math.PI * 2,
        sizeScale,
        currentX: area.left + (area.right - area.left) * t,
        currentY: area.top + (area.bottom - area.top) * 0.6,
        collected: false,
      });
    }
    meteorSwirlSpawned = true;
  };


  const getTreehouseLocalPoint = (
    x: number,
    y: number,
    platform: { centerX: number; centerY: number; rotation: number },
    cos: number,
    sin: number
  ) => {
    const dx = x - platform.centerX;
    const dy = y - platform.centerY;
    return {
      x: dx * cos + dy * sin,
      y: -dx * sin + dy * cos,
    };
  };

  const getTreehouseSurfaceYForPlayer = (
    platform: { centerX: number; centerY: number; halfWidth: number; halfHeight: number; rotation: number },
    playerCenterX: number,
    playerCenterY: number
  ) => {
    const cos = Math.cos(platform.rotation);
    const sin = Math.sin(platform.rotation);
    const localCenter = getTreehouseLocalPoint(playerCenterX, playerCenterY, platform, cos, sin);
    const clampedLocalX = Math.min(platform.halfWidth, Math.max(-platform.halfWidth, localCenter.x));
    const localY = -platform.halfHeight;
    const worldY = platform.centerY + clampedLocalX * sin + localY * cos;
    return worldY - playerDiameter - TREEHOUSE_SURFACE_EXTRA;
  };

  const getTreehouseBlendSurfaceForActive = (
    activeId: number | null,
    platformsToCheck: TreehousePlatform[],
    bounds: PlayerBounds
  ) => {
    if (activeId === null) return null;
    const primary = platformsToCheck.find((platform) => platform.id === activeId);
    if (!primary) return null;
    const playerCenterX = (bounds.left + bounds.right) / 2;
    const playerCenterY = (bounds.top + bounds.bottom) / 2;
    const primarySurfaceY = getTreehouseSurfaceYForPlayer(primary, playerCenterX, playerCenterY);
    return primarySurfaceY;
  };

  const getTreehousePathSurfaceAt = (
    platformsToCheck: TreehousePlatform[],
    bounds: PlayerBounds
  ): { platform: TreehousePlatform; surfaceY: number } | null => {
    const playerCenterX = (bounds.left + bounds.right) / 2;
    const playerCenterY = (bounds.top + bounds.bottom) / 2;
    let best: { platform: TreehousePlatform; surfaceY: number; distance: number; localDistance: number } | null = null;

    for (const platform of platformsToCheck) {
      if (!platform.key?.startsWith('tree_path_')) continue;
      const cos = Math.cos(platform.rotation);
      const sin = Math.sin(platform.rotation);
      const local = getTreehouseLocalPoint(playerCenterX, playerCenterY, platform, cos, sin);
      if (
        local.x < -platform.halfWidth - PLATFORM_EDGE_TOLERANCE ||
        local.x > platform.halfWidth + PLATFORM_EDGE_TOLERANCE
      ) {
        continue;
      }
      const distanceToSurface = Math.abs(local.y + platform.halfHeight);
      if (distanceToSurface > TREEHOUSE_RAMP_STEP) continue;
      const surfaceY = getTreehouseSurfaceYForPlayer(platform, playerCenterX, playerCenterY);
      const localDistance = Math.abs(local.x);
      if (
        !best ||
        distanceToSurface < best.distance ||
        (distanceToSurface === best.distance && localDistance < best.localDistance)
      ) {
        best = { platform, surfaceY, distance: distanceToSurface, localDistance };
      }
    }

    return best ? { platform: best.platform, surfaceY: best.surfaceY } : null;
  };

  const isTreehousePlatformHorizontalOverlap = (
    platform: { halfWidth: number; rotation: number; centerX: number; centerY: number },
    bounds: PlayerBounds
  ) => {
    if (!platform.rotation) {
      return (
        bounds.right >= platform.centerX - platform.halfWidth - PLATFORM_EDGE_TOLERANCE &&
        bounds.left <= platform.centerX + platform.halfWidth + PLATFORM_EDGE_TOLERANCE
      );
    }
    const cos = Math.cos(platform.rotation);
    const sin = Math.sin(platform.rotation);
    const playerCenterX = (bounds.left + bounds.right) / 2;
    const playerCenterY = (bounds.top + bounds.bottom) / 2;
    const local = getTreehouseLocalPoint(playerCenterX, playerCenterY, platform, cos, sin);
    return (
      local.x >= -platform.halfWidth - PLATFORM_EDGE_TOLERANCE &&
      local.x <= platform.halfWidth + PLATFORM_EDGE_TOLERANCE
    );
  };

  const isTreehouseSurfaceContact = (
    surfaceY: number,
    bounds: PlayerBounds,
    platformsToCheck: Array<{ centerX: number; centerY: number; halfWidth: number; halfHeight: number; rotation: number }>
  ) => {
    const playerHeight = bounds.bottom - bounds.top;
    const expectedBottom = surfaceY + playerHeight;
    const verticalMatch = Math.abs(bounds.bottom - expectedBottom) <= TREEHOUSE_VERTICAL_LOCK;
    if (!verticalMatch) return false;
    const playerCenterX = (bounds.left + bounds.right) / 2;
    const playerCenterY = (bounds.top + bounds.bottom) / 2;
    return platformsToCheck.some((platform) => {
      if (!isTreehousePlatformHorizontalOverlap(platform, bounds)) return false;
      const platformSurface = getTreehouseSurfaceYForPlayer(platform, playerCenterX, playerCenterY);
      return Math.abs(surfaceY - platformSurface) <= TREEHOUSE_BLEND_HEIGHT;
    });
  };

  const getTreehousePlatformsPassedThrough = (
    platformsToCheck: TreehousePlatform[],
    currentBounds: PlayerBounds,
    previousBounds: PlayerBounds,
    playerVelocity: number
  ): number[] => {
    const platformsPassed: number[] = [];

    if (playerVelocity >= 0) return platformsPassed;

    const playerHeight = currentBounds.bottom - currentBounds.top;
    const tolerance = Math.max(2, playerHeight * 0.05);
    const detectionRange = 800;
    const playerCenterX = (currentBounds.left + currentBounds.right) / 2;
    const playerCenterY = (currentBounds.top + currentBounds.bottom) / 2;

    for (const platform of platformsToCheck) {
      const platformLeft = platform.left;
      const platformRight = platform.right;
      const platformCenterX = (platformLeft + platformRight) / 2;
      const horizontalDistance = Math.abs(platformCenterX - playerCenterX);
      const withinRange = horizontalDistance < detectionRange;
      const horizontalOverlap = isTreehousePlatformHorizontalOverlap(platform, currentBounds);
      if (!withinRange && !horizontalOverlap) continue;

      const surfaceY = getTreehouseSurfaceYForPlayer(platform, playerCenterX, playerCenterY);
      const isBelowAndAscending = currentBounds.top > surfaceY;
      const wasBelow = previousBounds.top > surfaceY;
      const isNowAbove = currentBounds.bottom <= surfaceY + playerHeight;
      const crossedThisFrame = wasBelow && isNowAbove;
      const verticallyOverlapping =
        currentBounds.top <= surfaceY + tolerance &&
        currentBounds.bottom >= surfaceY - tolerance;

      if (isBelowAndAscending || crossedThisFrame || verticallyOverlapping) {
        platformsPassed.push(platform.id);
      }
    }

    return platformsPassed;
  };

  const getSupportingTreehousePlatform = (
    platformsToCheck: TreehousePlatform[],
    currentBounds: PlayerBounds,
    previousBounds: PlayerBounds,
    playerVelocity: number,
    platformsJumpedThrough: Set<number>
  ): { id: number; left: number; right: number; surfaceY: number } | null => {
    const playerHeight = currentBounds.bottom - currentBounds.top;
    const tolerance = Math.max(2, playerHeight * 0.05);
    const playerCenterX = (currentBounds.left + currentBounds.right) / 2;
    const playerCenterY = (currentBounds.top + currentBounds.bottom) / 2;

    for (const platform of platformsToCheck) {
      const horizontalOverlap = isTreehousePlatformHorizontalOverlap(platform, currentBounds);
      if (!horizontalOverlap) continue;

      const surfaceY = getTreehouseSurfaceYForPlayer(platform, playerCenterX, playerCenterY);
      const platformBottomCollision = surfaceY + playerHeight;

      const descending = playerVelocity <= 0 || currentBounds.bottom > previousBounds.bottom;
      const approachingFromAbove = previousBounds.top + tolerance <= surfaceY;
      const wasJumpedThrough = platformsJumpedThrough.has(platform.id);
      const effectiveApproaching = approachingFromAbove || wasJumpedThrough;
      const crossedThisFrame =
        descending &&
        effectiveApproaching &&
        previousBounds.bottom <= platformBottomCollision - tolerance &&
        currentBounds.bottom >= platformBottomCollision - tolerance;
      const resting =
        Math.abs(currentBounds.bottom - platformBottomCollision) <= tolerance &&
        Math.abs(playerVelocity) < 0.8 &&
        currentBounds.bottom <= platformBottomCollision + tolerance;

      if (crossedThisFrame || resting) {
        return {
          id: platform.id,
          surfaceY,
          left: platform.left,
          right: platform.right,
        };
      }
    }

    return null;
  };

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;
    if (loadingScreenActive) {
      return;
    }
    if (pendingIntroReset) {
      playerIntroPhase = 'initial';
      playerIntroStartTime = performance.now();
      playerIntroActive = true;
      introLandingLeftLockActive = false;
      introLandingLeftLockX = 0;
      introLandingLeftLockOffsetFromCottageX = 0;
      pendingIntroReset = false;
    }

    if (meetingRevealActive && meetingTitleContainer) {
      const now = performance.now();
      const elapsed = Math.max(0, now - meetingRevealStartTime);
      const revealProgress = Math.min(1, elapsed / MEETING_REVEAL_DURATION_MS);
      const revealEase = 1 - Math.pow(1 - revealProgress, 3);
      meetingTitleContainer.alpha = revealEase;
      meetingTitleContainer.position.y = meetingTitleBaseY + (1 - revealEase) * MEETING_RISE_PX;

      if (revealProgress >= 1) {
        meetingRevealActive = false;
      }
    }
    // Apply screen shake if active
    if (shakeActive) {
      const now = performance.now();
      if (now > shakeEndTime) {
        shakeActive = false;
        scene.position.set(0, 0);
      } else {
        const intensity = 6;
        scene.position.set((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
      }
    }

    if (energyRevealActive) {
      const elapsed = performance.now() - energyRevealStart;
      const t = Math.min(1, elapsed / (ENERGY_REVEAL_DURATION * 1000));
      const ease = 1 - Math.pow(1 - t, 3);
      energyDisplay = 100 * ease;
      updateEnergyUI();
      if (t >= 1) {
        energyRevealActive = false;
        energyDisplay = energy;
        updateEnergyUI();
      }
    }

    if (orbChargeActive) {
      const heldSeconds = (performance.now() - orbChargeStart) / 1000;
      const t = Math.min(1, heldSeconds / ORB_CHARGE_MAX_SECONDS);
      const chargeEase = 1 - Math.pow(1 - t, 3);
      meteorOrb.setChargeBoost(1 + chargeEase * ORB_CHARGE_SPEED_BOOST);
      const collapseT = t <= ORB_CHARGE_COLLAPSE_START
        ? 0
        : (t - ORB_CHARGE_COLLAPSE_START) / (1 - ORB_CHARGE_COLLAPSE_START);
      const collapseEase = collapseT * collapseT;
      meteorOrb.setChargeCollapse(1 - collapseEase);
      if (heldSeconds >= ORB_CHARGE_MAX_SECONDS) {
        fireChargedOrbShot(ORB_CHARGE_MAX_SECONDS);
        orbChargeActive = false;
        orbChargeKey = null;
        meteorOrb.setChargeBoost(1);
        meteorOrb.setChargeCollapse(1);
      }
    } else {
      meteorOrb.setChargeBoost(1);
      meteorOrb.setChargeCollapse(1);
    }

    // Respawn system - smooth animation-based approach
    let speedMultiplier = 1.0; // Default normal speed

    if (respawnState === 'normal') {
      // Check if player fell out of bounds (below screen)
      const playerY = physics.getState().y;
      if (playerY > app.renderer.height + 110) { // 110px buffer below screen
        console.log('[RESPAWN] Player fell out of bounds, entering dying state');

        // Capture death position in world coordinates
        deathPlayerX = physics.getState().x;
        respawnInputLocked = true;
        physics.setMousePosition(physics.getState().x);

        // Find CURRENT position of meteor_transition segment (the pink respawn box)
        const segments = grounds.getSegments();
        const meteorSegment = segments.find((seg: { type: string; x: number }) => seg.type === 'meteor_transition');
        if (meteorSegment) {
          spawnPointX = meteorSegment.x; // Update to CURRENT position, not initial spawn position
        }

        remainingRewindDistance = spawnPointX - deathPlayerX;
        respawnClampToScreen =
          scenarioActive ||
          megaLaserActive ||
          scenarioStage === 'prep' ||
          scenarioStage === 'charging' ||
          scenarioStage === 'firing';
        if (respawnClampToScreen) {
          const safeZoom = Math.max(0.0001, cameraZoom);
          respawnClampDistance = app.renderer.width / safeZoom;
          if (Math.abs(remainingRewindDistance) > respawnClampDistance) {
            remainingRewindDistance = Math.sign(remainingRewindDistance) * respawnClampDistance;
          }
        } else {
          respawnClampDistance = 0;
        }
        console.log(`[RESPAWN] Death: playerX=${deathPlayerX.toFixed(0)}, spawnX=${spawnPointX.toFixed(0)} (current meteor position), remaining=${remainingRewindDistance.toFixed(0)}px`);

        respawnState = 'dying';
        respawnTimer = 0;
        speedMultiplier = 1.0; // Continue at normal speed initially

        // CRITICAL: Disable gravity and freeze player physics immediately
        physics.setGroundCollisionEnabled(false);
        physics.forceVelocity(0);

        // Position player above screen at spawn X position (ready for respawn)
        ball.position.set(spawnPointX, RESPAWN_HEIGHT_ABOVE_SCREEN);

        // Hide player and shadow
        ball.visible = false;
        playerShadow.getView().visible = false;

        console.log(`[RESPAWN] Player frozen at spawn X=${spawnPointX.toFixed(0)}, Y=${RESPAWN_HEIGHT_ABOVE_SCREEN}`);
      } else {
        // Normal gameplay - use player-based speed multiplier
        speedMultiplier = physics.getScrollSpeedMultiplier();
      }
    }

    if (respawnState === 'dying') {
      // Smoothly decelerate to stop using easing
      respawnTimer += deltaSeconds;
      const decelDuration = 0.4; // Faster ease-out to stop
      const progress = Math.min(1, respawnTimer / decelDuration);
      // Ease out cubic: 1 - (1-t)^3
      const easeOut = 1 - Math.pow(1 - progress, 3);
      speedMultiplier = 1.0 * (1 - easeOut); // 1.0 → 0.0

      if (progress >= 1) {
        // Fully stopped - enter waiting state
        speedMultiplier = 0;
        respawnState = 'waiting';
        respawnTimer = 0;
        console.log('[RESPAWN] Parallax stopped, waiting 1s');
      }
    }

    if (respawnState === 'waiting') {
      // Wait at zero speed
      speedMultiplier = 0;
      respawnTimer += deltaSeconds;
      if (respawnTimer >= RESPAWN_WAIT_TIME) {
        // Calculate FIXED remaining distance using spawn and death positions
        remainingRewindDistance = spawnPointX - deathPlayerX;
        if (respawnClampToScreen && respawnClampDistance > 0) {
          if (Math.abs(remainingRewindDistance) > respawnClampDistance) {
            remainingRewindDistance = Math.sign(remainingRewindDistance) * respawnClampDistance;
          }
        }

        console.log(`[RESPAWN] Fixed distance calculation:`);
        console.log(`  Spawn point: X=${spawnPointX.toFixed(0)}`);
        console.log(`  Death position: X=${deathPlayerX.toFixed(0)}`);
        console.log(`  Remaining distance: ${remainingRewindDistance.toFixed(0)}px`);
        console.log(`  Direction: ${remainingRewindDistance > 0 ? 'RIGHT (backward)' : 'LEFT (forward)'}`);

        respawnState = 'animating_back';
        respawnTimer = 0;
        // Disable new segment generation during animation
        grounds.setAllowNewSegments(false);
        console.log(`[RESPAWN] Starting scroll back to spawn (distance: ${Math.abs(remainingRewindDistance).toFixed(0)}px)`);
      }
    }

    if (respawnState === 'animating_back') {
      // Fixed distance-based rewind: drive speed from fixed remaining distance counter
      const RESPAWN_BASE_SPEED_MULTIPLIER = 12; // Base reverse speed
      const RESPAWN_BOOST_START_DISTANCE = 2000; // px before speed boost kicks in
      const RESPAWN_BOOST_DISTANCE_RANGE = 2000; // px range to ramp boost
      const RESPAWN_MAX_BOOST_MULTIPLIER = 2.0; // Up to 2x base speed at long distances
      const EASE_DISTANCE = 300; // Distance over which to ease out
      const RESPAWN_BACK_RAMP_DURATION = 0.5; // seconds to ease into rewind

      const absRemaining = Math.abs(remainingRewindDistance);
      const direction = remainingRewindDistance >= 0 ? 1 : -1; // negative remaining = scroll backward (negative speed)
      const boostProgress = Math.min(
        1,
        Math.max(0, (absRemaining - RESPAWN_BOOST_START_DISTANCE) / RESPAWN_BOOST_DISTANCE_RANGE)
      );
      const boostCurve = Math.pow(boostProgress, 2.2); // Exponential feel
      const maxSpeedMult =
        RESPAWN_BASE_SPEED_MULTIPLIER *
        (1 + boostCurve * (RESPAWN_MAX_BOOST_MULTIPLIER - 1));

      // Calculate speed multiplier based on remaining distance with easing
      let targetSpeedMult: number;

      if (absRemaining < EASE_DISTANCE) {
        // Close to target: ease out (speed proportional to distance)
        const minSpeedFactor = 0.1;
        const easeProgress = absRemaining / EASE_DISTANCE; // 1 → 0 as we approach
        targetSpeedMult = direction * maxSpeedMult * (minSpeedFactor + easeProgress * (1 - minSpeedFactor));
      } else {
        // Far from target: full speed
        targetSpeedMult = direction * maxSpeedMult;
      }

      respawnTimer += deltaSeconds;
      const rampProgress = Math.min(1, respawnTimer / RESPAWN_BACK_RAMP_DURATION);
      const rampEase = 1 - Math.pow(1 - rampProgress, 3); // ease-in
      speedMultiplier = targetSpeedMult * rampEase;

      // Advance remaining distance by actual scroll this frame
      // speedMultiplier < 0 moves world backward (deltaX negative)
      const deltaX = speedMultiplier * BASE_GROUND_SCROLL_SPEED * deltaSeconds;
      // Count down remaining distance toward zero
      remainingRewindDistance -= deltaX;

      const absRemainingUpdated = Math.abs(remainingRewindDistance);

      // Debug logging every ~0.2s
    if (Math.random() < 0.05) {
      console.log(`[RESPAWN ANIM] remaining=${absRemainingUpdated.toFixed(0)}px, speed=${speedMultiplier.toFixed(2)}x, deltaX=${deltaX.toFixed(1)}`);
    }

      // Check if we've reached or crossed the target (within 2px tolerance)
      if (absRemainingUpdated <= 2) {
        // Animation complete - spawn player
        respawnState = 'respawning';
        speedMultiplier = 0; // Stop scrolling
        // Reset contact state so holes/platforms work after respawn
        activePlatformId = null;
        meteorHitbox = null;
        fallingIntoHole = false;
        physics.clearSurfaceOverride();
        wasGrounded = false;
        previousVelocity = 0;

        // Respawn player at original starting X position (NOT spawnPointX)
        // Keep player's horizontal movement range intact
        const groundY = computePlayerGround();
        physics.respawn(playerInitialX, groundY); // Use original spawn X, not meteor segment X
        physics.setGroundCollisionEnabled(true);
        console.log(`[RESPAWN] Player respawning at original X=${playerInitialX.toFixed(0)}, final remaining=${remainingRewindDistance.toFixed(1)}px`);

        // Spawn above the screen so the player drops back in
        physics.forceVelocity(0);
        physics.setPosition(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN);
        ball.position.set(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN);
        startRespawnEaseToCursor();
        meteorOrb.onRespawn(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN, playerRadius);

        // CRITICAL: Show player and shadow again
        ball.visible = true;
        ball.alpha = 1.0;
        playerShadow.getView().visible = true;
        playerShadow.getView().alpha = 1.0;

        console.log('[RESPAWN] Animation complete, player spawned above screen at original position');
      }
    }

    if (respawnState === 'respawning') {
      // Wait for player to hit the ground, speed stays at 0
      speedMultiplier = 0;
      const playerY = physics.getState().y;
      const groundY = computePlayerGround();

      // Check if player is on or very close to ground
      if (playerY >= groundY - playerRadius - 5) {
        respawnState = 'resume_pause';
        respawnTimer = 0;
        respawnInputLocked = false;
        // Re-enable segment generation when resuming normal parallax
        grounds.setAllowNewSegments(true);
        console.log('[RESPAWN] Player landed, pausing before resume');
      }
    }

    if (respawnState === 'resume_pause') {
      speedMultiplier = 0;
      respawnTimer += deltaSeconds;
      if (respawnTimer >= RESUME_WAIT_TIME) {
        respawnState = 'resume_ramp';
        resumeRampTimer = 0;
        console.log('[RESPAWN] Starting forward ease');
      }
    }

    if (respawnState === 'resume_ramp') {
      resumeRampTimer += deltaSeconds;
      const u = Math.min(1, resumeRampTimer / RESUME_RAMP_DURATION);
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      // Ease from 0 back to normal forward multiplier (player-controlled)
      const forwardMult = physics.getScrollSpeedMultiplier();
      speedMultiplier = forwardMult * ease;
      if (u >= 1) {
        respawnState = 'normal';
        respawnInputLocked = false;
        console.log('[RESPAWN] Forward ease complete');
      }
    }

    // Player intro animation - starts small behind cottage door, jumps out and grows
    if (playerIntroActive) {
      const now = performance.now();
      const elapsed = (now - playerIntroStartTime) / 1000; // seconds

      if (playerIntroPhase === 'initial') {
        // Phase 1: Small player behind door, slow parallax - wait 0.5s
        speedMultiplier = introParallaxSpeed;

        // Hide shadow during initial phase
        playerShadow.getView().alpha = 0;

        // Position player at cottage door at ground level
        const startRadius = playerIntroStartSize / 2;
        const cottageGroundY = groundSurface() + playerIntroStartSize * GROUND_PLAYER_DEPTH - startRadius;

        ball.position.x = playerIntroStartX;
        ball.position.y = cottageGroundY;

        // Set small size
        playerIntroCurrentSize = playerIntroStartSize;
        ball.clear();
        ball.circle(0, 0, startRadius).fill({ color: currentBallColor });

        // Wait 0.5s then start moving out
        if (elapsed > 0.5) {
          playerIntroPhase = 'moveout';
          playerIntroStartTime = now;
          console.log('[PLAYER INTRO] Moving out of door');
        }
      } else if (playerIntroPhase === 'moveout') {
        // Phase 2: Move out of door slowly to the right for 0.5s before jumping
        speedMultiplier = introParallaxSpeed;

        const moveoutDuration = 0.5;
        const moveoutSpeed = 80; // Slower movement out of door

        // Keep shadow hidden during moveout
        playerShadow.getView().alpha = 0;

        // Keep small size during moveout
        const radius = playerIntroStartSize / 2;
        ball.clear();
        ball.circle(0, 0, radius).fill({ color: currentBallColor });

        // Move right slowly
        ball.position.x += moveoutSpeed * deltaSeconds;

        // Keep at ground level
        const groundY = groundSurface() + playerIntroStartSize * GROUND_PLAYER_DEPTH - radius;
        ball.position.y = groundY;

        // After 0.5s, start first jump
        if (elapsed > moveoutDuration) {
          playerIntroPhase = 'jump1';
          playerIntroStartTime = now;

          // Increase gravity for smaller jumps (2x gravity = shorter jumps)
          physics.setGravityMultiplier(2.0);

          // Sync physics and trigger first jump
          physics.setPosition(ball.position.x, ball.position.y);
          physics.startJump();
          physics.endJump();

          console.log('[PLAYER INTRO] First jump at X=' + ball.position.x + ' with 2x gravity');
        }
      } else if (playerIntroPhase === 'jump1') {
        // Phase 3: First jump - move right while jumping and growing
        speedMultiplier = introParallaxSpeed;

        const jumpHorizontalSpeed = 400; // Much faster to cover 200px total
        ball.position.x += jumpHorizontalSpeed * deltaSeconds;

        // Grow from 75% to 87.5% during first jump (halfway to normal)
        const jumpProgress = Math.min(elapsed / 0.4, 1.0); // 0.4s jump duration
        const midSize = playerIntroStartSize + (playerIntroNormalSize - playerIntroStartSize) * 0.5;
        playerIntroCurrentSize = playerIntroStartSize + (midSize - playerIntroStartSize) * jumpProgress;
        const radius = playerIntroCurrentSize / 2;

        ball.clear();
        ball.circle(0, 0, radius).fill({ color: currentBallColor });

        // Apply squash/stretch from physics
        const physicsState = physics.getState();
        ball.scale.set(physicsState.scaleX, physicsState.scaleY);

        // Fade in shadow as player is falling down (velocity > 0 means falling)
        // Shadow fades from 0 to 0.85 during the descent
        if (physicsState.velocity > 0) {
          // Player is falling - fade in shadow based on velocity
          const fadeProgress = Math.min(physicsState.velocity / 400, 1.0); // Fade in as velocity increases
          playerShadow.getView().alpha = fadeProgress * 0.85;
        } else {
          // Player is ascending - keep shadow hidden
          playerShadow.getView().alpha = 0;
        }

        // Check if first jump landed
        const groundY = groundSurface() + playerIntroCurrentSize * GROUND_PLAYER_DEPTH - radius;
        if (elapsed > 0.2 && Math.abs(ball.position.y - groundY) < 5) {
          playerIntroPhase = 'jump2';
          playerIntroStartTime = now;

          // Trigger second jump
          physics.setPosition(ball.position.x, ball.position.y);
          physics.startJump();
          physics.endJump();
          console.log('[PLAYER INTRO] Second jump at X=' + ball.position.x);
        }
      } else if (playerIntroPhase === 'jump2') {
        // Phase 4: Second jump - continue moving right and finish growing
        speedMultiplier = introParallaxSpeed;

        // Shadow should be at 0.85 opacity now
        playerShadow.getView().alpha = 0.85;

        const jumpHorizontalSpeed = 400; // Same speed to reach 200px total
        ball.position.x += jumpHorizontalSpeed * deltaSeconds;

        // Grow from 87.5% to 100% during second jump
        const jumpProgress = Math.min(elapsed / 0.4, 1.0);
        const midSize = playerIntroStartSize + (playerIntroNormalSize - playerIntroStartSize) * 0.5;
        playerIntroCurrentSize = midSize + (playerIntroNormalSize - midSize) * jumpProgress;
        const radius = playerIntroCurrentSize / 2;

        ball.clear();
        ball.circle(0, 0, radius).fill({ color: currentBallColor });

        // Apply squash/stretch from physics
        const physicsState = physics.getState();
        ball.scale.set(physicsState.scaleX, physicsState.scaleY);

        // Check if second jump landed
        const groundY = groundSurface() + playerIntroCurrentSize * GROUND_PLAYER_DEPTH - radius;
        if (elapsed > 0.25 && Math.abs(ball.position.y - groundY) < 5) {
          playerIntroPhase = 'delay';
          playerIntroStartTime = now;
          playerIntroCurrentSize = playerIntroNormalSize; // Ensure final size

          // STOP all movement - lock position where we landed
          physics.setPosition(ball.position.x, ball.position.y);
          physics.forceVelocity(0);
          physics.restoreNormalGravity();
          physics.resetScale(); // Reset squash/stretch to normal

          // Spawn butterflies from cottage door - they'll appear during delay phase
          if (butterflyManager && !butterfliesSpawned && biomeManager.getCurrentBiome() === 'cloud') {
            const groundY = computePlayerGround();
            const doorX = playerIntroStartX; // Cottage door X position

            butterflyVariants.forEach((variant, idx) => {
              for (let i = 0; i < variant.count; i++) {
                // Custom spawn delays: 0.8s, 1.5s, 3.0s
                let spawnDelay;
                if (idx === 0) spawnDelay = 0.8;
                else if (idx === 1) spawnDelay = 1.5;
                else spawnDelay = 3.0;

                // Start LEFT of cottage door to account for parallax scrolling them right during spawn delay
                const parallaxOffset = spawnDelay * 50; // ~50px/sec parallax movement during delay
                const startX = doorX - 100 - parallaxOffset; // Base 100px left + delay compensation

                const jitterY = groundY - playerRadius * (3.5 + Math.random() * 2);
                const baseScale = 0.14 + Math.random() * 0.04;
                const extraSize = (idx === 0 && i === 0) ? 1.6 : 1.05; // first one slightly bigger
                const scale = baseScale * extraSize;

                butterflyManager.spawn({
                  x: startX,
                  y: jitterY,
                  scale,
                  tint: variant.tint,
                  baseSpeed: 70 + Math.random() * 50,
                  amplitude: 30 + Math.random() * 30,
                  frequency: 0.6 + Math.random() * 0.6,
                  spawnDelay,
                  useOrangeFrames: variant.useOrange,
                });
              }
            });

            butterfliesSpawned = true;
            console.log('[PLAYER INTRO] Butterflies queued to spawn from cottage door at X=' + doorX);
          }

          console.log('[PLAYER INTRO] Jumps complete at X=' + ball.position.x + ', stopped for 2s delay');
        }
      } else if (playerIntroPhase === 'delay') {
        // Phase 5: Wait at landed position with normal size before giving control
        speedMultiplier = 1.0;

        // Keep at normal size and stay at landed position
        ball.clear();
        ball.circle(0, 0, playerRadius).fill({ color: currentBallColor });
        ball.scale.set(1, 1);

        // Keep position locked where we landed (don't move to center)
        const groundY = computePlayerGround() - playerRadius;
        ball.position.y = groundY;
        // X position stays where we landed from jumps
        physics.setPosition(ball.position.x, ball.position.y);
        physics.forceVelocity(0);
        physics.resetScale();

        // Wait 2 seconds before giving control
        if (elapsed > 2.0) {
          playerIntroPhase = 'complete';
          playerIntroStartTime = now;

          console.log('[PLAYER INTRO] Entering complete phase - will enable control next frame');
        }
      } else if (playerIntroPhase === 'complete') {
        // Phase 6: 0.5s delay before enabling player control
        speedMultiplier = 1.0;
        ball.clear();
        ball.circle(0, 0, playerRadius).fill({ color: currentBallColor });

        const groundY = computePlayerGround() - playerRadius;
        ball.position.y = groundY;
        // Keep X where we are (already landed from jumps)

        // Lock physics at current position
        physics.setPosition(ball.position.x, ball.position.y);
        physics.forceVelocity(0);
        physics.resetScale();
        ball.scale.set(1, 1);

        // Wait 0.5s before enabling control
        if (elapsed > 0.5) {
          // Now safe to enable player control
          playerIntroActive = false;
          introLandingLeftLockActive = true;
          introLandingLeftLockX = ball.position.x;
          const cottageSegment = getCottageStartSegment();
          introLandingLeftLockOffsetFromCottageX = cottageSegment
            ? ball.position.x - cottageSegment.x
            : 0;

          // Activate post-intro easing
          postIntroEaseActive = true;
          postIntroEaseStartTime = now;
          postIntroPlayerStartX = ball.position.x; // Store where player is now
          postIntroInitialMouseX = screenToWorldX(app.renderer.events.pointer.global.x); // Store actual mouse position in world space

          // Enable soft mouse following for smooth easing
          physics.setSoftFollowMode(true);

          // Start with mouse at player position, we'll ease it toward actual mouse
          physics.setMousePosition(ball.position.x);

          console.log('[PLAYER INTRO] Complete - player control enabled with easing at X=' + ball.position.x);
        }
      }
    }

    // Post-intro easing: gradually increase parallax speed from 1.0 to full speed
    if (postIntroEaseActive) {
      const currentTime = performance.now();
      const elapsed = (currentTime - postIntroEaseStartTime) / 1000;

      // First 1 second: ease mouse target from player position to actual mouse position
      const mouseEaseDuration = 1.0;
      if (elapsed < mouseEaseDuration) {
        const t = elapsed / mouseEaseDuration;
        const easeOut = 1 - Math.pow(1 - t, 2); // Quadratic ease out
        // Lerp from player start position to actual mouse position
        const easedMouseX = postIntroPlayerStartX + (postIntroInitialMouseX - postIntroPlayerStartX) * easeOut;
        physics.setMousePosition(easedMouseX);
      }

      if (elapsed < postIntroEaseDuration) {
        // Ease out: start at 1.0, ramp to full speed over 1.5s
        const t = elapsed / postIntroEaseDuration;
        const easeOut = 1 - Math.pow(1 - t, 2); // Quadratic ease out
        // Start at base speed (1.0), allow it to go higher as player moves
        // We'll modify speedMultiplier only if it's trying to go faster
        if (speedMultiplier > 1.0) {
          speedMultiplier = 1.0 + (speedMultiplier - 1.0) * easeOut;
        }
      } else {
        // Easing complete - disable soft follow only if not using touch input
        postIntroEaseActive = false;

        // Only disable soft follow if not using touch input
        if (currentInputType !== 'touch' && !respawnEaseActive && !dashReturnEaseActive) {
          physics.setSoftFollowMode(false);
          console.log('[POST-INTRO] Easing complete - full speed enabled (mouse mode)');
        } else {
          console.log('[POST-INTRO] Easing complete - keeping soft follow enabled (touch mode)');
        }
      }
    }

    if (respawnEaseActive) {
      const currentTime = performance.now();
      const elapsed = (currentTime - respawnEaseStartTime) / 1000;
      const t = Math.min(1, elapsed / RESPAWN_EASE_DURATION);
      const easeOut = 1 - Math.pow(1 - t, 2);
      const pointerX = app.renderer.events.pointer?.global?.x ?? app.renderer.width * 0.5;
      const targetX = screenToWorldX(pointerX);
      const easedX = respawnEaseStartX + (targetX - respawnEaseStartX) * easeOut;
      physics.setMousePosition(easedX);
      if (t >= 1) {
        respawnEaseActive = false;
        if (currentInputType !== 'touch' && !postIntroEaseActive && !dashReturnEaseActive) {
          physics.setSoftFollowMode(false);
        }
      }
    }

    if (dashReturnEaseActive) {
      const elapsed = (performance.now() - dashReturnEaseStartTime) / 1000;
      if (elapsed >= DASH_RETURN_EASE_DURATION) {
        dashReturnEaseActive = false;
        if (currentInputType !== 'touch' && !postIntroEaseActive && !respawnEaseActive) {
          physics.setSoftFollowMode(false);
        }
      }
    }

    if (!playerIntroActive && respawnState === 'normal' && parallaxBoostActive && !dashChargeActive && !dashChargeReturning) {
      const now = performance.now();
      const elapsed = now - parallaxBoostStartTime;
      const holdActive = physics.isChargingJump();
      if (!holdActive || elapsed >= PARALLAX_BOOST_MAX_DURATION_MS) {
        parallaxBoostActive = false;
      } else {
        speedMultiplier = Math.max(speedMultiplier, PARALLAX_BOOST_MULTIPLIER);
      }
    }

    // Tutorial parallax speed modification - slow/stop near fence butterfly
    if (tutorialActive && !tutorialDashJumpCompleted) {
      if (tutorialParallaxStopped) {
        speedMultiplier = 0;
      } else if (tutorialParallaxSlowFactor < 1) {
        speedMultiplier *= tutorialParallaxSlowFactor;
      }
    }
    if (tutorialDashJumpShown && !tutorialDashJumpCompleted && !parallaxBoostActive) {
      speedMultiplier = 0;
    }

    if (stopScrollForFinal) {
      const elapsed = performance.now() - finalScrollSlowdownStart;
      const t = Math.min(1, elapsed / FINAL_SCROLL_SLOWDOWN_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      speedMultiplier *= (1 - ease);
      if (t >= 1) {
        speedMultiplier = 0;
      }
    }

    if (finalTransitionActive) {
      speedMultiplier = 0;
    }

    if (introLandingLeftLockActive) {
      const cottageSegment = getCottageStartSegment();
      if (cottageSegment) {
        introLandingLeftLockX = cottageSegment.x + introLandingLeftLockOffsetFromCottageX;
      } else {
        introLandingLeftLockActive = false;
        introLandingLeftLockOffsetFromCottageX = 0;
      }
    }

    const treehouseOrbCollected = meteorOrb.isCollected();
    const treehouseJustCollected = treehouseOrbCollected && !treehouseOrbCollectedPrev;
    treehouseOrbCollectedPrev = treehouseOrbCollected;
    if (treehouseJustCollected) {
      orbShootingUnlocked = true;
      startEnergyReveal();
    }
    const treehouseSegment = (() => {
      const segments = grounds.getSegments();
      return segments.find((seg) => seg.type === 'treed_prairie_treehouse') || null;
    })();

    if (treehouseSegment && !treehouseOrbCollected) {
      const safeZoom = Math.max(0.0001, cameraZoom);
      const screenCenterWorldX = (app.renderer.width * 0.5 - (cameraPanX + treehousePanX + specialCameraPanX)) / safeZoom;
      const segmentCenterX = treehouseSegment.x + treehouseSegment.width * 0.5;
      const distanceToCenter = Math.abs(segmentCenterX - screenCenterWorldX);
      if (!treehouseHoldActive && distanceToCenter <= TREEHOUSE_STOP_RANGE) {
        treehouseHoldActive = true;
      }
    } else {
      treehouseHoldActive = false;
    }

    const specialEnemyControlActive = specialOutActive || finalSequenceActive || finalTransitionActive;
    const treehouseEnemyShouldHide =
      !specialEnemyControlActive &&
      !!treehouseSegment &&
      !treehouseOrbCollected &&
      (treehouseHoldActive || treehouseHoldProgress > 0 || Math.abs(treehousePanX) > 0.5);
    if (treehouseEnemyShouldHide) {
      if (!treehouseEnemyHidden) {
        const exitScreenX = app.renderer.width * TREEHOUSE_ENEMY_EXIT_SCREEN_MULT;
        treehouseEnemyHidden = true;
        treehouseEnemyReturnActive = false;
        treehouseEnemyReturnStart = 0;
        treehouseEnemyAutoEaseActive = false;
        treehouseEnemyAutoEaseStart = 0;
        treehouseEnemyExitActive = true;
        treehouseEnemyExitStart = performance.now();
        treehouseEnemyExitFromX = enemyBall.position.x;
        treehouseEnemyExitTargetX = screenToWorldX(exitScreenX);
      }
    } else if (treehouseEnemyHidden) {
      treehouseEnemyHidden = false;
      treehouseEnemyReturnActive = true;
      treehouseEnemyReturnStart = performance.now();
      treehouseEnemyAutoEaseActive = false;
      treehouseEnemyAutoEaseStart = 0;
      treehouseEnemyExitActive = false;
      treehouseEnemyExitStart = 0;
    }

    if (treehouseJustCollected && treehousePanX !== 0) {
      cameraPanX += treehousePanX;
      treehousePanX = 0;
      treehouseHoldProgress = 0;
      treehousePanReleaseActive = true;
      treehousePanReleaseStart = performance.now();
    }

    if (treehouseHoldActive) {
      treehouseHoldProgress = Math.min(1, treehouseHoldProgress + deltaSeconds / TREEHOUSE_STOP_DURATION);
      const holdEase = 1 - Math.pow(1 - treehouseHoldProgress, 2);
      speedMultiplier *= 1 - holdEase;
      if (treehouseSegment) {
        const safeZoom = Math.max(0.0001, cameraZoom);
        const playerX = physics.getState().x;
        const segmentLeft = treehouseSegment.x;
        const segmentRight = treehouseSegment.x + treehouseSegment.width;
        const minCameraX = app.renderer.width - (segmentRight * safeZoom);
        const maxCameraX = -(segmentLeft * safeZoom);
        const playerScreenX = playerX * safeZoom + cameraPanX + treehousePanX + specialCameraPanX;
        const screenPercent = Math.min(1, Math.max(0, playerScreenX / app.renderer.width));
        const leftThreshold = 0.3;
        const rightThreshold = 0.7;
        let edgePan = 0;
        if (screenPercent < leftThreshold) {
          const t = (leftThreshold - screenPercent) / leftThreshold;
          edgePan = TREEHOUSE_EDGE_PAN * t;
        } else if (screenPercent > rightThreshold) {
          const t = (screenPercent - rightThreshold) / (1 - rightThreshold);
          edgePan = -TREEHOUSE_EDGE_PAN * t;
        }
        const desiredCameraX = app.renderer.width * 0.5 - playerX * safeZoom + edgePan;
        const segmentCenterX = segmentLeft + treehouseSegment.width * 0.5;
        const centerCameraX = app.renderer.width * 0.5 - segmentCenterX * safeZoom;
        const clampedCameraX =
          minCameraX > maxCameraX
            ? centerCameraX + edgePan
            : Math.min(maxCameraX, Math.max(minCameraX, desiredCameraX));
        const targetPan = clampedCameraX - cameraPanX;
        const panLerp = TREEHOUSE_PAN_LERP * holdEase;
        treehousePanX += (targetPan - treehousePanX) * panLerp;
      }
    } else if (treehouseHoldProgress > 0) {
      treehouseHoldProgress = Math.max(0, treehouseHoldProgress - deltaSeconds / TREEHOUSE_STOP_DURATION);
      const holdEase = 1 - Math.pow(1 - treehouseHoldProgress, 2);
      speedMultiplier *= 1 - holdEase;
      treehousePanX += (0 - treehousePanX) * TREEHOUSE_PAN_RELEASE_LERP;
    } else if (treehousePanX !== 0) {
      treehousePanX += (0 - treehousePanX) * TREEHOUSE_PAN_RELEASE_LERP;
    }

    if (debugFastForwardToSecondSpawn) {
      const segments = grounds.getSegments();
      const holeBackSegment = segments.find((seg: { type: string }) => seg.type === 'hole_transition_back');
      if (holeBackSegment) {
        const secondSpawnX = holeBackSegment.x + holeBackSegment.width - 100;
        const playerX = physics.getState().x;
        const remaining = secondSpawnX - playerX;
        if (remaining > 0) {
          const boost = Math.min(DEBUG_FAST_FORWARD_MAX, Math.max(DEBUG_FAST_FORWARD_MIN, remaining / 40));
          speedMultiplier = Math.max(speedMultiplier, boost);
        } else {
          debugFastForwardToSecondSpawn = false;
        }
      }
    }

    // Update spawn indices based on player position (for smart culling)
    updateSpawnIndices();

    if (debugSpawnDropPending && currentSpawnIndex >= 1) {
      debugSpawnDropPending = false;
      const groundY = computePlayerGround();
      respawnState = 'respawning';
      respawnTimer = 0;
      fallingIntoHole = false;
      activePlatformId = null;
      meteorHitbox = null;
      physics.clearSurfaceOverride();
      physics.respawn(playerInitialX, groundY);
      physics.setGroundCollisionEnabled(true);
      physics.setGroundSurface(groundY);
      currentGroundSurface = groundY;
      physics.forceVelocity(0);
      physics.resetScale();
      physics.setPosition(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN);
      physics.setMousePosition(playerInitialX);
      ball.position.set(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN);
      meteorOrb.onRespawn(playerInitialX, RESPAWN_HEIGHT_ABOVE_SCREEN, playerRadius);
      ball.visible = true;
      ball.alpha = 1.0;
      playerShadow.getView().visible = true;
      playerShadow.getView().alpha = 1.0;
      startRespawnEaseToCursor();
      speedMultiplier = 0;
    }

    backgrounds.update(deltaSeconds, speedMultiplier);
    grounds.update(deltaSeconds, speedMultiplier, shouldCullObject);
    dustField.update();

    // Update spawn point debug indicator to track the meteor_transition segment
    // The pink box shows where the player will respawn (at the meteor_transition segment)
    if (spawnPointDebug.visible && cometHoleLevelActive) {
      const segments = grounds.getSegments();
      const meteorSegment = segments.find(seg => seg.type === 'meteor_transition');
      if (meteorSegment) {
        spawnPointDebug.x = meteorSegment.x; // Track meteor segment's current position
        spawnPointDebug.y = computePlayerGround();
      }
    }

    // Sync ground holes with ground segments (comet hole level)
    if (cometHoleLevelActive) {
      const segments = grounds.getSegments();
      segments.forEach((seg, idx) => {
        // Use stable key (index + type) so we only spawn one hitbox per segment
        const segmentKey = `${idx}_${seg.type}`;
        if (!processedSegments.has(segmentKey)) {
          processedSegments.add(segmentKey);

          // Use same Y position as platform holes, but offset down more
          const groundY = computePlayerGround(); // Base ground for hole hitbox
          if (seg.type === 'meteor_transition') {
            groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'meteor_transition');
            console.log(`[GROUND HOLE] ✓ Spawned meteor_transition at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)} groundY=${groundY.toFixed(0)}`);
          } else if (seg.type === 'cloud_hole') {
            groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'full_hole');
            console.log(`[GROUND HOLE] ✓ Spawned full_hole at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)} groundY=${groundY.toFixed(0)}`);
          } else if (seg.type === 'hole_transition_back') {
            groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'hole_transition_back');
            console.log(`[GROUND HOLE] ✓ Spawned hole_transition_back at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)} groundY=${groundY.toFixed(0)}`);
          } else {
            // Log all other segment types to debug - this helps identify type name mismatches
            console.log(`[GROUND HOLE] ✗ Skipped segment type: "${seg.type}" at x=${seg.x.toFixed(0)}`);
          }
        }
      });
    }

    // Update comet animation and position
    cometManager.update(deltaSeconds);

    // Update platforms with ground scroll speed (72 px/sec * speedMultiplier)
    const groundScrollSpeed = BASE_GROUND_SCROLL_SPEED * speedMultiplier;
    platforms.update(
      deltaSeconds,
      groundScrollSpeed,
      shouldCullObject,
      computePlayerGround(),
      playerDiameter,
      PLATFORM_LANDING_OFFSET
    );
    holes.update(deltaSeconds, groundScrollSpeed, shouldCullObject);
    groundHoles.update(deltaSeconds, groundScrollSpeed, shouldCullObject);

    // Update ember particles based on active ground holes (scroll with ground parallax)
    const activeGroundHoles = groundHoles.getDebugHitboxes().map(hitbox => ({
      x: hitbox.left,
      width: hitbox.right - hitbox.left,
      groundY: hitbox.top + 50, // Approximate ground Y from hitbox
      type: hitbox.type,
      active: true,
    }));
    emberParticles.update(deltaSeconds, activeGroundHoles as any, groundScrollSpeed);

    // Keep laser horizontal speed in sync with ground scroll so pace feels consistent
    laserPhysics.setScrollSpeed(groundScrollSpeed);

    // Start dust fade-in when transition background has entered the viewport
    const forestProgress = backgrounds.getTransitionProgress();

    if (forestProgress >= TRANSITION_VISIBLE_THRESHOLD && dustRevealStartTime === null) {
      // Transition background is now visible on screen - begin dust fade-in
      dustRevealStartTime = tickerInstance.lastTime;
    }

    // Calculate dust opacity based on 5-second fade from when transition enters view
    let dustOpacity = 0;
    if (dustRevealStartTime !== null) {
      const elapsed = tickerInstance.lastTime - dustRevealStartTime;
      dustOpacity = Math.min(1, elapsed / DUST_FADE_DURATION);
    }

    dustField.setRevealProgress(dustOpacity);

    // Clear the 2D canvas before rendering to prevent trails
    dustCtx.clearRect(0, 0, dustCompositeCanvas.width, dustCompositeCanvas.height);

    dustField.render(dustCtx, dustCompositeCanvas.width, dustCompositeCanvas.height);
    // Update texture from canvas - this tells PixiJS the canvas has changed
    dustTexture.source.update();
    dustSprite.alpha = dustField.getOpacity();

    // Update sparks
    sparkParticles.update(deltaSeconds);
    sparkCtx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);
    sparkParticles.render(sparkCtx, sparkCanvas.width, sparkCanvas.height);
    sparkTexture.source.update();

    // Spawn wind sprites
    nextWindSpawnTime -= deltaSeconds;
    if (nextWindSpawnTime <= 0) {
      const groundY = computePlayerGround();
      const kind = windSprites.spawnRandom(app.renderer.width, app.renderer.height, groundY);
      if (kind === 'long') {
        nextWindSpawnTime = 2.5 + Math.random() * 1.2; // give longs breathing room
      } else if (kind === 'pair') {
        nextWindSpawnTime = 1.6 + Math.random() * 1.0;
      } else {
        nextWindSpawnTime = 1.0 + Math.random() * 0.9;
      }
    }

    windSprites.update(deltaSeconds);
    windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
    windSprites.render(windCtx, windCanvas.width, windCanvas.height);
    windTexture.source.update();

    // Enemy charge FX are only for the dedicated mega-laser scenario.
    // Special out (4/7/10) ground-charge should not show this aura.
    const chargeLevel = scenarioStage === 'charging'
      ? Math.min(1, (performance.now() - megaLaserStart) / MEGA_LASER_CHARGE)
      : scenarioStage === 'prep' ? 0.25 : 0;

    enemyChargeParticles.update(deltaSeconds, chargeLevel);

    // Spawn and update halo particles (larger, tight around enemy)
    const spawnHalo = chargeLevel > 0;
    if (spawnHalo && enemyChargeHalo.length < 24) {
      const count = 3;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = playerRadius * 0.65 + Math.random() * playerRadius * 0.3;
        enemyChargeHalo.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          size: 6 + Math.random() * 3,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.2,
        });
      }
    }

    // Spawn and update orbit particles (small, flying around)
    const spawnOrbit = chargeLevel > 0;
    if (spawnOrbit && enemyChargeOrbit.length < 50) {
      const count = 3;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 80;
        enemyChargeOrbit.push({
          x: 0,
          y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 1 + Math.random() * 2, // 1-3px (mix of small and mid)
          life: 0,
          maxLife: 0.35 + Math.random() * 0.25,
        });
      }
    }

    const updateFx = (fx: ChargeFX[], gravity: number = 0) => {
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.life += deltaSeconds;
        if (p.life >= p.maxLife) {
          fx.splice(i, 1);
          continue;
        }
        p.vy += gravity * deltaSeconds;
        p.x += p.vx * deltaSeconds;
        p.y += p.vy * deltaSeconds;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
    };

    updateFx(enemyChargeHalo);
    updateFx(enemyChargeOrbit, 50);

    // Render
    enemyChargeCtx.clearRect(0, 0, enemyChargeCanvas.width, enemyChargeCanvas.height);
    enemyChargeCtx.save();
    enemyChargeCtx.translate(enemyBall.position.x, enemyBall.position.y);
    enemyChargeParticles.render(enemyChargeCtx, enemyChargeCanvas.width, enemyChargeCanvas.height);
    enemyChargeOrbit.forEach(p => {
      const alpha = 1 - p.life / p.maxLife;
      enemyChargeCtx.fillStyle = `rgba(255,32,32,${alpha})`;
      enemyChargeCtx.beginPath();
      enemyChargeCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      enemyChargeCtx.fill();
    });
    enemyChargeCtx.restore();
    enemyChargeTexture.source.update();

    if (useStraightBlueLasers) {
      // Update player projectiles (only when unlocked)
      projectiles.forEach(p => {
        if (!p.active) return;
        p.x += PROJECTILE_SPEED * deltaSeconds;
        if (p.x > app.renderer.width) {
          p.active = false;
        }
        // Enemy hitbox
        const bounds = enemyBounds();
        if (
          p.x < bounds.right &&
          p.x + PROJECTILE_WIDTH > bounds.left &&
          p.y < bounds.bottom &&
          p.y + PROJECTILE_HEIGHT > bounds.top
        ) {
          p.active = false;
          enemyFlashUntil = performance.now() + 250;
          sparkParticles.spawn(p.x, p.y, 'blue');
          // Count hits against red; every 20 hits = 1 out on red
          applyRedHits(1);
        }
      });

      // Render player projectiles
      projectileContainer.removeChildren();
      projectiles.forEach(p => {
        if (!p.active) return;
        const sprite = new Sprite(playerBeamTexture);
        sprite.anchor.set(0, 0);
        sprite.position.set(p.x, p.y);
        projectileContainer.addChild(sprite);
      });
    } else if (projectiles.length > 0) {
      projectiles.length = 0;
      projectileContainer.removeChildren();
    }

    // Update meteor swirl orb shots
    meteorSwirlShots.forEach((shot) => {
      if (!shot.active) return;
      const speedScale = shot.speedScale ?? 1;
      const maxSpeedScale = shot.maxSpeedScale ?? speedScale;
      const maxSpeed = PROJECTILE_SPEED * METEOR_SWIRL_SHOT_SPEED_MAX * maxSpeedScale;
      shot.speed = Math.min(
        maxSpeed,
        shot.speed + (PROJECTILE_SPEED * METEOR_SWIRL_SHOT_ACCEL * speedScale) * deltaSeconds
      );
      shot.x += shot.speed * deltaSeconds;
      if (shot.x - shot.radius > app.renderer.width + METEOR_SWIRL_SHOT_OFFSCREEN_PAD) {
        shot.active = false;
        return;
      }
      const bounds = enemyBounds();
      if (
        shot.x + shot.radius > bounds.left &&
        shot.x - shot.radius < bounds.right &&
        shot.y + shot.radius > bounds.top &&
        shot.y - shot.radius < bounds.bottom
      ) {
        shot.active = false;
        enemyFlashUntil = performance.now() + 250;
        sparkParticles.spawn(shot.x, shot.y, 'blue');
        applyRedHits(shot.hits);
      }
    });
    for (let i = meteorSwirlShots.length - 1; i >= 0; i--) {
      if (!meteorSwirlShots[i].active) {
        meteorSwirlShots.splice(i, 1);
      }
    }

    // Render meteor swirl orb shots
    meteorSwirlShotGraphics.clear();
    meteorSwirlShots.forEach((shot) => {
      if (!shot.active) return;
      meteorSwirlShotGraphics.circle(shot.x, shot.y, shot.radius).fill({ color: 0xbfeaff, alpha: 0.95 });
    });
    meteorOrbChargePreviewGraphics.clear();
    if (orbChargeActive) {
      const orbOrigin = meteorOrb.getShotOrigin();
      if (orbOrigin) {
        const heldSeconds = (performance.now() - orbChargeStart) / 1000;
        const clampedHold = Math.min(ORB_CHARGE_MAX_SECONDS, Math.max(0, heldSeconds));
        const t = clampedHold / ORB_CHARGE_MAX_SECONDS;
        const baseRadius = meteorOrb.getShotRadius() + ORB_SHOT_BASE_BONUS_PX;
        const minRadius = baseRadius + ORB_SHOT_MIN_DELTA_PX;
        const maxRadius = baseRadius + ORB_SHOT_MAX_DELTA_PX;
        const radius = minRadius + (maxRadius - minRadius) * t;
        meteorOrbChargePreviewGraphics.circle(orbOrigin.x, orbOrigin.y, radius).fill({ color: 0xbfeaff, alpha: 0.45 });
      }
    }

    // Render halo to separate normal-blend layer
    haloCtx.clearRect(0, 0, haloCanvas.width, haloCanvas.height);
    haloCtx.save();
    haloCtx.translate(enemyBall.position.x, enemyBall.position.y);
    enemyChargeHalo.forEach(p => {
      const alpha = 1 - p.life / p.maxLife;
      haloCtx.fillStyle = `rgba(255,32,32,${alpha})`;
      haloCtx.beginPath();
      haloCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      haloCtx.fill();
    });
    haloCtx.restore();
    haloTexture.source.update();

    // Update and render jump dust particles
    jumpDust.update(deltaSeconds, groundScrollSpeed);
    jumpDustCtx.clearRect(0, 0, jumpDustCanvas.width, jumpDustCanvas.height);
    jumpDust.render(jumpDustCtx, jumpDustCanvas.width, jumpDustCanvas.height);
    jumpDustTexture.source.update();

    // Render ember particles (for ground holes)
    emberCtx.clearRect(0, 0, emberCanvas.width, emberCanvas.height);
    emberParticles.render(emberCtx, emberCanvas.width, emberCanvas.height);
    emberTexture.source.update();

    // DISABLED: Update and render charge particles
    // Keeping code for future re-enable
    // const chargeLevel = physics.getChargeLevel();
    // chargeParticles.update(deltaSeconds, chargeLevel);
    // chargeCtx.clearRect(0, 0, chargeCanvas.width, chargeCanvas.height);
    // // Translate context to player center with offset adjustment
    // // Move right by 1/3 player radius and up by 25% of player radius
    // chargeCtx.save();
    // chargeCtx.translate(ball.position.x + playerRadius * 0.33, ball.position.y - playerRadius * 0.25);
    // chargeParticles.render(chargeCtx, chargeCanvas.width, chargeCanvas.height);
    // chargeCtx.restore();
    // chargeTexture.source.update();

    // Butterflies - spawn from cottage door when player jumps (triggered in intro animation)
    // Spawning is now handled during player intro jump1 phase
    // (No automatic spawning here)
    // Check fence butterfly proximity (butterfly handles its own flight internally)
    if (grounds) {
      const playerX = physics.getState().x;
      grounds.checkButterflyProximity(playerX);

      // Automatic hole level trigger: When player passes the fence, start comet hole level 5
      if (!fencePassedTriggered && !cometHoleLevelActive) {
        const fenceX = grounds.getFenceX();
        if (fenceX !== null) {
          // Trigger when player has passed the fence by at least 500 pixels
          const FENCE_BUFFER = 500;
          if (playerX > fenceX + FENCE_BUFFER) {
            fencePassedTriggered = true;
            startCometHoleLevel(5);
            console.log('[AUTO TRIGGER] Comet hole level 5 started after passing fence');
          }
        }
      }

      // Tutorial system progression
      if (tutorialActive && !cometHoleLevelActive) {
        // Stage 1: Double Jump Tutorial - Show after 10s of gameplay time
        if (tutorialStage === 'waiting' && !playerIntroActive && !loadingScreenActive) {
          tutorialFirstDelayElapsed = Math.min(TUTORIAL_FIRST_DELAY, tutorialFirstDelayElapsed + deltaSeconds);
          if (tutorialFirstDelayElapsed >= TUTORIAL_FIRST_DELAY) {
            tutorialStage = 'doubleJump';
            doubleJumpContainer.style.display = 'flex';
            tutorialContainer.style.opacity = '1';
            console.log('[TUTORIAL] Stage 1: Double Jump tutorial shown');
          }
        }

        // Check if player has completed double jump
        if (tutorialStage === 'doubleJump' && !tutorialDoubleJumpCompleted) {
          const jumpCount = physics.getJumpCount();
          if (jumpCount >= 2) {
            // Player performed double jump! Fade out double jump message
            tutorialDoubleJumpCompleted = true;
            tutorialContainer.style.opacity = '0';
            setTimeout(() => {
              doubleJumpContainer.style.display = 'none';
            }, 800); // Wait for fade out
            console.log('[TUTORIAL] Stage 1 complete: Player double jumped');

            // Move to next stage
            tutorialStage = 'dashJump';
          }
        }

        // Butterfly-based parallax control - slow only near target and stop at 20% from right
        // Parallax continues until butterfly reaches 20% from right, then stops UNLESS player has dash jumped
        if (!tutorialDashJumpCompleted) {
          const butterflyX = grounds.getButterflyX();
          if (butterflyX !== null) {
            const butterflyScreenX = butterflyX;
            const targetScreenX = app.renderer.width * 0.8; // 80% from left (20% from right)
            const distanceToTarget = butterflyScreenX - targetScreenX;
            const slowRange = 500;

            if (Math.random() < 0.02) {
              console.log(`[TUTORIAL DEBUG] Butterfly tracking: butterflyX=${butterflyScreenX.toFixed(0)}, target=${targetScreenX.toFixed(0)}, distance=${distanceToTarget.toFixed(0)}`);
            }

            if (distanceToTarget <= 0) {
              tutorialParallaxStopped = true;
              tutorialParallaxSlowFactor = 0;
            } else {
              tutorialParallaxStopped = false;
              tutorialParallaxSlowFactor = Math.min(1, Math.max(0, distanceToTarget / slowRange));
            }
          } else {
            tutorialParallaxStopped = false;
            tutorialParallaxSlowFactor = 1;
          }
        } else {
          tutorialParallaxStopped = false;
          tutorialParallaxSlowFactor = 1;
        }

        if (tutorialStage === 'dashJump' && tutorialDoubleJumpCompleted && !tutorialDashJumpShown) {
          const fenceX = grounds.getFenceX();
          const fenceInView = (() => {
            if (fenceX === null) return false;
            const fenceScreenX = groundContainer.position.x + fenceX * cameraZoom;
            return fenceScreenX <= app.renderer.width * 0.8 && fenceScreenX >= 0;
          })();
          const parallaxSlowing = tutorialParallaxStopped || tutorialParallaxSlowFactor < 1;
          if (fenceInView && parallaxSlowing) {
            tutorialStage = 'dashJump';
            dashJumpContainer.style.display = 'flex';
            tutorialContainer.style.opacity = '1';
            tutorialDashJumpShown = true;
            dashArrowSlid = false;
            dashArrowNudged = false;
            setTimeout(() => {
              if (dashJumpContainer.style.display !== 'none') {
                startDashArrowSlide();
              }
            }, 200);
            console.log('[TUTORIAL] Stage 2: Dash jump tutorial shown');
          }
        }

        // Check if player has completed dash jump AND is past the fence
        if (tutorialDashJumpShown && !tutorialDashJumpCompleted) {
          const fenceX = grounds.getFenceX();

          // Player must dash jump AND be past the fence position
          if (parallaxBoostActive && fenceX !== null && playerX > fenceX) {
            tutorialDashJumpCompleted = true;
            tutorialContainer.style.opacity = '0';
            setTimeout(() => {
              dashJumpContainer.style.display = 'none';
            }, 800); // Wait for fade out
            console.log('[TUTORIAL] Stage 2 complete: Player dash jumped past fence');

            // Tutorial complete - butterfly will fly off automatically via checkButterflyProximity
            tutorialStage = 'complete';
            tutorialActive = false;

            // Resume normal parallax
            tutorialParallaxStopped = false;
            tutorialParallaxSlowFactor = 1;
          }
        }
      }
    }

    if (butterflyManager) {
      butterflyManager.update(deltaSeconds);
      butterflyContainer.removeChildren();
      // Add trail graphics first (so they appear behind butterflies)
      butterflyManager.getTrailGraphics().forEach((g) => butterflyContainer.addChild(g));
      // Then add butterfly sprites on top
      butterflyManager.getSprites().forEach((s) => butterflyContainer.addChild(s));
    }

    // Render platforms using PixiJS Sprites
    platforms.renderToContainer(platformContainer, 0); // No camera offset for now
    holes.renderToContainer(holeContainer, 0);

    if (DEBUG_DRAW_HITBOXES) {
      // Debug: Render platform and ground hole hitboxes
      debugPlatformHitboxContainer.removeChildren();

      // Platform hitboxes (semi-transparent green)
      const platformHitboxes = platforms.getDebugHitboxes(playerDiameter);
      platformHitboxes.forEach((hitbox) => {
        const debugRect = new Graphics();
        debugRect.rect(hitbox.left, hitbox.top, hitbox.width, hitbox.height);
        debugRect.fill({ color: 0x00ff7f, alpha: 0.35 }); // Spring green at 35% opacity
        debugPlatformHitboxContainer.addChild(debugRect);
      });

      // Ground hole hitboxes (semi-transparent red)
      const debugGroundHoleHitboxes = groundHoles.getDebugHitboxes();
      debugGroundHoleHitboxes.forEach((hitbox) => {
        const debugRect = new Graphics();
        debugRect.rect(hitbox.left, hitbox.top, hitbox.right - hitbox.left, hitbox.bottom - hitbox.top);
        debugRect.fill({ color: 0xff4444, alpha: 0.35 }); // Red at 35% opacity
        debugPlatformHitboxContainer.addChild(debugRect);
      });

      // Treehouse hitboxes (semi-transparent)
      const treehouseHitboxes = grounds.getTreehouseHitboxes();
      treehouseHitboxes.forEach((box) => {
        const colorMap: Record<string, number> = {
          shelf: 0xff0000,
          lower_left: 0xffcc00,
        };
        const isTreehousePath = box.key.startsWith('tree_path_');
        const debugRect = new Graphics();
        debugRect.rect(0, 0, box.width, box.height);
        debugRect.fill({ color: isTreehousePath ? 0x00ffff : (colorMap[box.key] ?? 0xffffff), alpha: 0.35 });
        debugRect.pivot.set(box.width / 2, box.height / 2);
        debugRect.position.set(box.left + box.width / 2, box.top + box.height / 2);
        if (box.rotation) {
          debugRect.rotation = box.rotation;
        }
        debugPlatformHitboxContainer.addChild(debugRect);

        // Draw the actual collision surface (top edge) so we can see the real contact line.
        const halfWidth = box.width / 2;
        const halfHeight = box.height / 2;
        const centerX = box.left + halfWidth;
        const centerY = box.top + halfHeight;
        const rotation = box.rotation ?? 0;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const leftX = centerX + (-halfWidth) * cos - (-halfHeight) * sin;
        const leftY = centerY + (-halfWidth) * sin + (-halfHeight) * cos;
        const rightX = centerX + (halfWidth) * cos - (-halfHeight) * sin;
        const rightY = centerY + (halfWidth) * sin + (-halfHeight) * cos;
        const surfaceLine = new Graphics();
        surfaceLine.moveTo(leftX, leftY);
        surfaceLine.lineTo(rightX, rightY);
        surfaceLine.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        debugPlatformHitboxContainer.addChild(surfaceLine);
      });
    }

    megaLaserHeight = playerDiameter * 1.2;

    // Render lasers using pooled sprites with custom texture
    const lasers = laserPhysics.getLasers();
    while (laserSprites.length < lasers.length) {
      const sprite = new Sprite(enemyBeamTexture);
      sprite.anchor.set(0, 0);
      sprite.blendMode = 'normal';
      laserContainer.addChild(sprite);
      laserSprites.push(sprite);
    }

    for (let i = 0; i < laserSprites.length; i++) {
      const sprite = laserSprites[i];
      const laser = lasers[i];
      if (!laser || laser.x + laser.width < -LASER_WIDTH) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.texture = enemyBeamTexture;
      sprite.width = laser.width;
      sprite.height = beamHeight;
      sprite.position.set(laser.x, laser.y);
    }

    // Stars disabled for now

    // Lower ground surface while over hole segments so the player can fall into them
    const baseGroundSurface = computePlayerGround();
    let desiredGroundSurface = baseGroundSurface;

    if (cometHoleLevelActive && !fallingIntoHole) {
      const physicsState = physics.getState();
      const playerLeft = physicsState.x - playerRadius;
      const playerRight = physicsState.x + playerRadius;
      const holeUnderPlayer = groundHoles.getDebugHitboxes().find((hole) => (
        playerRight > hole.left && playerLeft < hole.right
      ));

      if (holeUnderPlayer) {
        desiredGroundSurface = holeUnderPlayer.bottom + playerRadius + 10;
      }
    }

    if (desiredGroundSurface !== currentGroundSurface) {
      physics.setGroundSurface(desiredGroundSurface);
      currentGroundSurface = desiredGroundSurface;
    }

    // Platform collision detection
    // Store previous position for frame-by-frame tracking
    const prevState = { x: ball.position.x, y: ball.position.y };

    // Skip physics update during initial, delay, and complete phases (only run physics during moveout and jump)
    const finalTransitionRollStageActive = finalTransitionActive && finalTransitionStage === 1;
    const skipPhysics =
      freezePlayer ||
      (playerIntroActive && (playerIntroPhase === 'initial' || playerIntroPhase === 'delay' || playerIntroPhase === 'complete')) ||
      (finalTransitionActive && !finalTransitionRollStageActive);
    const state = skipPhysics ? physics.getState() : physics.update(deltaSeconds);
    if (freezePlayer) {
      physics.forceVelocity(0);
    }

    // Smooth player return animation when enemy appears
    if (playerReturnStartTime > 0) {
      const RETURN_DURATION = 1000; // 1.0 seconds (increased from 500ms for smoother animation)
      const elapsed = performance.now() - playerReturnStartTime;
      const progress = Math.min(elapsed / RETURN_DURATION, 1.0);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Lerp player X position
      state.x = playerReturnStartX + (playerReturnTargetX - playerReturnStartX) * eased;

      // Animation complete
      if (progress >= 1.0) {
        playerReturnStartTime = 0;
        console.log('[PLAYER RANGE] Return animation complete');
      }
    }

    if (dashChargeActive || dashChargeReturning) {
      if (respawnState !== 'normal' || fallingIntoHole || playerIntroActive) {
        dashChargeActive = false;
        dashChargeReturning = false;
      } else {
        const dashNow = performance.now();
        const fromX = dashChargeReturning ? dashChargeReturnFromX : dashChargeStartX;
        const toX = dashChargeReturning ? dashChargeReturnToX : dashChargeTargetX;
        const duration = dashChargeReturning ? DASH_RETURN_DURATION : DASH_CHARGE_DURATION;
        const startTime = dashChargeReturning ? dashChargeReturnStartTime : dashChargeStartTime;
        const elapsed = Math.max(0, (dashNow - startTime) / 1000);
        const t = Math.min(1, elapsed / Math.max(0.0001, duration));
        const ease = 1 - Math.pow(1 - t, 3);
        const dashX = fromX + (toX - fromX) * ease;

        state.x = dashX;
        physics.setPosition(dashX, state.y);

        if (!dashChargeReturning) {
          const playerBounds = {
            left: dashX - playerRadius,
            right: dashX + playerRadius,
            top: state.y - playerRadius,
            bottom: state.y + playerRadius,
          };
          const enemyBox = enemyBounds();
          const overlapsX = playerBounds.right > enemyBox.left && playerBounds.left < enemyBox.right;
          const overlapsY = playerBounds.bottom > enemyBox.top && playerBounds.top < enemyBox.bottom;

          if (overlapsX && overlapsY) {
            dashChargeActive = false;
            dashChargeReturning = true;
            dashChargeReturnStartTime = dashNow;
            dashChargeReturnFromX = dashX;
            dashChargeReturnToX = screenToWorldX(app.renderer.width * 0.3);

            enemySquishUntil = dashNow + DASH_HIT_SQUISH_MS;
            enemyFlashUntil = dashNow + 250;
            sparkParticles.spawn(enemyBall.position.x, enemyBall.position.y, 'blue');
            shakeActive = true;
            shakeEndTime = dashNow + DASH_HIT_SHAKE_MS;

            energy = Math.min(100, energy + 7);
            if (orbShootingUnlocked && energyActivated && energy >= 100 && !shootUnlocked) {
              canShoot = true;
              shootUnlocked = true;
              console.log('[SHOOT UNLOCK] Reached 100% energy');
            }
            updateEnergyUI();

            // Dash attack always contributes 5 hits during battle.
            applyRedHits(5);
          }
        }

        if (t >= 1) {
          if (!dashChargeReturning) {
            dashChargeActive = false;
            dashChargeReturning = true;
            dashChargeReturnStartTime = dashNow;
            dashChargeReturnFromX = dashX;
            dashChargeReturnToX = dashChargeStartX;
          } else {
            dashChargeReturning = false;
            physics.setPosition(dashChargeReturnToX, state.y);
            physics.setMousePosition(dashChargeReturnToX);
            dashReturnEaseActive = true;
            dashReturnEaseStartTime = performance.now();
            if (currentInputType !== 'touch') {
              physics.setSoftFollowMode(true);
            }
          }
        }
      }
    }

    if (
      introLandingLeftLockActive &&
      !playerIntroActive &&
      respawnState === 'normal' &&
      !finalTransitionActive &&
      !dashChargeActive &&
      !dashChargeReturning &&
      state.x < introLandingLeftLockX
    ) {
      state.x = introLandingLeftLockX;
      physics.setPosition(introLandingLeftLockX, state.y);
      physics.setMousePosition(introLandingLeftLockX);
    }

    const treehouseStep2Info = grounds.getTreehouseStep2Info();
    const treehouseOrbAnchor = treehouseStep2Info
      ? {
        x: treehouseStep2Info.x + treehouseStep2Info.width * 0.25 + 25,
        y: treehouseStep2Info.y - treehouseStep2Info.height * 0.25 - 30,
      }
      : null;
    meteorOrb.update({
      deltaSeconds,
      timeMs: tickerInstance.lastTime,
      treehouseAnchor: treehouseOrbAnchor,
      playerRadius,
      playerState: state,
      computePlayerGround,
    });

    const verticalVelocity = (state.y - prevState.y) / Math.max(deltaSeconds, 0.0001);

    // Dynamic platform spawner for hole ground segments
    // Spawn platforms consistently over any hole segments
    // Only spawn when holes are actually visible or nearly visible on screen
    const willMoreHolesCome = grounds.willNextSegmentBeHole();

    // Get actual ground hole hitboxes to determine precise spawn boundaries
    const groundHoleHitboxesRuntime = groundHoles.getDebugHitboxes();
    leftmostHoleX = Infinity;
    rightmostHoleX = -Infinity;

    groundHoleHitboxesRuntime.forEach(hole => {
      if (hole.left < leftmostHoleX) {
        leftmostHoleX = hole.left;
      }
      if (hole.right > rightmostHoleX) {
        rightmostHoleX = hole.right;
      }
    });

    const hasActiveHoles = groundHoleHitboxesRuntime.length > 0;
    if (hasActiveHoles && leftmostHoleX !== Infinity) {
      // Track first hole start for respawn positioning
      if (lastHoleStartX === null || leftmostHoleX < lastHoleStartX) {
        lastHoleStartX = leftmostHoleX;
      }
    }

    // Reset platform spawning state when hole sequence is completely over
    if (!hasActiveHoles && !willMoreHolesCome) {
      lastPlatformX = 0;
      isFirstPlatformSpawned = false;
      platformSequenceIndex = 0;
      totalPlatformsSpawned = 0;
      estimatedTotalPlatforms = 0;
      holeSequencePlatformIds.length = 0;
      holeSequencePlatformIndex.clear();
      holeSequenceLastIndex = null;
      holeSequencePenultimateIndex = null;
      lastLandedSequenceIndex = null;
      hasLandedOnFirstPlatform = false;
      firstZoomProgress = 0;
      lateZoomProgress = 0;
      panEaseProgress = 0;
      respawnHoldProgress = 0;
      respawnHoldActive = false;
      respawnHoldStartZoom = 1.0;
      respawnLandProgress = 0;
      respawnLandActive = false;
      lastHoleStartX = null;
      meteorOrb.resetIfNotCollected();
    }

    if (hasActiveHoles || willMoreHolesCome) {
      // We have holes - but only spawn platforms when they're approaching the screen
      const screenRightEdge = state.x + window.innerWidth;
      const spawnAheadDistance = screenRightEdge + window.innerWidth * 1.5; // Look ahead 1.5 screens

      // Only start spawning platforms if:
      // 1. There are ground holes visible/approaching, OR
      // 2. We've already started spawning (lastPlatformX > player position + some threshold)
      const hasStartedSpawning = lastPlatformX > ball.position.x + 200;
      const holeIsApproaching = leftmostHoleX < screenRightEdge + window.innerWidth;

      if (!hasStartedSpawning && !holeIsApproaching) {
        // Holes not approaching yet - don't spawn anything, skip this section
      } else {
        // Initialize lastPlatformX to start just before the first hole
        if (!hasStartedSpawning && holeIsApproaching && leftmostHoleX !== Infinity) {
          lastPlatformX = leftmostHoleX - 300; // Start 300px before first hole
        }

        // Determine how far we should spawn platforms based on ACTUAL hole hitboxes
        let spawnTargetX: number;
        if (willMoreHolesCome && rightmostHoleX > -Infinity) {
          // More holes coming - keep spawning ahead, but not beyond lookahead
          // Use the actual rightmost hole hitbox position
          spawnTargetX = Math.max(rightmostHoleX, spawnAheadDistance);
        } else if (rightmostHoleX > -Infinity) {
          // No more holes coming - stop ONE PLATFORM BEFORE the rightmost hole ends
          // This prevents spawning a platform after ground resumes
          const averagePlatformSpacing = (PLATFORM_MIN_SPACING + PLATFORM_MAX_SPACING) / 2;
          spawnTargetX = rightmostHoleX - averagePlatformSpacing;
        } else {
          // No holes visible yet but more coming - spawn up to lookahead
          spawnTargetX = spawnAheadDistance;
        }

        // Spawn platforms in a loop until we've filled the needed area
        let spawnCount = 0;
        const maxSpawnsPerFrame = 10; // Prevent infinite loops

        while (lastPlatformX < spawnTargetX && spawnCount < maxSpawnsPerFrame) {
          // Calculate next platform X position
          const spacing = PLATFORM_MIN_SPACING + Math.random() * (PLATFORM_MAX_SPACING - PLATFORM_MIN_SPACING);
          const platformX = lastPlatformX + spacing;

          // Don't spawn beyond our target
          if (platformX > spawnTargetX) {
            break;
          }

          // Check if this platform would spawn on/above the hole_transition_back segment
          const segments = grounds.getSegments();
          const transitionBackSegment = segments.find(seg => seg.type === 'hole_transition_back');
          if (transitionBackSegment) {
            const segmentLeft = transitionBackSegment.x;
            const segmentRight = transitionBackSegment.x + transitionBackSegment.width;
            // Don't spawn platforms that overlap with the transition_back area
            if (platformX >= segmentLeft && platformX <= segmentRight) {
              // Skip this platform position and move to next
              lastPlatformX = platformX;
              continue;
            }
          }

          // Determine platform height progressively based on player's current height
          let verticalOffset: number;

          // Determine if this will be the last platform in the sequence
          // Last platform is when we're close to the end and no more holes are coming
          const distanceToEnd = spawnTargetX - platformX;
          const averageSpacing = (PLATFORM_MIN_SPACING + PLATFORM_MAX_SPACING) / 2;
          const isLastPlatform = !willMoreHolesCome && distanceToEnd < averageSpacing * 1.5;

          // Calculate vertical offset based on position in sequence
          // First platform is at ground level, most stay near ground, last platform is highest
          if (!isFirstPlatformSpawned) {
            verticalOffset = FIRST_PLATFORM_HEIGHT - FIRST_PLATFORM_DROP;
          } else if (isLastPlatform) {
            // Final platform is the highest
            verticalOffset = FINAL_PLATFORM_HEIGHT;
          } else {
            // Estimate total platforms to calculate progression
            // Use distance to end and average spacing to estimate how many platforms remain
            const distanceToEnd = spawnTargetX - platformX;
            const averageSpacing = (PLATFORM_MIN_SPACING + PLATFORM_MAX_SPACING) / 2;
            estimatedTotalPlatforms = Math.max(4, Math.ceil(distanceToEnd / averageSpacing) + totalPlatformsSpawned);

            // Calculate progression: 0 = first platform, 1 = last platform
            const progression = totalPlatformsSpawned / (estimatedTotalPlatforms - 1);

            // Use exponential curve for height - keeps platforms low until near the end
            // First 70% of platforms stay very close to ground, last 30% gradually rise
            const heightCurve = Math.pow(progression, 3); // Cubic curve for gradual increase

            // Most platforms stay near ground (60-120px), with gradual increase toward final height
            const baseHeight = 40; // Minimum height above ground
            const heightRange = FINAL_PLATFORM_HEIGHT - baseHeight;
            verticalOffset = baseHeight + (heightRange * heightCurve);

            // Add small random variation to avoid perfectly uniform heights
            verticalOffset += (Math.random() - 0.5) * 20; // ±10px variation
          }

          const groundY = computePlayerGround();

          // Use fire platform sequence instead of random types
          const platformType = getNextPlatformType(isLastPlatform);

          // First platform spawns 10px to the right for better visual positioning
          const spawnX = !isFirstPlatformSpawned ? platformX + 10 : platformX;

          const spawnedPlatformId = platforms.spawn(spawnX, groundY, playerRadius, platformType, verticalOffset);

          // Increment sequence counters
          totalPlatformsSpawned++;

          // Mark first platform as spawned AFTER spawning it
          // This ensures getNextPlatformType() sees the correct state
          if (!isFirstPlatformSpawned) {
            isFirstPlatformSpawned = true;
          } else {
            platformSequenceIndex++;
          }

          if (spawnedPlatformId !== null) {
            const seqIndex = holeSequencePlatformIds.length;
            holeSequencePlatformIds.push(spawnedPlatformId);
            holeSequencePlatformIndex.set(spawnedPlatformId, seqIndex);

            if (isLastPlatform && holeSequenceLastIndex === null) {
              holeSequenceLastIndex = seqIndex;
              holeSequencePenultimateIndex = Math.max(0, seqIndex - 1);
            }
          }

          lastPlatformX = platformX;
          spawnCount++;
        }
      }
    }

    const meteorBounds = cometHoleLevelActive ? grounds.getMeteorOverlayBounds() : null;

    if (cometHoleLevelActive && meteorBounds) {
      updateMeteorHitbox(meteorBounds);
    } else if (meteorHitbox) {
      meteorHitbox = null;
    }

    const meteorSwirlActive = cometHoleLevelActive;
    const meteorSwirlArea = (() => {
      if (!meteorSwirlActive) return null;
      const platformBounds = holeSequencePlatformIds
        .map((id) => platforms.getPlatformBoundsById(id))
        .filter((bounds): bounds is PlatformCollision => bounds !== null);
      if (platformBounds.length >= 2) {
        const left = Math.min(...platformBounds.map((bounds) => bounds.left));
        const right = Math.max(...platformBounds.map((bounds) => bounds.right));
        const minSurfaceY = Math.min(...platformBounds.map((bounds) => bounds.surfaceY));
        const maxSurfaceY = Math.max(...platformBounds.map((bounds) => bounds.surfaceY));
        const top = minSurfaceY - playerRadius * 6;
        const bottom = maxSurfaceY - playerRadius * 1.2;
        return {
          left,
          right,
          top: Math.min(top, bottom - playerRadius),
          bottom,
        };
      }
      if (meteorBounds) {
        return {
          left: meteorBounds.x + 20,
          right: meteorBounds.x + meteorBounds.width - 20,
          top: meteorBounds.y - meteorBounds.height + 20,
          bottom: meteorBounds.y - 40,
        };
      }
      return null;
    })();

    if (meteorSwirlArea && !meteorSwirlSpawned) {
      spawnMeteorSwirlOrbs(meteorSwirlArea);
    } else if (!meteorSwirlArea && meteorSwirlSpawned) {
      meteorSwirlOrbs.length = 0;
      meteorSwirlSpawned = false;
    }

    meteorSwirlGraphics.clear();
    const meteorBaseSize = getMeteorSwirlOrbBaseSize();
    const meteorTime = tickerInstance.lastTime / 1000;
    if (meteorSwirlArea && meteorSwirlOrbs.length > 0) {
      const minX = meteorSwirlArea.left;
      const maxX = meteorSwirlArea.right;
      const topY = meteorSwirlArea.top;
      const bottomY = meteorSwirlArea.bottom;
      meteorSwirlOrbs.forEach((orb) => {
        if (orb.collected) return;
        const safeMinX = minX + orb.radius;
        const safeMaxX = maxX - orb.radius;
        const safeMinY = topY + orb.radius;
        const safeMaxY = bottomY - orb.radius;
        const hasSafeX = safeMaxX > safeMinX;
        const hasSafeY = safeMaxY > safeMinY;
        const baseX = hasSafeX
          ? safeMinX + (safeMaxX - safeMinX) * orb.offsetX + orb.jitterX
          : (minX + maxX) * 0.5;
        const baseY = hasSafeY
          ? safeMinY + (safeMaxY - safeMinY) * orb.offsetY + orb.jitterY
          : (topY + bottomY) * 0.5;
        const clampedBaseX = hasSafeX ? Math.min(safeMaxX, Math.max(safeMinX, baseX)) : baseX;
        const clampedBaseY = hasSafeY ? Math.min(safeMaxY, Math.max(safeMinY, baseY)) : baseY;
        const orbitPhase = meteorTime * orb.speed + orb.phase;
        const swingX = Math.sin(orbitPhase);
        const swingY = Math.cos(orbitPhase * 0.9 + orb.phase * 0.6);
        const radius = orb.radius * (0.85 + 0.15 * Math.sin(meteorTime * (orb.speed * 1.4) + orb.phase));
        const bob = Math.sin(meteorTime * (orb.speed * 1.7) + orb.phase * 1.2) * (orb.radius * 0.2);
        orb.currentX = Math.min(maxX, Math.max(minX, clampedBaseX + swingX * radius));
        orb.currentY = Math.min(bottomY, Math.max(topY, clampedBaseY + swingY * radius * 0.95 + bob));
        const orbSize = meteorBaseSize * orb.sizeScale;
        meteorSwirlGraphics.circle(orb.currentX, orb.currentY, orbSize).fill({ color: 0x9fe7ff, alpha: 0.95 });

        const dx = state.x - orb.currentX;
        const dy = state.y - orb.currentY;
        const collectRadius = playerRadius + orbSize + METEOR_SWIRL_ORB_COLLECT_PAD;
        if ((dx * dx + dy * dy) <= collectRadius * collectRadius) {
          orb.collected = true;
          meteorSwirlFollowers.push({
            id: orb.id,
            radius: Math.max(playerRadius * 1.8, orb.radius * 0.2),
            arc: orb.arc,
            speed: orb.speed * 1.1,
            phase: Math.random() * Math.PI * 2,
            sizeScale: orb.sizeScale,
            currentX: orb.currentX,
            currentY: orb.currentY,
          });
        }
      });
    }

    if (meteorSwirlFollowers.length > 0) {
      meteorSwirlFollowers.forEach((orb, index) => {
        const followBaseX = state.x - playerRadius * METEOR_SWIRL_FOLLOW_X_OFFSET;
        const followBaseY = state.y - playerRadius * METEOR_SWIRL_FOLLOW_Y_OFFSET;
        const spacing = (index - (meteorSwirlFollowers.length - 1) / 2) * playerRadius * METEOR_SWIRL_FOLLOW_SPACING;
        const osc = Math.sin(meteorTime * orb.speed + orb.phase);
        const angle = orb.arc * osc;
        const radius = orb.radius * (0.7 + 0.3 * Math.sin(meteorTime * (orb.speed * 1.3) + orb.phase));
        orb.currentX = followBaseX + Math.cos(angle) * radius;
        orb.currentY = followBaseY + spacing + Math.sin(angle) * radius * 0.6;
        const orbSize = meteorBaseSize * orb.sizeScale;
        meteorSwirlGraphics.circle(orb.currentX, orb.currentY, orbSize).fill({ color: 0x7bd6ff, alpha: 0.95 });
      });
    }

    // Spawn red enemy inside the meteor overlay when it appears
    if (cometHoleLevelActive && meteorBounds && !redEnemyActive) {
      // Position enemy inside meteor using percentages of overlay dimensions plus pixel adjustments
      const percentFromLeft = 0.36; // 36% from left edge of overlay
      const percentFromBottom = 0.27; // 27% from bottom edge of overlay

      // Fine-tune position with pixel offsets (move 30px left, 50px down, then 10px right, 15px down)
      const enemyX = meteorBounds.x + (meteorBounds.width * percentFromLeft) - 30 + 10;
      const enemyY = meteorBounds.y - (meteorBounds.height * percentFromBottom) + 50 + 15;

      enemyBall.position.set(enemyX, enemyY);
      enemyBall.visible = true;
      redEnemyActive = true;
      redEnemyState = 'on_platform'; // Using 'on_platform' state but enemy is in meteor
      if (forceEnemyJumpOut) {
        redEnemyState = 'falling';
        redEnemyVelocityX = 300; // Jump out to the right
        redEnemyVelocityY = -400; // Jump up and out
        forceEnemyJumpOut = false;
        console.log('[RED ENEMY] Auto-jump out of meteor');
      }
      console.log(
        `[RED ENEMY] Spawned inside meteor at x=${enemyX.toFixed(0)} y=${enemyY.toFixed(0)} (overlay: ${meteorBounds.width.toFixed(0)}x${meteorBounds.height.toFixed(0)})`
      );
    }

    // Red enemy collision detection with blue player
    if (redEnemyActive && redEnemyState === 'on_platform') {
      // Keep enemy stuck to meteor overlay position as it scrolls
      if (meteorBounds) {
        // Update enemy position using percentages of overlay dimensions plus pixel adjustments
        const percentFromLeft = 0.36; // 36% from left edge of overlay
        const percentFromBottom = 0.27; // 27% from bottom edge of overlay

        // Fine-tune position with pixel offsets (move 30px left, 50px down, then 10px right, 15px down, then 25px right, 15px down, then 10px right, 5px down)
        enemyBall.position.x = meteorBounds.x + (meteorBounds.width * percentFromLeft) + 138;
        enemyBall.position.y = meteorBounds.y - (meteorBounds.height * percentFromBottom) + 160;
      } else {
        // Meteor overlay vanished; enemy jumps out
        redEnemyState = 'falling';
        redEnemyVelocityX = 300; // Jump out to the right
        redEnemyVelocityY = -400; // Jump up
        meteorHitbox = null; // Clear meteor hitbox
        console.log('[RED ENEMY] Meteor vanished, jumping out');
      }

      const playerBounds = {
        left: state.x - playerRadius,
        right: state.x + playerRadius,
        top: state.y - playerRadius,
        bottom: state.y + playerRadius,
      };
      const enemyBounds = {
        left: enemyBall.position.x - playerRadius,
        right: enemyBall.position.x + playerRadius,
        top: enemyBall.position.y - playerRadius,
        bottom: enemyBall.position.y + playerRadius,
      };

      // Check AABB collision
      const overlapsX = playerBounds.right > enemyBounds.left && playerBounds.left < enemyBounds.right;
      const overlapsY = playerBounds.bottom > enemyBounds.top && playerBounds.top < enemyBounds.bottom;

      if (overlapsX && overlapsY) {
        // Player hit the enemy - jump out of meteor
        redEnemyState = 'falling';
        redEnemyVelocityX = 300; // Jump out to the right
        redEnemyVelocityY = -400; // Jump up and out
        // Impact feedback: sparks + quick screen shake
        sparkParticles.spawn(enemyBall.position.x, enemyBall.position.y, 'red');
        shakeActive = true;
        shakeEndTime = performance.now() + 220;
        console.log('[RED ENEMY] Hit by player, jumping out of meteor');
      }
    }

    // Red enemy falling animation (jumps out of meteor, lands on ground)
    if (redEnemyActive && redEnemyState === 'falling') {
      const GRAVITY = 2000; // Gravity for falling
      redEnemyVelocityY += GRAVITY * deltaSeconds;
      enemyBall.position.x += redEnemyVelocityX * deltaSeconds;
      enemyBall.position.y += redEnemyVelocityY * deltaSeconds;

      // Check if enemy has landed on ground
      const groundY = computePlayerGround();
      if (enemyBall.position.y >= groundY - playerRadius) {
        // Enemy landed on ground - snap to ground and transition to rolling state
        enemyBall.position.y = groundY - playerRadius;
        redEnemyVelocityY = 0;
        redEnemyState = 'rolling_in';
        console.log('[RED ENEMY] Landed on ground, starting roll to the right');
      }
    }

    // Red enemy rolling in animation (rolls right after landing from meteor)
    if (redEnemyActive && redEnemyState === 'rolling_in') {
      // First time entering rolling state - mark enemy as visible
      if (!enemyEverVisible) {
        enemyEverVisible = true;
        console.log('[PLAYER RANGE] Enemy appearing, keeping full range');
      }

      // Roll to the right
      enemyBall.position.x += RED_ENEMY_ROLL_SPEED * deltaSeconds;

      // Stop at 90% of screen width (final enemy position)
      const targetX = getEnemyTargetX();
      if (enemyBall.position.x >= targetX) {
        enemyBall.position.x = targetX;
        redEnemyState = 'jumping_intro';
        enemyIntroMoveActive = enemyBall.position.x < targetX - 1;
        enemyIntroMoveStartX = enemyBall.position.x;
        enemyIntroMoveStartTime = performance.now();
        // Trigger the existing enemy intro animation system
        enemyMode = 'physics';
        enemyPhysics.startJumpSequence();
        console.log('[RED ENEMY] Reached position, starting 3-jump intro using enemyPhysics');
      }
    }

    // Scenario proximity checks
    if (scenarioActive && scenarioSmallId !== null) {
      const smallPlat = platforms.getPlatformBounds(scenarioSmallId);
      if (smallPlat) {
        const playerFront = state.x + playerRadius;
        const distance = smallPlat.left - playerFront;
        if (scenarioStage === 'awaiting' && distance < 150) {
          scenarioStage = 'prep';
        }
        if (scenarioStage === 'prep' && distance < 40) {
          scenarioStage = 'charging';
          megaLaserActive = false;
          megaLaserStart = performance.now();
          const groundY = computePlayerGround() - playerRadius;
          enemyMovement.setTarget(groundY);
        }
      }
    }

    // Calculate player bounds for collision detection
    const playerBoundsFull: PlayerBounds = {
      left: state.x - playerRadius,
      right: state.x + playerRadius,
      top: state.y - playerRadius,
      bottom: state.y + playerRadius,
    };

    const platformHalfWidth = playerRadius * PLAYER_PLATFORM_HITBOX_HORIZONTAL_SCALE;
    const playerBounds: PlayerBounds = {
      left: state.x - platformHalfWidth,
      right: state.x + platformHalfWidth,
      top: state.y - playerRadius,
      bottom: state.y + playerRadius,
    };
    const prevBounds: PlayerBounds = {
      left: prevState.x - platformHalfWidth,
      right: prevState.x + platformHalfWidth,
      top: prevState.y - playerRadius,
      bottom: prevState.y + playerRadius,
    };
    const platformLandingBounds: PlayerBounds = {
      left: state.x - playerRadius,
      right: state.x + playerRadius,
      top: state.y - playerRadius,
      bottom: state.y + playerRadius,
    };
    const platformPrevLandingBounds: PlayerBounds = {
      left: prevState.x - playerRadius,
      right: prevState.x + playerRadius,
      top: prevState.y - playerRadius,
      bottom: prevState.y + playerRadius,
    };

    const treehousePlatforms = getTreehousePlatforms();
    const treehousePlatformMap = new Map<number, TreehousePlatform>();
    treehousePlatforms.forEach((platform) => {
      treehousePlatformMap.set(platform.id, platform);
    });

    // Detect platforms being passed through while ascending (jumping up)
    const platformsPassedThrough = platforms.getPlatformsPassedThrough(
      platformLandingBounds,
      platformPrevLandingBounds,
      verticalVelocity
    );

    // Mark each platform that was jumped through
    platformsPassedThrough.forEach(platformId => {
      physics.markPlatformJumpedThrough(platformId);
    });
    const treehousePassedThrough = getTreehousePlatformsPassedThrough(
      treehousePlatforms,
      playerBounds,
      prevBounds,
      verticalVelocity
    );
    treehousePassedThrough.forEach((platformId) => {
      physics.markPlatformJumpedThrough(platformId);
    });

    // Check for platform collision (ignore small movements during charge to prevent falling through)
    const isCharging = physics.isChargingJump();
    let supportingPlatform = platforms.getSupportingPlatform(
      platformLandingBounds,
      platformPrevLandingBounds,
      verticalVelocity,
      physics.getJumpedThroughPlatforms() // Pass Set of platforms jumped through
    );

    if (supportingPlatform && lastLeftPlatformId !== null && supportingPlatform.id === lastLeftPlatformId) {
      const playerHeight = playerBounds.bottom - playerBounds.top;
      const tolerance = Math.max(2, playerHeight * 0.05);
      const isBelowSurface = playerBounds.top > supportingPlatform.surfaceY + tolerance;
      if (isBelowSurface) {
        logPlatformSnap('Blocked reattach to last-left platform', {
          id: supportingPlatform.id,
          vy: verticalVelocity,
          playerTop: playerBounds.top,
          platformSurface: supportingPlatform.surfaceY,
        });
        supportingPlatform = null;
      } else {
        logPlatformSnap('Allowed reattach to last-left platform', {
          id: supportingPlatform.id,
          vy: verticalVelocity,
          playerTop: playerBounds.top,
          platformSurface: supportingPlatform.surfaceY,
        });
      }
    }

    // Check for meteor hitbox collision if no platform found
    if (!supportingPlatform && meteorHitbox) {
      const hitboxLeft = meteorHitbox.x;
      const hitboxRight = meteorHitbox.x + meteorHitbox.width;
      const horizontalOverlap = playerBounds.right > hitboxLeft && playerBounds.left < hitboxRight;

      if (horizontalOverlap) {
        const playerHeight = playerBounds.bottom - playerBounds.top;
        const tolerance = Math.max(2, playerHeight * 0.05);
        const platformBottomCollision = meteorHitbox.surfaceY + playerHeight;
        const descending = verticalVelocity <= 0 || playerBounds.bottom > prevBounds.bottom;
        const approachingFromAbove = prevBounds.top + tolerance <= meteorHitbox.surfaceY;
        const crossedThisFrame =
          descending &&
          approachingFromAbove &&
          prevBounds.bottom <= platformBottomCollision + tolerance &&
          playerBounds.bottom >= platformBottomCollision - tolerance;
        const resting =
          Math.abs(playerBounds.bottom - platformBottomCollision) <= tolerance &&
          Math.abs(verticalVelocity) < 0.8;

        if (crossedThisFrame || resting) {
          // Player landed on meteor hitbox - treat it like a platform
          supportingPlatform = {
            id: -1, // Special ID for meteor hitbox
            surfaceY: meteorHitbox.surfaceY,
            left: hitboxLeft,
            right: hitboxRight,
          };
        }
      }
    }

    if (!supportingPlatform && treehousePlatforms.length > 0) {
      const pathSurface = getTreehousePathSurfaceAt(treehousePlatforms, playerBounds);
      if (pathSurface) {
        const playerHeight = playerBounds.bottom - playerBounds.top;
        const targetBottom = pathSurface.surfaceY + playerHeight;
        const verticalGap = Math.abs(playerBounds.bottom - targetBottom);
        if (verticalGap <= TREEHOUSE_RAMP_STEP) {
          supportingPlatform = {
            id: pathSurface.platform.id,
            surfaceY: pathSurface.surfaceY,
            left: pathSurface.platform.left,
            right: pathSurface.platform.right,
          };
        }
      }
      if (!supportingPlatform) {
        supportingPlatform = getSupportingTreehousePlatform(
          treehousePlatforms,
          playerBounds,
          prevBounds,
          verticalVelocity,
          physics.getJumpedThroughPlatforms()
        );
      }
    }

    // Last-second save: if we're falling into a hole but land on a platform from above, recover.
    if (respawnState === 'normal' && fallingIntoHole && supportingPlatform && verticalVelocity >= 0) {
      fallingIntoHole = false;
      respawnInputLocked = false;
      physics.setGroundCollisionEnabled(true);
    }

    // Hole collision: if we're not on a platform and overlap a hole, fall and respawn
    if (!supportingPlatform && !fallingIntoHole) {
      const hole = holes.getCollidingHole(playerBounds);
      if (hole) {
        const plumeX = state.x;
        const plumeY = playerBounds.bottom;
        triggerFallIntoHole(verticalVelocity, plumeX, plumeY);
        activePlatformId = null;
      }

      // Ground hole collision (comet hole level)
      const groundHole = groundHoles.getCollidingHole(playerBounds);
      if (groundHole) {
        const plumeX = state.x;
        const plumeY = playerBounds.bottom;
        triggerFallIntoHole(verticalVelocity, plumeX, plumeY);
        activePlatformId = null;
        console.log(`[GROUND HOLE] Player fell into ${groundHole.type} hole`);
      }
    }

    if (!fallingIntoHole) {
      if (supportingPlatform) {
        // Player is on a platform - set surface override
        const isNewLanding = activePlatformId !== supportingPlatform.id;
        activePlatformId = supportingPlatform.id;
        if (isNewLanding && supportingPlatform.id >= 0) {
          lastLeftPlatformId = null;
        }
        const treehousePlatform = treehousePlatformMap.get(supportingPlatform.id);
        const treehouseBlendSurface = treehousePlatform && treehousePlatforms.length > 1
          ? getTreehouseBlendSurfaceForActive(supportingPlatform.id, treehousePlatforms, playerBounds)
          : null;
        const effectiveSurfaceY = treehouseBlendSurface ?? supportingPlatform.surfaceY;
        if (treehousePlatform && treehouseBlendSurface !== null) {
          supportingPlatform.surfaceY = treehouseBlendSurface;
        }
        const landingOffset = treehousePlatform ? TREEHOUSE_LANDING_OFFSET : PLATFORM_LANDING_OFFSET;

        // Convert stored platform surface (player top) to the center y the physics uses, and sink slightly for visuals
        const landingY = effectiveSurfaceY + playerRadius + landingOffset;
        physics.landOnSurface(landingY, supportingPlatform.id); // Pass platform ID to clear from jumped-through list

        // Trigger landing compression on first landing
        if (isNewLanding) {
          // Get fall height (distance from highest point to landing platform)
          const fallHeight = physics.getFallHeight();
          platforms.triggerLandingCompression(supportingPlatform.id, fallHeight);
          // Reset fall height tracking now that we've landed
          physics.resetFallHeight();
        }

        if (supportingPlatform.id >= 0) {
          if (isNewLanding && cometHoleLevelActive) {
            const seqIndex = holeSequencePlatformIndex.get(supportingPlatform.id);
            if (seqIndex !== undefined) {
              laserScore += 1;
              updateScoreDisplay();
            }
          }
          const seqIndex = holeSequencePlatformIndex.get(supportingPlatform.id);
          if (seqIndex !== undefined) {
            lastLandedSequenceIndex = seqIndex;
          }
          if (cometHoleLevelActive && !hasLandedOnFirstPlatform) {
            hasLandedOnFirstPlatform = true;
          }
        }

        // Lock camera floor to this platform if it's higher than current floor
        if (effectiveSurfaceY < cameraFloorY) {
          cameraFloorY = effectiveSurfaceY;
        }

        // Check if player has moved outside platform horizontal bounds
        // Skip this check when charging to prevent squash animation from causing fall-through
        const timeSinceJump = performance.now() - lastJumpTime;
        const inJumpGracePeriod = timeSinceJump < JUMP_GRACE_PERIOD;

        if (!isCharging) {
          let treehouseOverlap = false;
          if (treehousePlatform) {
            if (treehousePlatform.key?.startsWith('tree_path_')) {
              treehouseOverlap = !!getTreehousePathSurfaceAt(treehousePlatforms, playerBounds);
            } else {
              const treehouseSurfaceY = treehouseBlendSurface ?? getTreehouseSurfaceYForPlayer(treehousePlatform, state.x, state.y);
              treehouseOverlap = isTreehouseSurfaceContact(treehouseSurfaceY, playerBounds, treehousePlatforms);
            }
          }
          const walkedOff = treehousePlatform
            ? !treehouseOverlap
            : (
              playerBounds.right < supportingPlatform.left - PLATFORM_EDGE_TOLERANCE ||
              playerBounds.left > supportingPlatform.right + PLATFORM_EDGE_TOLERANCE
            );

          // Fall through if walked off edge OR if pressing Down key
          if ((walkedOff || isPressingDown) && !inJumpGracePeriod) {
            logPlatformSnap('Clearing override after walk-off', {
              id: supportingPlatform.id,
              walkedOff,
              down: isPressingDown,
              vy: verticalVelocity,
              playerLeft: playerBounds.left,
              playerRight: playerBounds.right,
              platLeft: supportingPlatform.left,
              platRight: supportingPlatform.right,
            });
            physics.clearSurfaceOverride();
            if (supportingPlatform.id >= 0) {
              physics.clearPlatformJumpedThrough(supportingPlatform.id);
              lastLeftPlatformId = supportingPlatform.id;
            }
            activePlatformId = null;
          }
        }
        // Increase climb bonus when we successfully land on any platform
        platformAscendBonus = Math.min(platformAscendBonus + PLATFORM_ASCEND_STEP, PLATFORM_ASCEND_MAX);
      } else if (activePlatformId !== null) {
        // Keep platform override while bouncing vertically so the bounce counter isn't reset
        let treehousePlatform = treehousePlatformMap.get(activePlatformId);
        let treehouseBlendSurface = treehousePlatforms.length > 1
          ? getTreehouseBlendSurfaceForActive(activePlatformId, treehousePlatforms, playerBounds)
          : null;
        let livePlatform =
          activePlatformId === -1 && meteorHitbox
            ? { left: meteorHitbox.x, right: meteorHitbox.x + meteorHitbox.width, surfaceY: meteorHitbox.surfaceY }
            : (treehousePlatform
              ? {
                left: treehousePlatform.left,
                right: treehousePlatform.right,
                surfaceY: treehouseBlendSurface ?? getTreehouseSurfaceYForPlayer(treehousePlatform, state.x, state.y),
                rotation: treehousePlatform.rotation,
                centerX: treehousePlatform.centerX,
                centerY: treehousePlatform.centerY,
                halfWidth: treehousePlatform.halfWidth,
                halfHeight: treehousePlatform.halfHeight,
              }
              : platforms.getPlatformBounds(activePlatformId));

        // If platform has been culled (scrolled away), release the player
        if (!livePlatform) {
          physics.clearSurfaceOverride();
          if (activePlatformId !== null && activePlatformId >= 0) {
            physics.clearPlatformJumpedThrough(activePlatformId);
            lastLeftPlatformId = activePlatformId;
          }
          activePlatformId = null;
        } else {
          const treehouseActive = !!treehousePlatform;
          const pathSurface = treehousePlatform?.key?.startsWith('tree_path_')
            ? getTreehousePathSurfaceAt(treehousePlatforms, playerBounds)
            : null;
          if (pathSurface) {
            livePlatform.surfaceY = pathSurface.surfaceY;
          }
          const stillOverPlatform = treehouseActive
            ? (pathSurface
              ? Math.abs(
                (pathSurface.surfaceY + (playerBounds.bottom - playerBounds.top)) - playerBounds.bottom
              ) <= TREEHOUSE_RAMP_STEP * 2
              : isTreehouseSurfaceContact(livePlatform.surfaceY, playerBounds, treehousePlatforms))
            : (
              playerBounds.right >= livePlatform.left - PLATFORM_EDGE_TOLERANCE &&
              playerBounds.left <= livePlatform.right + PLATFORM_EDGE_TOLERANCE
            );

          if (treehousePlatform && !isCharging) {
            const pathSurface = getTreehousePathSurfaceAt(treehousePlatforms, playerBounds);
            if (pathSurface) {
              const newPlatformId = pathSurface.platform.id;
              activePlatformId = newPlatformId;
              treehousePlatform = treehousePlatformMap.get(newPlatformId);
              if (treehousePlatform) {
                const landingOffset = TREEHOUSE_LANDING_OFFSET;
                physics.landOnSurface(pathSurface.surfaceY + playerRadius + landingOffset, newPlatformId);
                livePlatform = {
                  left: treehousePlatform.left,
                  right: treehousePlatform.right,
                  surfaceY: pathSurface.surfaceY,
                  rotation: treehousePlatform.rotation,
                  centerX: treehousePlatform.centerX,
                  centerY: treehousePlatform.centerY,
                  halfWidth: treehousePlatform.halfWidth,
                  halfHeight: treehousePlatform.halfHeight,
                };
              }
            }
          }

          // Check if we're in the grace period after a jump (ignore brief downward movement)
          const timeSinceJump = performance.now() - lastJumpTime;
          const inJumpGracePeriod = timeSinceJump < JUMP_GRACE_PERIOD;

          // If we're deliberately pressing Down, force a fall-through (unless in grace)
          if (stillOverPlatform && !isCharging && Math.abs(verticalVelocity) < 5) {
            if (verticalVelocity > 0) {
              logPlatformSnap('Maintenance lock while falling', {
                id: activePlatformId,
                vy: verticalVelocity,
                playerBottom: playerBounds.bottom,
                platSurface: livePlatform.surfaceY,
              }, 200);
            }
            const landingOffset = treehouseActive ? TREEHOUSE_LANDING_OFFSET : PLATFORM_LANDING_OFFSET;
            const updatedSurfaceY = livePlatform.surfaceY + playerRadius + landingOffset;
            const platformId = activePlatformId;
            if (platformId !== null) {
              physics.landOnSurface(updatedSurfaceY, platformId);
            }
          }

          if (isPressingDown && !inJumpGracePeriod) {
            physics.clearSurfaceOverride();
            logPlatformSnap('Clearing override via down press', {
              id: activePlatformId,
              vy: verticalVelocity,
            });
            if (activePlatformId !== null && activePlatformId >= 0) {
              physics.clearPlatformJumpedThrough(activePlatformId);
              lastLeftPlatformId = activePlatformId;
            }
            activePlatformId = null;
          } else if (!stillOverPlatform && !inJumpGracePeriod) {
            // If we've drifted off the platform horizontally, drop the override so we can fall
            // BUT: Skip this check during jump grace period to prevent fall-through on jump execution
            physics.clearSurfaceOverride();
            logPlatformSnap('Clearing override after drift off', {
              id: activePlatformId,
              vy: verticalVelocity,
              playerLeft: playerBounds.left,
              playerRight: playerBounds.right,
              platLeft: livePlatform.left,
              platRight: livePlatform.right,
            });
            if (activePlatformId !== null && activePlatformId >= 0) {
              physics.clearPlatformJumpedThrough(activePlatformId);
              lastLeftPlatformId = activePlatformId;
            }
            activePlatformId = null;
          }
        }
      }
    }

    if (treehousePlatforms.length > 0) {
      const activeTreehousePlatform = activePlatformId !== null
        ? treehousePlatformMap.get(activePlatformId)
        : null;
      const playerBottom = playerBoundsFull.bottom;
      const descending = verticalVelocity > 0.5;

      const step1Platform = treehousePlatforms.find((platform) => platform.key === 'lower_left') ?? null;
      const step1Overlap = step1Platform ? isTreehousePlatformHorizontalOverlap(step1Platform, playerBounds) : false;
      const step1SurfaceY = step1Platform
        ? getTreehouseSurfaceYForPlayer(step1Platform, state.x, state.y)
        : null;
      const step1Top = step1SurfaceY !== null ? step1SurfaceY + playerDiameter : null;
      const step1Cleared = step1Top !== null && playerBottom <= step1Top - TREEHOUSE_STEP_Z_BUFFER;
      const step1Active = activeTreehousePlatform?.key === 'lower_left';
      const step1InFront = step1Active || (descending && step1Overlap && step1Cleared);

      const pathSurface = getTreehousePathSurfaceAt(treehousePlatforms, playerBounds);
      let step2SurfaceY = pathSurface ? pathSurface.surfaceY : null;
      if (step2SurfaceY === null) {
        const step2Platform = treehousePlatforms.find(
          (platform) =>
            platform.key?.startsWith('tree_path_') &&
            isTreehousePlatformHorizontalOverlap(platform, playerBounds)
        );
        if (step2Platform) {
          step2SurfaceY = getTreehouseSurfaceYForPlayer(step2Platform, state.x, state.y);
        }
      }
      const step2Top = step2SurfaceY !== null ? step2SurfaceY + playerDiameter : null;
      const step2Cleared = step2Top !== null && playerBottom <= step2Top - TREEHOUSE_STEP_Z_BUFFER;
      const step2Active = activeTreehousePlatform?.key?.startsWith('tree_path_') ?? false;
      const step2InFront = step2Active || (descending && step2SurfaceY !== null && step2Cleared);

      grounds.setTreehouseStepForeground(step1InFront, step2InFront);
    } else {
      grounds.setTreehouseStepForeground(false, false);
    }

    // Determine if we're back on the baseline ground
    const baselineRestY = computePlayerGround() - playerRadius;
    const BASELINE_SNAP_TOLERANCE = 4;
    const nearBaselineSurface = state.y >= baselineRestY - BASELINE_SNAP_TOLERANCE;
    isOnBaselineGround = nearBaselineSurface;

    if (isOnBaselineGround) {
      // If any stale platform lock survived while we're effectively on baseline ground,
      // clear it so camera behavior matches normal ground-jump behavior.
      if (activePlatformId !== null) {
        physics.clearSurfaceOverride();
        activePlatformId = null;
      }
      lastLeftPlatformId = null;
      platformAscendBonus = 0; // Reset climb when returning to ground
    }

    // Detect surface contact for jump/landing dust
    const isGrounded =
      isOnBaselineGround ||
      (supportingPlatform !== null && Math.abs(verticalVelocity) < 25);

    // Jump dust: player accelerates upward from a surface
    const leftSurface = wasGrounded && !isGrounded && previousVelocity <= 0 && verticalVelocity < -200;
    if (leftSurface) {
      const feetY = prevState.y + playerRadius;
      jumpDust.spawnJumpDust(prevState.x, feetY);
    }

    // Landing detection: was in air, now grounded, and was moving downward
    if (isGrounded && !wasGrounded && previousVelocity > 0) {
      // Spawn landing dust at player's feet
      const feetY = state.y + playerRadius;
      jumpDust.spawnLandingDust(state.x, feetY, previousVelocity);
    }

    // Update tracking variables
    wasGrounded = isGrounded;
    previousVelocity = Math.abs(verticalVelocity);

    // Debug: draw player and platform hitboxes
    if (DEBUG_DRAW_HITBOXES && hitboxOverlay) {
      hitboxOverlay.clear();
      // Player bounds
      hitboxOverlay.rect(playerBoundsFull.left, playerBoundsFull.top, playerBoundsFull.right - playerBoundsFull.left, playerBoundsFull.bottom - playerBoundsFull.top).fill({ color: 0xff0000, alpha: 0.25 });

      // Platform hitboxes
      const platformHitboxes = platforms.getDebugHitboxes(playerDiameter);
      platformHitboxes.forEach(box => {
        const color = box.type === 'large' ? 0x00ff00 : 0x0000ff;
        hitboxOverlay.rect(box.left, box.top, box.width, box.height).fill({ color, alpha: 0.25 });

        // Log when hitbox data changes to spot unexpected shifts
        const sig = `${box.type}|${box.left.toFixed(1)}|${box.width.toFixed(1)}`;
        const prevSig = hitboxLogCache.get(box.id);
        if (prevSig !== sig) {
          console.debug(`[HITBOX] id=${box.id} type=${box.type} left=${box.left.toFixed(1)} width=${box.width.toFixed(1)} top=${box.top.toFixed(1)}`);
          hitboxLogCache.set(box.id, sig);
        }
      });


      // Hole hitboxes
      const holeHitboxes = holes.getDebugHitboxes();
      holeHitboxes.forEach(hole => {
        const color = hole.size === 'large' ? 0xffa500 : 0xffff00;
        hitboxOverlay.rect(hole.left, hole.top, hole.width, hole.height).fill({ color, alpha: 0.25 });
      });

      // Ground hole hitboxes (color-coded by type, semi-transparent)
      const groundHoleHitboxes = groundHoles.getDebugHitboxes();
      groundHoleHitboxes.forEach(hole => {
        const width = hole.right - hole.left;
        const height = hole.bottom - hole.top;
        // Color code: meteor_transition = orange, full_hole = purple, hole_transition_back = cyan
        let color = 0x8b00ff; // purple for full_hole
        if (hole.type === 'meteor_transition') {
          color = 0xff6600; // orange
        } else if (hole.type === 'hole_transition_back') {
          color = 0x00ffff; // cyan
        }
        hitboxOverlay.rect(hole.left, hole.top, width, height).fill({ color, alpha: 0.3 });
      });

      // Meteor hitbox (green/lime color for landing surface)
      if (meteorHitbox) {
        const meteorWidth = meteorHitbox.width;
        const meteorHeight = playerDiameter; // Use player diameter for visual height reference
        hitboxOverlay.rect(meteorHitbox.x, meteorHitbox.surfaceY, meteorWidth, meteorHeight).fill({ color: 0x00ff00, alpha: 0.35 });
      }

      // Respawn points (pink/magenta boxes)
      const spawnBoxWidth = 80;
      const spawnBoxHeight = 120;
      const spawnGroundY = computePlayerGround();

      // Get ground segments for respawn hitbox positioning
      const segments = grounds.getSegments();

      // Pink box 1 (0xff00ff): Front of meteor_transition segment (first meteor)
      const meteorTransitionSegment = segments.find((seg: { type: string }) => seg.type === 'meteor_transition');
      if (meteorTransitionSegment) {
        const respawnX = meteorTransitionSegment.x + 100; // 100px from left edge of meteor_transition
        hitboxOverlay.rect(respawnX - spawnBoxWidth / 2, spawnGroundY - spawnBoxHeight, spawnBoxWidth, spawnBoxHeight).fill({ color: 0xff00ff, alpha: 0.4 });
      }

      // Pink box 2 (0xff1493): Back of hole_transition_back segment (where player respawns after falling)
      const holeTransitionBackSegment = segments.find((seg: { type: string }) => seg.type === 'hole_transition_back');
      if (holeTransitionBackSegment) {
        const respawnX = holeTransitionBackSegment.x + holeTransitionBackSegment.width - 100; // 100px from right edge
        hitboxOverlay.rect(respawnX - spawnBoxWidth / 2, spawnGroundY - spawnBoxHeight, spawnBoxWidth, spawnBoxHeight).fill({ color: 0xff1493, alpha: 0.4 });
      }
    }

    // Camera system: locks to platform floors, follows player downward
    let targetCameraY = 0;

    // If player is back on baseline ground, reset camera floor
    if (isOnBaselineGround) {
      cameraFloorY = Infinity;
      targetCameraY = 0;
    } else if (cameraFloorY < baselineRestY) {
      // We have a locked camera floor from landing on a platform
      const platformHeight = baselineRestY - cameraFloorY;
      const lockedCameraY = platformHeight * 0.5; // Camera position locked to this platform height

      // Check if player has fallen below the camera floor
      // Use physics body top for camera behavior so jump feel stays identical
      // even when visual growth scaling is active.
      const playerTop = state.y - playerRadius;
      if (playerTop > cameraFloorY + CAMERA_FOLLOW_THRESHOLD) {
        // Player is falling below the locked floor - follow them down
        // Calculate how far below the floor they are
        const fallDistance = playerTop - cameraFloorY;
        // Camera follows proportionally (move down as player descends)
        targetCameraY = lockedCameraY - fallDistance * 0.5;
        // Don't go below ground level (targetCameraY can't be negative)
        targetCameraY = Math.max(0, targetCameraY);
      } else {
        // Player is at or above the camera floor - stay locked
        targetCameraY = lockedCameraY;
      }
    }

    // Check if player is jumping too high (approaching top of screen)
    // Player position is in world space, but we need to check screen space (with camera offset)
    const playerTopInScreenSpace = (state.y - playerRadius) + cameraY;
    const suppressTopClamp = respawnState === 'respawning' && playerTopInScreenSpace < 0;
    if (!suppressTopClamp && playerTopInScreenSpace < CAMERA_TOP_MARGIN) {
      // Player is too close to top of screen - push camera up
      const upwardPush = CAMERA_TOP_MARGIN - playerTopInScreenSpace;
      targetCameraY += upwardPush;
    }

    let cameraLerpSpeed = CAMERA_LERP_SPEED;
    let panResetSpeed = 0.05;
    let zoomResetSpeed = 0.004;
    let bgParallaxSpeed = 120;
    if (holeExitCameraEaseActive) {
      const exitElapsed = (performance.now() - holeExitCameraEaseStart) / 1000;
      const exitT = Math.min(1, exitElapsed / HOLE_EXIT_CAMERA_EASE_DURATION);
      const exitEase = 1 - Math.pow(1 - exitT, 2);
      cameraLerpSpeed = 0.03 + (CAMERA_LERP_SPEED - 0.03) * exitEase;
      panResetSpeed = 0.012 + (0.05 - 0.012) * exitEase;
      zoomResetSpeed = 0.002 + (0.004 - 0.002) * exitEase;
      bgParallaxSpeed = 50 + (120 - 50) * exitEase;
      if (exitT >= 1) {
        holeExitCameraEaseActive = false;
      }
    }

    // Smoothly interpolate camera to target position
    cameraY += (targetCameraY - cameraY) * cameraLerpSpeed;

    const useHoleCamera = cometHoleLevelActive && !enemyHoverZoomTriggered;
    // Camera zoom (comet hole level ONLY) - progressive zoom revealing meteor
    if (useHoleCamera) {
      let targetZoom = 1.0; // Default no zoom

      const onOrPastPenultimate =
        holeSequencePenultimateIndex !== null &&
        lastLandedSequenceIndex !== null &&
        lastLandedSequenceIndex >= holeSequencePenultimateIndex;

      const LATE_ZOOM_DURATION = 2.5;
      if (onOrPastPenultimate) {
        if (
          holeSequenceLastIndex !== null &&
          lastLandedSequenceIndex !== null &&
          lastLandedSequenceIndex >= holeSequenceLastIndex
        ) {
          lateZoomProgress = 1;
        } else {
          lateZoomProgress = Math.min(1, lateZoomProgress + deltaSeconds / LATE_ZOOM_DURATION);
        }
      } else {
        lateZoomProgress = Math.max(0, lateZoomProgress - deltaSeconds / LATE_ZOOM_DURATION);
      }

      // Determine zoom based on platform progression
      // Stage 1: Initial zoom (first platform) - zoom to 0.90
      // Stage 2: Late zoom (from penultimate) - zoom continuously from 0.90 to 0.75

      const FIRST_ZOOM_DURATION = 2.5;
      if (!hasLandedOnFirstPlatform) {
        // No zoom until the first platform is actually landed on
        firstZoomProgress = Math.max(0, firstZoomProgress - deltaSeconds / FIRST_ZOOM_DURATION);
        targetZoom = 1.0;
      } else if (!onOrPastPenultimate) {
        // Before the penultimate platform: ease into the initial zoom
        firstZoomProgress = Math.min(1, firstZoomProgress + deltaSeconds / FIRST_ZOOM_DURATION);
        const firstEase = 1 - Math.pow(1 - firstZoomProgress, 3);
        targetZoom = 1.0 - (1.0 - 0.90) * firstEase;
      } else {
        // After penultimate platform: progressively zoom toward the meteor
        // Interpolate between 0.90 (start) and 0.75 (end)
        firstZoomProgress = 1;
        const BASE_ZOOM = 0.90;  // Zoom at late-zoom start
        const MAX_ZOOM = 0.80;   // Maximum zoom at end
        const lateEase = lateZoomProgress * lateZoomProgress * lateZoomProgress;
        targetZoom = BASE_ZOOM - (BASE_ZOOM - MAX_ZOOM) * lateEase;
      }

      const inRespawn = respawnState !== 'normal' || fallingIntoHole;
      if (inRespawn) {
        if (!isOnBaselineGround) {
          if (!respawnHoldActive) {
            respawnHoldActive = true;
            respawnHoldProgress = 0;
            respawnHoldStartZoom = cameraZoom;
          }
          respawnHoldProgress = Math.min(1, respawnHoldProgress + deltaSeconds / RESPAWN_HOLD_ZOOM_DURATION);
          const holdEase = 1 - Math.pow(1 - respawnHoldProgress, 3);
          targetZoom = respawnHoldStartZoom + (RESPAWN_HOLD_ZOOM - respawnHoldStartZoom) * holdEase;
          firstZoomProgress = 1;
        } else {
          respawnHoldActive = false;
          respawnHoldProgress = 0;
          if (!respawnLandActive) {
            respawnLandActive = true;
            respawnLandProgress = 0;
          }
          respawnLandProgress = Math.min(1, respawnLandProgress + deltaSeconds / RESPAWN_LAND_ZOOM_DURATION);
          const ease = 1 - Math.pow(1 - respawnLandProgress, 3);
          targetZoom = RESPAWN_HOLD_ZOOM + (1 - RESPAWN_HOLD_ZOOM) * ease;
          if (respawnLandProgress >= 1) {
            respawnLandActive = false;
          }
        }
        cameraZoom = targetZoom;
      } else {
        respawnHoldActive = false;
        respawnHoldProgress = 0;
        respawnLandActive = false;
        respawnLandProgress = 0;
        const zoomFollowSpeed = 0.2;
        cameraZoom += (targetZoom - cameraZoom) * zoomFollowSpeed;
      }

      // Only reset zoom when BOTH players are back on baseline ground after meteor sequence
      // Check if red enemy has finished rolling and is now hovering (back to normal gameplay)
      const meteorSequenceComplete = !redEnemyActive || (enemyMode === 'hover');
      if (!inRespawn && isOnBaselineGround && isGrounded && meteorSequenceComplete) {
        cameraZoom += (1.0 - cameraZoom) * 0.015;
      }

      // Camera pan toward meteor area starting on the second-to-last platform
      const PAN_EASE_DURATION = 7.0;
      if (onOrPastPenultimate) {
        panEaseProgress = Math.min(1, panEaseProgress + deltaSeconds / PAN_EASE_DURATION);
      } else {
        panEaseProgress = Math.max(0, panEaseProgress - deltaSeconds / PAN_EASE_DURATION);
      }

      if (isOnBaselineGround && isGrounded && meteorSequenceComplete) {
        panEaseProgress = Math.max(0, panEaseProgress - deltaSeconds / PAN_EASE_DURATION);
      }

      const panEase = panEaseProgress * panEaseProgress * panEaseProgress; // Strong ease-in
      cameraPanX = -160 * panEase; // Shift view right
      cameraPanY = -90 * panEase;  // Shift view down

      // Foreground elements (ground, platforms, player) get full zoom
      groundContainer.scale.set(cameraZoom);
      platformContainer.scale.set(cameraZoom);
      playfieldContainer.scale.set(cameraZoom);
      overlayContainer.scale.set(cameraZoom);
      emberContainer.scale.set(cameraZoom);
      const gradientScale = 1 / Math.max(0.0001, cameraZoom);
      gradientSprite.scale.set(gradientScale);
    } else {
      const treehouseReleaseElapsed = performance.now() - treehousePanReleaseStart;
      const treehousePanHold = treehousePanReleaseActive && treehouseReleaseElapsed < TREEHOUSE_PAN_RESET_DELAY_MS;
      if (treehousePanReleaseActive && !treehousePanHold) {
        panResetSpeed = Math.min(panResetSpeed, TREEHOUSE_PAN_RESET_SPEED);
      }
      // Reset zoom when not in comet hole level
      const holdZoom = zoomHoldUntilEnemyHover && enemyMode !== 'hover';
      if (!holdZoom && cameraZoom !== 1.0) {
        cameraZoom += (1.0 - cameraZoom) * zoomResetSpeed;
        groundContainer.scale.set(cameraZoom);
        platformContainer.scale.set(cameraZoom);
        playfieldContainer.scale.set(cameraZoom);
        overlayContainer.scale.set(cameraZoom);
        emberContainer.scale.set(cameraZoom);
        const gradientScale = 1 / Math.max(0.0001, cameraZoom);
        gradientSprite.scale.set(gradientScale);
      }
      if (!holdZoom && (cameraPanX !== 0 || cameraPanY !== 0)) {
        if (!treehousePanHold) {
          cameraPanX += (0 - cameraPanX) * panResetSpeed;
        }
        cameraPanY += (0 - cameraPanY) * panResetSpeed;
      }
      if (treehousePanReleaseActive && Math.abs(cameraPanX) < 0.5) {
        treehousePanReleaseActive = false;
      }
    }

    // Apply zoom with parallax depth - background zooms less for realistic parallax
    const backgroundZoomTarget = 1.0 - (1.0 - cameraZoom) * 0.2; // Only 20% of the zoom
    const backgroundZoomLerp = holeExitCameraEaseActive ? 0.06 : 0.12;
    backgroundZoomCurrent += (backgroundZoomTarget - backgroundZoomCurrent) * backgroundZoomLerp;
    backgroundContainer.scale.set(backgroundZoomCurrent);

    // Apply camera position with parallax
    // Background moves less (30% of camera movement) for depth effect
    // Foreground elements move at 100% camera speed
    const totalCameraY = cameraY + cameraPanY;
    const totalCameraX = cameraPanX + treehousePanX + specialCameraPanX;
    updatePlayerHorizontalRangeForCamera(totalCameraX, cameraZoom);
    // Ground container needs special handling to prevent exposing bottom edge
    // When zoomed out and camera moves down (or when falling into holes), clamp ground
    // so its bottom edge never rises above the screen bottom
    const viewportHeight = app.renderer.height;

    // Ground segments are positioned at y=groundTop within the container and extend to y=viewportHeight
    // When container is scaled and positioned, calculate where ground's bottom edge appears:
    // Ground bottom in screen space = viewportHeight * cameraZoom + camera offset
    const groundBottomInScreenSpace = viewportHeight * cameraZoom + totalCameraY;

    // If ground's bottom would be above screen bottom (viewportHeight), clamp it
    let clampedGroundCameraY = totalCameraY;
    if (groundBottomInScreenSpace < viewportHeight) {
      // Calculate the cameraY that would put ground's bottom exactly at screen bottom
      // viewportHeight = viewportHeight * cameraZoom + clampedY
      // clampedY = viewportHeight - viewportHeight * cameraZoom
      // clampedY = viewportHeight * (1 - cameraZoom)
      clampedGroundCameraY = viewportHeight * (1 - cameraZoom);
      console.log(`[GROUND CLAMP] Bottom would be at ${groundBottomInScreenSpace.toFixed(1)}, clamping to ${clampedGroundCameraY.toFixed(1)}`);
    }

    groundContainer.position.set(totalCameraX, clampedGroundCameraY);
    platformContainer.position.set(totalCameraX, clampedGroundCameraY); // Platforms move with ground (use same clamp)
    playfieldContainer.position.set(totalCameraX, clampedGroundCameraY); // Player and effects move with ground (use same clamp)
    overlayContainer.position.set(totalCameraX, clampedGroundCameraY); // Gradient/dust move with ground (use same clamp)
    emberContainer.position.set(totalCameraX, clampedGroundCameraY); // Embers move with ground (use same clamp)

    // Background follows the ground/camera motion for parallax without snapping
    backgroundContainer.position.x = totalCameraX * 0.3;
    const targetBackgroundY = clampedGroundCameraY * 0.3;
    const maxParallaxStep = bgParallaxSpeed * deltaSeconds;
    const deltaParallaxY = targetBackgroundY - backgroundParallaxY;
    if (Math.abs(deltaParallaxY) <= maxParallaxStep) {
      backgroundParallaxY = targetBackgroundY;
    } else {
      backgroundParallaxY += Math.sign(deltaParallaxY) * maxParallaxStep;
    }
    backgroundContainer.position.y = backgroundParallaxY; // Sky parallax - moves slower

    // Only update ball position from physics during normal gameplay and after respawn
    // During dying/waiting/animating_back, ball is manually positioned at spawn point above screen
    // During intro jump phase, position is partially controlled by intro animation
    if (respawnState === 'normal' || respawnState === 'respawning' || respawnState === 'resume_pause' || respawnState === 'resume_ramp') {
      // During intro jumps, use physics Y but manual X (for horizontal jump movement)
      if (playerIntroActive && (playerIntroPhase === 'jump1' || playerIntroPhase === 'jump2')) {
        ball.position.y = state.y;
        // X position is controlled by intro animation (jumping to the right)
      } else if (!playerIntroActive) {
        // Normal gameplay - use physics position
        ball.position.x = state.x;
        ball.position.y = getPlayerRenderY(state.y);
        const playerGrowthScale = getPlayerGrowthScale();
        ball.scale.set(state.scaleX * playerGrowthScale, state.scaleY * playerGrowthScale);
      }
      // During other intro phases, position is fully controlled by intro animation
    }
    // During other respawn states, ball stays frozen at manually set position (spawn X, above screen)

    // Update shadow position - project onto platform surface if player is above one
    const shadowSurface = (() => {
      // Check all platforms to find the closest one directly below the player
      const allPlatforms = platforms.getAllPlatforms();
      let closestPlatformY: number | null = null;
      const playerHitRadius = getPlayerHitRadius();
      const playerRenderTop = getPlayerRenderY(state.y) - playerHitRadius;

      for (const plat of allPlatforms) {
        if (!plat.active) continue;

        // Check if player is horizontally aligned with platform
        const platLeft = plat.x;
        const platRight = plat.x + plat.width;
        const playerLeft = state.x - playerHitRadius;
        const playerRight = state.x + playerHitRadius;

        // If player overlaps platform horizontally
        if (playerRight > platLeft && playerLeft < platRight) {
          // Calculate shadow position on this platform
          // Platform surfaceY is where player's top would be, add diameter + landing offset
          const platformShadowY = plat.surfaceY + playerDiameter + PLATFORM_LANDING_OFFSET;

          // Track the closest platform below the player's current position
          if (platformShadowY > playerRenderTop) {
            if (closestPlatformY === null || platformShadowY < closestPlatformY) {
              closestPlatformY = platformShadowY;
            }
          }
        }
      }

      if (meteorHitbox) {
        const platLeft = meteorHitbox.x;
        const platRight = meteorHitbox.x + meteorHitbox.width;
        const playerLeft = state.x - playerHitRadius;
        const playerRight = state.x + playerHitRadius;

        if (playerRight > platLeft && playerLeft < platRight) {
          const platformShadowY = meteorHitbox.surfaceY + playerDiameter + PLATFORM_LANDING_OFFSET;
          if (platformShadowY > playerRenderTop) {
            if (closestPlatformY === null || platformShadowY < closestPlatformY) {
              closestPlatformY = platformShadowY;
            }
          }
        }
      }

      // Use closest platform if found, otherwise use ground
      return closestPlatformY ?? computePlayerGround();
    })();

    playerShadow.update(ball.position.x, ball.position.y, shadowSurface, getPlayerGrowthScale(), 0.2);

    // Update enemy based on current mode
    const enemySquishActive = enemySquishUntil > performance.now();
    const enemySquishScaleX = enemySquishActive ? 1.25 : 1;
    const enemySquishScaleY = enemySquishActive ? 0.7 : 1;
    const lockEnemyAutoX =
      treehouseEnemyHidden || treehouseEnemyReturnActive || treehouseEnemyAutoEaseActive;
    let activeEnemyPhysicsState: { y: number; velocity: number } | null = null;
    if (enemyMode === 'physics') {
      const enemyState = enemyPhysics.update(deltaSeconds);
      activeEnemyPhysicsState = enemyState;
      enemyBall.position.y = getEnemyRenderY(enemyState.y);
      const enemyGrowthScale = getEnemyGrowthScale();
      enemyBall.scale.set(
        enemyState.scaleX * enemySquishScaleX * enemyGrowthScale,
        enemyState.scaleY * enemySquishScaleY * enemyGrowthScale
      );
      if (redEnemyState === 'jumping_intro' && enemyIntroMoveActive && !specialEnemyControlActive) {
        const targetX = getEnemyTargetX();
        const elapsed = (performance.now() - enemyIntroMoveStartTime) / 1000;
        const moveDuration = 1.6;
        const t = Math.min(1, elapsed / moveDuration);
        const ease = 1 - Math.pow(1 - t, 3);
        if (!lockEnemyAutoX) {
          enemyBall.position.x = enemyIntroMoveStartX + (targetX - enemyIntroMoveStartX) * ease;
        }
        if (t >= 1) {
          enemyIntroMoveActive = false;
        }
      }
      if (redEnemyState === 'jumping_intro' && !enemyIntroMoveActive && !specialEnemyControlActive) {
        if (!lockEnemyAutoX) {
          enemyBall.position.x = getEnemyTargetX();
        }
      }

      // Check if ready to transition to hover mode
      if (enemyPhysics.isReadyForHover() && !specialOutActive && !finalTransitionActive) {
        if (redEnemyState === 'jumping_intro') {
          enemyBall.position.x = getEnemyTargetX();
          enemyIntroMoveActive = false;
        }
        const velocity = enemyPhysics.enableHoverMode();
        enemyMovement.startTransition(velocity, enemyState.y);
        enemyMode = 'hover';
        introComplete = true;
        if (!enemyHoverZoomTriggered) {
          enemyHoverZoomTriggered = true;
          zoomHoldUntilEnemyHover = false;
          holeExitCameraEaseActive = true;
          holeExitCameraEaseStart = performance.now();
        }
      }
    } else if (enemyMode === 'hover') {
      const enemyState = enemyMovement.update(deltaSeconds);
      enemyBall.position.y = getEnemyRenderY(enemyState.y);
      const enemyGrowthScale = getEnemyGrowthScale();
      enemyBall.scale.set(
        enemyState.scaleX * enemySquishScaleX * enemyGrowthScale,
        enemyState.scaleY * enemySquishScaleY * enemyGrowthScale
      );
      if (!lockEnemyAutoX) {
        enemyBall.position.x = getEnemyTargetX();
      }
    }

    let treehouseEnemyOffscreen = false;
    if (enemyMode !== 'sleep' && !specialEnemyControlActive && (treehouseEnemyHidden || treehouseEnemyReturnActive)) {
      const screenRightWorldX = screenToWorldX(app.renderer.width);
      const exitX = treehouseEnemyExitTargetX || screenToWorldX(app.renderer.width * TREEHOUSE_ENEMY_EXIT_SCREEN_MULT);
      const returnX = getEnemyTargetX();
      if (treehouseEnemyHidden) {
        if (treehouseEnemyExitActive) {
          const exitElapsed = performance.now() - treehouseEnemyExitStart;
          const t = Math.min(1, exitElapsed / TREEHOUSE_ENEMY_EXIT_DURATION_MS);
          const ease = 1 - Math.pow(1 - t, 3);
          enemyBall.position.x = treehouseEnemyExitFromX + (exitX - treehouseEnemyExitFromX) * ease;
          if (t >= 1) {
            treehouseEnemyExitActive = false;
          }
        } else {
          enemyBall.position.x += (exitX - enemyBall.position.x) * TREEHOUSE_ENEMY_EXIT_LERP;
        }
      } else if (treehouseEnemyReturnActive) {
        if (!treehouseEnemyReturnStart) {
          treehouseEnemyReturnStart = performance.now();
        }
        enemyBall.position.x += (returnX - enemyBall.position.x) * TREEHOUSE_ENEMY_RETURN_LERP;
        const returnElapsed = performance.now() - treehouseEnemyReturnStart;
        const closeToTarget = Math.abs(enemyBall.position.x - returnX) <= TREEHOUSE_ENEMY_RETURN_SNAP;
        const onScreen = enemyBall.position.x <= screenRightWorldX - playerRadius * 0.5;
        if (closeToTarget || onScreen || returnElapsed >= TREEHOUSE_ENEMY_RETURN_MAX_MS) {
          treehouseEnemyReturnActive = false;
          treehouseEnemyReturnStart = 0;
          if (!closeToTarget) {
            treehouseEnemyAutoEaseActive = true;
            treehouseEnemyAutoEaseStart = performance.now();
          } else {
            enemyBall.position.x = returnX;
          }
        }
      }
      treehouseEnemyOffscreen = enemyBall.position.x >= screenRightWorldX + playerRadius;
    }

    if (enemyMode !== 'sleep' && !specialEnemyControlActive && treehouseEnemyAutoEaseActive && !treehouseEnemyHidden) {
      const returnX = getEnemyTargetX();
      enemyBall.position.x += (returnX - enemyBall.position.x) * TREEHOUSE_ENEMY_AUTO_LERP;
      const easeElapsed = performance.now() - treehouseEnemyAutoEaseStart;
      if (
        Math.abs(enemyBall.position.x - returnX) <= TREEHOUSE_ENEMY_RETURN_SNAP ||
        easeElapsed >= TREEHOUSE_ENEMY_RETURN_MAX_MS
      ) {
        treehouseEnemyAutoEaseActive = false;
        treehouseEnemyAutoEaseStart = 0;
        enemyBall.position.x = returnX;
      }
    }

    const enemyShadowVisible =
      enemyBall.visible &&
      enemyMode !== 'sleep' &&
      !treehouseEnemyHidden &&
      !treehouseEnemyOffscreen;
    enemyShadow.getView().visible = enemyShadowVisible;
    if (enemyShadowVisible) {
      const enemyShadowSurface = (() => {
        const allPlatforms = platforms.getAllPlatforms();
        let closestPlatformY: number | null = null;
        const enemyHitRadius = getEnemyHitRadius();
        const enemyRenderTop = enemyBall.position.y - enemyHitRadius;
        const enemyLeft = enemyBall.position.x - enemyHitRadius;
        const enemyRight = enemyBall.position.x + enemyHitRadius;

        for (const plat of allPlatforms) {
          if (!plat.active) continue;
          const platLeft = plat.x;
          const platRight = plat.x + plat.width;
          if (enemyRight > platLeft && enemyLeft < platRight) {
            const platformShadowY = plat.surfaceY + playerDiameter + PLATFORM_LANDING_OFFSET;
            if (platformShadowY > enemyRenderTop) {
              if (closestPlatformY === null || platformShadowY < closestPlatformY) {
                closestPlatformY = platformShadowY;
              }
            }
          }
        }

        if (meteorHitbox) {
          const platLeft = meteorHitbox.x;
          const platRight = meteorHitbox.x + meteorHitbox.width;
          if (enemyRight > platLeft && enemyLeft < platRight) {
            const platformShadowY = meteorHitbox.surfaceY + playerDiameter + PLATFORM_LANDING_OFFSET;
            if (platformShadowY > enemyRenderTop) {
              if (closestPlatformY === null || platformShadowY < closestPlatformY) {
                closestPlatformY = platformShadowY;
              }
            }
          }
        }

        return closestPlatformY ?? computePlayerGround();
      })();

      enemyShadow.update(
        enemyBall.position.x,
        enemyBall.position.y,
        enemyShadowSurface,
        getEnemyGrowthScale(),
        0.08
      );
    }

    const intersectsEnemyPlayer = () => {
      const playerHitRadius = getPlayerHitRadius();
      const enemyHitRadius = getEnemyHitRadius();
      const playerCenterY = getPlayerRenderY(state.y);
      const playerLeft = state.x - playerHitRadius;
      const playerRight = state.x + playerHitRadius;
      const playerTop = playerCenterY - playerHitRadius;
      const playerBottom = playerCenterY + playerHitRadius;
      const enemyLeft = enemyBall.position.x - enemyHitRadius;
      const enemyRight = enemyBall.position.x + enemyHitRadius;
      const enemyTop = enemyBall.position.y - enemyHitRadius;
      const enemyBottom = enemyBall.position.y + enemyHitRadius;
      const margin = 4;
      return (
        playerLeft - margin < enemyRight + margin &&
        playerRight + margin > enemyLeft - margin &&
        playerTop - margin < enemyBottom + margin &&
        playerBottom + margin > enemyTop - margin
      );
    };

    if (
      specialOutActive &&
      (specialOutNumber === 4 || specialOutNumber === 7) &&
      enemyMode === 'physics' &&
      activeEnemyPhysicsState
    ) {
      const now = performance.now();
      const isOnGround = enemyPhysics.isGrounded(2.5);
      const wallX = screenToWorldX(40);

      switch (specialChargeStage) {
        case 'idle':
          if (isOnGround) {
            specialChargeStage = 'windup';
            specialWindupStart = 0;
          }
          break;
        case 'windup':
          if (!isOnGround) {
            specialWindupStart = 0;
            break;
          }
          if (specialWindupStart === 0) {
            specialWindupStart = now;
            specialOriginalEnemyX = enemyBall.position.x;
            enemyPhysics.setVelocity(0);
            break;
          }
          if (now - specialWindupStart >= 500) {
            specialChargeStage = 'charging';
            specialChargeStart = now;
            specialChargeStartX = enemyBall.position.x;
            specialChargeTargetX = wallX;
          }
          break;
        case 'charging': {
          const durationMs = 1500;
          const t = Math.min(1, (now - specialChargeStart) / durationMs);
          // Charge should keep accelerating into the wall (no end slow-down).
          // Blend a little linear speed so startup feels punchy.
          const eased = 0.18 * t + 0.82 * t * t;
          enemyBall.position.x = specialChargeStartX + (specialChargeTargetX - specialChargeStartX) * eased;

          if (intersectsEnemyPlayer() && now - specialLastCollisionAt > 250) {
            specialLastCollisionAt = now;
            applyBlueOutPenalty(1);
            playerFlashUntil = now + 250;
            shakeActive = true;
            shakeEndTime = now + 220;
            specialChargeStage = 'returning';
            specialReturnStart = now;
            specialReturnFromX = enemyBall.position.x;
            specialReturnToX = getEnemyTargetX();
            break;
          }

          if (t >= 1) {
            specialChargeStage = 'hitWall';
            specialHitWallStart = now;
            specialReturnFromX = enemyBall.position.x;
            const bounceBackWorldDistance = Math.max(
              80,
              screenToWorldX(SPECIAL_WALL_BOUNCE_BACK_PX) - screenToWorldX(0)
            );
            specialReturnToX = specialReturnFromX + bounceBackWorldDistance;
            enemyPhysics.triggerManualJump(0, SPECIAL_WALL_BOUNCE_JUMP_SCALE);
          }
          break;
        }
        case 'hitWall': {
          const t = Math.min(1, (now - specialHitWallStart) / SPECIAL_WALL_BOUNCE_LERP_MS);
          const eased = t;
          if (t < 1) {
            enemyBall.position.x = specialReturnFromX + (specialReturnToX - specialReturnFromX) * eased;
          } else {
            enemyBall.position.x = specialReturnToX;
          }
          // Let enemy physics complete the ground bounce/damping before rolling right.
          if (t >= 1 && isOnGround) {
            specialChargeStage = 'returning';
            specialReturnStart = now;
            specialReturnFromX = enemyBall.position.x;
            specialReturnToX = getEnemyTargetX();
          }
          break;
        }
        case 'returning': {
          const t = Math.min(1, (now - specialReturnStart) / SPECIAL_RETURN_ROLL_MS);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out stop, no overshoot
          enemyBall.position.x = specialReturnFromX + (specialReturnToX - specialReturnFromX) * eased;
          if (t >= 1) {
            enemyBall.position.x = specialReturnToX;
            specialChargeStage = 'postReturn';
            specialPostReturnStart = now;
          }
          break;
        }
        case 'postReturn':
          if (now - specialPostReturnStart >= 280) {
            specialChargeStage = 'smallJump';
            specialSmallJumpStart = now;
            specialSmallJumpTriggered = false;
          }
          break;
        case 'smallJump':
          if (!specialSmallJumpTriggered) {
            enemyPhysics.triggerManualJump(0);
            specialSmallJumpTriggered = true;
            specialSmallJumpStart = now;
          } else if (isOnGround && now - specialSmallJumpStart >= 400) {
            if (specialOutNumber === 7) {
              specialChargeStage = 'midJump';
              specialMidJumpTriggered = false;
            } else {
              specialChargeStage = 'largeJump';
              specialLargeJumpTriggered = false;
            }
          }
          break;
        case 'midJump':
          if (!specialMidJumpTriggered) {
            enemyPhysics.triggerManualJump(400);
            specialMidJumpTriggered = true;
            specialSmallJumpStart = now;
          } else if (isOnGround && now - specialSmallJumpStart >= 400) {
            specialChargeStage = 'largeJump';
            specialLargeJumpTriggered = false;
          }
          break;
        case 'largeJump':
          if (!specialLargeJumpTriggered) {
            enemyPhysics.triggerManualJump(1275);
            specialLargeJumpTriggered = true;
          } else if (activeEnemyPhysicsState.velocity > 0) {
            const velocity = enemyPhysics.enableHoverMode();
            enemyMovement.startTransition(velocity, enemyPhysics.getY());
            enemyMode = 'hover';
            introComplete = true;
            resetSpecialOutState();
          }
          break;
      }
    }

    if (specialOutActive && specialOutNumber === 10 && enemyMode === 'physics' && activeEnemyPhysicsState) {
      const now = performance.now();
      const isOnGround = enemyPhysics.isGrounded(2.5);

      if (!finalSequenceActive) {
        if (isOnGround) {
          enemyPhysics.setVelocity(0);
          finalSequenceActive = true;
          finalReturning = false;
          finalChargeActive = false;
          finalChargeStart = 0;
          finalChargeStartX = enemyBall.position.x;
          finalChargeTargetX = enemyBall.position.x;
          finalNextChargeTime = now + 900;
          specialOriginalEnemyX = enemyBall.position.x;
        }
      } else if (!finalTransitionActive) {
        if (finalReturning) {
          const targetX = specialOriginalEnemyX || getEnemyTargetX();
          const nextX = enemyBall.position.x + (targetX - enemyBall.position.x) * 0.12;
          enemyBall.position.x = nextX;
          if (Math.abs(nextX - targetX) <= 0.5) {
            enemyBall.position.x = targetX;
            finalReturning = false;
            finalChargeActive = false;
            finalChargeStart = 0;
            finalNextChargeTime = now + 900;
          }
        } else if (now >= finalNextChargeTime) {
          if (!finalChargeActive) {
            finalChargeActive = true;
            finalChargeStart = now;
            finalChargeStartX = enemyBall.position.x;
            finalChargeTargetX = screenToWorldX(-playerRadius * 3);
          }

          const chargeDurationMs = 1450;
          const t = Math.min(1, (now - finalChargeStart) / chargeDurationMs);
          const eased = t * t; // ease-in charge
          const nextX = finalChargeStartX + (finalChargeTargetX - finalChargeStartX) * eased;
          enemyBall.position.x = nextX;

          if (intersectsEnemyPlayer() && now - finalLastCollisionTime > 250) {
            finalLastCollisionTime = now;
            applyBlueOutPenalty(1);
            playerFlashUntil = now + 250;
            shakeActive = true;
            shakeEndTime = now + 220;
            finalReturning = true;
            finalChargeActive = false;
            finalChargeStart = 0;
          } else if (enemyBall.position.x + getEnemyHitRadius() < screenToWorldX(0)) {
            finalTransitionActive = true;
            finalTransitionStage = 1;
            respawnInputLocked = true;
            finalReturning = false;
            finalChargeActive = false;
            finalChargeStart = 0;
            finalTransitionDelayUntil = 0;
            laserPhysics.reset();
            showLevelOverlay(`Level ${battleLevel + 1}`);
          } else if (t >= 1) {
            // Safety: allow a fresh charge setup if we reached target but did not exit.
            finalChargeActive = false;
            finalChargeStart = 0;
          }
        }
      }
    }

    if (finalTransitionActive) {
      const now = performance.now();
      const groundY = computePlayerGround() - playerRadius;

      if (finalTransitionStage === 1) {
        const rollSpeed = 640 * deltaSeconds;
        const nextX = state.x + rollSpeed;
        state.x = nextX;
        physics.setPosition(nextX, state.y);
        // Keep rolling farther so trailing meteor-orb followers are fully off-screen.
        const rollOffThresholdScreenX = app.renderer.width + getPlayerHitRadius() * 2 + app.renderer.width * 0.55;
        if (nextX > screenToWorldX(rollOffThresholdScreenX)) {
          finalTransitionStage = 2;
          finalTransitionDelayUntil = now + 4000;
        }
      } else if (finalTransitionStage === 2) {
        if (now >= finalTransitionDelayUntil) {
          battleLevel += 1;
          blueHits = 0;
          redHits = 0;
          blueOuts = 0;
          redOuts = 0;
          playerGrowthLevel = 0;
          enemyGrowthLevel = 0;
          updateScoreUI();

          resetSpecialOutState();
          stopScrollForFinal = false;

          const playerRevealX = app.renderer.width + app.renderer.width * 0.32;
          playerInitialX = playerRevealX;
          physics.respawn(playerRevealX, computePlayerGround());
          physics.setPosition(playerRevealX, groundY);
          physics.setMousePosition(playerRevealX);
          state.x = playerRevealX;
          state.y = groundY;

          laserPhysics.reset();
          laserScore = 0;
          updateScoreDisplay();

          const enemyStartX = app.renderer.width * 2 + playerDiameter * 2;
          enemyBall.position.x = enemyStartX;
          enemyBall.position.y = groundY;
          enemyBall.visible = true;
          enemyPhysics.setGroundSurface(groundY);
          enemyPhysics.enablePhysicsMode(groundY, 0);
          enemyPhysics.setVelocity(0);
          enemyMode = 'physics';
          redEnemyState = 'rolling_in';
          introComplete = false;
          enemyIntroMoveActive = false;

          specialCameraPanX = 0;
          finalTransitionStage3Start = now;
          finalTransitionStage = 3;
        }
      } else if (finalTransitionStage === 3) {
        const panDurationMs = 3500;
        const progress = Math.min(1, (now - finalTransitionStage3Start) / panDurationMs);
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        specialCameraPanX = app.renderer.width * ease;
        if (progress >= 1) {
          specialCameraPanX = app.renderer.width;
          finalTransitionStage4Start = now;
          finalTransitionStage4Executed = false;
          finalTransitionStage = 4;
        }
      } else if (finalTransitionStage === 4) {
        if (!finalTransitionStage4Executed) {
          finalTransitionStage4Executed = true;
        }
        if (now - finalTransitionStage4Start >= 50) {
          finalTransitionStage = 5;
        }
      } else if (finalTransitionStage === 5) {
        const targetX = getEnemyTargetX();
        enemyBall.position.x += (targetX - enemyBall.position.x) * 0.12;
        if (Math.abs(enemyBall.position.x - targetX) <= 0.5) {
          enemyBall.position.x = targetX;
          enemyPhysics.startJumpSequence();
          redEnemyState = 'jumping_intro';
          finalTransitionStage6Start = now;
          finalTransitionStage = 6;
        }
      } else if (finalTransitionStage === 6) {
        if (now - finalTransitionStage6Start >= 500) {
          respawnInputLocked = false;
          hideLevelOverlay();
          finalTransitionActive = false;
          finalTransitionStage = 0;
          stopScrollForFinal = false;
        }
      }
    }

    const laserResult = laserPhysics.update({
      score: laserScore,
      playerX: state.x,
      playerY: getPlayerRenderY(state.y),
      playerRadius: getPlayerHitRadius(),
      playerHasJumped: physics.hasPlayerJumped(),
      enemyX: enemyBall.position.x,
      enemyY: enemyBall.position.y,
      isHovering:
        enemyMode === 'hover' &&
        !specialOutActive &&
        !finalTransitionActive &&
        scenarioStage !== 'prep' &&
        scenarioStage !== 'charging' &&
        scenarioStage !== 'firing',
      introComplete,
      stopSpawning:
        treehouseEnemyHidden ||
        treehouseEnemyOffscreen ||
        enemyMode === 'sleep' ||
        specialOutActive ||
        finalTransitionActive ||
        scenarioStage === 'prep' ||
        scenarioStage === 'charging' ||
        scenarioStage === 'firing',
      deltaSeconds,
    });
    if (laserResult.scoreChange !== 0) {
      laserScore += laserResult.scoreChange;
      // Energy +2.5% per cleared laser
      energy = Math.min(100, energy + laserResult.scoreChange * 2.5);

      // Unlock shooting only at full energy
      if (orbShootingUnlocked && energyActivated && energy >= 100 && !shootUnlocked) {
        canShoot = true;
        shootUnlocked = true;
        console.log('[SHOOT UNLOCK] Reached 100% energy');
      }

      updateEnergyUI();
      updateScoreDisplay();
    }
    if (laserResult.laserFired && laserResult.targetY !== null) {
      enemyMovement.setTarget(laserResult.targetY);
    }
    if (laserResult.laserFired) {
      // Reveal battle UI when combat truly begins (hover + first enemy shot),
      // aligned with the camera easing back in.
      if (!scoreVisible && enemyHoverZoomTriggered) {
        showScoreUI();
      }
    }
    if (laserResult.hitPosition) {
      // Enemy lasers = red sparks - reduce energy by 1.5% per hit
      energy = Math.max(0, energy - 1.5);
      sparkParticles.spawn(laserResult.hitPosition.x, laserResult.hitPosition.y, 'red');
      playerFlashUntil = performance.now() + 250;
      // Count hits dealt by red; every 20 hits = 1 out on blue.
      // Out growth rules are applied through applyBlueHits/applyBlueOutPenalty.
      applyBlueHits(1);
      updateEnergyUI();
    }

    // Flash player when hit
    const now = performance.now();
    const FADE_DURATION = 320; // Duration of fade from red to blue in ms

    // Easing function for smooth color transition
    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    // Color lerp function
    const lerpColor = (a: number, b: number, t: number) => {
      const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
      const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
      const cr = Math.round(ar + (br - ar) * t);
      const cg = Math.round(ag + (bg - ag) * t);
      const cb = Math.round(ab + (bb - ab) * t);
      return (cr << 16) | (cg << 8) | cb;
    };

    if (playerFlashUntil > now) {
      // Flash red during hit window
      setBallColor(ballHitColor);
    } else if (now < playerFlashUntil + FADE_DURATION) {
      // Fade back to blue with ease-out
      const linearProgress = (now - playerFlashUntil) / FADE_DURATION;
      const fadeProgress = easeOutCubic(linearProgress);
      setBallColor(lerpColor(ballHitColor, ballBaseColor, fadeProgress));
    } else if (currentBallColor !== ballBaseColor) {
      // Ensure we end at exactly the base color
      setBallColor(ballBaseColor);
    }

    if (enemyFlashUntil > now) {
      setEnemyColor(enemyHitColor);
    } else if (currentEnemyColor !== enemyBaseColor) {
      setEnemyColor(enemyBaseColor);
    }

    // Scenario / mega laser handling
    if (scenarioActive && scenarioStage === 'awaiting' && scenarioSmallId !== null) {
      const plat = platforms.getPlatformBounds(scenarioSmallId);
      if (plat && plat.left < state.x + playerRadius + 60) {
        // Trigger charge when small platform is within reach
        scenarioStage = 'charging';
        megaLaserActive = false;
        megaLaserStart = performance.now();
        // Drop enemy to ground to charge/fires
        const groundY = computePlayerGround() - playerRadius;
        enemyMovement.setTarget(groundY);
      }
    }

    if (scenarioStage === 'charging') {
      if (performance.now() - megaLaserStart >= MEGA_LASER_CHARGE) {
        scenarioStage = 'firing';
        megaLaserActive = true;
        megaLaserStart = performance.now();
        megaLaserStartTick = tickerInstance.lastTime;
        megaLaserHitPlayer = false;
        enemyChargeParticles.clear();
      }
    } else if (scenarioStage === 'firing') {
      if (performance.now() - megaLaserStart >= MEGA_LASER_DURATION) {
        megaLaserActive = false;
        scenarioStage = 'idle';
        scenarioActive = false;
        freezePlayer = false;
        enemyChargeParticles.clear();
      }
    }

    // Render mega laser if active (needs player state)
    megaLaserGraphic.clear();
    if (megaLaserActive) {
      const baseY = enemyBall.position.y; // follow enemy vertical oscillation
      const megaY = baseY - megaLaserHeight * 0.5;
      const elapsed = Math.max(0, tickerInstance.lastTime - megaLaserStartTick);
      const growthProgress = Math.min(1, elapsed / MEGA_LASER_GROWTH);
      let beamWidth = enemyBall.position.x * growthProgress;

      const playerRenderY = getPlayerRenderY(state.y);
      const playerHitRadius = getPlayerHitRadius();
      const playerTop = playerRenderY - playerHitRadius;
      const playerBottom = playerRenderY + playerHitRadius;
      const beamTop = megaY;
      const beamBottom = megaY + megaLaserHeight;
      if (
        !megaLaserHitPlayer &&
        playerBottom > beamTop &&
        playerTop < beamBottom
      ) {
        beamWidth = Math.max(0, enemyBall.position.x - (state.x - playerHitRadius));
        megaLaserHitPlayer = true;
        shakeActive = true;
        shakeEndTime = megaLaserStart + MEGA_LASER_DURATION;
        freezePlayer = true;
      }

      const startX = enemyBall.position.x - beamWidth;
      const fadeLength = Math.min(beamWidth, 90);
      const solidWidth = Math.max(0, beamWidth - fadeLength);
      const solidStartX = startX + fadeLength;
      const fadeSteps = 3;

      const drawFadeLayer = (y: number, height: number, color: number, alpha: number) => {
        const slice = fadeLength / fadeSteps;
        for (let i = 0; i < fadeSteps; i++) {
          const a = alpha * ((i + 1) / fadeSteps);
          megaLaserGraphic.rect(startX + i * slice, y, slice, height).fill({ color, alpha: a });
        }
        if (solidWidth > 0) {
          megaLaserGraphic.rect(solidStartX, y, solidWidth, height).fill({ color, alpha });
        }
      };

      // Outer glow
      const glowHeight = megaLaserHeight * 1.4;
      const glowY = megaY - (glowHeight - megaLaserHeight) * 0.5;
      drawFadeLayer(glowY, glowHeight, 0xff4040, 0.2);
      drawFadeLayer(megaY - 6, megaLaserHeight + 12, 0xff2020, 0.35);

      // Core beam
      drawFadeLayer(megaY, megaLaserHeight, 0xff3030, 1);

      // Rotating side rays (1-3px) around the beam
      const rayCount = 6;
      const time = performance.now() / 1000;
      for (let i = 0; i < rayCount; i++) {
        const phase = time * 2 + (i / rayCount) * Math.PI * 2;
        const rayY = megaY + (Math.sin(phase) * megaLaserHeight) / 2 + megaLaserHeight / 2;
        const rayHeight = 1 + Math.random() * 2;
        drawFadeLayer(rayY, rayHeight, 0xff6060, 1);
      }
    }

    // Render minimap - capture scene at different zoom/position (dev only)
    if (SHOW_DEBUG_UI && minimapRenderTexture) {
      // Save current scene transform
      const savedSceneX = scene.position.x;
      const savedSceneY = scene.position.y;
      const savedSceneScaleX = scene.scale.x;
      const savedSceneScaleY = scene.scale.y;

      // Calculate minimap camera transform
      // Center on player position
      const playerState = physics.getState();
      const minimapCenterX = MINIMAP_WIDTH / 2;
      const minimapCenterY = MINIMAP_HEIGHT / 2;

      // Apply minimap transform - zoom out and center on player
      scene.scale.set(minimapZoom);
      scene.position.set(
        minimapCenterX - (playerState.x + minimapPanWorldX) * minimapZoom,
        minimapCenterY - (playerState.y + minimapPanWorldY) * minimapZoom
      );

      // Render scene to minimap texture
      app.renderer.render({
        container: scene,
        target: minimapRenderTexture,
      });

      // Restore original scene transform for main render
      scene.position.set(savedSceneX, savedSceneY);
      scene.scale.set(savedSceneScaleX, savedSceneScaleY);
    }
  });
  ticker.start();

  const triggerJump = (event?: PointerEvent | KeyboardEvent) => {
    // Disable input during intro
    if (playerIntroActive || respawnInputLocked) return;
    if (tutorialActive && tutorialStage === 'waiting' && physics.getJumpCount() >= 1) return;
    if (event instanceof KeyboardEvent && event.repeat) return;

    // Detect input type on pointer events (touch, mouse, pen)
    if (event && 'pointerType' in event) {
      const newInputType = event.pointerType as 'mouse' | 'touch' | 'pen';

      if (newInputType !== currentInputType) {
        currentInputType = newInputType;

        if (currentInputType === 'touch') {
          physics.setSoftFollowMode(true);
          console.log('[INPUT] Touch detected on jump - enabling soft follow mode');
        } else {
          physics.setSoftFollowMode(false);
          console.log('[INPUT] Mouse/pen detected on jump - disabling soft follow mode');
        }
      }
    }

    const preJumpCount = physics.getJumpCount();
    const jumpExecuted = physics.startJump();
    if (jumpExecuted) {
      const postJumpCount = physics.getJumpCount();
      const didDoubleJumpNow = preJumpCount === 1 && postJumpCount >= 2;
      lastJumpTime = performance.now();
      if (didDoubleJumpNow && tutorialStage === 'doubleJump' && doubleJumpContainer.style.display !== 'none') {
        nudgeUpArrow();
      }
      const allowDashJump = !tutorialActive || tutorialDashJumpShown || tutorialDashJumpCompleted;
      if (physics.getCursorScreenPercent() >= 0.7 && didDoubleJumpNow) {
        if (tutorialStage === 'dashJump' && dashJumpContainer.style.display !== 'none') {
          nudgeRightArrow();
        }
        if (allowDashJump) {
          const battleActive = redEnemyActive && enemyMode !== 'sleep' && !treehouseEnemyHidden && !finalTransitionActive;
          if (battleActive && !dashChargeActive && !dashChargeReturning) {
            startDashCharge(physics.getState().x);
          } else {
            parallaxBoostActive = true;
            parallaxBoostStartTime = performance.now();
          }
        }
      }

      // ALWAYS mark platforms above when jumping, unless firmly on baseline ground
      // This catches ALL cases: double jumps, rolling off platforms, falling and jumping
      // Even if activePlatformId is set, we might be in the process of rolling off
      if (!isOnBaselineGround) {
        const state = physics.getState();
        const playerTop = getPlayerRenderY(state.y) - getPlayerHitRadius();

        const platformsAbove = platforms.getPlatformsAbovePlayer(playerTop);
        platformsAbove.forEach(platformId => {
          physics.markPlatformJumpedThrough(platformId);
        });
      }
    }
  };
  const releaseJump = () => {
    // Disable input during intro
    if (playerIntroActive || respawnInputLocked) return;
    physics.endJump();
  };

  // Track input type for touch vs mouse detection
  let currentInputType: 'mouse' | 'touch' | 'pen' = 'mouse'; // Default to mouse

  // Track mouse/pointer movement for horizontal player position
  const handlePointerMove = (event: PointerEvent) => {
    // Disable input during intro
    if (playerIntroActive || respawnInputLocked) return;

    // Detect input type change
    const newInputType = event.pointerType as 'mouse' | 'touch' | 'pen';

    if (newInputType !== currentInputType) {
      currentInputType = newInputType;

      // Enable soft follow for touch, disable for mouse/pen
      if (currentInputType === 'touch') {
        physics.setSoftFollowMode(true);
        console.log('[INPUT] Touch detected - enabling soft follow mode');
      } else {
        physics.setSoftFollowMode(false);
        console.log('[INPUT] Mouse/pen detected - disabling soft follow mode');
      }
    }

    const overMinimap = SHOW_DEBUG_UI && minimapSprite && isPointerOverMinimap(event);

    if (minimapDragging) {
      const position = getPointerCanvasPosition(event);
      const deltaX = position.x - minimapDragLastX;
      const deltaY = position.y - minimapDragLastY;
      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        minimapDragMoved = true;
      }
      minimapPanWorldX -= deltaX / minimapZoom;
      minimapPanWorldY -= deltaY / minimapZoom;
      minimapDragLastX = position.x;
      minimapDragLastY = position.y;
      updateMinimapCursor(event);
      return;
    }

    if (overMinimap) {
      updateMinimapCursor(event);
      return;
    }

    updateMinimapCursor(event);
    const pointerPosition = getPointerCanvasPosition(event);
    physics.setMousePosition(screenToWorldX(pointerPosition.x));
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', (event: PointerEvent) => {
    if (SHOW_DEBUG_UI && minimapSprite && isPointerOverMinimap(event)) {
      const position = getPointerCanvasPosition(event);
      minimapDragging = true;
      minimapDragMoved = false;
      minimapDragStartX = position.x;
      minimapDragStartY = position.y;
      minimapDragLastX = position.x;
      minimapDragLastY = position.y;
      updateMinimapCursor(event);
      return;
    }
    triggerJump(event);
  });
  window.addEventListener('pointerup', (event: PointerEvent) => {
    if (minimapDragging) {
      if (!minimapDragMoved && minimapSprite) {
        const minimapCenterX = minimapSprite.x + MINIMAP_WIDTH / 2;
        const minimapCenterY = minimapSprite.y + MINIMAP_HEIGHT / 2;
        minimapPanWorldX -= (minimapCenterX - minimapDragStartX) / minimapZoom;
        minimapPanWorldY -= (minimapCenterY - minimapDragStartY) / minimapZoom;
      }
      minimapDragging = false;
      updateMinimapCursor(event);
    }
    releaseJump();
  });

  function getShootCooldown() {
    if (energy >= 80) {
      return MAX_SHOOT_SPEED;
    }
    if (energy <= 20) {
      return MIN_SHOOT_SPEED;
    }
    const energyRange = 80 - 20;
    const cooldownRange = MIN_SHOOT_SPEED - MAX_SHOOT_SPEED;
    const energyRatio = (energy - 20) / energyRange;
    return MIN_SHOOT_SPEED - (energyRatio * cooldownRange);
  }

  function fireChargedOrbShot(holdSeconds: number) {
    const orbOrigin = meteorOrb.getShotOrigin();
    if (!orbOrigin || !orbShootingUnlocked || !canShoot || energy <= 0) return;
    const now = performance.now();
    const shootCooldown = getShootCooldown();
    if (now - nextShotTime < shootCooldown) return;
    const clampedHold = Math.min(ORB_CHARGE_MAX_SECONDS, Math.max(0, holdSeconds));
    const t = clampedHold / ORB_CHARGE_MAX_SECONDS;
    const baseRadius = meteorOrb.getShotRadius() + ORB_SHOT_BASE_BONUS_PX;
    const minRadius = baseRadius + ORB_SHOT_MIN_DELTA_PX;
    const maxRadius = baseRadius + ORB_SHOT_MAX_DELTA_PX;
    const radius = minRadius + (maxRadius - minRadius) * t;
    const speedScale = 1 + t * 0.35;
    const hits = clampedHold >= ORB_CHARGE_MAX_SECONDS
      ? 3
      : clampedHold >= ORB_CHARGE_MID_SECONDS
        ? 2
        : 1;
    meteorSwirlShots.push({
      x: orbOrigin.x,
      y: orbOrigin.y,
      radius,
      speed: PROJECTILE_SPEED * METEOR_SWIRL_SHOT_SPEED_START,
      active: true,
      hits,
      speedScale,
      maxSpeedScale: speedScale,
    });
    energy = Math.max(0, energy - 0.5);
    nextShotTime = now;
    updateEnergyUI();
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      triggerJump();
    } else if (event.code === 'KeyF' || event.code === 'KeyS') {
      if (event.repeat) return;
      if (meteorSwirlFollowers.length > 0) {
        if (!orbShootingUnlocked) return;
        if (enemyMode !== 'hover') {
          return;
        }
        const fired = meteorSwirlFollowers.pop();
        if (fired) {
          const orbSize = getMeteorSwirlOrbBaseSize() * fired.sizeScale;
          meteorSwirlShots.push({
            x: fired.currentX,
            y: fired.currentY,
            radius: orbSize,
            speed: PROJECTILE_SPEED * METEOR_SWIRL_SHOT_SPEED_START,
            active: true,
            hits: 1,
          });
        }
        return;
      }
      if (!meteorOrb.getShotOrigin()) return;
      if (!orbShootingUnlocked || !canShoot || energy <= 0) return;
      if (!orbChargeActive) {
        orbChargeActive = true;
        orbChargeStart = performance.now();
        orbChargeKey = event.code as 'KeyS' | 'KeyF';
      }
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      isPressingDown = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      releaseJump();
    } else if (event.code === 'KeyF' || event.code === 'KeyS') {
      if (orbChargeActive && orbChargeKey === event.code) {
        const heldSeconds = (performance.now() - orbChargeStart) / 1000;
        fireChargedOrbShot(heldSeconds);
        orbChargeActive = false;
        orbChargeKey = null;
        meteorOrb.setChargeBoost(1);
      }
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      isPressingDown = false;
    }
  });

  const handleResize = () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    backgrounds.resize(app.renderer.width, app.renderer.height);
    grounds.resize(app.renderer.width, app.renderer.height);
    dustField.updateDimensions(app.renderer.width, app.renderer.height);
    dustCompositeCanvas.width = app.renderer.width;
    dustCompositeCanvas.height = app.renderer.height;
    // Update the existing texture source instead of creating a new texture
    dustTexture.source.update();
    windCanvas.width = app.renderer.width;
    windCanvas.height = app.renderer.height;
    windTexture.source.update();
    // Resize jump dust canvas
    jumpDustCanvas.width = app.renderer.width;
    jumpDustCanvas.height = app.renderer.height;
    jumpDustTexture.source.update();
    // Resize charge particle canvas
    chargeCanvas.width = app.renderer.width;
    chargeCanvas.height = app.renderer.height;
    chargeTexture.source.update();
    // Resize spark canvas
    sparkCanvas.width = app.renderer.width;
    sparkCanvas.height = app.renderer.height;
    sparkTexture.source.update();
    // Resize enemy charge canvas
    enemyChargeCanvas.width = app.renderer.width;
    enemyChargeCanvas.height = app.renderer.height;
    enemyChargeTexture.source.update();
    meteorOrb.resize(app.renderer.width, app.renderer.height);
    // Resize halo canvas
    haloCanvas.width = app.renderer.width;
    haloCanvas.height = app.renderer.height;
    haloTexture.source.update();
    overlayContainer.removeChild(gradientSprite);
    gradientSprite.destroy();
    gradientSprite = createGroundGradientSprite(app.renderer.width, app.renderer.height);
    overlayContainer.addChild(dustSprite);
    overlayContainer.addChild(gradientSprite);
    overlayContainer.addChild(windSprite);

    // Recalculate responsive sizes based on new height
    sizes = calculateResponsiveSizes(app.renderer.height, app.renderer.width);
    playerRadius = sizes.playerRadius;
    playerDiameter = sizes.playerDiameter;

    // Redraw ball with new radius
    setBallColor(currentBallColor);

    // Update shadow size
    playerShadow.destroy();
    const newShadow = new Shadow({ playerWidth: playerDiameter });
    playfieldContainer.addChildAt(newShadow.getView(), playfieldContainer.getChildIndex(ball) - 1);
    Object.assign(playerShadow, newShadow);
    const enemyShadowWasVisible = enemyShadow.getView().visible;
    const enemyShadowAlpha = enemyShadow.getView().alpha;
    enemyShadow.destroy();
    const newEnemyShadow = new Shadow({ playerWidth: playerDiameter });
    newEnemyShadow.getView().visible = enemyShadowWasVisible;
    newEnemyShadow.getView().alpha = enemyShadowAlpha;
    playfieldContainer.addChildAt(newEnemyShadow.getView(), playfieldContainer.getChildIndex(enemyBall));
    Object.assign(enemyShadow, newEnemyShadow);

    const updatedGround = computePlayerGround();
    physics.setGroundSurface(updatedGround);
    currentGroundSurface = updatedGround;
    physics.updateScreenWidth(app.renderer.width);
    ball.position.y = updatedGround - playerRadius;

    // Redraw enemy with new radius
    setEnemyColor(currentEnemyColor);
    enemyPhysics.setGroundSurface(updatedGround - playerRadius);
    enemyBall.position.x = app.renderer.width * 0.9;

    laserPhysics.updateDimensions(app.renderer.width, app.renderer.height, updatedGround - playerRadius, enemyBall.position.x);

    // Update comet dimensions
    cometManager.updateDimensions(app.renderer.width, app.renderer.height);

    playerRangeBounds = getPlayerRangeBounds(app.renderer.width);
    updatePlayerHorizontalRangeForCamera(cameraPanX + treehousePanX + specialCameraPanX, cameraZoom);

    if (meetingTitleContainer && meetingTitleText) {
      meetingTitleBaseY = 64;
      meetingTitleContainer.position.set(app.renderer.width / 2, meetingTitleBaseY + MEETING_RISE_PX);
    }
  };

  window.addEventListener('resize', handleResize);

  // Enter Forest button (debug UI only)
  if (SHOW_DEBUG_UI) {
    const triggerTransition = () => {
      grounds.triggerTransition();
      backgrounds.triggerTransition();
      const transitionButton = document.getElementById('transitionButton') as HTMLButtonElement;
      if (transitionButton) {
        transitionButton.disabled = true;
        transitionButton.textContent = 'Forest Active';
      }
    };

    const transitionButton = document.createElement('button');
    transitionButton.id = 'transitionButton';
    transitionButton.className = 'transition-btn';
    transitionButton.textContent = 'Enter Forest';
    transitionButton.type = 'button';
    transitionButton.addEventListener('click', triggerTransition);
    document.body.appendChild(transitionButton);
  }

  // Energy bar UI
  const energyWrapper = document.createElement('div');
  energyWrapper.style.position = 'fixed';
  energyWrapper.style.left = '20px';
  energyWrapper.style.top = '50%';
  energyWrapper.style.transform = 'translateY(-50%)';
  energyWrapper.style.width = '30px';
  energyWrapper.style.height = '300px';
  energyWrapper.style.zIndex = '10';
  energyWrapper.style.pointerEvents = 'none';

  const energyContainer = document.createElement('div');
  energyContainer.style.position = 'relative';
  energyContainer.style.width = '100%';
  energyContainer.style.height = '100%';
  energyContainer.style.border = '2px solid rgba(255, 255, 255, 0.3)';
  energyContainer.style.background = 'rgba(0, 0, 0, 0.5)';
  energyContainer.style.borderRadius = '15px';
  energyContainer.style.overflow = 'hidden';
  energyContainer.style.opacity = '0';
  energyContainer.style.transform = 'scaleY(0)';
  energyContainer.style.transformOrigin = 'center bottom';
  energyContainer.style.transition = 'transform 1.2s ease, opacity 0.8s ease';
  const energyFill = document.createElement('div');
  energyFill.style.position = 'absolute';
  energyFill.style.bottom = '0';
  energyFill.style.left = '0';
  energyFill.style.width = '100%';
  energyFill.style.height = '0%';
  energyFill.style.background = '#ff0000';
  energyFill.style.boxShadow = '0 0 6px rgba(255,0,0,0.55)';
  energyFill.style.transition = 'height 0.2s ease, background-color 0.2s ease';
  energyContainer.appendChild(energyFill);

  // Marker line + label
  const energyMarker = document.createElement('div');
  energyMarker.style.position = 'absolute';
  energyMarker.style.left = '0';
  energyMarker.style.width = '30px';
  energyMarker.style.height = '1px';
  energyMarker.style.backgroundColor = 'white';
  energyMarker.style.boxShadow = '0 0 5px rgba(255, 255, 255, 0.8)';
  energyMarker.style.transition = 'bottom 0.2s ease';

  const energyMarkerLine = document.createElement('div');
  energyMarkerLine.style.position = 'absolute';
  energyMarkerLine.style.top = '0';
  energyMarkerLine.style.left = '100%';
  energyMarkerLine.style.width = '20px';
  energyMarkerLine.style.height = '1px';
  energyMarkerLine.style.backgroundColor = 'white';
  energyMarkerLine.style.boxShadow = '0 0 5px rgba(255, 255, 255, 0.8)';
  energyMarker.appendChild(energyMarkerLine);

  const energyLabel = document.createElement('div');
  energyLabel.style.position = 'absolute';
  energyLabel.style.left = 'calc(100% + 16px)';
  energyLabel.style.bottom = '0';
  energyLabel.style.transform = 'translateY(50%) translateY(-1px)';
  energyLabel.style.color = 'white';
  energyLabel.style.fontSize = '15px';
  energyLabel.style.fontWeight = 'bold';
  energyLabel.style.fontFamily = '"Times New Roman", Times, serif';
  energyLabel.style.textShadow = '0 0 8px black';
  energyLabel.style.whiteSpace = 'nowrap';
  energyLabel.style.letterSpacing = '0.3px';
  energyLabel.style.opacity = '0';
  energyLabel.style.transition = 'bottom 0.2s ease, opacity 0.8s ease';

  energyContainer.appendChild(energyMarker);
  energyWrapper.appendChild(energyContainer);
  energyWrapper.appendChild(energyLabel);
  document.body.appendChild(energyWrapper);
  let energyVisible = false;
  let energyLabelState: 'jump' | 'shoot' = 'jump';
  revealEnergyBar = () => {
    if (energyVisible) return;
    energyVisible = true;
    energyContainer.style.opacity = '1';
    energyContainer.style.transform = 'scaleY(1)';
    energyLabel.style.opacity = '1';
  };
  const startEnergyReveal = () => {
    energy = 100;
    energyDisplay = 0;
    energyRevealActive = true;
    energyRevealStart = performance.now();
    energyActivated = true;
    canShoot = orbShootingUnlocked;
    shootUnlocked = orbShootingUnlocked;
    if (revealEnergyBar) {
      revealEnergyBar();
    }
    updateEnergyUI();
  };

  // Scoreboard (reveals when hover combat starts) with hits/outs styled like original Jump
  const scoreContainer = document.createElement('div');
  scoreContainer.style.position = 'fixed';
  scoreContainer.style.top = '50px';
  scoreContainer.style.left = '50px';
  scoreContainer.style.right = '50px';
  scoreContainer.style.display = 'flex';
  scoreContainer.style.justifyContent = 'space-between';
  scoreContainer.style.pointerEvents = 'none';
  scoreContainer.style.opacity = '0';
  scoreContainer.style.transform = 'translate(-28px, -22px)';
  scoreContainer.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
  scoreContainer.style.willChange = 'opacity, transform';
  document.body.appendChild(scoreContainer);

  const makeSide = (side: 'left' | 'right', color: string, isEnemy: boolean) => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = side === 'left' ? 'flex-start' : 'flex-end';
    wrap.style.gap = '6px';

    const hitsRow = document.createElement('div');
    hitsRow.style.color = color;
    hitsRow.style.fontSize = '21px';
    hitsRow.style.fontFamily = 'serif';
    hitsRow.style.fontWeight = 'bold';
    hitsRow.textContent = `Hits: 0/${HITS_PER_OUT}`;

    const outsRow = document.createElement('div');
    outsRow.style.display = 'flex';
    outsRow.style.gap = '6px';
    const circles: HTMLDivElement[] = [];
    for (let i = 1; i <= 10; i++) {
      const c = document.createElement('div');
      const big = isEnemy && (i === 4 || i === 7 || i === 10);
      const size = big ? 12 : 8;
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
      c.style.borderRadius = '50%';
      c.style.border = `1px solid ${color}`;
      c.style.backgroundColor = 'transparent';
      c.style.transform = 'scale(1)';
      c.style.transformOrigin = 'center center';
      c.style.transition = 'background-color 0.25s ease, transform 0.2s ease';
      circles.push(c);
      outsRow.appendChild(c);
    }

    wrap.appendChild(hitsRow);
    wrap.appendChild(outsRow);
    return { wrap, hitsRow, circles };
  };

  const blueSide = makeSide('left', '#4fc3f7', false);
  const redSide = makeSide('right', '#ff4040', true);
  scoreContainer.appendChild(blueSide.wrap);
  scoreContainer.appendChild(redSide.wrap);

  const updateScoreUI = () => {
    blueSide.hitsRow.textContent = `Hits: ${Math.min(HITS_PER_OUT, Math.max(0, blueHits))}/${HITS_PER_OUT}`;
    redSide.hitsRow.textContent = `Hits: ${Math.min(HITS_PER_OUT, Math.max(0, redHits))}/${HITS_PER_OUT}`;

    if (!treehouseQueued && redOuts >= 2) {
      treehouseQueued = true;
      grounds.queueTreehouse();
    }

    blueSide.circles.forEach((c, idx) => {
      const filled = idx < blueOuts;
      c.style.backgroundColor = filled ? '#4fc3f7' : 'transparent';
      c.style.transform = filled ? 'scale(1.1)' : 'scale(1)';
    });
    redSide.circles.forEach((c, idx) => {
      const filled = idx < redOuts;
      c.style.backgroundColor = filled ? '#ff4040' : 'transparent';
      c.style.transform = filled ? 'scale(1.1)' : 'scale(1)';
    });
  };

  const showScoreUI = () => {
    if (!scoreVisible) {
      scoreVisible = true;
      scoreContainer.style.opacity = '1';
      scoreContainer.style.transform = 'translate(0, 0)';
    }
  };
  updateScoreUI();

  const energyColorForLevel = (val: number) => {
    const e = Math.max(0, Math.min(100, val));
    if (e >= 80) return 'rgb(0,255,0)';
    if (e <= 20) return 'rgb(255,0,0)';
    if (e > 50) {
      const ratio = (e - 50) / 30;
      const r = Math.round(255 * (1 - ratio));
      return `rgb(${r},255,0)`;
    } else {
      const ratio = (e - 20) / 30;
      const g = Math.round(255 * ratio);
      return `rgb(255,${g},0)`;
    }
  };
  const updateEnergyUI = () => {
    if (!energyRevealActive) {
      energyDisplay = energy;
    }
    const displayValue = energyRevealActive ? energyDisplay : energy;
    const clampedEnergy = Math.max(0, Math.min(100, displayValue));
    energyFill.style.height = `${clampedEnergy}%`;
    const color = energyColorForLevel(clampedEnergy);
    energyFill.style.background = color;
    energyFill.style.boxShadow = `0 0 8px ${color}`;
    energyMarker.style.bottom = `${clampedEnergy}%`;
    energyLabel.style.bottom = `calc(${clampedEnergy}% + 1px)`;
    if (!shootUnlocked) {
      energyLabelState = 'jump';
    } else if (clampedEnergy >= 90) {
      energyLabelState = 'shoot';
    } else if (clampedEnergy <= 40) {
      energyLabelState = 'jump';
    }
    energyLabel.textContent = energyLabelState === 'shoot' ? 'Shoot!' : 'Jump!';
  };
  updateEnergyUI();

  // Score Display - centered at top of screen
  const scoreDisplay = document.createElement('div');
  scoreDisplay.style.position = 'absolute';
  scoreDisplay.style.top = '20px';
  scoreDisplay.style.width = '100%';
  scoreDisplay.style.textAlign = 'center';
  scoreDisplay.style.fontSize = '1.85rem';
  scoreDisplay.style.fontWeight = 'bold';
  scoreDisplay.style.fontFamily = '"Times New Roman", Times, serif';
  scoreDisplay.style.color = 'white';
  scoreDisplay.style.userSelect = 'none';
  scoreDisplay.style.textShadow = '0px 2px 10px rgba(0,0,0,0.75)';
  scoreDisplay.style.zIndex = '1000';
  scoreDisplay.style.pointerEvents = 'none'; // Allow clicks to pass through to buttons below
  scoreDisplay.style.opacity = '0';
  scoreDisplay.style.transform = 'scale(0)';
  scoreDisplay.style.transformOrigin = 'center top';
  scoreDisplay.style.willChange = 'transform, opacity';
  scoreDisplay.textContent = `${laserScore} Jumps`;
  document.body.appendChild(scoreDisplay);

  const meetingTextStyle = new TextStyle({
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: 46,
    fontWeight: '700',
    fill: 0xffffff,
    letterSpacing: 1,
    dropShadow: {
      color: 0x000000,
      alpha: 0.65,
      blur: 10,
      distance: 0,
    },
  });
  meetingTitleText = new Text('The Meeting', meetingTextStyle);
  meetingTitleText.anchor.set(0.5, 0);

  meetingTitleContainer = new Container();
  meetingTitleContainer.alpha = 0;
  meetingTitleContainer.addChild(meetingTitleText);
  meetingTitleContainer.position.set(app.renderer.width / 2, meetingTitleBaseY + MEETING_RISE_PX);
  uiContainer.addChild(meetingTitleContainer);

  let jumpsDisplayRevealed = false;
  let meetingTitleRevealed = false;
  const revealJumpsDisplay = () => {
    if (jumpsDisplayRevealed) return;
    jumpsDisplayRevealed = true;
    scoreDisplay.style.opacity = '1';
    scoreDisplay.animate(
      [
        { transform: 'scale(0)', opacity: 0 },
        { transform: 'scale(1.15)', opacity: 1, offset: 0.75 },
        { transform: 'scale(0.95)', opacity: 1, offset: 0.87 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      {
        duration: 1800,
        easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        fill: 'forwards',
      }
    );
    scoreDisplay.style.transform = 'scale(1)';

    if (!meetingTitleRevealed) {
      meetingTitleRevealed = true;
      if (meetingTitleContainer) {
        meetingTitleContainer.alpha = 0;
        meetingRevealStartTime = performance.now() + 2000;
        meetingRevealActive = true;
      }
    }
  };

  const updateScoreDisplay = () => {
    scoreDisplay.textContent = `${laserScore} Jumps`;
    if (laserScore > 0) {
      revealJumpsDisplay();
    }
  };

  // Scenario button: small platform + hole, then large platform, trigger mega laser
  const startScenario = () => {
    const groundY = computePlayerGround();
    const spawnX = app.renderer.width + 120;
    const smallId = platforms.spawn(spawnX, groundY, playerRadius, 'small', HOLE_PLATFORM_OFFSET);
    holes.spawn(spawnX + HOLE_ALIGNMENT_TWEAK, groundY, 'small');

    const largeSpawnX = spawnX + 240;
    const baseOffset = PLATFORM_VERTICAL_OFFSET;
    platforms.spawn(largeSpawnX, groundY, playerRadius, 'large', baseOffset);

    scenarioActive = true;
    scenarioStage = 'awaiting';
    scenarioSmallId = smallId;
    megaLaserActive = false;
    enemyChargeParticles.clear();
    console.log('[SCENARIO] Small+hole then large spawned; awaiting jump range');
  };

  // Auto trigger scenario when pending (e.g., after first red out)
  ticker.add(() => {
    if (autoScenarioPending && !scenarioActive) {
      autoScenarioPending = false;
      startScenario();
    }
  });

  const spawnAtSecondSpawn = () => {
    let segments = grounds.getSegments();
    let holeBackSegment = segments.find((seg: { type: string }) => seg.type === 'hole_transition_back');
    if (!holeBackSegment) {
      startCometHoleLevel(5);
      segments = grounds.getSegments();
      holeBackSegment = segments.find((seg: { type: string }) => seg.type === 'hole_transition_back');
    }
    if (!holeBackSegment) {
      console.log('[DEBUG] Second spawn unavailable - hole_transition_back not found');
      return;
    }

    tutorialActive = false;
    tutorialStage = 'complete';
    tutorialDoubleJumpCompleted = true;
    tutorialDashJumpCompleted = true;
    tutorialParallaxStopped = false;
    tutorialParallaxSlowFactor = 1;
    tutorialContainer.style.opacity = '0';
    doubleJumpContainer.style.display = 'none';
    dashJumpContainer.style.display = 'none';
    fencePassedTriggered = true;
    grounds.setAllowNewSegments(true);

    playerIntroActive = false;
    introLandingLeftLockActive = false;
    introLandingLeftLockX = 0;
    introLandingLeftLockOffsetFromCottageX = 0;
    freezePlayer = false;
    respawnEaseActive = false;
    postIntroEaseActive = false;
    parallaxBoostActive = false;
    dashChargeActive = false;
    dashChargeReturning = false;
    respawnState = 'normal';
    fallingIntoHole = false;
    enemyHoverZoomTriggered = false;
    zoomHoldUntilEnemyHover = false;
    holeExitCameraEaseActive = false;
    holeExitCameraEaseStart = 0;

    cometHoleLevelActive = true;
    forceEnemyJumpOut = true;
    redEnemyActive = false;
    redEnemyState = 'on_platform';
    enemyMode = 'sleep';
    introComplete = false;
    enemyBall.visible = false;
    enemyIntroMoveActive = false;
    enemyIntroMoveStartX = 0;
    enemyIntroMoveStartTime = 0;
    const groundY = computePlayerGround();
    enemyPhysics.setGroundSurface(groundY - playerRadius);
    enemyPhysics.enablePhysicsMode(groundY - playerRadius, 0);
    enemyMovement.startTransition(0, groundY - playerRadius);
    enemyMovement.setTarget(groundY - playerRadius);

    debugFastForwardToSecondSpawn = true;
    debugSpawnDropPending = true;
    ball.visible = false;
    playerShadow.getView().visible = false;

    console.log('[DEBUG] Fast-forwarding to second spawn (auto enemy jump-out)');
  };

  if (SHOW_DEBUG_UI) {
    const spawnSecondButton = document.createElement('button');
    spawnSecondButton.className = 'transition-btn';
    spawnSecondButton.textContent = 'Spawn at Second Spawn';
    spawnSecondButton.type = 'button';
    spawnSecondButton.style.top = '146px';
    spawnSecondButton.addEventListener('click', spawnAtSecondSpawn);
    document.body.appendChild(spawnSecondButton);
  }

  // Comet button (dev only)
  const spawnComet = () => {
    cometManager.spawn();
    console.log('[COMET] Spawned comet animation');
  };

  if (SHOW_DEBUG_UI) {
    const cometButton = document.createElement('button');
    cometButton.className = 'transition-btn';
    cometButton.textContent = 'Comet';
    cometButton.type = 'button';
    cometButton.style.top = '188px';
    cometButton.addEventListener('click', spawnComet);
    document.body.appendChild(cometButton);
  }

  // 100% Energy button (dev only)
  const fillEnergy = () => {
    energy = 100;
    energyActivated = true;
    orbShootingUnlocked = true;
    // Also unlock shooting if not already unlocked
    canShoot = true;
    shootUnlocked = true;
    console.log('[SHOOT UNLOCK] Unlocked via energy button');
    updateEnergyUI();
    console.log('[ENERGY] Set to 100%');
  };

  if (SHOW_DEBUG_UI) {
    const energyButton = document.createElement('button');
    energyButton.className = 'transition-btn';
    energyButton.textContent = '100% Energy';
    energyButton.type = 'button';
    energyButton.style.top = '230px';
    energyButton.addEventListener('click', fillEnergy);
    document.body.appendChild(energyButton);
  }

  const grantRedTwoOuts = () => {
    redOuts = Math.max(redOuts, 2);
    updateScoreUI();
  };

  if (SHOW_DEBUG_UI) {
    const redOutsButton = document.createElement('button');
    redOutsButton.className = 'transition-btn';
    redOutsButton.textContent = 'Red Outs +2';
    redOutsButton.type = 'button';
    redOutsButton.style.top = '272px';
    redOutsButton.addEventListener('click', grantRedTwoOuts);
    document.body.appendChild(redOutsButton);
  }

  if (SHOW_DEBUG_UI) {
    const ordDiameterButton = document.createElement('button');
    ordDiameterButton.className = 'transition-btn';
    ordDiameterButton.type = 'button';
    ordDiameterButton.style.top = '356px';
    document.body.appendChild(ordDiameterButton);

    const extraOrbButton = document.createElement('button');
    extraOrbButton.className = 'transition-btn';
    extraOrbButton.type = 'button';
    extraOrbButton.style.top = '314px';
    document.body.appendChild(extraOrbButton);

    const updateOrdLabels = () => {
      const extraState = meteorOrb.getExtraState();
      ordDiameterButton.textContent = extraState.compactTarget < 1 ? 'Ord Closed' : 'Ord Open';
      extraOrbButton.textContent = extraState.enabled ? 'Ord On' : 'Ord Off';
    };

    updateOrdLabels();

    ordDiameterButton.addEventListener('click', () => {
      const extraState = meteorOrb.getExtraState();
      meteorOrb.setExtraCompactTarget(extraState.compactTarget < 1 ? 1 : 0.45);
      updateOrdLabels();
    });

    extraOrbButton.addEventListener('click', () => {
      meteorOrb.toggleExtra();
      updateOrdLabels();
    });
  }

  if (SHOW_DEBUG_UI) {
    const orbScalePanel = document.createElement('div');
    orbScalePanel.style.position = 'fixed';
    orbScalePanel.style.right = '14px';
    orbScalePanel.style.top = '220px';
    orbScalePanel.style.zIndex = '999';
    orbScalePanel.style.display = 'flex';
    orbScalePanel.style.flexDirection = 'column';
    orbScalePanel.style.gap = '6px';
    orbScalePanel.style.padding = '8px 10px';
    orbScalePanel.style.background = 'rgba(0, 0, 0, 0.55)';
    orbScalePanel.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    orbScalePanel.style.borderRadius = '8px';
    orbScalePanel.style.fontFamily = 'sans-serif';
    orbScalePanel.style.fontSize = '12px';
    orbScalePanel.style.color = 'white';

    const panelTitle = document.createElement('div');
    panelTitle.textContent = 'Orb Layer Diameter';
    panelTitle.style.fontWeight = '600';
    panelTitle.style.opacity = '0.9';
    panelTitle.style.marginBottom = '2px';
    orbScalePanel.appendChild(panelTitle);

    const scales = meteorOrb.getLayerScales();
    const travels = meteorOrb.getLayerTravels();
    const orbSliderMap = new Map<
      string,
      { slider: HTMLInputElement; valueLabel: HTMLSpanElement; onChange: (value: number) => void }
    >();
    const addSliderRow = (
      label: string,
      initialValue: number,
      onChange: (value: number) => void
    ) => {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';

      const name = document.createElement('span');
      name.textContent = label;
      name.style.width = '78px';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '200';
      slider.step = '1';
      slider.value = String(Math.round(initialValue));
      slider.style.width = '140px';

      const valueLabel = document.createElement('span');
      valueLabel.textContent = slider.value;
      valueLabel.style.width = '36px';
      valueLabel.style.textAlign = 'right';

      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        onChange(value);
        valueLabel.textContent = String(Math.round(value));
      });

      row.appendChild(name);
      row.appendChild(slider);
      row.appendChild(valueLabel);
      orbScalePanel.appendChild(row);
      orbSliderMap.set(label, { slider, valueLabel, onChange });
    };

    addSliderRow('Far Size', scales.far * 100, (value) => meteorOrb.setLayerScale('far', value / 100));
    addSliderRow('Far Travel', travels.far * 100, (value) => meteorOrb.setLayerTravel('far', value / 100));
    addSliderRow('Outer Size', scales.outer * 100, (value) => meteorOrb.setLayerScale('outer', value / 100));
    addSliderRow('Outer Travel', travels.outer * 100, (value) => meteorOrb.setLayerTravel('outer', value / 100));
    addSliderRow('Inner Size', scales.inner * 100, (value) => meteorOrb.setLayerScale('inner', value / 100));
    addSliderRow('Inner Travel', travels.inner * 100, (value) => meteorOrb.setLayerTravel('inner', value / 100));
    addSliderRow('Mid Size', scales.mid * 100, (value) => meteorOrb.setLayerScale('mid', value / 100));
    addSliderRow('Mid Travel', travels.mid * 100, (value) => meteorOrb.setLayerTravel('mid', value / 100));
    addSliderRow('Core Size', scales.core * 100, (value) => meteorOrb.setLayerScale('core', value / 100));
    addSliderRow('Core Travel', travels.core * 100, (value) => meteorOrb.setLayerTravel('core', value / 100));

    const setOrbSliderValue = (label: string, value: number) => {
      const row = orbSliderMap.get(label);
      if (!row) return;
      const clamped = Math.max(0, Math.min(200, value));
      row.slider.value = String(Math.round(clamped));
      row.valueLabel.textContent = row.slider.value;
      row.onChange(clamped);
    };

    const orbDefaultsButton = document.createElement('button');
    orbDefaultsButton.type = 'button';
    orbDefaultsButton.textContent = 'Orb Defaults';
    orbDefaultsButton.style.marginTop = '6px';
    orbDefaultsButton.style.alignSelf = 'flex-start';
    orbDefaultsButton.style.background = 'rgba(0, 0, 0, 0.7)';
    orbDefaultsButton.style.color = 'white';
    orbDefaultsButton.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    orbDefaultsButton.style.borderRadius = '6px';
    orbDefaultsButton.style.padding = '4px 8px';
    orbDefaultsButton.style.cursor = 'pointer';
    orbDefaultsButton.style.fontSize = '12px';
    orbDefaultsButton.addEventListener('click', () => {
      setOrbSliderValue('Far Size', 59);
      setOrbSliderValue('Far Travel', 100);
      setOrbSliderValue('Outer Size', 43);
      setOrbSliderValue('Outer Travel', 100);
      setOrbSliderValue('Inner Size', 103);
      setOrbSliderValue('Inner Travel', 0);
      setOrbSliderValue('Mid Size', 200);
      setOrbSliderValue('Mid Travel', 200);
      setOrbSliderValue('Core Size', 85);
      setOrbSliderValue('Core Travel', 0);
    });
    orbScalePanel.appendChild(orbDefaultsButton);

    const orbControlsToggle = document.createElement('button');
    orbControlsToggle.className = 'transition-btn';
    orbControlsToggle.type = 'button';
    orbControlsToggle.style.top = '398px';
    let orbControlsVisible = false;
    orbControlsToggle.textContent = 'Orb Controls Off';
    orbControlsToggle.addEventListener('click', () => {
      orbControlsVisible = !orbControlsVisible;
      orbScalePanel.style.display = orbControlsVisible ? 'flex' : 'none';
      orbControlsToggle.textContent = orbControlsVisible ? 'Orb Controls On' : 'Orb Controls Off';
    });
    document.body.appendChild(orbControlsToggle);
    document.body.appendChild(orbScalePanel);
    orbScalePanel.style.display = 'none';
  }

  // Comet Hole Level helper - now supports variable hole counts
  const startCometHoleLevel = (holeCount: number = 5) => {
    console.log(`[START COMET HOLE LEVEL] ========== STARTING WITH ${holeCount} HOLES ==========`);
    grounds.startHoleSequence(holeCount);
    cometHoleLevelActive = true;
    groundHoles.clear();
    processedSegments.clear();
    console.log(`[START COMET HOLE LEVEL] Cleared ground holes and processed segments`);

    // Reset platform spawning state
    isFirstPlatformSpawned = false;
    platformSequenceIndex = 0;
    totalPlatformsSpawned = 0;
    estimatedTotalPlatforms = 0;
    lastPlatformX = ball.position.x;
    holeSequencePlatformIds.length = 0;
    holeSequencePlatformIndex.clear();
    holeSequenceLastIndex = null;
    holeSequencePenultimateIndex = null;
    lastLandedSequenceIndex = null;
    hasLandedOnFirstPlatform = false;
    firstZoomProgress = 0;
    lateZoomProgress = 0;
    panEaseProgress = 0;
    respawnHoldProgress = 0;
    respawnHoldActive = false;
    respawnHoldStartZoom = 1.0;
    respawnLandProgress = 0;
    respawnLandActive = false;

    // Immediately spawn ground holes for ALL segments in the sequence (including off-screen ones)
    const segments = grounds.getSegments();
    console.log(`[START COMET HOLE LEVEL] Got ${segments.length} segments from grounds.getSegments()`);
    const groundY = computePlayerGround(); // Base ground for hole hitbox
    let firstHoleSegmentX = Infinity;
    let entryPlatformSpawned = false;

    segments.forEach((seg, idx) => {
      const segmentKey = `${idx}_${seg.type}`;
      processedSegments.add(segmentKey);

      if (seg.type === 'meteor_transition') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'meteor_transition');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned meteor_transition at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);

        if (!entryPlatformSpawned) {
          const holeWidth = seg.width * 0.66;
          const holeStartX = seg.x + seg.width - holeWidth;
          const entryPlatformX = holeStartX + 5;
          const entryGroundY = computePlayerGround();
          const entryPlatformOffset = Math.max(0, FIRST_PLATFORM_HEIGHT - FIRST_PLATFORM_DROP);
          platforms.spawn(entryPlatformX, entryGroundY, playerRadius, 'small', entryPlatformOffset);
          isFirstPlatformSpawned = true;
          totalPlatformsSpawned = Math.max(1, totalPlatformsSpawned + 1);
          entryPlatformSpawned = true;
        }
      } else if (seg.type === 'cloud_hole') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'full_hole');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned full_hole at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);
      } else if (seg.type === 'hole_transition_back') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'hole_transition_back');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned hole_transition_back at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);

        // Add second spawn point at the end of hole area (where pink respawn box is)
        const secondSpawnX = seg.x + seg.width - 100; // 100px from right edge (matches pink box)
        if (!spawnPoints.includes(secondSpawnX)) {
          spawnPoints.push(secondSpawnX);
          spawnPoints.sort((a, b) => a - b); // Keep sorted left to right
          console.log(`[CULLING] Second spawn point added at x=${secondSpawnX.toFixed(0)} (end of hole area, total: ${spawnPoints.length})`);
        }
      }
    });

    // Record the initial world X position of meteor_transition when first spawned
    // This is used as reference point for respawn scroll calculations
    if (firstHoleSegmentX !== Infinity) {
      spawnPointX = firstHoleSegmentX;

      // Add to spawn points array for culling system (avoid duplicates)
      if (!spawnPoints.includes(firstHoleSegmentX)) {
        spawnPoints.push(firstHoleSegmentX);
        spawnPoints.sort((a, b) => a - b); // Keep sorted left to right
        console.log(`[CULLING] First spawn point added at x=${firstHoleSegmentX.toFixed(0)} (start of hole area, total: ${spawnPoints.length})`);
      }

      // Update debug indicator position (keep hidden)
      spawnPointDebug.x = firstHoleSegmentX;
      spawnPointDebug.y = computePlayerGround();
      spawnPointDebug.visible = false; // Debug indicator disabled
      console.log(`[RESPAWN] Spawn point recorded at meteor_transition initial X=${spawnPointX.toFixed(0)}`);
    }

    console.log(`[COMET HOLE LEVEL] Started hole sequence with ${holeCount} holes - platforms will spawn dynamically over holes`);
  };

};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
