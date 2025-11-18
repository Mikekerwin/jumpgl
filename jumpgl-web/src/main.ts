import './style.css';
import { Application, Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { PlayerPhysics } from './playerPhysics';
import { loadParallaxTextures, ParallaxBackgrounds, ParallaxGrounds } from './parallax';
import { ForestDustField } from './forestDustField';
import { Shadow } from './shadow';

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
  const playfieldContainer = new Container();

  scene.addChild(backgroundContainer, overlayContainer, groundContainer, playfieldContainer);

  let starsActive = true;
  const parallaxTextures = await loadParallaxTextures();
  const backgrounds = new ParallaxBackgrounds(
    backgroundContainer,
    parallaxTextures,
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

  let gradientSprite = createGroundGradientSprite(app.renderer.width, app.renderer.height);
  overlayContainer.addChild(dustSprite);
  overlayContainer.addChild(gradientSprite);
  const grounds = new ParallaxGrounds(
    groundContainer,
    parallaxTextures,
    app.renderer.width,
    app.renderer.height
  );

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

  const groundSurface = () => grounds.getSurfaceY();
  const GROUND_PLAYER_DEPTH = 1.5;
  const playerRadius = 40;
  const playerHeight = playerRadius * 2;
  const computePlayerGround = () => groundSurface() + playerHeight * GROUND_PLAYER_DEPTH;

  // Create shadow (added before player so it appears behind)
  const playerShadow = new Shadow({ playerWidth: playerHeight });
  playfieldContainer.addChild(playerShadow.getView());

  const ball = new Graphics().circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });
  const initialGround = computePlayerGround();
  ball.position.set(app.renderer.width * 0.32, initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
  });

  let dustRevealStartTime: number | null = null;
  const DUST_FADE_DURATION = 5000; // 5 seconds
  const TRANSITION_VISIBLE_THRESHOLD = 0.15; // Start dust when transition is ~15% visible

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;
    backgrounds.update(deltaSeconds);
    grounds.update(deltaSeconds);
    dustField.update();

    // Start dust fade-in when transition background has entered the viewport
    const forestProgress = backgrounds.getForestRevealProgress();

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
    if (starsActive) {
      stars.forEach((star) => {
        star.view.y += star.speed * tickerInstance.deltaTime;
        if (star.view.y > app.renderer.height) {
          star.view.y = -5;
          star.view.x = Math.random() * app.renderer.width;
        }
      });
    }

    const state = physics.update(deltaSeconds);
    ball.position.y = state.y;
    ball.scale.set(state.scaleX, state.scaleY);

    // Update shadow position based on player and ground
    playerShadow.update(ball.position.x, ball.position.y, computePlayerGround());
  });
  ticker.start();

  const triggerJump = () => physics.startJumpCharge();
  window.addEventListener('pointerdown', triggerJump);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      triggerJump();
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
    overlayContainer.removeChild(gradientSprite);
    gradientSprite.destroy();
    gradientSprite = createGroundGradientSprite(app.renderer.width, app.renderer.height);
    overlayContainer.addChild(dustSprite);
    overlayContainer.addChild(gradientSprite);
    const updatedGround = computePlayerGround();
    physics.setGroundSurface(updatedGround);
    ball.position.x = app.renderer.width * 0.32;
    ball.position.y = updatedGround - playerRadius;
  };

  window.addEventListener('resize', handleResize);

  const triggerTransition = () => {
    backgrounds.triggerForestTransition();
    grounds.triggerForestTransition();
    transitionButton.disabled = true;
    transitionButton.textContent = 'Forest Active';
  };

  const transitionButton = document.createElement('button');
  transitionButton.className = 'transition-btn';
  transitionButton.textContent = 'Enter Forest';
  transitionButton.type = 'button';
  transitionButton.addEventListener('click', triggerTransition);
  document.body.appendChild(transitionButton);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
