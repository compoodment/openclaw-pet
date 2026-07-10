import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import { BRIDGE_SNAPSHOT_METHOD } from "./source-coordinator.js";

function registerPlugin(pluginConfig: unknown = { overlay: { enabled: false } }) {
  const gatewayMethods = new Map<string, { handler: (options: any) => unknown; options: unknown }>();
  let httpRoute: any;
  let command: any;
  const api = {
    pluginConfig,
    registrationMode: "discovery",
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerGatewayMethod(method: string, handler: (options: any) => unknown, options: unknown) {
      gatewayMethods.set(method, { handler, options });
    },
    registerHttpRoute(route: any) { httpRoute = route; },
    registerCommand(value: any) { command = value; },
    registerService: vi.fn(),
    on: vi.fn(),
    agent: { events: { registerAgentEventSubscription: vi.fn() } },
  };
  plugin.register?.(api as never);
  return { gatewayMethods, getHttpRoute: () => httpRoute, getCommand: () => command };
}

describe("plugin bridge registration", () => {
  it("exposes the same sanitized snapshot over read-scoped RPC and authenticated HTTP", async () => {
    const registered = registerPlugin();
    const bridge = registered.gatewayMethods.get(BRIDGE_SNAPSHOT_METHOD);
    expect(bridge?.options).toEqual({ scope: "operator.read" });
    let rpcPayload: unknown;
    await bridge?.handler({ respond: (ok: boolean, payload: unknown) => { expect(ok).toBe(true); rpcPayload = payload; } });

    const route = registered.getHttpRoute();
    expect(route).toMatchObject({
      path: "/api/openclaw-pet/v1/snapshot",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
    });
    let status = 0;
    let headers: Record<string, string> = {};
    let body = "";
    const response = {
      writeHead(nextStatus: number, nextHeaders: Record<string, string>) { status = nextStatus; headers = nextHeaders; return this; },
      end(chunk?: string) { body = chunk ?? ""; return this; },
    };
    expect(route.handler({ method: "GET" }, response)).toBe(true);
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(body)).toEqual(rpcPayload);
    expect(body).not.toContain("assetDir");
    expect(body).not.toContain("lastError");
    expect(body).not.toContain("message");
  });

  it("keeps resize write-scoped and disabled on a source-only host", async () => {
    const registered = registerPlugin({ overlay: { enabled: true } });
    const resize = registered.gatewayMethods.get("openclaw-pet.resize");
    expect(resize?.options).toEqual({ scope: "operator.write" });
    const respond = vi.fn();
    await resize?.handler({ params: { size: 288 }, respond });
    expect(respond).toHaveBeenCalledWith(false, undefined, {
      code: "INVALID_REQUEST",
      message: "This host is not configured as an OpenClaw Pet display.",
    });
  });
});
