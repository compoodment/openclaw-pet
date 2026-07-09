import { mkdir, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
if (process.platform !== "darwin") process.exit(0);
const target = resolve("dist/pet-overlay");
await mkdir(dirname(target), { recursive: true });
await promisify(execFile)("swiftc", [resolve("overlay/pet-overlay.swift"), "-framework", "AppKit", "-framework", "WebKit", "-o", target]);
await chmod(target, 0o755);
