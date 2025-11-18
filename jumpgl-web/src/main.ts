import './style.css';
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { PlayerPhysics } from './playerPhysics';
import { loadParallaxTextures, ParallaxBackgrounds, ParallaxGrounds } from './parallax';

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
  const starContainer = new Container();
  const groundContainer = new Container();
  const playfieldContainer = new Container();

  scene.addChild(backgroundContainer, starContainer, groundContainer, playfieldContainer);

  const parallaxTextures = await loadParallaxTextures();
  const backgrounds = new ParallaxBackgrounds(
    backgroundContainer,
    parallaxTextures,
    app.renderer.width,
    app.renderer.height
  );
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
  const groundCollisionOffset = 20;
  const playerRadius = 40;
  const ball = new Graphics().circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });
  const initialGround = groundSurface() + groundCollisionOffset;
  ball.position.set(app.renderer.width * 0.32, initialGround - playerRadius);
  playfieldContainer.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: initialGround,
  });

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;
    backgrounds.update(deltaSeconds);
    grounds.update(deltaSeconds);
    stars.forEach((star) => {
      star.view.y += star.speed * tickerInstance.deltaTime;
      if (star.view.y > app.renderer.height) {
        star.view.y = -5;
        star.view.x = Math.random() * app.renderer.width;
      }
    });

    const state = physics.update(deltaSeconds);
    ball.position.y = state.y;
    ball.scale.set(state.scaleX, state.scaleY);
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
    const updatedGround = groundSurface() + groundCollisionOffset;
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
