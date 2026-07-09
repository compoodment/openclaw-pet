# OpenClaw Pet

A native OpenClaw plugin that turns a user-supplied Codex-compatible pet atlas into a click-through desktop overlay on macOS.

## Setup

1. Put `pet.json` and a 1536-pixel-wide `spritesheet.webp` with 208-pixel animation rows in a directory you control.
2. Install this plugin, then configure `plugins.entries.openclaw-pet.config.assetDir` to that absolute directory.
3. Restart the Gateway. The overlay is local-only, stays above other apps, and never receives prompts, tool arguments, or outputs.

The overlay is macOS-first. Its activity reducer and localhost protocol are platform-neutral so a Windows or Linux helper can be added without changing OpenClaw integration.

Use `/pet` for status and `/pet reset` to return the pet to idle.

Simple OpenClaw tool plugin.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```
