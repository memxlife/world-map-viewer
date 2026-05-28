import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const manifestPath = "./viewer_manifest.json";
const defaultBenchmarkPath = "/research-problems/anchor_point_capture/benchmarks/synthetic_two_cube_six_orbit_cross_lines_smooth_dense_horizontal_plus_vertical";
const defaultDataPath = "/research-problems/poisson_surface_reconstruction/generated/reports/oracle_normals_anchor_capture/poisson_oracle_normals_viewer_world_map.json";

const els = {
  viewport: document.getElementById("viewport"),
  canvas: document.getElementById("scene"),
  benchmarkStatus: document.getElementById("benchmarkStatus"),
  resultStatus: document.getElementById("resultStatus"),
  benchmarkPreset: document.getElementById("benchmarkPreset"),
  benchmarkPath: document.getElementById("benchmarkPath"),
  resultPreset: document.getElementById("resultPreset"),
  dataPath: document.getElementById("dataPath"),
  loadBenchmarkBtn: document.getElementById("loadBenchmarkBtn"),
  loadResultBtn: document.getElementById("loadResultBtn"),
  resetBtn: document.getElementById("resetBtn"),
  benchmarkFrameSlider: document.getElementById("benchmarkFrameSlider"),
  benchmarkFrameLabel: document.getElementById("benchmarkFrameLabel"),
  resultFrameSlider: document.getElementById("resultFrameSlider"),
  resultFrameLabel: document.getElementById("resultFrameLabel"),
  cameraImage: document.getElementById("cameraImage"),
  cameraCaption: document.getElementById("cameraCaption"),
  pointSize: document.getElementById("pointSize"),
  pointSizeLabel: document.getElementById("pointSizeLabel"),
  colorMode: document.getElementById("colorMode"),
  boundarySource: document.getElementById("boundarySource"),
  showAnchors: document.getElementById("showAnchors"),
  showMeshes: document.getElementById("showMeshes"),
  showTrajectory: document.getElementById("showTrajectory"),
  showAxes: document.getElementById("showAxes"),
  showGrowthLinks: document.getElementById("showGrowthLinks"),
  showSameSurface: document.getElementById("showSameSurface"),
  showBoundaries: document.getElementById("showBoundaries"),
  showNormals: document.getElementById("showNormals"),
  metricVoxels: document.getElementById("metricVoxels"),
  metricResultFrames: document.getElementById("metricResultFrames"),
  metricAnchors: document.getElementById("metricAnchors"),
  metricGrown: document.getElementById("metricGrown"),
  metricCoverage: document.getElementById("metricCoverage"),
  metricVisible: document.getElementById("metricVisible"),
  metricOccluded: document.getElementById("metricOccluded"),
  legend: document.getElementById("legend"),
};

const facePalette = new Map([
  [2, [214, 46, 46, "left / x-"]],
  [3, [36, 107, 219, "right / x+"]],
  [4, [92, 72, 46, "bottom / y-"]],
  [5, [61, 179, 77, "top / y+"]],
  [6, [224, 168, 46, "front / z-"]],
  [7, [179, 71, 209, "back / z+"]],
  [10, [220, 55, 48, "object 10"]],
  [20, [36, 112, 220, "object 20"]],
  [97, [245, 185, 45, "missed GT boundary"]],
  [98, [30, 170, 85, "correct boundary"]],
  [99, [10, 15, 25, "boundary"]],
]);

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf7f8fb);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(1.8, 1.3, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.AmbientLight(0xffffff, 1.0));

const axes = new THREE.AxesHelper(0.6);
scene.add(axes);

let benchmark = null;
let worldMap = null;
let pointsMesh = null;
let trajectory = null;
let hypothesisGroup = null;
let center = new THREE.Vector3();
let radius = 1;

function params() {
  return new URLSearchParams(window.location.search);
}

function urlBenchmarkPath() {
  return params().get("benchmark") || defaultBenchmarkPath;
}

