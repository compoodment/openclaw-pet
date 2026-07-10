import { describe, expect, it } from "vitest";
import { parseBridgeSnapshot, PET_BRIDGE_VERSION, toBridgeSnapshot } from "./bridge.js";
import type { PetSnapshot } from "./pet-controller.js";

const privateSnapshot: PetSnapshot = {
  valid: true,
  assetDir: "/private/pet-assets",
  animation: "review",
  changedAt: 1234,
  activeRuns: 1,
  activityCount: 2,
  lastEvent: "private event detail",
  activityLabel: "Running safe-tool",
  activity: [{ id: 7, label: "Running safe-tool", tone: "active", at: 1200 }],
  lastError: "private controller error",
  message: "private controller message",
};

describe("pet bridge privacy contract", () => {
  it("projects a versioned snapshot with no controller or asset details", () => {
    const bridge = toBridgeSnapshot(privateSnapshot);
    expect(bridge).toEqual({
      version: PET_BRIDGE_VERSION,
      state: {
        animation: "review",
        changedAt: 1234,
        activityLabel: "Running safe-tool",
        activity: [{ id: 7, label: "Running safe-tool", tone: "active" }],
      },
    });
    const wire = JSON.stringify(bridge);
    expect(wire).not.toContain("assetDir");
    expect(wire).not.toContain("/private/pet-assets");
    expect(wire).not.toContain("private");
  });

  it("rejects unknown fields and malformed remote labels", () => {
    const valid = toBridgeSnapshot(privateSnapshot);
    expect(parseBridgeSnapshot(valid)).toEqual(valid);
    expect(parseBridgeSnapshot({ ...valid, assetDir: "/remote/private" })).toBeUndefined();
    expect(parseBridgeSnapshot({
      ...valid,
      state: { ...valid.state, toolArgs: { command: "private" } },
    })).toBeUndefined();
    expect(parseBridgeSnapshot({
      ...valid,
      state: { ...valid.state, activityLabel: "x".repeat(141) },
    })).toBeUndefined();
  });

  it("normalizes control characters in outgoing display labels", () => {
    const bridge = toBridgeSnapshot({
      ...privateSnapshot,
      activityLabel: "Working\nnow",
      activity: [{ id: 7, label: "Tool\u0000complete", tone: "success", at: 1200 }],
    });
    expect(bridge.state.activityLabel).toBe("Working now");
    expect(bridge.state.activity[0]?.label).toBe("Tool complete");
  });
});
