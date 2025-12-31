# InkSight Packaging Guide

This guide describes how to package InkSight as a standalone desktop application using Electron.

## Prerequisites

- Node.js 16+
- NPM installed

## Build Commands

Found in `package.json`:

| Command | Description |
| copy | `npm run electron` | Runs the app in Electron (Development mode) |
| `npm run electron:dev` | Runs Electron + Vite dev server concurrently |
| `npm run dist:win` | Packages the application for Windows (x64) |

## Output

After running `npm run dist:win`, the built application is located in:

- **Directory:** `dist/win-unpacked/`
- **Executable:** `InkSight.exe`

## Troubleshooting

### White Screen / Resource Loading Errors
If the application launches but shows a white screen or "Not allowed to load local resource" errors:
- Ensure `asar` is set to `false` in `package.json`.
- Ensure `vite.config.js` has `base: './'`.

### "require is not defined"
Ensure the main process entry point is `.cjs` (CommonJS) or that `package.json` is configured correctly for ESM/CJS interop. InkSight currently uses `electron/main.cjs`.

### File Locked Errors
If the build fails with file locking errors, ensure no instances of `InkSight.exe` are currently running.
