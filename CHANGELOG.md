# Changelog

All notable changes to InkSight are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-09-07

### Added

- Simplified Chinese and English localization across the application shell, settings, annotations, project flows, graph view, and Drawnix integration.
- Read, Capture, and Map workspace presets with dedicated notes and map panel states.
- Knowledge graph expansion from annotations, persistent graph nodes, and optional streaming AI conversations using graph context.
- Responsive desktop, tablet, and phone layouts with mobile navigation and project actions.
- Project home, recent projects, project-directory import/export, recovery snapshots, and outline/citation/notes exports.
- Windows GitHub Release automation that builds a ZIP archive and publishes its SHA-256 checksum.
- A bilingual privacy notice covering local storage, AI requests, and API credential handling.

### Changed

- Redesigned the interface around the Paper & Ink visual system, including multiple light and dark themes.
- Expanded canvas organization and automatic layout options for source, time, and loose arrangements.
- Updated Drawnix integration and maintenance documentation while keeping InkSight-specific behavior isolated.
- Raised the supported Node.js version to 22.12 or newer and refreshed application dependencies.
- Updated documentation to match the current project, privacy, deployment, and Windows packaging behavior.

### Fixed

- Improved source-link recovery, document registration reconciliation, annotation deletion, project persistence, and mobile interactions.
- Added atomic local writes and a writable Electron user-data fallback for packaged installations.
- Protected Electron AI credentials with operating-system secure storage when available.
- Hardened local file path handling, external link handling, HTML rendering, and AI endpoint validation.
- Stabilized deterministic GitHub Pages builds and expanded automated coverage for application and Electron workflows.

## [1.0.0] - 2026-01-06

- Initial public release.

[1.1.0]: https://github.com/MrmoLabs/InkSight/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MrmoLabs/InkSight/releases/tag/v1.0.0
