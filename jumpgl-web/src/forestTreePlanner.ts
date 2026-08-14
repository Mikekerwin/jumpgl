import type {
  ForestTreePlanningConfig,
  JumpReachProfile,
  PlannedTree,
  StackingTreeManifest,
  TreeAnchorPlan,
  TreeAttachmentManifest,
  TreeAttachmentRecord,
  TreeDecorationPlan,
  TreeModulePlan,
  TreePairMode,
  TreePairPlan,
  TreePlan,
} from './forestTreeTypes';

const PLAYABLE_BRANCHES = [
  'small-left-a',
  'small-left-b',
  'medium-right-straight-c',
  'midlong-left-b',
  'midlong-right-b',
  'long-right-a',
  'long-left-a',
  'nub-right-a',
  'nub-right-b',
] as const;

const RIGHT_BRANCHES = ['nub-right-a', 'nub-right-b', 'medium-right-straight-c', 'midlong-right-b', 'long-right-a'] as const;
const TRANSFER_RECEIVERS = ['small-left-a', 'small-left-b', 'midlong-left-b', 'long-left-a'] as const;

export const createSeededRandom = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const choose = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

export const branchTargetY = (record: TreeAttachmentRecord) => {
  if (record.class === 'long') return 154;
  if (record.class === 'medium') return 205;
  if (record.class === 'small') return 232;
  return 112;
};

export const branchTargetX = (record: TreeAttachmentRecord, treeWidth: number) => (
  treeWidth / 2 + (record.canonicalSocket[0] - 512)
);

export const branchOutwardReach = (record: TreeAttachmentRecord) => (
  record.side === 'left' ? record.socket[0] : record.width - record.socket[0]
);

const routeX = (record: TreeAttachmentRecord, treeWidth: number) => (
  branchTargetX(record, treeWidth) + (record.side === 'left' ? -128 : 128)
);

const resolveArtId = <T extends { id: string }>(records: T[], requested: string | undefined, random: () => number) => (
  records.find((record) => record.id === requested)?.id ?? choose(records, random).id
);

const scoreBranch = (
  name: string,
  record: TreeAttachmentRecord,
  desiredSide: 'left' | 'right',
  previousName: string,
  previousClass: string,
  classRun: number,
  random: () => number,
) => {
  let score = random() * 30;
  if (record.side !== desiredSide) score += 88;
  if (name === previousName) score += 260;
  if (record.class === previousClass) score += classRun >= 2 ? 230 : 46;
  return score;
};

const selectBranchAtGap = (
  names: readonly string[],
  desiredSide: 'left' | 'right',
  lowerY: number,
  moduleY: number,
  targetGap: number,
  minimumGap: number,
  maximumGap: number,
  previousName: string,
  previousClass: string,
  classRun: number,
  attachments: TreeAttachmentManifest,
  scale: number,
  random: () => number,
) => {
  const offsets = [-110, -82, -56, -30, 0, 30, 56, 82, 110];
  const candidates = names.flatMap((name) => offsets.map((offset) => {
    const record = attachments.attachments[name]!;
    const localY = Math.max(58, Math.min(316, branchTargetY(record) + offset));
    const targetY = moduleY + localY;
    const gap = (lowerY - targetY) * scale;
    let score = Math.abs(gap - targetGap)
      + scoreBranch(name, record, desiredSide, previousName, previousClass, classRun, random);
    if (gap < minimumGap) score += (minimumGap - gap) * 8;
    if (gap > maximumGap) score += (gap - maximumGap) * 10;
    return { name, targetY, gap, score };
  }));
  const safe = candidates.filter(({ gap }) => gap >= minimumGap && gap <= maximumGap);
  return (safe.length > 0 ? safe : candidates).sort((a, b) => a.score - b.score)[0]!;
};