function urlDataPath() {
  return params().get("data") || defaultDataPath;
}

function setBenchmarkStatus(text) {
  els.benchmarkStatus.textContent = text;
}

function setResultStatus(text) {
  els.resultStatus.textContent = text;
}

function resize() {
  const width = els.viewport.clientWidth;
  const height = els.viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function cleanPath(path) {
  return String(path || "").replace(/\/+$/, "");
}

function pathName(path) {
  return cleanPath(path).split("/").filter(Boolean).at(-1) || path;
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
  } else {
    select.value = "__custom__";
  }
}

function populateSelect(select, entries, customText) {
  select.innerHTML = "";
  entries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.path;
    option.textContent = entry.name;
    select.append(option);
  });
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = customText;
  select.append(custom);
}

async function loadManifest() {
  try {
    const response = await fetch(manifestPath);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    populateSelect(els.benchmarkPreset, manifest.benchmarks || [], "custom benchmark directory");
    populateSelect(els.resultPreset, manifest.results || [], "custom result JSON");
  } catch {
    populateSelect(els.benchmarkPreset, [{ name: "anchor capture cross-line benchmark", path: defaultBenchmarkPath }], "custom benchmark directory");
    populateSelect(els.resultPreset, [{ name: "Poisson reconstruction with oracle normals", path: defaultDataPath }], "custom result JSON");
  }
  setSelectValue(els.benchmarkPreset, els.benchmarkPath.value);
  setSelectValue(els.resultPreset, els.dataPath.value);
}

function parseImageIndex(relPath, fallback) {
  const match = relPath.match(/(\d+)(?=\.[a-z]+$)/i);
  return match ? Number(match[1]) : fallback;
}

function benchmarkRgbPath(frame) {
  return `${benchmark.path}/${frame.rgbRelPath}`;
}

async function loadBenchmark(path) {
  const root = cleanPath(path);
  setBenchmarkStatus("Loading benchmark frames...");
  const response = await fetch(`${root}/rgb.txt`);
  if (!response.ok) throw new Error(`Benchmark rgb.txt not found: ${root}`);
  const text = await response.text();
  const frames = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const [timestampText, rgbRelPath] = line.split(/\s+/);
      const frame = parseImageIndex(rgbRelPath, index);
      return {
        index,
        frame,
        timestamp: Number(timestampText),
        rgbRelPath,
      };
    });
  if (!frames.length) throw new Error(`No RGB frames found in ${root}/rgb.txt`);
  benchmark = {
    path: root,
    name: pathName(root),
    frames,
    frameByNumber: new Map(frames.map((frame) => [frame.frame, frame])),
  };
  els.benchmarkFrameSlider.min = 0;
  els.benchmarkFrameSlider.max = Math.max(frames.length - 1, 0);
  els.benchmarkFrameSlider.value = "0";
  updateCameraView();
  updateUrl();
  setBenchmarkStatus(`${frames.length.toLocaleString()} frames from ${benchmark.name}`);
}

async function loadWorldMap(path) {
  setResultStatus("Loading reconstruction result...");
  const response = await fetch(path);
  if (!response.ok) throw new Error(`World map not found: ${path}`);
  const data = await response.json();
  if (!Array.isArray(data.voxels) || !Array.isArray(data.frames)) {
    throw new Error("Invalid world_map.json schema");
  }
  worldMap = data;
  setResultTimelineToEnd();
  updateBoundarySourceOptions();
  updateLayerControls();
  buildLegend();
  rebuildPoints();
  fitView();
  updateUrl();
  setResultStatus(`${worldMap.voxels.length.toLocaleString()} result voxels, ${worldMap.frames.length} result frames`);
}

function resultFrames() {
  return worldMap?.frames?.length ? worldMap.frames : [];
}

function resultTimelineLength() {
  return resultFrames().length;
}

function selectedBenchmarkFrameIndex() {
  return Number(els.benchmarkFrameSlider.value);
}

