# World Map Viewer

Static Three.js viewer for inspecting egocentric benchmark camera streams,
point-cloud world maps, mesh overlays, boundary predictions, and estimated
normals.

The benchmark and result are loaded separately:

- Benchmark directory: source egocentric RGB frames, read from `rgb.txt`.
- Result JSON: reconstructed point cloud and surface metadata, read from `world_map.json`.

## Standalone NPM Install

From the repository root:

```bash
npm install -g /Users/lishang/work/research/tools/world-map-viewer
world-map-viewer --root "$PWD"
```

Open the printed URL.

You can also run without a global install:

```bash
node /Users/lishang/work/research/tools/world-map-viewer/bin/world-map-viewer.mjs --root "$PWD"
```

## Static Server Run

From the repository root:

```bash
python -m http.server 8830 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8830/?benchmark=/research-problems/anchor_point_capture/benchmarks/synthetic_two_cube_six_orbit_cross_lines_smooth_dense_horizontal_plus_vertical&data=/research-problems/poisson_surface_reconstruction/generated/reports/oracle_normals_anchor_capture/poisson_oracle_normals_viewer_world_map.json
```

## Local NPM Development

From this tool directory:

```bash
npm install
npm run preview
```

The preview script serves the repository root so `/research-problems/...` paths
resolve the same way as the Python static server.

Open:

```text
http://127.0.0.1:8830/
```

## Controls

- Benchmark preset/path: choose the source frame stream in the left pane.
- Result preset/path: choose the reconstructed world map in the right pane.
- Benchmark frame slider and result frame slider are independent.
- Mouse drag: rotate the 3D map.
- Mouse wheel over the 3D view or egocentric image: step through frames.
- Trackpad/mouse wheel over the slider: scrub frame growth.
- Arrow keys: step frames.
- Color modes: remembered RGB, face/object ID, first-seen time.
- Toggles: camera trajectory and axes.

The current preset lists are stored in `viewer_manifest.json`.
