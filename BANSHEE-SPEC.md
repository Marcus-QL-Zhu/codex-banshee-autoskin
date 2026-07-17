# Banshee Armored Shell —Native Codex Skin Specification

Status: implementation contract  
Version: 1.1 (post independent review)  
Target: Windows Store Codex desktop app, through AutoSkin's CDP injection runtime  
Relationship to `THEME-SPEC.md`: this is an engine-extension specification. The original file remains unchanged and is still the authoring contract for schema-v1 image themes using the legacy `dream` pack. Where this document adds schema v2, artless themes, pack loading, or runtime changes, this document intentionally extends the legacy permission boundary without altering it.

## 1. Purpose

Build a reversible dark skin for the real Codex desktop application that abstracts the visual language of a sealed, high-energy armored machine: near-black blue armor, cut planes, recessed panel gaps, restrained gold energy, and synchronized light moving beneath the shell.

The result must not depict a Gundam, robot, head crest, insignia, weapon, character, or franchise mark. It is an independent interface shell derived from color, material, geometry, rhythm, and light behavior.

The standalone React mockup remains a visual laboratory only. Production delivery is an AutoSkin style pack applied to the official Codex renderer so native behavior, state, accessibility, account/session data, and future features remain owned by Codex.

## 2. Non-negotiable constraints

1. Do not modify `ChatGPT.exe`, `app.asar`, WindowsApps, or any official application file.
2. Do not overwrite or repurpose `THEME-SPEC.md`, the built-in `dream` style pack, or existing demo themes.
3. Do not recreate native controls. Restyle the existing DOM in place.
4. Decorative layers must use `pointer-events: none` and must never enter the accessibility tree.
5. Preserve every native feature and its state. In particular:
   - microphone uses the exact native control and SVG;
   - Fast mode remains conditional and shows the native lightning indicator only when Codex exposes it;
   - send, stop, attachments, permissions, model/reasoning selectors, branch/worktree state, diffs, citations, terminal, review controls, menus, dialogs, toasts, focus rings, disabled states, and hover/pressed states remain operable;
   - diff insertion/deletion and semantic warning/error/success colors are not collapsed into the theme accent.
6. The skin must fail safely. When a required capability cannot be identified, apply palette-only styling and omit structural decoration for that surface.
7. Auxiliary renderers with `initialRoute` or transparent utility windows are never skinned.
8. CDP remains loopback-only and must probe both IPv4 and IPv6 loopback.

## 3. Delivery architecture

### 3.1 Layers

The solution has four layers:

1. **AutoSkin runtime** —process discovery, CDP connection, renderer selection, injection, watcher, restore, and verification.
2. **DOM capability adapter** —observes native semantic signals and adds only namespaced capability classes/data attributes. It does not replace elements.
3. **Banshee structure pack** —scoped CSS for armor surfaces, seams, cut corners, rails, and coordinated energy animation.
4. **Banshee manifest theme** —palette, typography-compatible tokens, copy, layout defaults, and pack selection. It contains no character art.

### 3.2 Backward compatibility

- Add `schemaVersion: 2` for engine-extension themes. Schema v1 remains the default when omitted.
- Schema v2 adds enumerated `stylePack` and `artMode`; missing `stylePack` means `dream`, and missing `artMode` means `image`.
- Unknown schema versions, style packs, and art modes fail closed. Pack names resolve through a code-owned whitelist registry and are never interpolated directly into filesystem paths.
- Existing themes and commands must behave exactly as before.
- Runtime root classes are additive: `codex-dream-skin` plus `dream-pack-<name>`.
- Switching themes removes the previous `dream-pack-*` class before adding the next one.
- A pack may declare `artMode: "none"`; existing themes continue to require their image. Artless themes are absent from the art asset table. The renderer must not fingerprint or create Blob URLs for them and must remove `--dream-home-art`, `--dream-chat-art`, and `--dream-art` when switching to them.
- Pack CSS is loaded from the registry, validated for its pack root scope, and size-limited. Missing/invalid pack CSS rejects that schema-v2 theme; it never silently receives the `dream` structure.
- Banshee-specific variables use the existing safe token namespace, for example `--dream-banshee-energy-core`.

## 4. Visual system

### 4.1 Palette and material

