# InkSight Packaging Guide

This guide describes how to package InkSight as a self-contained desktop application directory using Electron.

## Prerequisites

- Node.js 22.12+
- NPM installed

## Build Commands

Found in `package.json`:

| Command | Description |
| --- | --- |
| `npm run electron` | Runs the app in Electron (Development mode) |
| `npm run electron:dev` | Runs Electron + Vite dev server concurrently |
| `npm run dist:win` | Packages the application for Windows (x64) |

## Output

After running `npm run dist:win`, the built application is located in:

- **Directory:** `dist/win-unpacked/`
- **Executable:** `InkSight.exe`

`InkSight.exe` is not a standalone single file. It must remain beside the DLLs, resources, and other files generated in `dist/win-unpacked/`.

## Distribution

For a manual build, compress the entire `dist/win-unpacked/` directory into a ZIP archive. Tagged releases use the repository's Windows release workflow to create the same ZIP and a SHA-256 checksum, then attach both files to the GitHub Release.

The current build is unsigned. Windows may display a SmartScreen warning until a trusted code-signing certificate and signing configuration are added.

## Troubleshooting

### White Screen / Resource Loading Errors
If the application launches but shows a white screen or "Not allowed to load local resource" errors:
- Ensure `asar` is set to `false` in `package.json`.
- Ensure `vite.config.js` has `base: './'`.

### "require is not defined"
Ensure the main process entry point is `.cjs` (CommonJS) or that `package.json` is configured correctly for ESM/CJS interop. InkSight currently uses `electron/main.cjs`.

### File Locked Errors
If the build fails with file locking errors, ensure no instances of `InkSight.exe` are currently running.
