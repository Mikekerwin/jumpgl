# Parallax Biome System Documentation

## Overview

The new parallax system provides a robust, flexible way to create seamless transitions between different biomes (cloud, forest, cave, mountain, etc.). It fixes the cloud-ground flashing bug and makes it easy to add new biomes and transition sequences.

## Architecture

### Components

1. **BiomeSequenceManager** (`biomeSystem.ts`)
   - Manages the sequence of biomes and transitions
   - Tracks current biome and transition state
   - Example: `['cloud', 'forest', 'cave']`

2. **BiomeConfig** (`biomeSystem.ts`)
   - Defines properties for each biome:
     - Background texture
     - Ground texture
     - Scroll speeds
     - Parallax depth

3. **ParallaxBackgrounds** (`parallaxNew.ts`)
   - Handles sky/background layer scrolling
   - Manages transition visuals
   - Uses TilingSprite for seamless looping

4. **ParallaxGrounds** (`parallaxNew.ts`)
   - Handles ground segment scrolling
   - Manages ground transitions
   - Uses SegmentScroller internally

5. **SegmentScroller** (`parallaxNew.ts`)
   - Core segment management
   - Creates/destroys sprite segments as they scroll
   - Fixed the cloud-flashing bug

## Key Bug Fixes

### Cloud-Flashing Bug (Fixed)

**Problem**: After cloud→forest transition, cloud ground segments briefly appeared before disappearing.

**Root Cause**: Race condition in old `SegmentScroller.update()`:
```typescript
// OLD CODE (buggy)
if (this.mode === 'transition' && this.pendingQueue.length === 0) {
  const transitionOnScreen = this.segments.some((segment) => segment.type === 'transition');
  if (!transitionOnScreen) {
    this.mode = 'forest';
    this.rebuildWithType('forest', firstX); // ← Rebuilt before mode fully propagated
  }
}
```

During rebuild, `getNextType()` checked `this.mode` but it wasn't guaranteed to be 'forest' yet, causing cloud segments to be created.

**Solution**: Use `BiomeSequenceManager` as single source of truth:
```typescript
// NEW CODE (fixed)
private getNextSegmentType(): SegmentType {
  // First priority: pending segments from transition queue
  if (this.pendingSegments.length > 0) {
    return this.pendingSegments.shift()!;
  }

  // Second priority: current biome from manager (always accurate)
  const currentBiome = this.biomeManager.getCurrentBiome();
  return currentBiome;
}
```

The BiomeSequenceManager ensures the mode is updated atomically via `completeTransition()`.

## Usage

### Basic Setup

```typescript
import { BiomeSequenceManager } from './biomeSystem';
import { ParallaxBackgrounds, ParallaxGrounds } from './parallaxNew';

// 1. Create biome manager with initial biome
const biomeManager = new BiomeSequenceManager('cloud');

// 2. Set the sequence of biomes
biomeManager.setSequence(['cloud', 'forest', 'cave']);

// 3. Create parallax layers
const backgrounds = new ParallaxBackgrounds(
  container,
  textures,
  biomeManager,
  width,
  height,
  (biome) => {
    console.log(`Switched to ${biome}`);
  }
);

const grounds = new ParallaxGrounds(
  container,
  textures,
  biomeManager,
  width,
  height
);
```

### Triggering Transitions

```typescript
// Trigger transition to next biome in sequence
const success = grounds.triggerTransition();
if (success) {
  backgrounds.triggerTransition();
}
```

### Adding New Biomes

1. **Define biome type** in `biomeSystem.ts`:
```typescript
export type BiomeType = 'cloud' | 'forest' | 'cave' | 'mountain';
```

2. **Add biome config**:
```typescript
export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  // ... existing biomes
  cave: {
    id: 'cave',
    backgroundTexture: 'caveBg',
    groundTexture: 'caveGround',
    scrollSpeed: 0.8,
    backgroundSpeedMultiplier: 0.3,
  },
};
```

3. **Load textures** in `parallaxNew.ts`:
```typescript
export type ParallaxTextures = {
  // ... existing
  caveBg: Texture;
  caveGround: Texture;
};

export const loadParallaxTextures = async (): Promise<ParallaxTextures> => {
  Assets.addBundle('jump-parallax', {
    // ... existing
    caveBg: 'cave_background.webp',
    caveGround: 'cave_ground.webp',
  });
  return Assets.loadBundle('jump-parallax');
};
```

