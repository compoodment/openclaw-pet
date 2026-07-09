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

    api.registerGatewayMethod("openclaw-pet.status", ({ respond }) => { respond(true, pet.snapshot()); }, { scope: "operator.read" });
    api.registerGatewayMethod("openclaw-pet.reset", ({ respond }) => { respond(true, pet.reset()); }, { scope: "operator.write" });

    api.on("model_call_started", () => pet.modelStarted());
    api.on("before_tool_call", () => pet.toolStarted());
    api.on("after_tool_call", (event) => pet.toolFinished(Boolean(event.error)));
    api.on("agent_end", (event) => pet.agentEnded(event.success === false));

    api.registerCommand({
      name: "pet",
      description: "Show or reset the desktop pet.",
      acceptsArgs: true,
      handler: (ctx) => ctx.args?.trim() === "reset"
        ? { text: pet.reset().message }
        : { text: pet.statusText() },
    });

    api.registerService({
      id: "openclaw-pet-overlay",
      async start(ctx) {
        const state = pet.initialize();
        if (!state.valid || config?.enabled === false || config?.overlay?.enabled === false) return;
        await startOverlay({
          stateDir: ctx.stateDir,
          assetDir: state.assetDir!,
          size: config?.overlay?.size ?? 224,
          corner: config?.overlay?.corner ?? "bottom-right",
          getSnapshot: () => pet.snapshot(),
          logger: ctx.logger,
        });
      },
      async stop() { await stopOverlay(); },
    });
  },
});
export default plugin;