function selectedResultFrameIndex() {
  return Number(els.resultFrameSlider.value);
}

function selectedResultRow() {
  return resultFrames()[selectedResultFrameIndex()] || null;
}

function selectedFrame() {
  const row = selectedResultRow();
  return row?.frame ?? 0;
}

function setResultTimelineToEnd() {
  const count = resultTimelineLength();
  els.resultFrameSlider.min = 0;
  els.resultFrameSlider.max = Math.max(count - 1, 0);
  els.resultFrameSlider.value = String(Math.max(count - 1, 0));
}

function setResultFrameIndex(index) {
  const count = resultTimelineLength();
  if (!count) return;
  const clamped = Math.max(0, Math.min(count - 1, index));
  if (Number(els.resultFrameSlider.value) === clamped) return;
  els.resultFrameSlider.value = String(clamped);
  rebuildPoints();
}

function stepResultFrame(delta) {
  setResultFrameIndex(selectedResultFrameIndex() + delta);
}

function setBenchmarkFrameIndex(index) {
  const count = benchmark?.frames?.length || 0;
  if (!count) return;
  const clamped = Math.max(0, Math.min(count - 1, index));
  if (Number(els.benchmarkFrameSlider.value) === clamped) return;
  els.benchmarkFrameSlider.value = String(clamped);
  updateCameraView();
}

function stepBenchmarkFrame(delta) {
  setBenchmarkFrameIndex(selectedBenchmarkFrameIndex() + delta);
}

function rgbToFloat(rgb) {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

function firstSeenColor(frame, minFrame, maxFrame) {
  const t = (frame - minFrame) / Math.max(maxFrame - minFrame, 1);
  const color = new THREE.Color();
  color.setHSL(0.66 - 0.66 * t, 0.82, 0.52);
  return [color.r, color.g, color.b];
}

function faceColor(objectId) {
  const entry = facePalette.get(objectId);
  if (entry) return [entry[0] / 255, entry[1] / 255, entry[2] / 255];
  const color = new THREE.Color();
  const hue = ((objectId * 0.61803398875) % 1 + 1) % 1;
  color.setHSL(hue, 0.82, 0.48);
  return [color.r, color.g, color.b];
}

function kindColor(kind) {
  if (kind === "grown" || kind === "surface") return [0.05, 0.72, 0.82];
  if (kind === "mixed") return [0.62, 0.30, 0.92];
  if (kind === "boundary") return [0.02, 0.02, 0.02];
  if (kind === "oracle_boundary") return [0.16, 0.82, 0.35];
  if (kind === "algorithm_boundary") return [1.0, 0.31, 0.16];
  return [0.94, 0.42, 0.10];
}

function isBoundaryVoxel(voxel) {
  if (Boolean(voxel.boundary_marker) || voxel.kind === "boundary" || voxel.object_id === 99) return true;
  if (typeof voxel.kind === "string" && voxel.kind.includes("boundary") && voxel.kind !== "surface_anchor") return true;
  if (typeof voxel.diagnostic_layer === "string" && voxel.diagnostic_layer.includes("boundary")) return true;
  return ["boundary", "oracle_boundary", "algorithm_boundary"].includes(voxel.boundary_prediction);
}

function boundarySourceId(voxel) {
  if (!isBoundaryVoxel(voxel)) return "";
  return voxel.diagnostic_layer || voxel.kind || voxel.boundary_prediction || "boundary";
}

function boundarySourceLabel(id) {
  const legend = worldMap?.viewer_legend || {};
  const entry = legend[id];
  if (entry?.label) return entry.label;
  if (entry?.meaning) return entry.meaning;
  return id
    .replace(/_/g, " ")
    .replace(/\brgb\b/gi, "RGB")
    .replace(/\bgt\b/gi, "GT");
}

function updateBoundarySourceOptions() {
  const current = els.boundarySource.value || params().get("boundary") || "all";
  const sources = [...new Set((worldMap?.voxels || []).map(boundarySourceId).filter(Boolean))].sort();
  els.boundarySource.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All boundary results";
  els.boundarySource.append(all);
  sources.forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = boundarySourceLabel(id);
    els.boundarySource.append(option);
  });
  els.boundarySource.disabled = sources.length <= 1;
  els.boundarySource.value = sources.includes(current) ? current : "all";
}

