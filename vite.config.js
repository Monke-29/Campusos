import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";

// `npm run dev` = Vite on :5173 + the API server on :3000 (restarts on backend changes).
const api = () => ({
  name: "campusos-api",
  apply: "serve",
  configureServer() {
    const child = spawn(process.execPath, ["--watch", "src/server.js"], { stdio: "inherit" });
    process.on("exit", () => child.kill());
  },
});

const target = "http://localhost:3000";
export default defineConfig({
  root: "web",
  plugins: [react(), api()],
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { proxy: { "/api": target, "/uploads": target, "/mcp": target } },
});
