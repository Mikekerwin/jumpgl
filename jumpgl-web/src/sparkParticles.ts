type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravityMult: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export class SparkParticles {
  private sparks: Spark[] = [];
  private readonly gravity = 1400; // px/s^2 for a quicker fall
  private randomRed(): string {
    const base = 0xFF2020;
    const jitter = Math.floor(Math.random() * 0x1A); // up to ~26 brightness tweak
    const r = Math.min(255, ((base >> 16) & 0xff) + jitter);
    const g = Math.max(0, ((base >> 8) & 0xff) - jitter);
    const b = Math.max(0, (base & 0xff) - jitter);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
      .toString(16)
      .padStart(2, '0')}`;
  }

  private randomBlue(): string {
    const base = 0x4fc3f7;
    const jitter = Math.floor(Math.random() * 0x1A);
    const r = Math.max(0, ((base >> 16) & 0xff) - jitter);
    const g = Math.min(255, ((base >> 8) & 0xff) + jitter);
    const b = Math.min(255, (base & 0xff) + jitter);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
      .toString(16)
      .padStart(2, '0')}`;
  }

  spawn(x: number, y: number, color: 'red' | 'blue' = 'red'): void {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 smaller sparks
    const burstAngle = -Math.PI / 4 + (Math.random() - 0.5) * Math.PI * 0.4; // vary base direction per burst
    for (let i = 0; i < count; i++) {
      // Eject on a 45° bias (up-right), with some spread; gravity pulls down
      const angle = burstAngle + (Math.random() - 0.5) * Math.PI * 0.35; // around base with ±63°
      const speed = 220 + Math.random() * 160;
      const spark: Spark = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravityMult: 0.7 + Math.random() * 0.6, // vary per spark
        drag: 0.90 + Math.random() * 0.07,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.15,
        size: 0.95 + Math.random() * 1.14, // ~5% smaller overall
        color: color === 'red' ? this.randomRed() : this.randomBlue(),
      };
      this.sparks.push(spark);
    }
  }

  update(deltaSeconds: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += deltaSeconds;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += this.gravity * deltaSeconds * s.gravityMult * 0.35; // light gravity scaled
      s.x += s.vx * deltaSeconds;
      s.y += s.vy * deltaSeconds;
      s.vx *= s.drag;
      s.vy *= s.drag;
    }
  }

  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    this.sparks.forEach((s) => {
      if (
        s.x < -10 ||
        s.x > canvasWidth + 10 ||
        s.y < -10 ||
        s.y > canvasHeight + 10
      ) {
        return;
      }
      const alpha = 1 - s.life / s.maxLife;
      ctx.fillStyle = this.hexToRgba(s.color, alpha);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private hexToRgba(hex: string, alpha: number): string {
    const trimmed = hex.replace('#', '');
    const r = parseInt(trimmed.slice(0, 2), 16);
    const g = parseInt(trimmed.slice(2, 4), 16);
    const b = parseInt(trimmed.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
