import { Container } from 'pixi.js';
import { branchTargetX, generateNextTreePlan, generateTreeSequence } from './forestTreePlanner';
import { ModularTreeView } from './forestTreeRenderer';
import type {
  ForestTreePlanningConfig,
  ForestBranchSurface,
  ForestCanopyBounds,
  ForestDecorationBounds,
  ForestHideHoleBounds,
  JumpReachProfile,
  PlannedTree,
  StackingTreeManifest,
  TreeAttachmentManifest,
} from './forestTreeTypes';

type StreamedTree = PlannedTree & {
  view: ModularTreeView;
  spacingFromPreviousPx: number;
};

export type ForestTreeStreamOptions = {
  parent: Container;
  stack: StackingTreeManifest;
  attachments: TreeAttachmentManifest;
  jumpReach: JumpReachProfile;
  seed: number;
  middleCount: number;
  scale: number;
  viewportWidth: number;
  baseY: number;
  centerSpacing: number;
  centerSpacingVariancePx?: number;
  canopyEnabled?: boolean;
  baseId?: string;
  canopyId?: string;
};

export class ForestTreeStream {
  private readonly stack: StackingTreeManifest;
  private readonly attachments: TreeAttachmentManifest;
  private readonly jumpReach: JumpReachProfile;
  private readonly seed: number;
  private readonly planningConfig: ForestTreePlanningConfig;
  private readonly scale: number;
  private readonly centerSpacingPx: number;
  private readonly centerSpacingVariancePx: number;
  private readonly trees: StreamedTree[] = [];
  private baseY: number;
  private nextSequence = 0;
  private recycleCount = 0;

  constructor(options: ForestTreeStreamOptions) {
    this.stack = options.stack;
    this.attachments = options.attachments;
    this.jumpReach = options.jumpReach;
    this.seed = options.seed;
    this.scale = options.scale;
    this.baseY = options.baseY;
    this.centerSpacingPx = options.centerSpacing * options.scale;
    this.centerSpacingVariancePx = Math.max(0, options.centerSpacingVariancePx ?? 0);
    this.planningConfig = {
      middleCount: options.middleCount,
      scale: options.scale,
      centerSpacing: options.centerSpacing,
      varyTopSections: true,
      baseId: options.baseId,
      canopyId: options.canopyId,
    };

    const treeCount = Math.max(6, Math.ceil(options.viewportWidth / this.centerSpacingPx) + 4);
    const first = generateTreeSequence(
      1,
      options.seed,
      options.stack,
      options.attachments,
      options.jumpReach,
      this.planningConfig,
    )[0]!;
    const plans: Array<PlannedTree & { spacingFromPreviousPx: number }> = [
      { ...first, spacingFromPreviousPx: 0 },
    ];
    for (let index = 1; index < treeCount; index++) {
      const spacingFromPreviousPx = this.spacingForSequence(index);
      const plan = generateNextTreePlan(
        plans[index - 1]!.tree,
        index,
        options.seed + index * 7919,
        options.stack,
        options.attachments,
        options.jumpReach,
        { ...this.planningConfig, centerSpacing: spacingFromPreviousPx / options.scale },
      );
      plans.push({ ...plan, spacingFromPreviousPx });
    }
    const firstX = -this.centerSpacingPx * 0.45;
    let treeX = firstX;
    for (let index = 0; index < plans.length; index++) {
      const planned = plans[index]!;
      if (index > 0) treeX += planned.spacingFromPreviousPx;
      const view = new ModularTreeView(options.stack, options.attachments, options.canopyEnabled ?? false);
      view.applyPlan(planned.tree);
      view.scale.set(options.scale);
      view.position.set(treeX, options.baseY);
      options.parent.addChild(view);
      this.trees.push({ ...planned, view });
    }
    this.nextSequence = plans.length;
  }

