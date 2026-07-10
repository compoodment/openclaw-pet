import { definePluginEntry, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { toBridgeSnapshot } from "./bridge.js";
import { createPetController, type PetConfig } from "./pet-controller.js";
import { normalizeOverlaySize, startOverlay, stopOverlay } from "./overlay-service.js";
import { BRIDGE_SNAPSHOT_METHOD, SourceCoordinator } from "./source-coordinator.js";

function safeToolName(data: Record<string, unknown>): string | undefined {
  const value = data.toolName ?? data.name;
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,48}$/.test(value) ? value : undefined;
}

function safeProgressLabel(data: Record<string, unknown>): string | undefined {
  const value = data.title ?? data.text ?? data.status;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 140 ? normalized : undefined;
}

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-pet",
  name: "OpenClaw Pet",
  description: "A privacy-preserving desktop pet that reflects OpenClaw activity.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as PetConfig;
    const controllerAssetDir = config.assetDir ?? config.sources?.find((source) => !source.gateway)?.assetDir;
    const pet = createPetController({ ...config, assetDir: controllerAssetDir });
    const sources = new SourceCoordinator({ config, getLocalSnapshot: () => pet.snapshot(), logger: api.logger });
    let overlaySize = normalizeOverlaySize(config?.overlay?.size) ?? 224;
    let overlayStateDir = process.env.TMPDIR ?? "/tmp";
    const launchOverlay = async (stateDir: string) => {
      overlayStateDir = stateDir;
      if (config?.enabled === false || config?.overlay?.enabled === false) return;
      const assets = sources.assets();
      if (assets.length === 0) return;
      sources.start();
      await startOverlay({
        stateDir,
        assets,
        size: overlaySize,
        corner: config?.overlay?.corner ?? "bottom-right",
        clickThrough: config?.overlay?.clickThrough ?? false,
        getSnapshot: () => sources.snapshot(),
        getSize: () => overlaySize,
        logger: api.logger,
      });
    };

    const displayStatus = () => ({
      enabled: config?.enabled !== false && config?.overlay?.enabled !== false && sources.assets().length > 0,
      size: overlaySize,
      sources: sources.snapshot().sources.map(({ id, label, available }) => ({ id, label, available })),
    });
    const resize = async (value: unknown): Promise<{ ok: true; size: number } | { ok: false; message: string }> => {
      if (config?.enabled === false || config?.overlay?.enabled === false || sources.assets().length === 0) {
        return { ok: false, message: "This host is not configured as an OpenClaw Pet display." };
      }
      const size = normalizeOverlaySize(value);
      if (!size) return { ok: false, message: "size must be an integer from 96 through 768." };
      overlaySize = size;
      await launchOverlay(overlayStateDir);
      return { ok: true, size };
    };

    api.registerGatewayMethod(BRIDGE_SNAPSHOT_METHOD, ({ respond }) => {
      respond(true, toBridgeSnapshot(pet.snapshot()));
    }, { scope: "operator.read" });
    api.registerHttpRoute({
      path: "/api/openclaw-pet/v1/snapshot",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405, { allow: "GET, HEAD" }).end();
          return true;
        }
        res.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json",
          "x-content-type-options": "nosniff",
        });
        if (req.method === "HEAD") res.end();
        else res.end(JSON.stringify(toBridgeSnapshot(pet.snapshot())));
        return true;
      },
    });
    api.registerGatewayMethod("openclaw-pet.status", async ({ respond }) => {
      await launchOverlay(overlayStateDir);
      respond(true, { ...pet.snapshot(), display: displayStatus() });
    }, { scope: "operator.read" });
    api.registerGatewayMethod("openclaw-pet.reset", async ({ respond }) => {
      await launchOverlay(overlayStateDir);
      respond(true, pet.reset());
    }, { scope: "operator.write" });
    api.registerGatewayMethod("openclaw-pet.resize", async ({ params, respond }) => {
      const result = await resize(params.size);
      if (!result.ok) {
        respond(false, undefined, { code: "INVALID_REQUEST", message: result.message });
        return;
      }
      respond(true, { size: result.size, sourceCount: sources.assets().length });
    }, { scope: "operator.write" });

    api.on("model_call_started", () => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.modelStarted(); });
    api.on("before_tool_call", (event) => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.toolStarted(safeToolName({ toolName: event.toolName })); });
    api.on("after_tool_call", (event) => pet.toolFinished(Boolean(event.error)));
    api.on("agent_end", (event) => pet.agentEnded(event.success === false));
    api.on("gateway_start", async () => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); });
    api.agent.events.registerAgentEventSubscription({
      id: "openclaw-pet-activity",
      description: "Drive the desktop pet from sanitized agent lifecycle and tool events.",
      streams: ["lifecycle", "tool", "error", "acp", "item", "command_output", "patch", "thinking"],
      handle: (event) => {
        const phase = String(event.data.phase ?? event.data.status ?? event.data.type ?? "").toLowerCase();
        if (event.stream === "acp") {
          const eventType = String(event.data.eventType ?? "").toLowerCase();
          if (eventType === "tool_call") {
            const detail = safeProgressLabel(event.data);
            if (phase.includes("result") || phase.includes("complete")) pet.toolFinished(false);
            else pet.toolStarted(safeToolName(event.data) ?? detail);
            return;
          }
          if (eventType === "error") { pet.agentEnded(true); return; }
          pet.progress(safeProgressLabel(event.data) ?? "Working");
          return;
        }
        if (event.stream === "item" || event.stream === "thinking") {
          pet.progress(safeProgressLabel(event.data) ?? "Working");
          return;
        }
        if (event.stream === "tool") {
          if (phase.includes("fail") || phase.includes("error")) pet.toolFinished(true);
          else if (phase.includes("end") || phase.includes("result") || phase.includes("complete")) pet.toolFinished(false);
          else pet.toolStarted(safeToolName(event.data));
          return;
        }
        if (event.stream === "error") { pet.agentEnded(true); return; }
        if (phase.includes("end") || phase.includes("complete") || phase.includes("finish")) pet.agentEnded(false);
        else pet.modelStarted();
      },
    });

    api.registerCommand({
      name: "pet",
      description: "Show or reset the desktop pet.",
      acceptsArgs: true,
      handler: async (ctx) => {
        await launchOverlay(overlayStateDir);
        const args = ctx.args?.trim() ?? "";
        if (args === "reset") return { text: pet.reset().message };
        const resizeMatch = args.match(/^resize\s+(\d+)$/);
        if (resizeMatch) {
          const result = await resize(resizeMatch[1]);
          return { text: result.ok ? `Pet display resized to ${result.size}px.` : `Pet resize failed: ${result.message}` };
        }
        return { text: `${pet.statusText()} Display: ${overlaySize}px; ${sources.assets().length} source(s).` };
      },
    });

    api.registerService({
      id: "openclaw-pet-overlay",
      async start(ctx) { await launchOverlay(ctx.stateDir); },
      async stop() { sources.stop(); await stopOverlay(); },
    });

    if (api.registrationMode === "full") {
      setTimeout(() => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); }, 0);
    }
  },
});
export default plugin;
