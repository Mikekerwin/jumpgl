/**
 * ForestDustField
 * GPU-accelerated background dust/starlight layer rendered via WebGL.
 * Drawn between the parallax backgrounds and the ground to simulate airborne particles.
 */

import type { ForestDustBucket } from './config';
import {
  FOREST_DUST_PARTICLE_COUNT,
  FOREST_DUST_PARTICLE_COUNT_MOBILE,
  FOREST_DUST_SCROLL_SPEED,
  FOREST_DUST_FADE_IN_DURATION,
  FOREST_DUST_FADE_OUT_DURATION,
  FOREST_DUST_COLOR,
  FOREST_DUST_BUCKETS,
  FOREST_DUST_SMALL_CLUSTER_COUNT,
  FOREST_DUST_SMALL_CLUSTER_RADIUS,
  FOREST_DUST_MOBILE_SWIRL_SCALE,
} from './config';

const VERTEX_SHADER = `
  precision mediump float;

  attribute vec2 a_position;
  attribute float a_depth;
  attribute float a_size;
  attribute float a_twinkle;
  attribute float a_blur;
  attribute float a_fade;
  attribute float a_swirl;

  uniform vec2 u_resolution;
  uniform float u_scroll;
  uniform float u_time;
  uniform float u_swirlScale;

  varying float v_depth;
  varying float v_twinkle;
  varying float v_height;
  varying float v_blur;
  varying float v_fade;
  varying float v_swirl;

  void main() {
    // Base horizontal scroll with parallax based on depth
    float parallax = mix(1.2, 0.35, a_depth);
    float scroll = u_scroll * parallax;

    // Add curved path animation - each particle floats on a sine wave
    // Use twinkle as a unique phase offset for each particle
    float curveFrequency = 0.0008 + a_twinkle * 0.0004; // Different speeds for each particle
    float curveAmplitude = mix(20.0, 50.0, a_blur); // Larger particles have more pronounced curves

    // Vertical sine wave animation based on horizontal position
    float curvePhase = (a_position.x + scroll) * curveFrequency + a_twinkle * 6.28;
    float verticalOffset = sin(curvePhase) * curveAmplitude;

    // Horizontal wiggle (perpendicular to main scroll direction)
    float wigglePhase = u_time * (0.3 + a_twinkle * 0.5) + a_twinkle * 3.14;
    float horizontalWiggle = sin(wigglePhase) * mix(6.0, 20.0, a_blur);

    // Small swirling motion for dust motes
    float swirlRadius = mix(4.0, 28.0, a_swirl) * u_swirlScale;
    float swirlPhase = u_time * (0.8 + a_twinkle * 1.2) + a_position.y * 0.005;
    float swirlX = cos(swirlPhase) * swirlRadius;
    float swirlY = sin(swirlPhase * 1.3 + a_position.x * 0.002) * swirlRadius * 0.8;

    float margin = u_resolution.x * 0.25;
    float totalWidth = u_resolution.x + margin * 2.0;
    float baseX = mod(a_position.x + scroll + horizontalWiggle + margin, totalWidth);
    float x = baseX - margin + swirlX;
    float y = a_position.y + verticalOffset + swirlY;

    vec2 position = vec2(x, y);
    vec2 zeroToOne = position / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    clipSpace.y = -clipSpace.y;

    gl_Position = vec4(clipSpace, 0.0, 1.0);

    // Size scaling - larger particles in front (higher depth)
    float sizeScale = 0.8 + a_depth * 0.4;
    gl_PointSize = a_size * sizeScale;

    v_depth = a_depth;
    v_twinkle = a_twinkle;
    v_height = zeroToOne.y;
    v_blur = a_blur;
    v_fade = a_fade;
    v_swirl = a_swirl;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying float v_depth;
  varying float v_twinkle;
  varying float v_height;
  varying float v_blur;
  varying float v_fade;
  varying float v_swirl;

  uniform float u_time;
  uniform vec3 u_color;
  uniform float u_opacity;

  void main() {
    // Calculate distance from center of point
    vec2 coord = gl_PointCoord - 0.5;
    float dist = length(coord) * 2.0; // Normalize to 0-1 range

    // Discard pixels outside the circle early to prevent square artifacts
    if (dist > 1.0) {
      discard;
    }

    // Create smooth bokeh circle effect
    // For sharp particles (small dust): hard edge
    // For blurred particles (large dust): soft, gaussian-like falloff
    float falloff;
    if (v_blur < 0.3) {
      falloff = 1.0 - smoothstep(0.65, 1.0, dist);
    } else {
      falloff = exp(-dist * dist * mix(1.8, 0.45, v_blur));
    }

    float twinkle = 0.9 + 0.1 * sin(u_time * (0.8 + v_twinkle * 1.3) + v_twinkle * 8.0);
    float heightFade = smoothstep(0.95, 0.25, v_height);
    float blurOpacity = mix(1.0, 0.45, v_blur); // Large bokeh = softer opacity
    float swirlOpacity = mix(0.85, 1.05, v_swirl);
    float alpha = falloff * heightFade * u_opacity * twinkle * v_fade * blurOpacity * swirlOpacity;

    if (alpha <= 0.01) {
      discard;
    }

    // Pure white color for bokeh effect - brighter for larger/closer particles
    float brightness = mix(0.7, 1.0, v_depth);
    vec3 color = vec3(brightness);
    gl_FragColor = vec4(color, alpha);
  }
`;