function applyLegacyPointMode(mode) {
  if (mode === "anchors") {
    els.showAnchors.checked = true;
    els.showMeshes.checked = false;
    els.showBoundaries.checked = false;
    return;
  }
  if (mode === "meshes") {
    els.showAnchors.checked = false;
    els.showMeshes.checked = true;
    els.showBoundaries.checked = false;
    return;
  }
  if (mode === "boundaries") {
    els.showAnchors.checked = false;
    els.showMeshes.checked = false;
    els.showBoundaries.checked = true;
    return;
  }
  if (mode === "both") {
    els.showAnchors.checked = true;
    els.showMeshes.checked = true;
  }
}

function updateLayerControls() {
  const hasMeshes = Boolean(worldMap?.meshes?.length);
  const hasBoundaryVoxels = Boolean(worldMap?.voxels?.some(isBoundaryVoxel));
  const hasBoundarySegments = Boolean(worldMap?.boundary_segments?.length || worldMap?.hypotheses?.some((h) => h.type === "boundary"));
  const hasNormals = hasEstimatedNormals();
  els.showMeshes.disabled = !hasMeshes;
  els.showBoundaries.disabled = !hasBoundaryVoxels && !hasBoundarySegments;
  els.showNormals.disabled = !hasNormals;
  if (!hasMeshes) els.showMeshes.checked = false;
  if (!hasBoundaryVoxels && !hasBoundarySegments) els.showBoundaries.checked = false;
  if (!hasNormals) els.showNormals.checked = false;
}

function showMeshLayer() {
  return Boolean(worldMap?.meshes?.length) && els.showMeshes.checked;
}

function hasEstimatedNormals() {
  return Boolean(
    worldMap?.voxels?.some(
      (voxel) =>
        voxel.normal_status === "pass" &&
        Array.isArray(voxel.normal) &&
        voxel.normal.length >= 3 &&
        Array.isArray(voxel.world) &&
        voxel.world.length >= 3
    )
  );
}

function visibleVoxelsAtFrame(frame) {
  if (!worldMap?.voxels?.length) return [];
  const source = els.boundarySource.value;
  return worldMap.voxels.filter((voxel) => {
    if (voxel.first_seen > frame) return false;
    if (voxel.kind === "poisson_mesh_vertex") return false;
    const isBoundary = isBoundaryVoxel(voxel);
    if (!isBoundary && !els.showAnchors.checked) return false;
    if (isBoundary && !els.showBoundaries.checked) return false;
    if (isBoundary && source !== "all" && boundarySourceId(voxel) !== source) return false;
    return true;
  });
}

function surfaceVisibleAtFrame(surface, frame) {
  return (surface.first_seen ?? 0) <= frame;
}

function surfaceById() {
  const source = Array.isArray(worldMap?.surfaces) ? worldMap.surfaces : [];
  return new Map(source.map((surface) => [surface.id, surface]));
}

function clearPoints() {
  if (!pointsMesh) return;
  scene.remove(pointsMesh);
  pointsMesh.geometry.dispose();
  pointsMesh.material.dispose();
  pointsMesh = null;
}