const buildAnchors = (
  modules: TreeModulePlan[],
  baseBranch: string,
  baseBranchY: number,
  attachments: TreeAttachmentManifest,
  width: number,
): TreeAnchorPlan[] => {
  const baseRecord = attachments.attachments[baseBranch]!;
  const anchors: TreeAnchorPlan[] = [{
    id: 'base',
    branch: baseBranch,
    side: baseRecord.side,
    class: baseRecord.class,
    x: routeX(baseRecord, width),
    y: baseBranchY,
    gapToLowerPx: null,
  }];
  for (const module of [...modules].reverse()) {
    const record = attachments.attachments[module.branch]!;
    anchors.push({
      id: `module-${module.index}`,
      branch: module.branch,
      side: record.side,
      class: record.class,
      x: routeX(record, width),
      y: module.branchY,
      gapToLowerPx: module.gapToLowerPx,
    });
  }
  return anchors;
};

const addDecorations = (
  modules: TreeModulePlan[],
  attachments: TreeAttachmentManifest,
  random: () => number,
) => {
  const quiet = { left: 1, right: 1 };
  let lastDecorationIndex = modules.length + 6;
  for (const module of [...modules].reverse()) {
    const branchSide = attachments.attachments[module.branch]!.side;
    quiet.left = branchSide === 'left' ? 0 : quiet.left + 1;
    quiet.right = branchSide === 'right' ? 0 : quiet.right + 1;
    const openSide = branchSide === 'left' ? 'right' : 'left';
    const starved = quiet[openSide] >= 3;
    const separated = lastDecorationIndex - module.index >= 3;
    const visuallyOpen = module.gapToLowerPx >= 250 || random() < 0.12;
    if (!separated || (!starved && !visuallyOpen)) continue;
    const name = openSide === 'left'
      ? choose(['leafy-left-a', 'leafy-left-c'], random)
      : 'leafy-right-e';
    const decoration: TreeDecorationPlan = {
      name,
      side: openSide,
      targetY: Math.max(module.y + 105, Math.min(module.y + 285, module.branchY + (random() > 0.5 ? -76 : 76))),
    };
    module.decorations.push(decoration);
    quiet[openSide] = 0;
    lastDecorationIndex = module.index;
  }
};

const enrichOpenModules = (modules: TreeModulePlan[], stack: StackingTreeManifest, random: () => number) => {
  const rich = stack.middles.filter((record) => record.id === 'middle-vine' || record.id === 'middle-moss');
  if (rich.length === 0) return;
  for (const module of modules) {
    if (module.gapToLowerPx >= 285) module.art = choose(rich, random).id;
  }
};

const assignRareHideHole = (
  modules: TreeModulePlan[],
  stack: StackingTreeManifest,
  seed: number,
  sequence: number,
) => {
  const hollow = stack.middles.find((record) => record.hideHole);
  if (!hollow || modules.length < 4) return;
  const random = createSeededRandom(seed ^ 0x484f4c45);
  // Guarantee a discoverable but sparse cadence, then let a small seeded chance
  // break the every-four-trees rhythm so shelters never look mechanically tiled.
  if (sequence % 4 !== 1 && random() > 0.16) return;
  const eligible = modules.filter((module) => module.index >= 2 && module.index <= modules.length - 3);
  if (eligible.length === 0) return;
  const chosen = eligible[Math.floor(random() * eligible.length)]!;
  chosen.art = hollow.id;
};

