import { Application, Assets, ColorMatrixFilter, Container, Sprite, Texture } from 'pixi.js';
import { ForestDisplayTreeStream } from './forestDisplayTreeStream';
import type { StackingTreeManifest, TreeAttachmentManifest } from './forestTreeTypes';

type RuntimeWindow = Window & {
  advanceTime?: (ms: number) => void;
  render_game_to_text?: () => string;
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const init = async () => {
  const app = new Application();
  await app.init({ resizeTo: window, preference: 'webgl', antialias: false, resolution: Math.min(devicePixelRatio, 1.25), autoDensity: true, roundPixels: true, backgroundColor: 0x9bcfd4, preserveDrawingBuffer: true });
  byId<HTMLDivElement>('app').replaceChildren(app.canvas);
  const base = `${import.meta.env.BASE_URL}forest-sandbox/`;
  const [stack, attachments] = await Promise.all([
    fetch(`${base}assets/stacking-tree/manifest.json`).then((response) => response.json() as Promise<StackingTreeManifest>),
    fetch(`${base}assets/attachment-proof/manifest.json`).then((response) => response.json() as Promise<TreeAttachmentManifest>),
  ]);
  for (const record of [...stack.middles, ...stack.bases, ...stack.canopies, ...stack.decorations]) record.path = `${base}${record.path}`;
  for (const record of Object.values(attachments.attachments)) record.path = `${base}${record.path}`;
  const backgroundPath = `${base}assets/trees/background.jpg`;
  const distantGroundPath = `${base}assets/ground/generated/distant-ground-warm-deep.webp`;
  const branchNames = ['small-left-a', 'small-left-b', 'medium-right-straight-c', 'midlong-left-b', 'midlong-right-b', 'nub-right-a'];
  await Promise.all([
    Assets.load(backgroundPath),
    Assets.load(distantGroundPath),
    ...stack.middles.map((record) => Assets.load(record.path)),
    ...stack.bases.map((record) => Assets.load(record.path)),
    ...stack.decorations.map((record) => Assets.load(record.path)),
    ...branchNames.map((name) => Assets.load(attachments.attachments[name]!.path)),
  ]);

  const background = new Sprite(Texture.from(backgroundPath));
  const ground = new Sprite(Texture.from(distantGroundPath));
  const treeLayer = new Container();
  const filter = new ColorMatrixFilter();
  treeLayer.filters = [filter];
  app.stage.addChild(background, ground, treeLayer);
  byId<HTMLDivElement>('loading').remove();

  const bandInput = byId<HTMLSelectElement>('band');
  const seedInput = byId<HTMLInputElement>('seed');
  const sectionsInput = byId<HTMLInputElement>('sections');
  const scaleInput = byId<HTMLInputElement>('scale');
  const spacingInput = byId<HTMLInputElement>('spacing');
  const exposureInput = byId<HTMLInputElement>('exposure');
  const saturationInput = byId<HTMLInputElement>('saturation');
  const sunlightInput = byId<HTMLInputElement>('sunlight');
  const climbInput = byId<HTMLInputElement>('climb');
  const status = byId<HTMLDivElement>('status');
  let stream: ForestDisplayTreeStream | null = null;
  let climb = 0;
  let maximumClimb = 1;

  const fitBackdrop = () => {
    const scale = Math.max(app.screen.width / background.texture.width, app.screen.height / background.texture.height);
    background.scale.set(scale);
    background.position.set((app.screen.width - background.texture.width * scale) / 2, (app.screen.height - background.texture.height * scale) / 2);
    const groundScale = Math.max(1.05, app.screen.width / ground.texture.width);
    ground.scale.set(groundScale);
    ground.position.set(0, app.screen.height * 0.64);
  };

  const updateOutputs = () => {
    byId<HTMLOutputElement>('sections-output').value = sectionsInput.value;
    byId<HTMLOutputElement>('scale-output').value = Number(scaleInput.value).toFixed(2);
    byId<HTMLOutputElement>('spacing-output').value = spacingInput.value;
    byId<HTMLOutputElement>('exposure-output').value = Number(exposureInput.value).toFixed(2);
    byId<HTMLOutputElement>('saturation-output').value = Number(saturationInput.value).toFixed(2);
    byId<HTMLOutputElement>('sunlight-output').value = Number(sunlightInput.value).toFixed(2);
    byId<HTMLOutputElement>('climb-output').value = `${Math.round(climb / maximumClimb * 100)}%`;
  };

  const updateTreatment = () => {
    filter.reset();
    filter.saturate(Number(saturationInput.value) - 1, true);
    filter.brightness(Number(exposureInput.value) + Number(sunlightInput.value) * 0.22, true);
    updateOutputs();
  };

  const updateCamera = () => {
    const factor = bandInput.value === 'far' ? 0.28 : 0.38;
    treeLayer.y = climb * factor;
    ground.y = app.screen.height * 0.64 + climb * factor;
    stream?.updateVisibility(treeLayer.y, app.screen.height, app.screen.width);
    const state = stream?.getState();
    status.textContent = state
      ? `${state.plannedTrees} pooled trees · ${state.materializedModules}/${state.plannedModules} trunk sections materialized · ${state.culledModules} culled · ${state.drawnSprites} sprites drawn`
      : 'Building display trees…';
    climbInput.value = String(Math.round(climb));
    updateOutputs();
  };

  const build = () => {
    stream?.destroy();
    for (const child of [...treeLayer.children]) child.destroy({ children: true });
    const band = bandInput.value === 'far' ? 'far' : 'mid';
    const scale = Number(scaleInput.value);
    const sections = Number(sectionsInput.value);
    const totalHeight = (stack.layout.canopyHeight - stack.connector.height + sections * stack.layout.middleStep + stack.layout.baseHeight) * scale;
    maximumClimb = Math.max(1, totalHeight - app.screen.height * 0.76);
    climb = Math.min(climb, maximumClimb);
    climbInput.max = String(Math.round(maximumClimb));
    stream = new ForestDisplayTreeStream({
      parent: treeLayer,
      stack,
      attachments,
      seed: Math.max(1, Math.round(Number(seedInput.value) || 1)),
      middleCount: sections,
      scale,
      viewportWidth: app.screen.width,
      baseY: app.screen.height * 0.87,
      centerSpacing: Number(spacingInput.value),
      band,
      palette: band === 'far' ? { tint: 0xcbd1c5 } : { tint: 0xe3e1cc },
    });
    updateTreatment();
    updateCamera();
  };

  for (const input of [bandInput, seedInput, sectionsInput, scaleInput, spacingInput]) input.addEventListener('input', build);
  for (const input of [exposureInput, saturationInput, sunlightInput]) input.addEventListener('input', updateTreatment);
  climbInput.addEventListener('input', () => { climb = Number(climbInput.value); updateCamera(); });
  byId<HTMLButtonElement>('regenerate').addEventListener('click', build);
  byId<HTMLButtonElement>('random-seed').addEventListener('click', () => { seedInput.value = String(1 + Math.floor(Math.random() * 9_999_998)); build(); });
  window.addEventListener('wheel', (event) => { climb = Math.max(0, Math.min(maximumClimb, climb - event.deltaY * 1.2)); updateCamera(); }, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') climb = Math.min(maximumClimb, climb + 360);
    if (event.code === 'ArrowDown' || event.code === 'KeyS') climb = Math.max(0, climb - 360);
    if (event.code === 'KeyT') climb = maximumClimb;
    if (event.code === 'KeyG') climb = 0;
    updateCamera();
  });
  window.addEventListener('resize', () => { fitBackdrop(); build(); });

  const hud = byId<HTMLDivElement>('hud');
  const title = byId<HTMLElement>('hud-title');
  let offset: { x: number; y: number } | null = null;
  title.addEventListener('pointerdown', (event) => { offset = { x: event.clientX - hud.offsetLeft, y: event.clientY - hud.offsetTop }; title.setPointerCapture(event.pointerId); });
  title.addEventListener('pointermove', (event) => { if (offset) { hud.style.left = `${Math.max(0, event.clientX - offset.x)}px`; hud.style.top = `${Math.max(0, event.clientY - offset.y)}px`; } });
  title.addEventListener('pointerup', () => { offset = null; });

  (window as RuntimeWindow).advanceTime = () => updateCamera();
  (window as RuntimeWindow).render_game_to_text = () => JSON.stringify({
    mode: 'background-tree-builder',
    band: bandInput.value,
    seed: Number(seedInput.value),
    sections: Number(sectionsInput.value),
    scale: Number(scaleInput.value),
    spacing: Number(spacingInput.value),
    exposure: Number(exposureInput.value),
    saturation: Number(saturationInput.value),
    sunlight: Number(sunlightInput.value),
    climb: Math.round(climb),
    culling: stream?.getState() ?? null,
  });
  fitBackdrop();
  build();
};

void init();
