/**
 * EmberParticles - GPU-accelerated ember particle system for ground holes
 * Embers rise from the bottom of holes with circular motion and fade away
 * Rendered in front of ground hole textures
 */

import type { GroundHoleInstance } from './groundHoleManager';

const VERTEX_SHADER = `
  precision mediump float;

  attribute vec2 a_position;
  attribute float a_size;
  attribute float a_phase;
  attribute float a_speed;
  attribute float a_lifetime;
  attribute float a_age;
  attribute float a_riseHeight;
  attribute float a_horizontalRange;

  uniform vec2 u_resolution;
  uniform float u_time;

  varying float v_age;
  varying float v_lifetime;
  varying float v_brightness;

  void main() {
    // Calculate particle age progress (0 to 1)
    float progress = a_age / a_lifetime;

    // Use per-particle rise height for variability (70% rise 300px, 30% rise 150px)
    float verticalOffset = progress * a_riseHeight;

    // Circular motion using sin/cos (like CSS animations)
    // Each ember follows a circular/spiral path as it rises
    // Use per-particle horizontal range for extreme variability
    float circleRadius = a_horizontalRange; // Variable horizontal range (15-100px)
    float circleSpeed = a_speed * 0.8; // Speed of circular motion
    float angle = u_time * circleSpeed + a_phase * 6.28; // Current angle in circle

    // Calculate circular path position
    float swirlX = cos(angle) * circleRadius;
    float swirlY = sin(angle) * circleRadius;

    // Use world position directly (no camera offset needed - container doesn't move)
    float x = a_position.x + swirlX;
    float y = a_position.y - verticalOffset + swirlY;

    vec2 position = vec2(x, y);
    vec2 zeroToOne = position / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    clipSpace.y = -clipSpace.y;

    gl_Position = vec4(clipSpace, 0.0, 1.0);

    // Keep size constant (no growth)
    gl_PointSize = a_size;

    // Brightness varies with phase for subtle variation
    v_brightness = 0.85 + a_phase * 0.15;
    v_age = a_age;
    v_lifetime = a_lifetime;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying float v_age;
  varying float v_lifetime;
  varying float v_brightness;

  uniform float u_time;

  void main() {
    // Calculate progress (0 to 1)
    float progress = v_age / v_lifetime;

    // Calculate distance from center of point
    vec2 coord = gl_PointCoord - 0.5;
    float dist = length(coord) * 2.0; // Normalize to 0-1 range

    // Discard pixels outside the circle (hard edge, no glow)
    if (dist > 1.0) {
      discard;
    }

    // Fade in quickly at start, fade out at end
    float fadeIn = smoothstep(0.0, 0.1, progress);
    float fadeOut = 1.0 - smoothstep(0.7, 1.0, progress); // Start fading at 70% lifetime
    float fade = fadeIn * fadeOut;

    // Subtle flicker
    float flicker = 0.9 + 0.1 * sin(u_time * 8.0 + v_age * 20.0);

    // Solid orange ember color (no glow gradient)
    vec3 emberColor = vec3(1.0, 0.35, 0.0); // Pure orange

    float alpha = fade * flicker * v_brightness;

    if (alpha <= 0.01) {
      discard;
    }

    gl_FragColor = vec4(emberColor, alpha);
  }
`;

interface EmberParticle {
  x: number; // World X position
  y: number; // World Y position
  size: number;
  phase: number; // Random phase offset for swirl
  speed: number; // Speed of circular motion
  lifetime: number; // How long ember lives (ms)
  age: number; // Current age (ms)
  holeIndex: number; // Which hole spawned this ember
  riseHeight: number; // How high this ember rises (variability)
  horizontalRange: number; // How far left-right this ember moves (variability)
}

type GLContext = WebGLRenderingContext | null;

export class EmberParticles {
  private canvas: HTMLCanvasElement | null = null;
  private gl: GLContext = null;
  private program: WebGLProgram | null = null;

  private positionBuffer: WebGLBuffer | null = null;
  private sizeBuffer: WebGLBuffer | null = null;
  private phaseBuffer: WebGLBuffer | null = null;
  private speedBuffer: WebGLBuffer | null = null;
  private lifetimeBuffer: WebGLBuffer | null = null;
  private ageBuffer: WebGLBuffer | null = null;
  private riseHeightBuffer: WebGLBuffer | null = null;
  private horizontalRangeBuffer: WebGLBuffer | null = null;

  private attribLocations: {
    position?: number;
    size?: number;
    phase?: number;
    speed?: number;
    lifetime?: number;
    age?: number;
    riseHeight?: number;
    horizontalRange?: number;
  } = {};