- Armor base: blue-black, not neutral black (`#050b15` through `#17243a`).
- Elevated plates: one or two luminance steps above their surrounding cavity.
- Panel gaps: darker than both adjacent plates, with a cool inner-edge highlight.
- Energy core: muted amber-gold at rest; warm pale gold at the pulse crest.
- Text: cool off-white primary, desaturated blue-gray secondary.
- Cyan/violet may remain only where Codex uses them semantically or for native tool identity; gold is not allowed to overwrite those meanings.
- Surfaces are matte with restrained directional gradients. No glossy glassmorphism, neon wash, star fields, character art, or ornamental logo.

Required conceptual tokens:

```css
--dream-banshee-armor-950;
--dream-banshee-armor-900;
--dream-banshee-armor-800;
--dream-banshee-armor-700;
--dream-banshee-gap;
--dream-banshee-seam;
--dream-banshee-seam-strong;
--dream-banshee-energy-low;
--dream-banshee-energy-core;
--dream-banshee-energy-active;
--dream-banshee-energy-bright;
--dream-banshee-wave-cycle;
--dream-banshee-wave-origin-x;
--dream-banshee-wave-origin-y;
```

### 4.2 Armor geometry

The interface must read as assembled plates, not as rounded cards with gold borders.

- Prefer 45-degree chamfers, stepped shoulders, asymmetric cuts, and short interrupted seams.
- A plate is defined by at least two of: cut silhouette, adjacent cavity, edge highlight, recessed seam, or different surface plane.
- Large regions are divided into a small number of meaningful plates. Do not texture every control.
- Sidebar header, sidebar/content boundary, main top frame, suggestion cards, composer tray, and status/footer rails each receive deliberate panel-gap treatment when the corresponding native surface exists.
- Seams must remain visible at rest. Energy light travels inside selected seams; it is not the seam itself.
- Geometry is decorative and must not change hit areas, scroll geometry, native layout order, or keyboard navigation.
- Use pseudo-elements and dedicated injected chrome nodes only. All such nodes are namespaced and removable.

Design-language semantics take precedence over seam count. The shell is translated from the approved Banshee analysis as a hierarchy of large quiet planes, functional joints, and selectively exposed inner energy:

- **S1 structural boundary** groups adjacent plates or content regions. It is a low-contrast, non-luminous line and may remain continuous only where the underlying region is continuous.
- **S2 step/facet edge** communicates a real foreground/background change. It uses a paired cool highlight and dark cavity edge; it must terminate at a cut, shoulder, inset, anchor, or functional transition.
- **S3 energy-reveal seam** represents inner structure exposed by an active state. Gold is sparse, local, and dim at rest; it must never become a general border color.
- Read geometry in the order `large plane → functional/expandable relationship → local facet → panel line`. Adding more lines cannot compensate for a missing plate hierarchy.
- Main reading and input surfaces are the largest and quietest armor planes. Detail density concentrates around navigation selection, tool/approval/diff nodes, frame transfers, and the composer context rail.
- Direction follows a force field: stable verticals express navigation and progression; outward diagonals express expansion or activity; inward-converging folds are reserved for a primary action or core state. A component does not mix unrelated diagonal directions.
- State change is **topology reveal**, not color replacement. The selected sidebar row is a subtly raised plate with one embedded S3 segment, not a gold rectangle. The composer is a closed shell with a persistent low-output recessed top conduit and one short brighter S3 crest; the warm line may span that functional joint, but the bright pulse may not become a general border. Suggestion cards preserve a stable grid while using mirrored, non-repeating local cuts rather than identical four-corner chamfers.
The approved fourth concept establishes a **minimum seam coverage**, not merely a color reference:

| Zone | Required armor construction |
| --- | --- |
| Sidebar crown | One broad diagonal cut, a recessed lower seam, and one short gold conduit; the crown must read as a separate shoulder plate. |
| Sidebar/content boundary | An interrupted vertical spine with at least three depth changes and two angled joints; it may not render as one plain divider. |
| Main top frame | Mirrored shoulder plates plus a stepped center spine with nested seams; the center remains abstract and contains no emblem, head, or machine silhouette. |
| Main side frame | Left/right segmented rails with upper, middle, and lower interruptions, chamfered transfers, and low-energy conduit segments. |
| Main corners/footer | Double-frame corner joints and a geometrically continuous lower rail, with the outer and inner plates visibly separated at rest. The composer occludes that rail as an opaque foreground plate; the rail is never authored as a fixed composer-shaped gap. |
| Suggestion cards | Stable rectangular planes with mirrored local cuts, a partial recessed edge, and short offset energy inserts; the four cards must not repeat one four-corner chamfer template. |
| Context/composer tray | A separate upper context plate, clipped outer corners, an inset inner seam, and a stepped top conduit without covering native controls. |