function rebuildPoints() {
  clearPoints();
  if (!worldMap) {
    updateMetrics(0);
    updateCameraView();
    return;
  }

  const frame = selectedFrame();
  const voxels = visibleVoxelsAtFrame(frame);
  const positions = new Float32Array(voxels.length * 3);
  const colors = new Float32Array(voxels.length * 3);
  const frames = resultFrames();
  const minFrame = frames[0]?.frame ?? 0;
  const maxFrame = frames.at(-1)?.frame ?? 1;

  voxels.forEach((voxel, index) => {
    positions[index * 3 + 0] = voxel.world[0];
    positions[index * 3 + 1] = voxel.world[1];
    positions[index * 3 + 2] = voxel.world[2];

    let color;
    if (els.colorMode.value === "face") {
      color = faceColor(voxel.object_id);
    } else if (els.colorMode.value === "kind") {
      color = kindColor(voxel.kind || voxel.status);
    } else if (els.colorMode.value === "firstSeen") {
      color = firstSeenColor(voxel.first_seen, minFrame, maxFrame);
    } else {
      color = rgbToFloat(voxel.color);
    }
    colors[index * 3 + 0] = color[0];
    colors[index * 3 + 1] = color[1];
    colors[index * 3 + 2] = color[2];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  pointsMesh = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: Number(els.pointSize.value),
      vertexColors: true,
      sizeAttenuation: true,
    })
  );
  scene.add(pointsMesh);
  updateMetrics(voxels.length);
  updateCameraView();
  buildTrajectory();
  buildHypotheses();
}

function buildTrajectory() {
  if (trajectory) {
    scene.remove(trajectory);
    trajectory.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  trajectory = new THREE.Group();
  if (!worldMap?.camera_path?.length) {
    scene.add(trajectory);
    return;
  }
  const pts = worldMap.camera_path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const currentIndex = selectedResultFrameIndex();
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x111827, linewidth: 2 })
  );
  trajectory.add(line);
  pts.forEach((point, index) => {
    const isCurrent = index === currentIndex;
    const isPast = index < currentIndex;
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(isCurrent ? 0.04 : 0.025, isCurrent ? 0.075 : 0.055, 3),
      new THREE.MeshBasicMaterial({ color: isCurrent ? 0xef4444 : isPast ? 0x111827 : 0x9aa4b2 })
    );
    marker.position.copy(point);
    marker.rotation.x = Math.PI * 0.5;
    trajectory.add(marker);
  });
  scene.add(trajectory);
  trajectory.visible = els.showTrajectory.checked;
}

