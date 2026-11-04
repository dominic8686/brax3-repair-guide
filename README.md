# Brax3 interactive teardown and repair guide

A browser-based assembly explorer and an 18-step visual battery-repair draft
for Brax3. Built with Three.js, plain JavaScript and a small Node.js server.
Browser dependencies are vendored; running the site needs no package install.

Public preview: https://e11-teardown.vercel.app/

## Run locally

Requires Node.js 20 or newer.

```sh
git clone https://github.com/dominic8686/brax3-repair-guide.git
cd brax3-repair-guide
npm start
```

Open http://127.0.0.1:4317/ for the assembly explorer or
http://127.0.0.1:4317/guide for the repair guide. The server binds to loopback.
Set `PORT` to use another port.

## Views

- `/`: 112 CAD components with reversible separation, part selection,
  visibility controls, camera presets and photo/CAD appearance modes.
- `/guide`: 18 Brax3-focused draft steps, interactive actions, direction arrows,
  tool images, three camera presets per step, and an original KeyShot-render
  comparison. Link to a step with `/guide?step=10`.
- `/guide-sample`: preserved early one-step reference prototype.
- `/simple`: preserved original model-viewer preview.

The active guide contains no Glyph hardware steps. Its interactive model combines
an E115 CAD chassis with reconstructed glass, carrier, NFC assembly, battery and
fasteners, using artwork from the supplied Brax3 KeyShot package. It is **not a
direct export of the native KeyShot scene or a verified service manual**.
Screw specifications, release points, connector locations, NFC connections and
adhesive procedures still need verification on the actual handset.

The explorer's rear photo projection is a separate appearance approximation that
fades during separation. Downloaded GLB files contain CAD geometry, not baked
animation or the complete browser-rendered appearance.

## Check and build

```sh
npm test
npm run build
```

The check validates guide data, tool assets and removal/reassembly state.
The build writes the public static site to `dist/` using an explicit file list.
The root `vercel.json` configures this output for Vercel, including clean URLs.
The existing public preview was deployed using the Vercel CLI; publishing this
repository does not automatically connect it to that deployment.

## Project layout

- `viewer/`: browser code, local server, vendored libraries and web textures.
- `model/`: two derived GLB files, component metadata and Python conversion scripts.
- `scripts/build.mjs`: static deployment packaging.

The component model contains 419,461 triangles. Six source entries had no
renderable faces; they are listed in `model/e11-components.json`.

The source STEP is not included. To regenerate the meshes from your own copy,
install `cadquery-ocp==8.0.1.1.0` and NumPy, then run:

```sh
python model/export-components.py path/to/000_E115S3_all_asm.stp model/e11-components.glb
```

Raw CAD/KeyShot archives, certification reports, local audit files, credentials,
virtual environments and the separate Open Slate/Wink work are excluded from Git.

## Attribution

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency licenses,
reference-image attribution, and product-asset provenance. A public repository
does not change those assets' existing licenses.
