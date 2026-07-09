import { describe, expect, it } from "vitest";
import { ANIMATIONS, createPetController, validateAssets } from "./pet-controller.js";

describe("pet animation contract", () => {
  it("preserves the fixed Codex-compatible atlas layout", () => {
    expect(Object.keys(ANIMATIONS)).toHaveLength(9);
    expect(ANIMATIONS.idle).toMatchObject({ row: 0, frames: 6 });
    expect(ANIMATIONS.review).toMatchObject({ row: 8, frames: 6 });
  });

  it("reports a safe error when assets are not configured", () => {
    expect(validateAssets()).toMatchObject({ valid: false, lastError: "assetDir is required" });
  });

  it("keeps overlapping runs non-negative and resets to idle", () => {
    const pet = createPetController({ idleDelayMs: 1 });
    pet.modelStarted(); pet.modelStarted();
    expect(pet.snapshot()).toMatchObject({ animation: "review", activeRuns: 2 });
    pet.agentEnded(false); pet.agentEnded(true); pet.agentEnded(false);
    expect(pet.snapshot()).toMatchObject({ animation: "jumping", activeRuns: 0 });
    expect(pet.reset()).toMatchObject({ animation: "idle", activeRuns: 0 });
  });
});
