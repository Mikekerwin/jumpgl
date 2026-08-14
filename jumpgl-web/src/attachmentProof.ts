import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';

type AttachmentRecord = {
  path: string;
  width: number;
  height: number;
  socket: [number, number];
  class: 'nub' | 'small' | 'medium' | 'long' | 'trunk';
  side: 'left' | 'right' | 'center';
  fitment: string;
  socketBand: 'root-lower' | 'lower' | 'middle' | 'upper' | 'canopy' | 'trunk';
  detailProfile: 'branch' | 'rich' | 'calm';
  canonicalSocket: [number, number];
  lowerSupport?: number;
  canonicalInwardRange?: [number, number];
  sequence?: string;
  sequenceOrder?: number;
  vineLane?: string | null;
};

type Placement = { attachment: string; socket: [number, number] };
type AttachmentManifest = {
  status: string;
  neutralTree: { path: string; width: number; height: number };
  attachments: Record<string, AttachmentRecord>;
  lightingAudit: { path: string; pass: number; total: number };
  proofTrees: Record<string, Placement[]>;
};

type TreeView = {
  root: Container;
  attachmentLayer: Container;
  markerLayer: Container;
  placements: Placement[];
};

type AttachmentTuning = { x: number; y: number; brightness: number };

const clonePlacements = (placements: Placement[]): Placement[] =>
  placements.map(({ attachment, socket }) => ({ attachment, socket: [...socket] as [number, number] }));

