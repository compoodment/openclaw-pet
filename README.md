# OpenClaw Pet

A native OpenClaw plugin that displays a user-supplied, Codex-compatible animated pet as a click-through desktop overlay on macOS.

The plugin observes sanitized OpenClaw lifecycle events and maps them to pet animations; it does not inspect or transmit prompts, tool arguments, results, or credentials.

## Repository layout

- `openclaw-pet/` — installable OpenClaw plugin package.
- `.pet-runs/` — ignored local pet-generation work; never committed.

## Development

```bash
cd openclaw-pet
npm install
npm run build
npm test
```

See [the plugin README](openclaw-pet/README.md) for asset and configuration requirements.

## License

MIT
