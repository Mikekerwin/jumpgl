import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { PlatformCollision, PlayerBounds } from './floatingPlatforms';

type OrbitDot = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
  wobble: number;
  wobbleSpeed: number;
  color: { r: number; g: number; b: number };
  pulsePhase: number;
  pulseSpeed: number;
  pulseMin: number;
  pulseMax: number;
  bobPhase: number;
  bobSpeed: number;
  bobAmplitude: number;
  isAccent: boolean;
};

type MeteorOrbState = {
  active: boolean;
  collected: boolean;
  anchorLeftId: number | null;
  anchorRightId: number | null;
  x: number;
  y: number;
  velocityY: number;
  bounceCount: number;
  surfaceOverrideY: number | null;
  platformId: number | null;
  compactScale: number;
  compactTarget: number;
  bobPhase: number;
  flashUntil: number;
  anchorSurfaceY: number | null;
};

type ExtraOrbState = {
  enabled: boolean;
  x: number;
  y: number;
  initialized: boolean;
  compactScale: number;
  compactTarget: number;
};

export type MeteorOrbUpdateParams = {
  deltaSeconds: number;
  timeMs: number;
  treehouseAnchor: { x: number; y: number } | null;
  playerRadius: number;
  playerState: { x: number; y: number };
  computePlayerGround: () => number;
};

export type MeteorOrbController = {
  update: (params: MeteorOrbUpdateParams) => void;
  resize: (width: number, height: number) => void;
  onRespawn: (playerX: number, respawnY: number, playerRadius: number) => void;
  resetIfNotCollected: () => void;
  resetAll: () => void;
  setExtraEnabled: (enabled: boolean) => void;
  toggleExtra: () => boolean;
  setExtraCompactTarget: (target: number) => void;
  getExtraState: () => { enabled: boolean; compactTarget: number };
  isCollected: () => boolean;
};

export type MeteorOrbProps = {
  app: Application;
  playfieldContainer: Container;
  orbContainer?: Container;
  platforms: {
    getPlatformBoundsById: (id: number) => PlatformCollision | null;
    getSupportingPlatform: (
      currentBounds: PlayerBounds,
      prevBounds: PlayerBounds,
      velocityY: number
    ) => PlatformCollision | null;
  };
};

