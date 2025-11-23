/**
 * Jump Dust Particle System
 * Creates particle bursts when player jumps and lands
 */

interface DustParticle {
  x: number;
  y: number;
  vx: number; // Velocity X
  vy: number; // Velocity Y
  life: number; // Current life (0 to maxLife)
  maxLife: number; // Total lifespan in seconds
  size: number; // Particle radius
  color: number; // Hex color
}

export class JumpDustParticles {
  private particles: DustParticle[] = [];
  private readonly maxParticles = 50;
  private readonly gravity = 800; // Pixels per second squared

  /**
   * Spawn particles for a jump event
   * @param x X position to spawn from
   * @param y Y position to spawn from
   */
  spawnJumpDust(x: number, y: number): void {
    const particleCount = 8 + Math.floor(Math.random() * 4); // 8-11 particles (increased from 6-8)

    for (let i = 0; i < particleCount; i++) {
      // Upward arc spread: -120° to -60° (upward fan)
      const angleMin = -Math.PI * 2 / 3; // -120°
      const angleMax = -Math.PI / 3; // -60°
      const angle = angleMin + Math.random() * (angleMax - angleMin);

      const speed = 150 + Math.random() * 100; // 150-250 px/s

      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.2, // 0.45-0.65 seconds (increased by 150ms)
        size: 2 + Math.random() * 3, // 2-5px
        color: Math.random() > 0.5 ? 0xcccccc : 0xe0e0e0, // Gray/white colors
      });
    }
  }

  /**
   * Spawn particles for a landing event
   * @param x X position to spawn from
   * @param y Y position to spawn from
   * @param impactVelocity Vertical velocity at impact (for intensity)
   */
  spawnLandingDust(x: number, y: number, impactVelocity: number): void {
    // More particles for harder landings
    const baseCount = 10;
    const velocityBonus = Math.min(Math.abs(impactVelocity) / 200, 1); // 0-1
    const particleCount = Math.floor(baseCount + velocityBonus * 8); // 10-18 particles

    for (let i = 0; i < particleCount; i++) {
      // Outward burst: -150° to -30° (wide arc near ground)
      const angleMin = -Math.PI * 5 / 6; // -150°
      const angleMax = -Math.PI / 6; // -30°
      const angle = angleMin + Math.random() * (angleMax - angleMin);

      const speed = 120 + Math.random() * 130 + velocityBonus * 50; // 120-300 px/s (faster on hard landing)

      this.addParticle({
        x: x + (Math.random() - 0.5) * 20, // Slight horizontal spread
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.25, // 0.5-0.75 seconds (increased by 150ms)
        size: 2.5 + Math.random() * 2.5 + velocityBonus * 2, // 2.5-7px (bigger on hard landing)
        color: Math.random() > 0.5 ? 0xcccccc : 0xe0e0e0, // Gray/white colors
      });
    }
  }

  /**
   * Update all particles
   * @param deltaSeconds Time elapsed in seconds
   */
  update(deltaSeconds: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update lifetime
      p.life += deltaSeconds;

      // Remove dead particles
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Apply gravity
      p.vy += this.gravity * deltaSeconds;

      // Update position
      p.x += p.vx * deltaSeconds;
      p.y += p.vy * deltaSeconds;

      // Air resistance (slow down over time)
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
  }

  /**
   * Render all particles to a 2D canvas context
   * @param ctx Canvas 2D context
   * @param canvasWidth Canvas width for bounds checking
   * @param canvasHeight Canvas height for bounds checking
   */
  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    this.particles.forEach((p) => {
      // Skip particles outside canvas bounds
      if (p.x < -10 || p.x > canvasWidth + 10 || p.y < -10 || p.y > canvasHeight + 10) {
        return;
      }

      // Calculate alpha based on lifetime (fade out)
      const lifeRatio = p.life / p.maxLife;
      const alpha = 1 - lifeRatio; // 1.0 → 0.0

      // Create radial gradient for soft edges
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);

      // Convert hex color to RGB
      const r = (p.color >> 16) & 0xff;
      const g = (p.color >> 8) & 0xff;
      const b = p.color & 0xff;

      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`); // Increased from 0.8 to 0.9
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.6})`); // Increased from 0.5 to 0.6
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * Get current particle count
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Clear all particles
   */
  clear(): void {
    this.particles = [];
  }

  /**
   * Add a particle to the system (with pooling limit)
   */
  private addParticle(particle: DustParticle): void {
    // Enforce max particle limit (remove oldest if full)
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }

    this.particles.push(particle);
  }
}