  update(distancePx: number, parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    for (const streamed of this.trees) streamed.view.x -= distancePx;
    const leftBuffer = 160;
    let recycled = true;
    while (recycled) {
      recycled = false;
      const candidate = this.trees.find((streamed) => (
        streamed.view.x + streamed.tree.width * this.scale * 0.5 < -leftBuffer
      ));
      if (!candidate) break;
      const rightmost = this.trees.reduce((best, streamed) => streamed.view.x > best.view.x ? streamed : best);
      const spacingFromPreviousPx = this.spacingForSequence(this.nextSequence);
      const planned = generateNextTreePlan(
        rightmost.tree,
        this.nextSequence,
        this.seed + this.nextSequence * 7919,
        this.stack,
        this.attachments,
        this.jumpReach,
        { ...this.planningConfig, centerSpacing: spacingFromPreviousPx / this.scale },
      );
      candidate.tree = planned.tree;
      candidate.relationToPrevious = planned.relationToPrevious;
      candidate.spacingFromPreviousPx = spacingFromPreviousPx;
      candidate.view.applyPlan(planned.tree);
      candidate.view.position.set(rightmost.view.x + spacingFromPreviousPx, this.baseY);
      this.nextSequence += 1;
      this.recycleCount += 1;
      recycled = true;
    }
    this.updateVisibility(parentOffsetY, viewportHeight, viewportWidth);
  }

  updateBranchFlex(deltaSeconds: number) {
    for (const streamed of this.trees) streamed.view.updateBranchFlex(deltaSeconds);
  }

  flexBranch(surface: ForestBranchSurface, contactX: number, impactSpeed: number) {
    const streamed = this.trees.find((candidate) => candidate.tree.sequence === surface.treeSequence);
    if (!streamed) return false;
    const width = Math.max(1, surface.right - surface.left);
    const contactRatio = surface.side === 'right'
      ? (contactX - surface.left) / width
      : (surface.right - contactX) / width;
    return streamed.view.flexBranch(
      surface.id,
      Math.max(0, Math.min(1, contactRatio)),
      impactSpeed,
    );
  }

  getBranchFlexState() {
    return this.trees.flatMap((streamed) => streamed.view.getBranchFlexState());
  }

  getDecorationFlexState() {
    return this.trees.flatMap((streamed) => streamed.view.getDecorationFlexState());
  }

  disturbDecoration(id: string, strength: number) {
    for (const streamed of this.trees) {
      if (streamed.view.disturbDecoration(id, strength)) return true;
    }
    return false;
  }

  getDecorationBounds(
    parentOffsetY: number,
    viewportWidth: number,
    horizontalMargin = 120,
  ): ForestDecorationBounds[] {
    return this.trees.flatMap((streamed) => streamed.tree.modules.flatMap((module) => (
      module.decorations.flatMap((decoration, decorationIndex) => {
        const record = this.stack.decorations.find((candidate) => candidate.id === decoration.name);
        if (!record) return [];
        const outwardLength = record.side === 'right'
          ? record.width - record.socket[0]
          : record.socket[0];
        const foliageInset = outwardLength * 0.28;
        const localLeft = record.side === 'right'
          ? record.socket[0] + foliageInset
          : 0;
        const localRight = record.side === 'right'
          ? record.width
          : record.socket[0] - foliageInset;
        const left = streamed.view.x + (localLeft - record.socket[0]) * this.scale;
        const right = streamed.view.x + (localRight - record.socket[0]) * this.scale;
        if (right < -horizontalMargin || left > viewportWidth + horizontalMargin) return [];
        const spriteTop = this.baseY
          + (decoration.targetY - record.socket[1] - streamed.tree.totalHeight) * this.scale;
        const top = parentOffsetY + spriteTop + Math.max(24, record.height * 0.08) * this.scale;
        const bottom = parentOffsetY + spriteTop
          + Math.min(record.height, record.socket[1] + 55) * this.scale;
        const leafX = record.side === 'right' ? right - 16 * this.scale : left + 16 * this.scale;
        const leafY = top + (bottom - top) * 0.42;
        return [{
          id: `tree-${streamed.tree.sequence}-decoration-${module.index}-${decorationIndex}`,
          treeSequence: streamed.tree.sequence,
          left,
          right,
          top,
          bottom,
          leafX,
          leafY,
        }];
      })
    )));
  }

