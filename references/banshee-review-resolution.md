# Banshee spec review resolution

Two independent reviews were completed before implementation and repeated after the final fixes; both reviewers reported no remaining Gate B blockers: one focused on runtime architecture/security/restore, and one on native parity/accessibility/testability.

## Resolved before implementation

- Replaced independent animation timing with one monotonic document-timeline epoch with fixed per-surface propagation delays.
- Corrected the CDP threat model: loopback CDP is unauthenticated; non-loopback HTTP/WebSocket targets are rejected.
- Added schema v2 with fail-closed `stylePack` and `artMode` enums while retaining schema-v1 image themes.
- Added an artless runtime path that creates no Blob URL and removes art variables on selection.
- Added a code-owned style-pack registry, scoped pack CSS validation, size limit, symlink rejection, and network-resource rejection.
- Isolated legacy Dream CSS behind `dream-pack-dream`.
- Added pack-specific Banshee chrome with `aria-hidden`, `inert`, `role=presentation`, and pointer pass-through.
- Added capability/surface markers with owned-change rollback and a structural activation gate.
- Added explicit microphone/Fast mode discovery without replacing their native icon/SVG nodes.
- Added complete pack/adapter/epoch cleanup and loopback target fixtures.
- Added reduced-motion, forced-colors, visible focus, and scoped CSS contracts.

## Deliberately deferred to the post-restart gate

Static checks cannot prove real Codex DOM identity, microphone recording states, Fast mode's three states, keyboard order, visual contrast in the final renderer, or `elementsFromPoint` hit testing. Those checks remain Gate C in `BANSHEE-SPEC.md` and must not be reported as passed until Codex is restarted and inspected.

## Remaining hardening track

The installer now allocates and persists a loopback debug port, writes configuration atomically, records before/installed values, restores them with compare-and-swap, and records the exact SHA-256 of every created shortcut and restores only on a compare-and-swap match. The launcher correlates the listening PID with the packaged ChatGPT executable path, checks its Authenticode signature before launch, and the injector rejects non-loopback WebSocket endpoints. Post-restart process and renderer observations still belong to Gate C.
