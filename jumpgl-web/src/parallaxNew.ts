import { Assets, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { calculateResponsiveSizes } from './config';
import { BiomeSequenceManager, BIOME_CONFIGS } from './biomeSystem';
import type { BiomeType } from './biomeSystem';

const FRAMES_PER_SECOND = 60;
const SPEED_MULTIPLIER = 1.2; // 20% faster overall
const BASE_GROUND_SCROLL_SPEED = 1.0 * FRAMES_PER_SECOND * SPEED_MULTIPLIER; // 72 px/sec
const BASE_BACKGROUND_SPEED = 0.5 * FRAMES_PER_SECOND * SPEED_MULTIPLIER; // ~36 px/sec
const TRANSITION_SPEED_MULTIPLIER = 1.15;

/**
 * Segment types: biome segments that repeat, or transition segments between biomes
 */
type SegmentType = BiomeType | 'transition' | 'meteor_transition' | 'cloud_hole' | 'hole_transition_back' | 'cottage_start';

interface SegmentTextures {
  [key: string]: Texture; // Dynamic based on loaded biomes
}

/**
 * Improved SegmentScroller with biome system integration
 * Fixes the cloud-flashing bug by using BiomeSequenceManager for state
 */
class SegmentScroller {
  private container: Container;
  private foregroundContainer: Container; // For elements that render above the player
  private textures: SegmentTextures;
  private biomeManager: BiomeSequenceManager;
  private viewportWidth: number;
  private segmentHeight: number;
  private offsetY: number;
  private segments: Array<{ sprite: Sprite; width: number; type: SegmentType }> = [];
  private pendingSegments: SegmentType[] = [];
  private maxSegmentWidth = 0;
  private allowNewSegments = true; // Control whether to generate new segments
  private fenceTexture: Texture;
  private fenceSprite: Sprite | null = null;
  private cottageOverlayTexture: Texture;
  private cottageOverlaySprite: Sprite | null = null;
  private fenceButterflySprite: Sprite | null = null;
  private fenceButterflyActive = true; // Butterfly is on fence and stationary
  private fenceButterflyFrames: Texture[] = [];
  private fenceButterflyAnimating = false;
  private fenceButterflyFrame = 0;
  private fenceButterflyTime = 0;
  private fenceButterflyFlaps = 0;
  private fenceButterflyPhase: 'down' | 'up' | 'glide' = 'down'; // Wing animation phase
  private fenceButterflyState: 'on_fence' | 'hold' | 'flying' = 'on_fence'; // Overall state
  private fenceButterflyFlightTime = 0; // Time since starting to fly
  private fenceButterflyStartY = 0; // Starting Y position for flight
  private fenceButterflyLastY = 0; // Track last Y for movement direction
  private fenceButterflyFlapCount = 0; // Track flap count for 3-1-glide pattern
  private fenceButterflyGlideTime = 0; // Time spent in glide phase
  private readonly fenceButterflyBaseFrameDuration = 0.045;
  private fenceButterflyFrameDurationCurrent = 0.045;

  constructor(
    parent: Container,
    textures: SegmentTextures,
    biomeManager: BiomeSequenceManager,
    viewportWidth: number,
    segmentHeight: number,
    offsetY: number,
    fenceTexture: Texture,
    cottageOverlayTexture: Texture
  ) {
    this.container = new Container();
    parent.addChild(this.container);

    // Create separate foreground container (will be added to parent later, above player)
    this.foregroundContainer = new Container();

    this.textures = textures;
    this.biomeManager = biomeManager;
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    this.fenceTexture = fenceTexture;
    this.cottageOverlayTexture = cottageOverlayTexture;
    this.buildInitialSegments();
  }

  private buildInitialSegments(): void {
    this.segments.forEach(({ sprite }) => sprite.destroy());
    this.segments = [];

    // Destroy old fence sprite if it exists
    if (this.fenceSprite) {
      this.fenceSprite.destroy();
      this.fenceSprite = null;
    }

    // Destroy old cottage overlay sprite if it exists
    if (this.cottageOverlaySprite) {
      this.cottageOverlaySprite.destroy();
      this.cottageOverlaySprite = null;
    }

    // Destroy old butterfly sprite if it exists
    if (this.fenceButterflySprite) {
      this.fenceButterflySprite.destroy();
      this.fenceButterflySprite = null;
    }
    this.fenceButterflyActive = true;

    this.maxSegmentWidth = 0;
    let cursor = 0;
    let segmentCount = 0;
    while (cursor < this.viewportWidth * 2) {
      // Insert cottage_start as the first segment (index 0)
      const segmentType = segmentCount === 0 ? 'cottage_start' : this.getNextSegmentType();
      const next = this.createSegment(segmentType, cursor);
      cursor += next.width;
      segmentCount++;
    }

    // Create cottage overlay on the first segment (on top of cottage_start)
    if (this.segments.length > 0) {
      const firstSegment = this.segments[0];

      // Only create overlay if first segment is cottage_start
      if (firstSegment.type === 'cottage_start') {
        this.cottageOverlaySprite = new Sprite(this.cottageOverlayTexture);

        // Get the cottage_start segment's actual rendered dimensions
        const cottageSprite = firstSegment.sprite;
        const cottageScale = cottageSprite.scale.x;

        // Scale overlay to match cottage height (same scale as cottage)
        this.cottageOverlaySprite.scale.set(cottageScale);

        // Position overlay at same left-bottom point as cottage
        this.cottageOverlaySprite.x = cottageSprite.x;
        this.cottageOverlaySprite.y = cottageSprite.y;

        // Add overlay to foreground container (renders above player)
        this.foregroundContainer.addChild(this.cottageOverlaySprite);
      }
    }

    // Create fence sprite on the second segment
    if (this.segments.length > 1) {
      const secondSegment = this.segments[1];

      // Create fence sprite
      this.fenceSprite = new Sprite(this.fenceTexture);

      // Calculate fence dimensions (scaled to match ground height)
      const fenceScale = this.segmentHeight / (this.fenceTexture.height || 1);
      this.fenceSprite.scale.set(fenceScale);
      const fenceWidth = (this.fenceTexture.width || 1) * fenceScale;
      const fenceHeight = (this.fenceTexture.height || 1) * fenceScale;

      // Position fence: half a segment width to the right of second segment's right edge
      this.fenceSprite.x = secondSegment.sprite.x + secondSegment.width + (secondSegment.width / 2) - fenceWidth;

      // Position fence: bottom-aligned with ground, moved up 20px
      // Ground sprite.y = top of ground (offsetY)
      // Bottom of fence should align with bottom of ground segment
      this.fenceSprite.y = this.offsetY + this.segmentHeight - fenceHeight - 20;

      // Add to container
      this.container.addChild(this.fenceSprite);

      // Create stationary butterfly on fence pole - load all 7 orange butterfly frames
      const fenceSpriteRef = this.fenceSprite; // Capture reference for async callback
      const framePromises: Promise<Texture>[] = [];
      for (let i = 21; i <= 27; i++) {
        framePromises.push(Assets.load<Texture>(`orangeButterfly/butterfly${i}.png`));
      }

      Promise.all(framePromises).then((frames) => {
        if (!this.fenceButterflyActive || !fenceSpriteRef) return; // Already flew away or fence destroyed

        this.fenceButterflyFrames = frames;
        this.fenceButterflySprite = new Sprite(frames[0]); // Start with wings closed (frame 1)
        this.fenceButterflySprite.anchor.set(0.5);

        // Scale butterfly to match the largest of the other butterflies
        this.fenceButterflySprite.scale.set(0.35);

        // Position: 70% to the left of fence, 5px below top (moved up 5px from 10px)
        const fenceLeft = fenceSpriteRef.x;
        const fenceTop = fenceSpriteRef.y;
        this.fenceButterflySprite.x = fenceLeft + (fenceWidth * 0.30) - 2; // 30% from left = 70% to left, moved 2px left
        this.fenceButterflySprite.y = fenceTop + 5; // moved up 5px from 10px

        // Slight rotation for natural look
        this.fenceButterflySprite.rotation = Math.PI / 12;

        this.container.addChild(this.fenceButterflySprite);
      }).catch((err) => {
        console.error('[FENCE BUTTERFLY] Failed to load butterfly frames', err);
      });
    }
  }

  private createSegment(type: SegmentType, x: number): { sprite: Sprite; width: number; type: SegmentType } {
    const sprite = new Sprite(this.textures[type]);
    const textureWidth = sprite.texture.width || 1;
    const textureHeight = sprite.texture.height || 1;

    let scale: number;
    let width: number;

    // Cottage texture needs special handling - scale by width to match other ground segments
    if (type === 'cottage_start') {
      // Get reference width from cloudGround texture
      const cloudGroundTexture = this.textures['cloud'];
      const cloudGroundWidth = cloudGroundTexture.width || 1;
      const cloudGroundHeight = cloudGroundTexture.height || 1;
      const cloudGroundScale = this.segmentHeight / cloudGroundHeight;
      const targetWidth = cloudGroundWidth * cloudGroundScale;

      // Scale cottage to match target width
      scale = targetWidth / textureWidth;
      width = targetWidth;

      // Position cottage bottom-aligned with ground (offsetY is top of ground)
      sprite.x = x;
      sprite.y = this.offsetY + this.segmentHeight - (textureHeight * scale);
    } else {
      // Normal scaling based on height for all other segments
      scale = this.segmentHeight / textureHeight;
      width = textureWidth * scale;
      sprite.x = x;
      sprite.y = this.offsetY;
    }

    sprite.scale.set(scale);
    this.container.addChild(sprite);
    this.maxSegmentWidth = Math.max(this.maxSegmentWidth, width);
    const segment = { sprite, width, type };
    this.segments.push(segment);
    return segment;
  }

  /**
   * Get next segment type - either from pending queue or current biome
   * During transition, returns next biome after pending queue is empty
   */
  private getNextSegmentType(): SegmentType {
    // First priority: pending segments from transition queue
    if (this.pendingSegments.length > 0) {
      return this.pendingSegments.shift()!;
    }

    // Second priority: if in transition, return next biome (not current!)
    if (this.biomeManager.isInTransition()) {
      const nextBiome = this.biomeManager.getNextBiome();
      if (nextBiome) {
        return nextBiome;
      }
    }

    // Third priority: use current biome from manager
    const currentBiome = this.biomeManager.getCurrentBiome();
    return currentBiome;
  }

  /**
   * Get scroll speed for current state
   */
  private getCurrentScrollSpeed(): number {
    const currentBiome = this.biomeManager.getCurrentBiome();
    const config = BIOME_CONFIGS[currentBiome];
    const baseSpeed = BASE_GROUND_SCROLL_SPEED * config.scrollSpeed;

    // Speed up during transition
    if (this.biomeManager.isInTransition()) {
      return baseSpeed * TRANSITION_SPEED_MULTIPLIER;
    }

    return baseSpeed;
  }

  update(deltaSeconds: number, speedMultiplier: number = 1, shouldCull?: (x: number, w: number) => boolean): void {
    if (this.segments.length === 0) {
      this.buildInitialSegments();
    }

    const scrollSpeed = this.getCurrentScrollSpeed() * speedMultiplier;
    const scrollAmount = scrollSpeed * deltaSeconds;

    this.segments.forEach(({ sprite }) => {
      sprite.x -= scrollAmount;
    });

    // Scroll cottage overlay sprite with ground
    if (this.cottageOverlaySprite) {
      this.cottageOverlaySprite.x -= scrollAmount;
    }

    // Scroll fence sprite with ground
    if (this.fenceSprite) {
      this.fenceSprite.x -= scrollAmount;
    }

    // Scroll butterfly sprite with fence (only if not flying)
    if (this.fenceButterflySprite && this.fenceButterflyState !== 'flying') {
      this.fenceButterflySprite.x -= scrollAmount;
    }

    // Animate butterfly if triggered
    if (this.fenceButterflyAnimating && this.fenceButterflySprite && this.fenceButterflyFrames.length > 0) {
      if (this.fenceButterflyState === 'flying') {
        // Flying phase - upward trajectory with sine wave oscillations
        this.fenceButterflyFlightTime += deltaSeconds;

        const speed = 70; // px/s horizontal
        const amplitude = 150; // Dramatic vertical swings
        const frequency = 0.9; // Slower, graceful arcs
        const upwardSpeed = -25; // px/s upward drift (negative = up)
        // Much larger phase offset to ensure starting well into the upward swing
        const phaseOffset = -Math.PI / frequency; // Start at bottom, moving up (larger offset)

        const x = this.fenceButterflySprite.x + speed * deltaSeconds;
        // Add gradual upward movement over time (upwardSpeed * time) to the sine wave
        const upwardDrift = upwardSpeed * this.fenceButterflyFlightTime;
        const y = this.fenceButterflyStartY + upwardDrift + Math.sin((this.fenceButterflyFlightTime + phaseOffset) * frequency) * amplitude;

        // Track if moving up or down for wing speed adjustment
        const movingUp = y < this.fenceButterflyLastY;
        this.fenceButterflyLastY = y;

        // Adjust flap speed based on vertical direction: faster when moving up, slower when moving down
        this.fenceButterflyFrameDurationCurrent = this.fenceButterflyBaseFrameDuration * (movingUp ? 0.7 : 1.25);

        this.fenceButterflySprite.x = x;
        this.fenceButterflySprite.y = y;

        // Handle glide phase
        if (this.fenceButterflyPhase === 'glide') {
          this.fenceButterflyGlideTime += deltaSeconds;
          const glideDuration = 0.7 + Math.random() * 0.25;
          if (this.fenceButterflyGlideTime >= glideDuration) {
            this.fenceButterflyGlideTime = 0;
            this.fenceButterflyPhase = 'down'; // Go back to flapping
            this.fenceButterflyFrame = 0;
          }
          // Stay on glide frame (frame 3)
          this.fenceButterflySprite.texture = this.fenceButterflyFrames[3];
        } else {
          // Flying phase - use beautiful 3-1-glide flapping pattern
          this.fenceButterflyTime += deltaSeconds;
          if (this.fenceButterflyTime < this.fenceButterflyFrameDurationCurrent) {
            // Not time to advance frame yet
          } else {
            this.fenceButterflyTime = 0;

            if (this.fenceButterflyPhase === 'down') {
              // Wings closing (frames 0→6)
              this.fenceButterflyFrame++;
              if (this.fenceButterflyFrame >= this.fenceButterflyFrames.length) {
                this.fenceButterflyFrame = this.fenceButterflyFrames.length - 2;
                this.fenceButterflyPhase = 'up'; // Switch to 'up' phase
              }
            } else if (this.fenceButterflyPhase === 'up') {
              // Wings opening (frames 6→0)
              this.fenceButterflyFrame--;
              if (this.fenceButterflyFrame < 0) {
                this.fenceButterflyFlapCount++;
                this.fenceButterflyFrame = 0;
                const targetFlaps = this.fenceButterflyFlapCount >= 3 ? 4 : 3; // 3 then 1 (total 4) then glide
                if (this.fenceButterflyFlapCount >= targetFlaps) {
                  // Only glide when moving downward; if moving up, keep flapping
                  if (movingUp) {
                    this.fenceButterflyFlapCount = 0;
                    this.fenceButterflyPhase = 'down';
                    this.fenceButterflyFrame = 0;
                  } else {
                    this.fenceButterflyFlapCount = 0;
                    this.fenceButterflyPhase = 'glide';
                    this.fenceButterflyFrame = 3;
                    this.fenceButterflySprite.texture = this.fenceButterflyFrames[3];
                    return;
                  }
                } else {
                  this.fenceButterflyPhase = 'down'; // Continue flapping
                }
              }
            }

            this.fenceButterflySprite.texture = this.fenceButterflyFrames[this.fenceButterflyFrame];
          }
        }
      } else if (this.fenceButterflyState === 'on_fence') {
        // Flapping animation (on fence)
        this.fenceButterflyTime += deltaSeconds;
        const frameDuration = 0.05; // 50ms per frame

        if (this.fenceButterflyTime >= frameDuration) {
          this.fenceButterflyTime = 0;

          if (this.fenceButterflyPhase === 'down') {
            // Wings closing (frame 0 → 6)
            this.fenceButterflyFrame++;
            if (this.fenceButterflyFrame >= this.fenceButterflyFrames.length) {
              this.fenceButterflyFrame = this.fenceButterflyFrames.length - 2;
              this.fenceButterflyPhase = 'up';
            }
          } else if (this.fenceButterflyPhase === 'up') {
            // Wings opening (frame 6 → 0)
            this.fenceButterflyFrame--;
            if (this.fenceButterflyFrame < 0) {
              // Completed one flap - continue flapping continuously
              this.fenceButterflyFlaps++;
              this.fenceButterflyFrame = 0;
              this.fenceButterflyPhase = 'down';
            }
          }

          this.fenceButterflySprite.texture = this.fenceButterflyFrames[this.fenceButterflyFrame];
        }
      }
    }

    // Remove segments that should be culled
    if (shouldCull) {
      while (this.segments.length > 0) {
        const segment = this.segments[0];
        if (shouldCull(segment.sprite.x, segment.width)) {
          this.segments.shift();
          segment.sprite.destroy();
        } else {
          break; // Segments are ordered, so stop when we hit one to keep
        }
      }

      // Cull cottage overlay if off-screen
      if (this.cottageOverlaySprite) {
        const overlayWidth = this.cottageOverlaySprite.width;
        if (shouldCull(this.cottageOverlaySprite.x, overlayWidth)) {
          this.cottageOverlaySprite.destroy();
          this.cottageOverlaySprite = null;
        }
      }

      // Cull fence if off-screen
      if (this.fenceSprite) {
        const fenceWidth = this.fenceSprite.width;
        if (shouldCull(this.fenceSprite.x, fenceWidth)) {
          this.fenceSprite.destroy();
          this.fenceSprite = null;
        }
      }

      // Cull butterfly if off-screen (and not flying away)
      if (this.fenceButterflySprite && this.fenceButterflyState !== 'flying') {
        const butterflyWidth = this.fenceButterflySprite.width;
        if (shouldCull(this.fenceButterflySprite.x, butterflyWidth)) {
          this.fenceButterflySprite.destroy();
          this.fenceButterflySprite = null;
          this.fenceButterflyActive = false;
        }
      }
    }

    // Add new segments to fill screen (only if allowed - disabled during respawn reverse)
    if (this.allowNewSegments) {
      let cursor = this.segments.length
        ? this.segments[this.segments.length - 1].sprite.x + this.segments[this.segments.length - 1].width
        : 0;
      const coverTarget = this.viewportWidth + this.maxSegmentWidth * 1.2;
      while (cursor < coverTarget) {
        const next = this.createSegment(this.getNextSegmentType(), cursor);
        cursor += next.width;
      }
    }

    // Check if transition is complete (no more transition segments visible)
    if (this.biomeManager.isInTransition() && this.pendingSegments.length === 0) {
      const hasTransitionSegment = this.segments.some((seg) => seg.type === 'transition');
      if (!hasTransitionSegment) {
        // Transition complete! Update biome manager
        this.biomeManager.completeTransition();
        // Rebuild all segments with new biome to ensure clean state
        const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
        this.rebuildWithBiome(this.biomeManager.getCurrentBiome(), firstX);
        // Skip rest of update this frame - segments are rebuilt fresh
        return;
      }
    }
  }

  /**
   * Rebuild all segments with a specific biome
   * Ensures consistent state without cloud-flashing bug
   */
  private rebuildWithBiome(biome: BiomeType, startX: number = 0): void {
    this.segments.forEach(({ sprite }) => sprite.destroy());
    this.segments = [];
    this.maxSegmentWidth = 0;
    this.pendingSegments = []; // Clear any pending

    let cursor = startX;
    const coverTarget = startX + this.viewportWidth + Math.abs(startX) + 200;
    while (cursor < coverTarget) {
      const next = this.createSegment(biome, cursor);
      cursor += next.width;
    }
  }

  resize(viewportWidth: number, segmentHeight: number, offsetY: number): void {
    this.viewportWidth = viewportWidth;
    this.segmentHeight = segmentHeight;
    this.offsetY = offsetY;
    const firstX = this.segments.length ? this.segments[0].sprite.x : 0;
    // Rebuild with current biome (preserves state during resize)
    this.rebuildWithBiome(this.biomeManager.getCurrentBiome(), firstX);
  }

  /**
   * Trigger transition to next biome
   * Immediately appends transition segment to current segments
   */
  triggerTransition(): boolean {
    if (!this.biomeManager.startTransition()) {
      return false; // Already transitioning or no next biome
    }

    const nextBiome = this.biomeManager.getNextBiome();
    if (!nextBiome) {
      return false;
    }

    // Remove ALL off-screen segments
    this.trimFutureSegments();

    // Find the last segment that's actually visible
    // We want to append transition RIGHT after the last visible segment
    let lastVisibleSegment = null;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i].sprite.x < this.viewportWidth) {
        lastVisibleSegment = this.segments[i];
        break;
      }
    }

    // Calculate cursor position - right after last visible segment
    let cursor = lastVisibleSegment
      ? lastVisibleSegment.sprite.x + lastVisibleSegment.width
      : 0;

    // Create transition segment immediately
    this.createSegment('transition', cursor);
    cursor += this.segments[this.segments.length - 1].width;

    // Create first forest segment immediately
    this.createSegment(nextBiome, cursor);

    // Note: After this, getNextSegmentType() will return nextBiome during transition
    // so forest will continue repeating

    return true;
  }

  /**
   * Remove segments that are beyond the last visible segment
   * When transitioning, we only keep segments currently on screen
   */
  private trimFutureSegments(): void {
    // Find the last segment that's currently visible on screen
    // Keep everything that's on screen, remove everything else
    const kept: typeof this.segments = [];
    for (const segment of this.segments) {
      // Keep if any part is visible (x < viewport width)
      if (segment.sprite.x < this.viewportWidth) {
        kept.push(segment);
      } else {
        segment.sprite.destroy();
      }
    }

    if (kept.length === 0) {
      // Fallback: ensure at least one segment
      kept.push(this.createSegment(this.biomeManager.getCurrentBiome(), 0));
    }

    this.segments = kept;
  }

  /**
   * Start the comet hole level sequence
   * Sequence: meteor_transition → cloud_hole (count times) → hole_transition_back → cloud
   */
  startHoleSequence(holeCount: number = 5): void {
    // Remove all off-screen segments
    this.trimFutureSegments();

    // Find last visible segment
    let lastVisibleSegment = null;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i].sprite.x < this.viewportWidth) {
        lastVisibleSegment = this.segments[i];
        break;
      }
    }

    let cursor = lastVisibleSegment
      ? lastVisibleSegment.sprite.x + lastVisibleSegment.width
      : 0;

    // Manually create the hole sequence
    // 1. meteor_transition (hole on right 70%)
    this.createSegment('meteor_transition', cursor);
    cursor += this.segments[this.segments.length - 1].width;

    // 2. cloud_hole (holeCount repeats, 100% hole)
    for (let i = 0; i < holeCount; i++) {
      this.createSegment('cloud_hole', cursor);
      cursor += this.segments[this.segments.length - 1].width;
    }

    // 3. hole_transition_back (hole on left 35%)
    this.createSegment('hole_transition_back', cursor);
    cursor += this.segments[this.segments.length - 1].width;

    // 4. cloud (return to normal)
    this.createSegment('cloud', cursor);

    console.log(`[HOLE SEQUENCE] Started: meteor_transition → cloud_hole (${holeCount}x) → hole_transition_back → cloud`);
  }

  /**
   * Get segment info for external synchronization (hole spawning)
   */
  getSegments(): Array<{ x: number; width: number; type: string }> {
    return this.segments.map(seg => ({
      x: seg.sprite.x,
      width: seg.width,
      type: seg.type
    }));
  }

  /**
   * Check if there are any hole segments (meteor_transition, cloud_hole, hole_transition_back)
   * Returns the rightmost X position of all hole segments, or null if no holes exist
   */
  getRightmostHolePosition(): number | null {
    let rightmost = null;
    for (const seg of this.segments) {
      if (seg.type === 'meteor_transition' || seg.type === 'cloud_hole' || seg.type === 'hole_transition_back') {
        const right = seg.sprite.x + seg.width;
        if (rightmost === null || right > rightmost) {
          rightmost = right;
        }
      }
    }
    return rightmost;
  }

  /**
   * Check if the next segment to be spawned will be a hole segment
   * This helps determine if platforms should continue to be generated
   */
  willNextSegmentBeHole(): boolean {
    // Check if there are any pending hole segments
    if (this.pendingSegments.length > 0) {
      const nextType = this.pendingSegments[0];
      return nextType === 'meteor_transition' || nextType === 'cloud_hole' || nextType === 'hole_transition_back';
    }

    // Check the last few segments to determine the pattern
    if (this.segments.length > 0) {
      const lastSeg = this.segments[this.segments.length - 1];

      // If last segment is meteor_transition or cloud_hole, more holes are coming
      if (lastSeg.type === 'meteor_transition' || lastSeg.type === 'cloud_hole') {
        return true; // More holes coming (either more cloud_hole or hole_transition_back)
      }

      // If last segment is hole_transition_back, we need ONE more platform
      // because the transition back still has a hole on its left side
      // But after that, regular ground will come
      if (lastSeg.type === 'hole_transition_back') {
        // Check if the next-to-last segment exists and is a hole
        // This means we just added the transition back and need one more platform
        if (this.segments.length >= 2) {
          const secondToLast = this.segments[this.segments.length - 2];
          if (secondToLast.type === 'cloud_hole' || secondToLast.type === 'meteor_transition') {
            return true; // Just transitioned back, need one more platform
          }
        }
        return false; // Already spawned the final platform
      }
    }

    return false;
  }

  /**
   * Check if player is close to fence butterfly and trigger animation
   * @param playerX Player's X position
   */
  checkButterflyProximity(playerX: number): void {
    if (!this.fenceButterflyActive || !this.fenceButterflySprite) {
      return;
    }

    const butterflyX = this.fenceButterflySprite.x;
    const distance = butterflyX - playerX;

    // Start flapping when player is 325px away
    if (distance <= 325 && distance > 0 && !this.fenceButterflyAnimating) {
      this.fenceButterflyAnimating = true;
      this.fenceButterflyPhase = 'down';
      this.fenceButterflyFrame = 0;
      this.fenceButterflyTime = 0;
      this.fenceButterflyFlaps = 0;
      console.log('[FENCE BUTTERFLY] Flapping started at position', this.fenceButterflySprite.x, this.fenceButterflySprite.y);
    }

    // Trigger flight when player is 50px away
    if (distance <= 50 && distance > 0 && this.fenceButterflyState === 'on_fence') {
      this.fenceButterflyState = 'flying';
      this.fenceButterflyPhase = 'down';
      this.fenceButterflyStartY = this.fenceButterflySprite.y;
      this.fenceButterflyLastY = this.fenceButterflySprite.y;
      this.fenceButterflyFlightTime = 0;
      this.fenceButterflyFlapCount = 0;
      this.fenceButterflyFrame = 0;
      this.fenceButterflyActive = false;
      console.log('[FENCE BUTTERFLY] Starting flight from', this.fenceButterflySprite.y);
    }
  }

  /**
   * Enable or disable generation of new ground segments
   * Used during respawn to prevent new segments from being created during reverse parallax
   */
  setAllowNewSegments(allow: boolean): void {
    this.allowNewSegments = allow;
    console.log(`[SEGMENT GENERATION] ${allow ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Get the foreground container (for elements that render above the player)
   */
  getForegroundContainer(): Container {
    return this.foregroundContainer;
  }
}

const FOREST_TOP_CROP = 2; // pixels to trim from the top of forest/transition images

const createFittedSprite = (texture: Texture, width: number, height: number): Sprite => {
  const sprite = new Sprite(texture);
  const texWidth = texture.width || 1;
  const texHeight = texture.height || 1;
  const scale = width / texWidth;
  const scaledHeight = texHeight * scale;
  sprite.scale.set(scale);
  sprite.x = 0;
  sprite.y = height - (scaledHeight - FOREST_TOP_CROP); // bottom-align with crop
  sprite.width = texWidth * scale;
  sprite.height = scaledHeight - FOREST_TOP_CROP; // crop a few pixels from the top
  return sprite;
};

export type ParallaxTextures = {
  cloudSky: Texture;
  forestTrees: Texture;
  forestTransition: Texture;
  cloudGround: Texture;
  cloudCottageStart: Texture;
  cloudCottageStartOverlay: Texture;
  transitionGround: Texture;
  forestGround: Texture;
  meteorGroundTransition: Texture;
  cloudGroundHole: Texture;
  cloudGroundHoleTransitionBack: Texture;
  cloudFence: Texture;
};

let bundleRegistered = false;

export const loadParallaxTextures = async (): Promise<ParallaxTextures> => {
  if (!bundleRegistered) {
    Assets.addBundle('jump-parallax', {
      cloudSky: 'cloud_light_sky.webp',
      forestTrees: 'RepeatTreeLineWithTop.webp',
      forestTransition: 'TransitionTreeLineWithTop.webp',
      cloudGround: 'cloud_light_ground.webp',
      cloudCottageStart: 'cloud_light_cottage_start_open.webp',
      cloudCottageStartOverlay: 'cloud_light_cottage_start_overlay.webp',
      transitionGround: 'cloud_light_ground_forest_transition.webp',
      forestGround: 'forest_light_ground.webp',
      meteorGroundTransition: 'meteor_ground_transition.webp',
      cloudGroundHole: 'cloud_light_ground_hole.webp',
      cloudGroundHoleTransitionBack: 'cloud_light_ground_hole_transition_back.webp',
      cloudFence: 'cloud_light_fence.webp',
    });
    bundleRegistered = true;
  }
  return Assets.loadBundle('jump-parallax') as Promise<ParallaxTextures>;
};

/**
 * Improved ParallaxBackgrounds with biome system
 */
export class ParallaxBackgrounds {
  private container: Container;
  private biomeManager: BiomeSequenceManager;
  private skyBackground: TilingSprite | null = null;
  private currentBackground: TilingSprite | null = null;
  private transitionGroup: Container | null = null;
  private textures: ParallaxTextures;
  private viewportWidth: number;
  private viewportHeight: number;
  private onBiomeChange?: (biome: BiomeType) => void;

  constructor(
    parent: Container,
    textures: ParallaxTextures,
    biomeManager: BiomeSequenceManager,
    width: number,
    height: number,
    onBiomeChange?: (biome: BiomeType) => void
  ) {
    this.container = new Container();
    parent.addChild(this.container);
    this.textures = textures;
    this.biomeManager = biomeManager;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.onBiomeChange = onBiomeChange;
    this.setupSkyBackground();
    this.setupBackground(this.biomeManager.getCurrentBiome());
  }

  private setupSkyBackground(): void {
    if (this.skyBackground) {
      this.skyBackground.destroy();
    }
    const texture = this.textures.cloudSky;
    const heightMultiplier = 1.5;
    const backgroundHeight = this.viewportHeight * heightMultiplier;
    // Make sky wider than viewport to account for camera zoom (0.95 scale = ~1.05x wider needed)
    // Use 0.97x scale to make sky image slightly larger, and 1.4x width for camera zoom buffer
    const skyWidthMultiplier = 1.4; // Extra width for camera zoom-out
    const skyScaleMultiplier = 0.95; // Make sky texture slightly larger (increased from 0.95)
    const backgroundWidth = this.viewportWidth * skyWidthMultiplier;

    this.skyBackground = new TilingSprite({
      texture,
      width: backgroundWidth,
      height: backgroundHeight,
    });
    const scale = (backgroundHeight / (texture.height || 1)) * skyScaleMultiplier;
    this.skyBackground.tileScale.set(scale);
    this.skyBackground.tilePosition.set(0, 0);
    // Position sky with negative offset so more sky is visible when jumping higher
    // Reduce the offset slightly (multiply by 0.85) to push sky down with a tiny bit more upward
    const extraHeight = Math.max(0, backgroundHeight - this.viewportHeight);
    this.skyBackground.y = -extraHeight * .88; // Increased from 0.8 to push up slightly

    // Position sky more to the right (20% left, 80% right for more right-side coverage)
    const extraWidth = backgroundWidth - this.viewportWidth;
    this.skyBackground.x = -extraWidth * 0.15; // Changed from 0.3 to 0.2 for more right coverage

    this.container.addChildAt(this.skyBackground, 0);
  }

  private setupBackground(biome: BiomeType): void {
    if (this.currentBackground) {
      this.currentBackground.destroy();
      this.currentBackground = null;
    }
    const textureName = BIOME_CONFIGS[biome].backgroundTexture as keyof ParallaxTextures;
    if (textureName === 'cloudSky') {
      return; // rely on persistent sky
    }
    const texture = this.textures[textureName];
    const scale = this.viewportWidth / (texture.width || 1);
    const scaledHeight = (texture.height || 1) * scale;
    const visibleHeight = scaledHeight - FOREST_TOP_CROP;

    this.currentBackground = new TilingSprite({
      texture,
      width: this.viewportWidth,
      height: visibleHeight,
    });

    this.currentBackground.tileScale.set(scale);
    this.currentBackground.tilePosition.set(0, -FOREST_TOP_CROP);
    // Place so the bottom of the scaled image sits at the bottom of the viewport
    this.currentBackground.y = this.viewportHeight - visibleHeight;

    // Place background above sky (0) and wind (inserted at 1 in main)
    this.container.addChild(this.currentBackground);
  }

  getRoot(): Container {
    return this.container;
  }

  update(deltaSeconds: number, speedMultiplier: number = 1): void {
    const currentBiome = this.biomeManager.getCurrentBiome();
    const config = BIOME_CONFIGS[currentBiome];
    const scrollSpeed = BASE_BACKGROUND_SPEED * config.backgroundSpeedMultiplier * speedMultiplier;

    // During transition, only scroll the transition group (not the background)
    // OR if transition group exists (even if biome switched)
    if (this.transitionGroup) {
      // Scroll transition group
      this.transitionGroup.x -= scrollSpeed * deltaSeconds;

      // Check if transition is done scrolling
      const transitionSprite = this.transitionGroup.children[0] as Sprite;
      const transitionRight = this.transitionGroup.x + (transitionSprite?.width || 0);

      if (transitionRight <= 0) {
        // Transition visual complete, switch to current biome (not next!)
        // Because ground already completed transition and updated biome manager
        const currentBiome = this.biomeManager.getCurrentBiome();
        this.setupBackground(currentBiome);
        this.onBiomeChange?.(currentBiome);

        this.transitionGroup.destroy({ children: true });
        this.transitionGroup = null;
      }
    } else {
      // Not in transition - scroll the current background (if not cloud)
      // Sky stays static; forest scrolls
      if (this.currentBackground) {
        this.currentBackground.tilePosition.x -= scrollSpeed * deltaSeconds;
      }
    }
  }

  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;

    if (this.skyBackground) {
      const texture = this.skyBackground.texture;
      const heightMultiplier = 1.5;
      const backgroundHeight = height * heightMultiplier;
      const scale = backgroundHeight / (texture.height || 1);
      this.skyBackground.width = width;
      this.skyBackground.height = backgroundHeight;
      this.skyBackground.tileScale.set(scale);
      const extraHeight = Math.max(0, backgroundHeight - height);
      this.skyBackground.y = -extraHeight;
    }

    if (this.currentBackground) {
      const texture = this.currentBackground.texture;
      const baseScale = width / (texture.width || 1);
      const scaledHeight = (texture.height || 1) * baseScale;
      const visibleHeight = scaledHeight - FOREST_TOP_CROP;
      this.currentBackground.width = width;
      this.currentBackground.height = visibleHeight;
      this.currentBackground.tileScale.set(baseScale);
      this.currentBackground.tilePosition.set(0, -FOREST_TOP_CROP);
      this.currentBackground.y = this.viewportHeight - visibleHeight;
    }

    if (this.transitionGroup) {
      const transitionSprite = createFittedSprite(this.textures.forestTransition, width, height);
      const forestSprite = createFittedSprite(this.textures.forestTrees, width, height);
      forestSprite.x = transitionSprite.width;
      this.transitionGroup.removeChildren();
      this.transitionGroup.addChild(transitionSprite, forestSprite);
      this.transitionGroup.x = Math.min(this.transitionGroup.x, width);
    }
  }

  /**
   * Trigger visual transition for background
   * Starts immediately at right edge of viewport
   */
  triggerTransition(): boolean {
    if (this.biomeManager.isInTransition() && !this.transitionGroup) {
      const nextBiome = this.biomeManager.getNextBiome();
      if (!nextBiome) return false;

      // Create transition visual (only for cloud→forest for now)
      // TODO: Make this dynamic based on biome transitions
      const group = new Container();
      const transitionSprite = createFittedSprite(
        this.textures.forestTransition,
        this.viewportWidth,
        this.viewportHeight
      );
      const nextBgTexture = this.textures[BIOME_CONFIGS[nextBiome].backgroundTexture as keyof ParallaxTextures];
      const nextSprite = createFittedSprite(nextBgTexture, this.viewportWidth, this.viewportHeight);
      nextSprite.x = transitionSprite.width;
      group.addChild(transitionSprite, nextSprite);
      // Start immediately at right edge of viewport (x = viewportWidth)
      group.x = this.viewportWidth;
      this.transitionGroup = group;
      this.container.addChild(group);
      return true;
    }
    return false;
  }

  /**
   * Get transition progress (0 = not started, 1 = complete)
   */
  getTransitionProgress(): number {
    if (!this.biomeManager.isInTransition()) return 0;
    if (!this.transitionGroup) return 0;
    const transitionSprite = this.transitionGroup.children[0] as Sprite | undefined;
    if (!transitionSprite) return 0;
    const traveled = this.viewportWidth - this.transitionGroup.x;
    const totalWidth = transitionSprite.width;
    return Math.min(1, Math.max(0, traveled / totalWidth));
  }
}

/**
 * Improved ParallaxGrounds with biome system
 */
export class ParallaxGrounds {
  private scroller: SegmentScroller;
  private groundTop: number;
  private groundHeight: number;

  constructor(
    parent: Container,
    textures: ParallaxTextures,
    biomeManager: BiomeSequenceManager,
    width: number,
    height: number
  ) {
    const sizes = calculateResponsiveSizes(height);
    this.groundHeight = sizes.groundHeight;
    this.groundTop = height - this.groundHeight;

    // Map biome ground textures to segment types
    const segmentTextures: SegmentTextures = {
      cloud: textures.cloudGround,
      forest: textures.forestGround,
      transition: textures.transitionGround,
      meteor_transition: textures.meteorGroundTransition,
      cloud_hole: textures.cloudGroundHole,
      hole_transition_back: textures.cloudGroundHoleTransitionBack,
      cottage_start: textures.cloudCottageStart,
    };

    this.scroller = new SegmentScroller(
      parent,
      segmentTextures,
      biomeManager,
      width,
      this.groundHeight,
      this.groundTop,
      textures.cloudFence,
      textures.cloudCottageStartOverlay
    );
  }

  update(deltaSeconds: number, speedMultiplier: number = 1, shouldCull?: (x: number, w: number) => boolean): void {
    this.scroller.update(deltaSeconds, speedMultiplier, shouldCull);
  }

  resize(width: number, height: number): void {
    const sizes = calculateResponsiveSizes(height);
    this.groundHeight = sizes.groundHeight;
    this.groundTop = height - this.groundHeight;
    this.scroller.resize(width, this.groundHeight, this.groundTop);
  }

  triggerTransition(): boolean {
    return this.scroller.triggerTransition();
  }

  getSurfaceY(): number {
    return this.groundTop;
  }

  /**
   * Get the foreground container (for elements that render above the player)
   */
  getForegroundContainer(): Container {
    return this.scroller.getForegroundContainer();
  }

  /**
   * Trigger the comet hole level sequence
   * Sequence: meteor_transition → cloud_hole (count times) → hole_transition_back → cloud
   * @param holeCount - Number of full hole segments to create (default: 5)
   */
  startHoleSequence(holeCount: number = 5): void {
    this.scroller.startHoleSequence(holeCount);
  }

  /**
   * Get all segments for hole spawning synchronization
   */
  getSegments(): Array<{ x: number; width: number; type: string }> {
    return this.scroller.getSegments();
  }

  /**
   * Get the rightmost X position of all hole segments
   * Returns null if no hole segments exist
   */
  getRightmostHolePosition(): number | null {
    return this.scroller.getRightmostHolePosition();
  }

  /**
   * Check if the next segment to be spawned will be a hole segment
   */
  willNextSegmentBeHole(): boolean {
    return this.scroller.willNextSegmentBeHole();
  }

  /**
   * Check if player is close to fence butterfly and trigger animation
   * @param playerX Player's X position
   */
  checkButterflyProximity(playerX: number): void {
    this.scroller.checkButterflyProximity(playerX);
  }

  /**
   * Enable or disable generation of new ground segments
   * Used during respawn to prevent segments from being created during reverse parallax
   */
  setAllowNewSegments(allow: boolean): void {
    this.scroller.setAllowNewSegments(allow);
  }
}
