# OpenClaw Pet

A native OpenClaw plugin that turns user-supplied Codex-compatible pet atlases into one transparent, always-on-top desktop overlay on macOS and Windows 11. A display can combine its local OpenClaw activity with activity pulled from remote OpenClaw Gateways.

## Privacy

The plugin reduces OpenClaw lifecycle events to display-only pet state in the platform-neutral controller. Its versioned Gateway bridge exposes only an allowlisted `{ animation, changedAt, activityLabel, activity }` snapshot. Activity labels are generated from lifecycle phases and validated tool names; prompts, tool arguments, tool results, model output, credentials, asset paths, and controller errors never enter a bridge snapshot.

Remote sources are pull-only: the display host periodically fetches the remote plugin's gateway-authenticated `/api/openclaw-pet/v1/snapshot` bridge endpoint and validates the complete response against the strict bridge contract. A response containing unknown fields is rejected. Gateway credentials are resolved from the display host's environment and used only for Gateway authentication.

The native overlay receives source IDs, display labels, availability, sanitized pet state, layout, and locally hosted sprite sheets over an ephemeral HTTP server bound to `127.0.0.1`. Every source's `assetDir` is a display-host-local setting and never appears in either the Gateway bridge or renderer state JSON.

The Windows WebView2 helper only permits navigation to that loopback origin and the internal watchdog/resize signals. The macOS and Windows helpers accept the same arguments and resize the shared multi-pet surface when the display host changes its runtime size.

Both native helpers load the same renderer from the loopback server. If that renderer cannot reach `/state` for 10 consecutive seconds, its watchdog asks the native helper to exit so a Gateway crash cannot leave an orphaned pet running indefinitely.

## Setup

1. For each displayed pet, put `pet.json` and a 1536-pixel-wide `spritesheet.webp` with 208-pixel animation rows in a directory on the display host.
2. Build on the OS where the plugin will run:

   ```bash
   npm install
   npm run build
   ```

3. Install the local package with `openclaw plugins install .`, then configure `plugins.entries.openclaw-pet.config`.
4. Restart the Gateway. Use `/pet` for status, `/pet reset` to return the local pet to idle, and `/pet resize 288` to resize all pets at runtime.

Example plugin config (use escaped backslashes in JSON on Windows):

```json
{
  "assetDir": "C:\\Users\\you\\openclaw-pet-assets",
  "overlay": {
    "enabled": true,
    "size": 224,
    "corner": "bottom-right",
    "clickThrough": false
  }
}
```

The legacy `assetDir` form remains supported and creates one source named `local`.

## Multiple local and remote sources

Configure `sources` on the machine that owns the desktop display. A source without `gateway` follows the display host's local controller. A source with `gateway` is pulled from that remote OpenClaw installation. Every `assetDir`, including a remote source's pet art, is a path on the display host:

```json
{
  "sources": [
    {
      "id": "laptop",
      "label": "Laptop",
      "assetDir": "/Users/you/pets/laptop"
    },
    {
      "id": "server",
      "label": "Build server",
      "assetDir": "/Users/you/pets/server",
      "gateway": {
        "url": "https://openclaw.example.test/api/openclaw-pet/v1/snapshot",
        "tokenEnv": "OPENCLAW_BUILD_SERVER_TOKEN",
        "pollIntervalMs": 1000,
        "timeoutMs": 5000
      }
    }
  ],
  "overlay": {
    "enabled": true,
    "size": 224,
    "corner": "bottom-right",
    "clickThrough": false
  }
}
```

Install and enable the plugin on each remote source Gateway. A source-only host can set `overlay.enabled` to `false` and does not need local pet assets; lifecycle events still drive its sanitized bridge snapshot. Put the token itself only in the display host environment variable named by `tokenEnv`.

The display retains the last validated remote animation data but visibly marks a source unavailable whenever polling fails or returns a non-conforming snapshot. Polling never overlaps for a given source: the next poll is scheduled after the previous request finishes.

## Runtime sizing

`overlay.size` sets the startup size from 96 through 768 pixels. On a display host, change it without restarting through the write-scoped Gateway method:

```bash
openclaw gateway call openclaw-pet.resize --params '{"size":288}'
```

The equivalent chat command is `/pet resize 288`. Runtime sizing is intentionally not part of `openclaw-pet.bridge.snapshot`; a source Gateway cannot change a display host's layout through the bridge. Runtime changes are in-memory and the configured `overlay.size` is used again after restart.

`overlay.clickThrough` is optional and defaults to `false`, preserving the draggable overlay. Set it to `true` to pass pointer input to windows underneath the pets; a click-through overlay cannot be dragged, so change its corner in config and restart the Gateway to reposition it.

## Build prerequisites

All platforms require Node.js/npm and the normal OpenClaw development dependencies installed by `npm install`.

- macOS: Xcode Command Line Tools with `swiftc`. `npm run build:overlay` compiles `overlay/pet-overlay.swift` to `dist/pet-overlay-macos`.
- Windows 11: the .NET 10 LTS SDK. `npm run build:overlay` publishes a self-contained WPF helper for the current Node architecture to `dist/pet-overlay-win.exe`; Swift is not required. The Evergreen WebView2 Runtime is part of Windows 11, but stripped-down or managed installations may need Microsoft’s runtime installed separately.
- Other platforms: TypeScript still builds, while the native-overlay step prints a clear no-op message.

Run the full validation commands with:

```bash
npm run build
npm test
npm pack --dry-run
openclaw plugins inspect openclaw-pet --runtime --json
openclaw plugins doctor
```

Run the two `openclaw` inspection commands after installing or linking the plugin. `openclaw plugins build` and `openclaw plugins validate` intentionally validate generated `defineToolPlugin` metadata and do not apply to this `definePluginEntry` service plugin. General static validation for `definePluginEntry` would be an upstream enhancement, not a blocker for this package.

## Windows behavior and limitations

The Windows helper uses a borderless WPF window, WebView2 composition rendering, the Win32 topmost/non-activating styles, and an optional transparent input style. It does not appear in the taskbar or intentionally take focus.

- Corner placement currently uses the primary display’s work area.
- With the default `clickThrough: false`, drag any pet to reposition the overlay temporarily; the adjacent activity panel remains interactive.
- With `clickThrough: true`, clicks pass through where Windows permits, but dragging is unavailable.
- The build emits one architecture-specific executable. Rebuild on x64, ARM64, or x86 when distributing to a different architecture.

Before release, manually smoke-test on Windows 11:

- Launching the overlay does not move focus away from the foreground application.
- Dragging the default overlay does not activate it or switch the foreground application.
- With `clickThrough: true`, pointer input reaches an unrelated application underneath the overlay.
- Stop the Gateway and confirm the helper disappears; force-terminate the Gateway and confirm the watchdog closes the helper within about 10 seconds.

Before release, manually smoke-test on macOS:

- The shared loopback renderer is transparent, animates, and remains draggable by default.
- `clickThrough: true` passes input through and disables dragging.
- Normal Gateway stop closes the helper, and the watchdog closes it after a forced Gateway termination.
