import { Application, Assets, BlurFilter, Container, CullerPlugin, extensions, Graphics, MeshPlane, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { ForestDisplayTreeStream } from './forestDisplayTreeStream';
import { ForestTreeStream } from './forestTreeStream';
import type {
  ForestBranchSurface,
  StackingTreeManifest,
  TreeAttachmentManifest,
} from './forestTreeTypes';
import { getPlayerJumpReach, PlayerPhysics } from './playerPhysics';
import { Shadow } from './shadow';

type AssetRecord = { path: string; width: number; height: number };
type AssetManifest = Record<string, AssetRecord[]>;
type BackgroundTreeFamilyManifest = {
  status: string;
  families: Record<string, StackingTreeManifest>;
};
type MasterTreeManifest = {
  source: string;
  sourceSize?: { width: number; height: number };
  runtimeSize?: { width: number; height: number };
  designPixelsPerUnit?: { x: number; y: number };
  assets: {
    canopy: AssetRecord;
    middle: AssetRecord;
    base: AssetRecord;
    connector: AssetRecord;
  };
  layout: {
    firstMiddleY: number;
    middleStep: number;
    baseYForOneMiddle: number;
    connectorCenterOffset: number;
    minimumMiddleCount: number;
  };
};
const DEFAULT_LAYER_SPEEDS = {
  'far-background': 0.12,
  'canopy-sky': 0.33,
  'mid-background': 0.3,
  'rare-complete-mid': 0.38,
  'rear-ground': 0.34,
  foreground: 1,
  ground: 1,
} as const;
type LayerBand = keyof typeof DEFAULT_LAYER_SPEEDS;
type ScrollingItem = {
  view: Container;
  speed: number;
  width: number;
  band: LayerBand;
  centered: boolean;
  recycleGap: [number, number];
};
type FallingLeaf = {
  view: Sprite;
  depth: 'rear' | 'near';
  sourceWidth: number;
  distributionIndex: number;
  distributionCount: number;
  x: number;
  y: number;
  age: number;
  fallSpeed: number;
  driftSpeed: number;
  swaySpeed: number;
  swayAmount: number;
  spinSpeed: number;
  spinImpulse: number;
  wakeVelocityX: number;
  flutterSpeed: number;
  phase: number;
  baseScale: number;
};
type CanopyBurstLeaf = {
  view: Sprite;
  depth: 'rear' | 'near';
  kind: 'canopy' | 'decoration';
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  spinSpeed: number;
  baseScale: number;
  age: number;
};
type AnimatedLightRay = {
  view: Container;
  hardView: Graphics;
  bokehView: Container;
  depth: 'rear' | 'player';
  worldX: number;
  renderedWidth: number;
  topWidth: number;
  bottomWidth: number;
  diagonalTravel: number;
  topY: number;
  height: number;
  maskPhase: number;
  orbs: Array<{
    view: Sprite;
    baseX: number;
    baseY: number;
    offsetX: number;
    offsetY: number;
    velocityX: number;
    velocityY: number;
    phase: number;
    driftSpeed: number;
    driftAmount: number;
    baseAlpha: number;
    fadeSpeed: number;
    crisp: boolean;
  }>;
  bands: Array<{
    view: Graphics;
    phase: number;
    amount: number;
    speed: number;
  }>;
};
type AnimatedAccentRay = {
  softView: Graphics;
  hardView: Graphics;
  worldX: number;
  renderedWidth: number;
  maskPhase: number;
};
type AssetFilenameLabel = {
  view: Container;
  pointer: Graphics;
  background: Graphics;
  text: Text;
  filename: string;
};

const rng = (() => {
  let state = 0x5f3759df;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
})();

const leafRng = (() => {
  let state = 0x1eaf2026;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 0xffffffff;
  };
})();

const choose = <T>(items: T[]): T => items[Math.floor(rng() * items.length)]!;
const POOL_WIDTH_MULTIPLIER = 1.45;
const BACKGROUND_VERTICAL_OVERSCAN = 260;
const FAR_BACKDROP_LIFT = 289;
const CANOPY_SKY_EXTRA_HEIGHT = 100;
const VERTICAL_PARALLAX = {
  far: 0.035,
  rear: 0.28,
  world: 1,
} as const;
const PARALLAX_EASE_DELAY = 70;
const PARALLAX_EASE_DISTANCE = 280;
const PARALLAX_EASE_STRENGTH = 0.55;
const ACCENT_MASK_FEATHER_PX = 260;
const LIGHT_FILTER_OVERSCAN_PX = ACCENT_MASK_FEATHER_PX + 80;
const LIGHT_RAY_SPAWN_MARGIN = 420;
const LIGHT_RAY_MIN_GAP = 720;

const easedParallaxOffset = (distance: number, targetFactor: number) => {
  const initialFactor = targetFactor + (1 - targetFactor) * PARALLAX_EASE_STRENGTH;
  if (distance <= PARALLAX_EASE_DELAY) return distance * initialFactor;
  const transitionEnd = PARALLAX_EASE_DELAY + PARALLAX_EASE_DISTANCE;
  if (distance >= transitionEnd) {
    const transitionIntegral = PARALLAX_EASE_DISTANCE * (initialFactor * 0.5 + targetFactor * 0.5);
    return PARALLAX_EASE_DELAY * initialFactor
      + transitionIntegral
      + (distance - transitionEnd) * targetFactor;
  }
  const progress = (distance - PARALLAX_EASE_DELAY) / PARALLAX_EASE_DISTANCE;
  const smoothstepIntegral = progress ** 3 - 0.5 * progress ** 4;
  return PARALLAX_EASE_DELAY * initialFactor + PARALLAX_EASE_DISTANCE * (
    initialFactor * progress + (targetFactor - initialFactor) * smoothstepIntegral
  );
};

