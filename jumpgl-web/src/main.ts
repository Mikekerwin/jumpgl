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
  const playfieldContainer = new Container();

  scene.addChild(backgroundContainer, overlayContainer, groundContainer, platformContainer, playfieldContainer);

  let starsActive = true;
  const parallaxTextures = await loadParallaxTextures();

  const biomeManager = new BiomeSequenceManager('cloud');
  biomeManager.setSequence(['cloud', 'forest']);

  const backgrounds = new ParallaxBackgrounds(
    backgroundContainer,
    parallaxTextures,
    biomeManager,
    app.renderer.width,
    app.renderer.height,
    () => {
      starsActive = false;
      starContainer.visible = false;
    }
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


  const stars = Array.from({ length: 80 }).map(() => {
    const dot = new Graphics()
      .circle(0, 0, Math.random() * 1.5 + 0.5)
      .fill({ color: 0xffffff, alpha: Math.random() * 0.7 + 0.3 });
    dot.position.set(Math.random() * app.renderer.width, Math.random() * app.renderer.height);
    starContainer.addChild(dot);
    return {
      view: dot,
      speed: Math.random() * 0.4 + 0.1,
    };
  });

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

  const ball = new Graphics().circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });
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
  const enemyBall = new Graphics().circle(0, 0, playerRadius).fill({ color: 0xff0000 });
  const enemyX = app.renderer.width * 0.9;
  enemyBall.position.set(enemyX, initialGround - playerRadius);
  playfieldContainer.addChild(enemyBall);

  // Lasers render above players
  playfieldContainer.addChild(laserContainer);

  // Holes render above the player so the player can sink beneath them
  playfieldContainer.addChild(holeContainer);
  playfieldContainer.addChild(sparkSprite);
  playfieldContainer.addChild(megaLaserGraphic);
  playfieldContainer.addChild(enemyChargeSprite);

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

  // Laser visuals - simple color lines
  const beamHeight = LASER_HEIGHT;
  const beamTexture = Texture.WHITE;
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

    // Update enemy charge particles
    enemyChargeParticles.update(deltaSeconds, scenarioStage === 'charging'
      ? Math.min(1, (performance.now() - megaLaserStart) / MEGA_LASER_CHARGE)
      : scenarioStage === 'prep' ? 0.25 : 0);
    enemyChargeCtx.clearRect(0, 0, enemyChargeCanvas.width, enemyChargeCanvas.height);
    enemyChargeCtx.save();
    enemyChargeCtx.translate(enemyBall.position.x, enemyBall.position.y);
    enemyChargeParticles.render(enemyChargeCtx, enemyChargeCanvas.width, enemyChargeCanvas.height);
    enemyChargeCtx.restore();
    enemyChargeTexture.source.update();

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

    // Render lasers using pooled sprites with flat color
    const lasers = laserPhysics.getLasers();
    while (laserSprites.length < lasers.length) {
      const sprite = new Sprite(beamTexture);
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
      sprite.texture = beamTexture;
      sprite.width = laser.width;
      sprite.height = beamHeight;
      sprite.tint = 0xff4040; // enemy laser red
      sprite.position.set(laser.x, laser.y);
    }

    if (starsActive) {
      stars.forEach((star) => {
        star.view.y += star.speed * tickerInstance.deltaTime;
        if (star.view.y > app.renderer.height) {
          star.view.y = -5;
          star.view.x = Math.random() * app.renderer.width;
        }
      });
    }

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
    }
    if (laserResult.laserFired && laserResult.targetY !== null) {
      enemyMovement.setTarget(laserResult.targetY);
    }
    if (laserResult.hitPosition) {
      // Enemy lasers = red sparks
      sparkParticles.spawn(laserResult.hitPosition.x, laserResult.hitPosition.y, 'red');
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
    // Resize jump dust canvas
    jumpDustCanvas.width = app.renderer.width;
    jumpDustCanvas.height = app.renderer.height;
    jumpDustTexture.source.update();
    // Resize charge particle canvas
    chargeCanvas.width = app.renderer.width;
    chargeCanvas.height = app.renderer.height;
    chargeTexture.source.update();
    overlayContainer.removeChild(gradientSprite);
    gradientSprite.destroy();
    gradientSprite = createGroundGradientSprite(app.renderer.width, app.renderer.height);
    overlayContainer.addChild(dustSprite);
    overlayContainer.addChild(gradientSprite);

    // Recalculate responsive sizes based on new height
    sizes = calculateResponsiveSizes(app.renderer.height);
    playerRadius = sizes.playerRadius;
    playerDiameter = sizes.playerDiameter;

    // Redraw ball with new radius
    ball.clear();
    ball.circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });

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
    enemyBall.clear();
    enemyBall.circle(0, 0, playerRadius).fill({ color: 0xff0000 });
    enemyPhysics.setGroundSurface(updatedGround);
    enemyBall.position.x = app.renderer.width * 0.9;

    laserPhysics.updateDimensions(app.renderer.width, app.renderer.height, updatedGround - playerRadius, enemyBall.position.x);
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
  platformButton.style.top = '60px'; // Position below transition button
  platformButton.addEventListener('click', spawnPlatform);
  document.body.appendChild(platformButton);

  const platformHoleButton = document.createElement('button');
  platformHoleButton.className = 'transition-btn';
  platformHoleButton.textContent = 'Spawn Small Platform + Hole';
  platformHoleButton.type = 'button';
  platformHoleButton.style.top = '100px'; // Stack below the regular platform button
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
  scenarioButton.style.top = '140px';
  scenarioButton.addEventListener('click', startScenario);
  document.body.appendChild(scenarioButton);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