function buildHypotheses() {
  if (hypothesisGroup) {
    scene.remove(hypothesisGroup);
    hypothesisGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  hypothesisGroup = new THREE.Group();
  const hasSurfaceHypotheses = worldMap?.hypotheses?.length && worldMap?.surfaces?.length;
  const hasBoundarySegments = worldMap?.boundary_segments?.length;
  const hasGrowthLinks = worldMap?.growth_links?.length;
  const hasMeshes = worldMap?.meshes?.length;
  const hasNormals = hasEstimatedNormals();
  if (!hasSurfaceHypotheses && !hasBoundarySegments && !hasGrowthLinks && !hasMeshes && !hasNormals) {
    scene.add(hypothesisGroup);
    return;
  }
  const frame = selectedFrame();
  const byId = surfaceById();
  if (hasNormals && els.showNormals.checked) {
    const positions = [];
    const normalLength = Number(params().get("normalLength") || 0.055);
    worldMap.voxels.forEach((voxel) => {
      if ((voxel.first_seen ?? 0) > frame) return;
      if (voxel.normal_status !== "pass") return;
      if (!Array.isArray(voxel.world) || !Array.isArray(voxel.normal)) return;
      const start = voxel.world;
      const normal = voxel.normal;
      if (start.length < 3 || normal.length < 3) return;
      const end = [
        start[0] + normal[0] * normalLength,
        start[1] + normal[1] * normalLength,
        start[2] + normal[2] * normalLength,
      ];
      positions.push(...start, ...end);
    });
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      hypothesisGroup.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.88 })
        )
      );
    }
  }
  if (hasMeshes && showMeshLayer()) {
    worldMap.meshes.forEach((mesh) => {
      if ((mesh.first_seen ?? 0) > frame) return;
      if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) return;
      const positions = new Float32Array(mesh.vertices.flat());
      const indices = new Uint32Array(mesh.faces.flat());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      const color = rgbToFloat(mesh.color || [80, 190, 255]);
      hypothesisGroup.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(color[0], color[1], color[2]),
            transparent: true,
            opacity: mesh.opacity ?? 0.38,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        )
      );
    });
  }
  if (hasGrowthLinks && els.showGrowthLinks.checked) {
    const positions = [];
    worldMap.growth_links.forEach((link) => {
      if ((link.first_seen ?? 0) > frame) return;
      positions.push(...link.a, ...link.b);
    });
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      hypothesisGroup.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: 0x0891b2, transparent: true, opacity: 0.55 })
        )
      );
    }
  }
  if (hasBoundarySegments && els.showBoundaries.checked) {
    const positions = [];
    worldMap.boundary_segments.forEach((segment) => {
      if ((segment.first_seen ?? 0) > frame) return;
      positions.push(...segment.a, ...segment.b);
    });
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      hypothesisGroup.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.9 })
        )
      );
    }
  }
  [
    { enabled: els.showSameSurface.checked, type: "same_surface", color: 0x16a34a, opacity: 0.72 },
    { enabled: els.showBoundaries.checked, type: "boundary", color: 0x050505, opacity: 0.82 },
  ].forEach((spec) => {
    if (!spec.enabled || !hasSurfaceHypotheses) return;
    const positions = [];
    worldMap.hypotheses
      .filter((hypothesis) => hypothesis.type === spec.type)
      .forEach((hypothesis) => {
        const a = byId.get(hypothesis.a);
        const b = byId.get(hypothesis.b);
        if (!a || !b || !surfaceVisibleAtFrame(a, frame) || !surfaceVisibleAtFrame(b, frame)) return;
        positions.push(...a.center, ...b.center);
      });
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    hypothesisGroup.add(
      new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity })
      )
    );
  });
  scene.add(hypothesisGroup);
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function robustVoxelBox(voxels) {
  const points = voxels
    .map((voxel) => voxel.world)
    .filter((world) => Array.isArray(world) && world.length >= 3 && world.every(Number.isFinite));
  if (!points.length) return null;
  if (points.length < 40) {
    const box = new THREE.Box3();
    points.forEach((p) => box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2])));
    return box;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  return new THREE.Box3(
    new THREE.Vector3(percentile(xs, 0.04), percentile(ys, 0.04), percentile(zs, 0.04)),
    new THREE.Vector3(percentile(xs, 0.96), percentile(ys, 0.96), percentile(zs, 0.96))
  );
}

function fitView() {
  if (!worldMap?.voxels?.length) return;
  const frame = selectedFrame();
  const voxels = visibleVoxelsAtFrame(frame);
  const box = robustVoxelBox(voxels.length ? voxels : worldMap.voxels);
  if (!box) return;
  center = box.getCenter(new THREE.Vector3());
  radius = Math.max(box.getSize(new THREE.Vector3()).length(), 0.28);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 0.85, radius * 0.62, radius * 0.95));
  camera.near = Math.max(radius / 300, 0.002);
  camera.far = Math.max(radius * 80, 20);
  camera.updateProjectionMatrix();
  controls.update();
}

function updateMetrics(voxelCount) {
  const row = selectedResultRow();
  const frame = selectedFrame();
  const visibleVoxels = visibleVoxelsAtFrame(frame);
  const anchorCount = visibleVoxels.filter((voxel) => !isBoundaryVoxel(voxel) && (voxel.kind || "anchor") === "anchor").length;
  const grownCount = visibleVoxels.filter((voxel) => ["grown", "surface", "mixed"].includes(voxel.kind)).length;
  els.resultFrameLabel.textContent = row ? `${row.frame}` : "-";
  els.metricVoxels.textContent = voxelCount.toLocaleString();
  els.metricResultFrames.textContent = worldMap?.frames?.length?.toLocaleString() || "-";
  els.metricAnchors.textContent = anchorCount.toLocaleString();
  els.metricGrown.textContent = grownCount.toLocaleString();
  els.metricCoverage.textContent = row?.coverage != null ? row.coverage.toFixed(3) : "-";
  els.metricVisible.textContent = row?.visible != null ? row.visible.toLocaleString() : "-";
  els.metricOccluded.textContent = row?.occluded != null ? row.occluded.toLocaleString() : "-";
  els.pointSizeLabel.textContent = Number(els.pointSize.value).toFixed(3);
}

