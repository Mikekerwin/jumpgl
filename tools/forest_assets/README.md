# Forest Asset Extraction

This tool creates first-pass transparent forest sprites from the source sheets in
`/Users/OCSAdmin/Desktop/trees`.

The extractor:

- Removes near-white sheet backgrounds with a soft alpha matte.
- Groups connected artwork into individual assets.
- Writes tightly cropped transparent PNGs.
- Generates contact sheets and a source-coordinate manifest for review.
- Copies the source sheets into the project and creates a browser-viewable catalog.

Run:

```sh
python3 -m venv /tmp/jumpgl-forest-assets
/tmp/jumpgl-forest-assets/bin/pip install -r tools/forest_assets/requirements.txt
/tmp/jumpgl-forest-assets/bin/python tools/forest_assets/extract_assets.py \
  --source /Users/OCSAdmin/Desktop/trees \
  --output jumpgl-web/forest-art-workbench
```

`custom.png` requires a separate manual/compositing pass because several useful
assets are embedded in opaque dark-background blocks. The upper scene in
`reference.png` is retained as a composition target rather than treated as a
cutout source.

Review the catalog at:

```text
jumpgl-web/forest-art-workbench/catalog.html
```

The workbench intentionally lives outside `public/` so source sheets and
unoptimized extractions do not inflate production builds. Only approved,
optimized runtime assets should later be copied into `jumpgl-web/public/`.

Prepare the curated WebGL sandbox runtime assets:

```sh
/tmp/jumpgl-forest-assets/bin/python tools/forest_assets/prepare_sandbox_assets.py
```
