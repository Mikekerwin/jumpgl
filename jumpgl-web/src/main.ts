import './style.css';
import { Application, Container, Graphics, Sprite, Texture, Ticker, RenderTexture } from 'pixi.js';
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
import { ButterflyManager } from './butterflyAnimation';
import { GroundHoleManager } from './groundHoleManager';
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
  const butterflyContainer = new Container();
  const cometContainer = new Container();
  const debugPlatformHitboxContainer = new Container(); // Debug visualization for platform hitboxes

  scene.addChild(
    backgroundContainer,
    overlayContainer,
    groundContainer,
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

  // Initialize platform system
  const platforms = new FloatingPlatforms(PLATFORM_LARGE_IMAGE_PATH, PLATFORM_SMALL_IMAGE_PATH);
  const holes = new HoleManager(HOLE_SMALL_IMAGE_PATH, HOLE_LARGE_IMAGE_PATH);

  // Initialize ground hole system for comet hole level
  const groundHoles = new GroundHoleManager();

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
  let shootUnlocked = false;
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
  let playerFlashUntil = 0;
  let enemyFlashUntil = 0;
  let blueHits = 0;
  let blueOuts = 0;
  let redHits = 0;
  let redOuts = 0;
  let firstOutMade = false;
  let scoreVisible = false;
  const HITS_PER_OUT = 20;
  let scenarioButton: HTMLButtonElement | null = null;
  let autoScenarioPending = false;
  let autoScenarioTriggered = false;
  let butterfliesSpawned = false;

  // Comet Hole Level state
  let cometHoleLevelActive = false;
  let lastPlatformX = 0; // Track last platform X position
  const PLATFORM_MIN_SPACING = 250; // Minimum pixels between platforms
  const PLATFORM_MAX_SPACING = 450; // Maximum pixels between platforms

  // Red enemy state for hole level
  let redEnemyActive = false;
  let redEnemyState: 'on_platform' | 'falling' | 'rolling_in' | 'jumping_intro' | 'shooting' = 'on_platform';
  let redEnemyPlatformId: number | null = null;
  let redEnemyVelocityY = 0;
  let redEnemyVelocityX = 0;
  let enemyEverVisible = false; // Track if enemy has ever been shown (for player movement range)
  let enemyIntroDelayStartTime = 0; // When the 1-second delay before enemy intro started
  let playerReturnStartTime = 0; // When player started returning to left half
  let playerReturnStartX = 0; // Player X when return animation started
  let playerReturnTargetX = 0; // Target X for return animation
  let redEnemyFallTime = 0;
  const RED_ENEMY_ROLL_SPEED = 700; // Faster horizontal roll-in speed
  let highestPlatformHeight = 0; // Track highest platform to spawn enemy on it
  let highestPlatformX = 0;

  const RESPAWN_WAIT_TIME = 0.2; // Shorter wait before animating back
  const RESPAWN_HEIGHT_ABOVE_SCREEN = -200; // Spawn player this many pixels above top of screen
  const RESUME_WAIT_TIME = 1.0; // Pause before moving forward after respawn
  const RESUME_RAMP_DURATION = 0.6; // Ease into forward motion
  const BASE_GROUND_SCROLL_SPEED = 72; // pixels per second (from parallaxNew.ts)
  // Respawn system state
  let respawnState: 'normal' | 'dying' | 'waiting' | 'animating_back' | 'respawning' | 'resume_pause' | 'resume_ramp' = 'normal';
  let respawnTimer = 0;
  let spawnPointX = 0; // X position to respawn at (start of meteor transition) - FIXED, set once when meteor spawns
  let deathPlayerX = 0; // Player's world X position when they died
  let remainingRewindDistance = 0; // Fixed distance to scroll back to spawn (updated each frame by deltaX)
  let resumeRampTimer = 0;

  // Platform height configuration for 4 levels
  // Level 1: Just above ground (reachable from ground)
  // Level 2: One jump up from Level 1
  // Level 3: One jump up from Level 2 (triggers camera pan)
  // Level 4: Top level (reachable from Level 3)
  const screenHeight = app.renderer.height;
  const levelHeight = (screenHeight * 2) / 3; // Each level is ~2/3 screen height (long jump distance)
  const FIRST_PLATFORM_HEIGHT = 50; // Just above ground - always reachable
  const PLATFORM_LEVEL_1_MIN = 50;
  const PLATFORM_LEVEL_1_MAX = levelHeight * 0.8;
  const PLATFORM_LEVEL_2_MIN = levelHeight * 0.8;
  const PLATFORM_LEVEL_2_MAX = levelHeight * 1.6;
  const PLATFORM_LEVEL_3_MIN = levelHeight * 1.6;
  const PLATFORM_LEVEL_3_MAX = levelHeight * 2.4;
  const PLATFORM_LEVEL_4_MIN = levelHeight * 2.4;
  const PLATFORM_LEVEL_4_MAX = levelHeight * 3.2;

  let isFirstPlatformSpawned = false; // Track if first platform has been spawned
  const processedSegments = new Set<string>(); // Track which segments have spawned holes

  // Camera system for hole levels
  let cameraZoom = 1.0;


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
  ball.position.set(initialPlayerX(), initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
    initialX: initialPlayerX(),
    screenWidth: app.renderer.width,
  });

  // Rest of player intro animation state
  let playerIntroPhase: 'initial' | 'moveout' | 'jump1' | 'jump2' | 'grow' | 'delay' | 'complete' = 'initial';
  let playerIntroStartTime = performance.now();
  let playerIntroJumpCount = 0;
  const playerIntroNormalSize = playerDiameter; // Normal size
  let playerIntroCurrentSize = playerIntroStartSize;
  let playerIntroGrowStartX = 0; // X position where jumps landed (set when entering grow phase)

  // Post-intro easing state
  let postIntroEaseActive = false;
  let postIntroEaseStartTime = 0;
  const postIntroEaseDuration = 1.5; // 1.5 seconds to ease into full speed

  // Calculate cottage door position in world coordinates
  // Cottage image is 2048x900, player starts at 655px from left (door position)
  const cottageImageWidth = 2048;
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
  // Player can move from ~5% to ~95% of screen width
  // With initialX at 32%, left=350 gives ~5%, right=750 gives ~95%
  physics.setHorizontalRange(350, 750);
  console.log('[PLAYER RANGE] Initial: Full screen (5% to 95%)');

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
  playfieldContainer.addChild(butterflyContainer);

  // Add ground foreground container (cottage overlay, etc.) above player
  playfieldContainer.addChild(grounds.getForegroundContainer());

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

  const triggerFallIntoHole = (currentVelocity: number) => {
    // Disable ground collision and let player fall through
    // The respawn state machine will handle the rest when player falls below screen
    fallingIntoHole = true;
    physics.clearSurfaceOverride();
    physics.setGroundCollisionEnabled(false);
    physics.forceVelocity(Math.max(300, Math.abs(currentVelocity) + 150));
    console.log('[HOLE] Player falling into hole, ground collision disabled');
  };

  // Debug hitbox overlay
  const DEBUG_DRAW_HITBOXES = false; // Disable hitbox overlays
  const hitboxOverlay = new Graphics();
  playfieldContainer.addChild(hitboxOverlay);
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

  // Minimap setup - picture-in-picture zoomed-out view
  const MINIMAP_WIDTH = 450;
  const MINIMAP_HEIGHT = 200;
  const MINIMAP_ZOOM = 0.02; // Show ~8.3x more area
  const MINIMAP_PADDING = 20;

  // Create render texture for minimap
  const minimapRenderTexture = RenderTexture.create({
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
  });

  // Create sprite to display the minimap
  const minimapSprite = new Sprite(minimapRenderTexture);
  minimapSprite.x = app.renderer.width - MINIMAP_WIDTH - MINIMAP_PADDING;
  minimapSprite.y = MINIMAP_PADDING;

  // Create border for minimap
  const minimapBorder = new Graphics();
  minimapBorder.rect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  minimapBorder.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  minimapBorder.position.set(minimapSprite.x, minimapSprite.y);

  // Create semi-transparent background for minimap
  const minimapBackground = new Graphics();
  minimapBackground.rect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  minimapBackground.fill({ color: 0x000000, alpha: 0.3 });
  minimapBackground.position.set(minimapSprite.x, minimapSprite.y);

  // Add minimap to stage (on top of everything)
  app.stage.addChild(minimapBackground);
  app.stage.addChild(minimapSprite);
  app.stage.addChild(minimapBorder);

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

    // Respawn system - smooth animation-based approach
    let speedMultiplier = 1.0; // Default normal speed

    if (respawnState === 'normal') {
      // Check if player fell out of bounds (below screen)
      const playerY = physics.getState().y;
      if (playerY > app.renderer.height + 100) { // 100px buffer below screen
        console.log('[RESPAWN] Player fell out of bounds, entering dying state');

        // Capture death position in world coordinates
        deathPlayerX = physics.getState().x;

        // Find CURRENT position of meteor_transition segment (the pink respawn box)
        const segments = grounds.getSegments();
        const meteorSegment = segments.find((seg: { type: string; x: number }) => seg.type === 'meteor_transition');
        if (meteorSegment) {
          spawnPointX = meteorSegment.x; // Update to CURRENT position, not initial spawn position
        }

        remainingRewindDistance = spawnPointX - deathPlayerX;
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
      const RESPAWN_MAX_SPEED_MULTIPLIER = 12; // 5x reverse speed at peak
      const EASE_DISTANCE = 300; // Distance over which to ease out

      const absRemaining = Math.abs(remainingRewindDistance);
      const direction = remainingRewindDistance >= 0 ? 1 : -1; // negative remaining = scroll backward (negative speed)

      // Calculate speed multiplier based on remaining distance with easing
      let targetSpeedMult: number;

      if (absRemaining < EASE_DISTANCE) {
        // Close to target: ease out (speed proportional to distance)
        const minSpeedFactor = 0.1;
        const easeProgress = absRemaining / EASE_DISTANCE; // 1 → 0 as we approach
        targetSpeedMult = direction * RESPAWN_MAX_SPEED_MULTIPLIER * (minSpeedFactor + easeProgress * (1 - minSpeedFactor));
      } else {
        // Far from target: full speed
        targetSpeedMult = direction * RESPAWN_MAX_SPEED_MULTIPLIER;
      }

      speedMultiplier = targetSpeedMult;

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
        fallingIntoHole = false;
        physics.clearSurfaceOverride();
        wasGrounded = false;
        previousVelocity = 0;

        // Respawn player at original starting X position (NOT spawnPointX)
        // Keep player's horizontal movement range intact
        const groundY = computePlayerGround();
        physics.respawn(initialPlayerX(), groundY); // Use original spawn X, not meteor segment X
        physics.setGroundCollisionEnabled(true);
        console.log(`[RESPAWN] Player respawning at original X=${initialPlayerX().toFixed(0)}, final remaining=${remainingRewindDistance.toFixed(1)}px`);

        // Force player Y position above screen
        physics.forceVelocity(0);
        const currentState = physics.getState();
        ball.position.set(currentState.x, RESPAWN_HEIGHT_ABOVE_SCREEN);

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

          // Spawn butterflies from cottage door - timing starts from first jump
          if (butterflyManager && !butterfliesSpawned && biomeManager.getCurrentBiome() === 'cloud') {
            const groundY = computePlayerGround();
            const doorX = playerIntroStartX; // Cottage door X position

            butterflyVariants.forEach((variant, idx) => {
              for (let i = 0; i < variant.count; i++) {
                // Spawn delays from when player jumps: 0.70s, 1.75s, 2.5s
                let spawnDelay;
                if (idx === 0) spawnDelay = 0.70;
                else if (idx === 1) spawnDelay = 1.75;
                else spawnDelay = 2.5;

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
            console.log('[PLAYER INTRO] Butterflies queued from first jump at X=' + doorX);
          }

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

        const jumpHorizontalSpeed = 400; // Same speed to reach 200px total
        ball.position.x += jumpHorizontalSpeed * deltaSeconds;

        // Grow from 87.5% to 100% during second jump
        const jumpProgress = Math.min(elapsed / 0.4, 1.0);
        const midSize = playerIntroStartSize + (playerIntroNormalSize - playerIntroStartSize) * 0.5;
        playerIntroCurrentSize = midSize + (playerIntroNormalSize - midSize) * jumpProgress;
        const radius = playerIntroCurrentSize / 2;

        ball.clear();
        ball.circle(0, 0, radius).fill({ color: currentBallColor });

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

          console.log('[PLAYER INTRO] Jumps complete at X=' + ball.position.x + ', stopped for 2s delay');
        }
      } else if (playerIntroPhase === 'delay') {
        // Phase 5: Wait at landed position with normal size before giving control
        speedMultiplier = 1.0;

        // Keep at normal size and stay at landed position
        ball.clear();
        ball.circle(0, 0, playerRadius).fill({ color: currentBallColor });

        // Keep position locked where we landed (don't move to center)
        const groundY = computePlayerGround() - playerRadius;
        ball.position.y = groundY;
        // X position stays where we landed from jumps
        physics.setPosition(ball.position.x, ball.position.y);
        physics.forceVelocity(0);

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

          // Activate post-intro easing
          postIntroEaseActive = true;
          postIntroEaseStartTime = now;

          // Enable soft mouse following for smooth easing
          physics.setSoftFollowMode(true);

          // Set mouse position to player position to prevent immediate drift toward mouse
          physics.setMousePosition(ball.position.x);

          console.log('[PLAYER INTRO] Complete - player control enabled with easing at X=' + ball.position.x);
        }
      }
    }

    // Post-intro easing: gradually increase parallax speed from 1.0 to full speed
    if (postIntroEaseActive) {
      const currentTime = performance.now();
      const elapsed = (currentTime - postIntroEaseStartTime) / 1000;
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
        // Easing complete - disable soft follow and return to instant tracking
        postIntroEaseActive = false;
        physics.setSoftFollowMode(false);
        console.log('[POST-INTRO] Easing complete - full speed enabled');
      }
    }

    backgrounds.update(deltaSeconds, speedMultiplier);
    grounds.update(deltaSeconds, speedMultiplier);
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
          const groundY = computePlayerGround() + 40; // Move hitbox 40px lower
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
    platforms.update(deltaSeconds, groundScrollSpeed);
    holes.update(deltaSeconds, groundScrollSpeed);
    groundHoles.update(deltaSeconds, groundScrollSpeed);
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
        // Count hits against red; every 20 hits = 1 out on red
        redHits += 1;
        if (redHits >= HITS_PER_OUT) {
          const outsGained = Math.floor(redHits / HITS_PER_OUT);
          redOuts = Math.min(10, redOuts + outsGained);
          redHits = redHits % HITS_PER_OUT;
        }
        if (!firstOutMade && (redOuts + blueOuts) > 0 && scenarioButton) {
          firstOutMade = true;
          scenarioButton.disabled = false;
        }
        if (redOuts > 0 && !autoScenarioTriggered) {
          autoScenarioPending = true;
          autoScenarioTriggered = true;
        }
        updateScoreUI();
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

    // Butterflies - spawn from cottage door when player jumps (triggered in intro animation)
    // Spawning is now handled during player intro jump1 phase
    // (No automatic spawning here)
    // Check fence butterfly proximity (butterfly handles its own flight internally)
    if (grounds) {
      const playerX = physics.getState().x;
      grounds.checkButterflyProximity(playerX);
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

    // Debug: Render platform and ground hole hitboxes (DISABLED)
    // debugPlatformHitboxContainer.removeChildren();

    // Platform hitboxes (semi-transparent green) - DISABLED
    // const platformHitboxes = platforms.getDebugHitboxes(playerDiameter);
    // platformHitboxes.forEach((hitbox) => {
    //   const debugRect = new Graphics();
    //   debugRect.rect(hitbox.left, hitbox.top, hitbox.width, hitbox.height);
    //   debugRect.fill({ color: 0x00ff7f, alpha: 0.35 }); // Spring green at 35% opacity
    //   debugPlatformHitboxContainer.addChild(debugRect);
    // });

    // Ground hole hitboxes (semi-transparent red) - DISABLED
    // const debugGroundHoleHitboxes = groundHoles.getDebugHitboxes();
    // debugGroundHoleHitboxes.forEach((hitbox) => {
    //   const debugRect = new Graphics();
    //   debugRect.rect(hitbox.left, hitbox.top, hitbox.right - hitbox.left, hitbox.bottom - hitbox.top);
    //   debugRect.fill({ color: 0xff4444, alpha: 0.35 }); // Red at 35% opacity
    //   debugPlatformHitboxContainer.addChild(debugRect);
    // });

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

    // Skip physics update during initial, delay, and complete phases (only run physics during moveout and jump)
    const skipPhysics = freezePlayer || (playerIntroActive && (playerIntroPhase === 'initial' || playerIntroPhase === 'delay' || playerIntroPhase === 'complete'));
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

    const verticalVelocity = (state.y - prevState.y) / Math.max(deltaSeconds, 0.0001);

    // Dynamic platform spawner for hole ground segments
    // Spawn platforms consistently over any hole segments
    // Only spawn when holes are actually visible or nearly visible on screen
    const willMoreHolesCome = grounds.willNextSegmentBeHole();

    // Get actual ground hole hitboxes to determine precise spawn boundaries
    const groundHoleHitboxesRuntime = groundHoles.getDebugHitboxes();
    let leftmostHoleX = Infinity;
    let rightmostHoleX = -Infinity;

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
      highestPlatformHeight = 0;
      highestPlatformX = 0;
      redEnemyPlatformId = null;
      lastHoleStartX = null;
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

          // Determine platform height progressively based on player's current height
          let verticalOffset: number;

          // First platform is always at ground level for easy access
          if (!isFirstPlatformSpawned) {
            verticalOffset = FIRST_PLATFORM_HEIGHT;
            isFirstPlatformSpawned = true;
          } else {
            // Calculate player's current height above ground
            const groundY = computePlayerGround();
            const playerHeightAboveGround = groundY - state.y;

            // Max jump height is approximately 2x player diameter (double jump)
            const maxJumpHeight = playerDiameter * 2;

            // Build available levels - include nearby levels AND upward-leading levels
            const availableLevels: Array<{min: number, max: number, weight: number}> = [];

            // Level 1: Always available when player is near ground
            // Higher weight when player is at this level
            if (playerHeightAboveGround < PLATFORM_LEVEL_2_MIN + maxJumpHeight) {
              const weight = playerHeightAboveGround < PLATFORM_LEVEL_1_MAX ? 3 : 1;
              availableLevels.push({min: PLATFORM_LEVEL_1_MIN, max: PLATFORM_LEVEL_1_MAX, weight});
            }

            // Level 2: Available once player can reach it
            if (playerHeightAboveGround >= PLATFORM_LEVEL_1_MIN - maxJumpHeight) {
              const weight = (playerHeightAboveGround >= PLATFORM_LEVEL_1_MAX && playerHeightAboveGround < PLATFORM_LEVEL_2_MAX) ? 3 : 1;
              availableLevels.push({min: PLATFORM_LEVEL_2_MIN, max: PLATFORM_LEVEL_2_MAX, weight});
            }

            // Level 3: Available once player can reach it
            if (playerHeightAboveGround >= PLATFORM_LEVEL_2_MIN - maxJumpHeight) {
              const weight = (playerHeightAboveGround >= PLATFORM_LEVEL_2_MAX && playerHeightAboveGround < PLATFORM_LEVEL_3_MAX) ? 3 : 1;
              availableLevels.push({min: PLATFORM_LEVEL_3_MIN, max: PLATFORM_LEVEL_3_MAX, weight});
            }

            // Level 4: Available once player is high enough (camera zoomed out)
            if (playerHeightAboveGround >= PLATFORM_LEVEL_3_MIN - maxJumpHeight) {
              const weight = playerHeightAboveGround >= PLATFORM_LEVEL_3_MAX ? 3 : 1;
              availableLevels.push({min: PLATFORM_LEVEL_4_MIN, max: PLATFORM_LEVEL_4_MAX, weight});
            }

            // If no levels are available (shouldn't happen), default to Level 1
            if (availableLevels.length === 0) {
              availableLevels.push({min: PLATFORM_LEVEL_1_MIN, max: PLATFORM_LEVEL_1_MAX, weight: 1});
            }

            // Weighted random selection - favors nearby levels but includes upward platforms
            const totalWeight = availableLevels.reduce((sum, level) => sum + level.weight, 0);
            let random = Math.random() * totalWeight;
            let selectedLevel = availableLevels[0];

            for (const level of availableLevels) {
              random -= level.weight;
              if (random <= 0) {
                selectedLevel = level;
                break;
              }
            }

            verticalOffset = selectedLevel.min + Math.random() * (selectedLevel.max - selectedLevel.min);
          }

          const groundY = computePlayerGround();

          // Check if this platform is too high (more than one screen above player)
          // If so, spawn a stepping stone platform at mid-screen
          const playerHeightAboveGround = groundY - state.y;
          const platformHeightInScreenSpace = verticalOffset - playerHeightAboveGround;
          const needsSteppingStone = platformHeightInScreenSpace > screenHeight * 0.5;

          if (needsSteppingStone && verticalOffset > screenHeight * 0.6) {
            // Spawn a stepping stone platform at mid-screen height
            const steppingStoneHeight = playerHeightAboveGround + (screenHeight * 0.4);
            const steppingStoneType = 'small';
            platforms.spawn(platformX - 100, groundY, playerRadius, steppingStoneType, steppingStoneHeight);
          }

          // Determine platform type and configuration
          const spawnDouble = Math.random() < 0.25; // 25% chance for double platforms

          if (spawnDouble) {
            // Spawn two platforms close together at different heights
            const type1 = Math.random() > 0.6 ? 'large' : 'small';
            const type2 = Math.random() > 0.6 ? 'large' : 'small';
            const height1 = verticalOffset;
            const height2 = verticalOffset + (Math.random() > 0.5 ? 150 : -150); // +/- 150px

            const id1 = platforms.spawn(platformX, groundY, playerRadius, type1, height1);
            const id2 = platforms.spawn(platformX + 180, groundY, playerRadius, type2, Math.max(PLATFORM_LEVEL_1_MIN, height2));

            // Track highest platform for enemy spawning
            const maxHeight = Math.max(height1, height2);
            if (maxHeight > highestPlatformHeight) {
              highestPlatformHeight = maxHeight;
              highestPlatformX = maxHeight === height1 ? platformX : platformX + 180;
              redEnemyPlatformId = maxHeight === height1 ? id1 : id2;
            }

            lastPlatformX = platformX + 180;
          } else {
            // Single platform - 70% small, 30% large
            const platformType = Math.random() > 0.3 ? 'small' : 'large';

            const id = platforms.spawn(platformX, groundY, playerRadius, platformType, verticalOffset);

            // Track highest platform for enemy spawning
            if (verticalOffset > highestPlatformHeight) {
              highestPlatformHeight = verticalOffset;
              highestPlatformX = platformX;
              redEnemyPlatformId = id;
            }

            lastPlatformX = platformX;
          }

          spawnCount++;
        }
      }
    }

    // Spawn red enemy on the highest platform once platforms are done spawning
    if (cometHoleLevelActive && !redEnemyActive && highestPlatformHeight > 0 && !willMoreHolesCome) {
      const plat = redEnemyPlatformId !== null ? platforms.getPlatformBounds(redEnemyPlatformId) : null;
      if (plat) {
        const enemyX = (plat.left + plat.right) / 2;
        const enemyY = plat.surfaceY + playerRadius; // sit centered on platform
        enemyBall.position.set(enemyX, enemyY);
        enemyBall.visible = true;
        redEnemyActive = true;
        redEnemyState = 'on_platform';
        console.log(
          `[RED ENEMY] Spawned on platform ${plat.id} at x=${enemyX.toFixed(0)} surfaceY=${plat.surfaceY.toFixed(0)}`
        );
      } else {
        // Fallback: place at stored height/X even if we lost the platform id
        const groundY = computePlayerGround();
        const enemyY = groundY - highestPlatformHeight - playerRadius;
        enemyBall.position.set(highestPlatformX, enemyY);
        enemyBall.visible = true;
        redEnemyActive = true;
        redEnemyState = 'on_platform';
        console.warn('[RED ENEMY] Spawned with fallback position (no platform id)');
      }
    }

    // Red enemy collision detection with blue player
    if (redEnemyActive && redEnemyState === 'on_platform') {
      // Keep enemy stuck to its platform while it scrolls
      if (redEnemyPlatformId !== null) {
        const plat = platforms.getPlatformBounds(redEnemyPlatformId);
        if (plat) {
          enemyBall.position.x = (plat.left + plat.right) / 2;
          enemyBall.position.y = plat.surfaceY + playerRadius;
        } else {
          // Platform vanished; fall
          redEnemyState = 'falling';
          redEnemyVelocityX = RED_ENEMY_ROLL_SPEED;
          redEnemyVelocityY = 0;
        }
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
        // Player hit the enemy - start fall-off animation
        redEnemyState = 'falling';
        redEnemyVelocityX = 200; // Push enemy to the right
        redEnemyVelocityY = -300; // Initial upward velocity from impact
        redEnemyPlatformId = null;
        // Impact feedback: sparks + quick screen shake
        sparkParticles.spawn(enemyBall.position.x, enemyBall.position.y, 'red');
        shakeActive = true;
        shakeEndTime = performance.now() + 220;
        redEnemyFallTime = performance.now();
        console.log('[RED ENEMY] Hit by player, falling off platform');
      }
    }

    // Red enemy falling animation
    if (redEnemyActive && redEnemyState === 'falling') {
      const GRAVITY = 2000; // Gravity for falling
      redEnemyVelocityY += GRAVITY * deltaSeconds;
      enemyBall.position.x += redEnemyVelocityX * deltaSeconds;
      enemyBall.position.y += redEnemyVelocityY * deltaSeconds;

      // Check if enemy has fallen far below ground
      const groundY = computePlayerGround();
      if (enemyBall.position.y > groundY + 500) {
        // Enemy has fallen into the hole
        enemyBall.visible = false;
        console.log('[RED ENEMY] Fell into hole, hiding');
      }
    }

    // Detect when player returns to grassy area to start roll-in animation (even if enemy never fully hid)
    if (
      redEnemyActive &&
      (redEnemyState === 'falling' || redEnemyState === 'on_platform')
    ) {
      const noHolesAhead = !cometHoleLevelActive && !hasActiveHoles && !willMoreHolesCome;
      const farPastHoles = rightmostHoleX > -Infinity && state.x > rightmostHoleX + window.innerWidth * 0.25;
      const timeSinceFall = performance.now() - redEnemyFallTime;

      // Start the delay timer when conditions are met
      if ((noHolesAhead || farPastHoles) && timeSinceFall > 400) {
        if (enemyIntroDelayStartTime === 0) {
          // First time conditions met - start the 1-second delay
          enemyIntroDelayStartTime = performance.now();
          console.log('[RED ENEMY] Hole area cleared, starting 1-second intro delay');
        }

        // Check if 1-second delay has passed
        const delayElapsed = performance.now() - enemyIntroDelayStartTime;
        if (delayElapsed >= 1000) {
          const groundY = computePlayerGround();
          enemyBall.position.set(-120, groundY - playerRadius); // Start off-screen left
          enemyBall.visible = true;

          // First time enemy becomes visible - constrain player to left half
          if (!enemyEverVisible) {
            enemyEverVisible = true;
            physics.resetHorizontalRange(); // Back to default 250 left, 150 right

            // If player is too far right (beyond 45% screen), start smooth return animation
            const playerScreenPercent = state.x / app.renderer.width;
            const maxAllowedPercent = 0.45; // 45% of screen (right boundary of left half)
            if (playerScreenPercent > maxAllowedPercent) {
              playerReturnStartTime = performance.now();
              playerReturnStartX = state.x;
              playerReturnTargetX = app.renderer.width * 0.40; // Move to 40% (safely in left half)
              console.log(`[PLAYER RANGE] Player at ${(playerScreenPercent * 100).toFixed(0)}%, animating to 40%`);
            }

            console.log('[PLAYER RANGE] Enemy appearing, constraining to left half');
          }

          redEnemyState = 'rolling_in';
          redEnemyVelocityX = RED_ENEMY_ROLL_SPEED;
          showScoreUI();
          console.log('[RED ENEMY] 1-second delay complete, starting roll-in animation');
        }
      }
    }

    // Red enemy rolling in animation
    if (redEnemyActive && redEnemyState === 'rolling_in') {
      enemyBall.position.x += redEnemyVelocityX * deltaSeconds;

      // Stop at 90% of screen width (original enemy position)
      const targetX = app.renderer.width * 0.9;
      if (enemyBall.position.x >= targetX) {
        enemyBall.position.x = targetX;
        redEnemyState = 'jumping_intro';
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

    // Detect platforms being passed through while ascending (jumping up)
    const platformsPassedThrough = platforms.getPlatformsPassedThrough(
      playerBounds,
      prevBounds,
      verticalVelocity
    );

    // Mark each platform that was jumped through
    platformsPassedThrough.forEach(platformId => {
      physics.markPlatformJumpedThrough(platformId);
    });

    // Check for platform collision (ignore small movements during charge to prevent falling through)
    const isCharging = physics.isChargingJump();
    const supportingPlatform = platforms.getSupportingPlatform(
      playerBounds,
      prevBounds,
      verticalVelocity,
      physics.getJumpedThroughPlatforms() // Pass Set of platforms jumped through
    );

    // Hole collision: if we're not on a platform and overlap a hole, fall and respawn
    if (!supportingPlatform && !fallingIntoHole) {
      const hole = holes.getCollidingHole(playerBounds);
      if (hole) {
        triggerFallIntoHole(verticalVelocity);
        activePlatformId = null;
      }

      // Ground hole collision (comet hole level)
      const groundHole = groundHoles.getCollidingHole(playerBounds);
      if (groundHole) {
        triggerFallIntoHole(verticalVelocity);
        activePlatformId = null;
        console.log(`[GROUND HOLE] Player fell into ${groundHole.type} hole`);
      }
    }

    if (!fallingIntoHole) {
      if (supportingPlatform) {
        // Player is on a platform - set surface override
        activePlatformId = supportingPlatform.id;
        // Convert stored platform surface (player top) to the center y the physics uses, and sink slightly for visuals
        const landingY = supportingPlatform.surfaceY + playerRadius + PLATFORM_LANDING_OFFSET;
        physics.landOnSurface(landingY, supportingPlatform.id); // Pass platform ID to clear from jumped-through list

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

    // Camera zoom (comet hole level ONLY) - slight zoom out to keep ground visible
    if (cometHoleLevelActive) {
      const groundY = computePlayerGround();
      const playerHeightAboveGround = groundY - state.y;
      const isOnPlatform = activePlatformId !== null || supportingPlatform !== null;

      // Zoom out slightly when player is on platforms to show more vertical space
      if (isOnPlatform && playerHeightAboveGround > PLATFORM_LEVEL_1_MIN) {
        const targetZoom = 0.90; // Slight zoom out when on platforms
        cameraZoom += (targetZoom - cameraZoom) * 0.015;
      } else if (isOnBaselineGround && isGrounded) {
        // Only zoom back in when ACTUALLY on baseline ground AND grounded (not mid-air)
        cameraZoom += (1.0 - cameraZoom) * 0.015;
      }
      // Otherwise maintain current zoom (during jumps between platforms)

      // Apply zoom with parallax depth - background zooms less for realistic parallax
      const backgroundZoom = 1.0 - (1.0 - cameraZoom) * 0.2; // Only 20% of the zoom
      backgroundContainer.scale.set(backgroundZoom);

      // Foreground elements (ground, platforms, player) get full zoom
      groundContainer.scale.set(cameraZoom);
      platformContainer.scale.set(cameraZoom);
      playfieldContainer.scale.set(cameraZoom);
      overlayContainer.scale.set(cameraZoom);
    } else {
      // Reset zoom when not in comet hole level
      if (cameraZoom !== 1.0) {
        cameraZoom += (1.0 - cameraZoom) * 0.015;
        backgroundContainer.scale.set(cameraZoom);
        groundContainer.scale.set(cameraZoom);
        platformContainer.scale.set(cameraZoom);
        playfieldContainer.scale.set(cameraZoom);
        overlayContainer.scale.set(cameraZoom);
      }
    }

    // Apply camera position with parallax
    // Background moves less (30% of camera movement) for depth effect
    // Foreground elements move at 100% camera speed
    backgroundContainer.position.y = cameraY * 0.3; // Sky parallax - moves slower
    overlayContainer.position.y = cameraY; // Gradient moves with ground
    groundContainer.position.y = cameraY;
    platformContainer.position.y = cameraY;
    playfieldContainer.position.y = cameraY; // Player and effects move with ground

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
        ball.position.y = state.y;
        ball.scale.set(state.scaleX, state.scaleY);
      }
      // During other intro phases, position is fully controlled by intro animation
    }
    // During other respawn states, ball stays frozen at manually set position (spawn X, above screen)

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
    } else if (enemyMode === 'hover') {
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
      stopSpawning: enemyMode === 'sleep' || scenarioStage === 'prep' || scenarioStage === 'charging' || scenarioStage === 'firing',
    });
    if (laserResult.scoreChange !== 0) {
      laserScore += laserResult.scoreChange;
      // Energy +2% per cleared laser
      energy = Math.min(100, energy + laserResult.scoreChange * 2);

      // Unlock shooting only at full energy
      if (energy >= 100 && !shootUnlocked) {
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
    if (laserResult.hitPosition) {
      // Enemy lasers = red sparks - reduce energy by 1.5% per hit
      energy = Math.max(0, energy - 1.5);
      sparkParticles.spawn(laserResult.hitPosition.x, laserResult.hitPosition.y, 'red');
      playerFlashUntil = performance.now() + 250;
      // Count hits dealt by red; every 20 hits = 1 out on blue
      redHits += 1;
      if (redHits >= HITS_PER_OUT) {
        const outsGained = Math.floor(redHits / HITS_PER_OUT);
        blueOuts = Math.min(10, blueOuts + outsGained);
        redHits = redHits % HITS_PER_OUT;
      }
      if (!firstOutMade && (blueOuts + redOuts) > 0 && scenarioButton) {
        firstOutMade = true;
        scenarioButton.disabled = false;
      }
      if (redOuts > 0 && !autoScenarioTriggered) {
        autoScenarioPending = true;
        autoScenarioTriggered = true;
      }
      updateEnergyUI();
      updateScoreUI();
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

    // Render minimap - capture scene at different zoom/position
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
    scene.scale.set(MINIMAP_ZOOM);
    scene.position.set(
      minimapCenterX - playerState.x * MINIMAP_ZOOM,
      minimapCenterY - playerState.y * MINIMAP_ZOOM
    );

    // Render scene to minimap texture
    app.renderer.render({
      container: scene,
      target: minimapRenderTexture,
    });

    // Restore original scene transform for main render
    scene.position.set(savedSceneX, savedSceneY);
    scene.scale.set(savedSceneScaleX, savedSceneScaleY);
  });
  ticker.start();

  const triggerJump = () => {
    // Disable input during intro
    if (playerIntroActive) return;

    const jumpExecuted = physics.startJump();
    if (jumpExecuted) {
      lastJumpTime = performance.now();

      // ALWAYS mark platforms above when jumping, unless firmly on baseline ground
      // This catches ALL cases: double jumps, rolling off platforms, falling and jumping
      // Even if activePlatformId is set, we might be in the process of rolling off
      if (!isOnBaselineGround) {
        const state = physics.getState();
        const playerRadius = physics.getRadius();
        const playerTop = state.y - playerRadius;

        const platformsAbove = platforms.getPlatformsAbovePlayer(playerTop);
        platformsAbove.forEach(platformId => {
          physics.markPlatformJumpedThrough(platformId);
        });
      }
    }
  };
  const releaseJump = () => {
    // Disable input during intro
    if (playerIntroActive) return;
    physics.endJump();
  };

  // Track mouse/pointer movement for horizontal player position
  const handlePointerMove = (event: PointerEvent) => {
    // Disable input during intro
    if (playerIntroActive) return;
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

  // Scoreboard (fades in when enemy rolls in) with hits/outs styled like original Jump
  const scoreContainer = document.createElement('div');
  scoreContainer.style.position = 'fixed';
  scoreContainer.style.top = '16px';
  scoreContainer.style.left = '12px';
  scoreContainer.style.right = '12px';
  scoreContainer.style.display = 'flex';
  scoreContainer.style.justifyContent = 'space-between';
  scoreContainer.style.pointerEvents = 'none';
  scoreContainer.style.opacity = '0';
  scoreContainer.style.transition = 'opacity 0.5s ease';
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

  scenarioButton = document.createElement('button');
  scenarioButton.className = 'transition-btn';
  scenarioButton.textContent = 'Run Mega Laser Scenario';
  scenarioButton.type = 'button';
  scenarioButton.style.top = '146px';
  scenarioButton.addEventListener('click', startScenario);
  scenarioButton.disabled = true; // enable after first out
  document.body.appendChild(scenarioButton);

  // Auto trigger scenario when pending (e.g., after first red out)
  ticker.add(() => {
    if (autoScenarioPending && !scenarioActive) {
      autoScenarioPending = false;
      startScenario();
    }
  });

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
    canShoot = true;
    shootUnlocked = true;
    console.log('[SHOOT UNLOCK] Unlocked via energy button');
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

  // Comet Hole Level button - now supports variable hole counts
  const startCometHoleLevel = (holeCount: number = 5) => {
    grounds.startHoleSequence(holeCount);
    cometHoleLevelActive = true;
    groundHoles.clear();
    processedSegments.clear();

    // Reset platform spawning state
    isFirstPlatformSpawned = false;
    lastPlatformX = ball.position.x;

    // Immediately spawn ground holes for ALL segments in the sequence (including off-screen ones)
    const segments = grounds.getSegments();
    const groundY = computePlayerGround() + 40;
    let firstHoleSegmentX = Infinity;

    segments.forEach((seg, idx) => {
      const segmentKey = `${idx}_${seg.type}`;
      processedSegments.add(segmentKey);

      if (seg.type === 'meteor_transition') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'meteor_transition');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned meteor_transition at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);
      } else if (seg.type === 'cloud_hole') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'full_hole');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned full_hole at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);
      } else if (seg.type === 'hole_transition_back') {
        groundHoles.spawnGroundHole(seg.x, seg.width, groundY, 'hole_transition_back');
        if (seg.x < firstHoleSegmentX) firstHoleSegmentX = seg.x;
        console.log(`[COMET HOLE LEVEL] Pre-spawned hole_transition_back at x=${seg.x.toFixed(0)} width=${seg.width.toFixed(0)}`);
      }
    });

    // Record the initial world X position of meteor_transition when first spawned
    // This is used as reference point for respawn scroll calculations
    if (firstHoleSegmentX !== Infinity) {
      spawnPointX = firstHoleSegmentX;
      // Update debug indicator position (keep hidden)
      spawnPointDebug.x = firstHoleSegmentX;
      spawnPointDebug.y = computePlayerGround();
      spawnPointDebug.visible = false; // Debug indicator disabled
      console.log(`[RESPAWN] Spawn point recorded at meteor_transition initial X=${spawnPointX.toFixed(0)}`);
    }

    console.log(`[COMET HOLE LEVEL] Started hole sequence with ${holeCount} holes - platforms will spawn dynamically over holes`);
  };

  const cometHoleLevelButton = document.createElement('button');
  cometHoleLevelButton.className = 'transition-btn';
  cometHoleLevelButton.textContent = 'Comet Hole Level (5)';
  cometHoleLevelButton.type = 'button';
  cometHoleLevelButton.style.top = '272px';
  cometHoleLevelButton.addEventListener('click', () => startCometHoleLevel(5));
  document.body.appendChild(cometHoleLevelButton);

  // Test button with 10 holes
  const cometHole10Button = document.createElement('button');
  cometHole10Button.className = 'transition-btn';
  cometHole10Button.textContent = 'Hole Level (10)';
  cometHole10Button.type = 'button';
  cometHole10Button.style.top = '314px';
  cometHole10Button.addEventListener('click', () => startCometHoleLevel(10));
  document.body.appendChild(cometHole10Button);

  // Test button with 2 holes
  const cometHole2Button = document.createElement('button');
  cometHole2Button.className = 'transition-btn';
  cometHole2Button.textContent = 'Hole Level (2)';
  cometHole2Button.type = 'button';
  cometHole2Button.style.top = '356px';
  cometHole2Button.addEventListener('click', () => startCometHoleLevel(2));
  document.body.appendChild(cometHole2Button);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
