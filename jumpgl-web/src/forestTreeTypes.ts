export type TreeArtRecord = {
  id: string;
  label: string;
  path: string;
  width: number;
  height: number;
  hideHole?: {
    center: [number, number];
    size: [number, number];
    overlayPath: string;
  };
};

export type TreeDecorationArtRecord = TreeArtRecord & {
  side: 'left' | 'right';
  socket: [number, number];
};

export type StackingTreeManifest = {
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
  middles: TreeArtRecord[];
  bases: TreeArtRecord[];
  canopies: TreeArtRecord[];
  decorations: TreeDecorationArtRecord[];
};

export type TreeAttachmentRecord = {
  path: string;
  width: number;
  height: number;
  socket: [number, number];
  class: string;
  side: 'left' | 'right' | 'center';
  canonicalSocket: [number, number];
};

export type TreeAttachmentManifest = {
  attachments: Record<string, TreeAttachmentRecord>;
};

export type TreeDecorationPlan = {
  name: string;
  side: 'left' | 'right';
  targetY: number;
};

export type TreeModulePlan = {
  index: number;
  art: string;
  y: number;
  branch: string;
  branchY: number;
  gapToLowerPx: number;
  decorations: TreeDecorationPlan[];
};

export type TreeAnchorPlan = {
  id: string;
  branch: string;
  side: 'left' | 'right' | 'center';
  class: string;
  x: number;
  y: number;
  gapToLowerPx: number | null;
};

export type TreePlan = {
  sequence: number;
  seed: number;
  width: number;
  totalHeight: number;
  baseY: number;
  base: string;
  canopy: string;
  canopyOffsetY: number;
  baseBranch: string;
  baseBranchY: number;
  modules: TreeModulePlan[];
  anchors: TreeAnchorPlan[];
};

export type TreePairMode = 'transfer' | 'closed' | 'outward';

export type TreePairPlan = {
  level: number;
  mode: TreePairMode;
  previousBranch: string;
  nextBranch: string;
  previousY: number;
  nextY: number;
  horizontalGapPx: number | null;
  verticalGapPx: number;
  reachable: boolean;
};

export type ForestBranchSurface = {
  id: string;
  treeSequence: number;
  branch: string;
  class: string;
  side: 'left' | 'right';
  left: number;
  right: number;
  top: number;
  height: number;
};

export type ForestCanopyBounds = {
  id: string;
  treeSequence: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ForestDecorationBounds = {
  id: string;
  treeSequence: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  leafX: number;
  leafY: number;
};

export type ForestHideHoleBounds = {
  id: string;
  treeSequence: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PlannedTree = {
  tree: TreePlan;
  relationToPrevious: TreePairPlan[];
};

export type JumpReachProfile = {
  tapSingle: number;
  tapDouble: number;
  heldSingle: number;
  heldDouble: number;
};

export type ForestTreePlanningConfig = {
  middleCount: number;
  scale: number;
  centerSpacing: number;
  varyTopSections?: boolean;
  baseId?: string;
  canopyId?: string;
};