type GLContext = WebGLRenderingContext | null;

export class ForestDustField {
  private canvas: HTMLCanvasElement | null = null;
  private gl: GLContext = null;
  private program: WebGLProgram | null = null;
  private isInitializingGL: boolean = false;
  private positionBuffer: WebGLBuffer | null = null;
  private depthBuffer: WebGLBuffer | null = null;
  private sizeBuffer: WebGLBuffer | null = null;
  private twinkleBuffer: WebGLBuffer | null = null;
  private blurBuffer: WebGLBuffer | null = null;
  private fadeBuffer: WebGLBuffer | null = null;
  private swirlBuffer: WebGLBuffer | null = null;

  private attribLocations: {
    position?: number;
    depth?: number;
    size?: number;
    twinkle?: number;
    blur?: number;
    fade?: number;
    swirl?: number;
  } = {};

  private uniformLocations: {
    resolution?: WebGLUniformLocation | null;
    scroll?: WebGLUniformLocation | null;
    time?: WebGLUniformLocation | null;
    color?: WebGLUniformLocation | null;
    opacity?: WebGLUniformLocation | null;
    swirlScale?: WebGLUniformLocation | null;
  } = {};

  private particlePositions!: Float32Array;
  private particleDepths!: Float32Array;
  private particleSizes!: Float32Array;
  private particleTwinkle!: Float32Array;
  private particleBlur!: Float32Array;
  private particleFade!: Float32Array;
  private particleSwirl!: Float32Array;

  private width: number;
  private height: number;

  private scrollOffset = 0;
  private startTime = typeof performance !== 'undefined' ? performance.now() : 0;
  private lastUpdateTime = this.startTime;

  private opacity = 0; // Global opacity multiplier (0 until reveal)
  private fadeFrom = 0;
  private fadeTo = 1;
  private fadeDuration = FOREST_DUST_FADE_IN_DURATION;
  private fadeStart = 0;
  private isFading = false;
  private revealTriggered = true; // TEMP: Always true to test rendering

  // Per-particle fade tracking
  private particleFadeDelays!: Float32Array; // Delay before fade starts
  private particleFadeDurations!: Float32Array; // Duration of fade
  private fadeInStartTime = 0; // When the fade-in sequence started

