import './style.css';
import { Application, Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { PlayerPhysics } from './playerPhysics';
import { EnemyPhysics } from './enemyPhysics';
import { EnemyMovement } from './enemyMovement';
import { loadParallaxTextures, ParallaxBackgrounds, ParallaxGrounds } from './parallaxNew';
import { BiomeSequenceManager } from './biomeSystem';
import { ForestDustField } from './forestDustField';
import { JumpDustParticles } from './jumpDustParticles';
import { ChargeParticles } from './chargeParticles';
import { Shadow } from './shadow';
import { FloatingPlatforms, type PlayerBounds } from './floatingPlatforms';
import { LaserPhysics } from './laserPhysics';
import { HoleManager } from './holeManager';
import { SparkParticles } from './sparkParticles';
import { CometManager } from './cometManager';
import { WindSpriteSystem } from './windSprites';
import {
  calculateResponsiveSizes,
  GROUND_PLAYER_DEPTH,
  LASER_HEIGHT,
  LASER_WIDTH,
  HOLE_LARGE_IMAGE_PATH,
  HOLE_SMALL_IMAGE_PATH,
  PLATFORM_LARGE_IMAGE_PATH,
  PLATFORM_SMALL_IMAGE_PATH,
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

  const scene = new Container();
  app.stage.addChild(scene);

  const backgroundContainer = new Container();
  const overlayContainer = new Container();
  const groundContainer = new Container();
  const platformContainer = new Container();
  const laserContainer = new Container();
  const holeContainer = new Container();
  const projectileContainer = new Container();
  const playfieldContainer = new Container();
  const cometContainer = new Container();

  scene.addChild(backgroundContainer, overlayContainer, groundContainer, platformContainer, playfieldContainer, cometContainer);

  // Stars temporarily disabled
  const parallaxTextures = await loadParallaxTextures();

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

  let gradientSprite = createGroundGradientSprite(app.renderer.width, app.renderer.height);
  overlayContainer.addChild(dustSprite);
  overlayContainer.addChild(gradientSprite);
  const grounds = new ParallaxGrounds(
    groundContainer,
    parallaxTextures,
    biomeManager,
    app.renderer.width,
    app.renderer.height
  );

  // Initialize platform system
  const platforms = new FloatingPlatforms(PLATFORM_LARGE_IMAGE_PATH, PLATFORM_SMALL_IMAGE_PATH);
  const holes = new HoleManager(HOLE_SMALL_IMAGE_PATH, HOLE_LARGE_IMAGE_PATH);

  // Initialize comet system
  const cometManager = new CometManager(cometContainer, {
    screenWidth: app.renderer.width,
    screenHeight: app.renderer.height,
    speed: 400, // pixels per second
    yPosition: 0.667, // 2/3 down from top (1/3 from bottom)
    scale: 0.85, // 15% smaller
  });
  let platformSpawnType: 'large' | 'small' = 'large'; // Tracks which platform type to spawn next
  let holePlatformSpawnType: 'large' | 'small' = 'small'; // Tracks which hole-platform type to spawn next
  let activePlatformId: number | null = null;
  const PLATFORM_LANDING_OFFSET = 30; // Extra pixels to sink into platform at rest
  const PLATFORM_EDGE_TOLERANCE = 8; // Horizontal forgiveness so we don't drop too early
  let platformAscendBonus = 0; // Additional vertical offset for successive spawns after landings
  const PLATFORM_ASCEND_STEP = 40; // Pixels higher per qualifying landing
  const PLATFORM_ASCEND_MAX = Number.POSITIVE_INFINITY; // Cap climb bonus (effectively unlimited)
  const SMALL_PLATFORM_EXTRA = 100; // Extra height for small platforms (applied 50% of the time)
  const SMALL_PLATFORM_CHANCE = 0.5;
  const HOLE_PLATFORM_OFFSET = 115; // Further lowered platforms with holes (100px lower than before)
  const HOLE_ALIGNMENT_TWEAK = 25; // Shift hole right to better center on platform art
  let isOnBaselineGround = true; // Tracks when player is resting on main ground
  let fallingIntoHole = false;
  const projectiles: { x: number; y: number; active: boolean }[] = [];
  const PROJECTILE_SPEED = 700; // pixels per second (20 * 60fps) - much faster than enemy lasers
  const PROJECTILE_WIDTH = 25; // Same width as enemy lasers
  const PROJECTILE_HEIGHT = 2; // Same height as enemy lasers
  let nextShotTime = 0;
  const MAX_SHOOT_SPEED = 25; // Fastest cooldown at 80%+ energy (ms)
  const MIN_SHOOT_SPEED = 350; // Slowest cooldown at 20% or less energy (ms)
  let canShoot = false; // Unlocks after first laser jump
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
  const megaLaserGraphic = new Graphics();
  megaLaserGraphic.blendMode = 'add';
  let energy = 0;
  let playerFlashUntil = 0;
  let enemyFlashUntil = 0;


  // Stars disabled for now

  // Calculate initial responsive sizes
  let sizes = calculateResponsiveSizes(app.renderer.height);
  let playerRadius = sizes.playerRadius;
  let playerDiameter = sizes.playerDiameter;
  megaLaserHeight = playerDiameter * 1.2;

  const groundSurface = () => grounds.getSurfaceY();
  const computePlayerGround = () => groundSurface() + playerDiameter * GROUND_PLAYER_DEPTH;
  const initialPlayerX = () => app.renderer.width * 0.32;

  // Create shadow (added before player so it appears behind)
  const playerShadow = new Shadow({ playerWidth: playerDiameter });
  playfieldContainer.addChild(playerShadow.getView());

  // Add jump dust sprite (before player so it appears behind player but in front of ground)
  playfieldContainer.addChild(jumpDustSprite);

  // Add charge particle sprite (same layer as jump dust)
  playfieldContainer.addChild(chargeSprite);

  const ballBaseColor = 0x4fc3f7;
  const ballHitColor = 0xff2020;
  let currentBallColor = ballBaseColor;
  const ball = new Graphics();
  const setBallColor = (color: number) => {
    currentBallColor = color;
    ball.clear();
    ball.circle(0, 0, playerRadius).fill({ color });
  };
  setBallColor(ballBaseColor);
  const initialGround = computePlayerGround();
  ball.position.set(initialPlayerX(), initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
    initialX: initialPlayerX(),
    screenWidth: app.renderer.width,
  });


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
  playfieldContainer.addChild(enemyBall);
  const enemyBounds = () => ({
    left: enemyBall.position.x - playerRadius,
    right: enemyBall.position.x + playerRadius,
    top: enemyBall.position.y - playerRadius,
    bottom: enemyBall.position.y + playerRadius,
  });

  // Lasers render above players
  playfieldContainer.addChild(laserContainer);

  // Holes render above the player so the player can sink beneath them
  playfieldContainer.addChild(holeContainer);
  playfieldContainer.addChild(sparkSprite);
  playfieldContainer.addChild(megaLaserGraphic);
  playfieldContainer.addChild(haloSprite);
  playfieldContainer.addChild(enemyChargeSprite);
  playfieldContainer.addChild(projectileContainer);
  // Place wind on the sky layer: between sky (index 0) and forest/transition (index 1)
  backgrounds.getRoot().addChildAt(windSprite, 1);

  // Enemy systems
  const enemyPhysics = new EnemyPhysics({
    groundSurface: initialGround,
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

  const respawnPlayer = () => {
    fallingIntoHole = false;
    ball.alpha = 1;
    ball.scale.set(1, 1);
    const ground = computePlayerGround();
    physics.respawn(initialPlayerX(), ground);
  };

  const triggerFallIntoHole = (currentVelocity: number) => {
    fallingIntoHole = true;
    physics.clearSurfaceOverride();
    physics.setGroundCollisionEnabled(false);
    physics.forceVelocity(Math.max(300, Math.abs(currentVelocity) + 150));
    ball.alpha = 0.65;
    ball.scale.set(0.92, 0.92);

    // Simple respawn after short drop
    window.setTimeout(() => {
      respawnPlayer();
    }, 500);
  };

  // Debug hitbox overlay
  const DEBUG_DRAW_HITBOXES = false;
  const hitboxOverlay = new Graphics();
  playfieldContainer.addChild(hitboxOverlay);
  const hitboxLogCache = new Map<number, string>();

  // Start enemy in physics mode with jump sequence
  let enemyMode: 'physics' | 'hover' = 'physics';
  enemyPhysics.startJumpSequence();

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

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;
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

    // Get scroll speed multiplier from player position (0 = stopped, 1 = normal, 2 = double)
    const speedMultiplier = physics.getScrollSpeedMultiplier();

    backgrounds.update(deltaSeconds, speedMultiplier);
    grounds.update(deltaSeconds, speedMultiplier);
    dustField.update();

    // Update comet animation and position
    cometManager.update(deltaSeconds);

    // Update platforms with ground scroll speed (72 px/sec * speedMultiplier)
    const BASE_GROUND_SCROLL_SPEED = 72; // pixels per second (from parallaxNew.ts)
    const groundScrollSpeed = BASE_GROUND_SCROLL_SPEED * speedMultiplier;
    platforms.update(deltaSeconds, groundScrollSpeed, app.renderer.width);
    holes.update(deltaSeconds, groundScrollSpeed, app.renderer.width);
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

    // Update enemy charge particles
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
    jumpDust.update(deltaSeconds);
    jumpDustCtx.clearRect(0, 0, jumpDustCanvas.width, jumpDustCanvas.height);
    jumpDust.render(jumpDustCtx, jumpDustCanvas.width, jumpDustCanvas.height);
    jumpDustTexture.source.update();

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

    // Render platforms using PixiJS Sprites
    platforms.renderToContainer(platformContainer, 0); // No camera offset for now
    holes.renderToContainer(holeContainer, 0);

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

    // Platform collision detection
    // Store previous position for frame-by-frame tracking
    const prevState = { x: ball.position.x, y: ball.position.y };

    const state = freezePlayer ? physics.getState() : physics.update(deltaSeconds);
    if (freezePlayer) {
      physics.forceVelocity(0);
    }
    const verticalVelocity = (state.y - prevState.y) / Math.max(deltaSeconds, 0.0001);

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
    const playerBounds: PlayerBounds = {
      left: state.x - playerRadius,
      right: state.x + playerRadius,
      top: state.y - playerRadius,
      bottom: state.y + playerRadius,
    };

    const prevBounds: PlayerBounds = {
      left: prevState.x - playerRadius,
      right: prevState.x + playerRadius,
      top: prevState.y - playerRadius,
      bottom: prevState.y + playerRadius,
    };

    // Check for platform collision (ignore small movements during charge to prevent falling through)
    const isCharging = physics.isChargingJump();
    const supportingPlatform = platforms.getSupportingPlatform(
      playerBounds,
      prevBounds,
      verticalVelocity
    );

    // Hole collision: if we're not on a platform and overlap a hole, fall and respawn
    if (!supportingPlatform && !fallingIntoHole) {
      const hole = holes.getCollidingHole(playerBounds);
      if (hole) {
        triggerFallIntoHole(verticalVelocity);
        activePlatformId = null;
      }
    }

    if (!fallingIntoHole) {
      if (supportingPlatform) {
        // Player is on a platform - set surface override
        activePlatformId = supportingPlatform.id;
        // Convert stored platform surface (player top) to the center y the physics uses, and sink slightly for visuals
        const landingY = supportingPlatform.surfaceY + playerRadius + PLATFORM_LANDING_OFFSET;
        physics.landOnSurface(landingY);

        // Lock camera floor to this platform if it's higher than current floor
        if (supportingPlatform.surfaceY < cameraFloorY) {
          cameraFloorY = supportingPlatform.surfaceY;
        }

        // Check if player has moved outside platform horizontal bounds
        // Skip this check when charging to prevent squash animation from causing fall-through
        const timeSinceJump = performance.now() - lastJumpTime;
        const inJumpGracePeriod = timeSinceJump < JUMP_GRACE_PERIOD;

        if (!isCharging) {
          const walkedOff =
            playerBounds.right < supportingPlatform.left - PLATFORM_EDGE_TOLERANCE ||
            playerBounds.left > supportingPlatform.right + PLATFORM_EDGE_TOLERANCE;

          // Fall through if walked off edge OR if pressing Down key
          if ((walkedOff || isPressingDown) && !inJumpGracePeriod) {
            physics.clearSurfaceOverride();
            activePlatformId = null;
          }
        }
        // Increase climb bonus when we successfully land on any platform
        platformAscendBonus = Math.min(platformAscendBonus + PLATFORM_ASCEND_STEP, PLATFORM_ASCEND_MAX);
      } else if (activePlatformId !== null) {
        // Keep platform override while bouncing vertically so the bounce counter isn't reset
        const livePlatform = platforms.getPlatformBounds(activePlatformId);

        // If platform has been culled (scrolled away), release the player
        if (!livePlatform) {
          physics.clearSurfaceOverride();
          activePlatformId = null;
        } else {
          const stillOverPlatform =
            playerBounds.right >= livePlatform.left - PLATFORM_EDGE_TOLERANCE &&
            playerBounds.left <= livePlatform.right + PLATFORM_EDGE_TOLERANCE;

          // Check if we're in the grace period after a jump (ignore brief downward movement)
          const timeSinceJump = performance.now() - lastJumpTime;
          const inJumpGracePeriod = timeSinceJump < JUMP_GRACE_PERIOD;

          // If we're deliberately pressing Down, force a fall-through (unless in grace)
          if (isPressingDown && !inJumpGracePeriod) {
            physics.clearSurfaceOverride();
            activePlatformId = null;
          } else if (!stillOverPlatform && !inJumpGracePeriod) {
            // If we've drifted off the platform horizontally, drop the override so we can fall
            // BUT: Skip this check during jump grace period to prevent fall-through on jump execution
            physics.clearSurfaceOverride();
            activePlatformId = null;
          }
        }
      }
    }

    // Determine if we're back on the baseline ground
    const baselineRestY = computePlayerGround() - playerRadius;
    isOnBaselineGround =
      activePlatformId === null &&
      state.y >= baselineRestY - 0.5 &&
      Math.abs(verticalVelocity) < 25;

    if (isOnBaselineGround) {
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
    if (DEBUG_DRAW_HITBOXES) {
      hitboxOverlay.clear();
      // Player bounds
      hitboxOverlay.rect(playerBounds.left, playerBounds.top, playerBounds.right - playerBounds.left, playerBounds.bottom - playerBounds.top).fill({ color: 0xff0000, alpha: 0.25 });

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
    if (playerTopInScreenSpace < CAMERA_TOP_MARGIN) {
      // Player is too close to top of screen - push camera up
      const upwardPush = CAMERA_TOP_MARGIN - playerTopInScreenSpace;
      targetCameraY += upwardPush;
    }

    // Smoothly interpolate camera to target position
    cameraY += (targetCameraY - cameraY) * CAMERA_LERP_SPEED;

    // Apply camera position with parallax
    // Ground and playfield move at 100% camera speed (1.0x)
    // Backgrounds move at their horizontal parallax rate (0.5x for backgrounds)
    const BACKGROUND_PARALLAX_FACTOR = 0.5; // Same as horizontal parallax (BASE_BACKGROUND_SPEED / BASE_GROUND_SCROLL_SPEED)

    backgroundContainer.position.y = cameraY * BACKGROUND_PARALLAX_FACTOR;
    overlayContainer.position.y = cameraY; // Gradient moves with ground
    groundContainer.position.y = cameraY;
    platformContainer.position.y = cameraY;
    playfieldContainer.position.y = cameraY; // Player and effects move with ground

    ball.position.x = state.x;
    ball.position.y = state.y;
    ball.scale.set(state.scaleX, state.scaleY);

    // Update shadow position - project onto platform surface if player is above one
    const shadowSurface = (() => {
      // Check all platforms to find the closest one directly below the player
      const allPlatforms = platforms.getAllPlatforms();
      let closestPlatformY: number | null = null;

      for (const plat of allPlatforms) {
        if (!plat.active) continue;

        // Check if player is horizontally aligned with platform
        const platLeft = plat.x;
        const platRight = plat.x + plat.width;
        const playerLeft = state.x - playerRadius;
        const playerRight = state.x + playerRadius;

        // If player overlaps platform horizontally
        if (playerRight > platLeft && playerLeft < platRight) {
          // Calculate shadow position on this platform
          // Platform surfaceY is where player's top would be, add diameter + landing offset
          const platformShadowY = plat.surfaceY + playerDiameter + PLATFORM_LANDING_OFFSET;

          // Track the closest platform below the player's current position
          if (platformShadowY > state.y - playerRadius) {
            if (closestPlatformY === null || platformShadowY < closestPlatformY) {
              closestPlatformY = platformShadowY;
            }
          }
        }
      }

      // Use closest platform if found, otherwise use ground
      return closestPlatformY ?? computePlayerGround();
    })();

    playerShadow.update(ball.position.x, ball.position.y, shadowSurface);

    // Update enemy based on current mode
    if (enemyMode === 'physics') {
      const enemyState = enemyPhysics.update(deltaSeconds);
      enemyBall.position.y = enemyState.y;
      enemyBall.scale.set(enemyState.scaleX, enemyState.scaleY);

      // Check if ready to transition to hover mode
      if (enemyPhysics.isReadyForHover()) {
        const velocity = enemyPhysics.enableHoverMode();
        enemyMovement.startTransition(velocity, enemyState.y);
        enemyMode = 'hover';
        introComplete = true;
      }
    } else {
      const enemyState = enemyMovement.update(deltaSeconds);
      enemyBall.position.y = enemyState.y;
      enemyBall.scale.set(enemyState.scaleX, enemyState.scaleY);
    }

    const laserResult = laserPhysics.update({
      score: laserScore,
      playerX: state.x,
      playerY: state.y,
      playerRadius,
      playerHasJumped: physics.hasPlayerJumped(),
      enemyX: enemyBall.position.x,
      enemyY: enemyBall.position.y,
      isHovering:
        enemyMode === 'hover' &&
        scenarioStage !== 'prep' &&
        scenarioStage !== 'charging' &&
        scenarioStage !== 'firing',
      introComplete,
      stopSpawning: scenarioStage === 'prep' || scenarioStage === 'charging' || scenarioStage === 'firing',
    });
    if (laserResult.scoreChange !== 0) {
      laserScore += laserResult.scoreChange;
      // Energy +2% per cleared laser
      energy = Math.min(100, energy + laserResult.scoreChange * 2);

      // Unlock shooting on first laser jump
      if (!canShoot) {
        canShoot = true;
        console.log('[SHOOT UNLOCK] Unlocked after first laser jump');
      }

      updateEnergyUI();
      updateScoreDisplay();
    }
    if (laserResult.laserFired && laserResult.targetY !== null) {
      enemyMovement.setTarget(laserResult.targetY);
    }
    if (laserResult.hitPosition) {
      // Enemy lasers = red sparks - reduce energy by 1.5% per hit
      energy = Math.max(0, energy - 1.5);
      sparkParticles.spawn(laserResult.hitPosition.x, laserResult.hitPosition.y, 'red');
      playerFlashUntil = performance.now() + 250;
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

      const playerTop = state.y - playerRadius;
      const playerBottom = state.y + playerRadius;
      const beamTop = megaY;
      const beamBottom = megaY + megaLaserHeight;
      if (
        !megaLaserHitPlayer &&
        playerBottom > beamTop &&
        playerTop < beamBottom
      ) {
        beamWidth = Math.max(0, enemyBall.position.x - (state.x - playerRadius));
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
  });
  ticker.start();

  const triggerJump = () => {
    const jumpExecuted = physics.startJump();
    if (jumpExecuted) {
      lastJumpTime = performance.now();
    }
  };
  const releaseJump = () => {
    physics.endJump();
  };

  // Track mouse/pointer movement for horizontal player position
  const handlePointerMove = (event: PointerEvent) => {
    physics.setMousePosition(event.clientX);
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', triggerJump);
  window.addEventListener('pointerup', releaseJump);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      triggerJump();
    } else if (event.code === 'KeyF' || event.code === 'KeyS') {
      // Can only shoot if unlocked and has energy
      if (!canShoot || energy <= 0) return;

      const now = performance.now();

      // Calculate shooting cooldown based on current energy (matches geminiTut)
      let shootCooldown;
      if (energy >= 80) {
        shootCooldown = MAX_SHOOT_SPEED; // 25ms at 80%+ energy
      } else if (energy <= 20) {
        shootCooldown = MIN_SHOOT_SPEED; // 350ms at 20% or less energy
      } else {
        // Linear interpolation between 20% and 80% energy
        const energyRange = 80 - 20; // 60
        const cooldownRange = MIN_SHOOT_SPEED - MAX_SHOOT_SPEED; // 325ms
        const energyRatio = (energy - 20) / energyRange;
        shootCooldown = MIN_SHOOT_SPEED - (energyRatio * cooldownRange);
      }

      // Check if enough time has passed since last shot
      if (now - nextShotTime < shootCooldown) return;

      const state = physics.getState();
      projectiles.push({ x: state.x + playerRadius, y: state.y, active: true });

      // Consume 0.5% energy per shot
      energy = Math.max(0, energy - 0.5);
      nextShotTime = now;
      updateEnergyUI();
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      isPressingDown = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      releaseJump();
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
    sizes = calculateResponsiveSizes(app.renderer.height);
    playerRadius = sizes.playerRadius;
    playerDiameter = sizes.playerDiameter;

    // Redraw ball with new radius
    setBallColor(currentBallColor);

    // Update shadow size
    playerShadow.destroy();
    const newShadow = new Shadow({ playerWidth: playerDiameter });
    playfieldContainer.addChildAt(newShadow.getView(), playfieldContainer.getChildIndex(ball) - 1);
    Object.assign(playerShadow, newShadow);

    const updatedGround = computePlayerGround();
    physics.setGroundSurface(updatedGround);
    physics.updateScreenWidth(app.renderer.width);
    ball.position.y = updatedGround - playerRadius;

    // Redraw enemy with new radius
    setEnemyColor(currentEnemyColor);
    enemyPhysics.setGroundSurface(updatedGround);
    enemyBall.position.x = app.renderer.width * 0.9;

    laserPhysics.updateDimensions(app.renderer.width, app.renderer.height, updatedGround - playerRadius, enemyBall.position.x);

    // Update comet dimensions
    cometManager.updateDimensions(app.renderer.width, app.renderer.height);
  };

  window.addEventListener('resize', handleResize);

  const triggerTransition = () => {
    grounds.triggerTransition();
    backgrounds.triggerTransition();
    transitionButton.disabled = true;
    transitionButton.textContent = 'Forest Active';
  };

  const transitionButton = document.createElement('button');
  transitionButton.className = 'transition-btn';
  transitionButton.textContent = 'Enter Forest';
  transitionButton.type = 'button';
  transitionButton.addEventListener('click', triggerTransition);
  document.body.appendChild(transitionButton);

  // Energy bar UI
  const energyContainer = document.createElement('div');
  energyContainer.style.position = 'fixed';
  energyContainer.style.left = '20px';
  energyContainer.style.top = '50%';
  energyContainer.style.transform = 'translateY(-50%)';
  energyContainer.style.width = '30px';
  energyContainer.style.height = '300px';
  energyContainer.style.border = '2px solid rgba(255, 255, 255, 0.3)';
  energyContainer.style.background = 'rgba(0, 0, 0, 0.5)';
  energyContainer.style.borderRadius = '15px';
  energyContainer.style.overflow = 'hidden';
  energyContainer.style.zIndex = '10';
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
  energyMarker.style.height = '2px';
  energyMarker.style.backgroundColor = 'white';
  energyMarker.style.boxShadow = '0 0 5px rgba(255, 255, 255, 0.8)';
  energyMarker.style.transition = 'bottom 0.2s ease';

  const energyMarkerLine = document.createElement('div');
  energyMarkerLine.style.position = 'absolute';
  energyMarkerLine.style.top = '-1px';
  energyMarkerLine.style.left = '100%';
  energyMarkerLine.style.width = '20px';
  energyMarkerLine.style.height = '2px';
  energyMarkerLine.style.backgroundColor = 'white';
  energyMarkerLine.style.boxShadow = '0 0 5px rgba(255, 255, 255, 0.8)';
  energyMarker.appendChild(energyMarkerLine);

  const energyLabel = document.createElement('div');
  energyLabel.style.position = 'absolute';
  energyLabel.style.top = '-10px';
  energyLabel.style.left = 'calc(100% + 25px)';
  energyLabel.style.transform = 'translateY(-50%)';
  energyLabel.style.color = 'white';
  energyLabel.style.fontSize = '14px';
  energyLabel.style.fontWeight = 'bold';
  energyLabel.style.textShadow = '0 0 8px black';
  energyLabel.style.whiteSpace = 'nowrap';
  energyMarker.appendChild(energyLabel);

  energyContainer.appendChild(energyMarker);
  document.body.appendChild(energyContainer);

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
    const clampedEnergy = Math.max(0, Math.min(100, energy));
    energyFill.style.height = `${clampedEnergy}%`;
    const color = energyColorForLevel(clampedEnergy);
    energyFill.style.background = color;
    energyFill.style.boxShadow = `0 0 8px ${color}`;
    energyMarker.style.bottom = `${clampedEnergy}%`;
    const barText = laserScore < 50 ? 'Fill Up!' : (clampedEnergy > 50 ? 'Shoot!' : 'Jump!');
    energyLabel.textContent = barText;
  };
  updateEnergyUI();

  // Score Display - centered at top of screen
  const scoreDisplay = document.createElement('div');
  scoreDisplay.style.position = 'absolute';
  scoreDisplay.style.top = '20px';
  scoreDisplay.style.width = '100%';
  scoreDisplay.style.textAlign = 'center';
  scoreDisplay.style.fontSize = '2rem';
  scoreDisplay.style.fontWeight = 'bold';
  scoreDisplay.style.fontFamily = '"Times New Roman", Times, serif';
  scoreDisplay.style.color = 'white';
  scoreDisplay.style.userSelect = 'none';
  scoreDisplay.style.textShadow = '0px 2px 10px rgba(0,0,0,0.75)';
  scoreDisplay.style.zIndex = '1000';
  scoreDisplay.style.pointerEvents = 'none'; // Allow clicks to pass through to buttons below
  scoreDisplay.textContent = `${laserScore} Jumps`;
  document.body.appendChild(scoreDisplay);

  const updateScoreDisplay = () => {
    scoreDisplay.textContent = `${laserScore} Jumps`;
  };

  // Platform spawn button
  const spawnPlatform = () => {
    // Spawn off-screen to the right (so it animates in like the ground)
    const spawnX = app.renderer.width + 100; // Off-screen right
    const groundY = computePlayerGround();
    const isSmall = platformSpawnType === 'small';
    const smallBonus = isSmall && Math.random() < SMALL_PLATFORM_CHANCE ? SMALL_PLATFORM_EXTRA : 0;
    const baseOffset = PLATFORM_VERTICAL_OFFSET + smallBonus;
    const adjustedOffset = Math.min(baseOffset + platformAscendBonus, baseOffset + PLATFORM_ASCEND_MAX);
    platforms.spawn(spawnX, groundY, playerRadius, platformSpawnType, adjustedOffset);

    console.log(`[PLATFORM SPAWN] Spawned ${platformSpawnType} platform at X=${spawnX}`);

    // Climb bonus now increments on successful landings; reset handled when grounded

    // Alternate between large and small platforms
    platformSpawnType = platformSpawnType === 'large' ? 'small' : 'large';

    // Update button text to show next platform type
    platformButton.textContent = `Spawn ${platformSpawnType === 'large' ? 'Large' : 'Small'} Platform`;
  };

  // Platform + hole spawn button
  const spawnPlatformWithHole = () => {
    const spawnX = app.renderer.width + 100;
    const groundY = computePlayerGround();
    const holeType = holePlatformSpawnType;
    const baseOffset = HOLE_PLATFORM_OFFSET;

    // Center the hole relative to the platform art widths
    let holeX = spawnX;
    const platformDims = platforms.getImageDimensions(holeType);
    const holeDims = holes.getImageDimensions(holeType);
    if (platformDims && holeDims) {
      holeX = spawnX + (platformDims.width - holeDims.width) / 2 + HOLE_ALIGNMENT_TWEAK;
    }

    platforms.spawn(spawnX, groundY, playerRadius, holeType, baseOffset);
    holes.spawn(holeX, groundY, holeType);

    console.log(`[PLATFORM+HOLE SPAWN] Spawned ${holeType} platform with hole at X=${spawnX}`);

    holePlatformSpawnType = holePlatformSpawnType === 'large' ? 'small' : 'large';
    platformHoleButton.textContent = `Spawn ${holePlatformSpawnType === 'large' ? 'Large' : 'Small'} Platform + Hole`;
  };

  const platformButton = document.createElement('button');
  platformButton.className = 'transition-btn';
  platformButton.textContent = 'Spawn Large Platform';
  platformButton.type = 'button';
  platformButton.style.top = '62px'; // Position below transition button
  platformButton.addEventListener('click', spawnPlatform);
  document.body.appendChild(platformButton);

  const platformHoleButton = document.createElement('button');
  platformHoleButton.className = 'transition-btn';
  platformHoleButton.textContent = 'Spawn Small Platform + Hole';
  platformHoleButton.type = 'button';
  platformHoleButton.style.top = '104px'; // Stack below the regular platform button
  platformHoleButton.addEventListener('click', spawnPlatformWithHole);
  document.body.appendChild(platformHoleButton);

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

  const scenarioButton = document.createElement('button');
  scenarioButton.className = 'transition-btn';
  scenarioButton.textContent = 'Run Mega Laser Scenario';
  scenarioButton.type = 'button';
  scenarioButton.style.top = '146px';
  scenarioButton.addEventListener('click', startScenario);
  document.body.appendChild(scenarioButton);

  // Comet button
  const spawnComet = () => {
    cometManager.spawn();
    console.log('[COMET] Spawned comet animation');
  };

  const cometButton = document.createElement('button');
  cometButton.className = 'transition-btn';
  cometButton.textContent = 'Comet';
  cometButton.type = 'button';
  cometButton.style.top = '188px';
  cometButton.addEventListener('click', spawnComet);
  document.body.appendChild(cometButton);

  // 100% Energy button
  const fillEnergy = () => {
    energy = 100;
    // Also unlock shooting if not already unlocked
    if (!canShoot) {
      canShoot = true;
      console.log('[SHOOT UNLOCK] Unlocked via energy button');
    }
    updateEnergyUI();
    console.log('[ENERGY] Set to 100%');
  };

  const energyButton = document.createElement('button');
  energyButton.className = 'transition-btn';
  energyButton.textContent = '100% Energy';
  energyButton.type = 'button';
  energyButton.style.top = '230px';
  energyButton.addEventListener('click', fillEnergy);
  document.body.appendChild(energyButton);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
