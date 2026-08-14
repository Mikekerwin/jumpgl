import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getPlayerJumpReach } from './playerPhysics';

type ArtRecord = { id: string; label: string; path: string; width: number; height: number };
type DecorationArtRecord = ArtRecord & { side: 'left' | 'right'; socket: [number, number] };
type StackManifest = {
  width: number;
  connector: { height: number; path: string; width: number };
  layout: {
    canopyHeight: number;
    middleHeight: number;
    middleStep: number;
    baseHeight: number;
    treeScale: number;
    defaultMiddleCount: number;
  };
  middles: ArtRecord[];
  bases: ArtRecord[];
  canopies: ArtRecord[];
  decorations: DecorationArtRecord[];
};
type AttachmentRecord = {
  path: string;
  width: number;
  height: number;
  socket: [number, number];
  class: string;
  side: 'left' | 'right' | 'center';
  canonicalSocket: [number, number];
};
type AttachmentManifest = { attachments: Record<string, AttachmentRecord> };
type BranchRole = 'playable' | 'empty';
type TreeId = 'left' | 'right';
type DecorationState = { name: string; side: 'left' | 'right'; targetY: number };
type ModuleState = {
  index: number;
  art: string;
  branch: string | null;
  branchRole: BranchRole;
  y: number;
  branchY: number | null;
  gapToLowerPx: number | null;
  decorations: DecorationState[];
};
type RouteAnchor = {
  id: string;
  tree: TreeId;
  branch: string;
  x: number;
  y: number;
  gapToLowerPx: number | null;
};
type CrossTreePair = {
  moduleIndex: number;
  mode: 'transfer' | 'closed' | 'outward';
  leftBranch: string;
  rightBranch: string;
  leftY: number;
  rightY: number;
  horizontalGapPx: number | null;
  verticalGapPx: number;
  reachable: boolean;
};
type RuntimeWindow = Window & {
  advanceTime?: (ms: number) => void;
  render_game_to_text?: () => string;
};