const generateIndependentTree = (
  sequence: number,
  seed: number,
  stack: StackingTreeManifest,
  attachments: TreeAttachmentManifest,
  jumpReach: JumpReachProfile,
  config: ForestTreePlanningConfig,
): TreePlan => {
  const random = createSeededRandom(seed);
  const requestedMiddleCount = Math.max(2, Math.round(config.middleCount));
  const topRandom = createSeededRandom(seed ^ 0x51f15e5d);
  const middleCount = requestedMiddleCount;
  // Keep every root on the same ground plane and every trunk connector intact,
  // then seat the crown at a continuous seeded depth over the top module. This
  // avoids the previous all-or-nothing one-section staircase at the skyline.
  const canopyOffsetY = config.varyTopSections === false
    ? 0
    : Math.round(topRandom() * stack.layout.middleStep * 0.48);
  const firstMiddleY = stack.layout.canopyHeight - stack.connector.height;
  const baseY = firstMiddleY + middleCount * stack.layout.middleStep;
  const totalHeight = baseY + stack.layout.baseHeight;
  const base = resolveArtId(stack.bases, config.baseId, random);
  const canopy = resolveArtId(stack.canopies, config.canopyId, random);
  const baseBranch = random() > 0.5 ? choose(['small-left-a', 'small-left-b'], random) : 'medium-right-a';
  const baseBranchY = baseY + 205;
  const baseRecord = attachments.attachments[baseBranch]!;
  const modules: TreeModulePlan[] = [];
  const regularMiddles = stack.middles.filter((record) => !record.hideHole);
  if (regularMiddles.length === 0) throw new Error('Stacking tree requires a non-hollow middle module');
  let previousArt = '';
  for (let index = 0; index < middleCount; index++) {
    let art = choose(regularMiddles, random);
    if (art.id === previousArt && regularMiddles.length > 1) {
      art = regularMiddles[(regularMiddles.indexOf(art) + 1) % regularMiddles.length]!;
    }
    previousArt = art.id;
    modules.push({
      index,
      art: art.id,
      y: firstMiddleY + index * stack.layout.middleStep,
      branch: 'medium-right-straight-c',
      branchY: 0,
      gapToLowerPx: 0,
      decorations: [],
    });
  }

  let lowerY = baseBranchY;
  let previousName = baseBranch;
  let previousClass = baseRecord.class;
  let classRun = 1;
  let previousSide: 'left' | 'right' = baseRecord.side === 'left' ? 'left' : 'right';
  let compactSinceChallenge = 4 + Math.floor(random() * 3);
  let compactAfterNub = false;
  for (let index = middleCount - 1; index >= 0; index--) {
    const module = modules[index]!;
    const challenge = !compactAfterNub && compactSinceChallenge >= 6 && random() < 0.16;
    const desiredSide = compactAfterNub
      ? 'right'
      : random() < 0.7
        ? (previousSide === 'left' ? 'right' : 'left')
        : previousSide;
    const names = compactAfterNub ? ['medium-right-straight-c'] : PLAYABLE_BRANCHES;
    const compactCenter = stack.layout.middleStep * config.scale;
    const targetGap = challenge
      ? choose([300, 330, 360, 390], random)
      : compactAfterNub
        ? choose([150, 170, 190], random)
        : Math.max(155, Math.min(jumpReach.tapDouble * 0.8, compactCenter + choose([-45, -23, 0, 23, 45], random)));
    const minimumGap = challenge ? 290 : compactAfterNub ? 145 : 150;
    const maximumGap = challenge
      ? Math.min(400, jumpReach.heldSingle * 0.76)
      : compactAfterNub
        ? 205
        : jumpReach.tapDouble * 0.82;
    const picked = selectBranchAtGap(
      names,
      desiredSide,
      lowerY,
      module.y,
      targetGap,
      minimumGap,
      maximumGap,
      previousName,
      previousClass,
      classRun,
      attachments,
      config.scale,
      random,
    );
    const record = attachments.attachments[picked.name]!;
    module.branch = picked.name;
    module.branchY = picked.targetY;
    module.gapToLowerPx = Math.round(picked.gap);
    lowerY = picked.targetY;
    previousName = picked.name;
    if (record.class === previousClass) classRun += 1;
    else {
      previousClass = record.class;
      classRun = 1;
    }
    previousSide = record.side === 'left' ? 'left' : 'right';
    compactAfterNub = record.class === 'nub' && index > 0 && random() < 0.84;
    compactSinceChallenge = challenge ? 0 : compactSinceChallenge + 1;
  }
  enrichOpenModules(modules, stack, random);
  assignRareHideHole(modules, stack, seed, sequence);
  addDecorations(modules, attachments, random);
  return {
    sequence,
    seed,
    width: stack.width,
    totalHeight,
    baseY,
    base,
    canopy,
    canopyOffsetY,
    baseBranch,
    baseBranchY,
    modules,
    anchors: buildAnchors(modules, baseBranch, baseBranchY, attachments, stack.width),
  };
};