On conversation routes, the native task title and its native right-side toolbar occupy one quiet safe band below the top shoulder plates. The adapter may mark and reposition that existing header rectangle, but it may not clone, replace, reorder, or resize its controls. The complete title line must remain visible, every applicable toolbar control must remain inside the main viewport, and the group must retain native flex order, accessible names, and hit targets.
Within the native main stacking context, that marked header must paint above the scrolling content viewport so the topmost interactive node at each control center remains the original button or one of its descendants. Decorative shell chrome remains pointer-transparent and may not be used to compensate for an incorrect native stacking order.
The task-title cluster anchors to the inner left rail rather than the centered conversation column, while the toolbar cluster anchors to the corresponding inner right safe edge. Their optical edge insets should read as a balanced pair; expanding the header safe rectangle leftward must preserve its established right edge and native flex ordering.

At the 1920×1200 review viewport, every one of these seven zones must be visibly identifiable with animation paused at its dimmest frame. A full-width or full-height straight border does not count as armor construction. Adjacent seams should vary in depth and terminate before the next joint so the shell reads as assembled plates rather than a continuous picture frame.

The canonical `1047×668` preview retains the four-card row used by the approved reference when Codex exposes four native suggestions. Responsive collapse to two columns begins only below `820px`; it must not alter the reference review composition. If a later Codex build exposes fewer suggestions, center the available native card planes and never fabricate replacement buttons or copy.

The approved composer assembly occupies approximately three quarters of the main-frame width and combines a shallow context plate with a deeper input cavity. On the native home route, the adapter may widen only the existing composer host's maximum width and add a bounded minimum height to the existing composer surface. The native context utility bar is restyled as that separate chamfered plate instead of retaining a rounded capsule silhouette. The assembly must remain inside the native main bounds and may not reorder controls, resize individual control hit targets, or apply the home proportion while a conversation/output rail owns a narrower content column.

Corner joints must read cleanly on screen; independent shoulder and side seams must never expose an accidental X. The approved construction is layered rather than mathematically flat: rear structural seams may pass beneath a foreground plate, but the overlap must be hidden by an opaque fill or explicit mask before the foreground contour is painted. When no plate occludes an overlap, split the rear path into separate SVG subpaths at the occlusion boundary. SVG paint order is therefore part of the armor topology: rear fill/seam, foreground plate fill, foreground seam, then energy conduit. The composer and its context tray are opaque foreground plates: global frame seams and bottom energy rails must be occluded beneath them and must not create translucency, duplicated borders, or ghost lines through native content.

The frame SVG uses the approved main-frame crop as its canonical coordinate system: `viewBox="0 0 1261 941"`. Do not redraw it in a guessed square coordinate system. Scale it to the available viewport with `preserveAspectRatio="none"` while retaining `vector-effect: non-scaling-stroke` for stable seam weight. Geometry review is performed at an exact 1047×668 preview viewport and then resampled to the 1570×1002 reference canvas; both images must share dimensions before overlay or pixel comparison.

Visual acceptance uses a fixed, repeatable capture rather than subjective inspection alone. Pause or settle animation, capture in the same browser and viewport, compare the approved/current images at identical dimensions, and inspect a red/cyan edge overlay for the frame regions. Pixel/edge metrics are diagnostics, not permission to ignore a visibly wrong silhouette. A baseline is accepted only after the user approves it; tests may prevent topology regressions but may not declare visual approval.

The user-approved 1580×1000 reference is the canonical silhouette. The main shell must preserve these continuous relationships when scaled:

- each top shoulder transfers through a diagonal joint into its corresponding side rail;
- the top center contains at least three nested horizontal levels, including a narrow recessed conduit;
- each side contains two parallel structural seams, an upper illuminated slot, a long recessed mid-rail, a lower illuminated slot, and an angled transfer into the bottom corner;
- neither side rail may disappear behind the page background or collapse to a single one-pixel divider;
- the lower corners visibly join the bottom rail while leaving the native composer unobstructed;
- the dim frame must expose the entire construction; animation enhances the structure but never supplies missing geometry.

