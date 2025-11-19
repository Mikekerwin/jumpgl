/**
 * Biome System
 * Manages biome definitions, transitions, and sequences for parallax scrolling
 */

export type BiomeType = 'cloud' | 'forest' | 'cave' | 'mountain';

export interface BiomeConfig {
  id: BiomeType;
  backgroundTexture: string;
  groundTexture: string;
  transitionToTexture?: string; // Optional transition ground texture
  scrollSpeed: number; // Ground scroll speed multiplier (1.0 = base speed)
  backgroundSpeedMultiplier: number; // Background parallax depth (1.0 = same as ground)
}

/**
 * Defines available biomes and their visual/behavior properties
 */
export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  cloud: {
    id: 'cloud',
    backgroundTexture: 'cloudSky',
    groundTexture: 'cloudGround',
    transitionToTexture: 'transitionGround', // Used when transitioning FROM cloud
    scrollSpeed: 1.0,
    backgroundSpeedMultiplier: 0.5,
  },
  forest: {
    id: 'forest',
    backgroundTexture: 'forestTrees',
    groundTexture: 'forestGround',
    scrollSpeed: 1.0,
    backgroundSpeedMultiplier: 1.05,
  },
  cave: {
    id: 'cave',
    backgroundTexture: 'caveBg', // Add these textures later
    groundTexture: 'caveGround',
    scrollSpeed: 0.8,
    backgroundSpeedMultiplier: 0.3,
  },
  mountain: {
    id: 'mountain',
    backgroundTexture: 'mountainBg',
    groundTexture: 'mountainGround',
    scrollSpeed: 1.2,
    backgroundSpeedMultiplier: 0.7,
  },
};

/**
 * Manages the sequence of biomes and transitions
 * Example: cloud (repeat) → transition → forest (repeat) → transition → cave (repeat)
 */
export class BiomeSequenceManager {
  private sequence: BiomeType[] = [];
  private currentIndex = 0;
  private isTransitioning = false;
  private transitionQueued = false;

  constructor(initialBiome: BiomeType) {
    this.sequence = [initialBiome];
  }

  /**
   * Get current biome
   */
  getCurrentBiome(): BiomeType {
    return this.sequence[this.currentIndex];
  }

  /**
   * Get next biome in sequence (or null if at end)
   */
  getNextBiome(): BiomeType | null {
    if (this.currentIndex + 1 >= this.sequence.length) {
      return null;
    }
    return this.sequence[this.currentIndex + 1];
  }

  /**
   * Check if currently transitioning
   */
  isInTransition(): boolean {
    return this.isTransitioning;
  }

  /**
   * Start transition to next biome
   * Returns true if transition started, false if already transitioning or no next biome
   */
  startTransition(): boolean {
    if (this.isTransitioning || this.transitionQueued) {
      return false; // Already transitioning
    }
    const next = this.getNextBiome();
    if (!next) {
      return false; // No next biome to transition to
    }
    this.isTransitioning = true;
    this.transitionQueued = true;
    return true;
  }

  /**
   * Complete the transition (called when transition visuals finish)
   */
  completeTransition(): void {
    if (this.isTransitioning && this.currentIndex + 1 < this.sequence.length) {
      this.currentIndex++;
      this.isTransitioning = false;
      this.transitionQueued = false;
    }
  }

  /**
   * Add a biome to the end of the sequence
   */
  addBiome(biome: BiomeType): void {
    this.sequence.push(biome);
  }

  /**
   * Set entire sequence at once
   * Example: ['cloud', 'forest', 'cave', 'mountain']
   */
  setSequence(sequence: BiomeType[]): void {
    if (sequence.length === 0) {
      throw new Error('Sequence must contain at least one biome');
    }
    this.sequence = sequence;
    this.currentIndex = 0;
    this.isTransitioning = false;
    this.transitionQueued = false;
  }

  /**
   * Reset to beginning of sequence
   */
  reset(): void {
    this.currentIndex = 0;
    this.isTransitioning = false;
    this.transitionQueued = false;
  }

  /**
   * Get full sequence
   */
  getSequence(): BiomeType[] {
    return [...this.sequence];
  }

  /**
   * Get current position in sequence
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }
}