4. **Update segment textures** in `ParallaxGrounds` constructor:
```typescript
const segmentTextures: SegmentTextures = {
  cloud: textures.cloudGround,
  forest: textures.forestGround,
  cave: textures.caveGround, // ← Add here
  transition: textures.transitionGround,
};
```

5. **Use in sequence**:
```typescript
biomeManager.setSequence(['cloud', 'forest', 'cave']);
```

## Advanced Usage

### Dynamic Sequences

```typescript
// Start with just cloud
biomeManager.setSequence(['cloud']);

// Later, add more biomes dynamically
biomeManager.addBiome('forest');
biomeManager.addBiome('cave');
```

### Checking Transition State

```typescript
// Check if transitioning
if (biomeManager.isInTransition()) {
  console.log('Transition in progress...');
}

// Get transition progress (0-1)
const progress = backgrounds.getTransitionProgress();
console.log(`Transition ${Math.round(progress * 100)}% complete`);
```

### Biome Callbacks

```typescript
const backgrounds = new ParallaxBackgrounds(
  container,
  textures,
  biomeManager,
  width,
  height,
  (newBiome) => {
    // Called when biome changes
    switch (newBiome) {
      case 'forest':
        // Trigger forest-specific effects (dust particles, etc.)
        startForestEffects();
        break;
      case 'cave':
        // Start cave ambience
        startCaveAmbience();
        break;
    }
  }
);
```

## System Flow

```
1. Cloud Repeating
   ├─ Cloud ground segments scroll infinitely
   └─ Cloud sky background tiles infinitely

2. Trigger Transition (user clicks button)
   ├─ grounds.triggerTransition()
   │  ├─ BiomeSequenceManager.startTransition() → sets isTransitioning = true
   │  ├─ Queues: ['transition', 'forest']
   │  └─ Trims off-screen segments
   └─ backgrounds.triggerTransition()
      └─ Creates transition visual sprites

3. Transition Phase
   ├─ Ground segments: cloud → transition → forest
   ├─ Background: cloud → transition sprite → forest sprite
   └─ Scroll speed increases (TRANSITION_SPEED_MULTIPLIER)

4. Transition Complete Detection
   ├─ SegmentScroller detects no 'transition' segments visible
   ├─ Calls biomeManager.completeTransition()
   │  └─ Updates currentIndex, sets isTransitioning = false
   └─ Rebuilds all segments with 'forest' (clean state)

5. Forest Repeating
   ├─ Forest ground segments scroll infinitely
   └─ Forest background tiles infinitely
```

## Performance Notes

- **Segment Reuse**: Segments are destroyed off-screen and created on-screen (no pooling yet)
- **TilingSprite**: Used for backgrounds for efficient infinite scrolling
- **Rebuilding**: Full rebuild happens only on transition completion and resize
- **Memory**: Old segments are properly destroyed to prevent leaks

## Migration from Old System

### Old Code
```typescript
backgrounds.triggerForestTransition();
grounds.triggerForestTransition();
```

### New Code
```typescript
const biomeManager = new BiomeSequenceManager('cloud');
biomeManager.setSequence(['cloud', 'forest']);

// Pass biomeManager to constructors
const grounds = new ParallaxGrounds(container, textures, biomeManager, width, height);
const backgrounds = new ParallaxBackgrounds(container, textures, biomeManager, width, height);

// Trigger
grounds.triggerTransition();
backgrounds.triggerTransition();
```

## Future Enhancements

1. **Transition Textures**: Dynamic transition textures based on biome pairs
2. **Vertical Transitions**: Support for vertical scrolling biomes
3. **Segment Pooling**: Reuse sprite objects instead of destroy/create
4. **Multi-layer Parallax**: Add middle-ground layers
5. **Biome Events**: onEnter, onExit hooks for each biome
6. **Reverse Transitions**: Support scrolling backwards through biomes

## Testing

Test the system at: **http://localhost:5173/jumpgl/**

1. Watch cloud ground repeat infinitely
2. Click "Enter Forest" button
3. Observe smooth transition (no cloud flash!)
4. Watch forest ground repeat infinitely
5. Try resizing window during transition (should preserve state)

## Troubleshooting

**Q: Cloud ground flashes after transition**
A: Check that you're using `parallaxNew.ts` and `BiomeSequenceManager`. The old `parallax.ts` has the bug.

**Q: Transition doesn't start**
A: Ensure biome sequence has more than one biome. Check `biomeManager.getNextBiome()` returns non-null.

**Q: Wrong biome appears**
A: Verify texture mapping in `segmentTextures` matches biome IDs.

**Q: Performance issues**
A: Check that segments are being destroyed properly. Use browser DevTools to monitor sprite count.