const runtimeWindow = window as RuntimeWindow;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const init = async () => {
  const app = new Application();
  await app.init({
    resizeTo: window,
    preference: 'webgl',
    powerPreference: 'high-performance',
    antialias: false,
    preserveDrawingBuffer: true,
    backgroundColor: 0x143b35,
    resolution: Math.min(window.devicePixelRatio, 1.25),
    autoDensity: true,
    roundPixels: true,
  });
  byId<HTMLDivElement>('app').replaceChildren(app.canvas);

  const sandboxBase = `${import.meta.env.BASE_URL}forest-sandbox/`;
  const [stackManifest, attachmentManifest] = await Promise.all([
    fetch(`${sandboxBase}assets/stacking-tree/manifest.json`).then((response) => {
      if (!response.ok) throw new Error(`Stack manifest ${response.status}`);
      return response.json() as Promise<StackManifest>;
    }),
    fetch(`${sandboxBase}assets/attachment-proof/manifest.json`).then((response) => {
      if (!response.ok) throw new Error(`Attachment manifest ${response.status}`);
      return response.json() as Promise<AttachmentManifest>;
    }),
  ]);
  const backgroundPath = `${sandboxBase}assets/trees/background.jpg`;
  const allArt = [
    ...stackManifest.middles,
    ...stackManifest.bases,
    ...stackManifest.canopies,
    ...stackManifest.decorations,
  ];
  for (const record of allArt) record.path = `${sandboxBase}${record.path}`;
  const branchNames = [
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
  for (const name of branchNames) {
    const record = attachmentManifest.attachments[name];
    if (record) record.path = `${sandboxBase}${record.path}`;
  }
  await Promise.all([
    ...allArt.map((record) => Assets.load(record.path)),
    ...branchNames.map((name) => Assets.load(attachmentManifest.attachments[name]!.path)),
    Assets.load(backgroundPath),
  ]);

  const background = new Sprite(Texture.from(backgroundPath));
  background.alpha = 0.9;
  app.stage.addChild(background);
  const shade = new Graphics();
  app.stage.addChild(shade);
  const scene = new Container();
  const tree = new Container();
  scene.addChild(tree);
  app.stage.addChild(scene);
  const renderNow = () => app.renderer.render(app.stage);

  const status = byId<HTMLDivElement>('status');
  const seedInput = byId<HTMLInputElement>('seed');
  const baseSelect = byId<HTMLSelectElement>('base-select');
  const canopySelect = byId<HTMLSelectElement>('canopy-select');
  const middleInput = byId<HTMLInputElement>('middle-count');
  const middleOutput = byId<HTMLOutputElement>('middle-count-output');
  const scaleInput = byId<HTMLInputElement>('tree-scale');
  const scaleOutput = byId<HTMLOutputElement>('tree-scale-output');
  const climbInput = byId<HTMLInputElement>('climb');
  const climbOutput = byId<HTMLOutputElement>('climb-output');
  const seamsInput = byId<HTMLInputElement>('show-seams');
  const routeInput = byId<HTMLInputElement>('show-route');
  const autoInput = byId<HTMLInputElement>('auto-climb');
  const jumpMetrics = byId<HTMLDivElement>('jump-metrics');

  const addOptions = (select: HTMLSelectElement, records: ArtRecord[]) => {
    select.replaceChildren(...records.map((record) => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = record.label;
      return option;
    }));
  };
  addOptions(baseSelect, stackManifest.bases);
  addOptions(canopySelect, stackManifest.canopies);
  const query = new URLSearchParams(window.location.search);
  const requestedSeed = Number(query.get('seed'));
  seedInput.value = String(Number.isFinite(requestedSeed) && requestedSeed >= 1
    ? Math.min(9_999_999, Math.round(requestedSeed))
    : 1847);
  const requestedBase = query.get('base');
  const requestedCanopy = query.get('canopy');
  baseSelect.value = stackManifest.bases.some((record) => record.id === requestedBase)
    ? requestedBase!
    : 'base-original';
  canopySelect.value = stackManifest.canopies.some((record) => record.id === requestedCanopy)
    ? requestedCanopy!
    : 'canopy-original';
  const requestedLevels = Number(query.get('levels'));
  middleInput.value = String(Number.isFinite(requestedLevels)
    ? Math.max(6, Math.min(24, Math.round(requestedLevels)))
    : stackManifest.layout.defaultMiddleCount);
  const requestedScale = Number(query.get('scale'));
  scaleInput.value = String(Number.isFinite(requestedScale) && requestedScale > 0
    ? Math.max(0.45, Math.min(0.78, requestedScale))
    : stackManifest.layout.treeScale);
  seamsInput.checked = query.get('seams') === '1';
  routeInput.checked = query.get('route') === '1';
  middleOutput.value = middleInput.value;
  scaleOutput.value = Number(scaleInput.value).toFixed(2);

  let modules: ModuleState[] = [];
  let secondModules: ModuleState[] = [];
  let totalHeight = 1;
  let climbDistance = 0;
  let maximumClimb = 1;
  let cameraY = 0;
  let movingUp = false;
  let movingDown = false;
  let seamGraphics: Graphics | null = null;
  let routeGraphics: Graphics | null = null;
  let player: Container | null = null;
  let routeAnchors: RouteAnchor[] = [];
  let crossTreePairs: CrossTreePair[] = [];
  const treeSpacing = 850;
  const forestWidth = stackManifest.width + treeSpacing;
  const jumpReach = getPlayerJumpReach();
  jumpMetrics.textContent = `Jump reach · tap ${Math.round(jumpReach.tapSingle)}px · held ${Math.round(jumpReach.heldSingle)}px · held double ${Math.round(jumpReach.heldDouble)}px`;

  const texture = (record: ArtRecord | AttachmentRecord) => Texture.from(record.path);
  const createRng = (seed: number) => {
    let state = seed >>> 0 || 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  };
  const choose = <T>(items: T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

  const clearTree = () => {
    for (const child of tree.removeChildren()) child.destroy({ children: true });
    seamGraphics = null;
    routeGraphics = null;
    player = null;
    routeAnchors = [];
    crossTreePairs = [];
  };

  const branchTargetY = (record: AttachmentRecord) => {
    if (record.class === 'long') return 154;
    if (record.class === 'medium') return 205;
    if (record.class === 'small') return 232;
    return 112;
  };

  const branchTargetX = (record: AttachmentRecord) => (
    stackManifest.width / 2 + (record.canonicalSocket[0] - 512)
  );

  const branchRouteX = (record: AttachmentRecord, treeOffsetX = 0) => (
    treeOffsetX + branchTargetX(record) + (record.side === 'left' ? -128 : 128)
  );

  const outwardReach = (record: AttachmentRecord) => (
    record.side === 'left' ? record.socket[0] : record.width - record.socket[0]
  );

  const build = () => {
    clearTree();
    const seed = Math.max(1, Math.round(Number(seedInput.value) || 1));
    seedInput.value = String(seed);
    const random = createRng(seed);
    const middleCount = Math.round(Number(middleInput.value));
    const canopy = stackManifest.canopies.find((record) => record.id === canopySelect.value) ?? stackManifest.canopies[0]!;
    const base = stackManifest.bases.find((record) => record.id === baseSelect.value) ?? stackManifest.bases[0]!;
    const { canopyHeight, middleStep, baseHeight } = stackManifest.layout;
    const firstMiddleY = canopyHeight - stackManifest.connector.height;
    const baseY = firstMiddleY + middleCount * middleStep;
    totalHeight = baseY + baseHeight;

    const trunkLayer = new Container();
    const detailLayer = new Container();
    const branchLayer = new Container();
    const middleSprites = new Map<number, Sprite>();
    const secondMiddleSprites = new Map<number, Sprite>();
    tree.addChild(trunkLayer, detailLayer, branchLayer);
    const canopySprite = new Sprite(texture(canopy));
    canopySprite.position.x = (stackManifest.width - canopy.width) / 2;
    trunkLayer.addChild(canopySprite);
    const secondCanopySprite = new Sprite(texture(canopy));
    secondCanopySprite.position.x = treeSpacing + (stackManifest.width - canopy.width) / 2;
    trunkLayer.addChild(secondCanopySprite);

    modules = [];
    secondModules = [];
    let previousArt = '';
    let previousSecondArt = '';
    for (let index = 0; index < middleCount; index++) {
      let art = choose(stackManifest.middles, random);
      if (art.id === previousArt && stackManifest.middles.length > 1) {
        art = stackManifest.middles[(stackManifest.middles.indexOf(art) + 1) % stackManifest.middles.length]!;
      }
      previousArt = art.id;
      const moduleY = firstMiddleY + index * middleStep;
      const middleSprite = new Sprite(texture(art));
      middleSprite.position.set(0, moduleY);
      trunkLayer.addChild(middleSprite);
      middleSprites.set(index, middleSprite);
      modules.push({
        index,
        art: art.id,
        branch: null,
        branchRole: 'empty',
        y: moduleY,
        branchY: null,
        gapToLowerPx: null,
        decorations: [],
      });

      let secondArt = choose(stackManifest.middles, random);
      if (secondArt.id === previousSecondArt && stackManifest.middles.length > 1) {
        secondArt = stackManifest.middles[(stackManifest.middles.indexOf(secondArt) + 1) % stackManifest.middles.length]!;
      }
      previousSecondArt = secondArt.id;
      const secondMiddleSprite = new Sprite(texture(secondArt));
      secondMiddleSprite.position.set(treeSpacing, moduleY);
      trunkLayer.addChild(secondMiddleSprite);
      secondMiddleSprites.set(index, secondMiddleSprite);
      secondModules.push({
        index,
        art: secondArt.id,
        branch: null,
        branchRole: 'empty',
        y: moduleY,
        branchY: null,
        gapToLowerPx: null,
        decorations: [],
      });
    }

    const baseSprite = new Sprite(texture(base));
    baseSprite.position.set(0, baseY);
    trunkLayer.addChild(baseSprite);
    const secondBaseSprite = new Sprite(texture(base));
    secondBaseSprite.position.set(treeSpacing, baseY);
    trunkLayer.addChild(secondBaseSprite);

    const scale = Number(scaleInput.value);
    const playableNames = [
      'small-left-a',
      'small-left-b',
      'medium-right-straight-c',
      'midlong-left-b',
      'midlong-right-b',
      'long-right-a',
      'long-left-a',
      'nub-right-a',
      'nub-right-b',
    ];
    const sideRhythms: Array<Array<'switch' | 'stay'>> = [
      ['switch', 'stay', 'switch', 'switch', 'stay', 'switch', 'stay'],
      ['stay', 'switch', 'switch', 'stay', 'switch', 'stay', 'switch'],
      ['switch', 'switch', 'stay', 'switch', 'stay', 'switch', 'switch'],
    ];
    const sideRhythm = choose(sideRhythms, random);
    let sideRhythmIndex = Math.floor(random() * sideRhythm.length);

    const pickPlayable = (
      lowerY: number,
      upperModuleY: number,
      desiredSide: 'left' | 'right',
      challenge: boolean,
      previousName: string,
      forcedNames: string[] | null = null,
    ) => {
      const nubFollowUp = forcedNames !== null;
      const compactCenter = middleStep * scale;
      const targetGap = choose(
        nubFollowUp
          ? [150, 170, 190]
          : challenge
            ? [300, 330, 360, 390]
            : [-45, -23, 0, 23, 45].map((offset) => (
              Math.max(155, Math.min(jumpReach.tapDouble * 0.8, compactCenter + offset))
            )),
        random,
      );
      const minimumGap = nubFollowUp ? 145 : challenge ? 290 : 150;
      const maximumGap = nubFollowUp
        ? 205
        : challenge
          ? Math.min(400, jumpReach.heldSingle * 0.76)
          : jumpReach.tapDouble * 0.82;
      const candidateNames = (forcedNames ?? playableNames)
        .filter((name) => !challenge || attachmentManifest.attachments[name]!.class !== 'nub');
      const previousAttachment = attachmentManifest.attachments[previousName]!;
      const localOffsets = challenge
        ? [-118, -88, -58, -28, 0, 30, 60, 90, 118]
        : [-110, -82, -56, -30, 0, 30, 56, 82, 110];
      const scored = candidateNames
        .flatMap((name) => localOffsets.map((offset) => {
          const record = attachmentManifest.attachments[name]!;
          const localY = Math.max(58, Math.min(316, branchTargetY(record) + offset));
          const upperY = upperModuleY + localY;
          const gap = (lowerY - upperY) * scale;
          let score = Math.abs(gap - targetGap) + random() * 16;
          if (gap < minimumGap) score += (minimumGap - gap) * 7;
          if (gap > maximumGap) score += (gap - maximumGap) * 10;
          if (record.side !== desiredSide) score += 95;
          if (challenge && record.class !== 'long') score += 24;
          if (!challenge && record.class === 'long') score += 22;
          if (name === previousName) score += 48;
          if (record.class === 'nub' && previousAttachment.side === 'right') score += 90;
          return { name, gap, score, localY };
        }));
      const withinSafeBand = scored.filter(({ gap }) => gap >= minimumGap && gap <= maximumGap);
      return (withinSafeBand.length > 0 ? withinSafeBand : scored)
        .sort((a, b) => a.score - b.score)[0]!;
    };

    const placeBranch = (name: string, targetY: number, treeOffsetX = 0) => {
      const attachment = attachmentManifest.attachments[name]!;
      const branch = new Sprite(texture(attachment));
      const targetX = treeOffsetX + branchTargetX(attachment);
      branch.position.set(targetX - attachment.socket[0], targetY - attachment.socket[1]);
      branchLayer.addChild(branch);
      return attachment;
    };

    const baseBranchName = random() > 0.5
      ? choose(['small-left-a', 'small-left-b'], random)
      : 'medium-right-a';
    const baseBranchY = baseY + 205;
    const baseAttachment = placeBranch(baseBranchName, baseBranchY);
    routeAnchors.push({
      id: 'base-start',
      tree: 'left',
      branch: baseBranchName,
      x: branchRouteX(baseAttachment),
      y: baseBranchY,
      gapToLowerPx: null,
    });
    const secondBaseBranchName = random() > 0.5 ? 'medium-right-a' : choose(['small-left-a', 'small-left-b'], random);
    const secondBaseBranchY = baseY + 205;
    const secondBaseAttachment = placeBranch(secondBaseBranchName, secondBaseBranchY, treeSpacing);

    let lowerY = baseBranchY;
    let lowerName = baseBranchName;
    let previousSide: 'left' | 'right' = baseAttachment.side === 'left' ? 'left' : 'right';
    let moduleIndex = middleCount - 1;
    let challenge = false;
    let forceCompactAfterNub = false;
    let compactStepsSinceChallenge = 3 + Math.floor(random() * 3);
    while (moduleIndex >= 0) {
      const module = modules[moduleIndex]!;
      const sideMove = sideRhythm[sideRhythmIndex % sideRhythm.length]!;
      sideRhythmIndex++;
      const desiredSide: 'left' | 'right' = forceCompactAfterNub
        ? 'right'
        : sideMove === 'switch'
          ? (previousSide === 'left' ? 'right' : 'left')
          : previousSide;
      const picked = pickPlayable(
        lowerY,
        module.y,
        desiredSide,
        challenge,
        lowerName,
        forceCompactAfterNub ? ['medium-right-straight-c'] : null,
      );
      forceCompactAfterNub = false;
      const attachment = attachmentManifest.attachments[picked.name]!;
      const targetY = module.y + picked.localY;
      module.branch = picked.name;
      module.branchRole = 'playable';
      module.branchY = targetY;
      module.gapToLowerPx = Math.round(picked.gap);
      routeAnchors.push({
        id: `module-${module.index}`,
        tree: 'left',
        branch: picked.name,
        x: branchRouteX(attachment),
        y: targetY,
        gapToLowerPx: Math.round(picked.gap),
      });

      lowerY = targetY;
      lowerName = picked.name;
      previousSide = attachment.side === 'left' ? 'left' : 'right';
      let nextChallenge = false;
      if (attachment.class === 'nub' && moduleIndex > 0 && random() < 0.82) {
        forceCompactAfterNub = true;
      } else if (
        moduleIndex > 0
        && compactStepsSinceChallenge >= 5
        && (compactStepsSinceChallenge >= 9 || random() < 0.18)
      ) {
        nextChallenge = true;
      }
      moduleIndex -= 1;
      challenge = nextChallenge;
      compactStepsSinceChallenge = challenge ? 0 : compactStepsSinceChallenge + 1;
    }

    // Build the second tree as a response to the first instead of running another
    // independent randomizer. Inner-facing pairs become deliberate transfer beats,
    // deliberately closed short gaps, or outward pairs that cannot collide.
    let secondLowerY = secondBaseBranchY;
    let forceTransferAbove = false;
    let levelsSinceTransfer = 2 + Math.floor(random() * 2);
    let leftLeadsTransfer = random() > 0.5;
    let offsetDirection = random() > 0.5 ? 1 : -1;
    let previousRightName = secondBaseBranchName;
    let previousRightClass = secondBaseAttachment.class;
    let rightClassRun = 1;
    let previousLeftName = baseBranchName;
    let previousLeftClass = baseAttachment.class;
    let leftClassRun = 1;
    const chooseSecondY = (
      moduleY: number,
      leftY: number,
      desiredOffset: number,
      lowerLeftY: number,
    ) => {
      const direction = desiredOffset >= 0 ? 1 : -1;
      const offsets = [
        desiredOffset,
        desiredOffset + direction * 28,
        desiredOffset - direction * 28,
        -desiredOffset,
        direction * 82,
        -direction * 116,
        direction * 154,
        -direction * 174,
      ];
      return offsets
        .map((offset) => {
          const jitter = Math.round((random() - 0.5) * 24);
          const targetY = Math.max(moduleY + 58, Math.min(moduleY + 316, leftY + offset + jitter));
          const gap = (secondLowerY - targetY) * scale;
          const pairOffset = Math.abs(targetY - leftY);
          const combinedYs = [secondLowerY, lowerLeftY, leftY, targetY].sort((a, b) => b - a);
          const maximumCombinedGap = Math.max(
            ...combinedYs.slice(0, -1).map((value, position) => (value - combinedYs[position + 1]!) * scale),
          );
          let score = maximumCombinedGap * 1.65 + Math.abs(pairOffset - Math.abs(desiredOffset)) * 0.34 + random() * 12;
          if (pairOffset < 68) score += (68 - pairOffset) * 18 + 420;
          if (maximumCombinedGap > 235) score += (maximumCombinedGap - 235) * 7;
          if (gap < 145) score += (145 - gap) * 8;
          if (gap > jumpReach.heldSingle * 0.84) score += (gap - jumpReach.heldSingle * 0.84) * 9;
          return { targetY, gap, score };
        })
        .sort((a, b) => a.score - b.score)[0]!;
    };

    for (let index = middleCount - 1; index >= 0; index--) {
      const leftModule = modules[index]!;
      const rightModule = secondModules[index]!;
      let leftName = leftModule.branch!;
      let leftRecord = attachmentManifest.attachments[leftName]!;
      let rightName: string;
      let mode: CrossTreePair['mode'] = 'outward';
      const scheduledTransfer = forceTransferAbove || levelsSinceTransfer >= 4 || random() < 0.24;
      const scheduledClosed = !scheduledTransfer && (
        (leftRecord.class === 'nub' && leftRecord.side === 'right')
        || (levelsSinceTransfer >= 2 && random() < 0.12)
      );

      if (scheduledTransfer) {
        leftLeadsTransfer = !leftLeadsTransfer;
        if (leftLeadsTransfer) {
          leftName = choose(['long-right-a', 'midlong-right-b'], random);
          rightName = 'midlong-left-b';
        } else {
          leftName = 'medium-right-straight-c';
          rightName = 'long-left-a';
        }
        leftModule.branch = leftName;
        leftRecord = attachmentManifest.attachments[leftName]!;
        mode = 'transfer';
        forceTransferAbove = false;
        levelsSinceTransfer = 0;
      } else if (scheduledClosed) {
        leftName = choose(['nub-right-a', 'nub-right-b'], random);
        rightName = choose(['small-left-a', 'small-left-b'], random);
        leftModule.branch = leftName;
        leftRecord = attachmentManifest.attachments[leftName]!;
        mode = 'closed';
        forceTransferAbove = index > 0;
        levelsSinceTransfer += 1;
      } else if (leftRecord.side === 'right' && leftRecord.class === 'long') {
        // Two aligned long limbs almost meet at this tree spacing without overlap.
        rightName = 'long-left-a';
        mode = 'transfer';
        levelsSinceTransfer = 0;
      } else if (leftRecord.side === 'right' && leftRecord.class === 'medium') {
        rightName = 'midlong-left-b';
        mode = 'transfer';
        levelsSinceTransfer = 0;
      } else {
        // Match an outward left limb with a comparable outward right limb. This
        // preserves visual rhythm while keeping both branch bodies out of the lane.
        rightName = leftRecord.class === 'long'
          ? choose(['long-right-a', 'midlong-right-b'], random)
          : leftRecord.class === 'medium'
            ? 'midlong-right-b'
            : choose(['nub-right-a', 'nub-right-b', 'medium-right-straight-c'], random);
        mode = 'outward';
        levelsSinceTransfer += 1;
      }

      // The paired pass can replace the first tree's original choice to create a
      // transfer. Keep that correction from producing conspicuous runs of the
      // same medium/long silhouette on the first tree.
      const responsiveLeftCandidates = mode === 'closed'
        ? ['nub-right-a', 'nub-right-b']
        : mode === 'transfer'
          ? ['medium-right-straight-c', 'midlong-right-b', 'long-right-a']
          : leftRecord.side === 'left'
            ? ['small-left-a', 'small-left-b', 'midlong-left-b', 'long-left-a']
            : ['nub-right-a', 'nub-right-b', 'medium-right-straight-c', 'midlong-right-b', 'long-right-a'];
      leftName = responsiveLeftCandidates
        .map((candidate) => {
          const record = attachmentManifest.attachments[candidate]!;
          let score = random() * 32 + (candidate === leftName ? 0 : 18);
          if (candidate === previousLeftName) score += 260;
          if (record.class === previousLeftClass) score += leftClassRun >= 2 ? 220 : 42;
          return { candidate, score };
        })
        .sort((a, b) => a.score - b.score)[0]!.candidate;
      leftModule.branch = leftName;
      leftRecord = attachmentManifest.attachments[leftName]!;

      const responsiveCandidates = mode === 'closed'
        ? ['small-left-a', 'small-left-b']
        : mode === 'transfer'
          ? ['small-left-a', 'small-left-b', 'midlong-left-b', 'long-left-a'].filter((candidate) => {
            const record = attachmentManifest.attachments[candidate]!;
            const socketGap = treeSpacing + branchTargetX(record) - branchTargetX(leftRecord);
            const renderedGap = Math.max(0, socketGap - outwardReach(leftRecord) - outwardReach(record)) * scale;
            return renderedGap <= 210;
          })
          : ['nub-right-a', 'nub-right-b', 'medium-right-straight-c', 'midlong-right-b', 'long-right-a'];
      rightName = responsiveCandidates
        .map((candidate) => {
          const record = attachmentManifest.attachments[candidate]!;
          let score = random() * 28;
          if (candidate === previousRightName) score += 260;
          if (record.class === previousRightClass) score += rightClassRun >= 2 ? 190 : 64;
          if (mode === 'outward' && record.class !== leftRecord.class) score += 24;
          if (mode === 'transfer' && record.class === leftRecord.class) score += 18;
          return { candidate, score };
        })
        .sort((a, b) => a.score - b.score)[0]!.candidate;
      const rightRecord = attachmentManifest.attachments[rightName]!;
      if (random() < 0.68) offsetDirection *= -1;
      const desiredOffset = offsetDirection * choose(
        mode === 'transfer'
          ? [92, 116, 142, 164]
          : mode === 'closed'
            ? [82, 104, 128]
            : [74, 98, 126, 152, 176],
        random,
      );
      const lowerLeftY = modules[index + 1]?.branchY ?? baseBranchY;
      const pickedSecondY = chooseSecondY(rightModule.y, leftModule.branchY!, desiredOffset, lowerLeftY);
      rightModule.branch = rightName;
      rightModule.branchRole = 'playable';
      rightModule.branchY = pickedSecondY.targetY;
      rightModule.gapToLowerPx = Math.round(pickedSecondY.gap);

      if (mode !== 'outward') {
        const leftSocketX = branchTargetX(leftRecord);
        const rightSocketX = treeSpacing + branchTargetX(rightRecord);
        const leftTipX = leftSocketX + outwardReach(leftRecord);
        const rightTipX = rightSocketX - outwardReach(rightRecord);
        const horizontalGap = Math.max(0, rightTipX - leftTipX) * scale;
        const verticalGap = Math.abs(leftModule.branchY! - pickedSecondY.targetY) * scale;
        crossTreePairs.push({
          moduleIndex: index,
          mode,
          leftBranch: leftName,
          rightBranch: rightName,
          leftY: leftModule.branchY!,
          rightY: pickedSecondY.targetY,
          horizontalGapPx: Math.round(horizontalGap),
          verticalGapPx: Math.round(verticalGap),
          reachable: mode === 'transfer' && horizontalGap <= 210 && verticalGap <= jumpReach.tapSingle * 0.72,
        });
      }
      secondLowerY = pickedSecondY.targetY;
      if (rightRecord.class === previousRightClass) {
        rightClassRun += 1;
      } else {
        previousRightClass = rightRecord.class;
        rightClassRun = 1;
      }
      previousRightName = rightName;
      if (leftRecord.class === previousLeftClass) {
        leftClassRun += 1;
      } else {
        previousLeftClass = leftRecord.class;
        leftClassRun = 1;
      }
      previousLeftName = leftName;
    }

    // Rebuild both vertical route streams after coordination, because a scheduled
    // transfer can replace the first tree's initially selected branch class.
    routeAnchors = [{
      id: 'left-base-start',
      tree: 'left',
      branch: baseBranchName,
      x: branchRouteX(baseAttachment),
      y: baseBranchY,
      gapToLowerPx: null,
    }];
    for (const module of [...modules].reverse()) {
      const record = attachmentManifest.attachments[module.branch!]!;
      routeAnchors.push({
        id: `left-module-${module.index}`,
        tree: 'left',
        branch: module.branch!,
        x: branchRouteX(record),
        y: module.branchY!,
        gapToLowerPx: module.gapToLowerPx,
      });
    }
    routeAnchors.push({
      id: 'right-base-start',
      tree: 'right',
      branch: secondBaseBranchName,
      x: branchRouteX(secondBaseAttachment, treeSpacing),
      y: secondBaseBranchY,
      gapToLowerPx: null,
    });
    for (const module of [...secondModules].reverse()) {
      const record = attachmentManifest.attachments[module.branch!]!;
      routeAnchors.push({
        id: `right-module-${module.index}`,
        tree: 'right',
        branch: module.branch!,
        x: branchRouteX(record, treeSpacing),
        y: module.branchY!,
        gapToLowerPx: module.gapToLowerPx,
      });
    }

    // A rare open route beat should still carry visual interest. Use a richer
    // connector-safe trunk painting behind it instead of adding another platform.
    const richMiddles = stackManifest.middles.filter((record) => (
      record.id === 'middle-vine' || record.id === 'middle-moss'
    ));
    const enrichOpenModules = (targetModules: ModuleState[], sprites: Map<number, Sprite>) => {
      for (const module of targetModules) {
        if ((module.gapToLowerPx ?? 0) < 290 || richMiddles.length === 0) continue;
        const richArt = choose(richMiddles, random);
        module.art = richArt.id;
        const richSprite = sprites.get(module.index);
        if (richSprite) richSprite.texture = texture(richArt);
      }
    };
    enrichOpenModules(modules, middleSprites);
    enrichOpenModules(secondModules, secondMiddleSprites);

    const decorateTree = (targetModules: ModuleState[], baseRecord: AttachmentRecord) => {
      const quietModules: Record<'left' | 'right', number> = {
        left: baseRecord.side === 'left' ? 0 : 1,
        right: baseRecord.side === 'right' ? 0 : 1,
      };
      const quietLimit: Record<'left' | 'right', number> = {
        left: random() < 0.6 ? 3 : 4,
        right: random() < 0.6 ? 3 : 4,
      };
      let lastDecorationIndex = middleCount + 5;
      const largeGapIndexes = new Set(
        targetModules.filter((module) => (module.gapToLowerPx ?? 0) >= 290).map((module) => module.index),
      );
      const hardSideStarvationLimit = 3;
      for (const module of [...targetModules].reverse()) {
        const platformSide = module.branch
          ? attachmentManifest.attachments[module.branch]!.side
          : 'center';
        for (const side of ['left', 'right'] as const) {
          quietModules[side] = platformSide === side ? 0 : quietModules[side] + 1;
        }
        if (platformSide === 'center') continue;
        const side: 'left' | 'right' = platformSide === 'left' ? 'right' : 'left';
        const mustFillStarvedSide = quietModules[side] >= hardSideStarvationLimit;
        const decorationDistance = lastDecorationIndex - module.index;
        if (decorationDistance < 3) continue;
        if (decorationDistance < 5 && !mustFillStarvedSide) continue;
        const followsLargeGap = (module.gapToLowerPx ?? 0) >= 290;
        const lowerGap = module.gapToLowerPx ?? Number.POSITIVE_INFINITY;
        const upperGap = targetModules[module.index - 1]?.gapToLowerPx ?? Number.POSITIVE_INFINITY;
        const localOpenGap = Math.max(
          Number.isFinite(lowerGap) ? lowerGap : 0,
          Number.isFinite(upperGap) ? upperGap : 0,
        );
        const crowded = lowerGap < 205 && upperGap < 205;
        if (crowded && !mustFillStarvedSide) continue;
        const quietEnough = quietModules[side] >= quietLimit[side];
        const wouldBlockLargeGap = !followsLargeGap && [...largeGapIndexes].some((largeIndex) => (
          largeIndex < module.index && module.index - largeIndex < 5
        ));
        if (wouldBlockLargeGap && !mustFillStarvedSide) continue;
        if (!mustFillStarvedSide && followsLargeGap && random() >= 0.76) continue;
        if (!mustFillStarvedSide && !followsLargeGap) {
          const calmChance = quietEnough ? 0.34 : localOpenGap >= 240 ? 0.14 : 0;
          if (random() >= calmChance) continue;
        }
        const name = side === 'left'
          ? choose(['leafy-left-a', 'leafy-left-c'], random)
          : 'leafy-right-e';
        const platformY = module.branchY ?? module.y + 200;
        module.decorations.push({
          name,
          side,
          targetY: Math.max(
            module.y + 105,
            Math.min(module.y + 285, platformY + (random() > 0.5 ? -72 : 72)),
          ),
        });
        quietModules[side] = 0;
        quietLimit[side] = random() < 0.6 ? 3 : 4;
        lastDecorationIndex = module.index;
      }
    };
    decorateTree(modules, baseAttachment);
    decorateTree(secondModules, secondBaseAttachment);

    const placeDecoration = (decoration: DecorationState, treeOffsetX = 0) => {
      const attachment = stackManifest.decorations.find((record) => record.id === decoration.name)!;
      const detail = new Sprite(texture(attachment));
      detail.position.set(
        treeOffsetX + stackManifest.width / 2 - attachment.socket[0],
        decoration.targetY - attachment.socket[1],
      );
      detailLayer.addChild(detail);
    };

    for (const module of modules) {
      for (const decoration of module.decorations) placeDecoration(decoration);
      if (module.branch && module.branchY !== null) placeBranch(module.branch, module.branchY);
    }
    for (const module of secondModules) {
      for (const decoration of module.decorations) placeDecoration(decoration, treeSpacing);
      if (module.branch && module.branchY !== null) placeBranch(module.branch, module.branchY, treeSpacing);
    }

    seamGraphics = new Graphics();
    for (let index = 0; index <= middleCount; index++) {
      const y = firstMiddleY + index * middleStep;
      for (const offsetX of [0, treeSpacing]) {
        seamGraphics
          .rect(offsetX + 392, y, 240, stackManifest.connector.height)
          .fill({ color: 0x34e8ff, alpha: index % 2 ? 0.13 : 0.2 })
          .moveTo(offsetX + 350, y)
          .lineTo(offsetX + 674, y)
          .stroke({ color: 0x8bf5ff, width: 2, alpha: 0.8 });
      }
    }
    seamGraphics.visible = seamsInput.checked;
    tree.addChild(seamGraphics);

    routeGraphics = new Graphics();
    for (const treeId of ['left', 'right'] as const) {
      const treeRoute = routeAnchors.filter((anchor) => anchor.tree === treeId);
      for (let index = 0; index < treeRoute.length; index++) {
        const anchor = treeRoute[index]!;
        if (index > 0) {
          const lower = treeRoute[index - 1]!;
          const gap = anchor.gapToLowerPx ?? 0;
          const color = gap <= jumpReach.tapSingle
            ? 0x67f5a0
            : gap <= jumpReach.heldSingle
              ? 0xffd56a
              : 0xff8a74;
          routeGraphics
            .moveTo(lower.x, lower.y)
            .lineTo(anchor.x, anchor.y)
            .stroke({ color, width: 5, alpha: 0.78 });
        }
        routeGraphics
          .circle(anchor.x, anchor.y, 13)
          .fill({ color: 0x0b3c35, alpha: 0.88 })
          .stroke({ color: 0xeafff5, width: 4, alpha: 0.95 });
      }
    }
    for (const pair of crossTreePairs) {
      const leftRecord = attachmentManifest.attachments[pair.leftBranch]!;
      const rightRecord = attachmentManifest.attachments[pair.rightBranch]!;
      const leftX = branchTargetX(leftRecord) + outwardReach(leftRecord) - 26;
      const rightX = treeSpacing + branchTargetX(rightRecord) - outwardReach(rightRecord) + 26;
      routeGraphics
        .moveTo(leftX, pair.leftY)
        .lineTo(rightX, pair.rightY)
        .stroke({ color: pair.reachable ? 0x6fffe9 : 0xff7d67, width: 7, alpha: 0.9 });
    }
    routeGraphics.visible = routeInput.checked;
    tree.addChild(routeGraphics);

    player = new Container();
    const glow = new Graphics().circle(0, 0, 25).fill({ color: 0x71efff, alpha: 0.18 });
    const body = new Graphics().circle(0, 0, 13).fill(0xf7ffff).stroke({ color: 0x6deaff, width: 3 });
    player.addChild(glow, body);
    tree.addChild(player);
    maximumClimb = Math.max(1, totalHeight - 260);
    climbInput.max = String(Math.round(maximumClimb));
    climbDistance = Math.min(climbDistance, maximumClimb);
    updateCamera();
  };

  const updateCamera = () => {
    const scale = Number(scaleInput.value);
    const viewportDesignHeight = app.screen.height / scale;
    const playerWorldY = totalHeight - 150 - climbDistance;
    const maximumCameraY = Math.max(0, totalHeight - viewportDesignHeight + 34 / scale);
    cameraY = Math.max(0, Math.min(maximumCameraY, playerWorldY - viewportDesignHeight * 0.62));
    tree.scale.set(scale);
    tree.position.set((app.screen.width - forestWidth * scale) / 2, -cameraY * scale);
    if (player) {
      const sway = Math.sin(climbDistance / 230) * treeSpacing * 0.34;
      player.position.set(forestWidth / 2 + sway, playerWorldY);
    }
    climbInput.value = String(Math.round(climbDistance));
    const percentage = Math.round((climbDistance / maximumClimb) * 100);
    climbOutput.value = `${percentage}%`;
    const visibleStart = Math.max(0, cameraY);
    const visibleEnd = cameraY + viewportDesignHeight;
    const visibleModules = modules.filter((module) => {
      return module.y + stackManifest.layout.middleHeight >= visibleStart && module.y <= visibleEnd;
    });
    const canopyReached = cameraY < stackManifest.layout.canopyHeight * 0.45;
    const playableCount = [...modules, ...secondModules].filter((module) => module.branchRole === 'playable').length + 2;
    const displayCount = [...modules, ...secondModules].reduce((total, module) => total + module.decorations.length, 0);
    const reachableTransfers = crossTreePairs.filter((pair) => pair.reachable).length;
    const closedPairs = crossTreePairs.filter((pair) => pair.mode === 'closed').length;
    status.textContent = `${playableCount} playable branches · ${reachableTransfers} cross-tree transfers · ${closedPairs} closed gaps · ${displayCount} leafy fillers · ${visibleModules.length} levels visible · ${canopyReached ? 'canopy reached' : 'paired climb'}`;
    renderNow();
  };

  const resizeBackdrop = () => {
    const textureWidth = Math.max(1, background.texture.width);
    const textureHeight = Math.max(1, background.texture.height);
    const scale = Math.max(app.screen.width / textureWidth, app.screen.height / textureHeight);
    background.scale.set(scale);
    background.position.set((app.screen.width - textureWidth * scale) / 2, (app.screen.height - textureHeight * scale) / 2);
    shade.clear().rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x0d3029, alpha: 0.08 });
    updateCamera();
  };

  const step = (seconds: number) => {
    let direction = 0;
    if (movingUp) direction += 1;
    if (movingDown) direction -= 1;
    if (autoInput.checked) direction += 0.42;
    if (direction !== 0) {
      climbDistance = Math.max(0, Math.min(maximumClimb, climbDistance + direction * 440 * seconds));
      if (climbDistance >= maximumClimb) autoInput.checked = false;
      updateCamera();
    }
  };

  const setClimb = (amount: number) => {
    climbDistance = Math.max(0, Math.min(maximumClimb, amount));
    updateCamera();
  };

  byId<HTMLButtonElement>('regenerate').addEventListener('click', build);
  byId<HTMLButtonElement>('random-seed').addEventListener('click', () => {
    seedInput.value = String(1 + Math.floor(Math.random() * 9_999_998));
    build();
  });
  byId<HTMLButtonElement>('to-base').addEventListener('click', () => setClimb(0));
  byId<HTMLButtonElement>('to-canopy').addEventListener('click', () => setClimb(maximumClimb));
  byId<HTMLButtonElement>('background-builder').addEventListener('click', () => {
    window.location.href = './background-tree-builder.html';
  });
  baseSelect.addEventListener('change', build);
  canopySelect.addEventListener('change', build);
  middleInput.addEventListener('input', () => {
    middleOutput.value = middleInput.value;
    build();
  });
  scaleInput.addEventListener('input', () => {
    scaleOutput.value = Number(scaleInput.value).toFixed(2);
    updateCamera();
  });
  climbInput.addEventListener('input', () => setClimb(Number(climbInput.value)));
  seamsInput.addEventListener('change', () => {
    if (seamGraphics) seamGraphics.visible = seamsInput.checked;
  });
  routeInput.addEventListener('change', () => {
    if (routeGraphics) routeGraphics.visible = routeInput.checked;
    renderNow();
  });
  window.addEventListener('wheel', (event) => {
    setClimb(climbDistance - event.deltaY * 1.4);
  }, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') movingUp = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') movingDown = true;
    if (event.code === 'KeyR') build();
    if (event.code === 'KeyG') setClimb(0);
    if (event.code === 'KeyT') setClimb(maximumClimb);
    if (event.code === 'KeyF') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') movingUp = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') movingDown = false;
  });

  const hud = byId<HTMLDivElement>('hud');
  const hudTitle = byId<HTMLElement>('hud-title');
  let dragOffset: { x: number; y: number } | null = null;
  hudTitle.addEventListener('pointerdown', (event) => {
    dragOffset = { x: event.clientX - hud.offsetLeft, y: event.clientY - hud.offsetTop };
    hudTitle.setPointerCapture(event.pointerId);
  });
  hudTitle.addEventListener('pointermove', (event) => {
    if (!dragOffset) return;
    hud.style.left = `${Math.max(0, Math.min(window.innerWidth - hud.offsetWidth, event.clientX - dragOffset.x))}px`;
    hud.style.top = `${Math.max(0, Math.min(window.innerHeight - 44, event.clientY - dragOffset.y))}px`;
  });
  hudTitle.addEventListener('pointerup', () => { dragOffset = null; });

  app.ticker.add((ticker) => step(ticker.deltaMS / 1000));
  runtimeWindow.advanceTime = (ms: number) => {
    step(Math.max(0, ms) / 1000);
    renderNow();
  };
  runtimeWindow.render_game_to_text = () => JSON.stringify({
    coordinateSystem: 'paired-forest pixels; origin at left canopy top; x increases right; y increases downward; climb increases upward',
    seed: Number(seedInput.value),
    base: baseSelect.value,
    canopy: canopySelect.value,
    treeScale: Number(scaleInput.value),
    totalHeight,
    climbDistance: Math.round(climbDistance),
    cameraY: Math.round(cameraY),
    canopyReached: cameraY < stackManifest.layout.canopyHeight * 0.45,
    showSeams: seamsInput.checked,
    showRoute: routeInput.checked,
    treeSpacing,
    jumpReach: {
      tapSingle: Math.round(jumpReach.tapSingle),
      tapDouble: Math.round(jumpReach.tapDouble),
      heldSingle: Math.round(jumpReach.heldSingle),
      heldDouble: Math.round(jumpReach.heldDouble),
    },
    route: routeAnchors.map((anchor) => ({
      id: anchor.id,
      tree: anchor.tree,
      branch: anchor.branch,
      x: Math.round(anchor.x),
      y: Math.round(anchor.y),
      gapToLowerPx: anchor.gapToLowerPx,
    })),
    crossTreePairs,
    trees: {
      left: modules,
      right: secondModules,
    },
  });

  window.addEventListener('resize', resizeBackdrop);
  byId<HTMLDivElement>('loading').remove();
  build();
  resizeBackdrop();
};

void init();
