import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { PetSnapshot } from "./pet-controller.js";

let server: Server | undefined;
let overlay: ChildProcess | undefined;
export async function startOverlay(params: { stateDir: string; assetDir: string; size: number; corner: string; getSnapshot: () => PetSnapshot; logger: { warn: (message: string) => void } }) {
  if (server) return;
  if (process.platform !== "darwin") { params.logger.warn("OpenClaw Pet desktop overlay is currently supported on macOS only."); return; }
  server = createServer((req, res) => {
    const path = req.url?.split("?")[0];
    if (path === "/state") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(params.getSnapshot())); return; }
    if (path === "/spritesheet.webp") { const file = join(params.assetDir, "spritesheet.webp"); if (!existsSync(file)) { res.writeHead(404).end(); return; } res.writeHead(200, { "content-type": "image/webp" }); res.end(readFileSync(file)); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") return;
  const helper = join(dirname(new URL(import.meta.url).pathname), "pet-overlay");
  if (!existsSync(helper)) { params.logger.warn("OpenClaw Pet overlay helper is missing; run npm run build:overlay on macOS."); return; }
  overlay = spawn(helper, [String(address.port), String(params.size), params.corner], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  overlay.stderr?.on("data", (chunk: Buffer) => params.logger.warn(`OpenClaw Pet overlay: ${chunk.toString().trim()}`));
  overlay.on("error", (error) => params.logger.warn(`OpenClaw Pet overlay failed to launch: ${error.message}`));
  overlay.on("exit", (code) => { if (code && code !== 0) params.logger.warn(`OpenClaw Pet overlay exited with code ${code}.`); });
  overlay.unref();
}
export async function stopOverlay() { overlay?.kill(); overlay = undefined; await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve()); server = undefined; }
