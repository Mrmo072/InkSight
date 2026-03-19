# Implementation Notes

This document captures the architectural rules introduced during the current optimization pass.

## Goals

- Reduce hidden global coupling.
- Make event lifecycles explicit.
- Split document persistence into smaller boundaries.
- Delay heavy feature loading until the user actually needs it.

## App Context

Primary file:
- `src/app/app-context.js`

Use the app context as the single shared registry for cross-module services and current document metadata.

Current responsibilities:
- `currentBook` identity and name
- `cardSystem`
- `highlightManager`
- `documentManager`
- `pdfReader`
- `outlineSidebar`
- `annotationList`
- `board`

Rules:
- Prefer `getAppContext()` and `setAppService()` over direct `window.inksight.foo` reads and writes.
- Keep the context as a thin service registry, not a second business-logic layer.
- New modules should not introduce new ad-hoc globals when a context entry is enough.

## Event Lifecycle

Primary file:
- `src/app/event-listeners.js`

Event listeners that outlive a single inline callback should be registered through `registerEventListeners(...)`.

Why:
- It makes teardown paths visible.
- It reduces missed `removeEventListener(...)` calls.
- It gives large modules one obvious place to collect cleanup.

Rules:
- Window-level listeners should not be added directly unless there is a very local reason.
- If a module has a `destroy()` path or an effect cleanup path, listener cleanup should be attached there.
- If a feature uses temporary pointer or drag listeners, register and release them as a grouped cleanup.

## Reader Loading

Primary file:
- `src/app/reader-loader.js`

Readers are now loaded lazily by file type.

Current strategy:
- PDF reader is imported only for PDF files.
- EPUB reader is imported only for EPUB files.
- Text reader is imported only for text and markdown files.

Rules:
- Keep reader-specific dependencies inside the reader module path whenever possible.
- Shared reader helpers belong in `src/readers/*-utils.js` or a future shared reader helper module.
- The loader should remain the orchestration layer, not the place for reader-specific business logic.

## Document History

Primary files:
- `src/core/document-history-manager.js`
- `src/core/document-history-helpers.js`
- `src/core/document-history-ipc.js`
- `src/core/document-history-store.js`

The history manager is now closer to an orchestrator.

Current split:
- `document-history-helpers.js`: pure filename, payload, and history update helpers
- `document-history-ipc.js`: IPC bridge discovery and wrapping
- `document-history-store.js`: local storage load and save behavior
- `document-history-manager.js`: restore and auto-save orchestration

Rules:
- Pure transformation logic should stay out of the manager class.
- Storage and IPC concerns should remain testable without the full manager.
- Restore sequencing changes should preserve non-blocking behavior around `board-ready`.

## Drawnix Feature Islands

Primary files:
- `src/main.js`
- `src/mindmap/drawnix-view.js`
- `src/drawnix/drawnix/src/drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/ttd-dialog.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx`
- `src/drawnix/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx`
- `src/mindmap/DrawnixBoard.jsx`

Current loading policy:
- `DrawnixView` is loaded dynamically from `main.js`.
- TTD dialog entry is lazy.
- Mermaid and markdown dialog bodies are lazy.
- Mermaid and markdown conversion libraries load only when preview or insert is first requested.
- ELK is created only when auto-layout is actually used.

Rules:
- Heavy advanced tools should not load on app boot by default.
- When adding a new advanced Drawnix tool, ask whether it should be:
  - always-on
  - dialog-lazy
  - action-lazy
- Prefer action-lazy for features with large third-party dependency trees.

## Recovery Workflow

Primary files:
- `src/inksight-file/inksight-file-snapshot.js`
- `src/inksight-file/inksight-file-restore.js`
- `src/app/document-relink.js`
- `src/app/recovery-panel-actions.js`
- `src/app/source-navigation.js`
- `src/ui/app-notifications.js`

Current recovery behavior:
- `.inksight` exports now include document references in addition to board elements, cards, highlights, and connections.
- Restoring a project rebuilds missing document references as unloaded placeholders instead of silently dropping them.
- The library panel shows unresolved source documents and provides relink, bulk import, auto-match, and validation entry points.
- Auto-match attempts to reuse already loaded documents when names and types are compatible.
- Source navigation uses a dedicated helper so jump-back behavior can be tested without the full app boot path.
- Recovery feedback is delivered through in-app notifications instead of blocking alerts.

Rules:
- Keep project-file concerns inside the InkSight adapter and relink helpers, not inside Drawnix internals.
- Keep relink matching logic pure when possible so it stays easy to test.
- Navigation failures should surface through app notifications, not silent logs alone.
- New recovery actions should be wired through the recovery-panel action helper instead of adding more DOM-specific branching in `main.js`.

## Recovery Tests

Relevant tests:
- `test/inksight-persistence-contract.test.ts`
- `test/inksight-file-adapter.test.ts`
- `src/app/__tests__/document-relink.test.js`
- `src/app/__tests__/source-navigation.test.js`
- `src/app/__tests__/recovery-panel-actions.test.js`
- `src/ui/__tests__/app-notifications.test.js`

What they currently protect:
- `.inksight` payload contract and restore behavior
- relink target selection and diagnostics
- linked-source navigation fallback behavior
- recovery panel action routing
- notification rendering and action callbacks

## Bundle Follow-Up

Current build status:
- The app builds successfully, but `elk-vendor` and `mermaid-vendor` are still far above the chunk warning threshold.

Recommended next bundle work:
- Measure whether Mermaid and ELK chunks are ever pulled into the initial route unexpectedly.
- Consider splitting the Mermaid-related vendor chunk more aggressively if preview/insert paths still share a too-large dependency group.
- If startup performance becomes a user-facing issue, profile the recovery-heavy path separately from a clean reading-only startup.

## Tests Added To Protect These Rules

Relevant tests:
- `src/core/__tests__/document-history-manager.test.js`
- `src/core/__tests__/document-history-ipc.test.js`
- `src/core/__tests__/document-history-store.test.js`
- `test/drawnix-feature-islands.test.tsx`

What they currently protect:
- restore and auto-save behavior
- IPC bridge resolution
- history storage parsing and persistence
- deferred loading of Mermaid and Markdown conversion features

## Follow-Up Guidance

If we continue optimizing:
- Prefer documenting a boundary before growing it.
- Prefer moving pure logic out before splitting behavior across more files.
- For bundle work, measure runtime loading behavior, not just build output.
- If a new feature needs a large vendor dependency, make the load trigger explicit in the design.
