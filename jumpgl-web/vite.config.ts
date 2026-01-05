import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const useAnimatedSky = env.VITE_USE_ANIMATED_SKY === 'true';

  return {
    base: '/jumpgl/',
    plugins: [
      {
        name: 'strip-animated-sky',
        apply: 'build',
        closeBundle() {
          if (useAnimatedSky) return;
          const skyDir = path.resolve(process.cwd(), 'dist', 'skyAnimate');
          if (existsSync(skyDir)) {
            rmSync(skyDir, { recursive: true, force: true });
          }
        },
      },
    ],
  };
});
