import { definePluginEntry, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { createPetController, type PetConfig } from "./pet-controller.js";
import { startOverlay, stopOverlay } from "./overlay-service.js";

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-pet",
  name: "OpenClaw Pet",
  description: "A privacy-preserving desktop pet that reflects OpenClaw activity.",
  register(api) {
    const config = api.pluginConfig as PetConfig;
    const pet = createPetController(config);
    const launchOverlay = async (stateDir: string) => {
      const state = pet.initialize();
      if (!state.valid || config?.enabled === false || config?.overlay?.enabled === false) return;
      await startOverlay({
        stateDir,
        assetDir: state.assetDir!,
        size: config?.overlay?.size ?? 224,
        corner: config?.overlay?.corner ?? "bottom-right",
        getSnapshot: () => pet.snapshot(),
        logger: api.logger,
      });
    };

    api.registerGatewayMethod("openclaw-pet.status", async ({ respond }) => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); respond(true, pet.snapshot()); }, { scope: "operator.read" });
    api.registerGatewayMethod("openclaw-pet.reset", async ({ respond }) => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); respond(true, pet.reset()); }, { scope: "operator.write" });

    api.on("model_call_started", () => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.modelStarted(); });
    api.on("before_tool_call", () => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.toolStarted(); });
    api.on("after_tool_call", (event) => pet.toolFinished(Boolean(event.error)));
    api.on("agent_end", (event) => pet.agentEnded(event.success === false));
    api.on("gateway_start", async () => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); });

    api.registerCommand({
      name: "pet",
      description: "Show or reset the desktop pet.",
      acceptsArgs: true,
      handler: async (ctx) => {
        await launchOverlay(process.env.TMPDIR ?? "/tmp");
        return ctx.args?.trim() === "reset" ? { text: pet.reset().message } : { text: pet.statusText() };
      },
    });

    api.registerService({
      id: "openclaw-pet-overlay",
      async start(ctx) { await launchOverlay(ctx.stateDir); },
      async stop() { await stopOverlay(); },
    });

    if (api.registrationMode === "full") {
      setTimeout(() => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); }, 0);
    }
  },
});
export default plugin;
