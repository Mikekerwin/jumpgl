export const FOREST_DUST_PARTICLE_COUNT = 90;
export const FOREST_DUST_PARTICLE_COUNT_MOBILE = 36;
export const FOREST_DUST_SCROLL_SPEED = 0.055;
export const FOREST_DUST_FADE_IN_DURATION = 2400;
export const FOREST_DUST_FADE_OUT_DURATION = 1200;
export const FOREST_DUST_COLOR = { r: 0.95, g: 0.82, b: 0.65 };
export const FOREST_DUST_MOBILE_SWIRL_SCALE = 0.4;
export type ForestDustBucket = {
  ratio: number;
  minSizePercent: number;
  maxSizePercent: number;
  minDepth: number;
  maxDepth: number;
  blur: number;
  clustered: boolean;
  minHeightPercent: number;
  maxHeightPercent: number;
};
export const FOREST_DUST_BUCKETS: ForestDustBucket[] = [
  {
    ratio: 0.8,
    minSizePercent: 0.0018,
    maxSizePercent: 0.01,
    minDepth: 0.08,
    maxDepth: 0.35,
    blur: 0.05,
    clustered: false,
    minHeightPercent: 0.1,
    maxHeightPercent: 0.57,
  },
  {
    ratio: 0.17,
    minSizePercent: 0.025,
    maxSizePercent: 0.06,
    minDepth: 0.45,
    maxDepth: 0.7,
    blur: 0.7,
    clustered: false,
    minHeightPercent: 0.1,
    maxHeightPercent: 0.32,
  },
  {
    ratio: 0.08,
    minSizePercent: 0.12,
    maxSizePercent: 0.22,
    minDepth: 0.8,
    maxDepth: 1,
    blur: 0.85,
    clustered: false,
    minHeightPercent: 0.15,
    maxHeightPercent: 0.23,
  },
];
export const FOREST_DUST_SMALL_CLUSTER_COUNT = 10;
export const FOREST_DUST_SMALL_CLUSTER_RADIUS = 140;

// Platform configuration
export const PLATFORM_LARGE_IMAGE_PATH = '/jumpgl/grassPlatform_Large.png';
export const PLATFORM_SMALL_IMAGE_PATH = '/jumpgl/smallPlatform.png';
export const PLATFORM_VERTICAL_OFFSET = 200; // Pixels above ground center
export const HOLE_SMALL_IMAGE_PATH = '/jumpgl/holeSmall.png';
export const HOLE_LARGE_IMAGE_PATH = '/jumpgl/holeLarge.png';

// Laser configuration (ported from original Jump)
export const LASER_WIDTH = 25;
export const LASER_HEIGHT = 2;
export const BASE_LASER_SPEED = 2; // Increased for snappier laser travel (original Jump pacing)
export const MAX_LASERS = 4;
export const SCORE_PER_LASER_UNLOCK = 25;
export const CHAOS_INCREMENT_INTERVAL = 5;
export const BASE_LASER_RANDOMNESS = 1.0;
export const CHAOS_MULTIPLIER_PER_INTERVAL = 0.0;
export const WIDE_LASER_UNLOCK_SCORE = 100;
export const WIDE_LASER_WIDTH = 125;

// Responsive sizing configuration
// These maintain proportions relative to a baseline window height
export const BASELINE_WINDOW_HEIGHT = 800; // Reference height for design
export const BASELINE_GROUND_HEIGHT = 250; // Ground height at baseline
export const BASELINE_PLAYER_RADIUS = 40; // Player radius at baseline
export const MIN_GROUND_HEIGHT = 140; // Minimum ground height (prevents too small)
export const GROUND_PLAYER_DEPTH = 1.5; // Player depth into ground (multiplier)

/**
 * Calculate responsive sizes based on window height
 * Maintains proportions: if ground is 250px at 800px height and ball is 80px diameter,
 * they scale proportionally as window height changes
 */
export function calculateResponsiveSizes(windowHeight: number): {
  groundHeight: number;
  playerRadius: number;
  playerDiameter: number;
} {
  // Calculate scale factor based on window height
  const scaleFactor = windowHeight / BASELINE_WINDOW_HEIGHT;

  // Scale ground height proportionally, but enforce minimum
  const groundHeight = Math.max(MIN_GROUND_HEIGHT, BASELINE_GROUND_HEIGHT * scaleFactor);

  // Scale player proportionally to ground
  const playerRadius = BASELINE_PLAYER_RADIUS * scaleFactor;
  const playerDiameter = playerRadius * 2;

  return {
    groundHeight,
    playerRadius,
    playerDiameter,
  };
}