The energy system has two simultaneous layers: a persistent low-output conduit and a brighter traveling crest. Both layers use the shared 9.6-second epoch. The crest originates in the recessed top-center conduit, reaches mirrored upper side joints together, travels down both side rails, and reaches the lower corners and bottom rail last. Left and right counterparts must share phase exactly.

### 4.3 Global energy wave

All breathing/flow effects are one physical event, not independent looping widgets.

- Source: viewport/content center at the top edge: `50% 0%`.
- Cycle: `9.6s` default.
- Propagation: outward by normalized distance from the source. Phase 1 uses reviewed coarse geometric zones with fixed delays: top frame `0ms`, upper sidebar/rails `400–600ms`, central cards `800–1000ms`, composer `1300–1700ms`, and far/footer accents `1700ms`.
- Zones progress in order: top frame → upper sidebar/main rails → central cards → composer/footer → far corners.
- A crest is brief and subtle; most of the cycle is dark, quiet, and apparently charged beneath armor.
- Peak glow must never reduce text contrast or obscure native status colors.
- The adapter may assign coarse phase buckets, but every animation uses the same clock and easing.
- No random delay, no independent duration, and no per-control free-running pulse.
- Runtime captures one monotonic `document.timeline.currentTime` epoch and persists it in injection state across route reconciliation and reinjection. Every Banshee CSS animation is attached to that same Web Animations `startTime`; fixed zone delays provide outward travel, so late nodes join the existing wave rather than starting an independent clock. Resetting the epoch is allowed only after full cleanup or a deliberate theme epoch reset.
- Prefer a single permanent pack-chrome animation with static seam masks. If per-node animation is required, use `document.timeline`/Web Animations with the same absolute start time.
- `prefers-reduced-motion: reduce` disables travel and leaves a stable low-energy seam.
- If animation performance degrades, fall back to opacity-only animation on injected decorative layers.

## 5. DOM capability adapter

### 5.1 Responsibilities

The adapter performs bounded semantic discovery and applies namespaced markers such as:

- `data-dream-surface="sidebar|main|composer|cards"`
- `data-dream-capability="microphone|fast-mode"`

Discovery priority:

1. stable `data-*` or test identifiers;
2. ARIA role/name and native accessible labels;
3. stable control relationships and SVG signatures;
4. localized visible text only as a last, non-required hint.

Do not depend on unbounded `nth-child` paths. A MutationObserver performs one bounded, debounced capability rescan per mutation burst; 1,000 mutations must still schedule only one scan. The adapter owns every mutation through an injection owner token, records prior attribute/inline values, writes only on change, and ignores its own mutations. Cleanup reverts only values owned by that injection.

Each surface uses a fail-closed state machine: `unknown | verified | ambiguous`. `verified` requires one unique candidate and two consistent signals (role/name plus containment, relationship, stable data attribute, or SVG/control signature). Duplicate candidates, conflicting evidence, or missing relationships are `ambiguous` and remain palette-only. The structural CSS master switch `data-dream-pack-ready="banshee-v1"` is set only after required probes pass and is removed immediately when they stop passing.

### 5.2 Capability contract

For each styled native feature, verify five properties:

1. Available —the native feature still exists when its state makes it applicable.
2. Visible —the skin has not hidden, clipped, or covered it.
3. Operable —pointer and keyboard activation reach the native element.
4. Stateful —selected, active, recording, disabled, loading, and error states remain distinguishable.
5. Accessible —native name, role, focus order, and focus indication remain intact.

The adapter records a lightweight compatibility report in the console, listing detected capabilities and any palette-only fallbacks. It never logs conversation text, project names, credentials, or user content.

Before each structural reconciliation, synchronously close the ready gate and capture a current-state native parity baseline for interactive elements: DOM identity, role, accessible name, tab index, disabled/pressed/checked state, visibility rectangle, and native hit target. Re-open the gate and compare immediately; do not persist this baseline across native Fast/microphone state changes or React node replacement. Post-gate comparison permits visual style differences only. For the microphone, also retain an SVG markup/path hash during that activation cycle; the pack may not replace it using `content`, masks, background images, visibility, display, or opacity. Fast mode has three explicit cases: unavailable (no fake lightning), available/off (no fake active indicator), and enabled (the same native lightning node remains visible).