const renderedBranchGap = (
  previous: TreeAttachmentRecord,
  next: TreeAttachmentRecord,
  treeWidth: number,
  centerSpacing: number,
  scale: number,
) => {
  const previousSocket = branchTargetX(previous, treeWidth);
  const nextSocket = centerSpacing + branchTargetX(next, treeWidth);
  const rawGap = nextSocket - branchOutwardReach(next) - (previousSocket + branchOutwardReach(previous));
  return { raw: rawGap * scale, clamped: Math.max(0, rawGap) * scale };
};

const selectCoordinatedBranch = (
  names: readonly string[],
  preferredName: string,
  desiredSide: 'left' | 'right',
  previousName: string,
  previousClass: string,
  classRun: number,
  attachments: TreeAttachmentManifest,
  random: () => number,
) => names
  .map((name) => {
    const record = attachments.attachments[name]!;
    let score = scoreBranch(name, record, desiredSide, previousName, previousClass, classRun, random);
    if (name !== preferredName) score += 18;
    return { name, score };
  })
  .sort((a, b) => a.score - b.score)[0]!.name;

const canSupportTransfer = (branch: string, attachments: TreeAttachmentManifest) => {
  const record = attachments.attachments[branch]!;
  return record.side === 'right' && (record.class === 'medium' || record.class === 'long');
};