  private supported = typeof document !== 'undefined';
  private smallClusterCenters: Array<{ x: number; y: number }> = [];
  private spawnMarginX: number = 0;
  private spawnMarginY: number = 0;
  private readonly isMobileDevice: boolean;
  private readonly swirlScale: number;
  private readonly particleCount: number;
  private readonly scrollSpeed: number;
  private manualRevealProgress: number | null = null;
  private hasManualRevealCompleted: boolean = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.isMobileDevice =
      typeof navigator !== 'undefined'
        ? /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
        : false;
    this.particleCount = this.isMobileDevice ? FOREST_DUST_PARTICLE_COUNT_MOBILE : FOREST_DUST_PARTICLE_COUNT;
    this.swirlScale = this.isMobileDevice ? FOREST_DUST_MOBILE_SWIRL_SCALE : 1;
    this.scrollSpeed = this.isMobileDevice ? FOREST_DUST_SCROLL_SPEED * 0.75 : FOREST_DUST_SCROLL_SPEED;

    this.initializeParticleArrays();
    this.updateSpawnMargins();

    if (this.supported) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.fadeInStartTime = typeof performance !== 'undefined' ? performance.now() : 0; // TEMP: Start fade immediately
      this.generateClusterCenters();
      this.initializeGL();
    }
  }

  /**
   * Initialize WebGL context, shaders, buffers, and particle data.
   */
  private initializeGL(): void {
    if (!this.canvas || !this.supported) {
      console.warn('[ForestDust] initializeGL aborted: missing canvas or unsupported environment.');
      return;
    }

    this.isInitializingGL = true;
    try {
      console.log('[ForestDust] initializeGL starting...');
      const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, desynchronized: true });
      if (!gl) {
        console.error('[ForestDustField] WebGL unsupported - falling back to no-op.');
        this.supported = false;
        return;
      }
      console.log('[ForestDust] WebGL context created successfully');

      this.gl = gl;
      this.program = this.createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      if (!this.program) {
        console.error('[ForestDustField] Failed to compile shaders - check shader code!');
        return;
      }
      console.log('[ForestDust] Shaders compiled successfully');

      gl.useProgram(this.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      this.attribLocations.position = gl.getAttribLocation(this.program, 'a_position');
      this.attribLocations.depth = gl.getAttribLocation(this.program, 'a_depth');
      this.attribLocations.size = gl.getAttribLocation(this.program, 'a_size');
      this.attribLocations.twinkle = gl.getAttribLocation(this.program, 'a_twinkle');
      this.attribLocations.blur = gl.getAttribLocation(this.program, 'a_blur');
      this.attribLocations.fade = gl.getAttribLocation(this.program, 'a_fade');
      this.attribLocations.swirl = gl.getAttribLocation(this.program, 'a_swirl');

      this.uniformLocations.resolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uniformLocations.scroll = gl.getUniformLocation(this.program, 'u_scroll');
    this.uniformLocations.time = gl.getUniformLocation(this.program, 'u_time');
    this.uniformLocations.color = gl.getUniformLocation(this.program, 'u_color');
    this.uniformLocations.opacity = gl.getUniformLocation(this.program, 'u_opacity');
    this.uniformLocations.swirlScale = gl.getUniformLocation(this.program, 'u_swirlScale');

      this.positionBuffer = gl.createBuffer();
      this.depthBuffer = gl.createBuffer();
      this.sizeBuffer = gl.createBuffer();
      this.twinkleBuffer = gl.createBuffer();
      this.blurBuffer = gl.createBuffer();
      this.fadeBuffer = gl.createBuffer();
      this.swirlBuffer = gl.createBuffer();

      this.generateClusterCenters();
      this.seedParticles();
      this.uploadParticleData(true);
      console.log('[ForestDust] WebGL initialization complete');
    } finally {
      this.isInitializingGL = false;
    }
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[ForestDustField] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(gl: WebGLRenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram | null {
    const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[ForestDustField] Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
  }

  private disposeGLResources(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.depthBuffer) gl.deleteBuffer(this.depthBuffer);
    if (this.sizeBuffer) gl.deleteBuffer(this.sizeBuffer);
    if (this.twinkleBuffer) gl.deleteBuffer(this.twinkleBuffer);
    if (this.blurBuffer) gl.deleteBuffer(this.blurBuffer);
    if (this.fadeBuffer) gl.deleteBuffer(this.fadeBuffer);
    if (this.swirlBuffer) gl.deleteBuffer(this.swirlBuffer);
    if (this.program) gl.deleteProgram(this.program);

    this.positionBuffer = null;
    this.depthBuffer = null;
    this.sizeBuffer = null;
    this.twinkleBuffer = null;
    this.blurBuffer = null;
    this.fadeBuffer = null;
    this.swirlBuffer = null;
    this.program = null;
    this.gl = null;
    this.attribLocations = {};
    this.uniformLocations = {};
  }

  private ensureGLResources(): boolean {
    if (!this.supported || !this.canvas) {
      return false;
    }

    const contextLost = this.gl && typeof (this.gl as any).isContextLost === 'function'
      ? (this.gl as any).isContextLost()
      : false;

    if (this.gl && this.program && !contextLost) {
      return true;
    }

    if (this.isInitializingGL) {
      return false;
    }

    console.warn('[ForestDust] WebGL context missing or lost. Reinitializing...');
    this.disposeGLResources();
    this.initializeGL();
    return !!this.gl && !!this.program;
  }

  private updateSpawnMargins(): void {
    this.spawnMarginX = Math.max(80, this.width * 0.25);
    this.spawnMarginY = Math.max(60, this.height * 0.2);
  }

  private initializeParticleArrays(): void {
    this.particlePositions = new Float32Array(this.particleCount * 2);
    this.particleDepths = new Float32Array(this.particleCount);
    this.particleSizes = new Float32Array(this.particleCount);
    this.particleTwinkle = new Float32Array(this.particleCount);
    this.particleBlur = new Float32Array(this.particleCount);
    this.particleFade = new Float32Array(this.particleCount);
    this.particleSwirl = new Float32Array(this.particleCount);
    this.particleFadeDelays = new Float32Array(this.particleCount);
    this.particleFadeDurations = new Float32Array(this.particleCount);
  }

  private generateClusterCenters(): void {
    if (!FOREST_DUST_SMALL_CLUSTER_COUNT) {
      this.smallClusterCenters = [];
      return;
    }
    const xRange = this.width + this.spawnMarginX * 2;
    const yRange = this.height + this.spawnMarginY * 2;

    this.smallClusterCenters = Array.from({ length: FOREST_DUST_SMALL_CLUSTER_COUNT }, () => ({
      x: Math.random() * xRange - this.spawnMarginX,
      y: Math.random() * yRange - this.spawnMarginY,
    }));
  }

  private pickBucket(): ForestDustBucket {
    const target = Math.random();
    let cumulative = 0;
    for (const bucket of FOREST_DUST_BUCKETS) {
      cumulative += bucket.ratio;
      if (target <= cumulative) {
        return bucket;
      }
    }
    return FOREST_DUST_BUCKETS[FOREST_DUST_BUCKETS.length - 1];
  }

  private sampleClusterPosition(bucket: ForestDustBucket): { x: number; y: number } {
    if (!this.smallClusterCenters.length) {
      return this.randomSpawnPosition(bucket);
    }

    const center = this.smallClusterCenters[Math.floor(Math.random() * this.smallClusterCenters.length)];
    const angle = Math.random() * Math.PI * 2;
    const clusterScale = Math.max(this.width, this.height) / 900;
    const radius = Math.random() * FOREST_DUST_SMALL_CLUSTER_RADIUS * clusterScale;
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius * 0.65;

    const mappedCenterY = this.mapCenterToBucket(center.y, bucket);
    const mappedCenterX = this.wrapHorizontal(center.x);

    const rawY = mappedCenterY + offsetY;
    return this.clampToBucketHeight({ x: mappedCenterX + offsetX, y: rawY }, bucket);
  }

  private randomSpawnPosition(bucket?: ForestDustBucket): { x: number; y: number } {
    const x = this.wrapHorizontal(Math.random() * (this.width + this.spawnMarginX * 2) - this.spawnMarginX);

    if (!bucket) {
      return {
        x,
        y: Math.random() * (this.height + this.spawnMarginY * 2) - this.spawnMarginY,
      };
    }

    const position = {
      x,
      y: this.randomHeightWithinBucket(bucket),
    };
    return position;
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomHeightWithinBucket(bucket: ForestDustBucket): number {
    const minFraction = Math.min(bucket.minHeightPercent, bucket.maxHeightPercent);
    const maxFraction = Math.max(bucket.minHeightPercent, bucket.maxHeightPercent);
    const t = Math.random();
    const fraction = minFraction + t * (maxFraction - minFraction);
    return this.fractionToY(fraction) + this.randomRange(-12, 12);
  }

  private clampToBucketHeight(position: { x: number; y: number }, bucket: ForestDustBucket): { x: number; y: number } {
    const minFraction = Math.min(bucket.minHeightPercent, bucket.maxHeightPercent);
    const maxFraction = Math.max(bucket.minHeightPercent, bucket.maxHeightPercent);
    const topY = this.fractionToY(maxFraction);
    const bottomY = this.fractionToY(minFraction);

    return {
      x: position.x,
      y: Math.min(Math.max(position.y, topY - 12), bottomY + 12),
    };
  }

  private fractionToY(fraction: number): number {
    return this.height - fraction * this.height;
  }

  private wrapHorizontal(x: number): number {
    const totalWidth = this.width + this.spawnMarginX * 2;
    const wrapped = ((x + this.spawnMarginX) % totalWidth + totalWidth) % totalWidth;
    return wrapped - this.spawnMarginX;
  }

  private mapCenterToBucket(centerY: number, bucket: ForestDustBucket): number {
    const minFraction = Math.min(bucket.minHeightPercent, bucket.maxHeightPercent);
    const maxFraction = Math.max(bucket.minHeightPercent, bucket.maxHeightPercent);
    const normalized = (centerY + this.spawnMarginY) / (this.height + this.spawnMarginY * 2);
    const fraction = minFraction + normalized * (maxFraction - minFraction);
    return this.fractionToY(fraction);
  }

  private seedParticles(): void {
    let largeCount = 0;
    let mediumCount = 0;
    let smallCount = 0;

    for (let i = 0; i < this.particleCount; i++) {
      const bucket = this.pickBucket();
      const idx = i * 2;
      const position = bucket.clustered ? this.sampleClusterPosition(bucket) : this.randomSpawnPosition(bucket);

      this.particlePositions[idx] = position.x;
      this.particlePositions[idx + 1] = position.y;
      this.particleDepths[i] = this.randomRange(bucket.minDepth, bucket.maxDepth);

      // Convert percentage-based size to actual pixels based on screen height
      const minSizePx = bucket.minSizePercent * this.height;
      const maxSizePx = bucket.maxSizePercent * this.height;
      this.particleSizes[i] = this.randomRange(minSizePx, maxSizePx);

      this.particleTwinkle[i] = Math.random();
      this.particleBlur[i] = bucket.blur;

      if (bucket.blur <= 0.2) {
        this.particleSwirl[i] = this.randomRange(0.65, 1);
      } else if (bucket.blur <= 0.7) {
        this.particleSwirl[i] = this.randomRange(0.25, 0.55);
      } else {
        this.particleSwirl[i] = 0;
      }

      // Initialize per-particle fade timing (staggered)
      // Spread fade-in start over 1.5 seconds, with random ordering
      this.particleFadeDelays[i] = Math.random() * 1500; // Random delay 0-1500ms
      this.particleFadeDurations[i] = this.randomRange(400, 800); // Each particle fades in over 400-800ms
      this.particleFade[i] = 0;

      // Count particles by size
      if (bucket.blur > 0.8) largeCount++;
      else if (bucket.blur > 0.4) mediumCount++;
      else smallCount++;
    }

    console.log(`[ForestDust] Seeded ${this.particleCount} particles: ${smallCount} small, ${mediumCount} medium, ${largeCount} large (screen: ${this.width}x${this.height})`);
  }

  private uploadParticleData(skipEnsure: boolean = false): void {
    console.log('[ForestDust] uploadParticleData called - gl:', !!this.gl, 'program:', !!this.program);
    if (!skipEnsure && !this.ensureGLResources()) {
      console.error('[ForestDust] Cannot upload - WebGL resources not ready.');
      return;
    }
    if (!this.gl || !this.program) {
      console.error('[ForestDust] Cannot upload - missing GL or program even after reinit!');
      return;
    }
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particlePositions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.depthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleDepths, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleSizes, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.twinkleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleTwinkle, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.blurBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleBlur, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fadeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleFade, gl.DYNAMIC_DRAW); // DYNAMIC since we'll update this each frame

    // Debug: Log first few fade values to verify they're set
    console.log('[ForestDust] Initial fade values:', this.particleFade.slice(0, 5));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.swirlBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleSwirl, gl.STATIC_DRAW);
  }

  private uploadFadeBufferData(): void {
    if (!this.gl || !this.fadeBuffer) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fadeBuffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.particleFade);
  }

  /**
   * Resize backing canvas and update resolution-dependent uniforms.
   */
  updateDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.updateSpawnMargins();
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    // Re-seed particles to fill new dimensions to avoid stretching artifacts
    this.generateClusterCenters();
    this.seedParticles();
    this.uploadParticleData();
  }

  /**
   * Trigger the fade-in that coincides with the forest transition.
   */
  triggerReveal(): void {
    if (this.revealTriggered) return; // Already revealing
    this.revealTriggered = true;
    this.fadeInStartTime = typeof performance !== 'undefined' ? performance.now() : 0;
    this.manualRevealProgress = null;
    this.hasManualRevealCompleted = false;
    console.log('[ForestDust] Starting per-particle fade-in');
  }

  /**
   * Fade out the dust field (used when resetting to earlier levels).
   */
  triggerHide(): void {
    this.startFade(0, FOREST_DUST_FADE_OUT_DURATION);
    this.revealTriggered = false;
    this.manualRevealProgress = null;
    this.hasManualRevealCompleted = false;
    this.setAllParticleFades(0);
  }

  private startFade(targetOpacity: number, duration: number): void {
    this.fadeFrom = this.opacity;
    this.fadeTo = targetOpacity;
    this.fadeDuration = Math.max(1, duration);
    this.fadeStart = typeof performance !== 'undefined' ? performance.now() : 0;
    this.isFading = true;
  }

  setRevealProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));

    if (clamped <= 0) {
      this.manualRevealProgress = 0;
      this.revealTriggered = false;
      this.hasManualRevealCompleted = false;
      this.opacity = 0;
      this.setAllParticleFades(0);
      return;
    }

    this.manualRevealProgress = clamped;
    this.revealTriggered = true;

    if (clamped >= 1) {
      this.manualRevealProgress = null;
      this.hasManualRevealCompleted = true;
      this.isFading = false;
      this.opacity = 1;
      this.setAllParticleFades(1);
    } else {
      this.hasManualRevealCompleted = false;
      this.startFade(clamped, 200);
    }
  }

  private setAllParticleFades(value: number): void {
    this.particleFade.fill(value);
    this.uploadFadeBufferData();
    if (value >= 1) {
      this.opacity = 1;
    } else if (value <= 0) {
      this.opacity = 0;
    }
  }

  isReady(): boolean {
    return !!this.gl && !!this.program;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  getOpacity(): number {
    return this.opacity;
  }

  /**
    * Reset scroll and opacity (used on hard reset / restart).
    */
  reset(): void {
    this.scrollOffset = 0;
    this.opacity = 0;
    this.isFading = false;
    this.revealTriggered = false;
    this.fadeInStartTime = 0;
    this.manualRevealProgress = 0;
    this.hasManualRevealCompleted = false;

    // Reset all particle fades to 0
    for (let i = 0; i < this.particleCount; i++) {
      this.particleFade[i] = 0;
    }
    this.uploadFadeBufferData();
  }

  /**
   * Update internal timers and scrolling offsets.
   */
  update(): void {
    if (!this.supported) return;
    if (!this.ensureGLResources() || !this.gl) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const delta = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Accumulate scroll infinitely - the shader handles wrapping with mod()
    // No need to wrap here, prevents visible snapping
    this.scrollOffset -= this.scrollSpeed * delta;

    // Update per-particle fade values if reveal has been triggered
    if (this.revealTriggered && !this.hasManualRevealCompleted) {
      let needsUpdate = false;
      let elapsed = now - this.fadeInStartTime;
      if (this.manualRevealProgress !== null) {
        elapsed = this.manualRevealProgress * FOREST_DUST_FADE_IN_DURATION;
      }

      for (let i = 0; i < this.particleCount; i++) {
        const currentFade = this.particleFade[i];

        // If particle hasn't fully faded in yet
        if (currentFade < 1.0) {
          const particleStart = this.particleFadeDelays[i];
          const particleDuration = this.particleFadeDurations[i];

          if (elapsed >= particleStart) {
            const particleElapsed = elapsed - particleStart;
            const progress = Math.min(1.0, particleElapsed / particleDuration);
            this.particleFade[i] = progress;
            needsUpdate = true;
          }
        }
      }

      // Upload updated fade values to GPU
      if (needsUpdate) {
        this.uploadFadeBufferData();
      }
    }

    if (this.isFading) {
      const progress = this.fadeDuration <= 0 ? 1 : Math.min(1, (now - this.fadeStart) / this.fadeDuration);
      this.opacity = this.fadeFrom + (this.fadeTo - this.fadeFrom) * progress;
      if (progress >= 1) {
        this.isFading = false;
        this.opacity = this.fadeTo;
      }
    }
  }

  /**
   * Render the dust field to the provided 2D context (composited between background and ground).
   */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.opacity <= 0.001) return;
    if (!this.ensureGLResources() || !this.canvas) return;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.updateDimensions(width, height);
    }

    this.draw();
    ctx.drawImage(this.canvas, 0, 0, width, height);
  }

  private drawCallCount = 0;

  private draw(): void {
    if (!this.gl || !this.program || !this.canvas) return;
    const gl = this.gl;

    // Log first few draw calls to verify rendering
    if (this.drawCallCount < 3) {
      console.log(`[ForestDust] Drawing ${this.particleCount} particles (call #${this.drawCallCount + 1})`);
      this.drawCallCount++;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // Bind attribute buffers
    this.bindAttribute(this.positionBuffer, this.attribLocations.position, 2);
    this.bindAttribute(this.depthBuffer, this.attribLocations.depth, 1);
    this.bindAttribute(this.sizeBuffer, this.attribLocations.size, 1);
    this.bindAttribute(this.twinkleBuffer, this.attribLocations.twinkle, 1);
    this.bindAttribute(this.blurBuffer, this.attribLocations.blur, 1);
    this.bindAttribute(this.fadeBuffer, this.attribLocations.fade, 1);
    this.bindAttribute(this.swirlBuffer, this.attribLocations.swirl, 1);

    // Uniforms
    const resolutionLoc = this.uniformLocations.resolution;
    if (resolutionLoc) {
      gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
    }

    const scrollLoc = this.uniformLocations.scroll;
    if (scrollLoc) {
      gl.uniform1f(scrollLoc, this.scrollOffset);
    }

    const elapsedSeconds = ((typeof performance !== 'undefined' ? performance.now() : 0) - this.startTime) / 1000;
    const timeLoc = this.uniformLocations.time;
    if (timeLoc) {
      gl.uniform1f(timeLoc, elapsedSeconds);
    }

    const colorLoc = this.uniformLocations.color;
    if (colorLoc) {
      gl.uniform3f(colorLoc, FOREST_DUST_COLOR.r, FOREST_DUST_COLOR.g, FOREST_DUST_COLOR.b);
    }

    const opacityLoc = this.uniformLocations.opacity;
    if (opacityLoc) {
      gl.uniform1f(opacityLoc, this.opacity);
    }

    const swirlScaleLoc = this.uniformLocations.swirlScale;
    if (swirlScaleLoc) {
      gl.uniform1f(swirlScaleLoc, this.swirlScale);
    }

    gl.drawArrays(gl.POINTS, 0, this.particleCount);
  }

  private bindAttribute(buffer: WebGLBuffer | null, location: number | undefined, size: number): void {
    if (!this.gl || buffer === null || location === undefined || location < 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
}
