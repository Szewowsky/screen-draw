# Screen Draw

Standalone Electron app for drawing annotations directly on top of the screen.

- Feature guide: [docs/features.md](docs/features.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## Run

```bash
npm install
npm run build
npm start
```

For development:

```bash
npm run dev
```

## Installer

Build a local macOS installer:

```bash
npm run dist
```

The generated installer is written to `dist/`:

- `Screen Draw-1.4.0-arm64.dmg`
- `Screen Draw-1.4.0-arm64.zip`

## Checks

```bash
npm run lint
npm run type-check
npm test
npm run build
```

## Notes

This version is detached from the Glaze runtime. It uses standard Electron windows, a small local preload bridge, and local React UI components.