  getHideHoleBounds(viewportWidth: number, horizontalMargin = 160): ForestHideHoleBounds[] {
    return this.trees.flatMap((streamed) => streamed.tree.modules.flatMap((module) => {
      const art = this.stack.middles.find((candidate) => candidate.id === module.art);
      const hole = art?.hideHole;
      if (!hole) return [];
      const centerX = streamed.view.x + (hole.center[0] - streamed.tree.width / 2) * this.scale;
      const centerY = this.baseY
        + (module.y + hole.center[1] - streamed.tree.totalHeight) * this.scale;
      const width = hole.size[0] * this.scale;
      const height = hole.size[1] * this.scale;
      const left = centerX - width / 2;
      const right = centerX + width / 2;
      if (right < -horizontalMargin || left > viewportWidth + horizontalMargin) return [];
      return [{
        id: `tree-${streamed.tree.sequence}-hide-hole-${module.index}`,
        treeSequence: streamed.tree.sequence,
        centerX,
        centerY,
        width,
        height,
        left,
        right,
        top: centerY - height / 2,
        bottom: centerY + height / 2,
      }];
    }));
  }

  updateVisibility(parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    const horizontalMargin = 320;
    for (const streamed of this.trees) {
      const halfWidth = streamed.tree.width * this.scale * 0.5;
      const horizontallyBuffered = streamed.view.x + halfWidth >= -horizontalMargin
        && streamed.view.x - halfWidth <= viewportWidth + horizontalMargin;
      streamed.view.renderable = horizontallyBuffered;
      if (horizontallyBuffered) {
        streamed.view.updateVerticalCulling(parentOffsetY, viewportHeight);
      }
    }
  }

  setCanopyEnabled(enabled: boolean, parentOffsetY: number, viewportHeight: number, viewportWidth: number) {
    for (const streamed of this.trees) streamed.view.setCanopyEnabled(enabled);
    this.updateVisibility(parentOffsetY, viewportHeight, viewportWidth);
  }

  getState(viewportWidth: number) {
    return {
      seed: this.seed,
      pooledTrees: this.trees.length,
      pooledSprites: this.trees.reduce((total, streamed) => total + streamed.view.getPooledSpriteCount(), 0),
      plannedModules: this.trees.reduce((total, streamed) => total + streamed.tree.modules.length, 0),
      renderableTrees: this.trees.filter((streamed) => streamed.view.renderable).length,
      renderableSprites: this.trees.reduce(
        (total, streamed) => total + (streamed.view.renderable ? streamed.view.getRenderableSpriteCount() : 0),
        0,
      ),
      recycleCount: this.recycleCount,
      nextSequence: this.nextSequence,
      centerSpacingPx: Math.round(this.centerSpacingPx),
      centerSpacingRangePx: [
        Math.round(this.centerSpacingPx),
        Math.round(this.centerSpacingPx + this.centerSpacingVariancePx),
      ],
      trees: [...this.trees]
        .sort((a, b) => a.view.x - b.view.x)
        .map((streamed) => ({
          sequence: streamed.tree.sequence,
          seed: streamed.tree.seed,
          x: Math.round(streamed.view.x),
          spacingFromPreviousPx: Math.round(streamed.spacingFromPreviousPx),
          visible: streamed.view.x + streamed.tree.width * this.scale * 0.5 >= 0
            && streamed.view.x - streamed.tree.width * this.scale * 0.5 <= viewportWidth,
          base: streamed.tree.base,
          canopy: streamed.tree.canopy,
          canopyOffsetY: streamed.tree.canopyOffsetY,
          branches: streamed.tree.modules.map((module) => module.branch),
          hideHoles: streamed.tree.modules
            .filter((module) => this.stack.middles.some(
              (record) => record.id === module.art && record.hideHole,
            ))
            .map((module) => ({ module: module.index, art: module.art })),
          transfersFromPrevious: streamed.relationToPrevious.filter((pair) => pair.reachable).length,
          closedGapsFromPrevious: streamed.relationToPrevious.filter((pair) => pair.mode === 'closed').length,
          relationToPrevious: streamed.relationToPrevious,
        })),
    };
  }

  private spacingForSequence(sequence: number) {
    if (this.centerSpacingVariancePx <= 0) return this.centerSpacingPx;
    let hash = (this.seed ^ Math.imul(sequence + 1, 0x9e3779b1)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97) >>> 0;
    const unit = ((hash ^ (hash >>> 15)) >>> 0) / 0x100000000;
    return this.centerSpacingPx + unit * this.centerSpacingVariancePx;
  }

