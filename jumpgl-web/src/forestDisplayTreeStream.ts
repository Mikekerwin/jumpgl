import { Container, Sprite, Texture } from 'pixi.js';
import { branchTargetX, createSeededRandom } from './forestTreePlanner';
import type {
  StackingTreeManifest,
  TreeAttachmentManifest,
} from './forestTreeTypes';

type DisplayTreeBand = 'mid' | 'far';

type DisplayModulePlan = {
  index: number;
  art: string;
  y: number;
  branch: string | null;
  branchY: number;
  decoration: string | null;
  decorationY: number;
  decorationScale: number;
};

type DisplayTreePlan = {
  sequence: number;
  seed: number;
  width: number;
  totalHeight: number;
  baseY: number;
  base: string;
  canopy: string;
  modules: DisplayModulePlan[];
  variant: 'slender' | 'balanced' | 'broad';
};

export type DisplayTreePalette = {
  tint: number;
};

export type DisplayTreeStreamOptions = {
  parent: Container;
  stack: StackingTreeManifest;
  attachments: TreeAttachmentManifest;
  seed: number;
  middleCount: number;
  scale: number;
  widthScale?: number;
  viewportWidth: number;
  baseY: number;
  centerSpacing: number;
  spacingRange?: [number, number];
  band: DisplayTreeBand;
  palette: DisplayTreePalette;
  heightRange?: [number, number];
  canopyEnabled?: boolean;
  usePlayableBranches?: boolean;
};

type CanopyFinish = {
  cutoffScreenY: number;
  parentOffsetY: number;
  belowRange: [number, number];
};

const DISPLAY_BRANCHES = [
  'small-left-a',
  'small-left-b',
  'medium-right-straight-c',
  'midlong-left-b',
  'midlong-right-b',
  'nub-right-a',
] as const;

const texture = (record: { path: string }) => {
  const result = Texture.from(record.path);
  result.label = record.path;
  return result;
};

const choose = <T>(items: readonly T[], random: () => number): T => (
  items[Math.floor(random() * items.length)]!
);

