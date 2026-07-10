import type { ActivityItem, Animation, PetSnapshot } from "./pet-controller.js";

export const PET_BRIDGE_VERSION = 1 as const;

export type SanitizedActivityItem = Pick<ActivityItem, "id" | "label" | "tone">;

export type SanitizedPetState = {
  animation: Animation;
  changedAt: number;
  activityLabel: string;
  activity: SanitizedActivityItem[];
};

export type PetBridgeSnapshot = {
  version: typeof PET_BRIDGE_VERSION;
  state: SanitizedPetState;
};

const animations = new Set<Animation>([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
]);
const tones = new Set<ActivityItem["tone"]>(["active", "success", "error", "neutral"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 140 ? normalized : undefined;
}

function parseActivity(value: unknown): SanitizedActivityItem[] | undefined {
  if (!Array.isArray(value) || value.length > 6) return undefined;
  const result: SanitizedActivityItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "label", "tone"])) return undefined;
    if (!Number.isSafeInteger(item.id) || (item.id as number) < 0) return undefined;
    const label = safeLabel(item.label);
    if (!label || typeof item.tone !== "string" || !tones.has(item.tone as ActivityItem["tone"])) return undefined;
    result.push({ id: item.id as number, label, tone: item.tone as ActivityItem["tone"] });
  }
  return result;
}

export function toSanitizedPetState(snapshot: PetSnapshot): SanitizedPetState {
  return {
    animation: snapshot.animation,
    changedAt: snapshot.changedAt,
    activityLabel: safeLabel(snapshot.activityLabel) ?? "Working",
    activity: snapshot.activity.slice(0, 6).map(({ id, label, tone }, index) => ({
      id: Number.isSafeInteger(id) && id >= 0 ? id : index,
      label: safeLabel(label) ?? "Activity",
      tone: tones.has(tone) ? tone : "neutral",
    })),
  };
}

export function toBridgeSnapshot(snapshot: PetSnapshot): PetBridgeSnapshot {
  return { version: PET_BRIDGE_VERSION, state: toSanitizedPetState(snapshot) };
}

export function parseBridgeSnapshot(value: unknown): PetBridgeSnapshot | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "state"]) || value.version !== PET_BRIDGE_VERSION || !isRecord(value.state)) return undefined;
  const state = value.state;
  if (!hasOnlyKeys(state, ["animation", "changedAt", "activityLabel", "activity"])) return undefined;
  if (typeof state.animation !== "string" || !animations.has(state.animation as Animation)) return undefined;
  if (!Number.isSafeInteger(state.changedAt) || (state.changedAt as number) < 0) return undefined;
  const activityLabel = safeLabel(state.activityLabel);
  const activity = parseActivity(state.activity);
  if (!activityLabel || !activity) return undefined;
  return {
    version: PET_BRIDGE_VERSION,
    state: {
      animation: state.animation as Animation,
      changedAt: state.changedAt as number,
      activityLabel,
      activity,
    },
  };
}