### 5.3 Version resilience

- Runtime must expose a renderer/build fingerprint when available.
- Maintain a compatibility table of known selectors/signatures with the last verified Codex build.
- Unknown builds are allowed, but structural rules activate only after capability probes pass. Multiple plausible main renderers or ambiguous surfaces remain palette-only.
- Loss of one capability disables only its associated structural enhancement.

## 6. Runtime and security

- Bind CDP only to `127.0.0.1`/`::1`; reject non-loopback HTTP and WebSocket endpoints.
- Prefer a configurable or runtime-selected available port. If the upstream fixed port remains for compatibility, document collision risk and verify the listener is loopback-only before connecting.
- Chromium CDP has no application-layer authentication. The threat model trusts processes running as the same local user while the debug endpoint is active. Before connecting, reduce accidental/malicious mis-targeting by verifying the TCP owner PID, ChatGPT process tree, signed/package installation path, renderer URL, and metadata together; random ports reduce collisions but are not authentication.
- Apply only to the main Codex renderer; exclude `initialRoute`, transparent helpers, devtools, and unrelated processes.
- Watcher behavior remains optional, debounced, rate-limited, and protected by a circuit breaker.
- Store runtime state under `%LOCALAPPDATA%\CodexDreamSkin`; do not store user content.
- Choose a random available port once at installation and persist it in state; every script reads that value unless an explicit CLI port overrides it. Port migration updates shortcut/watcher state as one transaction.
- Back up only configuration fields that will be changed. For each field record `beforeValue`, `installedValue`, and whether it originally existed. Restore uses compare-and-swap: revert only when the current value still equals `installedValue`. Write through a temporary file and atomically replace the configuration.
- Shortcut installation records any pre-existing shortcut backup plus the created shortcut hash. Uninstall deletes only a matching tool-owned shortcut and restores its backup. Distinguish live injection removal, base-theme restoration, and full uninstall.
- Restore removes injected style/script/chrome nodes, root classes, adapter attributes/inline phase values, owner/epoch state, listeners, ResizeObservers, MutationObservers, timers, and Blob URLs. Apply/cleanup/apply must not increase retained nodes or observer counts.
- Pack/manifest CSS forbids `@import`, network URLs, path traversal, symlink escape, and unbounded payload sizes. Only embedded `data:` resources produced by trusted pack code or files inside the validated theme directory are accepted.

## 7. Installation and restore behavior

- Banshee is dark-first. Installation must not force the upstream light base-theme preset.
- Theme selection persists through the existing state mechanism.
- `set-theme` lists Banshee and supports its declared layouts.
- Existing install/start/restore interfaces remain valid.
- A full uninstall restores the exact backed-up base-theme fields, shortcuts, watcher state, and runtime directory ownership created by AutoSkin.
- Banshee uses a pack-specific chrome factory. Its neutral chrome root is created with `aria-hidden="true"`, `inert`, `role="presentation"`, and `pointer-events:none`; it contains no brand, signature, note, gift, polaroid, sticker, or focusable node. Existing Dream chrome remains exclusive to the `dream` pack.
- This implementation task must not start or restart Codex. It ends at the pre-restart gate below.

## 8. Verification

### 8.1 Static and offline checks

Required before restart:

- all manifests parse and validate;
- existing themes still package successfully;
- Banshee selects the `banshee` pack and supports artless packaging;
- Banshee CSS is fully scoped to the skin root and pack class;
- every injected decorative selector has `pointer-events: none` directly or by verified inheritance;
- no rule hides native microphone or Fast mode controls;
- no theme rule globally replaces native SVG content;
- reduced-motion behavior is present;
- focus-visible styling remains present;
- semantic diff/error/warning/success tokens remain distinct;
- restore cleanup includes pack classes, capability markers, observers, style nodes, and chrome nodes;
- selector-fixture tests cover composer, microphone, Fast mode on/off, sidebar, cards, dialogs, diffs, and an unknown-build fallback;
- capability fixtures cover duplicate names, missing ARIA, Chinese/English labels, changed SVG, DOM reorder, and maliciously similar nodes; ambiguous fixtures must produce zero markers;
- artless → image → artless → reinject → cleanup never dereferences missing art and leaves no art variables/Blob URLs;
- target-selection fixtures cover main `app://-/index.html`, `initialRoute=*`, transparent helper, devtools, duplicate main candidates, and a non-Codex service on the same port;
- a 1,000-mutation burst causes at most one global fallback scan; normal reconciliation remains bounded to the whitelisted capability selectors, keeps one observer/timer, and cleanup yields zero subsequent callbacks;
- CSS validation parses comma groups and nested `@media`/`@supports`; every Banshee selector is rooted at `html.codex-dream-skin.dream-pack-banshee`, keyframes are namespaced, and no global native-SVG replacement exists;
- all Banshee animations/transitions become static under reduced motion; forced colors disables decorative gradients/glow;
- contrast contract is WCAG 2.2 AA: normal text 4.5:1, large text 3:1, focus indicator 3:1. There is no global `outline:none` and no user-font override in the Banshee pack;
- static checks are contract checks only. They do not claim to prove real-renderer native parity, hit testing, SVG identity, or state transitions; those remain Gate C;
- original `THEME-SPEC.md` matches upstream unchanged.

### 8.2 Real Codex checks after restart

Deferred until the user explicitly restarts/authorizes restart:

- full-screen screenshot at the user's normal viewport;
- hit-testing grid and `elementsFromPoint` verification;
- keyboard-only traversal and visible focus;
- microphone idle/hover/recording/disabled states;
- Fast mode absent and enabled states;
- send/stop transition, model picker, permissions menu, attachments, terminal, diff, review, toast, modal, and scrolling;
- coordinated wave timing from top-center to corners;
- sample at least three zones against the shared epoch: same-zone peak skew ≤100ms and cross-zone order top → center → footer/far corners within declared travel windows;
- reduced motion;
- restore and reapply across a normal Codex restart;
- comparison against the approved fourth concept without adding logos or machine imagery.
- responsive/accessibility matrix: minimum supported window, 1280×820, current user viewport, and >1400px; sidebar open/closed; 100/125/150/200% scale or zoom; long Chinese/English labels; multiline composer; forced colors; keyboard Tab/Shift+Tab/Escape order unchanged.
- hit testing covers center and four corners of each control, seam pseudo-element regions, and controls while menus/modals are open; the topmost interactive ancestor remains native.

### 8.3 Incremental visual acceptance

Visual parity is accepted zone by zone, not from a whole-screen impression. The review order is: sidebar crown and top task controls, main-frame top edge, main-frame left/right edges, then cards/composer and coordinated energy behavior.

For each zone:

- freeze every zone that is not currently under review;
- render the approved reference crop and current crop at identical pixel dimensions and alignment;
- provide a 50% alpha overlay for seam, baseline, spacing, and silhouette inspection;
- do not begin the next zone until the user accepts the current crop;
- preserve native controls and icon semantics; preview-only stand-ins must match native geometry and must never become production replacements.
## 9. Deliverables

1. This specification, separate from `THEME-SPEC.md`.
2. `styles/banshee/style.css` as a scoped structure pack.
3. `themes/banshee-armor/theme.json` as an artless manifest.
4. Runtime support for `stylePack`, `artMode`, pack root classes, adapter markers, and complete cleanup.
5. Static verifier and selector fixtures.
6. Updated README/usage notes describing the new pack, safety boundary, and restart gate.
7. A local feature branch suitable for pushing to the user's fork.

## 10. Completion gates

### Gate A —spec review

- Independent agent review covers architecture, security, native parity, upgrade resilience, accessibility, and testability.
- Every high-severity finding is resolved in this file or explicitly accepted with rationale.

### Gate B —pre-restart implementation complete

- All deliverables exist.
- Static/offline checks pass.
- Existing theme behavior remains compatible.
- No Codex process was started, stopped, or restarted.
- Work is committed on `codex/banshee-armored-shell` and is ready for the user's remote fork when GitHub authentication permits.

### Gate C —post-restart acceptance

Gate C begins only after the user chooses to restart Codex. Until then, do not claim the skin is visually or functionally accepted in the real renderer. The implementation must stop after Gate B and present the exact next command/action for the user to take.

