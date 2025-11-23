/**
 * Charge Particle System
 * Creates spiral particle effects while charging a jump
 */

interface ChargeParticle {
  angle: number; // Current angle around player (radians)
  distance: number; // Distance from player center
  targetDistance: number; // Target distance to spiral toward
  speed: number; // Inward acceleration speed
  life: number; // Current life (0 to maxLife)
  maxLife: number; // Total lifespan in seconds
  size: number; // Particle radius
  color: number; // Hex color
  angularVelocity: number; // Rotation speed around player
}

export class ChargeParticles {
  private particles: ChargeParticle[] = [];
  private readonly maxParticles = 20; // Reduced from 30
  private spawnTimer = 0;
  private readonly spawnInterval = 0.06; // Spawn every 60ms (slower than 40ms)

  /**
   * Update particles while charging
   * @param deltaSeconds Time elapsed in seconds
   * @param chargeLevel Charge level from 0.0 to 1.0
   */
  update(deltaSeconds: number, chargeLevel: number): void {
    // Spawn new particles based on charge level
    if (chargeLevel > 0) {
      this.spawnTimer += deltaSeconds;
      const spawnRate = this.spawnInterval / (1 + chargeLevel); // Faster spawn at higher charge

      while (this.spawnTimer >= spawnRate) {
        this.spawnTimer -= spawnRate;
        this.spawnParticle(chargeLevel);
      }
    } else {
      this.spawnTimer = 0;
    }

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update lifetime
      p.life += deltaSeconds;

      // Remove dead particles
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Spiral inward toward player
      p.distance -= p.speed * deltaSeconds;
      if (p.distance < 5) {
        p.distance = 5; // Don't go inside player
      }

      // Rotate around player
      p.angle += p.angularVelocity * deltaSeconds;
    }
  }

  /**
   * Render all particles to a 2D canvas context
   * NOTE: Context should already be translated to player position
   * @param ctx Canvas 2D context
   * @param canvasWidth Canvas width for bounds checking
   * @param canvasHeight Canvas height for bounds checking
   */
  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    this.particles.forEach((p) => {
      // Calculate particle position based on angle and distance
      // These are relative to player center (0, 0) since context is already translated
      const x = p.distance * Math.cos(p.angle);
      const y = p.distance * Math.sin(p.angle);

      // Calculate alpha based on lifetime (fade in then out)
      const lifeRatio = p.life / p.maxLife;
      let alpha: number;
      if (lifeRatio < 0.2) {
        // Fade in during first 20%
        alpha = lifeRatio / 0.2;
      } else {
        // Fade out during last 80%
        alpha = 1 - ((lifeRatio - 0.2) / 0.8);
      }

      // Apply opacity modifier: large particles (size >= 3) get 0.7 opacity
      const opacityModifier = p.size >= 3 ? 0.7 : 1.0;
      alpha *= opacityModifier;

      // Convert hex color to RGB
      const r = (p.color >> 16) & 0xff;
      const g = (p.color >> 8) & 0xff;
      const b = p.color & 0xff;

      // Draw flat circle (no gradient)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
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
   * Clear all particles (called when jump is released)
   */
  clear(): void {
    this.particles = [];
    this.spawnTimer = 0;
  }

  /**
   * Generate particle size with variety - two distinct systems:
   * 1. Larger inner particles (close to player)
   * 2. Much smaller outer particles (further out)
   * @param chargeLevel Current charge level (affects size scaling)
   */
  private generateParticleSize(chargeLevel: number): number {
    const random = Math.random();
    let baseSize: number;

    if (random < 0.7) {
      // 70% tiny particles (1-2px) - the outer spiral system
      baseSize = 1 + Math.random() * 1;
    } else if (random < 0.9) {
      // 20% medium particles (3-5px) - inner system medium (reduced from 4-6px)
      baseSize = 3 + Math.random() * 2;
    } else {
      // 10% large particles (5-7px) - inner system large (reduced from 6-9px)
      baseSize = 5 + Math.random() * 2;
    }

    // Scale up with charge level
    return baseSize + chargeLevel * 2;
  }

  /**
   * Spawn a new charge particle (spawned relative to player at 0,0)
   * @param chargeLevel Current charge level (0-1)
   */
  private spawnParticle(chargeLevel: number): void {
    // Enforce max particle limit (remove oldest if full)
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }

    const angle = Math.random() * Math.PI * 2; // Random angle

    // Determine particle size first to calculate distance and speed
    const size = this.generateParticleSize(chargeLevel);

    // Small particles (1-3px): WIDE OUTER RING, fast movement
    // Large particles (4-11px): TIGHT INNER RING, slow movement
    let startDistance: number;
    let speed: number;
    let angularVelocity: number;

    if (size < 3) {
      // Small particles - very wide outer ring, fast spiral
      startDistance = 120 + Math.random() * 80; // 120-200px (even wider outer ring)
      speed = 120 + chargeLevel * 140; // 120-260 px/s (very fast)
      angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3); // ±2 to ±5 rad/s (faster rotation)
    } else {
      // Large particles - tight inner ring, slower spiral
      startDistance = 35 + Math.random() * 15; // 35-50px (very tight, close to player)
      speed = 35 + chargeLevel * 45; // 35-80 px/s (slower)
      angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.8); // ±0.4 to ±1.2 rad/s (slower rotation)
    }

    // Choose color based on particle size:
    // Large particles (size >= 3): player blue color
    // Small particles (size < 3): white/gray shades
    let color: number;
    if (size >= 3) {
      color = 0x4fc3f7; // Same blue as player
    } else {
      const shadeRandom = Math.random();
      if (shadeRandom < 0.33) {
        color = 0xffffff; // Pure white
      } else if (shadeRandom < 0.66) {
        color = 0xe0e0e0; // Light gray
      } else {
        color = 0xcccccc; // Medium gray
      }
    }

    this.particles.push({
      angle,
      distance: startDistance,
      targetDistance: 5, // Spiral down to player center
      speed,
      life: 0,
      maxLife: 0.8 + Math.random() * 0.4, // 0.8-1.2 seconds
      size,
      color,
      angularVelocity,
    });
  }
}
