# Changelog

All notable changes to Codex AutoSkin are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Release hardening and documentation corrections that have not yet been tagged.

## [2.3.0] - 2026-07-19

### Added

- Banshee Armored Shell, a schema-v2 artless structural style pack with a synchronized 10-second energy cycle.
- Fast-mode awakening palette, including native Fast markers, file references, slider effects, and task-status indicators.
- Verified, versioned per-user Codex runtime copied from the trusted Microsoft Store package.
- Persisted random loopback-port allocation, dual-stack CDP probing, target filtering, and auxiliary-renderer protection.
- Auto-recovery watcher safeguards, runtime verification, offline Banshee tests, and shortcut ownership tests.
- Root-level Windows installer wrapper, release hygiene check, Windows CI, and security guidance.
- Owned desktop shortcuts for temporary live restore and full uninstall, both independent of the downloaded source folder.

### Changed

- The default bundled theme is now `banshee-armor` in fullscreen layout for a fresh profile.
- Installation uses the matching official dark base palette.
- End-user lifecycle commands use the hash-verified Node bundled with the trusted Store Codex payload, so users do not need a system Node installation. Direct source-tool development requires Node.js 22.4+.

### Fixed

- Native Fast task dots now use the awakening cyan-green palette while verified Fast mode is on.
- Sidebar hover, keyboard-focus, selected-row, top-brand, search-icon, and composer alignment details.
- Theme cleanup, pack isolation, reduced-motion behavior, forced-colors behavior, and native hit-target parity.

## [2.0.0] - 2026-07-16

- Rebranded the manifest-driven rewrite as Codex AutoSkin.
- Added agent-readable theme authoring, two generated demo themes, reversible CDP injection, theme switching, verification, and restore workflows.

[Unreleased]: https://github.com/Marcus-QL-Zhu/codex-autoskin/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/Marcus-QL-Zhu/codex-autoskin/compare/v2.0.0...v2.3.0
[2.0.0]: https://github.com/Marcus-QL-Zhu/codex-autoskin/releases/tag/v2.0.0
