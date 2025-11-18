# JumpGL

New WebGL-first playground for porting the Jump mechanics to PixiJS.

## Getting Started

```bash
cd jumpgl-web
npm install
npm run dev
```

Open the dev server (default http://localhost:5173) and you should see a Pixi "JumpGL" splash with animated stars.

### Deploy to GitHub Pages

The project publishes to https://mikekerwin.github.io/jumpgl via GitHub Pages. To push a new build:

```bash
cd jumpgl-web
npm run deploy
```

This runs `npm run build` with the correct Vite base path (`/jumpgl/`) and pushes the contents of `dist/` to the `gh-pages` branch.

## Planned Systems

- [ ] Input + player physics parity with existing React build
- [ ] Camera + parallax layers (clouds, forest, ground)
- [ ] WebAudio manager for loops / SFX
- [ ] Laser system + scoring overlays
- [ ] Dust/bokeh shader rewritten for Pixi filters
- [ ] Floating platform entities

Use this README as a TODO as you uplift features from the current `geminiTut/my-react-app` project.
