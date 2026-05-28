#!/usr/bin/env node
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  host: "127.0.0.1",
  port: 8830,
  root: process.cwd(),
  benchmark: "/research-problems/anchor_point_capture/benchmarks/synthetic_two_cube_six_orbit_cross_lines_smooth_dense_horizontal_plus_vertical",
  data: "/research-problems/poisson_surface_reconstruction/generated/reports/oracle_normals_anchor_capture/poisson_oracle_normals_viewer_world_map.json",
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--host") args.host = argv[++i];
    else if (arg === "--port") args.port = Number(argv[++i]);
    else if (arg === "--root") args.root = path.resolve(argv[++i]);
    else if (arg === "--benchmark") args.benchmark = argv[++i];
    else if (arg === "--data") args.data = argv[++i];
    else if (arg === "--open") args.open = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function help() {
  return `world-map-viewer

Usage:
  world-map-viewer [--root <repo-root>] [--host 127.0.0.1] [--port 8830]
                   [--benchmark <benchmark-dir>] [--data <world_map.json>]

Examples:
  world-map-viewer
  world-map-viewer --root /Users/lishang/work/research/EmbodiedAI --port 8830
`;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function safeJoin(root, requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split("?")[0]);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  return filePath.startsWith(path.resolve(root) + path.sep) || filePath === path.resolve(root) ? filePath : null;
}

function viewerUrl(args) {
  const params = new URLSearchParams({
    benchmark: args.benchmark,
    color: "rgb",
    points: "both",
    data: args.data,
  });
  return `http://${args.host}:${args.port}/?${params.toString()}`;
}

async function sendFile(response, filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath), "Content-Length": info.size });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function createHandler(args) {
  return async (request, response) => {
    const parsed = new URL(request.url, `http://${args.host}:${args.port}`);
    let requestPath = parsed.pathname;
    if (requestPath === "/") requestPath = "/index.html";

    const viewerFile = safeJoin(packageDir, requestPath);
    if (viewerFile && existsSync(viewerFile)) {
      await sendFile(response, viewerFile);
      return;
    }

    const repoFile = safeJoin(args.root, requestPath);
    if (repoFile && existsSync(repoFile)) {
      await sendFile(response, repoFile);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${requestPath}`);
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help());
    process.exit(0);
  }
  const server = createServer(createHandler(args));
  server.listen(args.port, args.host, () => {
    const url = viewerUrl(args);
    console.log(`World Map Viewer serving ${path.resolve(args.root)}`);
    console.log(url);
  });
} catch (error) {
  console.error(error.message);
  console.error(help());
  process.exit(1);
}