function updateCameraView() {
  const benchFrame = benchmark?.frames?.[selectedBenchmarkFrameIndex()] || null;
  if (benchFrame) {
    els.cameraImage.src = benchmarkRgbPath(benchFrame);
    els.benchmarkFrameLabel.textContent = `${benchFrame.frame}`;
    els.cameraCaption.textContent = `${benchmark.name}, frame ${benchFrame.frame}`;
    return;
  }
  els.cameraImage.removeAttribute("src");
  els.benchmarkFrameLabel.textContent = "-";
  els.cameraCaption.textContent = "no frame image";
}

function buildLegend() {
  els.legend.innerHTML = "";
  if (!worldMap?.voxels?.length) return;
  if (worldMap.viewer_legend && els.colorMode.value === "rgb") {
    Object.entries(worldMap.viewer_legend).forEach(([id, entry]) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      const rgb = entry.color || [180, 180, 180];
      swatch.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      const label = document.createElement("span");
      label.textContent = `${boundarySourceLabel(id)}`;
      row.append(swatch, label);
      els.legend.append(row);
    });
    return;
  }
  if (els.colorMode.value === "kind") {
    [
      ["anchor", kindColor("anchor"), "sparse verified anchor"],
      ["grown", kindColor("grown"), "grown/surface point"],
      ["mixed", kindColor("mixed"), "merged anchor/grown evidence"],
    ].forEach(([id, color, text]) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
      const label = document.createElement("span");
      label.textContent = `${id}: ${text}`;
      row.append(swatch, label);
      els.legend.append(row);
    });
    return;
  }
  const ids = [...new Set(worldMap.voxels.map((voxel) => voxel.object_id))].sort((a, b) => a - b);
  ids.forEach((id) => {
    const entry = facePalette.get(id);
    const row = document.createElement("div");
    row.className = "legend-row";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    const rgb = entry ? entry.slice(0, 3) : faceColor(id).map((channel) => Math.round(channel * 255));
    swatch.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    const label = document.createElement("span");
    label.textContent = `${id}: ${entry ? entry[3] : "object/surface"}`;
    row.append(swatch, label);
    els.legend.append(row);
  });
}

function updateUrl() {
  const next = new URL(window.location.href);
  next.searchParams.set("benchmark", els.benchmarkPath.value);
  next.searchParams.set("data", els.dataPath.value);
  next.searchParams.set("color", els.colorMode.value);
  next.searchParams.delete("points");
  next.searchParams.set("anchors", els.showAnchors.checked ? "1" : "0");
  next.searchParams.set("meshes", els.showMeshes.checked ? "1" : "0");
  next.searchParams.set("boundaryPoints", els.showBoundaries.checked ? "1" : "0");
  next.searchParams.set("boundary", els.boundarySource.value);
  if (els.showNormals.checked) next.searchParams.set("normals", "1");
  else next.searchParams.delete("normals");
  window.history.replaceState({}, "", next);
}

async function loadAll() {
  try {
    const benchmarkPath = els.benchmarkPath.value.trim();
    const dataPath = els.dataPath.value.trim();
    await Promise.all([loadBenchmark(benchmarkPath), loadWorldMap(dataPath)]);
  } catch (error) {
    setBenchmarkStatus(error.message);
    setResultStatus(error.message);
  }
}

async function loadBenchmarkFromInput() {
  try {
    await loadBenchmark(els.benchmarkPath.value.trim());
  } catch (error) {
    setBenchmarkStatus(error.message);
  }
}

