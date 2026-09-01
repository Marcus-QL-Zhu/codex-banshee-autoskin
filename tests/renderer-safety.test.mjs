import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  fetchTargetsFromLoopback,
  paletteOnlyForMainTargets,
  requireSingleMainRendererTarget,
} from '../scripts/lib/target-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const runtime = vm.runInNewContext(read('assets/banshee-runtime.js'));

test('capability evidence accepts named independent signals and rejects one-signal lookalikes', () => {
  const native = { id: 'native' };
  const lookalike = { id: 'lookalike' };
  assert.equal(runtime.classifyCandidates([native], () => ({ stableClass: true, rendered: true })).state, 'verified');
  assert.equal(runtime.classifyCandidates([lookalike], () => ({ stableClass: true, rendered: false })).state, 'unknown');
  assert.equal(runtime.classifyCandidates([native, lookalike], (node) => ({
    stableClass: true,
    rendered: node === native,
  })).node, native);
});

test('adaptive relocation prefers exact selectors and accepts one high-confidence structural fallback', () => {
  const exact = { id: 'exact' };
  const relocated = { id: 'relocated' };
  const weak = { id: 'weak' };
  const evidence = (node) => ({
    rendered: { match: true, weight: 3 },
    composerRelationship: { match: node !== weak, weight: 3 },
    shellGeometry: { match: node !== weak, weight: 2 },
    sidebarRelationship: { match: node !== weak, weight: 2 },
    semanticClass: { match: node === exact, weight: 1 },
  });
  const primary = runtime.adaptiveRelocateCandidate([exact], [exact, relocated], evidence);
  assert.equal(primary.node, exact);
  assert.equal(primary.source, 'primary');
  const fallback = runtime.adaptiveRelocateCandidate([], [relocated, weak], evidence, {
    minimumScore: .72, minimumMargin: .12, minimumSignals: 3,
  });
  assert.equal(fallback.state, 'verified');
  assert.equal(fallback.node, relocated);
  assert.equal(fallback.source, 'adaptive');
});

test('adaptive relocation remains fail-closed for weak and ambiguous candidates', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const weak = runtime.adaptiveRelocateCandidate([], [a], () => ({
    rendered: { match: true, weight: 3 },
    relationship: { match: false, weight: 4 },
    geometry: { match: false, weight: 3 },
  }));
  assert.equal(weak.state, 'unknown');
  const ambiguous = runtime.adaptiveRelocateCandidate([], [a, b], () => ({
    rendered: { match: true, weight: 3 },
    relationship: { match: true, weight: 4 },
    geometry: { match: true, weight: 3 },
  }));
  assert.equal(ambiguous.state, 'ambiguous');
  assert.equal(ambiguous.node, null);
  const hiddenExact = runtime.adaptiveRelocateCandidate([a], [a], () => ({
    stableClass: { match: true, weight: 1 },
    rendered: { match: false, weight: 3 },
    relationship: { match: false, weight: 3 },
  }));
  assert.equal(hiddenExact.state, 'unknown');
});

test('strict native parity detects state, rectangle, and minimum hit-area changes', () => {
  const attributes = new Map([
    ['aria-label', 'Fast mode'],
    ['aria-pressed', 'false'],
  ]);
  const node = {
    tagName: 'BUTTON', tabIndex: 0, disabled: false,
    getAttribute: (name) => attributes.get(name) ?? null,
    querySelector: (selector) => selector === 'svg' ? { outerHTML: '<svg></svg>' } : null,
    getBoundingClientRect: () => ({ x: 4, y: 5, width: 32, height: 32 }),
  };
  const styleFor = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const baseline = runtime.snapshotControl(node, styleFor, () => true);
  attributes.set('aria-pressed', 'true');
  node.getBoundingClientRect = () => ({ x: 14, y: 5, width: 20, height: 20 });
  const result = runtime.compareControl(baseline, node, styleFor, () => true, {
    compareState: true,
    compareRect: true,
    minimumHitSize: 24,
  });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes('pressed'));
  assert.ok(result.reasons.includes('position'));
  assert.ok(result.reasons.includes('size'));
  assert.ok(result.reasons.includes('hitArea'));
});

const makeClassList = (values) => ({ contains: (name) => values.includes(name) });

test('status-dot fallback requires both native structure and an amber computed color', () => {
  const fallback = {
    tagName: 'SPAN',
    classList: makeClassList(['absolute', 'inset-0', 'rounded-full']),
    getAttribute: (name) => name === 'style' ? 'background:var(--vscode-textLink-foreground)' : null,
  };
  assert.equal(runtime.isIdleCompletedStatusDot(fallback, () => ({ backgroundColor: 'rgb(240, 197, 111)' })), true);
  assert.equal(runtime.isIdleCompletedStatusDot(fallback, () => ({ backgroundColor: 'rgb(64, 200, 176)' })), false);
  assert.equal(runtime.isIdleCompletedStatusDot(fallback, () => ({ backgroundColor: 'rgb(220, 70, 70)' })), false);
  assert.equal(runtime.isIdleCompletedStatusDot(fallback, () => ({ backgroundColor: 'rgb(244, 119, 22)' })), false);
  const legacy = {
    tagName: 'SPAN',
    classList: makeClassList(['size-2', 'rounded-full', 'bg-token-charts-yellow']),
    getAttribute: () => null,
  };
  assert.equal(runtime.isIdleCompletedStatusDot(legacy, () => ({ backgroundColor: 'rgb(217, 162, 62)' })), true);
});

