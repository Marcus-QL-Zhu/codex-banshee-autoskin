# Cached Banshee lights

The light animation previously moved a window-wide, 2400-unit gradient through SVG masks and clips while other lights animated filters and background geometry. A thin visible light can therefore invalidate large rendering surfaces. Removing only one light or one filter did not resolve the measured GPU spike.

The accepted implementation keeps the static armor in its own compositor layer. It caches the small light regions in software, presents them at 24fps during the original active pass, and sleeps for the dark part of the unchanged 20-second cycle. Canvas layers are isolated so a light update does not repaint the static armor. The cache is limited to 64 MiB and is rebuilt on relevant geometry or palette changes. Cleanup releases the cache, timers, observers, stylesheet and decorative nodes. Unsupported runtimes retain the original CSS fallback.

## Local measurement, 2026-10-20

Intel UHD Graphics, 1707 x 912 CSS pixels, device scale 1.5, foreground window. Windows GPU Engine counters were filtered to the Codex GPU process; each reported percentage is a one-second sample. Means below use 21 samples after discarding the first sample. The original and cached comparisons below did not run the Chromium tracing recorder.

| Sample | Mean 3D occupancy | Peak 3D occupancy |
| --- | ---: | ---: |
| Original CSS/SVG lights | 16.32% | 91.25% |
| Accepted isolated cached lights | 3.99% | 14.63% |
| Reference with decorative animation/filters stopped | 2.60% | 6.66% |

The observed total-process ratios are about 4.1x for mean occupancy and 6.2x for peak occupancy. These are short local observations, not a controlled benchmark at a fixed GPU clock. They do not establish a 100x improvement, and process occupancy includes other Codex views and native UI activity. A prior valid cached run measured 4.34% mean and 15.81% peak.

The accepted cache held 77 frames at device scale 1.5, using 42,812,640 bytes (about 40.8 MiB). Its measured initial build took roughly 160-205ms on this machine; initialization is additional work, not included in the steady-state occupancy comparison. Checks confirmed the old SVG animations were stopped while the cached renderer remained alive and presented frames. Early prototypes that exited during structural reconciliation were excluded from the accepted comparison.

The 24fps sweep and baked glow are visual tradeoffs. The existing armor silhouette, theme tokens, native controls and cycle are retained, but the bloom is an approximation of the old dynamic filters. A same-phase side-rail comparison and main-renderer cleanup were checked locally. This does not constitute exhaustive acceptance of every route, size, palette or GPU.

For the underlying rendering guidance, see [Chrome's high-performance animation guide](https://web.dev/articles/animations-guide). It recommends avoiding paint-triggering animation properties, checking repaint regions, and applying layer promotion only where measurements justify it.