async function loadResultFromInput() {
  try {
    await loadWorldMap(els.dataPath.value.trim());
  } catch (error) {
    setResultStatus(error.message);
  }
}

function animate() {
  resize();
  controls.update();
  axes.visible = els.showAxes.checked;
  if (trajectory) trajectory.visible = els.showTrajectory.checked;
  if (hypothesisGroup) {
    hypothesisGroup.visible =
      els.showGrowthLinks.checked ||
      els.showSameSurface.checked ||
      els.showBoundaries.checked ||
      els.showNormals.checked ||
      showMeshLayer();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

els.benchmarkPath.value = urlBenchmarkPath();
els.dataPath.value = urlDataPath();
if (params().get("color")) els.colorMode.value = params().get("color");
if (params().get("points")) applyLegacyPointMode(params().get("points"));
if (params().get("anchors")) els.showAnchors.checked = params().get("anchors") === "1";
if (params().get("meshes")) els.showMeshes.checked = params().get("meshes") === "1";
if (params().get("boundaryPoints")) els.showBoundaries.checked = params().get("boundaryPoints") === "1";
if (params().get("boundary")) els.boundarySource.value = params().get("boundary");
if (params().get("normals") === "1") els.showNormals.checked = true;

els.benchmarkPreset.addEventListener("change", () => {
  if (els.benchmarkPreset.value !== "__custom__") els.benchmarkPath.value = els.benchmarkPreset.value;
});
els.resultPreset.addEventListener("change", () => {
  if (els.resultPreset.value !== "__custom__") els.dataPath.value = els.resultPreset.value;
});
els.benchmarkPath.addEventListener("input", () => setSelectValue(els.benchmarkPreset, els.benchmarkPath.value));
els.dataPath.addEventListener("input", () => setSelectValue(els.resultPreset, els.dataPath.value));
els.loadBenchmarkBtn.addEventListener("click", loadBenchmarkFromInput);
els.loadResultBtn.addEventListener("click", loadResultFromInput);
els.resetBtn.addEventListener("click", fitView);
els.benchmarkFrameSlider.addEventListener("input", updateCameraView);
els.resultFrameSlider.addEventListener("input", rebuildPoints);
els.pointSize.addEventListener("input", rebuildPoints);
els.colorMode.addEventListener("change", () => {
  buildLegend();
  rebuildPoints();
  updateUrl();
});
els.showAnchors.addEventListener("change", () => {
  rebuildPoints();
  updateUrl();
});
els.showMeshes.addEventListener("change", () => {
  buildHypotheses();
  updateUrl();
});
els.boundarySource.addEventListener("change", () => {
  rebuildPoints();
  updateUrl();
});
els.showTrajectory.addEventListener("change", () => {
  if (trajectory) trajectory.visible = els.showTrajectory.checked;
});
els.showGrowthLinks.addEventListener("change", buildHypotheses);
els.showSameSurface.addEventListener("change", buildHypotheses);
els.showBoundaries.addEventListener("change", () => {
  rebuildPoints();
  updateUrl();
});
els.showNormals.addEventListener("change", () => {
  buildHypotheses();
  updateUrl();
});
els.viewport.addEventListener(
  "wheel",
  (event) => {
    if (!resultTimelineLength()) return;
    event.preventDefault();
    stepResultFrame(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false }
);
els.cameraImage.addEventListener(
  "wheel",
  (event) => {
    if (!benchmark?.frames?.length) return;
    event.preventDefault();
    stepBenchmarkFrame(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false }
);
window.addEventListener("keydown", (event) => {
  if (event.target && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
  if (event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowDown")) stepBenchmarkFrame(1);
  else if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowUp")) stepBenchmarkFrame(-1);
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") stepResultFrame(1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") stepResultFrame(-1);
});
window.addEventListener("resize", resize);

resize();
animate();
await loadManifest();
loadAll();