const init = async () => {
  const searchParams = new URLSearchParams(window.location.search);
  const captureMode = searchParams.get('capture') === '1';
  let showAssetFilenames = searchParams.get('labels') === '1';
  const initialMiddleSections = 24;
  const requestedGroundStyle = searchParams.get('ground');
  const initialGroundStyle: 'stone' | 'moss' | 'original' = requestedGroundStyle === 'moss'
    || requestedGroundStyle === 'original'
    ? requestedGroundStyle
    : requestedGroundStyle === 'stone'
      ? 'stone'
      : 'moss';
  extensions.add(CullerPlugin);
  const app = new Application();
  await app.init({
    resizeTo: window,
    preference: 'webgl',
    powerPreference: 'high-performance',
    antialias: false,
    preserveDrawingBuffer: captureMode,
    backgroundColor: 0x8ed3eb,
    resolution: Math.min(window.devicePixelRatio, 1.25),
    autoDensity: true,
    roundPixels: true,
    culler: { updateTransform: true },
  });

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) throw new Error('Missing #app');
  mount.replaceChildren(app.canvas);

  const sandboxBase = `${import.meta.env.BASE_URL}forest-sandbox/`;
  const [
    manifest,
    masterTreeManifest,
    stackingTreeManifest,
    attachmentManifest,
    backgroundTreeFamilyManifest,
  ] = await Promise.all([
    fetch(`${sandboxBase}manifest.json`).then((response) => response.json() as Promise<AssetManifest>),
    fetch(`${sandboxBase}assets/master-tree/manifest.json`).then(
      (response) => response.json() as Promise<MasterTreeManifest>,
    ),
    fetch(`${sandboxBase}assets/stacking-tree/manifest.json`).then(
      (response) => response.json() as Promise<StackingTreeManifest>,
    ),
    fetch(`${sandboxBase}assets/attachment-proof/manifest.json`).then(
      (response) => response.json() as Promise<TreeAttachmentManifest>,
    ),
    fetch(`${sandboxBase}assets/background-tree-families/manifest.json`).then(
      (response) => response.json() as Promise<BackgroundTreeFamilyManifest>,
    ),
  ]);
  const midBackgroundTreeManifest = backgroundTreeFamilyManifest.families['mid-cool-broad']!;
  const farBackgroundTreeManifest = backgroundTreeFamilyManifest.families['far-cool-slender']!;
  const groundPathSuffix = (style: 'stone' | 'moss' | 'original') => style === 'stone'
    ? 'ground-path-stone.webp'
    : style === 'moss'
      ? 'ground-path-moss.webp'
      : 'ground2.webp';
  const initialGroundRecord = manifest.ground!.find(
    (record) => record.path.endsWith(groundPathSuffix(initialGroundStyle)),
  ) ?? manifest.ground![0]!;
  const standardSceneRecords = [
    ...manifest.background!,
    ...manifest.distantGround!,
    ...(manifest.distantGroundDetails ?? []),
    ...(manifest.fallingLeaves ?? []),
    initialGroundRecord,
  ];
  const standardAssetPaths = standardSceneRecords.map((record) => `${sandboxBase}${record.path}`);
  const legacyStandardAssetPaths = [
    ...manifest.base!,
    ...manifest.trunk!,
    ...manifest.canopy!,
    ...manifest.platform!,
    ...manifest.detail!,
  ].map((record) => `${sandboxBase}${record.path}`);
  const masterTreeAssetPaths = Object.values(masterTreeManifest.assets).map(
    (record) => `${sandboxBase}${record.path}`,
  );
  const stackingTreeAssetPaths = [
    ...stackingTreeManifest.middles,
    ...stackingTreeManifest.bases,
    ...stackingTreeManifest.decorations,
  ].map((record) => `${sandboxBase}${record.path}`);
  const hollowOverlayAssetPaths = stackingTreeManifest.middles.flatMap((record) => (
    record.hideHole ? [`${sandboxBase}${record.hideHole.overlayPath}`] : []
  ));
  const backgroundTreeAssetRecords = [
    ...midBackgroundTreeManifest.middles,
    ...midBackgroundTreeManifest.bases,
    ...midBackgroundTreeManifest.decorations,
    ...farBackgroundTreeManifest.middles,
    ...farBackgroundTreeManifest.bases,
    ...farBackgroundTreeManifest.decorations,
  ];
  const backgroundTreeAssetPaths = backgroundTreeAssetRecords.map(
    (record) => `${sandboxBase}${record.path}`,
  );
  const proceduralCanopyAssetPaths = [
    ...stackingTreeManifest.canopies,
    ...midBackgroundTreeManifest.canopies,
    ...farBackgroundTreeManifest.canopies,
  ].map(
    (record) => `${sandboxBase}${record.path}`,
  );
  const canopySkyPath = `${sandboxBase}assets/canopy/sky-canopy-panorama.webp`;
  const proceduralBranchNames = [
    'nub-right-a',
    'nub-right-b',
    'small-left-a',
    'small-left-b',
    'medium-right-a',
    'medium-right-straight-c',
    'midlong-left-b',
    'midlong-right-b',
    'long-right-a',
    'long-left-a',
  ];
  const proceduralBranchPaths = proceduralBranchNames.map(
    (name) => `${sandboxBase}${attachmentManifest.attachments[name]!.path}`,
  );
  const characterFramePaths = Array.from(
    { length: 17 },
    (_, index) => `${import.meta.env.BASE_URL}CharacterRun/run_${index}.webp`,
  );
  const assetPaths = [...new Set([
    ...standardAssetPaths,
    ...stackingTreeAssetPaths,
    ...hollowOverlayAssetPaths,
    ...backgroundTreeAssetPaths,
    ...proceduralCanopyAssetPaths,
    canopySkyPath,
    ...proceduralBranchPaths,
    ...characterFramePaths,
  ])];
  for (const records of Object.values(manifest)) {
    for (const record of records) record.path = `${sandboxBase}${record.path}`;
  }
  for (const record of Object.values(masterTreeManifest.assets)) {
    record.path = `${sandboxBase}${record.path}`;
  }
  for (const record of [
    ...stackingTreeManifest.middles,
    ...stackingTreeManifest.bases,
    ...stackingTreeManifest.canopies,
    ...stackingTreeManifest.decorations,
  ]) {
    record.path = `${sandboxBase}${record.path}`;
    if (record.hideHole) {
      record.hideHole.overlayPath = `${sandboxBase}${record.hideHole.overlayPath}`;
    }
  }
  for (const stack of [midBackgroundTreeManifest, farBackgroundTreeManifest]) {
    stack.connector.path = `${sandboxBase}${stack.connector.path}`;
    for (const record of [
      ...stack.middles,
      ...stack.bases,
      ...stack.canopies,
      ...stack.decorations,
    ]) {
      record.path = `${sandboxBase}${record.path}`;
    }
  }
  for (const record of Object.values(attachmentManifest.attachments)) {
    record.path = `${sandboxBase}${record.path}`;
  }
  const loadedRuntimePaths = new Set<string>();
  const assetFilenameByTextureSourceUid = new Map<number, string>();
  const filenameFromPath = (path: string) => {
    const cleanPath = path.split(/[?#]/, 1)[0] ?? path;
    const encodedFilename = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);
    try {
      return decodeURIComponent(encodedFilename);
    } catch {
      return encodedFilename;
    }
  };
  const assetTexture = (path: string) => {
    const result = Texture.from(path);
    result.label = path;
    return result;
  };
  const loadRuntimePaths = async (paths: string[]) => {
    const unloaded = [...new Set(paths)].filter((path) => !loadedRuntimePaths.has(path));
    await Promise.all(unloaded.map((path) => Assets.load(path)));
    for (const path of unloaded) {
      loadedRuntimePaths.add(path);
      assetFilenameByTextureSourceUid.set(assetTexture(path).source.uid, filenameFromPath(path));
    }
  };
  await loadRuntimePaths(assetPaths);

  const loading = document.querySelector<HTMLDivElement>('#loading');
  loading?.remove();
  const status = document.querySelector<HTMLDivElement>('#status');
  const cullingStatus = document.querySelector<HTMLDivElement>('#culling-status');
  let proceduralCanopiesLoaded = true;
  let canopyLoadPromise: Promise<void> | null = null;
  const updateTextureStatus = (note = '') => {
    if (!status) return;
    const loadedCount = loadedRuntimePaths.size;
    status.textContent = `${loadedCount} textures loaded · WebGL · pooled/recycled sprites${note}`;
  };
  updateTextureStatus();

  const scene = new Container();
  const farLayer = new Container();
  const canopySkyLayer = new Container();
  const rearLayer = new Container();
  const rearLightLayer = new Container();
  const distantGroundLayer = new Container();
  const rearTreeLayer = new Container();
  const rearLeafLayer = new Container();
  const groundLayer = new Container();
  const nearLeafLayer = new Container();
  const foregroundLayer = new Container();
  const frontLightLayer = new Container();
  scene.addChild(
    farLayer,
    canopySkyLayer,
    rearLayer,
    rearLightLayer,
    distantGroundLayer,
    rearTreeLayer,
    rearLeafLayer,
    groundLayer,
    foregroundLayer,
    frontLightLayer,
  );
  // Foreground leaves must share the playable-tree transform. Adding their
  // container as the final child of foregroundLayer puts only those particles
  // in front of trunks without applying the camera transform twice.
  foregroundLayer.addChild(nearLeafLayer);
  scene.cullable = true;
  scene.zIndex = 0;
  app.stage.sortableChildren = true;
  app.stage.addChild(scene);
  const playerLightLayer = frontLightLayer;
  const rearLightRayContainer = new Container();
  const rearHardRayContainer = new Container();
  const rearLightOrbContainer = new Container();
  const rearLightMask = new Graphics();
  rearLightRayContainer.mask = rearLightMask;
  rearHardRayContainer.mask = rearLightMask;
  rearLightOrbContainer.mask = rearLightMask;
  rearLightRayContainer.blendMode = 'screen';
  rearLightRayContainer.filters = [new BlurFilter({ strengthX: 12, strengthY: 7, quality: 2 })];
  rearHardRayContainer.blendMode = 'screen';
  rearLightOrbContainer.blendMode = 'screen';
  rearLightLayer.addChild(rearLightRayContainer, rearHardRayContainer, rearLightOrbContainer, rearLightMask);
  const playerLightRayContainer = new Container();
  const playerHardRayContainer = new Container();
  const playerLightOrbContainer = new Container();
  const playerLightMask = new Graphics();
  playerLightRayContainer.mask = playerLightMask;
  playerHardRayContainer.mask = playerLightMask;
  playerLightOrbContainer.mask = playerLightMask;
  playerLightRayContainer.blendMode = 'screen';
  playerLightRayContainer.filters = [new BlurFilter({ strengthX: 16, strengthY: 9, quality: 2 })];
  playerHardRayContainer.blendMode = 'screen';
  playerLightOrbContainer.blendMode = 'screen';
  playerLightLayer.addChild(playerLightRayContainer, playerHardRayContainer, playerLightOrbContainer, playerLightMask);
  const playerAccentSoftContainer = new Container();
  const playerAccentSoftMask = new Graphics();
  playerAccentSoftContainer.mask = playerAccentSoftMask;
  playerAccentSoftContainer.blendMode = 'screen';
  playerAccentSoftContainer.filters = [new BlurFilter({ strengthX: 10, strengthY: 6, quality: 2 })];
  const playerAccentSoftSegmentContainer = new Container();
  const playerAccentSoftSegmentMask = new Sprite(Texture.EMPTY);
  playerAccentSoftSegmentContainer.mask = playerAccentSoftSegmentMask;
  playerAccentSoftContainer.addChild(playerAccentSoftSegmentContainer, playerAccentSoftSegmentMask);
  const playerAccentHardCanopyContainer = new Container();
  const playerAccentHardCanopyMask = new Graphics();
  playerAccentHardCanopyContainer.mask = playerAccentHardCanopyMask;
  playerAccentHardCanopyContainer.blendMode = 'screen';
  const playerAccentHardSegmentContainer = new Container();
  const playerAccentSegmentMask = new Sprite(Texture.EMPTY);
  playerAccentHardSegmentContainer.mask = playerAccentSegmentMask;
  playerAccentHardCanopyContainer.addChild(playerAccentHardSegmentContainer, playerAccentSegmentMask);
  playerLightLayer.addChild(
    playerAccentSoftContainer,
    playerAccentSoftMask,
    playerAccentHardCanopyContainer,
    playerAccentHardCanopyMask,
  );
  const PLAYER_RADIUS = 27;
  const CHARACTER_FRAME_SIZE = 200;
  const CHARACTER_HEIGHT = 112;
  const characterTextures = characterFramePaths.map((path) => assetTexture(path));
  const playerShadow = new Shadow({ playerWidth: PLAYER_RADIUS * 2, maxBlur: 11, minOpacity: 0.14 });
  const ball = new Graphics().circle(0, 0, PLAYER_RADIUS).fill({ color: 0x4fc3f7 });
  ball.visible = false;
  const characterSprite = new Sprite(characterTextures[0] ?? Texture.EMPTY);
  characterSprite.anchor.set(0.5, 1);
  characterSprite.cullable = false;
  characterSprite.zIndex = 100;
  ball.zIndex = 100;
  playerShadow.getView().zIndex = 90;
  const characterBaseScale = CHARACTER_HEIGHT / CHARACTER_FRAME_SIZE;
  const hollowArtRecord = stackingTreeManifest.middles.find((record) => record.hideHole);
  const hideHoleOverlay = new Sprite(
    hollowArtRecord?.hideHole ? assetTexture(hollowArtRecord.hideHole.overlayPath) : Texture.EMPTY,
  );
  hideHoleOverlay.visible = false;
  hideHoleOverlay.cullable = false;
  const hideCharacterSprite = new Sprite(characterTextures[0] ?? Texture.EMPTY);
  hideCharacterSprite.anchor.set(0.5, 1);
  hideCharacterSprite.visible = false;
  const hideBall = new Graphics().circle(0, 0, PLAYER_RADIUS).fill({ color: 0x4fc3f7 });
  hideBall.visible = false;
  const hideCompositeLayer = new Container();
  hideCompositeLayer.zIndex = 110;
  hideCompositeLayer.cullable = false;
  // Painter's-order occlusion: the active player is drawn first, then the
  // hand-authored bark PNG is drawn directly in front of it.
  hideCompositeLayer.addChild(hideBall, hideCharacterSprite, hideHoleOverlay);
  const hitboxOverlay = new Graphics();
  hitboxOverlay.zIndex = 120;
  app.stage.addChild(playerShadow.getView(), ball, characterSprite, hideCompositeLayer, hitboxOverlay);

  const assetFilenameLayer = new Container();
  assetFilenameLayer.zIndex = 1000;
  assetFilenameLayer.cullable = false;
  assetFilenameLayer.eventMode = 'none';
  app.stage.addChild(assetFilenameLayer);
  const assetFilenameLabelPool: AssetFilenameLabel[] = [];
  let visibleAssetFilenameCount = 0;
  let visibleAssetFilenames: string[] = [];
  const isTransientEffectFilename = (filename: string) => {
    const basename = filename.replace(/\.[^.]+$/, '');
    return /^leaf-[a-z0-9-]+$/i.test(basename)
      || /(?:^|[-_])(?:light|lighting|ray|rays|bokeh|orb|spark|mote|motes)(?:[-_]|$)/i.test(basename);
  };
  const createAssetFilenameLabel = () => {
    const view = new Container();
    const pointer = new Graphics();
    const background = new Graphics();
    const text = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x071b18, width: 3 },
      },
    });
    text.position.set(6, 3);
    view.addChild(pointer, background, text);
    assetFilenameLayer.addChild(view);
    const label = { view, pointer, background, text, filename: '' };
    assetFilenameLabelPool.push(label);
    return label;
  };
  const updateAssetFilenameLabels = () => {
    assetFilenameLayer.visible = showAssetFilenames;
    visibleAssetFilenameCount = 0;
    visibleAssetFilenames = [];
    if (!showAssetFilenames) {
      for (const label of assetFilenameLabelPool) label.view.visible = false;
      return;
    }

    const candidates: Array<{
      target: Sprite | MeshPlane;
      filename: string;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }> = [];
    const visit = (container: Container, ancestorsVisible = true) => {
      const treeVisible = ancestorsVisible && container.visible && container.renderable;
      if (!treeVisible) return;
      if (container instanceof Sprite || container instanceof MeshPlane) {
        let filename = assetFilenameByTextureSourceUid.get(container.texture.source.uid);
        if (!filename) {
          const sourcePath = container.texture.source._sourceOrigin
            || container.texture.source.label
            || container.texture.label
            || '';
          const inferredFilename = filenameFromPath(sourcePath);
          if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(inferredFilename)) {
            filename = inferredFilename;
          }
        }
        if (filename && !isTransientEffectFilename(filename)) {
          const bounds = container.getBounds();
          if (
            Number.isFinite(bounds.minX)
            && Number.isFinite(bounds.minY)
            && bounds.maxX >= 0
            && bounds.minX <= window.innerWidth
            && bounds.maxY >= 0
            && bounds.minY <= window.innerHeight
          ) {
            candidates.push({
              target: container,
              filename,
              minX: bounds.minX,
              minY: bounds.minY,
              maxX: bounds.maxX,
              maxY: bounds.maxY,
            });
          }
        }
      }
      for (const child of container.children) visit(child, treeVisible);
    };
    visit(scene);
    candidates.sort((left, right) => left.minY - right.minY || left.minX - right.minX);

    const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const maximumLabels = 120;
    for (const candidate of candidates.slice(0, maximumLabels)) {
      const label = assetFilenameLabelPool[visibleAssetFilenameCount] ?? createAssetFilenameLabel();
      label.view.visible = true;
      if (label.filename !== candidate.filename) {
        label.filename = candidate.filename;
        label.text.text = candidate.filename;
        label.background.clear()
          .roundRect(0, 0, label.text.width + 12, label.text.height + 6, 5)
          .fill({ color: 0x071b18, alpha: 0.86 })
          .stroke({ color: 0xcdfbe6, alpha: 0.72, width: 1 });
      }
      const labelWidth = label.text.width + 12;
      const labelHeight = label.text.height + 6;
      const visibleLeft = Math.max(0, candidate.minX);
      const visibleRight = Math.min(window.innerWidth, candidate.maxX);
      const visibleTop = Math.max(0, candidate.minY);
      const visibleBottom = Math.min(window.innerHeight, candidate.maxY);
      let x = visibleRight + 7;
      if (x + labelWidth > window.innerWidth - 6) x = visibleLeft - labelWidth - 7;
      x = Math.max(6, Math.min(window.innerWidth - labelWidth - 6, x));
      let y = Math.max(6, Math.min(window.innerHeight - labelHeight - 6, visibleTop + 4));
      for (let attempt = 0; attempt < 12; attempt++) {
        const overlaps = occupied.some((box) => (
          x < box.right + 3
          && x + labelWidth > box.left - 3
          && y < box.bottom + 3
          && y + labelHeight > box.top - 3
        ));
        if (!overlaps) break;
        y += labelHeight + 4;
        if (y + labelHeight > window.innerHeight - 6) y = 6 + (attempt % 3) * (labelHeight + 4);
      }
      label.view.position.set(Math.round(x), Math.round(y));
      label.pointer.clear();
      const candidateWidth = visibleRight - visibleLeft;
      const candidateHeight = visibleBottom - visibleTop;
      if (candidateWidth < window.innerWidth * 0.78 || candidateHeight < window.innerHeight * 0.78) {
        const anchorX = Math.max(0, Math.min(window.innerWidth, visibleRight));
        const anchorY = Math.max(0, Math.min(window.innerHeight, (visibleTop + visibleBottom) * 0.5));
        label.pointer
          .moveTo(anchorX - x, anchorY - y)
          .lineTo(x > anchorX ? 0 : labelWidth, labelHeight * 0.5)
          .stroke({ color: 0xeafff6, alpha: 0.78, width: 1.5 });
      }
      occupied.push({ left: x, top: y, right: x + labelWidth, bottom: y + labelHeight });
      visibleAssetFilenameCount += 1;
      visibleAssetFilenames.push(candidate.filename);
    }
    for (let index = visibleAssetFilenameCount; index < assetFilenameLabelPool.length; index++) {
      assetFilenameLabelPool[index]!.view.visible = false;
    }
  };

  const atmosphere = new Graphics()
    .rect(0, 0, window.innerWidth, window.innerHeight)
    .fill({ color: 0xc9eff2, alpha: 0.2 });
  farLayer.addChild(atmosphere);
  const canopySkySprite = new Sprite(assetTexture(canopySkyPath));
  const canopySkyMask = new Graphics();
  canopySkySprite.visible = false;
  canopySkySprite.mask = canopySkyMask;
  canopySkyLayer.addChild(canopySkySprite, canopySkyMask);

  const items: ScrollingItem[] = [];
  const fallingLeaves: FallingLeaf[] = [];
  const canopyBurstLeaves: CanopyBurstLeaf[] = [];
  const animatedLightRays: AnimatedLightRay[] = [];
  let lightOrbTexture = Texture.EMPTY;
  let lightSparkTexture = Texture.EMPTY;
  let animatedAccentRay: AnimatedAccentRay | null = null;
  let playerAccentSegmentMaskTexture: Texture | null = null;
  let playerAccentSoftSegmentMaskTexture: Texture | null = null;
  let playerAccentMaskBaseX = 0;
  let playerAccentMaskBaseY = 0;
  let lightAnimationElapsed = 0;
  const layerSpeeds: Record<LayerBand, number> = { ...DEFAULT_LAYER_SPEEDS };
  let paused = false;
  let baseSpeed = 90;
  if (captureMode && searchParams.get('speed') !== null) {
    baseSpeed = Math.max(0, Number(searchParams.get('speed')) || 0);
  }
  let groundY = window.innerHeight * 0.82;
  let useMasterTree = true;
  let useProceduralTrees = true;
  let forestSeed = 20260805;
  let masterMiddleCount = initialMiddleSections;
  let masterTreeScale = 0.6;
  let groundStyle: 'stone' | 'moss' | 'original' = initialGroundStyle;
  let includeProceduralCanopies = true;
  let proceduralTreeStream: ForestTreeStream | null = null;
  let farDisplayTreeStream: ForestDisplayTreeStream | null = null;
  let midDisplayTreeStream: ForestDisplayTreeStream | null = null;
  let verticalClimb = 0;
  let maximumVerticalClimb = 1;
  let foregroundCanopyCutoffScreenY = 70;
  const playerInitialX = () => Math.max(180, window.innerWidth * 0.22);
  const playerGroundSurface = () => groundY - 8;
  const playerPhysics = new PlayerPhysics({
    radius: PLAYER_RADIUS,
    groundSurface: playerGroundSurface(),
    initialX: playerInitialX(),
    screenWidth: window.innerWidth,
  });
  playerPhysics.setHorizontalRange(
    Math.max(80, playerInitialX() - 48),
    Math.max(180, window.innerWidth - playerInitialX() - 48),
  );
  let currentPlayerState = playerPhysics.getState();
  let activeSurfaceId: string | null = null;
  let activeHideHoleId: string | null = null;
  let playerHideProgress = 0;
  let hideEntryOffsetX = 0;
  let hideEntryOffsetY = 0;
  let activeSurfaceTop = playerGroundSurface();
  let cameraRecenterTarget: number | null = null;
  let cameraRecenterEase = 7.2;
  let cameraGroundBounceLock = true;
  let lastCameraCenteredSurfaceId: string | null = null;
  let cameraTrackingMode: 'hold' | 'branch-center' | 'climb-edge' | 'fall-drift' | 'fall-catch' | 'ground-settle' = 'hold';
  let playerMovingLeft = false;
  let playerMovingRight = false;
  let showBranchHitboxes = false;
  let followPlayerCamera = true;
  let useBunnyCharacter = !(captureMode && searchParams.get('player') === 'ball');
  let characterFacing = 1;
  let characterFrame = 0;
  let characterFrameElapsed = 0;
  let characterIdleElapsed = 0;
  let characterIsMoving = false;
  let lastCharacterX = currentPlayerState.x;
  let visibleBranchSurfaceCount = 0;
  let worldScrollRemainder = 0;
  let canopySkyTravelPx = 0;
  let canopySkyOffsetX = 0;
  let canopySkyWasVisible = false;
  let groundLocalBounds: [number, number] = [0, 0];
  let distantGroundLocalBounds: [number, number] = [0, 0];
  const groundSpriteRecords = new WeakMap<Sprite, AssetRecord>();
  let groundTextureState: 'resident' | 'unloading' | 'unloaded' | 'loading' = 'resident';
  let groundTextureOperation = 0;
  let activeCanopyContactId: string | null = null;
  let canopyLeafBurstCount = 0;
  let canopyLeafBurstCooldown = 0;
  let decorationLeafDropCount = 0;
  let decorationLeafDropCooldown = 0;
  let activeDecorationContactIds = new Set<string>();
  let previousLeafWakePlayerX = currentPlayerState.x;

  const fallingLeafCeiling = () => {
    const canopyEdge = proceduralTreeStream?.getAverageCanopyCutoffY(
      foregroundLayer.y,
      window.innerWidth,
    ) ?? 0;
    return Math.max(0, Math.min(window.innerHeight - 55, canopyEdge + 18));
  };
  const leafLayerOffsetY = (leaf: FallingLeaf) => (
    leaf.depth === 'rear' ? rearLeafLayer.y : foregroundLayer.y
  );
  const resetFallingLeaf = (leaf: FallingLeaf, initial = false) => {
    const rear = leaf.depth === 'rear';
    const ceiling = fallingLeafCeiling();
    const horizontalSpan = window.innerWidth + 120;
    const laneWidth = horizontalSpan / Math.max(1, leaf.distributionCount);
    const laneCenter = (leaf.distributionIndex + 0.5) * laneWidth - 60;
    leaf.x = laneCenter + (leafRng() - 0.5) * laneWidth * 0.66;
    const verticalProgress = (
      leaf.distributionIndex * 0.61803398875 + leafRng() * 0.14
    ) % 1;
    const localCeiling = ceiling - leafLayerOffsetY(leaf);
    const localViewportBottom = window.innerHeight - leafLayerOffsetY(leaf);
    leaf.y = initial
      ? localCeiling + verticalProgress * Math.max(80, localViewportBottom - localCeiling + 35)
      : localCeiling + 2 + leafRng() * 12;
    leaf.age = leafRng() * 12;
    const baseFallSpeed = rear ? 18 + leafRng() * 24 : 34 + leafRng() * 34;
    leaf.fallSpeed = baseFallSpeed * 1.08;
    leaf.driftSpeed = -8 + leafRng() * 18;
    leaf.swaySpeed = 0.7 + leafRng() * 1.25;
    leaf.swayAmount = rear ? 12 + leafRng() * 17 : 20 + leafRng() * 24;
    leaf.spinSpeed = (-1.5 + leafRng() * 3) * (rear ? 0.62 : 1);
    leaf.spinImpulse = 0;
    leaf.wakeVelocityX = 0;
    leaf.flutterSpeed = 2.2 + leafRng() * 3.2;
    leaf.phase = leafRng() * Math.PI * 2;
    const targetWidth = rear ? 15 + leafRng() * 10.5 : 25.5 + leafRng() * 13.5;
    // Texture.from() can still be backed by its 1px placeholder on the first
    // frame. Use the manifest dimensions so an asynchronous texture upload
    // cannot blow the particle up to the source image's native size later.
    leaf.baseScale = targetWidth / Math.max(1, leaf.sourceWidth);
    leaf.view.position.set(leaf.x, leaf.y);
    leaf.view.rotation = leafRng() * Math.PI * 2;
  };
  const initializeFallingLeaves = () => {
    const leafRecords = manifest.fallingLeaves ?? [];
    if (leafRecords.length === 0) return;
    const leafCount = Math.max(6, Math.min(12, Math.round(window.innerWidth / 186)));
    for (let index = 0; index < leafCount; index++) {
      // Roughly a quarter of the reduced population passes in front of the
      // playable trunks; the remainder stays behind them.
      const depth: FallingLeaf['depth'] = index % 4 === 0 ? 'near' : 'rear';
      const record = leafRecords[index % leafRecords.length]!;
      const view = new Sprite(assetTexture(record.path));
      view.anchor.set(0.5);
      view.alpha = depth === 'rear' ? 0.72 : 0.9;
      const leaf: FallingLeaf = {
        view,
        depth,
        sourceWidth: record.width,
        distributionIndex: index,
        distributionCount: leafCount,
        x: 0,
        y: 0,
        age: 0,
        fallSpeed: 0,
        driftSpeed: 0,
        swaySpeed: 0,
        swayAmount: 0,
        spinSpeed: 0,
        spinImpulse: 0,
        wakeVelocityX: 0,
        flutterSpeed: 0,
        phase: 0,
        baseScale: 1,
      };
      resetFallingLeaf(leaf, true);
      (depth === 'rear' ? rearLeafLayer : nearLeafLayer).addChild(view);
      fallingLeaves.push(leaf);
    }
  };
  const updateFallingLeaves = (
    deltaSeconds: number,
    worldDistance: number,
  ) => {
    const ceiling = fallingLeafCeiling();
    const playerScreenY = currentPlayerState.y + foregroundLayer.y;
    const playerDeltaX = currentPlayerState.x - previousLeafWakePlayerX;
    const movementDirection = Math.sign(playerDeltaX)
      || Number(playerMovingRight) - Number(playerMovingLeft);
    const sweepLeft = Math.min(previousLeafWakePlayerX, currentPlayerState.x) - 38;
    const sweepRight = Math.max(previousLeafWakePlayerX, currentPlayerState.x) + 38;
    for (const leaf of fallingLeaves) {
      leaf.age += deltaSeconds;
      // Containers carry vertical camera travel. Leaves contribute only their
      // own falling motion, so foreground particles share the tree transform.
      leaf.y += leaf.fallSpeed * deltaSeconds;
      leaf.x += (
        leaf.driftSpeed
        + Math.sin(leaf.age * leaf.swaySpeed + leaf.phase) * leaf.swayAmount
      ) * deltaSeconds - worldDistance;
      if (leaf.x < -70) leaf.x = window.innerWidth + 70;
      if (leaf.x > window.innerWidth + 70) leaf.x = -70;
      const layerOffsetY = leafLayerOffsetY(leaf);
      const screenY = leaf.y + layerOffsetY;
      const deltaX = leaf.x - currentPlayerState.x;
      const deltaY = screenY - playerScreenY;
      const distance = Math.hypot(deltaX, deltaY);
      const crossedHorizontally = leaf.x >= sweepLeft && leaf.x <= sweepRight;
      const verticallyNear = Math.abs(deltaY) < 92;
      if (movementDirection !== 0 && (distance < 125 || (crossedHorizontally && verticallyNear))) {
        const influence = distance < 125 ? 1 - distance / 125 : 0.45;
        const cappedSpeedContribution = Math.min(18, Math.abs(playerDeltaX) * 1.25);
        leaf.wakeVelocityX += movementDirection * (46 + cappedSpeedContribution) * influence;
        leaf.wakeVelocityX = Math.max(-72, Math.min(72, leaf.wakeVelocityX));
        leaf.spinImpulse += movementDirection * (7 + Math.min(2, Math.abs(playerDeltaX) * 0.12)) * influence;
      }
      leaf.x += leaf.wakeVelocityX * deltaSeconds;
      leaf.wakeVelocityX *= Math.exp(-2.4 * deltaSeconds);
      leaf.spinImpulse *= Math.exp(-4.2 * deltaSeconds);
      if (screenY > window.innerHeight + 35) resetFallingLeaf(leaf);
      const flutter = 0.22 + Math.abs(Math.cos(
        leaf.age * leaf.flutterSpeed + leaf.phase,
      )) * 0.78;
      leaf.view.position.set(leaf.x, leaf.y);
      leaf.view.rotation += (leaf.spinSpeed + leaf.spinImpulse) * deltaSeconds;
      leaf.view.scale.set(leaf.baseScale, leaf.baseScale * flutter);
      leaf.view.visible = screenY >= ceiling && screenY <= window.innerHeight + 35;
    }
    previousLeafWakePlayerX = currentPlayerState.x;
  };
  const burstCanopyLeaves = (worldX: number, worldY: number) => {
    const leafRecords = manifest.fallingLeaves ?? [];
    for (let index = 0; index < Math.min(4, leafRecords.length); index++) {
      const record = leafRecords[(canopyLeafBurstCount * 3 + index) % leafRecords.length]!;
      const depth: CanopyBurstLeaf['depth'] = index === 0 ? 'rear' : 'near';
      const view = new Sprite(assetTexture(record.path));
      view.anchor.set(0.5);
      view.alpha = depth === 'rear' ? 0.76 : 0.94;
      const targetWidth = depth === 'rear' ? 17 + leafRng() * 7 : 24 + leafRng() * 10;
      const scale = targetWidth / Math.max(1, record.width);
      view.scale.set(scale);
      const spread = index - 1.5;
      const leaf: CanopyBurstLeaf = {
        view,
        depth,
        kind: 'canopy',
        x: worldX + spread * 13 + (leafRng() - 0.5) * 10,
        y: worldY - (depth === 'rear' ? rearLeafLayer.y : foregroundLayer.y)
          + (leafRng() - 0.5) * 10,
        velocityX: spread * 22 + (leafRng() - 0.5) * 16,
        velocityY: -18 - leafRng() * 30,
        spinSpeed: (leafRng() < 0.5 ? -1 : 1) * (4 + leafRng() * 6),
        baseScale: scale,
        age: 0,
      };
      (depth === 'rear' ? rearLeafLayer : nearLeafLayer).addChild(view);
      canopyBurstLeaves.push(leaf);
    }
    canopyLeafBurstCount += 1;
  };
  const dropDecorationLeaf = (screenX: number, screenY: number) => {
    const leafRecords = manifest.fallingLeaves ?? [];
    if (leafRecords.length === 0 || canopyBurstLeaves.some((leaf) => leaf.kind === 'decoration')) return;
    const record = leafRecords[leafRecords.length - 1]!;
    const view = new Sprite(assetTexture(record.path));
    view.anchor.set(0.5);
    view.alpha = 0.84;
    const scale = (7 + leafRng() * 2) / Math.max(1, record.width);
    view.scale.set(scale);
    const leaf: CanopyBurstLeaf = {
      view,
      depth: 'near',
      kind: 'decoration',
      x: screenX,
      y: screenY - foregroundLayer.y,
      velocityX: 0,
      velocityY: 24 + leafRng() * 8,
      spinSpeed: (leafRng() < 0.5 ? -1 : 1) * (1.2 + leafRng() * 1.4),
      baseScale: scale,
      age: 0,
    };
    nearLeafLayer.addChild(view);
    canopyBurstLeaves.push(leaf);
    decorationLeafDropCount += 1;
  };
  const updateCanopyBurstLeaves = (deltaSeconds: number, worldDistance: number) => {
    decorationLeafDropCooldown = Math.max(0, decorationLeafDropCooldown - deltaSeconds);
    for (let index = canopyBurstLeaves.length - 1; index >= 0; index--) {
      const leaf = canopyBurstLeaves[index]!;
      leaf.age += deltaSeconds;
      leaf.velocityY += 28 * deltaSeconds;
      leaf.x += leaf.velocityX * deltaSeconds - worldDistance;
      leaf.y += leaf.velocityY * deltaSeconds;
      leaf.velocityX *= Math.exp(-0.7 * deltaSeconds);
      leaf.view.position.set(leaf.x, leaf.y);
      leaf.view.rotation += leaf.spinSpeed * deltaSeconds;
      leaf.view.scale.set(leaf.baseScale);
      const layerY = leaf.depth === 'rear' ? rearLeafLayer.y : foregroundLayer.y;
      if (leaf.age > 8 || leaf.y + layerY > window.innerHeight + 70) {
        leaf.view.destroy();
        canopyBurstLeaves.splice(index, 1);
      }
    }
  };
  const updateLightMasks = () => {
    const ceiling = fallingLeafCeiling();
    const worldTop = -maximumVerticalClimb - 220;
    const worldBottom = window.innerHeight + 220;
    const worldHeight = worldBottom - worldTop;
    // These masks are in tree-world coordinates. Their layer moves by the exact
    // foreground camera offset, so they keep excluding the open sky without
    // pinning the shafts to the viewport.
    const localCeiling = ceiling - foregroundLayer.y;
    for (const mask of [rearLightMask, playerLightMask, playerAccentSoftMask, playerAccentHardCanopyMask]) {
      mask.clear()
        .rect(-window.innerWidth * 2, Math.max(worldTop, localCeiling), window.innerWidth * 5, worldHeight)
        .fill(0xffffff);
    }
  };
  const buildAnimatedLightRays = () => {
    for (const container of [
      rearLightRayContainer,
      playerLightRayContainer,
      rearHardRayContainer,
      playerHardRayContainer,
      rearLightOrbContainer,
      playerLightOrbContainer,
    ]) {
      for (const child of container.removeChildren()) child.destroy({ children: true });
    }
    for (const child of playerAccentSoftSegmentContainer.removeChildren()) child.destroy({ children: true });
    for (const child of playerAccentHardSegmentContainer.removeChildren()) child.destroy({ children: true });
    animatedLightRays.length = 0;
    animatedAccentRay = null;
    const rayTopY = -maximumVerticalClimb - 180;
    const rayBottomY = window.innerHeight + 180;
    const rayHeight = rayBottomY - rayTopY;
    if (lightOrbTexture === Texture.EMPTY) {
      const orbCanvas = document.createElement('canvas');
      orbCanvas.width = 128;
      orbCanvas.height = 128;
      const orbContext = orbCanvas.getContext('2d');
      if (orbContext) {
        const glow = orbContext.createRadialGradient(64, 64, 0, 64, 64, 64);
        glow.addColorStop(0, 'rgba(255, 250, 208, 0.94)');
        glow.addColorStop(0.18, 'rgba(255, 241, 171, 0.65)');
        glow.addColorStop(0.52, 'rgba(255, 232, 145, 0.2)');
        glow.addColorStop(1, 'rgba(255, 226, 128, 0)');
        orbContext.fillStyle = glow;
        orbContext.fillRect(0, 0, 128, 128);
        lightOrbTexture = Texture.from(orbCanvas);
      }
      const sparkCanvas = document.createElement('canvas');
      sparkCanvas.width = 16;
      sparkCanvas.height = 16;
      const sparkContext = sparkCanvas.getContext('2d');
      if (sparkContext) {
        sparkContext.fillStyle = '#fff2b4';
        sparkContext.beginPath();
        sparkContext.arc(8, 8, 7, 0, Math.PI * 2);
        sparkContext.fill();
        lightSparkTexture = Texture.from(sparkCanvas);
      }
    }
    const maskCycle = 1700;
    const positiveModulo = (value: number, modulus: number) => (
      ((value % modulus) + modulus) % modulus
    );
    const featheredWindowAlpha = (
      value: number,
      start: number,
      height: number,
    ) => {
      const phase = positiveModulo(value, maskCycle);
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let cycleOffset = -maskCycle; cycleOffset <= maskCycle; cycleOffset += maskCycle) {
        const windowStart = start + cycleOffset;
        const windowEnd = windowStart + height;
        const distance = phase < windowStart
          ? windowStart - phase
          : phase > windowEnd
            ? phase - windowEnd
            : 0;
        closestDistance = Math.min(closestDistance, distance);
      }
      if (closestDistance === 0) return 1;
      if (closestDistance >= ACCENT_MASK_FEATHER_PX) return 0;
      const progress = 1 - closestDistance / ACCENT_MASK_FEATHER_PX;
      return progress * progress * (3 - 2 * progress);
    };
    const buildFeatherMaskTexture = (
      renderedWidth: number,
      start: number,
      height: number,
      angleDirection: number,
    ) => {
      const canvas = document.createElement('canvas');
      // This is deliberately a small GPU alpha map stretched over world space.
      // The smooth gradient survives bilinear sampling without allocating a
      // several-thousand-pixel texture for every ray.
      canvas.width = 192;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) return Texture.EMPTY;
      const pixels = context.createImageData(canvas.width, canvas.height);
      // A slope greater than one makes the feather boundary slice steeply up or
      // down through a narrow ray instead of appearing horizontal across it.
      const totalAngleRise = Math.min(rayHeight * 0.42, renderedWidth * 1.45) * angleDirection;
      for (let pixelY = 0; pixelY < canvas.height; pixelY++) {
        const worldY = rayTopY + pixelY / Math.max(1, canvas.height - 1) * rayHeight;
        for (let pixelX = 0; pixelX < canvas.width; pixelX++) {
          const horizontalProgress = pixelX / Math.max(1, canvas.width - 1);
          const angledY = worldY - totalAngleRise * horizontalProgress;
          const alpha = featheredWindowAlpha(angledY, start, height);
          const offset = (pixelY * canvas.width + pixelX) * 4;
          pixels.data[offset] = 255;
          pixels.data[offset + 1] = 255;
          pixels.data[offset + 2] = 255;
          pixels.data[offset + 3] = Math.round(alpha * 255);
        }
      }
      context.putImageData(pixels, 0, 0);
      return Texture.from(canvas);
    };
    const createRay = (
      depth: AnimatedLightRay['depth'],
      index: number,
      count: number,
    ) => {
      const rear = depth === 'rear';
      const widthScale = 0.72 + rng() * 0.26;
      // The soft shaft is deliberately much wider than its inner highlight.
      // This keeps every hard fragment visibly nested inside a surrounding glow.
      const topWidth = (rear ? 72 : 82) * widthScale;
      const bottomWidth = (rear ? 218 : 252) * widthScale;
      // tan(30deg) ~= 0.577. Author the full-height shaft at that world-space
      // slope instead of rotating a viewport-sized graphic.
      const diagonalTravel = rayHeight * 0.53;
      const renderedWidth = diagonalTravel + bottomWidth;
      const bottomRatio = rear
        ? 0.18 + index * (0.64 / Math.max(1, count - 1))
        : 0.4;
      const startX = window.innerWidth * bottomRatio - diagonalTravel - bottomWidth * 0.5;
      const color = rear ? 0xfff0ae : 0xffe49a;
      const view = new Container();
      const bokehView = new Container();
      const orbs: AnimatedLightRay['orbs'] = [];
      const bands: AnimatedLightRay['bands'] = [];
      const drawBand = (insetRatio: number, alpha: number, bandIndex: number) => {
        const topInset = topWidth * insetRatio;
        const bottomInset = bottomWidth * insetRatio;
        const band = new Graphics()
          .moveTo(topInset, rayTopY)
          .lineTo(topWidth - topInset, rayTopY)
          .lineTo(diagonalTravel + bottomWidth - bottomInset, rayBottomY)
          .lineTo(diagonalTravel + bottomInset, rayBottomY)
          .closePath()
          .fill({ color, alpha });
        view.addChild(band);
        bands.push({
          view: band,
          phase: index * 1.37 + bandIndex * 2.11 + (rear ? 0 : 0.72),
          amount: (rear ? 14 : 20) + bandIndex * (rear ? 8 : 11),
          speed: (rear ? 0.32 : 0.4) + bandIndex * 0.09 + index * 0.025,
        });
      };
      // Layered soft bands give each stationary shaft a feathered interior.
      drawBand(0, rear ? 0.26 : 0.14, 0);
      drawBand(0.2, rear ? 0.18 : 0.11, 1);
      drawBand(0.38, rear ? 0.26 : 0.16, 2);
      view.alpha = rear ? 0.76 : 0.58;
      const hardView = new Graphics();
      const hardCycle = 1450 + index * 135;
      const hardCoreHeight = 170 + index * 24;
      const hardFeatherSteps = 13;
      const hardAngleRise = (index % 2 === 0 ? 1 : -1) * (72 + index * 13);
      const hardCenterAt = (y: number) => {
        const progress = (y - rayTopY) / rayHeight;
        const width = topWidth + (bottomWidth - topWidth) * progress;
        return diagonalTravel * progress + width * 0.5;
      };
      const hardWidthAt = (y: number) => {
        const progress = (y - rayTopY) / rayHeight;
        return (topWidth + (bottomWidth - topWidth) * progress) * 0.24;
      };
      const drawHardStrip = (top: number, bottom: number, alpha: number) => {
        const leftTopY = top + hardAngleRise;
        const leftBottomY = bottom + hardAngleRise;
        hardView
          .moveTo(hardCenterAt(leftTopY) - hardWidthAt(leftTopY) * 0.5, leftTopY)
          .lineTo(hardCenterAt(top) + hardWidthAt(top) * 0.5, top)
          .lineTo(hardCenterAt(bottom) + hardWidthAt(bottom) * 0.5, bottom)
          .lineTo(hardCenterAt(leftBottomY) - hardWidthAt(leftBottomY) * 0.5, leftBottomY)
          .closePath()
          .fill({ color: 0xfff4c4, alpha });
      };
      const featherStep = ACCENT_MASK_FEATHER_PX / hardFeatherSteps;
      const addBokehCluster = (boundaryY: number, clusterPhase: number) => {
        if (boundaryY < rayTopY || boundaryY > rayBottomY) return;
        const centerX = hardCenterAt(boundaryY);
        const clusterCount = 7;
        for (let orbIndex = 0; orbIndex < clusterCount; orbIndex++) {
          const crisp = orbIndex >= 3;
          const tiny = orbIndex === 0 || crisp;
          const large = orbIndex === 2;
          const diameter = crisp
            ? 2.2 + rng() * 3.8
            : tiny
              ? 7 + rng() * 7
            : large
              ? 32 + rng() * 22
              : 16 + rng() * 14;
          const baseAlpha = crisp
            ? 0.42 + rng() * 0.42
            : rear
            ? 0.22 + rng() * 0.18
            : 0.3 + rng() * 0.24;
          const orb = crisp
            ? new Sprite(lightSparkTexture)
            : new Sprite(lightOrbTexture);
          orb.anchor.set(0.5);
          orb.tint = crisp ? 0xfff2b4 : 0xffffff;
          orb.width = diameter;
          orb.height = diameter;
          orb.alpha = baseAlpha;
          const baseX = centerX + (rng() - 0.5) * (large ? 68 : 48);
          const baseY = boundaryY + (rng() - 0.5) * (large ? 50 : 34);
          bokehView.addChild(orb);
          orbs.push({
            view: orb,
            baseX,
            baseY,
            offsetX: 0,
            offsetY: 0,
            velocityX: 0,
            velocityY: 0,
            phase: clusterPhase + orbIndex * 1.91 + rng() * 0.7,
            driftSpeed: crisp ? 1.7 + rng() * 1.15 : tiny ? 1.25 + rng() * 0.55 : large ? 0.28 + rng() * 0.18 : 0.62 + rng() * 0.3,
            driftAmount: crisp ? 22 + rng() * 16 : tiny ? 15 + rng() * 9 : large ? 4 + rng() * 4 : 8 + rng() * 6,
            baseAlpha,
            fadeSpeed: crisp ? 1.25 + rng() * 1.5 : 0,
            crisp,
          });
        }
      };
      for (let cycleY = rayTopY - hardCycle; cycleY < rayBottomY + hardCycle; cycleY += hardCycle) {
        const openingStart = cycleY + 130 + index * 95;
        for (let step = 0; step < hardFeatherSteps; step++) {
          const progress = (step + 0.5) / hardFeatherSteps;
          const alpha = progress * progress * (3 - 2 * progress);
          drawHardStrip(
            openingStart - ACCENT_MASK_FEATHER_PX + step * featherStep,
            openingStart - ACCENT_MASK_FEATHER_PX + (step + 1) * featherStep,
            (rear ? 0.15 : 0.22) * alpha,
          );
        }
        drawHardStrip(openingStart, openingStart + hardCoreHeight, rear ? 0.15 : 0.22);
        addBokehCluster(openingStart, cycleY * 0.003 + index);
        addBokehCluster(openingStart + hardCoreHeight, cycleY * 0.003 + index + 2.4);
        for (let step = 0; step < hardFeatherSteps; step++) {
          const progress = (step + 0.5) / hardFeatherSteps;
          const alpha = 1 - progress * progress * (3 - 2 * progress);
          drawHardStrip(
            openingStart + hardCoreHeight + step * featherStep,
            openingStart + hardCoreHeight + (step + 1) * featherStep,
            (rear ? 0.15 : 0.22) * alpha,
          );
        }
      }
      const ray: AnimatedLightRay = {
        view,
        hardView,
        bokehView,
        depth,
        worldX: startX,
        renderedWidth,
        topWidth,
        bottomWidth,
        diagonalTravel,
        topY: rayTopY,
        height: rayHeight,
        maskPhase: index * 1.71 + (rear ? 0.4 : 2.3),
        orbs,
        bands,
      };
      (rear ? rearLightRayContainer : playerLightRayContainer).addChild(view);
      (rear ? rearHardRayContainer : playerHardRayContainer).addChild(hardView);
      (rear ? rearLightOrbContainer : playerLightOrbContainer).addChild(bokehView);
      animatedLightRays.push(ray);
    };
    for (let index = 0; index < 2; index++) createRay('rear', index, 2);
    createRay('player', 0, 1);

    // All continuous shafts now carry their own cheap, pre-feathered inner
    // highlight. The former full-height alpha-mask accent duplicated this look
    // with a large offscreen render target, so keep it disabled.
    playerAccentSoftContainer.visible = false;
    playerAccentHardCanopyContainer.visible = false;
    updateLightMasks();
    return;

    const accentTopY = rayTopY;
    const accentBottomY = rayBottomY;
    const accentHeight = rayHeight;
    const accentTopWidth = 34;
    const accentBottomWidth = 78;
    const accentTravel = accentHeight * 0.16;
    const accentColor = 0xffedaa;
    const softView = new Graphics()
      .moveTo(0, accentTopY)
      .lineTo(accentTopWidth, accentTopY)
      .lineTo(accentTravel + accentBottomWidth, accentBottomY)
      .lineTo(accentTravel, accentBottomY)
      .closePath()
      .fill({ color: accentColor, alpha: 0.3 });
    const hardView = new Graphics()
      .moveTo(0, accentTopY)
      .lineTo(accentTopWidth, accentTopY)
      .lineTo(accentTravel + accentBottomWidth, accentBottomY)
      .lineTo(accentTravel, accentBottomY)
      .closePath()
      .fill({ color: 0xfff6c8, alpha: 0.26 });
    playerAccentSoftSegmentContainer.addChild(softView);
    playerAccentHardSegmentContainer.addChild(hardView);
    const hardSegmentStart = 170;
    const hardSegmentHeight = 190;
    // The soft opening begins its feather exactly where the hard opening starts
    // fading. Their 260 px crossfade is continuous; later in the cycle both
    // masks reach zero so moving canopy cover can still hide the shaft entirely.
    const softSegmentStart = hardSegmentStart + hardSegmentHeight + ACCENT_MASK_FEATHER_PX;
    const softSegmentHeight = 250;
    const maskWidth = accentTravel + accentBottomWidth;
    playerAccentSegmentMaskTexture?.destroy(true);
    playerAccentSoftSegmentMaskTexture?.destroy(true);
    const hardMaskTexture = buildFeatherMaskTexture(maskWidth, hardSegmentStart, hardSegmentHeight, 1);
    const softMaskTexture = buildFeatherMaskTexture(maskWidth, softSegmentStart, softSegmentHeight, 1);
    playerAccentSegmentMaskTexture = hardMaskTexture;
    playerAccentSoftSegmentMaskTexture = softMaskTexture;
    playerAccentSegmentMask.texture = hardMaskTexture;
    playerAccentSoftSegmentMask.texture = softMaskTexture;
    const accentWorldX = window.innerWidth * 0.62 - accentTravel - accentBottomWidth * 0.5;
    playerAccentMaskBaseX = accentWorldX + maskWidth * 0.5;
    playerAccentMaskBaseY = accentTopY + accentHeight * 0.5;
    for (const mask of [playerAccentSegmentMask, playerAccentSoftSegmentMask]) {
      mask.position.set(playerAccentMaskBaseX, playerAccentMaskBaseY);
      mask.anchor.set(0.5);
      mask.width = maskWidth;
      mask.height = accentHeight;
    }
    const accentRay: AnimatedAccentRay = {
      softView,
      hardView,
      worldX: accentWorldX,
      renderedWidth: accentTravel + accentBottomWidth,
      maskPhase: 0.84,
    };
    animatedAccentRay = accentRay;
    softView.x = accentRay.worldX;
    hardView.x = accentRay.worldX;
    updateLightMasks();
  };
  const lightRayLayerY = (ray: AnimatedLightRay) => (
    ray.depth === 'rear' ? rearLightLayer.y : playerLightLayer.y
  );
  // Ray geometry uses exactly the same world-space X basis as playable trees.
  // Vertical camera travel must never feed back into horizontal ray placement.
  const lightRayRenderedX = (ray: AnimatedLightRay) => ray.worldX;
  const lightRayHorizontalCenterX = (ray: AnimatedLightRay) => (
    ray.worldX + ray.renderedWidth * 0.5
  );
  const updateAnimatedLightRays = (deltaSeconds: number, worldDistance: number) => {
    lightAnimationElapsed += deltaSeconds;
    updateLightMasks();
    const rightmostActiveRay = Math.max(...animatedLightRays.map(lightRayHorizontalCenterX));
    let nextRaySpawnX = Math.max(
      window.innerWidth + LIGHT_RAY_SPAWN_MARGIN,
      rightmostActiveRay + LIGHT_RAY_MIN_GAP,
    );
    const playerScreenY = currentPlayerState.y + foregroundLayer.y;
    const playerIsMoving = characterIsMoving || Math.abs(currentPlayerState.velocity) > 90;
    for (const ray of animatedLightRays) {
      ray.worldX -= worldDistance;
      // Recycle only from horizontal world travel. Using the diagonal ray's
      // viewport intersection here made vertical jumps recycle or reposition it.
      if (ray.worldX + ray.renderedWidth < -140) {
        const spawnCenterX = Math.max(
          window.innerWidth + LIGHT_RAY_SPAWN_MARGIN,
          nextRaySpawnX + (rng() - 0.5) * 180,
        );
        ray.worldX = spawnCenterX - ray.renderedWidth * 0.5;
        nextRaySpawnX = spawnCenterX + LIGHT_RAY_MIN_GAP;
        for (const orb of ray.orbs) {
          orb.offsetX = 0;
          orb.offsetY = 0;
          orb.velocityX = 0;
          orb.velocityY = 0;
        }
      }
      const renderedRayX = lightRayRenderedX(ray);
      ray.view.x = renderedRayX;
      // Keep every part of the shaft fixed in playable-tree world space.
      // Translating a feather window along a diagonal cone made the ray itself
      // appear to sway during jumps. The independent motes below retain motion.
      const hardPatternY = 0;
      const hardPatternX = renderedRayX;
      ray.hardView.position.set(hardPatternX, hardPatternY);
      ray.bokehView.position.set(hardPatternX, hardPatternY);
      const layerScreenY = lightRayLayerY(ray);
      for (const orb of ray.orbs) {
        const driftX = Math.sin(
          lightAnimationElapsed * orb.driftSpeed + orb.phase,
        ) * orb.driftAmount;
        const driftY = Math.cos(
          lightAnimationElapsed * orb.driftSpeed * 0.74 + orb.phase,
        ) * orb.driftAmount * 0.56;
        const screenX = hardPatternX + orb.baseX + driftX + orb.offsetX;
        const screenY = hardPatternY + orb.baseY + driftY + orb.offsetY + layerScreenY;
        if (playerIsMoving) {
          const deltaX = screenX - currentPlayerState.x;
          const deltaY = screenY - playerScreenY;
          const distance = Math.hypot(deltaX, deltaY);
          const wakeRadius = 78 + orb.view.width * 0.55;
          if (distance > 0.001 && distance < wakeRadius) {
            const proximity = 1 - distance / wakeRadius;
            const inverseMass = orb.view.width < 15 ? 1.45 : orb.view.width > 32 ? 0.48 : 0.82;
            const impulse = proximity * inverseMass * 420 * deltaSeconds;
            orb.velocityX += deltaX / distance * impulse;
            orb.velocityY += deltaY / distance * impulse;
          }
        }
        const spring = orb.view.width > 32 ? 1.5 : orb.view.width < 15 ? 4.2 : 2.7;
        orb.velocityX -= orb.offsetX * spring * deltaSeconds;
        orb.velocityY -= orb.offsetY * spring * deltaSeconds;
        const damping = Math.exp(-(orb.view.width > 32 ? 2.2 : 3.4) * deltaSeconds);
        orb.velocityX *= damping;
        orb.velocityY *= damping;
        orb.offsetX += orb.velocityX * deltaSeconds;
        orb.offsetY += orb.velocityY * deltaSeconds;
        orb.view.position.set(
          orb.baseX + driftX + orb.offsetX,
          orb.baseY + driftY + orb.offsetY,
        );
        orb.view.alpha = orb.crisp
          ? orb.baseAlpha * (0.12 + 0.88 * (
            0.5 + 0.5 * Math.sin(lightAnimationElapsed * orb.fadeSpeed + orb.phase)
          ))
          : orb.baseAlpha;
      }
      // Keep the broad ray silhouette locked to the trees. Its hard feathered
      // openings and particles still animate, but the shaft itself does not sway.
      for (const band of ray.bands) band.view.x = 0;
    }
    if (animatedAccentRay) {
      animatedAccentRay.worldX -= worldDistance;
      if (animatedAccentRay.worldX + animatedAccentRay.renderedWidth < -160) {
        animatedAccentRay.worldX += window.innerWidth
          + animatedAccentRay.renderedWidth
          + 320;
      }
      animatedAccentRay.softView.x = animatedAccentRay.worldX;
      animatedAccentRay.hardView.x = animatedAccentRay.worldX;
      playerAccentSegmentMask.x = animatedAccentRay.worldX
        + animatedAccentRay.renderedWidth * 0.5
        + Math.sin(
        lightAnimationElapsed * 0.22 + animatedAccentRay.maskPhase,
      ) * 22;
      playerAccentSegmentMask.y = playerAccentMaskBaseY + Math.sin(
        lightAnimationElapsed * 0.48 + animatedAccentRay.maskPhase,
      ) * 150;
      playerAccentSegmentMask.rotation = Math.sin(
        lightAnimationElapsed * 0.34 + animatedAccentRay.maskPhase,
      ) * 0.11;
      // Move both sparse masks as one slowly shifting canopy pattern. Their
      // disjoint windows deliberately leave fully transparent gaps in the ray.
      playerAccentSoftSegmentMask.x = playerAccentSegmentMask.x;
      playerAccentSoftSegmentMask.y = playerAccentSegmentMask.y;
      playerAccentSoftSegmentMask.rotation = playerAccentSegmentMask.rotation;
    }
  };
  initializeFallingLeaves();

  const verticalClimbInput = document.querySelector<HTMLInputElement>('#vertical-climb');
  const verticalClimbOutput = document.querySelector<HTMLOutputElement>('#vertical-climb-output');
  const showHitboxesInput = document.querySelector<HTMLInputElement>('#show-branch-hitboxes');
  const showAssetFilenamesInput = document.querySelector<HTMLInputElement>('#show-asset-filenames');
  const followPlayerInput = document.querySelector<HTMLInputElement>('#follow-player-camera');
  const bunnyCharacterInput = document.querySelector<HTMLInputElement>('#use-bunny-character');
  const hud = document.querySelector<HTMLDivElement>('#hud');
  const hudCollapseInput = document.querySelector<HTMLButtonElement>('#hud-collapse');

  const updateCullingStatus = () => {
    if (!cullingStatus) return;
    const state = proceduralTreeStream?.getCullingState();
    if (!state) {
      cullingStatus.textContent = 'Culling V1 · procedural stream disabled';
      return;
    }
    const groundCount = Number(groundLayer.renderable) + Number(distantGroundLayer.renderable);
    const farState = farDisplayTreeStream?.getState();
    const midState = midDisplayTreeStream?.getState();
    const displayMaterialized = (farState?.materializedModules ?? 0) + (midState?.materializedModules ?? 0);
    const displayPlanned = (farState?.plannedModules ?? 0) + (midState?.plannedModules ?? 0);
    cullingStatus.textContent = `Culling V1 · playable ${state.materializedSections}/${state.plannedSections} · display ${displayMaterialized}/${displayPlanned} · ${state.drawnSprites + (farState?.drawnSprites ?? 0) + (midState?.drawnSprites ?? 0)} sprites drawn · grounds ${groundCount}/2 (${groundTextureState})`;
  };

  const texture = (record: AssetRecord) => assetTexture(record.path);
  const currentGroundRecord = () => manifest.ground!.find(
    (candidate) => candidate.path.endsWith(groundPathSuffix(groundStyle)),
  ) ?? manifest.ground![0]!;
  const recordNumber = (record: AssetRecord) => Number(record.path.match(/(\d+)\.webp$/)?.[1] ?? 1) - 1;
  const baseTopConnectionRatios = [252 / 641, 205 / 559, 217 / 689, 210 / 572, 158 / 645, 138 / 577, 132 / 546];
  const trunkTopConnectionRatios = [166 / 563, 281 / 578, 162 / 493, 178 / 579, 305 / 637, 191 / 551, 200 / 468, 203 / 469];
  const trunkBottomConnectionRatios = [232 / 563, 205 / 578, 205 / 493, 242 / 579, 237 / 637, 237 / 551, 234 / 468, 229 / 469];
  const randomBetween = ([minimum, maximum]: [number, number]) => minimum + rng() * (maximum - minimum);
  const itemLeft = (item: ScrollingItem) => item.view.x - (item.centered ? item.width / 2 : 0);
  const itemRight = (item: ScrollingItem) => itemLeft(item) + item.width;
  const registerItem = (
    view: Container,
    speed: number,
    width: number,
    band: LayerBand,
    recycleGap: [number, number],
    centered = true,
  ) => {
    view.cullable = true;
    items.push({ view, speed, width, band, centered, recycleGap });
  };

  const addBackgroundPanels = (
    record: AssetRecord,
    layer: Container,
    band: LayerBand,
    speed: number,
  ) => {
    const height = window.innerHeight + BACKGROUND_VERTICAL_OVERSCAN * 2;
    const scale = height / Math.max(1, record.height);
    const panelWidth = record.width * scale;
    const count = Math.ceil((window.innerWidth * POOL_WIDTH_MULTIPLIER) / panelWidth) + 2;
    let cursor = 0;
    for (let index = 0; index < count; index++) {
      const panel = new Container();
      const sprite = new Sprite(texture(record));
      groundSpriteRecords.set(sprite, record);
      sprite.anchor.set(0, 0);
      sprite.scale.set(scale);
      // Repeat the authored orientation so every panel keeps sunlight arriving
      // from the same side of the forest.
      sprite.scale.set(scale);
      sprite.position.set(0, 0);
      panel.position.set(cursor, -BACKGROUND_VERTICAL_OVERSCAN - FAR_BACKDROP_LIFT);
      panel.addChild(sprite);
      layer.addChild(panel);
      registerItem(panel, speed, panelWidth, band, [0, 0], false);
      cursor += panelWidth;
    }
  };

  const createRepeatableMasterTree = (middleCount: number): Container => {
    const tree = new Container();
    const stack = new Container();
    const { assets, layout } = masterTreeManifest;
    const resolvedMiddleCount = Math.max(layout.minimumMiddleCount, Math.round(middleCount));
    const baseY = layout.baseYForOneMiddle + (resolvedMiddleCount - 1) * layout.middleStep;
    const totalHeight = baseY + assets.base.height;
    const canvasWidth = assets.canopy.width;
    const designPixelsPerUnit = masterTreeManifest.designPixelsPerUnit ?? { x: 1, y: 1 };

    const addPiece = (record: AssetRecord, y: number) => {
      const sprite = new Sprite(texture(record));
      sprite.position.set(0, y);
      sprite.cullable = true;
      stack.addChild(sprite);
    };

    addPiece(assets.canopy, 0);
    for (let index = 0; index < resolvedMiddleCount; index++) {
      addPiece(assets.middle, layout.firstMiddleY + index * layout.middleStep);
    }
    addPiece(assets.base, baseY);

    for (let index = 0; index < resolvedMiddleCount - 1; index++) {
      const seamY = layout.baseYForOneMiddle + index * layout.middleStep;
      addPiece(
        assets.connector,
        seamY - assets.connector.height / 2 + layout.connectorCenterOffset,
      );
    }

    stack.scale.set(1 / designPixelsPerUnit.x, 1 / designPixelsPerUnit.y);
    stack.position.set(
      -canvasWidth / designPixelsPerUnit.x / 2,
      -totalHeight / designPixelsPerUnit.y,
    );
    tree.addChild(stack);
    return tree;
  };

  const createAssembledTree = (): Container => {
    const tree = new Container();
    const baseRecord = choose(manifest.base!);
    const base = new Sprite(texture(baseRecord));
    base.anchor.set(0.5, 1);
    const baseScale = 0.48 + rng() * 0.18;
    base.scale.set(baseScale);
    tree.addChild(base);

    const trunkCount = 2 + Math.floor(rng() * 2);
    let topY = -base.height * 0.76;
    let connectionWidth = baseRecord.width * baseTopConnectionRatios[recordNumber(baseRecord)]! * baseScale;
    for (let index = 0; index < trunkCount; index++) {
      const trunkRecord = choose(manifest.trunk!);
      const trunk = new Sprite(texture(trunkRecord));
      trunk.anchor.set(0.5, 1);
      const bottomConnectionWidth =
        trunkRecord.width * trunkBottomConnectionRatios[recordNumber(trunkRecord)]!;
      const scale = connectionWidth / Math.max(1, bottomConnectionWidth);
      trunk.scale.set(scale);
      trunk.y = topY;
      topY -= trunk.height * 0.86;
      connectionWidth = trunkRecord.width * trunkTopConnectionRatios[recordNumber(trunkRecord)]! * scale;
      tree.addChild(trunk);
    }

    const platformCount = 2 + Math.floor(rng() * 3);
    for (let index = 0; index < platformCount; index++) {
      const platformRecord = choose(manifest.platform!);
      const platform = new Sprite(texture(platformRecord));
      platform.anchor.set(index % 2 === 0 ? 0.15 : 0.85, 0.5);
      platform.scale.set((base.width * (0.55 + rng() * 0.35)) / Math.max(1, platformRecord.width));
      const side = index % 2 === 0 ? 1 : -1;
      platform.position.set(side * base.width * (0.08 + rng() * 0.13), -base.height * (0.9 + index * 0.72));
      tree.addChild(platform);

      if (rng() > 0.35) {
        const hangingRecord = choose(manifest.detail!.slice(6));
        const hanging = new Sprite(texture(hangingRecord));
        hanging.anchor.set(0.5, 0);
        hanging.scale.set((platform.width * (0.18 + rng() * 0.16)) / Math.max(1, hangingRecord.width));
        hanging.position.set(platform.x + side * platform.width * 0.08, platform.y + platform.height * 0.16);
        tree.addChild(hanging);
      }
    }
    return tree;
  };

  const addForegroundTrees = (treeBaseY: number) => {
    if (useProceduralTrees) {
      proceduralTreeStream = new ForestTreeStream({
        parent: foregroundLayer,
        stack: stackingTreeManifest,
        attachments: attachmentManifest,
        jumpReach: getPlayerJumpReach(),
        seed: forestSeed,
        middleCount: masterMiddleCount,
        scale: masterTreeScale,
        viewportWidth: window.innerWidth,
        baseY: treeBaseY,
        centerSpacing: 850,
        centerSpacingVariancePx: 100,
        canopyEnabled: includeProceduralCanopies,
      });
      return;
    }
    const spacing: [number, number] = useMasterTree ? [500, 660] : [390, 520];
    const count = Math.ceil((window.innerWidth * POOL_WIDTH_MULTIPLIER) / ((spacing[0] + spacing[1]) / 2)) + 3;
    let cursor = useMasterTree ? 240 : 180;
    for (let index = 0; index < count; index++) {
      const tree = useMasterTree
        ? createRepeatableMasterTree(masterMiddleCount)
        : createAssembledTree();
      tree.scale.set(
        useMasterTree
          ? masterTreeScale * (0.92 + rng() * 0.16)
          : 0.82 + rng() * 0.22,
      );
      tree.position.set(cursor, treeBaseY);
      cursor += randomBetween(spacing);
      foregroundLayer.addChild(tree);
      registerItem(tree, 1, Math.max(360, tree.width), 'foreground', spacing);
    }
  };

  const addGround = () => {
    const record = currentGroundRecord();
    const height = Math.max(230, window.innerHeight * 0.28);
    const scale = height / Math.max(1, record.height);
    const tileWidth = record.width * scale;
    const tileOverlap = 2;
    const tileAdvance = tileWidth - tileOverlap;
    const count = Math.ceil((window.innerWidth * POOL_WIDTH_MULTIPLIER) / tileAdvance) + 3;
    let cursor = -50;
    groundLocalBounds = [groundY - 36, groundY - 36 + height];
    for (let index = 0; index < count; index++) {
      const tile = new Container();
      const sprite = new Sprite(texture(record));
      groundSpriteRecords.set(sprite, record);
      sprite.anchor.set(0, 0);
      const mirrored = index % 2 === 1;
      sprite.scale.set(mirrored ? -scale : scale, scale);
      sprite.position.set(mirrored ? tileWidth : 0, 0);
      tile.position.set(cursor, groundY - 36);
      tile.addChild(sprite);
      cursor += tileAdvance;
      groundLayer.addChild(tile);
      registerItem(tile, 1, tileAdvance, 'ground', [0, 0], false);
    }
  };

  const addDistantGround = (treeBaseY: number) => {
    const record = manifest.distantGround?.[0];
    if (!record) return;
    const detailRecords = manifest.distantGroundDetails ?? [];
    const detailDisplayHeights = [92, 88, 150, 165];
    const detailFractions = [0.12, 0.38, 0.64, 0.88];
    const visibleRise = Math.max(190, window.innerHeight * 0.2);
    const desiredTileWidth = Math.max(1700, window.innerWidth * 0.95);
    const scale = desiredTileWidth / Math.max(1, record.width);
    const tileWidth = record.width * scale;
    const tileOverlap = 2;
    const tileAdvance = tileWidth - tileOverlap;
    const count = Math.ceil((window.innerWidth * POOL_WIDTH_MULTIPLIER) / tileAdvance) + 3;
    let cursor = -80;
    const tileY = treeBaseY - visibleRise + 10;
    distantGroundLocalBounds = [tileY - Math.max(...detailDisplayHeights, 0), tileY + record.height * scale];
    for (let index = 0; index < count; index++) {
      const tile = new Container();
      const sprite = new Sprite(texture(record));
      groundSpriteRecords.set(sprite, record);
      sprite.anchor.set(0, 0);
      const mirrored = index % 2 === 1;
      sprite.scale.set(mirrored ? -scale : scale, scale);
      sprite.position.set(mirrored ? tileWidth : 0, 0);
      // Keep the approved ridge at the same height while the deeper artwork
      // continues below the viewport during vertical-parallax transitions.
      tile.position.set(cursor, tileY);
      tile.addChild(sprite);
      for (let detailIndex = 0; detailIndex < detailRecords.length; detailIndex++) {
        const variantIndex = (detailIndex + index * 3) % detailRecords.length;
        const detailRecord = detailRecords[variantIndex]!;
        const detail = new Sprite(texture(detailRecord));
        groundSpriteRecords.set(detail, detailRecord);
        detail.anchor.set(0.5, 1);
        const detailScale = detailDisplayHeights[variantIndex]! / Math.max(1, detailRecord.height);
        const mirroredDetail = (index + detailIndex) % 2 === 1;
        detail.scale.set(mirroredDetail ? -detailScale : detailScale, detailScale);
        detail.position.set(
          tileWidth * detailFractions[detailIndex]!,
          groundY - 12 - tileY,
        );
        tile.addChild(detail);
      }
      cursor += tileAdvance;
      distantGroundLayer.addChild(tile);
      registerItem(tile, 0.34, tileAdvance, 'rear-ground', [0, 0], false);
    }
  };

  const clearComposition = () => {
    proceduralTreeStream?.destroy();
    proceduralTreeStream = null;
    farDisplayTreeStream?.destroy();
    farDisplayTreeStream = null;
    midDisplayTreeStream?.destroy();
    midDisplayTreeStream = null;
    items.length = 0;
    for (const layer of [farLayer, rearLayer, distantGroundLayer, rearTreeLayer, groundLayer, foregroundLayer]) {
      const preservedAtmosphere = layer === farLayer ? atmosphere : null;
      const preservedNearLeaves = layer === foregroundLayer ? nearLeafLayer : null;
      for (const child of [...layer.children]) {
        if (child !== preservedAtmosphere && child !== preservedNearLeaves) {
          child.destroy({ children: true });
        }
      }
    }
  };

  const updateVerticalClimbControl = () => {
    const percentage = maximumVerticalClimb > 0 ? verticalClimb / maximumVerticalClimb : 0;
    if (verticalClimbInput) {
      verticalClimbInput.max = String(Math.ceil(maximumVerticalClimb));
      verticalClimbInput.value = String(Math.round(verticalClimb));
    }
    if (verticalClimbOutput) verticalClimbOutput.value = `${Math.round(percentage * 100)}%`;
  };

  const rebindGroundLayerTextures = (layer: Container) => {
    const visit = (container: Container) => {
      for (const child of container.children) {
        if (child instanceof Sprite) {
          const record = groundSpriteRecords.get(child);
          if (record) child.texture = texture(record);
        }
        if (child.children.length > 0) visit(child);
      }
    };
    visit(layer);
  };

  const clearLayerTextures = (layer: Container) => {
    const visit = (container: Container) => {
      for (const child of container.children) {
        if (child instanceof Sprite) child.texture = Texture.EMPTY;
        if (child.children.length > 0) visit(child);
      }
    };
    visit(layer);
  };

  const updateGroundTextureResidency = () => {
    const rangeIsNearViewport = (
      [top, bottom]: [number, number],
      offset: number,
      margin: number,
    ) => bottom + offset >= -margin && top + offset <= window.innerHeight + margin;
    // Different unload/restore margins create a dead band. Without it, the
    // invisible distant ground repeatedly unloaded and reloaded every frame.
    const withinUnloadBuffer = rangeIsNearViewport(groundLocalBounds, groundLayer.y, 900)
      || rangeIsNearViewport(distantGroundLocalBounds, distantGroundLayer.y, 900);
    const withinRestoreBuffer = rangeIsNearViewport(groundLocalBounds, groundLayer.y, 600)
      || rangeIsNearViewport(distantGroundLocalBounds, distantGroundLayer.y, 600);
    const runtimeRecords = [
      currentGroundRecord(),
      manifest.distantGround![0]!,
      ...(manifest.distantGroundDetails ?? []),
    ];
    const runtimePaths = runtimeRecords.map((record) => record.path);
    if (
      groundTextureState === 'resident'
      && !groundLayer.renderable
      && !distantGroundLayer.renderable
      && !withinUnloadBuffer
    ) {
      groundTextureState = 'unloading';
      const operation = ++groundTextureOperation;
      const residentPaths = runtimePaths.filter((path) => loadedRuntimePaths.has(path));
      // A Sprite may remain in Pixi's render group after it stops being renderable.
      // Detach every reference before Assets.unload destroys the shared texture;
      // otherwise the next renderer validation reads a null TextureSource uid.
      clearLayerTextures(groundLayer);
      clearLayerTextures(distantGroundLayer);
      void Promise.resolve()
        .then(() => Promise.allSettled(residentPaths.map((path) => Assets.unload(path))))
        .then(() => {
          if (operation !== groundTextureOperation) return;
          for (const path of residentPaths) loadedRuntimePaths.delete(path);
          groundTextureState = 'unloaded';
          updateTextureStatus(' · ground textures culled');
          updateCullingStatus();
          // If the player returned toward the forest floor while unloading was in
          // flight, start restoration immediately instead of waiting for movement.
          updateGroundTextureResidency();
        });
      return;
    }
    if (groundTextureState === 'unloaded' && withinRestoreBuffer) {
      groundTextureState = 'loading';
      const operation = ++groundTextureOperation;
      updateTextureStatus(' · restoring ground textures…');
      void loadRuntimePaths(runtimePaths)
        .then(() => {
          if (operation !== groundTextureOperation) return;
          rebindGroundLayerTextures(groundLayer);
          rebindGroundLayerTextures(distantGroundLayer);
          groundTextureState = 'resident';
          updateTextureStatus();
          applyVerticalCamera();
        })
        .catch((error: unknown) => {
          if (operation !== groundTextureOperation) return;
          groundTextureState = 'unloaded';
          console.error('[forest sandbox] Unable to restore ground textures', error);
          updateTextureStatus(' · ground texture restore failed');
          updateCullingStatus();
        });
    }
  };

  const updateCanopySky = () => {
    if (!proceduralCanopiesLoaded || canopySkySprite.texture === Texture.EMPTY) {
      canopySkySprite.visible = false;
      canopySkyMask.clear();
      return;
    }
    const averageCanopyCutoff = proceduralTreeStream?.getAverageCanopyCutoffY(
      foregroundLayer.y,
      window.innerWidth,
    ) ?? window.innerHeight * 0.62;
    const cutoffY = Math.max(0, Math.min(window.innerHeight, averageCanopyCutoff));
    const canopySkyIsVisible = cutoffY > 0;
    // The climb can take long enough for the hidden panorama's oscillator to
    // reach its return phase. Start its cycle when the sky is first revealed so
    // the visible motion always begins by travelling left.
    if (canopySkyIsVisible && !canopySkyWasVisible) canopySkyTravelPx = 0;
    canopySkyWasVisible = canopySkyIsVisible;
    // Once the sky has loaded, keep it present for the rest of the climb. The
    // earlier upper-bound check hid it again when the crowns moved low enough,
    // exposing the normal forest backdrop at the final camera position.
    canopySkySprite.visible = canopySkyIsVisible;
    canopySkySprite.alpha = 1;
    canopySkyMask
      .clear()
      .rect(0, 0, window.innerWidth, cutoffY)
      .fill({ color: 0xffffff });
    // At the canopy the panorama becomes the complete backdrop, not a strip
    // blended over the forest below. Size primarily from viewport height so
    // more sky remains visible, accept generous horizontal overscan, and keep
    // the approved composition centered.
    const scale = Math.max(
      window.innerWidth * 1.08 / Math.max(1, canopySkySprite.texture.width),
      window.innerHeight * 1.06 / Math.max(1, canopySkySprite.texture.height),
    );
    const baseRenderedHeight = canopySkySprite.texture.height * scale;
    const anchoredBottom = (window.innerHeight + baseRenderedHeight) / 2;
    // Grow the approved panorama uniformly so its aspect ratio remains intact.
    // Its previous centered bottom edge is the anchor, so the added 100 px grows
    // upward while the composition remains horizontally centered.
    const panoramaScale = (baseRenderedHeight + CANOPY_SKY_EXTRA_HEIGHT)
      / Math.max(1, canopySkySprite.texture.height);
    const renderedWidth = canopySkySprite.texture.width * panoramaScale;
    const renderedHeight = canopySkySprite.texture.height * panoramaScale;
    const maximumSkyOffset = Math.max(0, (renderedWidth - window.innerWidth) / 2 - 32);
    canopySkyOffsetX = maximumSkyOffset > 0
      ? -Math.sin(canopySkyTravelPx / maximumSkyOffset) * maximumSkyOffset
      : 0;
    canopySkySprite.scale.set(panoramaScale);
    canopySkySprite.position.set(
      (window.innerWidth - renderedWidth) / 2 + canopySkyOffsetX,
      anchoredBottom - renderedHeight,
    );
  };

  const applyVerticalCamera = () => {
    farLayer.y = easedParallaxOffset(verticalClimb, VERTICAL_PARALLAX.far);
    rearLayer.y = easedParallaxOffset(verticalClimb, VERTICAL_PARALLAX.rear);
    // Both light-depth groups are authored in the same vertical world as the
    // playable trees. They do not use rear-layer parallax or viewport locking.
    rearLightLayer.y = verticalClimb * VERTICAL_PARALLAX.world;
    frontLightLayer.y = verticalClimb * VERTICAL_PARALLAX.world;
    distantGroundLayer.y = rearLayer.y;
    rearTreeLayer.y = rearLayer.y;
    groundLayer.y = verticalClimb * VERTICAL_PARALLAX.world;
    rearLeafLayer.y = verticalClimb * VERTICAL_PARALLAX.world;
    foregroundLayer.y = verticalClimb * VERTICAL_PARALLAX.world;
    const lightFilterArea = new Rectangle(
      -LIGHT_FILTER_OVERSCAN_PX,
      -foregroundLayer.y - LIGHT_FILTER_OVERSCAN_PX,
      window.innerWidth + LIGHT_FILTER_OVERSCAN_PX * 2,
      window.innerHeight + LIGHT_FILTER_OVERSCAN_PX * 2,
    );
    rearLightRayContainer.filterArea = lightFilterArea;
    playerLightRayContainer.filterArea = lightFilterArea;
    playerAccentSoftContainer.filterArea = lightFilterArea;
    playerAccentSegmentMask.filterArea = lightFilterArea;
    playerAccentSoftSegmentMask.filterArea = lightFilterArea;
    proceduralTreeStream?.updateVisibility(foregroundLayer.y, window.innerHeight, window.innerWidth);
    farDisplayTreeStream?.updateVisibility(rearLayer.y, window.innerHeight, window.innerWidth);
    midDisplayTreeStream?.updateVisibility(rearTreeLayer.y, window.innerHeight, window.innerWidth);
    updateCanopySky();

    const layerCullMargin = 180;
    const rangeIsBuffered = ([top, bottom]: [number, number], offset: number) => (
      bottom + offset >= -layerCullMargin && top + offset <= window.innerHeight + layerCullMargin
    );
    groundLayer.renderable = rangeIsBuffered(groundLocalBounds, groundLayer.y);
    distantGroundLayer.renderable = rangeIsBuffered(distantGroundLocalBounds, distantGroundLayer.y);
    updateGroundTextureResidency();

    updateVerticalClimbControl();
    updateCullingStatus();
  };

  const finishCanopyStreams = () => {
    proceduralTreeStream?.setCanopyEnabled(
      true,
      foregroundLayer.y,
      window.innerHeight,
      window.innerWidth,
    );
    const rearOffsetAtFinish = easedParallaxOffset(maximumVerticalClimb, VERTICAL_PARALLAX.rear);
    midDisplayTreeStream?.finishWithCanopies(
      foregroundCanopyCutoffScreenY,
      rearOffsetAtFinish,
      window.innerHeight,
      window.innerWidth,
      [40, 260],
    );
    farDisplayTreeStream?.finishWithCanopies(
      foregroundCanopyCutoffScreenY,
      rearOffsetAtFinish,
      window.innerHeight,
      window.innerWidth,
      [180, 480],
    );
  };

  const ensureAutomaticCanopies = async () => {
    if (includeProceduralCanopies && proceduralCanopiesLoaded) {
      finishCanopyStreams();
      return;
    }
    if (canopyLoadPromise) return canopyLoadPromise;
    canopyLoadPromise = (async () => {
      updateTextureStatus(' · loading treetops automatically…');
      await loadRuntimePaths([...proceduralCanopyAssetPaths, canopySkyPath]);
      proceduralCanopiesLoaded = true;
      canopySkySprite.texture = assetTexture(canopySkyPath);
      includeProceduralCanopies = true;
      finishCanopyStreams();
      updateTextureStatus();
      applyVerticalCamera();
    })().catch((error: unknown) => {
      console.error('[forest sandbox] Unable to load automatic treetops', error);
      updateTextureStatus(' · treetop load failed');
    }).finally(() => {
      canopyLoadPromise = null;
    });
    return canopyLoadPromise;
  };

  const setVerticalClimb = (nextClimb: number) => {
    verticalClimb = Math.max(0, Math.min(maximumVerticalClimb, nextClimb));
    applyVerticalCamera();
    const preloadDistance = Math.max(520, window.innerHeight * 0.72);
    if (!includeProceduralCanopies && verticalClimb >= maximumVerticalClimb - preloadDistance) {
      void ensureAutomaticCanopies();
    }
  };

  const buildComposition = () => {
    clearComposition();
    worldScrollRemainder = 0;
    groundY = window.innerHeight * 0.82;
    const treeBaseY = groundY + Math.max(70, window.innerHeight * 0.09);
    const treeHeight = (
      stackingTreeManifest.layout.canopyHeight
      - stackingTreeManifest.connector.height
      + masterMiddleCount * stackingTreeManifest.layout.middleStep
      + stackingTreeManifest.layout.baseHeight
    ) * masterTreeScale;
    // Leave the crowns well below the top of the frame at the end of the climb.
    // This deliberately reserves substantially more than the former 200-300 px
    // for the approved sky panorama on ordinary desktop viewports.
    const canopyPanoramaReveal = Math.max(420, window.innerHeight * 0.58);
    maximumVerticalClimb = Math.max(1, treeHeight - treeBaseY + canopyPanoramaReveal);
    foregroundCanopyCutoffScreenY = maximumVerticalClimb + treeBaseY - treeHeight;
    verticalClimb = Math.min(verticalClimb, maximumVerticalClimb);
    atmosphere.position.set(0, -BACKGROUND_VERTICAL_OVERSCAN);
    atmosphere.width = window.innerWidth;
    atmosphere.height = window.innerHeight + BACKGROUND_VERTICAL_OVERSCAN * 2;
    addBackgroundPanels(manifest.background![0]!, farLayer, 'far-background', 0.12);
    addDistantGround(treeBaseY);
    addGround();
    addForegroundTrees(treeBaseY);
    if (includeProceduralCanopies) {
      const rearOffsetAtFinish = easedParallaxOffset(maximumVerticalClimb, VERTICAL_PARALLAX.rear);
      midDisplayTreeStream?.finishWithCanopies(
        foregroundCanopyCutoffScreenY,
        rearOffsetAtFinish,
        window.innerHeight,
        window.innerWidth,
        [40, 260],
      );
      farDisplayTreeStream?.finishWithCanopies(
        foregroundCanopyCutoffScreenY,
        rearOffsetAtFinish,
        window.innerHeight,
        window.innerWidth,
        [180, 480],
      );
    }
    playerPhysics.updateScreenWidth(window.innerWidth);
    playerPhysics.respawn(playerInitialX(), playerGroundSurface());
    playerPhysics.setHorizontalRange(
      Math.max(80, playerInitialX() - 48),
      Math.max(180, window.innerWidth - playerInitialX() - 48),
    );
    currentPlayerState = playerPhysics.getState();
    lastCharacterX = currentPlayerState.x;
    characterIdleElapsed = 0;
    activeSurfaceId = null;
    activeHideHoleId = null;
    playerHideProgress = 0;
    hideEntryOffsetX = 0;
    hideEntryOffsetY = 0;
    hideHoleOverlay.visible = false;
    hideCharacterSprite.visible = false;
    hideBall.visible = false;
    activeSurfaceTop = playerGroundSurface();
    cameraRecenterTarget = null;
    cameraRecenterEase = 7.2;
    cameraGroundBounceLock = true;
    lastCameraCenteredSurfaceId = null;
    cameraTrackingMode = 'hold';
    activeCanopyContactId = null;
    canopyLeafBurstCooldown = 0;
    decorationLeafDropCooldown = 0;
    activeDecorationContactIds.clear();
    previousLeafWakePlayerX = currentPlayerState.x;
    buildAnimatedLightRays();
    applyVerticalCamera();
  };

  buildComposition();
  if (captureMode && searchParams.get('climb') === 'top') {
    followPlayerCamera = false;
    await ensureAutomaticCanopies();
    setVerticalClimb(maximumVerticalClimb);
  }

  const branchSurfaces = () => proceduralTreeStream?.getBranchSurfaces(window.innerWidth) ?? [];
  const hideHoles = () => proceduralTreeStream?.getHideHoleBounds(window.innerWidth) ?? [];
  const overlapsSurface = (surface: ForestBranchSurface, x: number, padding = 0) => (
    x + PLAYER_RADIUS * 0.58 >= surface.left - padding
    && x - PLAYER_RADIUS * 0.58 <= surface.right + padding
  );

  const exitTreeHollow = () => {
    if (activeHideHoleId === null) return false;
    activeHideHoleId = null;
    playerHideProgress = 0;
    hideEntryOffsetX = 0;
    hideEntryOffsetY = 0;
    characterSprite.alpha = 1;
    ball.alpha = 1;
    hideHoleOverlay.visible = false;
    hideCharacterSprite.visible = false;
    hideBall.visible = false;
    playerShadow.getView().visible = true;
    return true;
  };

  const tryEnterTreeHollow = (requestedHoleId?: string) => {
    if (activeHideHoleId !== null) return false;
    const playerScreenY = currentPlayerState.y + foregroundLayer.y;
    const nearest = hideHoles()
      .filter((hole) => requestedHoleId === undefined || hole.id === requestedHoleId)
      .map((hole) => ({
        hole,
        dx: Math.abs(currentPlayerState.x - hole.centerX),
        dy: Math.abs(playerScreenY - (hole.centerY + foregroundLayer.y)),
      }))
      .filter(({ hole, dx, dy }) => (
        dx <= hole.width * 0.5 + PLAYER_RADIUS * 0.85
        && dy <= hole.height * 0.5 + PLAYER_RADIUS * 0.7
      ))
      .sort((a, b) => a.dx + a.dy - b.dx - b.dy)[0];
    if (!nearest) return false;
    activeHideHoleId = nearest.hole.id;
    playerHideProgress = 0;
    hideEntryOffsetX = currentPlayerState.x - nearest.hole.centerX;
    hideEntryOffsetY = currentPlayerState.y - nearest.hole.centerY;
    activeSurfaceId = null;
    playerPhysics.clearSurfaceOverride();
    playerPhysics.endJump();
    playerPhysics.forceVelocity(0);
    cameraRecenterTarget = null;
    return true;
  };

  const landOnBranch = (surface: ForestBranchSurface, x: number, impactSpeed = 0) => {
    const centerY = surface.top - PLAYER_RADIUS;
    if (impactSpeed > 0) proceduralTreeStream?.flexBranch(surface, x, impactSpeed);
    cameraRecenterEase = 7.2;
    playerPhysics.landOnSurface(centerY);
    playerPhysics.setPosition(x, centerY + 0.5);
    playerPhysics.forceVelocity(1);
    playerPhysics.update(0);
    currentPlayerState = playerPhysics.getState();
    activeSurfaceId = surface.id;
    activeSurfaceTop = surface.top;
    cameraGroundBounceLock = false;
    if (followPlayerCamera && surface.id !== lastCameraCenteredSurfaceId) {
      cameraRecenterTarget = window.innerHeight * 0.5 - centerY;
      lastCameraCenteredSurfaceId = surface.id;
    }
  };

  const startPlayerJump = () => {
    const jumpedFromBranch = activeSurfaceId !== null;
    const jumped = playerPhysics.startJump();
    if (!jumped) return;
    cameraGroundBounceLock = false;
    if (jumpedFromBranch) {
      playerPhysics.clearSurfaceOverride();
      cameraRecenterTarget = null;
      cameraRecenterEase = 7.2;
    }
    activeSurfaceId = null;
  };

  const applyCaptureTopBranchScenario = () => {
    const captureLanding = searchParams.get('landing');
    if (!captureMode || (
      captureLanding !== 'top-branch'
      && captureLanding !== 'summit-approach'
      && captureLanding !== 'normal-branch'
    )) return;
    const surfacesByTree = new Map<number, ForestBranchSurface[]>();
    for (const surface of branchSurfaces()) {
      if (surface.class === 'nub') continue;
      const treeSurfaces = surfacesByTree.get(surface.treeSequence) ?? [];
      treeSurfaces.push(surface);
      surfacesByTree.set(surface.treeSequence, treeSurfaces);
    }
    const topPair = [...surfacesByTree.values()]
      .map((surfaces) => [...surfaces].sort((a, b) => a.top - b.top))
      .find((surfaces) => surfaces.length >= 2 && surfaces[0]!.right >= 0 && surfaces[0]!.left <= window.innerWidth);
    if (topPair) {
      const topBranch = topPair[0]!;
      const secondBranch = topPair[1]!;
      if (captureLanding === 'normal-branch' && topPair.length >= 3) {
        const normalBranch = topPair[2]!;
        landOnBranch(normalBranch, (normalBranch.left + normalBranch.right) / 2);
        startPlayerJump();
        return;
      }
      landOnBranch(secondBranch, (secondBranch.left + secondBranch.right) / 2);
      startPlayerJump();
      if (captureLanding === 'top-branch') {
        landOnBranch(topBranch, (topBranch.left + topBranch.right) / 2, 620);
        if (cameraRecenterTarget !== null) setVerticalClimb(cameraRecenterTarget);
      } else {
        setVerticalClimb(window.innerHeight * 0.5 - secondBranch.top + PLAYER_RADIUS);
      }
    }
  };
  applyCaptureTopBranchScenario();
  const applyCaptureDecorationScenario = () => {
    if (!captureMode || searchParams.get('decoration') !== 'disturb') return;
    const decoration = proceduralTreeStream?.getDecorationBounds(
      foregroundLayer.y,
      window.innerWidth,
      160,
    ).find((candidate) => candidate.right >= 0 && candidate.left <= window.innerWidth);
    if (decoration) {
      proceduralTreeStream?.disturbDecoration(decoration.id, 1);
      dropDecorationLeaf(decoration.leafX, decoration.leafY);
      activeDecorationContactIds.add(decoration.id);
    }
  };
  applyCaptureDecorationScenario();
  const applyCaptureHideHoleScenario = () => {
    if (!captureMode || searchParams.get('hide') !== 'hollow') return;
    const hole = hideHoles().find((candidate) => (
      candidate.right >= 0 && candidate.left <= window.innerWidth
    ));
    if (!hole) return;
    followPlayerCamera = false;
    if (followPlayerInput) followPlayerInput.checked = false;
    setVerticalClimb(Math.max(0, Math.min(
      maximumVerticalClimb,
      window.innerHeight * 0.48 - hole.centerY,
    )));
    playerPhysics.clearSurfaceOverride();
    playerPhysics.forceVelocity(0);
    playerPhysics.setPosition(hole.centerX, hole.centerY);
    // Hold the deterministic test character at the opening until its input
    // arrives; ordinary gameplay reaches hollows from a real nearby branch.
    playerPhysics.landOnSurface(hole.centerY);
    currentPlayerState = playerPhysics.getState();
  };
  applyCaptureHideHoleScenario();

  const updateBranchDebugOverlay = (surfaces: ForestBranchSurface[]) => {
    hitboxOverlay.clear();
    visibleBranchSurfaceCount = 0;
    if (!showBranchHitboxes) return;
    for (const surface of surfaces) {
      const top = surface.top + foregroundLayer.y;
      if (top < -40 || top > window.innerHeight + 40) continue;
      visibleBranchSurfaceCount += 1;
      const width = surface.right - surface.left;
      hitboxOverlay
        .rect(surface.left, top - 4, width, Math.max(8, surface.height))
        .fill({ color: 0x3cff7a, alpha: 0.22 })
        .stroke({ color: 0x76ff9c, width: 2, alpha: 0.95 });
      hitboxOverlay
        .moveTo(surface.left, top - 11)
        .lineTo(surface.left, top + 15)
        .moveTo(surface.right, top - 11)
        .lineTo(surface.right, top + 15)
        .stroke({ color: 0x38e8ff, width: 3, alpha: 1 });
    }
    for (const hole of hideHoles()) {
      const top = hole.top + foregroundLayer.y;
      if (top > window.innerHeight + 40 || hole.bottom + foregroundLayer.y < -40) continue;
      hitboxOverlay
        .roundRect(hole.left, top, hole.width, hole.height, 18)
        .fill({ color: 0xffc84f, alpha: 0.12 })
        .stroke({ color: 0xffd977, width: 2, alpha: 0.9 });
    }
    const playerScreenY = currentPlayerState.y + foregroundLayer.y;
    hitboxOverlay
      .rect(
        currentPlayerState.x - PLAYER_RADIUS * 0.58,
        playerScreenY - PLAYER_RADIUS,
        PLAYER_RADIUS * 1.16,
        PLAYER_RADIUS * 2,
      )
      .fill({ color: 0xff5c72, alpha: 0.18 })
      .stroke({ color: 0xff7085, width: 2, alpha: 0.9 });
  };

  const updatePlayerVisuals = (surfaces: ForestBranchSurface[], deltaSeconds: number) => {
    const screenY = currentPlayerState.y + foregroundLayer.y;
    const feetY = currentPlayerState.y + PLAYER_RADIUS;
    const shadowSurface = surfaces
      .filter((surface) => overlapsSurface(surface, currentPlayerState.x, 4) && surface.top >= feetY - 2)
      .sort((a, b) => a.top - b.top)[0]?.top ?? playerGroundSurface();
    if (activeHideHoleId === null) {
      playerShadow.getView().visible = true;
      playerShadow.update(
        currentPlayerState.x,
        screenY,
        shadowSurface + foregroundLayer.y,
        1,
        0,
      );
    } else {
      playerShadow.getView().visible = false;
    }

    const horizontalTravel = Math.abs(currentPlayerState.x - lastCharacterX);
    characterIsMoving = playerMovingLeft || playerMovingRight || horizontalTravel > 0.25;
    characterIdleElapsed = characterIsMoving ? 0 : characterIdleElapsed + deltaSeconds;
    if (characterIsMoving && Math.abs(currentPlayerState.velocity) < 260) {
      characterFrameElapsed += deltaSeconds;
      if (characterFrameElapsed >= 0.085) {
        characterFrameElapsed %= 0.085;
        characterFrame = 1 + (characterFrame % 16);
        characterSprite.texture = characterTextures[characterFrame] ?? Texture.EMPTY;
      }
    } else if (characterIdleElapsed >= 0.1) {
      characterFrame = 0;
      characterFrameElapsed = 0;
      characterSprite.texture = characterTextures[0] ?? Texture.EMPTY;
    }
    characterSprite.position.set(
      currentPlayerState.x,
      screenY + PLAYER_RADIUS + 4,
    );
    const hidingScale = 1 - playerHideProgress * 0.16;
    characterSprite.scale.set(
      characterFacing * characterBaseScale * currentPlayerState.scaleX * hidingScale,
      characterBaseScale * currentPlayerState.scaleY * hidingScale,
    );
    characterSprite.alpha = 1;
    ball.alpha = 1;
    const usesInsideStack = activeHideHoleId !== null && playerHideProgress >= 0.42;
    characterSprite.visible = useBunnyCharacter && !usesInsideStack;
    ball.visible = !useBunnyCharacter && !usesInsideStack;
    hideCharacterSprite.texture = characterSprite.texture;
    hideCharacterSprite.position.copyFrom(characterSprite.position);
    hideCharacterSprite.y += PLAYER_RADIUS * 0.46;
    const insideCharacterScale = characterBaseScale * hidingScale;
    hideCharacterSprite.scale.set(characterFacing * insideCharacterScale, insideCharacterScale);
    hideCharacterSprite.tint = 0xe3ece4;
    hideCharacterSprite.alpha = 0.96;
    hideCharacterSprite.visible = useBunnyCharacter && usesInsideStack;
    hideBall.position.copyFrom(ball.position);
    hideBall.y += PLAYER_RADIUS * 0.46;
    hideBall.scale.set(1.06);
    hideBall.tint = 0xc6ded8;
    hideBall.alpha = 0.94;
    hideBall.visible = !useBunnyCharacter && usesInsideStack;
    const holeMetadata = hollowArtRecord?.hideHole;
    if (activeHideHoleId !== null && holeMetadata && playerHideProgress >= 0.42) {
      const activeHole = hideHoles().find((hole) => hole.id === activeHideHoleId);
      if (activeHole) {
        hideHoleOverlay.position.set(
          activeHole.centerX - holeMetadata.center[0] * masterTreeScale,
          activeHole.centerY + foregroundLayer.y - holeMetadata.center[1] * masterTreeScale,
        );
        hideHoleOverlay.scale.set(masterTreeScale);
        hideHoleOverlay.visible = true;
      }
    } else {
      hideHoleOverlay.visible = false;
      hideCharacterSprite.visible = false;
      hideBall.visible = false;
    }
    ball.position.set(currentPlayerState.x, screenY);
    ball.scale.set(currentPlayerState.scaleX, currentPlayerState.scaleY);
    lastCharacterX = currentPlayerState.x;
    updateBranchDebugOverlay(surfaces);
  };

  const updatePlayer = (deltaSeconds: number) => {
    canopyLeafBurstCooldown = Math.max(0, canopyLeafBurstCooldown - deltaSeconds);
    if (activeHideHoleId !== null) {
      const hole = hideHoles().find((candidate) => candidate.id === activeHideHoleId);
      if (!hole) {
        exitTreeHollow();
      } else if (hole.centerX <= 50) {
        exitTreeHollow();
        const safeX = Math.max(80, hole.centerX);
        playerPhysics.setPosition(safeX, hole.centerY);
        playerPhysics.forceVelocity(0);
        currentPlayerState = playerPhysics.getState();
      } else {
        playerHideProgress = Math.min(1, playerHideProgress + deltaSeconds * 4.5);
        const easedEntry = 1 - (1 - playerHideProgress) ** 3;
        playerPhysics.clearSurfaceOverride();
        playerPhysics.endJump();
        playerPhysics.forceVelocity(0);
        playerPhysics.setPosition(
          hole.centerX + hideEntryOffsetX * (1 - easedEntry),
          hole.centerY + hideEntryOffsetY * (1 - easedEntry),
        );
        currentPlayerState = playerPhysics.getState();
        activeSurfaceId = null;
        cameraRecenterTarget = null;
        updatePlayerVisuals(branchSurfaces(), deltaSeconds);
        return;
      }
    }
    const direction = Number(playerMovingRight) - Number(playerMovingLeft);
    if (direction !== 0) {
      characterFacing = direction;
      playerPhysics.setMousePosition(currentPlayerState.x + direction * 520 * deltaSeconds);
    }

    const surfaces = branchSurfaces();
    const previousState = playerPhysics.getState();
    if (activeSurfaceId !== null) {
      const support = surfaces.find((surface) => surface.id === activeSurfaceId);
      const standing = support
        && overlapsSurface(support, previousState.x)
        && Math.abs(previousState.y + PLAYER_RADIUS - support.top) <= 12
        && previousState.velocity >= -25;
      if (standing && support) {
        playerPhysics.landOnSurface(support.top - PLAYER_RADIUS);
        activeSurfaceTop = support.top;
      } else {
        playerPhysics.clearSurfaceOverride();
        activeSurfaceId = null;
        cameraRecenterTarget = null;
      }
    }

    playerPhysics.update(deltaSeconds);
    currentPlayerState = playerPhysics.getState();
    const playerScreenYAfterUpdate = currentPlayerState.y + foregroundLayer.y;
    const canopyContact = proceduralTreeStream?.getCanopyBounds(window.innerWidth)
      .find((canopy) => (
        currentPlayerState.x + PLAYER_RADIUS * 0.7 >= canopy.left
        && currentPlayerState.x - PLAYER_RADIUS * 0.7 <= canopy.right
        && playerScreenYAfterUpdate + PLAYER_RADIUS * 0.72 >= canopy.top + foregroundLayer.y
        && playerScreenYAfterUpdate - PLAYER_RADIUS * 0.72 <= canopy.bottom + foregroundLayer.y
      )) ?? null;
    if (
      canopyContact
      && canopyContact.id !== activeCanopyContactId
      && canopyLeafBurstCooldown <= 0
    ) {
      burstCanopyLeaves(currentPlayerState.x, playerScreenYAfterUpdate - PLAYER_RADIUS * 0.45);
      canopyLeafBurstCooldown = 3;
    }
    activeCanopyContactId = canopyContact?.id ?? null;
    const decorationContacts = proceduralTreeStream?.getDecorationBounds(
      foregroundLayer.y,
      window.innerWidth,
    ).filter((decoration) => (
      currentPlayerState.x + PLAYER_RADIUS * 0.62 >= decoration.left
      && currentPlayerState.x - PLAYER_RADIUS * 0.62 <= decoration.right
      && playerScreenYAfterUpdate + PLAYER_RADIUS * 0.78 >= decoration.top
      && playerScreenYAfterUpdate - PLAYER_RADIUS * 0.78 <= decoration.bottom
    )) ?? [];
    const nextDecorationContactIds = new Set(decorationContacts.map((decoration) => decoration.id));
    for (const decoration of decorationContacts) {
      if (activeDecorationContactIds.has(decoration.id)) continue;
      const movementStrength = Math.min(
        1,
        0.5 + Math.abs(currentPlayerState.x - previousState.x) / Math.max(0.001, deltaSeconds) / 420
          + Math.abs(currentPlayerState.velocity) / 1000,
      );
      proceduralTreeStream?.disturbDecoration(decoration.id, movementStrength);
      if (decorationLeafDropCooldown <= 0) {
        dropDecorationLeaf(decoration.leafX, decoration.leafY);
        decorationLeafDropCooldown = 0.35;
      }
    }
    activeDecorationContactIds = nextDecorationContactIds;
    if (activeSurfaceId === null && currentPlayerState.velocity > 0) {
      const previousFeet = previousState.y + PLAYER_RADIUS;
      const nextFeet = currentPlayerState.y + PLAYER_RADIUS;
      const landing = surfaces
        .filter((surface) => (
          overlapsSurface(surface, currentPlayerState.x)
          && previousFeet <= surface.top + 5
          && nextFeet >= surface.top - 3
        ))
        .sort((a, b) => a.top - b.top)[0];
      if (landing) landOnBranch(landing, currentPlayerState.x, currentPlayerState.velocity);
    }

    if (currentPlayerState.y + PLAYER_RADIUS >= playerGroundSurface() - 1) {
      // Preserve the normal capped ground bounce, but lock the camera on the first
      // floor impact so it never chases the body's progressively smaller rebounds.
      playerPhysics.clearSurfaceOverride();
      activeSurfaceId = null;
      activeSurfaceTop = playerGroundSurface();
      cameraRecenterEase = 7.2;
      cameraGroundBounceLock = true;
      cameraRecenterTarget = null;
      lastCameraCenteredSurfaceId = null;
    }

    if (followPlayerCamera) {
      const playerCenterScreenY = currentPlayerState.y + verticalClimb;
      const playerIsFalling = activeSurfaceId === null && currentPlayerState.velocity > 0;
      const upwardTrigger = Math.max(105, window.innerHeight * 0.16);
      const upwardLookAheadLine = Math.max(165, window.innerHeight * 0.30);
      const fallingDriftLine = window.innerHeight * 0.60;
      const fallingDriftTarget = window.innerHeight * 0.50;
      const fallingEmergencyLine = window.innerHeight * 0.82;
      const fallingEmergencyTarget = window.innerHeight * 0.67;
      let desiredClimb = verticalClimb;
      let cameraRate = 0;
      let cameraEase = 0;
      cameraTrackingMode = 'hold';
      if (cameraGroundBounceLock && verticalClimb > 0.5) {
        desiredClimb = 0;
        cameraEase = 6.5;
        cameraTrackingMode = 'ground-settle';
      } else if (playerIsFalling && playerCenterScreenY > fallingEmergencyLine && verticalClimb > 0) {
        desiredClimb = fallingEmergencyTarget - currentPlayerState.y;
        cameraEase = 14;
        cameraTrackingMode = 'fall-catch';
      } else if (cameraRecenterTarget !== null) {
        desiredClimb = cameraRecenterTarget;
        cameraEase = cameraRecenterEase;
        cameraTrackingMode = 'branch-center';
      } else if (playerCenterScreenY < upwardTrigger) {
        desiredClimb = upwardLookAheadLine - currentPlayerState.y;
        cameraRate = 700;
        cameraTrackingMode = 'climb-edge';
      } else if (playerIsFalling && playerCenterScreenY > fallingDriftLine && verticalClimb > 0) {
        desiredClimb = fallingDriftTarget - currentPlayerState.y;
        cameraRate = 320;
        cameraTrackingMode = 'fall-drift';
      }
      desiredClimb = Math.max(0, Math.min(maximumVerticalClimb, desiredClimb));
      const desiredDelta = desiredClimb - verticalClimb;
      const cameraDelta = cameraEase > 0
        ? desiredDelta * (1 - Math.exp(-cameraEase * deltaSeconds))
        : Math.max(-cameraRate * deltaSeconds, Math.min(cameraRate * deltaSeconds, desiredDelta));
      if (Math.abs(cameraDelta) >= 0.25) setVerticalClimb(verticalClimb + cameraDelta);
      if (cameraGroundBounceLock && verticalClimb <= 0.5 && verticalClimb !== 0) {
        setVerticalClimb(0);
        cameraTrackingMode = 'hold';
      }
      if (cameraRecenterTarget !== null && Math.abs(desiredClimb - verticalClimb) <= 1) {
        cameraRecenterTarget = null;
        cameraTrackingMode = 'hold';
      }
    }
    updatePlayerVisuals(surfaces, deltaSeconds);
  };

  const speedInput = document.querySelector<HTMLInputElement>('#speed');
  const speedOutput = document.querySelector<HTMLOutputElement>('#speed-output');
  const useMasterTreeInput = document.querySelector<HTMLInputElement>('#use-master-tree');
  const useProceduralTreesInput = document.querySelector<HTMLInputElement>('#use-procedural-trees');
  const forestSeedInput = document.querySelector<HTMLInputElement>('#forest-seed');
  const groundStyleInput = document.querySelector<HTMLSelectElement>('#ground-style');
  const masterScaleInput = document.querySelector<HTMLInputElement>('#master-scale');
  const masterScaleOutput = document.querySelector<HTMLOutputElement>('#master-scale-output');
  const updateBaseSpeed = () => {
    if (!speedInput) return;
    baseSpeed = captureMode && searchParams.get('speed') !== null
      ? Math.max(0, Number(searchParams.get('speed')) || 0)
      : Number(speedInput.value);
    speedInput.value = String(baseSpeed);
    if (speedOutput) speedOutput.value = String(baseSpeed);
  };
  updateBaseSpeed();
  speedInput?.addEventListener('input', updateBaseSpeed);
  showHitboxesInput?.addEventListener('change', () => {
    showBranchHitboxes = showHitboxesInput.checked;
    updateBranchDebugOverlay(branchSurfaces());
  });
  if (showAssetFilenamesInput) showAssetFilenamesInput.checked = showAssetFilenames;
  showAssetFilenamesInput?.addEventListener('change', () => {
    showAssetFilenames = showAssetFilenamesInput.checked;
    updateAssetFilenameLabels();
    app.render();
  });
  followPlayerInput?.addEventListener('change', () => {
    followPlayerCamera = followPlayerInput.checked;
    cameraRecenterTarget = null;
  });
  bunnyCharacterInput?.addEventListener('change', () => {
    useBunnyCharacter = bunnyCharacterInput.checked;
    characterSprite.visible = useBunnyCharacter;
    ball.visible = !useBunnyCharacter;
  });
  hudCollapseInput?.addEventListener('click', () => {
    const collapsed = hud?.classList.toggle('collapsed') ?? false;
    hudCollapseInput.textContent = collapsed ? '↓' : '↑';
    hudCollapseInput.setAttribute('aria-expanded', String(!collapsed));
    hudCollapseInput.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Minimize controls');
  });
  verticalClimbInput?.addEventListener('input', () => {
    followPlayerCamera = false;
    cameraRecenterTarget = null;
    if (followPlayerInput) followPlayerInput.checked = false;
    setVerticalClimb(Number(verticalClimbInput.value));
  });

  const updateMasterTreeControls = (rebuild: boolean) => {
    useMasterTree = useMasterTreeInput?.checked ?? true;
    useProceduralTrees = useProceduralTreesInput?.checked ?? true;
    forestSeed = Math.max(1, Math.round(Number(forestSeedInput?.value) || 20260805));
    groundStyle = groundStyleInput?.value === 'moss' || groundStyleInput?.value === 'original'
      ? groundStyleInput.value
      : 'stone';
    if (forestSeedInput) forestSeedInput.value = String(forestSeed);
    masterTreeScale = Number(masterScaleInput?.value ?? 0.6);
    if (masterScaleOutput) masterScaleOutput.value = masterTreeScale.toFixed(2);
    if (rebuild) buildComposition();
  };
  if (groundStyleInput) groundStyleInput.value = groundStyle;
  updateMasterTreeControls(false);
  useMasterTreeInput?.addEventListener('change', () => updateMasterTreeControls(true));
  useProceduralTreesInput?.addEventListener('change', async () => {
    if (!useProceduralTreesInput.checked) {
      updateTextureStatus(' · loading legacy tree mode on demand…');
      await loadRuntimePaths([...masterTreeAssetPaths, ...legacyStandardAssetPaths]);
      updateTextureStatus();
    }
    updateMasterTreeControls(true);
  });
  forestSeedInput?.addEventListener('change', () => updateMasterTreeControls(true));
  groundStyleInput?.addEventListener('change', async () => {
    const requested = groundStyleInput.value === 'moss' || groundStyleInput.value === 'original'
      ? groundStyleInput.value
      : 'stone';
    const record = manifest.ground!.find((candidate) => candidate.path.endsWith(groundPathSuffix(requested)));
    if (record) await loadRuntimePaths([record.path]);
    updateTextureStatus();
    updateMasterTreeControls(true);
  });
  masterScaleInput?.addEventListener('input', () => updateMasterTreeControls(true));

  document.querySelectorAll<HTMLInputElement>('input[data-layer-speed]').forEach((input) => {
    const band = input.dataset.layerSpeed as LayerBand;
    if (!(band in layerSpeeds)) return;
    const output = document.querySelector<HTMLOutputElement>(`output[data-layer-output="${band}"]`);
    const updateSpeed = () => {
      layerSpeeds[band] = Number(input.value);
      if (output) output.value = layerSpeeds[band].toFixed(2);
    };
    updateSpeed();
    input.addEventListener('input', updateSpeed);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const isEditing = target instanceof Element
      && target.matches('input, select, textarea, button');
    if (isEditing) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') {
      event.preventDefault();
      exitTreeHollow();
      playerMovingLeft = true;
      return;
    }
    if (event.key === 'ArrowRight' || key === 'd') {
      event.preventDefault();
      exitTreeHollow();
      playerMovingRight = true;
      return;
    }
    if (event.key === 'ArrowUp' || key === 'w') {
      event.preventDefault();
      if (!event.repeat) {
        if (!exitTreeHollow() && !tryEnterTreeHollow()) startPlayerJump();
      }
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) {
        if (!exitTreeHollow()) startPlayerJump();
      }
    } else if (key === 'p') {
      paused = !paused;
    } else if (key === 'h') {
      showBranchHitboxes = !showBranchHitboxes;
      if (showHitboxesInput) showHitboxesInput.checked = showBranchHitboxes;
      updateBranchDebugOverlay(branchSurfaces());
    } else if (key === 'r') {
      buildComposition();
    } else if (key === 'f') {
      void document.documentElement.requestFullscreen();
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') playerMovingLeft = false;
    if (event.key === 'ArrowRight' || key === 'd') playerMovingRight = false;
    if (event.code === 'Space' || event.key === 'ArrowUp' || key === 'w') playerPhysics.endJump();
  });

  app.canvas.addEventListener('pointermove', (event) => {
    const previousX = currentPlayerState.x;
    playerPhysics.setMousePosition(event.clientX);
    if (Math.abs(event.clientX - previousX) > 2) characterFacing = event.clientX < previousX ? -1 : 1;
  });
  app.canvas.addEventListener('pointerdown', (event) => {
    const clickedHole = hideHoles().find((hole) => (
      event.clientX >= hole.left
      && event.clientX <= hole.right
      && event.clientY >= hole.top + foregroundLayer.y
      && event.clientY <= hole.bottom + foregroundLayer.y
    ));
    if (clickedHole && activeHideHoleId === null && tryEnterTreeHollow(clickedHole.id)) {
      event.preventDefault();
      return;
    }
    playerPhysics.setMousePosition(event.clientX);
    if (!exitTreeHollow()) startPlayerJump();
  });
  window.addEventListener('pointerup', () => playerPhysics.endJump());

  window.addEventListener('wheel', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('#hud')) return;
    event.preventDefault();
    followPlayerCamera = false;
    cameraRecenterTarget = null;
    if (followPlayerInput) followPlayerInput.checked = false;
    setVerticalClimb(verticalClimb - event.deltaY * 1.15);
  }, { passive: false });

  window.addEventListener('resize', () => {
    buildComposition();
    applyCaptureTopBranchScenario();
    applyCaptureDecorationScenario();
    applyCaptureHideHoleScenario();
  });

  const updateScene = (deltaSeconds: number) => {
    if (paused) return;
    canopySkyTravelPx += baseSpeed * layerSpeeds['canopy-sky'] * deltaSeconds;
    updateCanopySky();
    const exactWorldDistance = baseSpeed * layerSpeeds.foreground * deltaSeconds + worldScrollRemainder;
    const worldDistance = Math.floor(exactWorldDistance);
    worldScrollRemainder = exactWorldDistance - worldDistance;
    proceduralTreeStream?.update(worldDistance, foregroundLayer.y, window.innerHeight, window.innerWidth);
    proceduralTreeStream?.updateBranchFlex(deltaSeconds);
    farDisplayTreeStream?.update(
      baseSpeed * layerSpeeds['mid-background'] * deltaSeconds,
      rearLayer.y,
      window.innerHeight,
      window.innerWidth,
    );
    midDisplayTreeStream?.update(
      baseSpeed * layerSpeeds['rare-complete-mid'] * deltaSeconds,
      rearTreeLayer.y,
      window.innerHeight,
      window.innerWidth,
    );
    const rightmostByBand = new Map<string, number>();
    const furthestAnchorByBand = new Map<string, number>();
    for (const item of items) {
      const layerSpeed = layerSpeeds[item.band] ?? item.speed;
      const sharesWorldPixelGrid = item.band === 'foreground'
        || (item.band === 'ground' && layerSpeeds.ground === layerSpeeds.foreground);
      item.view.x -= sharesWorldPixelGrid ? worldDistance : baseSpeed * layerSpeed * deltaSeconds;
      rightmostByBand.set(item.band, Math.max(rightmostByBand.get(item.band) ?? window.innerWidth, itemRight(item)));
      furthestAnchorByBand.set(item.band, Math.max(furthestAnchorByBand.get(item.band) ?? window.innerWidth, item.view.x));
    }
    for (const item of items) {
      if (itemRight(item) < -120) {
        if (item.centered) {
          item.view.x = (furthestAnchorByBand.get(item.band) ?? window.innerWidth) + randomBetween(item.recycleGap);
          furthestAnchorByBand.set(item.band, item.view.x);
        } else {
          item.view.x = (rightmostByBand.get(item.band) ?? window.innerWidth) + randomBetween(item.recycleGap);
        }
        rightmostByBand.set(item.band, itemRight(item));
      }
    }
    // Camera following can change verticalClimb. Update it before atmosphere so
    // diagonal-ray counter positioning uses this frame's camera transform rather
    // than trailing it by one frame during jumps.
    updatePlayer(deltaSeconds);
    updateFallingLeaves(deltaSeconds, worldDistance);
    updateCanopyBurstLeaves(deltaSeconds, worldDistance);
    updateAnimatedLightRays(deltaSeconds, worldDistance);
  };

  app.ticker.add((ticker) => {
    updateScene(ticker.deltaMS / 1000);
    updateAssetFilenameLabels();
  });
  if (new URLSearchParams(window.location.search).has('capture')) {
    app.ticker.stop();
  }

  (window as Window & { render_game_to_text?: () => string }).render_game_to_text = () =>
    JSON.stringify({
      mode: 'forest-biome-sandbox',
      coordinates: 'screen/world origin is top-left; +x right; +y down',
      renderer: 'webgl',
      textures: loadedRuntimePaths.size,
      scrollingItems: items.length,
      paused,
      speed: baseSpeed,
      layerSpeeds,
      assetFilenameLabels: {
        enabled: showAssetFilenames,
        visible: visibleAssetFilenameCount,
        filenames: [...new Set(visibleAssetFilenames)],
      },
      groundStyle,
      groundTexture: currentGroundRecord().path,
      distantGround: {
        baseTexture: manifest.distantGround?.[0]?.path ?? null,
        detailVariants: (manifest.distantGroundDetails ?? []).map((record) => record.path),
      },
      fallingLeaves: {
        active: fallingLeaves.length,
        visible: fallingLeaves.filter((leaf) => leaf.view.visible).length,
        rear: fallingLeaves.filter((leaf) => leaf.depth === 'rear').length,
        near: fallingLeaves.filter((leaf) => leaf.depth === 'near').length,
        densityScale: 1 / 3,
        sizeScale: 1.5,
        distribution: 'even horizontal lanes with jitter and golden-ratio vertical staggering',
        foregroundShare: 0.25,
        playerWake: {
          radius: 115,
          directionalPush: 46,
          maximumHorizontalVelocity: 72,
          maximumSpeedContribution: 18,
          spinBoost: 7,
        },
        canopyBursts: canopyLeafBurstCount,
        activeCanopyBurstLeaves: canopyBurstLeaves.length,
        activeDecorationLeaves: canopyBurstLeaves.filter((leaf) => leaf.kind === 'decoration').length,
        decorationLeafMaximum: 1,
        decorationLeafWidthPx: [7, 9],
        canopyCeilingY: Math.round(fallingLeafCeiling()),
        imageVariants: (manifest.fallingLeaves ?? []).map((record) => record.path),
        samples: fallingLeaves.map((leaf) => ({
          depth: leaf.depth,
          x: Math.round(leaf.x),
          y: Math.round(leaf.y),
          fallSpeed: Math.round(leaf.fallSpeed),
          renderedWidth: Math.round(leaf.view.width),
          scaleX: Number(leaf.view.scale.x.toFixed(4)),
          spinImpulse: Number(leaf.spinImpulse.toFixed(2)),
          wakeVelocityX: Number(leaf.wakeVelocityX.toFixed(1)),
        })),
      },
      animatedLighting: {
        active: animatedLightRays.length + Number(animatedAccentRay !== null),
        rear: animatedLightRays.filter((ray) => ray.depth === 'rear').length,
        playerLevel: animatedLightRays.filter((ray) => ray.depth === 'player').length
          + Number(animatedAccentRay !== null),
        canopyCeilingY: Math.round(fallingLeafCeiling()),
        direction: 'top-left to bottom-right',
        angleFromVerticalDegrees: 28,
        opacityMode: 'steady',
        animation: 'tree-height world rays; stationary shafts and feather windows with independently moving motes',
        verticalBehavior: 'exact playable-tree world transform; vertical camera never changes ray X',
        recycling: {
          offscreenSpawnMargin: LIGHT_RAY_SPAWN_MARGIN,
          minimumSpacing: LIGHT_RAY_MIN_GAP,
          jitter: 180,
        },
        lightOrbs: {
          total: animatedLightRays.reduce((total, ray) => total + ray.orbs.length, 0),
          crispMotes: animatedLightRays.reduce(
            (total, ray) => total + ray.orbs.filter((orb) => orb.crisp).length,
            0,
          ),
          playerReactive: true,
        },
        accentFrontRay: animatedAccentRay ? {
          active: true,
          worldOffsetX: Math.round(animatedAccentRay.worldX),
          softBlurredBase: true,
          hardHighlightMasked: true,
          fullyTransparentGaps: true,
          maskShape: 'alpha-textured skewed canopy windows',
          maskFeatherPx: ACCENT_MASK_FEATHER_PX,
          maskOffset: {
            x: Math.round(playerAccentSegmentMask.x - (
              animatedAccentRay.worldX + animatedAccentRay.renderedWidth * 0.5
            )),
            y: Math.round(playerAccentSegmentMask.y - playerAccentMaskBaseY),
            rotation: Number(playerAccentSegmentMask.rotation.toFixed(3)),
          },
        } : { active: false },
        samples: animatedLightRays.slice(0, 4).map((ray) => ({
          depth: ray.depth,
          worldOffsetX: Math.round(ray.view.x),
          hardWorldOffsetX: Math.round(ray.hardView.x),
          hardWorldOffsetY: Math.round(ray.hardView.y),
          horizontalCenterX: Math.round(lightRayHorizontalCenterX(ray)),
          layerY: Math.round(lightRayLayerY(ray)),
          foregroundLayerY: Math.round(foregroundLayer.y),
          alpha: Number(ray.view.alpha.toFixed(3)),
          bandOffsets: ray.bands.map((band) => Math.round(band.view.x)),
        })),
      },
      player: {
        character: useBunnyCharacter ? 'bunny' : 'blue-ball',
        x: Math.round(currentPlayerState.x),
        worldY: Math.round(currentPlayerState.y),
        screenY: Math.round(currentPlayerState.y + foregroundLayer.y),
        feetY: Math.round(currentPlayerState.y + PLAYER_RADIUS),
        verticalVelocity: Math.round(currentPlayerState.velocity),
        scaleX: Number(currentPlayerState.scaleX.toFixed(3)),
        scaleY: Number(currentPlayerState.scaleY.toFixed(3)),
        jumpCount: playerPhysics.getJumpCount(),
        activeSurfaceId,
        hiding: activeHideHoleId !== null,
        hideHoleId: activeHideHoleId,
        hideProgress: Number(playerHideProgress.toFixed(3)),
        attackTargetable: activeHideHoleId === null,
        activeSurfaceTop: Math.round(activeSurfaceTop),
        cameraFollow: followPlayerCamera,
        animationFrame: characterFrame,
        animationMoving: characterIsMoving,
        visual: {
          visible: characterSprite.visible,
          renderable: characterSprite.renderable,
          alpha: Number(characterSprite.alpha.toFixed(2)),
          textureSize: [characterSprite.texture.width, characterSprite.texture.height],
          stageIndex: app.stage.getChildIndex(characterSprite),
          overlayVisible: hideHoleOverlay.visible,
          insideCharacterVisible: hideCharacterSprite.visible,
          overlayStageIndex: app.stage.getChildIndex(hideCompositeLayer),
        },
      },
      treeHollows: {
        available: hideHoles().length,
        activeId: activeHideHoleId,
        controls: 'press Up or W nearby to enter/exit; move or Space exits',
        visible: hideHoles().filter((hole) => (
          hole.right >= 0
          && hole.left <= window.innerWidth
          && hole.bottom + foregroundLayer.y >= 0
          && hole.top + foregroundLayer.y <= window.innerHeight
        )).map((hole) => ({
          id: hole.id,
          centerX: Math.round(hole.centerX),
          centerY: Math.round(hole.centerY + foregroundLayer.y),
          width: Math.round(hole.width),
          height: Math.round(hole.height),
        })),
      },
      branchCollisions: {
        oneWayLandingSurfaces: branchSurfaces().length,
        visibleDebugSurfaces: visibleBranchSurfaceCount,
        debugVisible: showBranchHitboxes,
        playerRadius: PLAYER_RADIUS,
        endpointColor: 'cyan',
        surfaceColor: 'green',
      },
      masterTree: {
        enabled: useMasterTree,
        middleSections: masterMiddleCount,
        scale: masterTreeScale,
        highResolutionSource: masterTreeManifest.sourceSize ?? null,
        runtimeResolution: masterTreeManifest.runtimeSize ?? null,
        designPixelsPerUnit: masterTreeManifest.designPixelsPerUnit ?? { x: 1, y: 1 },
        seamStrategy: 'source-overlap plus feathered connector belt',
      },
      proceduralTreeStream: useProceduralTrees ? proceduralTreeStream?.getState(window.innerWidth) ?? null : null,
      branchFlex: {
        visualOnly: true,
        collisionSurfaceMoves: false,
        pinnedSocket: true,
        active: proceduralTreeStream?.getBranchFlexState() ?? [],
        activeDecorations: proceduralTreeStream?.getDecorationFlexState() ?? [],
      },
      cullingV1: useProceduralTrees ? proceduralTreeStream?.getCullingState() ?? null : null,
      displayTreeStreams: {
        far: farDisplayTreeStream?.getState() ?? null,
        mid: midDisplayTreeStream?.getState() ?? null,
        treatment: 'art-authored; no runtime color controls',
      },
      proceduralCanopies: {
        enabled: includeProceduralCanopies,
        texturesLoaded: proceduralCanopiesLoaded,
        preloadedBeforeGameplay: proceduralCanopiesLoaded,
      },
      canopySky: {
        visible: canopySkySprite.visible,
        speed: layerSpeeds['canopy-sky'],
        travelPx: Math.round(canopySkyTravelPx),
        offsetX: Math.round(canopySkyOffsetX),
      },
      verticalCamera: {
        climb: Math.round(verticalClimb),
        maximumClimb: Math.round(maximumVerticalClimb),
        percentage: Number((verticalClimb / maximumVerticalClimb).toFixed(3)),
        groundScreenY: Math.round(groundY + groundLayer.y),
        tracking: {
          mode: cameraTrackingMode,
          summitFramingEnabled: false,
          groundBounceLocked: cameraGroundBounceLock,
          branchRecenterTarget: cameraRecenterTarget === null ? null : Math.round(cameraRecenterTarget),
          upwardTriggerRatio: 0.16,
          upwardLookAheadRatio: 0.30,
          fallingDriftRatio: 0.60,
          fallingDriftTargetRatio: 0.50,
          fallingEmergencyRatio: 0.82,
          fallingEmergencyTargetRatio: 0.67,
        },
        parallax: VERTICAL_PARALLAX,
        parallaxEase: {
          delay: PARALLAX_EASE_DELAY,
          transitionDistance: PARALLAX_EASE_DISTANCE,
          strength: PARALLAX_EASE_STRENGTH,
          rearInitialFactor: Number((
            VERTICAL_PARALLAX.rear
            + (1 - VERTICAL_PARALLAX.rear) * PARALLAX_EASE_STRENGTH
          ).toFixed(3)),
          farOffset: Math.round(farLayer.y),
          rearOffset: Math.round(rearLayer.y),
        },
      },
      layers: ['far-background', 'canopy-sky', 'far-display-trees', 'rear-light-rays', 'rear-ground', 'rooted-mid-display-trees', 'falling-leaves-rear', 'ground', 'playable-foreground', 'falling-leaves-near (nested foreground child)', 'front-light-rays'],
      constraints: {
        maximumParallaxSpeed: Math.max(...Object.values(layerSpeeds)),
        foregroundTreeTarget: '3-4 visible',
        groundDetails: 'distant forest-floor variants only; foreground ground art remains clean',
        hangingDetails: 'branch platforms only',
      },
      performance: {
        resolution: app.renderer.resolution,
        offscreenCulling: true,
        treeSpriteCullMargin: 420,
        groundLayerCullMargin: 180,
        groundLayerRenderable: groundLayer.renderable,
        distantGroundLayerRenderable: distantGroundLayer.renderable,
        groundTextureState,
        poolWidthMultiplier: POOL_WIDTH_MULTIPLIER,
      },
    });
  (window as Window & { advanceTime?: (milliseconds: number) => void }).advanceTime = (milliseconds) => {
    const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
    for (let step = 0; step < steps; step++) updateScene(1 / 60);
    updateAssetFilenameLabels();
    app.render();
  };
};

void init();