const buildDisplayPlan = (
  sequence: number,
  seed: number,
  stack: StackingTreeManifest,
  attachments: TreeAttachmentManifest,
  middleCount: number,
  band: DisplayTreeBand,
  heightRange: [number, number],
): DisplayTreePlan => {
  const random = createSeededRandom(seed);
  const variants = ['slender', 'balanced', 'broad'] as const;
  const variant = variants[(sequence + Math.floor(random() * variants.length)) % variants.length]!;
  const rawHeightFactor = heightRange[0] + random() * (heightRange[1] - heightRange[0]);
  const variantHeightOffset = variant === 'slender' ? -0.13 : variant === 'broad' ? 0.13 : 0;
  const heightFactor = Math.max(heightRange[0], Math.min(heightRange[1], rawHeightFactor + variantHeightOffset));
  const count = Math.max(4, Math.round(middleCount * heightFactor));
  const firstMiddleY = stack.layout.canopyHeight - stack.connector.height;
  const baseY = firstMiddleY + count * stack.layout.middleStep;
  const totalHeight = baseY + stack.layout.baseHeight;
  const calmMiddles = stack.middles.filter((record) => (
    record.id === 'middle-calm' || record.id === 'middle-sparse'
  ));
  const familyPool = band === 'far' && calmMiddles.length > 0 ? calmMiddles : stack.middles;
  const familyMiddle = familyPool[(sequence + Math.floor(random() * familyPool.length)) % familyPool.length]!;
  const modules: DisplayModulePlan[] = [];
  let previousBranch = '';
  let nextBranchIn = 2 + Math.floor(random() * (band === 'mid' ? 2 : 3));
  let side: 'left' | 'right' = random() > 0.5 ? 'left' : 'right';

  for (let index = 0; index < count; index++) {
    // Each background trunk keeps a calm family identity. Rare detail swaps add
    // variation without turning the repeated connector belts into visible bands.
    const middle = random() < (band === 'mid' ? 0.12 : 0.05)
      ? choose(familyPool, random)
      : familyMiddle;
    const y = firstMiddleY + index * stack.layout.middleStep;
    let branch: string | null = null;
    let branchY = y + 190;
    let decoration: string | null = null;
    let decorationY = y + 205;
    let decorationScale = 1;
    nextBranchIn -= 1;
    const hasPlayableBranches = Object.keys(attachments.attachments).length > 0;
    if (nextBranchIn <= 0 && hasPlayableBranches) {
      const sidePool = DISPLAY_BRANCHES.filter((name) => {
        const record = attachments.attachments[name];
        return record && record.side === side;
      });
      branch = choose(sidePool.length > 0 ? sidePool : DISPLAY_BRANCHES, random);
      if (branch === previousBranch && sidePool.length > 1) {
        branch = sidePool[(sidePool.indexOf(branch as never) + 1) % sidePool.length]!;
      }
      previousBranch = branch;
      const record = attachments.attachments[branch]!;
      branchY = y + 118 + Math.round(random() * 132);
      side = record.side === 'left' ? 'right' : 'left';
      nextBranchIn = (band === 'mid' ? 3 : 4) + Math.floor(random() * 2);
    } else if (nextBranchIn <= 0 && !hasPlayableBranches) {
      const details = stack.decorations.filter((record) => record.side === side);
      if (details.length > 0) {
        decoration = choose(details, random).id;
        decorationY = y + 130 + Math.round(random() * 120);
        decorationScale = (band === 'mid' ? 0.68 : 0.54) + random() * 0.18;
        side = side === 'left' ? 'right' : 'left';
        nextBranchIn = (band === 'mid' ? 2 : 3) + Math.floor(random() * 3);
      }
    }
    modules.push({ index, art: middle.id, y, branch, branchY, decoration, decorationY, decorationScale });
  }

  return {
    sequence,
    seed,
    width: stack.width,
    totalHeight,
    baseY,
    base: choose(stack.bases, random).id,
    canopy: choose(stack.canopies, random).id,
    modules,
    variant,
  };
};

const spacingForSequence = (
  seed: number,
  sequence: number,
  spacingRange: [number, number],
) => {
  const random = createSeededRandom(seed ^ (sequence * 2654435761));
  return spacingRange[0] + random() * (spacingRange[1] - spacingRange[0]);
};

const capPlanForCanopy = (
  plan: DisplayTreePlan,
  stack: StackingTreeManifest,
  options: DisplayTreeStreamOptions,
  finish: CanopyFinish,
): DisplayTreePlan => {
  const random = createSeededRandom(plan.seed ^ 0x6d2b79f5);
  const variantBelowOffset = plan.variant === 'slender' ? 240 : plan.variant === 'balanced' ? 100 : 0;
  const targetTop = finish.cutoffScreenY
    + finish.belowRange[0]
    + random() * (finish.belowRange[1] - finish.belowRange[0])
    + variantBelowOffset;
  const firstMiddleY = stack.layout.canopyHeight - stack.connector.height;
  const availableDesignHeight = (finish.parentOffsetY + options.baseY - targetTop) / options.scale;
  const maximumCount = Math.floor(
    (availableDesignHeight - firstMiddleY - stack.layout.baseHeight) / stack.layout.middleStep,
  );
  const count = Math.max(3, Math.min(plan.modules.length, maximumCount));
  const modules = plan.modules.slice(0, count);
  const baseY = firstMiddleY + count * stack.layout.middleStep;
  return {
    ...plan,
    modules,
    baseY,
    totalHeight: baseY + stack.layout.baseHeight,
  };
};

