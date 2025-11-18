import './style.css';
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { PlayerPhysics } from './playerPhysics';

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

  const bg = new Graphics()
    .rect(0, 0, app.renderer.width, app.renderer.height)
    .fill({ color: 0x050b1d });
  scene.addChild(bg);

  const gradient = new Graphics()
    .rect(0, 0, app.renderer.width, app.renderer.height)
    .fill({ color: 0x0d1d45, alpha: 0.65 });
  scene.addChild(gradient);

  const stars = Array.from({ length: 80 }).map(() => {
    const dot = new Graphics()
      .circle(0, 0, Math.random() * 1.5 + 0.5)
      .fill({ color: 0xffffff, alpha: Math.random() * 0.7 + 0.3 });
    dot.position.set(Math.random() * app.renderer.width, Math.random() * app.renderer.height);
    scene.addChild(dot);
    return {
      view: dot,
      speed: Math.random() * 0.4 + 0.1,
    };
  });

  const groundSurface = () => app.renderer.height * 0.78;
  const ground = new Graphics()
    .rect(0, 0, app.renderer.width, 6)
    .fill({ color: 0x10233f, alpha: 0.8 });
  ground.position.y = groundSurface();
  scene.addChild(ground);

  const playerRadius = 40;
  const ball = new Graphics().circle(0, 0, playerRadius).fill({ color: 0x4fc3f7 });
  ball.position.set(app.renderer.width * 0.32, groundSurface() - playerRadius);
  scene.addChild(ball);

  const physics = new PlayerPhysics({
    radius: playerRadius,
    groundSurface: groundSurface(),
  });

  const ticker = new Ticker();
  ticker.add((tickerInstance) => {
    const deltaSeconds = tickerInstance.deltaMS / 1000;
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
    bg.width = gradient.width = app.renderer.width;
    bg.height = gradient.height = app.renderer.height;
    ground
      .clear()
      .rect(0, 0, app.renderer.width, 6)
      .fill({ color: 0x10233f, alpha: 0.8 });
    ground.position.y = groundSurface();
    physics.setGroundSurface(groundSurface());
    ball.position.x = app.renderer.width * 0.32;
  };

  window.addEventListener('resize', handleResize);
};

init().catch((err) => {
  console.error('Failed to bootstrap JumpGL preview', err);
});
