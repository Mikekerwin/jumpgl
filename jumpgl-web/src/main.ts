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
import { calculateResponsiveSizes, GROUND_PLAYER_DEPTH, PLATFORM_LARGE_IMAGE_PATH, PLATFORM_SMALL_IMAGE_PATH, PLATFORM_VERTICAL_OFFSET } from './config';

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
  let platformSpawnType: 'large' | 'small' = 'large'; // Tracks which platform type to spawn next
  let activePlatformId: number | null = null;
  const PLATFORM_LANDING_OFFSET = 30; // Extra pixels to sink into platform at rest
  const PLATFORM_EDGE_TOLERANCE = 8; // Horizontal forgiveness so we don't drop too early
  let platformAscendBonus = 0; // Additional vertical offset for successive spawns after landings
  const PLATFORM_ASCEND_STEP = 40; // Pixels higher per qualifying landing
  const PLATFORM_ASCEND_MAX = Number.POSITIVE_INFINITY; // Cap climb bonus (effectively unlimited)
  const SMALL_PLATFORM_EXTRA = 100; // Extra height for small platforms (applied 50% of the time)
  const SMALL_PLATFORM_CHANCE = 0.5;
  let isOnBaselineGround = true; // Tracks when player is resting on main ground


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

  const groundSurface = () => grounds.getSurfaceY();
  const computePlayerGround = () => groundSurface() + playerDiameter * GROUND_PLAYER_DEPTH;

  // Create shadow (added before player so it appears behind)
  const playerShadow = new Shadow({ playerWidth: playerDiameter });
  playfieldContainer.addChild(playerShadow.getView());

  // Add jump dust sprite (before player so it appears behind player but in front of ground)
  playfieldContainer.addChild(jumpDustSprite);

  // Add charge particle sprite (same layer as jump dust)
  playfieldContainer.addChild(chargeSprite);

  const ball = new Graphics().circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });
  const initialGround = computePlayerGround();
  ball.position.set(app.renderer.width * 0.32, initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
    initialX: app.renderer.width * 0.32,
    screenWidth: app.renderer.width,
  });


  // Create enemy at 90% of screen width
  const enemyBall = new Graphics().circle(0, 0, playerRadius).fill({ color: 0xff0000 });
  const enemyX = app.renderer.width * 0.9;
  enemyBall.position.set(enemyX, initialGround - playerRadius);
  playfieldContainer.addChild(enemyBall);

  // Enemy systems
  const enemyPhysics = new EnemyPhysics({
    groundSurface: initialGround,
  });

  const enemyMovement = new EnemyMovement({
    initialY: initialGround - playerRadius,
  });

  // Start enemy in physics mode with jump sequence
  let enemyMode: 'physics' | 'hover' = 'physics';
  enemyPhysics.startJumpSequence();

  let dustRevealStartTime: number | null = null;
  const DUST_FADE_DURATION = 5000; // 5 seconds
  const TRANSITION_VISIBLE_THRESHOLD = 0.15; // Start dust when transition is ~15% visible

  // Jump dust tracking
  let wasGrounded = false;
  let previousVelocity = 0;

  // Camera tracking - locks to platform heights and follows player downward
  let cameraY = 0; // Current camera Y offset
  let cameraFloorY = Infinity; // The Y position the camera is locked to (follows player if they go below this)
  const CAMERA_LERP_SPEED = 0.15; // How quickly camera follows (faster for downward tracking)
  const CAMERA_FOLLOW_THRESHOLD = 20; // How far below floor before camera starts following down

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;

    // Get scroll speed multiplier from player position (0 = stopped, 1 = normal, 2 = double)
    const speedMultiplier = physics.getScrollSpeedMultiplier();

    backgrounds.update(deltaSeconds, speedMultiplier);
    grounds.update(deltaSeconds, speedMultiplier);
    dustField.update();

    // Update platforms with ground scroll speed (72 px/sec * speedMultiplier)
    const BASE_GROUND_SCROLL_SPEED = 72; // pixels per second (from parallaxNew.ts)
    const groundScrollSpeed = BASE_GROUND_SCROLL_SPEED * speedMultiplier;
    platforms.update(deltaSeconds, groundScrollSpeed, app.renderer.width);

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

    const state = physics.update(deltaSeconds);
    const verticalVelocity = (state.y - prevState.y) / deltaSeconds;

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

    // Check for platform collision
    const supportingPlatform = platforms.getSupportingPlatform(
      playerBounds,
      prevBounds,
      verticalVelocity
    );

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
      if (
        playerBounds.right < supportingPlatform.left - PLATFORM_EDGE_TOLERANCE ||
        playerBounds.left > supportingPlatform.right + PLATFORM_EDGE_TOLERANCE
      ) {
        // Player walked off the edge - clear platform override
        physics.clearSurfaceOverride();
        activePlatformId = null;
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

        // If we've drifted off the platform horizontally, drop the override so we can fall
        if (!stillOverPlatform) {
          physics.clearSurfaceOverride();
          activePlatformId = null;
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

    // Detect landing events for jump dust particles
    const isGrounded =
      isOnBaselineGround ||
      (supportingPlatform !== null && Math.abs(verticalVelocity) < 25);

    // Landing detection: was in air, now grounded, and was moving downward
    if (isGrounded && !wasGrounded && previousVelocity > 0) {
      // Spawn landing dust at player's feet
      const feetY = state.y + playerRadius;
      jumpDust.spawnLandingDust(state.x, feetY, previousVelocity);
    }

    // Update tracking variables
    wasGrounded = isGrounded;
    previousVelocity = Math.abs(verticalVelocity);

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

    // Update shadow position based on player and ground
    playerShadow.update(ball.position.x, ball.position.y, computePlayerGround());

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
      }
    } else {
      const enemyState = enemyMovement.update(deltaSeconds);
      enemyBall.position.y = enemyState.y;
      enemyBall.scale.set(enemyState.scaleX, enemyState.scaleY);
    }
  });
  ticker.start();

  const triggerJump = () => {
    const jumpStarted = physics.startJumpCharge();
    // Spawn jump dust on every successful jump (both first and double jump)
    if (jumpStarted) {
      const feetY = ball.position.y + playerRadius;
      jumpDust.spawnJumpDust(ball.position.x, feetY);
    }
  };
  const releaseJump = () => {
    physics.endJump();
    // DISABLED: Clear charge particles when jump is released
    // chargeParticles.clear();
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
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      releaseJump();
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

  const platformButton = document.createElement('button');
  platformButton.className = 'transition-btn';
  platformButton.textContent = 'Spawn Large Platform';
  platformButton.type = 'button';
  platformButton.style.top = '60px'; // Position below transition button
  platformButton.addEventListener('click', spawnPlatform);
  document.body.appendChild(platformButton);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