export const generateNextTreePlan = (
  previous: TreePlan,
  sequence: number,
  seed: number,
  stack: StackingTreeManifest,
  attachments: TreeAttachmentManifest,
  jumpReach: JumpReachProfile,
  config: ForestTreePlanningConfig,
): PlannedTree => {
  const next = generateIndependentTree(sequence, seed, stack, attachments, jumpReach, config);
  const random = createSeededRandom(seed ^ 0x9e3779b9);
  const pairs: TreePairPlan[] = [];
  let lowerY = next.baseBranchY;
  let previousName = next.baseBranch;
  let previousClass = attachments.attachments[previousName]!.class;
  let classRun = 1;
  let levelsSinceTransfer = 2;
  let offsetDirection = random() > 0.5 ? 1 : -1;

  for (let index = next.modules.length - 1; index >= 0; index--) {
    const module = next.modules[index]!;
    const previousModule = previous.modules[index];
    if (!previousModule) continue;
    const previousRecord = attachments.attachments[previousModule.branch]!;
    const nextHigherCanTransfer = index > 0 && canSupportTransfer(previous.modules[index - 1]!.branch, attachments);
    let mode: TreePairMode = 'outward';
    if (canSupportTransfer(previousModule.branch, attachments) && (levelsSinceTransfer >= 3 || random() < 0.62)) mode = 'transfer';
    else if (
      previousRecord.side === 'right'
      && (previousRecord.class === 'nub' || previousRecord.class === 'small')
      && nextHigherCanTransfer
      && random() < 0.3
    ) mode = 'closed';

    let names: readonly string[] = RIGHT_BRANCHES;
    let preferred = module.branch;
    if (mode === 'transfer') {
      const compatible = TRANSFER_RECEIVERS.filter((name) => {
        const gap = renderedBranchGap(previousRecord, attachments.attachments[name]!, stack.width, config.centerSpacing, config.scale);
        return gap.raw >= -36 && gap.clamped <= 210;
      });
      if (compatible.length > 0) {
        names = compatible;
        preferred = compatible.includes('midlong-left-b') ? 'midlong-left-b' : compatible[0]!;
      } else {
        mode = 'outward';
      }
    }
    if (mode === 'closed') {
      names = ['small-left-a', 'small-left-b'];
      preferred = choose(names, random);
    }
    if (mode === 'outward') {
      names = RIGHT_BRANCHES;
      preferred = choose(names, random);
    }

    const name = selectCoordinatedBranch(
      names,
      preferred,
      mode === 'outward' ? 'right' : 'left',
      previousName,
      previousClass,
      classRun,
      attachments,
      random,
    );
    const record = attachments.attachments[name]!;
    if (random() < 0.68) offsetDirection *= -1;
    const desiredOffset = offsetDirection * choose(
      mode === 'transfer' ? [92, 116, 142, 164] : mode === 'closed' ? [82, 104, 128] : [74, 98, 126, 152, 176],
      random,
    );
    const candidates = [desiredOffset, desiredOffset + 28, desiredOffset - 28, -desiredOffset, 82, -116, 154, -174]
      .map((offset) => {
        const jitter = Math.round((random() - 0.5) * 24);
        const targetY = Math.max(module.y + 58, Math.min(module.y + 316, previousModule.branchY + offset + jitter));
        const gap = (lowerY - targetY) * config.scale;
        const pairOffset = Math.abs(targetY - previousModule.branchY);
        let score = Math.abs(pairOffset - Math.abs(desiredOffset)) * 0.35 + random() * 12;
        if (pairOffset < 68) score += (68 - pairOffset) * 18 + 420;
        if (gap < 145) score += (145 - gap) * 8;
        if (gap > jumpReach.heldSingle * 0.84) score += (gap - jumpReach.heldSingle * 0.84) * 9;
        return { targetY, gap, score };
      })
      .sort((a, b) => a.score - b.score);
    const picked = candidates[0]!;
    module.branch = name;
    module.branchY = picked.targetY;
    module.gapToLowerPx = Math.round(picked.gap);
    module.decorations = [];
    lowerY = picked.targetY;
    if (record.class === previousClass) classRun += 1;
    else {
      previousClass = record.class;
      classRun = 1;
    }
    previousName = name;

    if (mode !== 'outward') {
      const horizontal = renderedBranchGap(previousRecord, record, stack.width, config.centerSpacing, config.scale);
      const verticalGap = Math.abs(previousModule.branchY - picked.targetY) * config.scale;
      pairs.push({
        level: index,
        mode,
        previousBranch: previousModule.branch,
        nextBranch: name,
        previousY: previousModule.branchY,
        nextY: picked.targetY,
        horizontalGapPx: Math.round(horizontal.clamped),
        verticalGapPx: Math.round(verticalGap),
        reachable: mode === 'transfer' && horizontal.clamped <= 210 && verticalGap <= jumpReach.tapSingle * 0.72,
      });
    }
    levelsSinceTransfer = mode === 'transfer' ? 0 : levelsSinceTransfer + 1;
  }

  enrichOpenModules(next.modules, stack, random);
  assignRareHideHole(next.modules, stack, seed, sequence);
  addDecorations(next.modules, attachments, random);
  next.anchors = buildAnchors(next.modules, next.baseBranch, next.baseBranchY, attachments, next.width);
  return { tree: next, relationToPrevious: pairs };
};

export const generateTreeSequence = (
  count: number,
  seed: number,
  stack: StackingTreeManifest,
  attachments: TreeAttachmentManifest,
  jumpReach: JumpReachProfile,
  config: ForestTreePlanningConfig,
): PlannedTree[] => {
  const first = generateIndependentTree(0, seed, stack, attachments, jumpReach, config);
  const sequence: PlannedTree[] = [{ tree: first, relationToPrevious: [] }];
  for (let index = 1; index < count; index++) {
    sequence.push(generateNextTreePlan(
      sequence[index - 1]!.tree,
      index,
      seed + index * 7919,
      stack,
      attachments,
      jumpReach,
      config,
    ));
  }
  return sequence;
};