export const createMeteorOrb = (params: MeteorOrbProps): MeteorOrbController => {
  const { app, playfieldContainer, platforms, orbContainer } = params;

  const METEOR_ORB_PADDING = 240;
  const METEOR_ORB_RADIUS = 18;
  const METEOR_ORB_GRAVITY = 9000;
  const METEOR_ORB_BOUNCE_DAMPING = 0.45;
  const METEOR_ORB_MIN_BOUNCE_VELOCITY = 140;
  const METEOR_ORB_PLATFORM_BOUNCES = 3;
  const METEOR_ORB_GLOW = 1.0;
  const METEOR_ORB_BRIGHTNESS = 1.2;
  const METEOR_ORB_SPRITE_ALPHA = 1;
  const METEOR_ORB_COMPACT_SCALE = 0.45;
  const METEOR_ORB_GLOW_STRENGTH = 0.45;
  const METEOR_ORB_GLOW_BLUR_MULT = 2.2;
  const METEOR_ORB_ACCENT_COLOR = { r: 79, g: 195, b: 247 };
  const METEOR_ORB_ACCENT_ALPHA = 1;
  const METEOR_ORB_WHITE_COLOR = { r: 255, g: 255, b: 255 };
  const METEOR_ORB_FLASH_COLOR = { r: 72, g: 190, b: 255 };
  const METEOR_ORB_FLASH_DURATION = 0.28;

  const meteorOrbCanvas = document.createElement('canvas');
  meteorOrbCanvas.width = app.renderer.width + METEOR_ORB_PADDING * 2;
  meteorOrbCanvas.height = app.renderer.height + METEOR_ORB_PADDING * 2;
  const meteorOrbCtx = meteorOrbCanvas.getContext('2d');
  if (!meteorOrbCtx) {
    throw new Error('Failed to create meteor orb canvas');
  }
  const meteorOrbTexture = Texture.from(meteorOrbCanvas);
  const meteorOrbSprite = new Sprite(meteorOrbTexture);
  meteorOrbSprite.blendMode = 'screen';
  meteorOrbSprite.alpha = METEOR_ORB_SPRITE_ALPHA;
  meteorOrbSprite.position.set(-METEOR_ORB_PADDING, -METEOR_ORB_PADDING);

  const meteorOrbAccentCanvas = document.createElement('canvas');
  meteorOrbAccentCanvas.width = app.renderer.width + METEOR_ORB_PADDING * 2;
  meteorOrbAccentCanvas.height = app.renderer.height + METEOR_ORB_PADDING * 2;
  const meteorOrbAccentCtx = meteorOrbAccentCanvas.getContext('2d');
  if (!meteorOrbAccentCtx) {
    throw new Error('Failed to create meteor orb accent canvas');
  }
  const meteorOrbAccentTexture = Texture.from(meteorOrbAccentCanvas);
  const meteorOrbAccentSprite = new Sprite(meteorOrbAccentTexture);
  meteorOrbAccentSprite.blendMode = 'screen';
  meteorOrbAccentSprite.position.set(-METEOR_ORB_PADDING, -METEOR_ORB_PADDING);

  const orbLayer = orbContainer ?? playfieldContainer;
  orbLayer.addChild(meteorOrbAccentSprite);
  orbLayer.addChild(meteorOrbSprite);

  const tintOrbColor = (base: { r: number; g: number; b: number }, variance: number) => {
    const apply = (c: number) => {
      const v = c * (1 + (Math.random() - 0.5) * variance);
      return Math.max(0, Math.min(255, Math.round(v)));
    };
    return { r: apply(base.r), g: apply(base.g), b: apply(base.b) };
  };

  const createOrbDots = (
    count: number,
    radiusMin: number,
    radiusMax: number,
    speedMin: number,
    speedMax: number,
    sizeMin: number,
    sizeMax: number,
    alpha: number,
    baseColor: { r: number; g: number; b: number }
  ): OrbitDot[] => {
    const dots: OrbitDot[] = [];
    for (let i = 0; i < count; i++) {
      const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
      const speed = (Math.random() > 0.5 ? 1 : -1) * (speedMin + Math.random() * (speedMax - speedMin));
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      dots.push({
        angle: Math.random() * Math.PI * 2,
        radius,
        speed,
        size,
        alpha,
        wobble: 2 + Math.random() * 6,
        wobbleSpeed: 0.6 + Math.random() * 1.1,
        color: tintOrbColor(baseColor, 0.25),
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0,
        pulseMin: 1,
        pulseMax: 1,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.6 + Math.random() * 1.5,
        bobAmplitude: 2.5 + Math.random() * 7.2,
        isAccent: false,
      });
    }
    return dots;
  };

  const orbOuterColor = { r: 120, g: 220, b: 255 };
  const orbInnerColor = { r: 85, g: 195, b: 245 };
  const orbCoreColor = { r: 55, g: 165, b: 225 };
  const orbFarPalette = [
    { r: 185, g: 245, b: 255 },
    { r: 130, g: 215, b: 255 },
    { r: 70, g: 170, b: 235 },
  ];
  const orbFarAccent = { r: 50, g: 135, b: 210 };
  const orbOuterPalette = [
    { r: 45, g: 140, b: 215 },
    { r: 95, g: 195, b: 250 },
    { r: 165, g: 235, b: 255 },
  ];
  const orbOuterAccent = { r: 35, g: 120, b: 200 };
  const orbInnerPalette = [
    { r: 40, g: 135, b: 205 },
    { r: 85, g: 185, b: 240 },
    { r: 140, g: 225, b: 255 },
  ];
  const orbMidPalette = [
    { r: 210, g: 245, b: 255 },
    { r: 170, g: 235, b: 255 },
    { r: 130, g: 220, b: 255 },
  ];
  const orbCorePalette = [
    { r: 230, g: 238, b: 250 },
    { r: 210, g: 225, b: 245 },
    { r: 245, g: 248, b: 255 },
  ];

  const meteorOrbOuterDots = createOrbDots(14, 46, 68, 1.2, 2.2, 2.8, 4.4, 0.75, orbOuterColor);
  const meteorOrbInnerDots = createOrbDots(10, 28, 42, 0.9, 1.6, 3.0, 5.0, 0.85, orbInnerColor);
  const meteorOrbMidDots = createOrbDots(8, 20, 32, 0.95, 1.5, 4.0, 6.5, 0.92, orbOuterColor);
  const meteorOrbCoreDots = createOrbDots(5, 14, 24, 0.5, 1.0, 8.0, 12.0, 0.95, orbCoreColor);
  const meteorOrbFarDots = createOrbDots(16, 78, 110, 0.5, 1.0, 1.2, 2.2, 0.8, orbOuterColor);
  const boostBob = (dots: OrbitDot[], amplitudeScale: number, speedScale: number) => {
    dots.forEach((dot) => {
      dot.bobAmplitude *= amplitudeScale;
      dot.bobSpeed *= speedScale;
      dot.bobPhase += Math.random() * 0.6;
    });
  };
  const tightenCore = (dots: OrbitDot[]) => {
    dots.forEach((dot) => {
      dot.wobble = Math.min(dot.wobble, 0.8);
      dot.bobAmplitude = Math.min(dot.bobAmplitude, 0.5);
      dot.bobSpeed *= 0.5;
      dot.pulseMin = 1;
      dot.pulseMax = 1;
      dot.pulseSpeed = 0;
    });
  };
  boostBob(meteorOrbOuterDots, 1.7, 1.1);
  boostBob(meteorOrbInnerDots, 2.2, 1.15);
  boostBob(meteorOrbMidDots, 1.9, 1.2);
  tightenCore(meteorOrbCoreDots);

  const pickPaletteColor = (palette: Array<{ r: number; g: number; b: number }>) =>
    palette[Math.floor(Math.random() * palette.length)];

  const darkenColor = (color: { r: number; g: number; b: number }, factor: number) => ({
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor),
  });

  const applyPalette = (
    dots: OrbitDot[],
    palette: Array<{ r: number; g: number; b: number }>,
    accent?: { r: number; g: number; b: number },
    accentCount: number = 0,
    variance: number = 0.1
  ) => {
    dots.forEach((dot) => {
      dot.color = tintOrbColor(pickPaletteColor(palette), variance);
    });

    if (accent && accentCount > 0) {
      const used = new Set<number>();
      for (let i = 0; i < accentCount && used.size < dots.length; i++) {
        let idx = Math.floor(Math.random() * dots.length);
        while (used.has(idx)) {
          idx = Math.floor(Math.random() * dots.length);
        }
        used.add(idx);
        dots[idx].color = tintOrbColor(accent, 0.08);
      }
    }
  };

  const applyPulse = (
    dots: OrbitDot[],
    minScale: number,
    maxScale: number,
    speedMin: number,
    speedMax: number
  ) => {
    dots.forEach((dot) => {
      dot.pulseMin = minScale;
      dot.pulseMax = maxScale;
      dot.pulseSpeed = speedMin + Math.random() * (speedMax - speedMin);
      dot.pulsePhase = Math.random() * Math.PI * 2;
    });
  };

  applyPalette(meteorOrbOuterDots, orbOuterPalette, orbOuterAccent, 2, 0.18);
  meteorOrbInnerDots.forEach((dot, idx) => {
    const base = tintOrbColor(pickPaletteColor(orbInnerPalette), 0.18);
    dot.color = idx % 3 === 0 ? tintOrbColor(darkenColor(base, 0.55), 0.08) : base;
  });
  applyPalette(meteorOrbMidDots, orbMidPalette, undefined, 0, 0.08);
  applyPalette(meteorOrbCoreDots, orbCorePalette, undefined, 0, 0.08);
  applyPalette(meteorOrbFarDots, orbFarPalette, orbFarAccent, 2, 0.2);
  applyPulse(meteorOrbFarDots, 0, 1, 1.6, 2.8);
  applyPulse(meteorOrbOuterDots, 0.8, 1.15, 0.9, 1.6);
  applyPulse(meteorOrbInnerDots, 0.85, 1.2, 1.0, 1.8);
  applyPulse(meteorOrbMidDots, 0.8, 1.25, 1.1, 2.0);

  const applyAccentDots = (dots: OrbitDot[], count: number) => {
    const used = new Set<number>();
    for (let i = 0; i < count && used.size < dots.length; i++) {
      let idx = Math.floor(Math.random() * dots.length);
      while (used.has(idx)) {
        idx = Math.floor(Math.random() * dots.length);
      }
      used.add(idx);
      dots[idx].isAccent = true;
      dots[idx].color = METEOR_ORB_ACCENT_COLOR;
    }
  };

  applyAccentDots(meteorOrbOuterDots, 2);
  applyAccentDots(meteorOrbInnerDots, 1);
  applyAccentDots(meteorOrbFarDots, 1);

  meteorOrbCoreDots.forEach((dot) => {
    dot.isAccent = false;
  });
  if (meteorOrbCoreDots.length > 0) {
    const idx = Math.floor(Math.random() * meteorOrbCoreDots.length);
    meteorOrbCoreDots[idx].isAccent = true;
    meteorOrbCoreDots[idx].color = METEOR_ORB_ACCENT_COLOR;
  }

  const meteorOrbState: MeteorOrbState = {
    active: false,
    collected: false,
    anchorLeftId: null,
    anchorRightId: null,
    x: 0,
    y: 0,
    velocityY: 0,
    bounceCount: 0,
    surfaceOverrideY: null,
    platformId: null,
    compactScale: 1,
    compactTarget: 1,
    bobPhase: Math.random() * Math.PI * 2,
    flashUntil: 0,
    anchorSurfaceY: null,
  };

  const extraOrbState: ExtraOrbState = {
    enabled: false,
    x: 0,
    y: 0,
    initialized: false,
    compactScale: 1,
    compactTarget: 1,
  };

  const update = ({
    deltaSeconds,
    timeMs,
    treehouseAnchor,
    playerRadius,
    playerState,
    computePlayerGround,
  }: MeteorOrbUpdateParams) => {
    const hasTreehouseAnchor = treehouseAnchor !== null;
    if (!meteorOrbState.collected) {
      if (!hasTreehouseAnchor && meteorOrbState.active) {
        meteorOrbState.active = false;
        meteorOrbState.anchorLeftId = null;
        meteorOrbState.anchorRightId = null;
        meteorOrbState.velocityY = 0;
        meteorOrbState.bounceCount = 0;
        meteorOrbState.surfaceOverrideY = null;
        meteorOrbState.platformId = null;
        meteorOrbState.anchorSurfaceY = null;
      }
    }

    if (!meteorOrbState.collected && hasTreehouseAnchor && treehouseAnchor) {
      const justActivated = !meteorOrbState.active;
      meteorOrbState.active = true;
      const targetX = treehouseAnchor.x;
      const targetY = treehouseAnchor.y;
      if (justActivated) {
        meteorOrbState.x = targetX;
        meteorOrbState.y = targetY;
        meteorOrbState.velocityY = 0;
        meteorOrbState.bounceCount = 0;
        meteorOrbState.surfaceOverrideY = null;
        meteorOrbState.platformId = null;
        meteorOrbState.anchorSurfaceY = null;
      }
      const anchorLerp = 1 - Math.exp(-deltaSeconds * 3.2);
      meteorOrbState.x += (targetX - meteorOrbState.x) * anchorLerp;
      meteorOrbState.y += (targetY - meteorOrbState.y) * anchorLerp;
    } else if (!meteorOrbState.collected) {
      meteorOrbState.anchorSurfaceY = null;
    }

    const orbState = meteorOrbState.active || meteorOrbState.collected ? playerState : null;

    if (meteorOrbState.active && !meteorOrbState.collected && !hasTreehouseAnchor) {
      const prevBounds = {
        left: meteorOrbState.x - METEOR_ORB_RADIUS,
        right: meteorOrbState.x + METEOR_ORB_RADIUS,
        top: meteorOrbState.y - METEOR_ORB_RADIUS,
        bottom: meteorOrbState.y + METEOR_ORB_RADIUS,
      };

      meteorOrbState.velocityY += METEOR_ORB_GRAVITY * deltaSeconds;
      meteorOrbState.y += meteorOrbState.velocityY * deltaSeconds;

      if (meteorOrbState.platformId !== null) {
        const livePlatform = platforms.getPlatformBoundsById(meteorOrbState.platformId);
        if (
          !livePlatform ||
          meteorOrbState.x < livePlatform.left - METEOR_ORB_RADIUS ||
          meteorOrbState.x > livePlatform.right + METEOR_ORB_RADIUS
        ) {
          meteorOrbState.platformId = null;
          meteorOrbState.surfaceOverrideY = null;
          meteorOrbState.bounceCount = 0;
        } else {
          meteorOrbState.surfaceOverrideY = livePlatform.surfaceY + METEOR_ORB_RADIUS;
        }
      }

      const currentBounds = {
        left: meteorOrbState.x - METEOR_ORB_RADIUS,
        right: meteorOrbState.x + METEOR_ORB_RADIUS,
        top: meteorOrbState.y - METEOR_ORB_RADIUS,
        bottom: meteorOrbState.y + METEOR_ORB_RADIUS,
      };

      if (meteorOrbState.platformId === null) {
        const supportingPlatform = platforms.getSupportingPlatform(
          currentBounds,
          prevBounds,
          meteorOrbState.velocityY
        );
        if (supportingPlatform) {
          meteorOrbState.platformId = supportingPlatform.id;
          meteorOrbState.surfaceOverrideY = supportingPlatform.surfaceY + METEOR_ORB_RADIUS;
          meteorOrbState.bounceCount = 0;
        }
      }

      const baseGround = computePlayerGround() - METEOR_ORB_RADIUS;
      const platformGround = meteorOrbState.surfaceOverrideY ?? baseGround;
      const effectiveGround =
        meteorOrbState.anchorSurfaceY !== null
          ? Math.min(meteorOrbState.anchorSurfaceY, platformGround)
          : platformGround;

      if (meteorOrbState.y > effectiveGround) {
        meteorOrbState.y = effectiveGround;
        if (meteorOrbState.velocityY > 0) {
          if (meteorOrbState.surfaceOverrideY !== null) {
            meteorOrbState.bounceCount += 1;
            if (meteorOrbState.bounceCount >= METEOR_ORB_PLATFORM_BOUNCES) {
              meteorOrbState.velocityY = 0;
            } else {
              meteorOrbState.velocityY = -meteorOrbState.velocityY * METEOR_ORB_BOUNCE_DAMPING;
              if (Math.abs(meteorOrbState.velocityY) < METEOR_ORB_MIN_BOUNCE_VELOCITY) {
                meteorOrbState.velocityY = 0;
                meteorOrbState.bounceCount = METEOR_ORB_PLATFORM_BOUNCES;
              }
            }
          } else {
            meteorOrbState.velocityY = -meteorOrbState.velocityY * METEOR_ORB_BOUNCE_DAMPING;
            if (Math.abs(meteorOrbState.velocityY) < METEOR_ORB_MIN_BOUNCE_VELOCITY) {
              meteorOrbState.velocityY = 0;
            }
          }
        }
      }

      if (meteorOrbState.surfaceOverrideY !== null && Math.abs(meteorOrbState.velocityY) < METEOR_ORB_MIN_BOUNCE_VELOCITY) {
        meteorOrbState.y = meteorOrbState.surfaceOverrideY;
      }
    }

    if (orbState && meteorOrbState.active && !meteorOrbState.collected) {
      const dx = orbState.x - meteorOrbState.x;
      const dy = orbState.y - meteorOrbState.y;
      const collectRadius = playerRadius + METEOR_ORB_RADIUS;
      if ((dx * dx + dy * dy) <= collectRadius * collectRadius) {
        meteorOrbState.collected = true;
        meteorOrbState.active = true;
        meteorOrbState.velocityY = 0;
        meteorOrbState.bounceCount = 0;
        meteorOrbState.surfaceOverrideY = null;
        meteorOrbState.platformId = null;
        meteorOrbState.flashUntil = timeMs + METEOR_ORB_FLASH_DURATION * 1000;
      }
    }

    if (orbState && meteorOrbState.collected) {
      const followX = orbState.x - playerRadius * 2.2;
      const followY = orbState.y - playerRadius * 0.9 + 5;
      const followLerp = 1 - Math.exp(-deltaSeconds * 6);
      meteorOrbState.x += (followX - meteorOrbState.x) * followLerp;
      meteorOrbState.y += (followY - meteorOrbState.y) * followLerp;
    }

    meteorOrbState.compactTarget = meteorOrbState.collected ? METEOR_ORB_COMPACT_SCALE : 1;
    const compactLerp = 1 - Math.exp(-deltaSeconds * 2.8);
    meteorOrbState.compactScale += (meteorOrbState.compactTarget - meteorOrbState.compactScale) * compactLerp;

    if (extraOrbState.enabled) {
      const targetX = playerState.x;
      const targetY = playerState.y;
      if (!extraOrbState.initialized) {
        extraOrbState.x = targetX;
        extraOrbState.y = targetY;
        extraOrbState.initialized = true;
        extraOrbState.compactScale = 1;
      }
      const followLerp = 1 - Math.exp(-deltaSeconds * 8);
      extraOrbState.x += (targetX - extraOrbState.x) * followLerp;
      extraOrbState.y += (targetY - extraOrbState.y) * followLerp;
      const extraCompactLerp = 1 - Math.exp(-deltaSeconds * 2.8);
      extraOrbState.compactScale += (extraOrbState.compactTarget - extraOrbState.compactScale) * extraCompactLerp;
    } else if (extraOrbState.initialized) {
      extraOrbState.initialized = false;
    }

    const orbVisible = meteorOrbState.active || meteorOrbState.collected || extraOrbState.enabled;
    meteorOrbSprite.visible = orbVisible;
    meteorOrbAccentSprite.visible = orbVisible;
    meteorOrbCtx.clearRect(0, 0, meteorOrbCanvas.width, meteorOrbCanvas.height);
    meteorOrbAccentCtx.clearRect(0, 0, meteorOrbAccentCanvas.width, meteorOrbAccentCanvas.height);
    if (orbVisible) {
      const advanceDots = (dots: OrbitDot[], speedScale: number) => {
        dots.forEach((dot) => {
          dot.angle += dot.speed * deltaSeconds * speedScale;
        });
      };
      const renderDots = (
        dots: OrbitDot[],
        scale: number,
        colorOverride: { r: number; g: number; b: number } | null,
        whiteActive: boolean,
        radialPulseScale: number = 0
      ) => {
        const time = timeMs / 1000;
        dots.forEach((dot) => {
          if (dot.isAccent) return;
          const wobble = Math.sin(time * dot.wobbleSpeed + dot.angle) * dot.wobble;
          const osc = Math.sin(time * dot.pulseSpeed + dot.pulsePhase);
          const pulse =
            dot.pulseSpeed > 0
              ? dot.pulseMin + (dot.pulseMax - dot.pulseMin) * (0.5 + 0.5 * osc)
              : 1;
          const radialPulse = radialPulseScale > 0 ? (1 + osc * radialPulseScale) : 1;
          const radius = (dot.radius + wobble) * scale * radialPulse;
          const x = Math.cos(dot.angle) * radius;
          const bob = Math.sin(time * dot.bobSpeed + dot.bobPhase) * dot.bobAmplitude;
          const y = Math.sin(dot.angle) * radius + bob;
          const depth = Math.cos(dot.angle);
          const shade = colorOverride ? 1 : 0.7 + 0.3 * ((depth + 1) * 0.5);
          const alpha = dot.alpha * (0.75 + 0.25 * ((depth + 1) * 0.5)) * METEOR_ORB_GLOW * (0.35 + 0.65 * pulse);
          const alphaBoost = whiteActive ? 1.4 : 1;
          const glowBoost = whiteActive ? 1.4 : 1;
          const finalAlpha = Math.min(1, alpha * alphaBoost);
          const baseColor = colorOverride ?? dot.color;
          const r = Math.min(255, Math.round(baseColor.r * shade * METEOR_ORB_BRIGHTNESS));
          const g = Math.min(255, Math.round(baseColor.g * shade * METEOR_ORB_BRIGHTNESS));
          const b = Math.min(255, Math.round(baseColor.b * shade * METEOR_ORB_BRIGHTNESS));
          const dotSize = dot.size * pulse;
          if (dotSize <= 0.05 || finalAlpha <= 0.02) {
            return;
          }
          meteorOrbCtx.shadowBlur = dot.size * METEOR_ORB_GLOW_BLUR_MULT;
          meteorOrbCtx.shadowColor = `rgba(${r}, ${g}, ${b}, ${finalAlpha * METEOR_ORB_GLOW_STRENGTH * glowBoost})`;
          meteorOrbCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
          meteorOrbCtx.beginPath();
          meteorOrbCtx.arc(x, y, dotSize, 0, Math.PI * 2);
          meteorOrbCtx.fill();
          meteorOrbCtx.shadowBlur = 0;
        });
      };
      const renderAccentDots = (
        dots: OrbitDot[],
        scale: number,
        colorOverride: { r: number; g: number; b: number } | null,
        radialPulseScale: number = 0
      ) => {
        const time = timeMs / 1000;
        dots.forEach((dot) => {
          if (!dot.isAccent) return;
          const wobble = Math.sin(time * dot.wobbleSpeed + dot.angle) * dot.wobble;
          const osc = Math.sin(time * dot.pulseSpeed + dot.pulsePhase);
          const pulse =
            dot.pulseSpeed > 0
              ? dot.pulseMin + (dot.pulseMax - dot.pulseMin) * (0.5 + 0.5 * osc)
              : 1;
          const radialPulse = radialPulseScale > 0 ? (1 + osc * radialPulseScale) : 1;
          const radius = (dot.radius + wobble) * scale * radialPulse;
          const x = Math.cos(dot.angle) * radius;
          const y = Math.sin(dot.angle) * radius + Math.sin(time * dot.bobSpeed + dot.bobPhase) * dot.bobAmplitude;
          const dotSize = dot.size * pulse;
          const alpha = Math.min(1, dot.alpha * (0.6 + 0.4 * pulse) * METEOR_ORB_ACCENT_ALPHA);
          const baseColor = colorOverride ?? dot.color;
          meteorOrbAccentCtx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
          meteorOrbAccentCtx.beginPath();
          meteorOrbAccentCtx.arc(x, y, dotSize, 0, Math.PI * 2);
          meteorOrbAccentCtx.fill();
        });
      };

      advanceDots(meteorOrbFarDots, 1.05);
      advanceDots(meteorOrbOuterDots, 1.35);
      advanceDots(meteorOrbInnerDots, 1.1);
      advanceDots(meteorOrbMidDots, 1.05);
      advanceDots(meteorOrbCoreDots, 0.8);

      const renderOrb = (
        orbX: number,
        orbY: number,
        compactScale: number,
        isCollected: boolean,
        flashUntil: number
      ) => {
        const flashActive = isCollected && timeMs < flashUntil;
        const whiteActive = !isCollected && !flashActive;
        const colorOverride = flashActive
          ? METEOR_ORB_FLASH_COLOR
          : isCollected
            ? null
            : METEOR_ORB_WHITE_COLOR;

        meteorOrbCtx.save();
        meteorOrbCtx.translate(orbX + METEOR_ORB_PADDING, orbY + METEOR_ORB_PADDING);
        const outerScale = compactScale * (isCollected ? 1.15 : 1);
        const centerScale = 0.92;
        const innerCompactScale = Math.min(compactScale, METEOR_ORB_COMPACT_SCALE);
        const innerScale = innerCompactScale * 0.9 * centerScale;
        const midScale = innerCompactScale * 0.75 * centerScale;
        const coreScale = innerCompactScale * 0.6 * centerScale;
        renderDots(meteorOrbFarDots, compactScale * (isCollected ? 1.4 : 1.25), colorOverride, whiteActive, 0.6);
        renderDots(meteorOrbOuterDots, outerScale, colorOverride, whiteActive, 0.25);
        renderDots(meteorOrbInnerDots, innerScale, colorOverride, whiteActive, 0.1);
        renderDots(meteorOrbMidDots, midScale, colorOverride, whiteActive, 0.22);
        renderDots(meteorOrbCoreDots, coreScale, colorOverride, whiteActive);
        meteorOrbCtx.restore();

        meteorOrbAccentCtx.save();
        meteorOrbAccentCtx.translate(orbX + METEOR_ORB_PADDING, orbY + METEOR_ORB_PADDING);
        renderAccentDots(meteorOrbFarDots, compactScale * (isCollected ? 1.4 : 1.25), colorOverride, 0.6);
        renderAccentDots(meteorOrbOuterDots, outerScale, colorOverride, 0.25);
        renderAccentDots(meteorOrbInnerDots, innerScale, colorOverride, 0.2);
        renderAccentDots(meteorOrbCoreDots, coreScale, colorOverride);
        meteorOrbAccentCtx.restore();
      };

      if (meteorOrbState.active || meteorOrbState.collected) {
        renderOrb(
          meteorOrbState.x,
          meteorOrbState.y,
          meteorOrbState.compactScale,
          meteorOrbState.collected,
          meteorOrbState.flashUntil
        );
      }

      if (extraOrbState.enabled && extraOrbState.initialized) {
        renderOrb(extraOrbState.x, extraOrbState.y, extraOrbState.compactScale, true, 0);
      }
    }

    meteorOrbTexture.source.update();
    meteorOrbAccentTexture.source.update();
  };

  const resize = (width: number, height: number) => {
    meteorOrbCanvas.width = width + METEOR_ORB_PADDING * 2;
    meteorOrbCanvas.height = height + METEOR_ORB_PADDING * 2;
    meteorOrbTexture.source.update();
    meteorOrbSprite.position.set(-METEOR_ORB_PADDING, -METEOR_ORB_PADDING);
    meteorOrbAccentCanvas.width = width + METEOR_ORB_PADDING * 2;
    meteorOrbAccentCanvas.height = height + METEOR_ORB_PADDING * 2;
    meteorOrbAccentTexture.source.update();
    meteorOrbAccentSprite.position.set(-METEOR_ORB_PADDING, -METEOR_ORB_PADDING);
  };

  const onRespawn = (playerX: number, respawnY: number, playerRadius: number) => {
    if (!meteorOrbState.collected) {
      return;
    }
    meteorOrbState.x = playerX - playerRadius * 2.2;
    meteorOrbState.y = respawnY - playerRadius * 0.9 + 5;
    meteorOrbState.velocityY = 0;
    meteorOrbState.surfaceOverrideY = null;
    meteorOrbState.platformId = null;
  };

  const resetIfNotCollected = () => {
    if (meteorOrbState.collected) {
      return;
    }
    meteorOrbState.active = false;
    meteorOrbState.anchorLeftId = null;
    meteorOrbState.anchorRightId = null;
    meteorOrbState.velocityY = 0;
    meteorOrbState.bounceCount = 0;
    meteorOrbState.surfaceOverrideY = null;
    meteorOrbState.platformId = null;
    meteorOrbState.compactScale = 1;
    meteorOrbState.compactTarget = 1;
    meteorOrbState.anchorSurfaceY = null;
  };

  const resetAll = () => {
    meteorOrbState.active = false;
    meteorOrbState.collected = false;
    meteorOrbState.anchorLeftId = null;
    meteorOrbState.anchorRightId = null;
    meteorOrbState.x = 0;
    meteorOrbState.y = 0;
    meteorOrbState.velocityY = 0;
    meteorOrbState.bounceCount = 0;
    meteorOrbState.surfaceOverrideY = null;
    meteorOrbState.platformId = null;
    meteorOrbState.compactScale = 1;
    meteorOrbState.compactTarget = 1;
    meteorOrbState.flashUntil = 0;
    meteorOrbState.anchorSurfaceY = null;
  };

  const setExtraEnabled = (enabled: boolean) => {
    extraOrbState.enabled = enabled;
    extraOrbState.initialized = false;
  };

  const toggleExtra = () => {
    extraOrbState.enabled = !extraOrbState.enabled;
    extraOrbState.initialized = false;
    return extraOrbState.enabled;
  };

  const setExtraCompactTarget = (target: number) => {
    extraOrbState.compactTarget = target;
  };

  const getExtraState = () => ({
    enabled: extraOrbState.enabled,
    compactTarget: extraOrbState.compactTarget,
  });

  const isCollected = () => meteorOrbState.collected;

  return {
    update,
    resize,
    onRespawn,
    resetIfNotCollected,
    resetAll,
    setExtraEnabled,
    toggleExtra,
    setExtraCompactTarget,
    getExtraState,
    isCollected,
  };
};

export const useMeteorOrb = createMeteorOrb;
