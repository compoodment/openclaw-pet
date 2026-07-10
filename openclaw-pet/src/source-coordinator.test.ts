import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { toBridgeSnapshot } from "./bridge.js";
import type { PetConfig, PetSnapshot } from "./pet-controller.js";
import { MAX_BRIDGE_RESPONSE_BYTES, resolvePetSources, SourceCoordinator } from "./source-coordinator.js";

const localSnapshot: PetSnapshot = {
  valid: true,
  assetDir: "/assets/local",
  animation: "review",
  changedAt: 100,
  activeRuns: 1,
  activityCount: 1,
  lastEvent: "model-started",
  activityLabel: "Thinking",
  activity: [{ id: 1, label: "Model is thinking", tone: "active", at: 100 }],
  message: "private status",
};

const config: PetConfig = {
  sources: [
    { id: "local", label: "Laptop", assetDir: "/assets/local" },
    {
      id: "remote",
      label: "Server",
      assetDir: "/assets/remote",
      gateway: {
        url: "https://gateway.example.test/api/openclaw-pet/v1/snapshot",
        tokenEnv: "REMOTE_PET_TOKEN",
        pollIntervalMs: 250,
        timeoutMs: 900,
      },
    },
  ],
};

describe("pet source configuration", () => {
  it("keeps the legacy assetDir as one local source", () => {
    expect(resolvePetSources({ assetDir: "/assets/legacy" })).toEqual([
      { id: "local", label: "Local", assetDir: "/assets/legacy" },
    ]);
  });

  it("allows source asset paths to inherit from the display host", () => {
    expect(resolvePetSources({
      assetDir: "/assets/shared",
      sources: [{ id: "remote", gateway: { url: "https://gateway.example.test/snapshot" } }],
    })).toEqual([{
      id: "remote",
      label: "remote",
      assetDir: "/assets/shared",
      gateway: { url: "https://gateway.example.test/snapshot" },
    }]);
  });

  it("drops invalid and duplicate source ids", () => {
    expect(resolvePetSources({
      sources: [
        { id: "same", assetDir: "/one" },
        { id: "same", assetDir: "/two" },
        { id: "../private", assetDir: "/three" },
      ],
    })).toEqual([{ id: "same", label: "same", assetDir: "/one" }]);
  });
});

describe("pull-based remote sources", () => {
  it("performs an authenticated HTTP pull from the configured bridge URL", async () => {
    const remoteSnapshot = toBridgeSnapshot({ ...localSnapshot, animation: "waiting", changedAt: 300 });
    let authorization: string | undefined;
    const server = createServer((req, res) => {
      authorization = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(remoteSnapshot));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    try {
      const coordinator = new SourceCoordinator({
        config: {
          sources: [{
            id: "remote",
            assetDir: "/assets/remote",
            gateway: { url: `http://127.0.0.1:${address.port}/snapshot`, tokenEnv: "PET_TOKEN" },
          }],
        },
        getLocalSnapshot: () => localSnapshot,
        logger: { warn: vi.fn() },
        env: { PET_TOKEN: "local-token" },
        validateAssetDir: () => true,
      });
      await expect(coordinator.pollOnce("remote")).resolves.toBe(true);
      expect(authorization).toBe("Bearer local-token");
      expect(coordinator.snapshot().sources[0]).toMatchObject({ available: true, state: { animation: "waiting" } });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects oversized bridge responses before parsing", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("x".repeat(MAX_BRIDGE_RESPONSE_BYTES + 1));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const warn = vi.fn();
    try {
      const coordinator = new SourceCoordinator({
        config: {
          sources: [{
            id: "remote",
            assetDir: "/assets/remote",
            gateway: { url: `http://127.0.0.1:${address.port}/snapshot` },
          }],
        },
        getLocalSnapshot: () => localSnapshot,
        logger: { warn },
        validateAssetDir: () => true,
      });
      await expect(coordinator.pollOnce("remote")).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith("OpenClaw Pet source remote is unavailable.");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("pulls a strict snapshot with locally resolved auth", async () => {
    const remoteSnapshot = toBridgeSnapshot({
      ...localSnapshot,
      animation: "running",
      changedAt: 200,
      activityLabel: "Running shell",
    });
    const fetchRemote = vi.fn(async () => remoteSnapshot);
    const warn = vi.fn();
    const coordinator = new SourceCoordinator({
      config,
      getLocalSnapshot: () => localSnapshot,
      logger: { warn },
      fetchRemote,
      env: { REMOTE_PET_TOKEN: "display-host-secret" },
      validateAssetDir: () => true,
    });

    expect(fetchRemote).not.toHaveBeenCalled();
    expect(coordinator.snapshot().sources[1]).toMatchObject({ id: "remote", available: false });
    await expect(coordinator.pollOnce("remote")).resolves.toBe(true);
    expect(fetchRemote).toHaveBeenCalledWith({
      url: "https://gateway.example.test/api/openclaw-pet/v1/snapshot",
      token: "display-host-secret",
      timeoutMs: 900,
    });
    expect(coordinator.snapshot().sources[1]).toMatchObject({
      id: "remote",
      label: "Server",
      available: true,
      state: { animation: "running", activityLabel: "Running shell" },
    });
    expect(JSON.stringify(coordinator.snapshot())).not.toContain("display-host-secret");
    expect(JSON.stringify(coordinator.snapshot())).not.toContain("assetDir");
    expect(JSON.stringify(coordinator.snapshot())).not.toContain("gateway.example.test");
  });

  it("marks invalid responses unavailable without logging private payloads", async () => {
    const warn = vi.fn();
    const fetchRemote = vi.fn(async () => ({
      ...toBridgeSnapshot(localSnapshot),
      assetDir: "/remote/private",
    }));
    const coordinator = new SourceCoordinator({
      config,
      getLocalSnapshot: () => localSnapshot,
      logger: { warn },
      fetchRemote,
      validateAssetDir: () => true,
    });

    await expect(coordinator.pollOnce("remote")).resolves.toBe(false);
    await expect(coordinator.pollOnce("remote")).resolves.toBe(false);
    expect(coordinator.snapshot().sources[1]).toMatchObject({ available: false });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("OpenClaw Pet source remote is unavailable.");
  });
});