const init = async () => {
  const app = new Application();
  await app.init({
    resizeTo: window,
    preference: 'webgl',
    powerPreference: 'high-performance',
    antialias: true,
    preserveDrawingBuffer: true,
    backgroundColor: 0x173b35,
    resolution: Math.min(window.devicePixelRatio, 1.5),
    autoDensity: true,
    roundPixels: false,
  });

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) throw new Error('Missing #app');
  mount.replaceChildren(app.canvas);

  const sandboxBase = `${import.meta.env.BASE_URL}forest-sandbox/`;
  const reviewVersion = new URLSearchParams(window.location.search).get('v');
  const versionedPath = (path: string): string =>
    reviewVersion ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(reviewVersion)}` : path;
  const sandboxAssetPath = (relativePath: string): string => versionedPath(`${sandboxBase}${relativePath}`);
  const manifest = await fetch(sandboxAssetPath('assets/attachment-proof/manifest.json')).then((response) => {
    if (!response.ok) throw new Error(`Attachment manifest failed: ${response.status}`);
    return response.json() as Promise<AttachmentManifest>;
  });

  const neutralPath = sandboxAssetPath(manifest.neutralTree.path);
  const backgroundPath = sandboxAssetPath('assets/trees/background.jpg');
  const attachmentPaths = Object.values(manifest.attachments).map((record) => sandboxAssetPath(record.path));
  await Promise.all([neutralPath, backgroundPath, ...attachmentPaths].map((path) => Assets.load(path)));

  const background = new Sprite(Texture.from(backgroundPath));
  background.anchor.set(0.5);
  app.stage.addChild(background);
  const veil = new Graphics();
  app.stage.addChild(veil);

  const treeLayer = new Container();
  app.stage.addChild(treeLayer);

  const makeTree = (): TreeView => {
    const root = new Container();
    const content = new Container();
    content.pivot.set(manifest.neutralTree.width / 2, manifest.neutralTree.height);
    const trunk = new Sprite(Texture.from(neutralPath));
    const attachmentLayer = new Container();
    const markerLayer = new Container();
    content.addChild(trunk, attachmentLayer, markerLayer);
    root.addChild(content);
    treeLayer.addChild(root);
    return { root, attachmentLayer, markerLayer, placements: [] };
  };

  const trees = [makeTree(), makeTree()];
  let treeScale = 0.6;
  let detailMode = true;
  let detailZoom = 1.35;
  let detailPanX = 0;
  let detailPanY = 0;
  let showSockets = false;
  let assortmentIndex = 0;
  let jointsSwapped = false;
  const tuning: Record<string, AttachmentTuning> = Object.fromEntries(
    Object.keys(manifest.attachments).map((name) => [name, { x: 0, y: 0, brightness: 1 }]),
  );
  let selectedAttachment = manifest.attachments['long-right-a'] ? 'long-right-a' : (Object.keys(manifest.attachments)[0] ?? '');

  const proofA = clonePlacements(manifest.proofTrees['tree-a'] ?? []);
  const proofB = clonePlacements(manifest.proofTrees['tree-b'] ?? []);
  const canonicalPlacement = (attachment: string): Placement => ({
    attachment,
    socket: [...manifest.attachments[attachment]!.canonicalSocket] as [number, number],
  });
  const trunkRunA = proofA.filter(({ attachment }) => manifest.attachments[attachment]?.class === 'trunk');
  const trunkRunB = proofB.filter(({ attachment }) => manifest.attachments[attachment]?.class === 'trunk');
  const trunkRunBWithoutSmall = trunkRunB.filter(
    ({ attachment }) => manifest.attachments[attachment]?.vineLane !== 'small',
  );
  const trunkRunAWithoutSmall = trunkRunA.filter(
    ({ attachment }) => manifest.attachments[attachment]?.vineLane !== 'small',
  );
  const arrangements: [Placement[], Placement[]][] = [
    [proofA, proofB],
    [
      [
        ...clonePlacements(trunkRunAWithoutSmall),
        canonicalPlacement('trunk-small-a'),
        canonicalPlacement('small-left-a'),
        canonicalPlacement('medium-right-straight-c'),
        canonicalPlacement('long-left-a'),
        canonicalPlacement('nub-right-b'),
      ],
      [
        ...clonePlacements(trunkRunBWithoutSmall),
        canonicalPlacement('trunk-small-b'),
        canonicalPlacement('medium-right-a'),
        canonicalPlacement('small-left-b'),
        canonicalPlacement('long-right-a'),
        canonicalPlacement('nub-right-a'),
      ],
    ],
    [
      [
        ...clonePlacements(trunkRunA),
        canonicalPlacement('small-left-a'),
        canonicalPlacement('long-right-a'),
        canonicalPlacement('nub-right-a'),
      ],
      [
        ...clonePlacements(trunkRunB),
        canonicalPlacement('medium-right-a'),
        canonicalPlacement('medium-right-b'),
        canonicalPlacement('medium-right-straight-c'),
        canonicalPlacement('long-left-a'),
        canonicalPlacement('nub-right-b'),
      ],
    ],
  ];

  const swapJointName = (name: string): string => {
    const swaps: Record<string, string> = {
      'nub-right-a': 'nub-right-b',
      'nub-right-b': 'nub-right-a',
    };
    return swaps[name] ?? name;
  };

  const drawTree = (tree: TreeView, sourcePlacements: Placement[]) => {
    tree.attachmentLayer.removeChildren().forEach((child) => child.destroy());
    tree.markerLayer.removeChildren().forEach((child) => child.destroy());
    tree.placements = sourcePlacements.map(({ attachment, socket }) => {
      const resolvedAttachment = jointsSwapped ? swapJointName(attachment) : attachment;
      const resolvedRecord = manifest.attachments[resolvedAttachment];
      return {
        attachment: resolvedAttachment,
        socket: resolvedAttachment === attachment
          ? [...socket] as [number, number]
          : [...resolvedRecord!.canonicalSocket] as [number, number],
      };
    });

    for (const placement of tree.placements) {
      const record = manifest.attachments[placement.attachment];
      if (!record) continue;
      const adjustment = tuning[placement.attachment] ?? { x: 0, y: 0, brightness: 1 };
      const sprite = new Sprite(Texture.from(sandboxAssetPath(record.path)));
      sprite.anchor.set(record.socket[0] / record.width, record.socket[1] / record.height);
      sprite.position.set(placement.socket[0] + adjustment.x, placement.socket[1] + adjustment.y);
      if (Math.abs(adjustment.brightness - 1) > 0.001) {
        const light = new ColorMatrixFilter();
        light.brightness(adjustment.brightness, false);
        sprite.filters = [light];
      }
      tree.attachmentLayer.addChild(sprite);

      const marker = new Graphics()
        .circle(placement.socket[0], placement.socket[1], 9)
        .fill({ color: 0x18d9ff, alpha: 0.35 })
        .stroke({ color: 0xc8f8ff, width: 3, alpha: 0.95 });
      tree.markerLayer.addChild(marker);
    }
    tree.markerLayer.visible = showSockets;
  };

  const updateStatus = () => {
    const status = document.querySelector<HTMLDivElement>('#status');
    if (!status) return;
    const uniqueFitments = new Set(
      trees.flatMap((tree) => tree.placements.map(({ attachment }) => manifest.attachments[attachment]?.fitment)),
    );
    status.textContent = `Canonical light audit ${manifest.lightingAudit.pass}/${manifest.lightingAudit.total} passing · ${Object.keys(manifest.attachments).length} attachments · ${uniqueFitments.size} styles visible`;
  };

  const rebuild = () => {
    const pair = arrangements[assortmentIndex % arrangements.length]!;
    drawTree(trees[0]!, pair[0]);
    drawTree(trees[1]!, pair[1]);
    updateStatus();
    resize();
  };

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const backgroundScale = Math.max(width / background.texture.width, height / background.texture.height);
    background.position.set(width / 2, height / 2);
    background.scale.set(backgroundScale);
    veil.clear().rect(0, 0, width, height).fill({ color: 0x071d17, alpha: 0.12 });

    const groundY = height - 8;
    if (detailMode) {
      let focusedTree = trees.find((tree) => tree.placements.some(({ attachment }) => attachment === selectedAttachment));
      focusedTree ??= trees[0];
      const focusedPlacement = focusedTree?.placements.find(({ attachment }) => attachment === selectedAttachment)
        ?? focusedTree?.placements[0];
      for (const tree of trees) tree.root.visible = tree === focusedTree;
      if (focusedTree && focusedPlacement) {
        const adjustment = tuning[focusedPlacement.attachment] ?? { x: 0, y: 0, brightness: 1 };
        const socketX = focusedPlacement.socket[0] + adjustment.x;
        const socketY = focusedPlacement.socket[1] + adjustment.y;
        const focusX = Math.max(width * 0.58, Math.min(width * 0.7, width - 260));
        const focusY = height * 0.52;
        focusedTree.root.scale.set(detailZoom);
        focusedTree.root.position.set(
          focusX + detailPanX - (socketX - manifest.neutralTree.width / 2) * detailZoom,
          focusY + detailPanY - (socketY - manifest.neutralTree.height) * detailZoom,
        );
      }
    } else {
      for (const tree of trees) tree.root.visible = true;
      trees[0]!.root.position.set(width * 0.29, groundY);
      trees[1]!.root.position.set(width * 0.72, groundY);
      for (const tree of trees) tree.root.scale.set(treeScale);
    }
  };

  const scaleInput = document.querySelector<HTMLInputElement>('#tree-scale');
  const scaleOutput = document.querySelector<HTMLOutputElement>('#tree-scale-output');
  scaleInput?.addEventListener('input', () => {
    treeScale = Number(scaleInput.value);
    if (scaleOutput) scaleOutput.value = treeScale.toFixed(2);
    resize();
  });

  const detailModeInput = document.querySelector<HTMLInputElement>('#detail-mode');
  const detailZoomInput = document.querySelector<HTMLInputElement>('#detail-zoom');
  const detailZoomOutput = document.querySelector<HTMLOutputElement>('#detail-zoom-output');
  detailModeInput?.addEventListener('change', () => {
    detailMode = detailModeInput.checked;
    app.canvas.style.cursor = detailMode ? 'grab' : 'default';
    resize();
  });
  detailZoomInput?.addEventListener('input', () => {
    detailZoom = Number(detailZoomInput.value);
    if (detailZoomOutput) detailZoomOutput.value = detailZoom.toFixed(2);
    resize();
  });

  const socketInput = document.querySelector<HTMLInputElement>('#show-sockets');
  socketInput?.addEventListener('change', () => {
    showSockets = socketInput.checked;
    for (const tree of trees) tree.markerLayer.visible = showSockets;
  });

  const newAssortments = () => {
    assortmentIndex = (assortmentIndex + 1) % arrangements.length;
    rebuild();
  };
  const swapFitments = () => {
    jointsSwapped = !jointsSwapped;
    rebuild();
  };
  document.querySelector<HTMLButtonElement>('#new-assortments')?.addEventListener('click', newAssortments);
  document.querySelector<HTMLButtonElement>('#swap-fitments')?.addEventListener('click', swapFitments);

  const attachmentSelect = document.querySelector<HTMLSelectElement>('#attachment-select');
  const xInput = document.querySelector<HTMLInputElement>('#attachment-x');
  const yInput = document.querySelector<HTMLInputElement>('#attachment-y');
  const brightnessInput = document.querySelector<HTMLInputElement>('#attachment-brightness');
  const xOutput = document.querySelector<HTMLOutputElement>('#attachment-x-output');
  const yOutput = document.querySelector<HTMLOutputElement>('#attachment-y-output');
  const brightnessOutput = document.querySelector<HTMLOutputElement>('#attachment-brightness-output');

  if (attachmentSelect) {
    for (const [name, record] of Object.entries(manifest.attachments)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name} · ${record.fitment}`;
      attachmentSelect.append(option);
    }
    attachmentSelect.value = selectedAttachment;
  }

  const syncCalibrationControls = () => {
    const adjustment = tuning[selectedAttachment];
    if (!adjustment) return;
    if (xInput) xInput.value = String(adjustment.x);
    if (yInput) yInput.value = String(adjustment.y);
    if (brightnessInput) brightnessInput.value = String(adjustment.brightness);
    if (xOutput) xOutput.value = String(adjustment.x);
    if (yOutput) yOutput.value = String(adjustment.y);
    if (brightnessOutput) brightnessOutput.value = adjustment.brightness.toFixed(2);
  };

  const applyCalibrationControls = () => {
    const adjustment = tuning[selectedAttachment];
    if (!adjustment) return;
    adjustment.x = Number(xInput?.value ?? 0);
    adjustment.y = Number(yInput?.value ?? 0);
    adjustment.brightness = Number(brightnessInput?.value ?? 1);
    syncCalibrationControls();
    rebuild();
  };
  attachmentSelect?.addEventListener('change', () => {
    selectedAttachment = attachmentSelect.value;
    detailPanX = 0;
    detailPanY = 0;
    syncCalibrationControls();
    resize();
  });
  xInput?.addEventListener('input', applyCalibrationControls);
  yInput?.addEventListener('input', applyCalibrationControls);
  brightnessInput?.addEventListener('input', applyCalibrationControls);
  document.querySelector<HTMLButtonElement>('#reset-attachment')?.addEventListener('click', () => {
    if (!tuning[selectedAttachment]) return;
    tuning[selectedAttachment] = { x: 0, y: 0, brightness: 1 };
    syncCalibrationControls();
    rebuild();
  });
  document.querySelector<HTMLButtonElement>('#reset-view')?.addEventListener('click', () => {
    detailPanX = 0;
    detailPanY = 0;
    resize();
  });
  syncCalibrationControls();

  let canvasDrag: { pointerId: number; startX: number; startY: number; panX: number; panY: number } | null = null;
  app.canvas.style.cursor = 'grab';
  app.canvas.style.touchAction = 'none';
  app.canvas.addEventListener('pointerdown', (event) => {
    if (!detailMode) return;
    canvasDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: detailPanX,
      panY: detailPanY,
    };
    app.canvas.setPointerCapture(event.pointerId);
    app.canvas.style.cursor = 'grabbing';
  });
  app.canvas.addEventListener('pointermove', (event) => {
    if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
    detailPanX = canvasDrag.panX + event.clientX - canvasDrag.startX;
    detailPanY = canvasDrag.panY + event.clientY - canvasDrag.startY;
    resize();
  });
  const finishCanvasDrag = (event: PointerEvent) => {
    if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
    canvasDrag = null;
    app.canvas.releasePointerCapture(event.pointerId);
    app.canvas.style.cursor = detailMode ? 'grab' : 'default';
  };
  app.canvas.addEventListener('pointerup', finishCanvasDrag);
  app.canvas.addEventListener('pointercancel', finishCanvasDrag);

  const hud = document.querySelector<HTMLDivElement>('#hud');
  const hudTitle = document.querySelector<HTMLElement>('#hud-title');
  let hudDrag: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  hudTitle?.addEventListener('pointerdown', (event) => {
    if (!hud) return;
    const bounds = hud.getBoundingClientRect();
    hudDrag = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    hudTitle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  hudTitle?.addEventListener('pointermove', (event) => {
    if (!hud || !hudDrag || hudDrag.pointerId !== event.pointerId) return;
    const maximumLeft = Math.max(0, window.innerWidth - hud.offsetWidth);
    const maximumTop = Math.max(0, window.innerHeight - hud.offsetHeight);
    hud.style.left = `${Math.max(0, Math.min(maximumLeft, event.clientX - hudDrag.offsetX))}px`;
    hud.style.top = `${Math.max(0, Math.min(maximumTop, event.clientY - hudDrag.offsetY))}px`;
  });
  const finishHudDrag = (event: PointerEvent) => {
    if (!hudDrag || hudDrag.pointerId !== event.pointerId) return;
    hudDrag = null;
    hudTitle?.releasePointerCapture(event.pointerId);
  };
  hudTitle?.addEventListener('pointerup', finishHudDrag);
  hudTitle?.addEventListener('pointercancel', finishHudDrag);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r') newAssortments();
    if (event.key.toLowerCase() === 'j') swapFitments();
    if (event.key.toLowerCase() === 'f') void document.documentElement.requestFullscreen();
  });

  rebuild();
  resize();
  document.querySelector<HTMLDivElement>('#loading')?.remove();

  (window as Window & { advanceTime?: (milliseconds: number) => void }).advanceTime = (milliseconds: number) => {
    app.ticker.update(app.ticker.lastTime + milliseconds);
  };
  (window as Window & { render_game_to_text?: () => string }).render_game_to_text = () =>
    JSON.stringify({
      proof: 'separate-sprite modular attachments',
      treeScale,
      detailMode,
      detailZoom,
      detailPan: { x: detailPanX, y: detailPanY },
      assortment: assortmentIndex,
      jointsSwapped,
      showSockets,
      selectedAttachment,
      tuning,
      trees: trees.map((tree) =>
        tree.placements.map(({ attachment, socket }) => ({
          attachment,
          class: manifest.attachments[attachment]?.class,
          side: manifest.attachments[attachment]?.side,
          fitment: manifest.attachments[attachment]?.fitment,
          socketBand: manifest.attachments[attachment]?.socketBand,
          detailProfile: manifest.attachments[attachment]?.detailProfile,
          vineLane: manifest.attachments[attachment]?.vineLane,
          lowerSupport: manifest.attachments[attachment]?.lowerSupport,
          canonicalInwardRange: manifest.attachments[attachment]?.canonicalInwardRange,
          targetSocket: socket,
        })),
      ),
    });
};

void init().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const loading = document.querySelector<HTMLDivElement>('#loading');
  if (loading) loading.textContent = `Attachment proof failed: ${message}`;
  console.error(error);
});