test('shared target policy is fail-closed across 1 to 2 to 1 main renderers', () => {
  const target = (id) => ({
    id,
    type: 'page',
    url: 'app://-/index.html',
    webSocketDebuggerUrl: `ws://127.0.0.1:9335/devtools/page/${id}`,
  });
  const one = [target('a')];
  const two = [target('a'), target('b')];
  assert.equal(requireSingleMainRendererTarget(one).id, 'a');
  assert.equal(paletteOnlyForMainTargets(one), false);
  assert.equal(paletteOnlyForMainTargets(two), true);
  assert.equal(paletteOnlyForMainTargets(one), false);
  assert.throws(() => requireSingleMainRendererTarget(two), /ambiguous/);
});

test('loopback target fetch falls back between stacks and validates the response', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('127.0.0.1')) throw new Error('IPv4 unavailable');
    return { ok: true, json: async () => [] };
  };
  const result = await fetchTargetsFromLoopback(9335, { fetchImpl, timeoutMs: 50 });
  assert.equal(result.host, '[::1]');
  assert.equal(calls.length, 2);
  await assert.rejects(
    fetchTargetsFromLoopback(9335, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }), timeoutMs: 50 }),
    /not an array/,
  );
  const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  await assert.rejects(
    fetchTargetsFromLoopback(9335, { fetchImpl: hangingFetch, timeoutMs: 5 }),
    /timed out/,
  );
});

test('renderer safety gates and observers are present in shipped sources', () => {
  const renderer = read('assets/renderer-inject.js');
  const css = read('styles/banshee/style.css');
  const injector = read('scripts/injector.mjs');
  const setTheme = read('scripts/set-theme.mjs');
  assert.match(css, /dream-pack-banshee #codex-dream-skin-chrome\s*\{[\s\S]*?display:none/);
  assert.match(css, /data-dream-pack-ready="banshee-v1"\] #codex-dream-skin-chrome\s*\{[\s\S]*?display:block/);
  assert.match(css, /\[data-dream-status-dot="idle-completed"\]/);
  assert.doesNotMatch(css, /\[data-app-action-sidebar-thread-row\] span\.absolute\.inset-0/);
  assert.match(renderer, /root\.removeAttribute\('data-dream-pack-ready'\);[\s\S]*?restoreOwned\(\);[\s\S]*?Route transitions/);
  assert.match(renderer, /fastObserver\.observe\(observedFastNode/);
  assert.match(read('assets/banshee-runtime.js'), /ModelPickerTriggerInlineFastIcon[\s\S]*?ModelPickerTriggerInlineModeIcon/);
  assert.match(renderer, /resizeObserver\.observe\(nextObservedComposer\)/);
  assert.match(renderer, /adaptiveRelocateCandidate/);
  assert.match(renderer, /composerFallbackCandidates/);
  assert.match(renderer, /composer\(\?:layout\)\?root/i);
  assert.match(renderer, /threadHeaderCandidates/);
  assert.match(renderer, /minimumScore: \.74, minimumMargin: \.14, minimumSignals: 5/);
  assert.match(renderer, /THEME_ART_HASHES/);
  assert.match(injector, /session\.appliedPaletteOnly === desiredPaletteOnly/);
  assert.match(injector, /topHit = stack\.find/);
  assert.match(injector, /requestTimeoutMs = 10000/);
  assert.match(injector, /CDP socket open timed out/);
  assert.match(injector, /\(!bansheeExpected \|\| bansheeActive\)/);
  assert.match(injector, /\[data-dream-surface="composer"\]/);
  assert.match(injector, /threadHeaderNode\.querySelectorAll\('button, span'\)/);
  assert.match(injector, /ModelPickerTriggerInlineFastIcon[\s\S]*?ModelPickerTriggerInlineModeIcon/);
  assert.match(setTheme, /fetchTargetsFromLoopback, requireSingleMainRendererTarget/);
  assert.match(setTheme, /CDP socket open timed out/);
  const installer = read('scripts/install-dream-skin.ps1');
  const restore = read('scripts/restore-dream-skin.ps1');
  assert.match(installer, /ReadAllText\(\$ConfigPath, \[Text\.UTF8Encoding\]::new\(\$false\)\)/);
  assert.match(restore, /ReadAllText\(\$config, \[Text\.UTF8Encoding\]::new\(\$false\)\)/);
});
