import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "../../../../..");

export default defineConfig({
  root: repoRoot,
  server: {
    host: "127.0.0.1",
    port: 8830,
    strictPort: false,
  },
});