  getCullingState() {
    const renderableTrees = this.trees.filter((streamed) => streamed.view.renderable);
    const plannedSections = this.trees.reduce(
      (total, streamed) => total + streamed.tree.modules.length,
      0,
    );
    const materializedSections = renderableTrees.reduce(
      (total, streamed) => total + streamed.view.getMaterializedModuleCount(),
      0,
    );
    return {
      plannedTrees: this.trees.length,
      plannedSections,
      materializedSections,
      culledSections: Math.max(0, plannedSections - materializedSections),
      pooledSprites: this.trees.reduce((total, streamed) => total + streamed.view.getPooledSpriteCount(), 0),
      drawnSprites: renderableTrees.reduce(
        (total, streamed) => total + streamed.view.getRenderableSpriteCount(),
        0,
      ),
    };
  }

  getAverageCanopyCutoffY(parentOffsetY: number, viewportWidth: number) {
    const visibleCenters = this.trees.flatMap((streamed) => {
      const halfWidth = streamed.tree.width * this.scale * 0.5;
      if (streamed.view.x + halfWidth < 0 || streamed.view.x - halfWidth > viewportWidth) return [];
      const canopy = this.stack.canopies.find((record) => record.id === streamed.tree.canopy);
      if (!canopy) return [];
      const treeTop = parentOffsetY + streamed.view.y - streamed.tree.totalHeight * this.scale;
      // The foliage occupies the upper portion of each canopy texture. Its
      // visual midpoint is the safest place to hide the hard backdrop seam.
      return [treeTop + (streamed.tree.canopyOffsetY + canopy.height * 0.48) * this.scale];
    });
    if (visibleCenters.length === 0) return null;
    return visibleCenters.reduce((sum, value) => sum + value, 0) / visibleCenters.length;
  }

  getCanopyBounds(viewportWidth: number, horizontalMargin = 160): ForestCanopyBounds[] {
    return this.trees.flatMap((streamed) => {
      const canopy = this.stack.canopies.find((record) => record.id === streamed.tree.canopy);
      if (!canopy) return [];
      const halfWidth = canopy.width * this.scale * 0.5;
      if (streamed.view.x + halfWidth < -horizontalMargin
        || streamed.view.x - halfWidth > viewportWidth + horizontalMargin) return [];
      const top = this.baseY
        + (streamed.tree.canopyOffsetY - streamed.tree.totalHeight) * this.scale;
      return [{
        id: `tree-${streamed.tree.sequence}-canopy`,
        treeSequence: streamed.tree.sequence,
        left: streamed.view.x - halfWidth,
        right: streamed.view.x + halfWidth,
        top,
        bottom: top + canopy.height * this.scale,
      }];
    });
  }

  getBranchSurfaces(viewportWidth: number, horizontalMargin = 160): ForestBranchSurface[] {
    const surfaces: ForestBranchSurface[] = [];
    const addSurface = (
      streamed: StreamedTree,
      branch: string,
      branchY: number,
      slot: string,
    ) => {
      const record = this.attachments.attachments[branch];
      if (!record || record.side === 'center') return;
      const targetX = branchTargetX(record, streamed.tree.width);
      const spriteLeft = targetX - record.socket[0];
      const outerInset = Math.min(12, Math.max(5, record.width * 0.025));
      const collarInset = Math.min(10, Math.max(4, record.width * 0.018));
      const localLeft = record.side === 'left' ? spriteLeft + outerInset : targetX + collarInset;
      const localRight = record.side === 'left'
        ? targetX - collarInset
        : spriteLeft + record.width - outerInset;
      const left = streamed.view.x + (localLeft - streamed.tree.width / 2) * this.scale;
      const right = streamed.view.x + (localRight - streamed.tree.width / 2) * this.scale;
      if (right < -horizontalMargin || left > viewportWidth + horizontalMargin) return;
      surfaces.push({
        id: `tree-${streamed.tree.sequence}-${slot}`,
        treeSequence: streamed.tree.sequence,
        branch,
        class: record.class,
        side: record.side,
        left,
        right,
        top: this.baseY + (branchY - streamed.tree.totalHeight) * this.scale,
        height: Math.max(9, 18 * this.scale),
      });
    };

    for (const streamed of this.trees) {
      addSurface(streamed, streamed.tree.baseBranch, streamed.tree.baseBranchY, 'base');
      for (const module of streamed.tree.modules) {
        addSurface(streamed, module.branch, module.branchY, `module-${module.index}`);
      }
    }
    return surfaces;
  }

  destroy() {
    for (const streamed of this.trees) streamed.view.destroy({ children: true });
    this.trees.length = 0;
  }
}
