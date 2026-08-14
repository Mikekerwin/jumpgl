import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const useAnimatedSky = env.VITE_USE_ANIMATED_SKY === 'true';

  return {
    base: '/jumpgl/',
    build: {
      rollupOptions: {
        input: {
          game: path.resolve(process.cwd(), 'index.html'),
          forestSandbox: path.resolve(process.cwd(), 'forest-sandbox.html'),
          attachmentProof: path.resolve(process.cwd(), 'attachment-proof.html'),
          treeBuilder: path.resolve(process.cwd(), 'tree-builder.html'),
          backgroundTreeBuilder: path.resolve(process.cwd(), 'background-tree-builder.html'),
        },
      },
    },
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
      {
        name: 'publish-forest-route',
        apply: 'build',
        closeBundle() {
          const distDir = path.resolve(process.cwd(), 'dist');
          const sandboxEntry = path.join(distDir, 'forest-sandbox.html');
          const forestDir = path.join(distDir, 'forest');
          if (!existsSync(sandboxEntry)) return;
          mkdirSync(forestDir, { recursive: true });
          copyFileSync(sandboxEntry, path.join(forestDir, 'index.html'));
        },
      },
    ],
  };
});