class DisplayTreeView extends Container {
  private readonly stack: StackingTreeManifest;
  private readonly attachments: TreeAttachmentManifest;
  private readonly trunkLayer = new Container();
  private readonly detailLayer = new Container();
  private readonly branchLayer = new Container();
  private readonly canopySprite = new Sprite();
  private readonly baseSprite = new Sprite();
  private readonly middleSprites: Sprite[] = [];
  private readonly branchSprites: Sprite[] = [];
  private readonly detailSprites: Sprite[] = [];
  private plan: DisplayTreePlan | null = null;
  private activeKey = '';
  private activeModuleCount = 0;
  private canopyEnabled: boolean;

  constructor(
    stack: StackingTreeManifest,
    attachments: TreeAttachmentManifest,
    palette: DisplayTreePalette,
    canopyEnabled: boolean,
  ) {
    super();
    this.stack = stack;
    this.attachments = attachments;
    this.tint = palette.tint;
    this.canopyEnabled = canopyEnabled;
    // Keep the stacked art fully opaque. Applying depth through container alpha
    // makes the intentional 64px section overlaps composite twice, which shows
    // up as dark horizontal belts. Depth is handled by tint/color matrices.
    this.alpha = 1;
    this.cullable = true;
    this.trunkLayer.addChild(this.canopySprite, this.baseSprite);
    this.addChild(this.trunkLayer, this.detailLayer, this.branchLayer);
  }

  private ensurePool(pool: Sprite[], count: number, layer: Container) {
    while (pool.length < count) {
      const sprite = new Sprite();
      sprite.cullable = true;
      pool.push(sprite);
      layer.addChild(sprite);
    }
    for (let index = 0; index < pool.length; index++) pool[index]!.visible = index < count;
  }

  applyPlan(plan: DisplayTreePlan) {
    this.plan = plan;
    this.pivot.set(plan.width / 2, plan.totalHeight);
    const base = this.stack.bases.find((record) => record.id === plan.base) ?? this.stack.bases[0]!;
    this.baseSprite.texture = texture(base);
    this.baseSprite.position.set(0, plan.baseY);
    this.canopySprite.position.set(0, 0);
    this.canopySprite.visible = false;
    this.canopySprite.renderable = false;
    this.activeKey = '';
  }

  setCanopyEnabled(enabled: boolean) {
    this.canopyEnabled = enabled;
    if (!enabled) {
      this.canopySprite.visible = false;
      this.canopySprite.renderable = false;
    }
  }

  updateVerticalCulling(parentOffsetY: number, viewportHeight: number, margin = 220) {
    if (!this.plan) return;
    const plan = this.plan;
    const scaleY = Math.abs(this.scale.y);
    const treeTopOnScreen = parentOffsetY + this.y - this.pivot.y * scaleY;
    const overlaps = (top: number, height: number) => {
      const spriteTop = treeTopOnScreen + top * scaleY;
      const spriteBottom = spriteTop + Math.max(1, height * scaleY);
      return spriteBottom >= -margin && spriteTop <= viewportHeight + margin;
    };
    const active = plan.modules.filter((module) => overlaps(module.y, this.stack.layout.middleHeight));
    this.activeModuleCount = active.length;
    const key = active.map((module) => module.index).join(',');
    if (key !== this.activeKey) {
      this.activeKey = key;
      this.ensurePool(this.middleSprites, active.length, this.trunkLayer);
      const branched = active.filter((module) => module.branch);
      const decorated = active.filter((module) => module.decoration);
      this.ensurePool(this.branchSprites, branched.length, this.branchLayer);
      this.ensurePool(this.detailSprites, decorated.length, this.detailLayer);
      for (let slot = 0; slot < active.length; slot++) {
        const module = active[slot]!;
        const record = this.stack.middles.find((candidate) => candidate.id === module.art) ?? this.stack.middles[0]!;
        const sprite = this.middleSprites[slot]!;
        sprite.texture = texture(record);
        sprite.position.set(0, module.y);
      }
      for (let slot = 0; slot < branched.length; slot++) {
        const module = branched[slot]!;
        const record = this.attachments.attachments[module.branch!]!;
        const sprite = this.branchSprites[slot]!;
        sprite.texture = texture(record);
        sprite.position.set(
          branchTargetX(record, plan.width) - record.socket[0],
          module.branchY - record.socket[1],
        );
      }
      for (let slot = 0; slot < decorated.length; slot++) {
        const module = decorated[slot]!;
        const record = this.stack.decorations.find((candidate) => candidate.id === module.decoration)!;
        const sprite = this.detailSprites[slot]!;
        sprite.texture = texture(record);
        sprite.position.set(plan.width / 2 - record.socket[0], module.decorationY - record.socket[1]);
        sprite.scale.set(module.decorationScale);
      }
    }
    const canopy = this.stack.canopies.find((record) => record.id === plan.canopy) ?? this.stack.canopies[0]!;
    const canopyInRange = this.canopyEnabled && overlaps(0, canopy.height);
    if (canopyInRange && !this.canopySprite.visible) this.canopySprite.texture = texture(canopy);
    this.canopySprite.visible = canopyInRange;
    this.canopySprite.renderable = canopyInRange;
    this.baseSprite.renderable = overlaps(plan.baseY, this.stack.layout.baseHeight);
    for (const sprite of [...this.middleSprites, ...this.branchSprites, ...this.detailSprites]) {
      sprite.renderable = sprite.visible && overlaps(sprite.y, Math.max(1, sprite.texture.height));
    }
  }

