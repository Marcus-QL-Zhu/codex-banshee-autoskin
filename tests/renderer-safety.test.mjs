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
  assert.match(renderer, /resizeObserver\.observe\(nextObservedComposer\)/);
  assert.match(renderer, /THEME_ART_HASHES/);
  assert.match(injector, /session\.appliedPaletteOnly === desiredPaletteOnly/);
  assert.match(injector, /topHit = stack\.find/);
  assert.match(injector, /requestTimeoutMs = 10000/);
  assert.match(injector, /CDP socket open timed out/);
  assert.match(setTheme, /fetchTargetsFromLoopback, requireSingleMainRendererTarget/);
  assert.match(setTheme, /CDP socket open timed out/);
});