  private uniformLocations: {
    resolution?: WebGLUniformLocation | null;
    time?: WebGLUniformLocation | null;
  } = {};

  private particles: EmberParticle[] = [];
  private maxParticles = 150; // Max concurrent embers
  private spawnRate = 3; // Embers per hole per second
  private lastSpawnTime = 0;

  private width: number;
  private height: number;
  private startTime: number;
  private supported = typeof document !== 'undefined';

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.startTime = typeof performance !== 'undefined' ? performance.now() : 0;

    if (this.supported) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.initializeGL();
    }
  }

  private initializeGL(): void {
    if (!this.canvas || !this.supported) return;

    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });

    if (!gl) {
      console.error('[EmberParticles] WebGL unsupported');
      this.supported = false;
      return;
    }

    this.gl = gl;
    this.program = this.createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

    if (!this.program) {
      console.error('[EmberParticles] Failed to compile shaders');
      return;
    }

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Additive blending for glow

    // Get attribute locations
    this.attribLocations.position = gl.getAttribLocation(this.program, 'a_position');
    this.attribLocations.size = gl.getAttribLocation(this.program, 'a_size');
    this.attribLocations.phase = gl.getAttribLocation(this.program, 'a_phase');
    this.attribLocations.speed = gl.getAttribLocation(this.program, 'a_speed');
    this.attribLocations.lifetime = gl.getAttribLocation(this.program, 'a_lifetime');
    this.attribLocations.age = gl.getAttribLocation(this.program, 'a_age');
    this.attribLocations.riseHeight = gl.getAttribLocation(this.program, 'a_riseHeight');
    this.attribLocations.horizontalRange = gl.getAttribLocation(this.program, 'a_horizontalRange');

    // Get uniform locations
    this.uniformLocations.resolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uniformLocations.time = gl.getUniformLocation(this.program, 'u_time');

    // Create buffers
    this.positionBuffer = gl.createBuffer();
    this.sizeBuffer = gl.createBuffer();
    this.phaseBuffer = gl.createBuffer();
    this.speedBuffer = gl.createBuffer();
    this.lifetimeBuffer = gl.createBuffer();
    this.ageBuffer = gl.createBuffer();
    this.riseHeightBuffer = gl.createBuffer();
    this.horizontalRangeBuffer = gl.createBuffer();

    console.log('[EmberParticles] WebGL initialized');
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[EmberParticles] Shader compile error:', gl.getShaderInfoLog(shader));
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
      console.error('[EmberParticles] Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
  }

  /**
   * Update ember particles and spawn new ones from active holes
   * @param deltaSeconds Time elapsed in seconds
   * @param holes Active ground holes
   * @param groundSpeed Ground scroll speed in pixels/second (for parallax)
   */
  update(deltaSeconds: number, holes: GroundHoleInstance[], groundSpeed: number = 0): void {
    if (!this.supported || !this.gl) return;

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const deltaMs = deltaSeconds * 1000;
    const scrollAmount = groundSpeed * deltaSeconds;

    // Update existing particles - age them and scroll them left with ground
    this.particles = this.particles.filter(particle => {
      particle.age += deltaMs;
      particle.x -= scrollAmount; // Scroll left with parallax ground
      return particle.age < particle.lifetime;
    });

    // Spawn new embers from active holes
    const timeSinceLastSpawn = now - this.lastSpawnTime;
    const spawnInterval = 1000 / this.spawnRate; // ms between spawns per hole

    if (timeSinceLastSpawn >= spawnInterval && this.particles.length < this.maxParticles) {
      holes.forEach((hole, index) => {
        if (!hole.active) return;

        // Spawn ember at random X position within hole, at ground level
        const spawnX = hole.x + Math.random() * hole.width;
        const spawnY = hole.groundY; // Spawn at ground Y position (world coordinates)

        this.spawnEmber(spawnX, spawnY, index);
      });

      this.lastSpawnTime = now;
    }
  }

  /**
   * Spawn a single ember particle
   */
  private spawnEmber(x: number, y: number, holeIndex: number): void {
    // 70% of embers rise high (300px), 30% rise lower (150px) for variability
    const risesHigh = Math.random() < 0.7;
    const riseHeight = risesHigh ? 300.0 : 150.0;

    // Extreme horizontal range variability (some embers move far left-right, others stay subtle)
    // 40% have extreme wide curved paths, 60% have moderate to subtle paths
    const hasWideMotion = Math.random() < 0.4;
    const horizontalRange = hasWideMotion
      ? (60.0 + Math.random() * 40.0)  // 40% of embers: 60-100px wide curves
      : (15.0 + Math.random() * 30.0); // 60% of embers: 15-45px moderate curves

    const ember: EmberParticle = {
      x,
      y: y + 100, // Spawn 100px below ground level (below visible screen)
      size: 2 + Math.random() * 3, // 2-5px embers (very small)
      phase: Math.random(), // Random phase for swirl variety
      speed: 0.3 + Math.random() * 0.4, // 0.3-0.7 slower drift speed
      lifetime: 4000 + Math.random() * 2000, // 4-6 second lifetime (slower drift)
      age: 0,
      holeIndex,
      riseHeight,
      horizontalRange,
    };

    this.particles.push(ember);
  }

  /**
   * Render embers to the provided 2D context
   */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.supported || !this.gl || !this.program || !this.canvas) return;
    if (this.particles.length === 0) return;

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Prepare particle data for GPU
    const positions = new Float32Array(this.particles.length * 2);
    const sizes = new Float32Array(this.particles.length);
    const phases = new Float32Array(this.particles.length);
    const speeds = new Float32Array(this.particles.length);
    const lifetimes = new Float32Array(this.particles.length);
    const ages = new Float32Array(this.particles.length);
    const riseHeights = new Float32Array(this.particles.length);
    const horizontalRanges = new Float32Array(this.particles.length);

    this.particles.forEach((p, i) => {
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
      sizes[i] = p.size;
      phases[i] = p.phase;
      speeds[i] = p.speed;
      lifetimes[i] = p.lifetime;
      ages[i] = p.age;
      riseHeights[i] = p.riseHeight;
      horizontalRanges[i] = p.horizontalRange;
    });

    // Upload to GPU
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.phaseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, phases, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.speedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, speeds, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lifetimeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lifetimes, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.ageBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ages, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.riseHeightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, riseHeights, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.horizontalRangeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, horizontalRanges, gl.DYNAMIC_DRAW);

    // Render to WebGL canvas
    this.draw();

    // Composite to main canvas
    ctx.drawImage(this.canvas, 0, 0, width, height);
  }

  private draw(): void {
    if (!this.gl || !this.program || !this.canvas) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // Bind attributes
    this.bindAttribute(this.positionBuffer, this.attribLocations.position, 2);
    this.bindAttribute(this.sizeBuffer, this.attribLocations.size, 1);
    this.bindAttribute(this.phaseBuffer, this.attribLocations.phase, 1);
    this.bindAttribute(this.speedBuffer, this.attribLocations.speed, 1);
    this.bindAttribute(this.lifetimeBuffer, this.attribLocations.lifetime, 1);
    this.bindAttribute(this.ageBuffer, this.attribLocations.age, 1);
    this.bindAttribute(this.riseHeightBuffer, this.attribLocations.riseHeight, 1);
    this.bindAttribute(this.horizontalRangeBuffer, this.attribLocations.horizontalRange, 1);

    // Set uniforms
    if (this.uniformLocations.resolution) {
      gl.uniform2f(this.uniformLocations.resolution, this.canvas.width, this.canvas.height);
    }

    if (this.uniformLocations.time) {
      const elapsedSeconds = ((typeof performance !== 'undefined' ? performance.now() : 0) - this.startTime) / 1000;
      gl.uniform1f(this.uniformLocations.time, elapsedSeconds);
    }

    gl.drawArrays(gl.POINTS, 0, this.particles.length);
  }

  private bindAttribute(buffer: WebGLBuffer | null, location: number | undefined, size: number): void {
    if (!this.gl || buffer === null || location === undefined || location < 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  /**
   * Reset particle system
   */
  reset(): void {
    this.particles = [];
    this.lastSpawnTime = 0;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.sizeBuffer) gl.deleteBuffer(this.sizeBuffer);
    if (this.phaseBuffer) gl.deleteBuffer(this.phaseBuffer);
    if (this.speedBuffer) gl.deleteBuffer(this.speedBuffer);
    if (this.lifetimeBuffer) gl.deleteBuffer(this.lifetimeBuffer);
    if (this.ageBuffer) gl.deleteBuffer(this.ageBuffer);
    if (this.riseHeightBuffer) gl.deleteBuffer(this.riseHeightBuffer);
    if (this.horizontalRangeBuffer) gl.deleteBuffer(this.horizontalRangeBuffer);
    if (this.program) gl.deleteProgram(this.program);

    this.particles = [];
    this.gl = null;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  isReady(): boolean {
    return !!this.gl && !!this.program;
  }
}