  getMaterializedModules() {
    return this.activeModuleCount;
  }

  getRenderableSprites() {
    return [this.canopySprite, this.baseSprite, ...this.middleSprites, ...this.branchSprites, ...this.detailSprites]
      .filter((sprite) => sprite.visible && sprite.renderable).length;
  }
}

type StreamedDisplayTree = {
  plan: DisplayTreePlan;
  view: DisplayTreeView;
  scaleX: number;
};

export class ForestDisplayTreeStream {
  private readonly options: DisplayTreeStreamOptions;
  private readonly trees: StreamedDisplayTree[] = [];
  private nextSequence = 0;
  private recycleCount = 0;
  private canopyFinish: CanopyFinish | null = null;

  private createPlan(sequence: number) {
    const plan = buildDisplayPlan(
      sequence,
      this.options.seed + sequence * 6151,
      this.options.stack,
      this.options.usePlayableBranches === false
        ? { attachments: {} }
        : this.options.attachments,
      this.options.middleCount,
      this.options.band,
      this.options.heightRange ?? [0.62, 0.98],
    );
    return this.canopyFinish
      ? capPlanForCanopy(plan, this.options.stack, this.options, this.canopyFinish)
      : plan;
  }

  constructor(options: DisplayTreeStreamOptions) {
    this.options = options;
    const nominalWidth = options.stack.width * (options.widthScale ?? options.scale);
    const count = Math.max(5, Math.ceil(options.viewportWidth / options.centerSpacing) + 4);
    const firstX = -nominalWidth * 0.35;
    for (let index = 0; index < count; index++) {
      const sequence = index;
      const plan = this.createPlan(sequence);
      const view = new DisplayTreeView(
        options.stack,
        options.attachments,
        options.palette,
        options.canopyEnabled ?? false,
      );
      const widthFactor = plan.variant === 'slender' ? 0.82 : plan.variant === 'broad' ? 1.12 : 0.96;
      view.applyPlan(plan);
      view.scale.set((options.widthScale ?? options.scale) * widthFactor, options.scale);
      const previous = this.trees[this.trees.length - 1];
      const spacingRange = options.spacingRange ?? [options.centerSpacing, options.centerSpacing];
      const x = previous
        ? previous.view.x + spacingForSequence(options.seed, sequence, spacingRange)
        : firstX;
      view.position.set(x, options.baseY);
      options.parent.addChild(view);
      this.trees.push({ plan, view, scaleX: (options.widthScale ?? options.scale) * widthFactor });
    }
    this.nextSequence = count;
  }

