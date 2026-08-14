import { Container, MeshPlane, Sprite, Texture } from 'pixi.js';
import { branchTargetX } from './forestTreePlanner';
import type {
  StackingTreeManifest,
  TreeArtRecord,
  TreeAttachmentManifest,
  TreeAttachmentRecord,
  TreeDecorationArtRecord,
  TreePlan,
} from './forestTreeTypes';

const texture = (record: TreeArtRecord | TreeDecorationArtRecord | TreeAttachmentRecord) => {
  const result = Texture.from(record.path);
  result.label = record.path;
  return result;
};

const findArt = (records: TreeArtRecord[], id: string) => {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing tree art: ${id}`);
  return record;
};

export class ModularTreeView extends Container {
  private readonly stack: StackingTreeManifest;
  private readonly attachments: TreeAttachmentManifest;
  private readonly trunkLayer = new Container();
  private readonly detailLayer = new Container();
  private readonly branchLayer = new Container();
  private readonly hollowFrontLayer = new Container();
  private readonly canopySprite = new Sprite();
  private readonly baseSprite = new Sprite();
  private readonly baseBranchSprite = new MeshPlane({ texture: Texture.EMPTY, verticesX: 7, verticesY: 3 });
  private readonly middleSprites: Sprite[] = [];
  private readonly branchSprites: MeshPlane[] = [];
  private readonly detailSprites: MeshPlane[] = [];
  private readonly branchFlex = new Map<string, { displacement: number; velocity: number }>();
  private readonly decorationFlex = new Map<string, { displacement: number; velocity: number }>();
  private currentPlan: TreePlan | null = null;
  private canopyEnabled: boolean;
  private activeModuleKey = '';
  private activeModuleCount = 0;

  constructor(stack: StackingTreeManifest, attachments: TreeAttachmentManifest, canopyEnabled = false) {
    super();
    this.stack = stack;
    this.attachments = attachments;
    this.canopyEnabled = canopyEnabled;
    this.cullable = true;
    this.trunkLayer.sortableChildren = true;
    this.canopySprite.zIndex = 10;
    this.trunkLayer.addChild(this.canopySprite, this.baseSprite);
    this.branchLayer.addChild(this.baseBranchSprite);
    this.addChild(this.trunkLayer, this.detailLayer, this.branchLayer, this.hollowFrontLayer);
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

  private ensureBranchPool(count: number) {
    while (this.branchSprites.length < count) {
      const mesh = new MeshPlane({ texture: Texture.EMPTY, verticesX: 7, verticesY: 3 });
      mesh.cullable = true;
      this.branchSprites.push(mesh);
      this.branchLayer.addChild(mesh);
    }
    for (let index = 0; index < this.branchSprites.length; index++) {
      this.branchSprites[index]!.visible = index < count;
    }
  }

  private ensureDetailPool(count: number) {
    while (this.detailSprites.length < count) {
      const mesh = new MeshPlane({ texture: Texture.EMPTY, verticesX: 9, verticesY: 5 });
      mesh.cullable = true;
      this.detailSprites.push(mesh);
      this.detailLayer.addChild(mesh);
    }
    for (let index = 0; index < this.detailSprites.length; index++) {
      this.detailSprites[index]!.visible = index < count;
    }
  }

  private surfaceId(slot: 'base' | number) {
    if (!this.currentPlan) return '';
    return slot === 'base'
      ? `tree-${this.currentPlan.sequence}-base`
      : `tree-${this.currentPlan.sequence}-module-${slot}`;
  }

  private deformBranch(mesh: MeshPlane, record: TreeAttachmentRecord, displacement: number) {
    const geometry = mesh.geometry;
    const buffer = geometry.getBuffer('aPosition');
    const positions = buffer.data as Float32Array;
    const verticesX = 7;
    const verticesY = 3;
    for (let row = 0; row < verticesY; row++) {
      for (let column = 0; column < verticesX; column++) {
        const index = (row * verticesX + column) * 2;
        const x = column / (verticesX - 1) * record.width;
        const y = row / (verticesY - 1) * record.height;
        const rawReach = record.side === 'right'
          ? Math.max(0, (x - record.socket[0]) / Math.max(1, record.width - record.socket[0]))
          : Math.max(0, (record.socket[0] - x) / Math.max(1, record.socket[0]));
        // Keep a collar of pixels around the socket completely rigid so the
        // mesh cannot open a seam where the branch joins the trunk.
        const reach = Math.max(0, (rawReach - 0.16) / 0.84);
        const bendWeight = reach * reach * (3 - 2 * reach);
        positions[index] = x;
        positions[index + 1] = y + displacement * bendWeight;
      }
    }
    buffer.update();
  }

  private applyBranchFlex(mesh: MeshPlane, record: TreeAttachmentRecord, id: string) {
    this.deformBranch(mesh, record, this.branchFlex.get(id)?.displacement ?? 0);
  }

  private decorationId(moduleIndex: number, decorationIndex: number) {
    return this.currentPlan
      ? `tree-${this.currentPlan.sequence}-decoration-${moduleIndex}-${decorationIndex}`
      : '';
  }

  private deformDecoration(
    mesh: MeshPlane,
    record: TreeDecorationArtRecord,
    displacement: number,
  ) {
    const buffer = mesh.geometry.getBuffer('aPosition');
    const positions = buffer.data as Float32Array;
    const verticesX = 9;
    const verticesY = 5;
    for (let row = 0; row < verticesY; row++) {
      for (let column = 0; column < verticesX; column++) {
        const index = (row * verticesX + column) * 2;
        const x = column / (verticesX - 1) * record.width;
        const y = row / (verticesY - 1) * record.height;
        const rawReach = record.side === 'right'
          ? Math.max(0, (x - record.socket[0]) / Math.max(1, record.width - record.socket[0]))
          : Math.max(0, (record.socket[0] - x) / Math.max(1, record.socket[0]));
        const reach = Math.max(0, (rawReach - 0.18) / 0.82);
        const bendWeight = reach * reach * (3 - 2 * reach);
        positions[index] = x;
        positions[index + 1] = y + displacement * bendWeight;
      }
    }
    buffer.update();
  }

  applyPlan(plan: TreePlan) {
    this.currentPlan = plan;
    this.pivot.set(plan.width / 2, plan.totalHeight);
    this.canopySprite.position.set(0, plan.canopyOffsetY);
    this.canopySprite.visible = false;
    this.canopySprite.renderable = false;
    this.baseSprite.texture = texture(findArt(this.stack.bases, plan.base));
    this.baseSprite.position.set(0, plan.baseY);

    this.ensurePool(this.middleSprites, 0, this.trunkLayer);
    this.ensureBranchPool(0);
    this.ensureDetailPool(0);
    this.branchFlex.clear();
    this.decorationFlex.clear();
    this.activeModuleKey = '';
    this.activeModuleCount = 0;

    const baseAttachment = this.attachments.attachments[plan.baseBranch]!;
    this.baseBranchSprite.texture = texture(baseAttachment);
    this.baseBranchSprite.position.set(
      branchTargetX(baseAttachment, plan.width) - baseAttachment.socket[0],
      plan.baseBranchY - baseAttachment.socket[1],
    );
    this.applyBranchFlex(this.baseBranchSprite, baseAttachment, this.surfaceId('base'));

  }

  setCanopyEnabled(enabled: boolean) {
    this.canopyEnabled = enabled;
    if (!enabled) {
      this.canopySprite.visible = false;
      this.canopySprite.renderable = false;
    }
  }

  getPlan() {
    if (!this.currentPlan) throw new Error('Tree view has no plan');
    return this.currentPlan;
  }

  getPooledSpriteCount() {
    return 3 + this.middleSprites.length + this.branchSprites.length + this.detailSprites.length;
  }

  flexBranch(surfaceId: string, contactRatio: number, impactSpeed: number) {
    if (!this.currentPlan || !surfaceId.startsWith(`tree-${this.currentPlan.sequence}-`)) return false;
    const state = this.branchFlex.get(surfaceId) ?? { displacement: 0, velocity: 0 };
    const contactScale = 0.45 + Math.max(0, Math.min(1, contactRatio)) * 0.55;
    const impactScale = Math.max(0, Math.min(1, impactSpeed / 900));
    const branchName = surfaceId.endsWith('-base')
      ? this.currentPlan.baseBranch
      : this.currentPlan.modules[Number(surfaceId.match(/-module-(\d+)$/)?.[1] ?? -1)]?.branch;
    const record = branchName ? this.attachments.attachments[branchName] : null;
    const outwardLength = record
      ? record.side === 'right' ? record.width - record.socket[0] : record.socket[0]
      : 220;
    const lengthBonus = 1 + Math.max(0, Math.min(1, (outwardLength - 250) / 160)) * 0.55;
    state.velocity = Math.min(
      230,
      state.velocity + (115 + impactScale * 55) * contactScale * lengthBonus,
    );
    this.branchFlex.set(surfaceId, state);
    return true;
  }

  disturbDecoration(decorationId: string, strength = 1) {
    if (!this.currentPlan || !decorationId.startsWith(`tree-${this.currentPlan.sequence}-decoration-`)) {
      return false;
    }
    const state = this.decorationFlex.get(decorationId) ?? { displacement: 0, velocity: 0 };
    state.velocity = Math.min(280, state.velocity + 220 * Math.max(0.55, Math.min(1, strength)));
    this.decorationFlex.set(decorationId, state);
    return true;
  }

  updateBranchFlex(deltaSeconds: number) {
    if (!this.currentPlan) return;
    for (const [id, state] of this.branchFlex) {
      state.velocity += (-110 * state.displacement - 12 * state.velocity) * deltaSeconds;
      state.displacement += state.velocity * deltaSeconds;
      if (Math.abs(state.displacement) < 0.015 && Math.abs(state.velocity) < 0.08) {
        state.displacement = 0;
        state.velocity = 0;
      }
      if (id === this.surfaceId('base')) {
        const record = this.attachments.attachments[this.currentPlan.baseBranch]!;
        this.applyBranchFlex(this.baseBranchSprite, record, id);
        continue;
      }
      const moduleIndex = Number(id.match(/-module-(\d+)$/)?.[1] ?? -1);
      const visibleSlot = this.currentPlan.modules
        .filter((module) => this.activeModuleKey.split(',').includes(String(module.index)))
        .findIndex((module) => module.index === moduleIndex);
      if (visibleSlot >= 0) {
        const module = this.currentPlan.modules.find((candidate) => candidate.index === moduleIndex)!;
        const record = this.attachments.attachments[module.branch]!;
        this.applyBranchFlex(this.branchSprites[visibleSlot]!, record, id);
      }
    }
    for (const [id, state] of this.decorationFlex) {
      state.velocity += (-125 * state.displacement - 14 * state.velocity) * deltaSeconds;
      state.displacement += state.velocity * deltaSeconds;
      if (Math.abs(state.displacement) < 0.015 && Math.abs(state.velocity) < 0.08) {
        state.displacement = 0;
        state.velocity = 0;
      }
      const match = id.match(/-decoration-(\d+)-(\d+)$/);
      const moduleIndex = Number(match?.[1] ?? -1);
      const decorationIndex = Number(match?.[2] ?? -1);
      const activeModules = this.currentPlan.modules.filter(
        (module) => this.activeModuleKey.split(',').includes(String(module.index)),
      );
      const detailSlot = activeModules
        .flatMap((module) => module.decorations.map((decoration, index) => ({ module, decoration, index })))
        .findIndex(({ module, index }) => module.index === moduleIndex && index === decorationIndex);
      if (detailSlot >= 0) {
        const decoration = this.currentPlan.modules[moduleIndex]?.decorations[decorationIndex];
        const record = decoration
          ? this.stack.decorations.find((candidate) => candidate.id === decoration.name)
          : null;
        if (record) this.deformDecoration(this.detailSprites[detailSlot]!, record, state.displacement);
      }
    }
  }

  getBranchFlexState() {
    return [...this.branchFlex.entries()]
      .filter(([, state]) => Math.abs(state.displacement) >= 0.01 || Math.abs(state.velocity) >= 0.05)
      .map(([id, state]) => ({
        id,
        displacement: Number(state.displacement.toFixed(2)),
        screenTipDisplacement: Number((state.displacement * Math.abs(this.scale.y)).toFixed(2)),
        velocity: Number(state.velocity.toFixed(2)),
      }));
  }

  getDecorationFlexState() {
    return [...this.decorationFlex.entries()]
      .filter(([, state]) => Math.abs(state.displacement) >= 0.01 || Math.abs(state.velocity) >= 0.05)
      .map(([id, state]) => ({
        id,
        displacement: Number(state.displacement.toFixed(2)),
        screenTipDisplacement: Number((state.displacement * Math.abs(this.scale.y)).toFixed(2)),
        velocity: Number(state.velocity.toFixed(2)),
      }));
  }

  updateVerticalCulling(parentOffsetY: number, viewportHeight: number, margin = 420) {
    if (!this.currentPlan) return;
    const plan = this.currentPlan;
    const treeScale = Math.abs(this.scale.y);
    const treeTopOnScreen = parentOffsetY + this.y - this.pivot.y * treeScale;
    const overlapsViewport = (top: number, height: number) => {
      const spriteTop = treeTopOnScreen + top * treeScale;
      const spriteBottom = spriteTop + Math.max(1, height * treeScale);
      return spriteBottom >= -margin && spriteTop <= viewportHeight + margin;
    };

    const activeModules = plan.modules.filter((module) => {
      const middleRecord = findArt(this.stack.middles, module.art);
      const attachment = this.attachments.attachments[module.branch]!;
      const branchTop = module.branchY - attachment.socket[1];
      return overlapsViewport(module.y, middleRecord.height)
        || overlapsViewport(branchTop, attachment.height);
    });
    this.activeModuleCount = activeModules.length;
    const moduleKey = activeModules.map((module) => module.index).join(',');
    if (moduleKey !== this.activeModuleKey) {
      this.activeModuleKey = moduleKey;
      this.ensurePool(this.middleSprites, activeModules.length, this.trunkLayer);
      this.ensureBranchPool(activeModules.length);
      for (let slot = 0; slot < activeModules.length; slot++) {
        const module = activeModules[slot]!;
        const middle = this.middleSprites[slot]!;
        const middleRecord = findArt(this.stack.middles, module.art);
        const targetLayer = middleRecord.hideHole ? this.hollowFrontLayer : this.trunkLayer;
        if (middle.parent !== targetLayer) targetLayer.addChild(middle);
        middle.zIndex = 1;
        middle.texture = texture(middleRecord);
        middle.position.set(0, module.y);

        const attachment = this.attachments.attachments[module.branch]!;
        const branch = this.branchSprites[slot]!;
        branch.texture = texture(attachment);
        branch.position.set(
          branchTargetX(attachment, plan.width) - attachment.socket[0],
          module.branchY - attachment.socket[1],
        );
        this.applyBranchFlex(branch, attachment, this.surfaceId(module.index));
      }

      const decorations = activeModules.flatMap((module) => module.decorations.map(
        (decoration, decorationIndex) => ({ decoration, decorationIndex, moduleIndex: module.index }),
      ));
      this.ensureDetailPool(decorations.length);
      for (let slot = 0; slot < decorations.length; slot++) {
        const { decoration, decorationIndex, moduleIndex } = decorations[slot]!;
        const record = this.stack.decorations.find((candidate) => candidate.id === decoration.name);
        if (!record) throw new Error(`Missing tree decoration: ${decoration.name}`);
        const mesh = this.detailSprites[slot]!;
        mesh.texture = texture(record);
        mesh.position.set(plan.width / 2 - record.socket[0], decoration.targetY - record.socket[1]);
        this.deformDecoration(
          mesh,
          record,
          this.decorationFlex.get(this.decorationId(moduleIndex, decorationIndex))?.displacement ?? 0,
        );
      }
    }

    const canopyRecord = findArt(this.stack.canopies, plan.canopy);
    this.canopySprite.x = (plan.width - canopyRecord.width) / 2;
    const canopyInRange = this.canopyEnabled && overlapsViewport(plan.canopyOffsetY, canopyRecord.height);
    if (canopyInRange && !this.canopySprite.visible) {
      this.canopySprite.texture = texture(canopyRecord);
    }
    this.canopySprite.visible = canopyInRange;
    this.canopySprite.renderable = canopyInRange;

    const sprites = [this.baseSprite, this.baseBranchSprite, ...this.middleSprites, ...this.branchSprites, ...this.detailSprites];
    for (const sprite of sprites) {
      if (!sprite.visible) {
        sprite.renderable = false;
        continue;
      }
      sprite.renderable = overlapsViewport(
        sprite.y,
        sprite.texture.height * Math.abs(sprite.scale.y),
      );
    }
  }

  getRenderableSpriteCount() {
    return [
      this.canopySprite,
      this.baseSprite,
      this.baseBranchSprite,
      ...this.middleSprites,
      ...this.branchSprites,
      ...this.detailSprites,
    ].filter((sprite) => sprite.visible && sprite.renderable).length;
  }

  getMaterializedModuleCount() {
    return this.activeModuleCount;
  }
}