  update(distancePx: number, parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    for (const streamed of this.trees) streamed.view.x -= distancePx;
    const leftBuffer = 120;
    let candidate = this.trees.find((streamed) => (
      streamed.view.x + streamed.plan.width * streamed.scaleX * 0.5 < -leftBuffer
    ));
    while (candidate) {
      const rightmost = this.trees.reduce((best, streamed) => streamed.view.x > best.view.x ? streamed : best);
      const sequence = this.nextSequence++;
      const plan = this.createPlan(sequence);
      const widthFactor = plan.variant === 'slender' ? 0.82 : plan.variant === 'broad' ? 1.12 : 0.96;
      candidate.plan = plan;
      candidate.scaleX = (this.options.widthScale ?? this.options.scale) * widthFactor;
      candidate.view.applyPlan(plan);
      candidate.view.scale.set(candidate.scaleX, this.options.scale);
      const spacingRange = this.options.spacingRange
        ?? [this.options.centerSpacing, this.options.centerSpacing];
      candidate.view.position.set(
        rightmost.view.x + spacingForSequence(this.options.seed, sequence, spacingRange),
        this.options.baseY,
      );
      this.recycleCount += 1;
      candidate = this.trees.find((streamed) => (
        streamed.view.x + streamed.plan.width * streamed.scaleX * 0.5 < -leftBuffer
      ));
    }
    this.updateVisibility(parentOffsetY, viewportHeight, viewportWidth);
  }

  updateVisibility(parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    const margin = 260;
    for (const streamed of this.trees) {
      const halfWidth = streamed.plan.width * streamed.scaleX * 0.5;
      const visible = streamed.view.x + halfWidth >= -margin && streamed.view.x - halfWidth <= viewportWidth + margin;
      streamed.view.renderable = visible;
      if (visible) streamed.view.updateVerticalCulling(parentOffsetY, viewportHeight);
    }
  }

  setCanopyEnabled(enabled: boolean, parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    this.options.canopyEnabled = enabled;
    for (const streamed of this.trees) streamed.view.setCanopyEnabled(enabled);
    this.updateVisibility(parentOffsetY, viewportHeight, viewportWidth);
  }

  finishWithCanopies(
    cutoffScreenY: number,
    parentOffsetY: number,
    viewportHeight: number,
    viewportWidth: number,
    belowRange: [number, number],
  ) {
    this.canopyFinish = { cutoffScreenY, parentOffsetY, belowRange };
    this.options.canopyEnabled = true;
    for (const streamed of this.trees) {
      streamed.plan = capPlanForCanopy(
        streamed.plan,
        this.options.stack,
        this.options,
        this.canopyFinish,
      );
      streamed.view.applyPlan(streamed.plan);
      streamed.view.setCanopyEnabled(true);
    }
    this.updateVisibility(parentOffsetY, viewportHeight, viewportWidth);
  }

  getState() {
    const visible = this.trees.filter((streamed) => streamed.view.renderable);
    const plannedModules = this.trees.reduce((sum, streamed) => sum + streamed.plan.modules.length, 0);
    const materializedModules = visible.reduce((sum, streamed) => sum + streamed.view.getMaterializedModules(), 0);
    return {
      band: this.options.band,
      plannedTrees: this.trees.length,
      plannedModules,
      materializedModules,
      culledModules: plannedModules - materializedModules,
      drawnSprites: visible.reduce((sum, streamed) => sum + streamed.view.getRenderableSprites(), 0),
      recycleCount: this.recycleCount,
      variants: this.trees.map((streamed) => streamed.plan.variant),
      sectionCounts: this.trees.map((streamed) => streamed.plan.modules.length),
      xPositions: this.trees.map((streamed) => Math.round(streamed.view.x)),
      spacingRange: this.options.spacingRange ?? [this.options.centerSpacing, this.options.centerSpacing],
      canopyCutoffScreenY: this.canopyFinish?.cutoffScreenY ?? null,
      canopyEnabled: this.options.canopyEnabled ?? false,
    };
  }

  destroy() {
    for (const streamed of this.trees) streamed.view.destroy({ children: true });
    this.trees.length = 0;
  }
}
