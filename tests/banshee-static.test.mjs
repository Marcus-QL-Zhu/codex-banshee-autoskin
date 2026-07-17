import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { classifyTargets, isLoopbackEndpoint, isMainRendererTarget } from "../scripts/lib/target-selection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function extractTopLevelRules(css) {
  const rules = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({ prelude: css.slice(preludeStart, bodyStart - 1).trim(), body: css.slice(bodyStart, i) });
        preludeStart = i + 1;
      }
      assert.ok(depth >= 0, "CSS braces must remain balanced");
    }
  }
  assert.equal(depth, 0, "CSS braces must remain balanced");
  assert.equal(css.slice(preludeStart).trim(), "", "CSS must not contain a trailing fragment");
  return rules;
}

test("new spec is separate and legacy THEME-SPEC is unchanged", () => {
  assert.match(read("BANSHEE-SPEC.md"), /Version: 1\.1 \(post independent review\)/);
  const digest = createHash("sha256").update(fs.readFileSync(path.join(root, "THEME-SPEC.md"))).digest("hex");
  assert.equal(digest, "0fdede80a0d244144216fa3dadfe1d81aed263ff1b1d4c6c0f128c427e59dcc5");
});

test("Banshee is a schema-v2 artless whitelisted pack theme", () => {
  const theme = JSON.parse(read("themes/banshee-armor/theme.json"));
  assert.equal(theme.schemaVersion, 2);
  assert.equal(theme.stylePack, "banshee");
  assert.equal(theme.artMode, "none");
  assert.equal(theme.art, undefined);
  assert.match(theme.tokens["--dream-banshee-wave-cycle"], /^9\.6s$/);
  assert.doesNotMatch(JSON.stringify(theme), /gundam|unicorn|robot|mecha|logo/i);
});

test("legacy image themes coexist with the schema-v2 Banshee manifest", () => {
  const legacy = JSON.parse(read("themes/aurora-veil/theme.json"));
  const banshee = JSON.parse(read("themes/banshee-armor/theme.json"));
  assert.equal(legacy.schemaVersion, undefined);
  assert.equal(legacy.artMode, undefined);
  assert.deepEqual([banshee.schemaVersion, banshee.stylePack, banshee.artMode], [2, "banshee", "none"]);
  const injector = read("scripts/injector.mjs");
  assert.match(injector, /dream: \{ file:/);
  assert.match(injector, /banshee: \{ file:/);
  assert.match(injector, /themes\.filter\(\(theme\) => theme\.artMode === "image"\)/);
});

test("Banshee selectors are pack-scoped and its motion/accessibility fallbacks exist", () => {
  const css = read("styles/banshee/style.css");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const check = (block) => {
    for (const rule of extractTopLevelRules(block)) {
      if (/^@(media|supports)\b/.test(rule.prelude)) {
        check(rule.body);
      } else if (/^@keyframes dream-banshee-/.test(rule.prelude)) {
        // Namespaced animation is allowed.
      } else {
        for (const selector of rule.prelude.split(",").map((item) => item.trim()).filter(Boolean)) {
          assert.ok(selector.startsWith("html.codex-dream-skin.dream-pack-banshee"), `unscoped: ${selector}`);
        }
      }
    }
  };
  check(stripped);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /#codex-dream-skin-chrome \*/);
  assert.match(css, /pointer-events: none !important/);
  const chromeRule = css.match(/#codex-dream-skin-chrome\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(chromeRule, /z-index:4;/);
  assert.match(css, /dream-banshee-seam-travel/);
  assert.match(css, /dream-banshee-conduit-breathe/);
  assert.match(css, /dream-banshee-energy-upper/);
  assert.match(css, /dream-banshee-energy-lower/);
  assert.match(css, /dream-banshee-conduit-origin \{ animation-delay:0ms; \}/);
  assert.match(css, /dream-banshee-conduit-upper \{ animation-delay:420ms; \}/);
  assert.match(css, /dream-banshee-conduit-lower \{ animation-delay:1150ms; \}/);
  assert.match(css, /button:nth-child\(2\)::after/);
  assert.match(css, /animation-delay:780ms/);
  assert.match(css, /animation-delay:1320ms/);
  assert.match(css, /linear-gradient\(160deg,#121f32,#050b14\) !important;/);
  assert.match(css, /isolation:isolate;/);
  assert.match(css, /dream-banshee-seam-s1/);
  assert.match(css, /dream-banshee-seam-s2/);
  assert.match(css, /button:nth-child\(4\)/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important/);
  assert.match(css, /gap:clamp\(17px,1\.7vw,28px\) !important/);
  assert.match(css, /width:min\(1080px,calc\(100vw - 420px\)\) !important/);
  assert.match(css, /min-height:clamp\(113px,9vw,154px\) !important/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /button:nth-child\(3\)::before/);
  assert.match(css, /transform:scaleX\(-1\)/);
  assert.match(css, /clip-path:polygon\(2px 0,calc\(100% - 2px\) 0,100% 50%/);
  assert.match(css, /\[data-dream-surface="cards"\]:has\(> :only-child\)/);
  assert.match(css, /grid-template-columns:minmax\(0,249px\) !important/);
  assert.match(css, /\[data-dream-composer-host="home"\]/);
  assert.match(css, /max-width:min\(1132px,max\(480px,calc\(100vw - clamp\(386px,33vw,576px\)\)\)\) !important/);
  assert.match(css, /min-height:clamp\(108px,12\.7vh,116px\) !important/);
  assert.match(css, /\[data-dream-composer-context="home"\]/);
  assert.match(css, /clip-path:polygon\(12px 0,calc\(100% - 12px\) 0,100% 12px/);
  assert.match(css, /--dream-banshee-composer-top-seam:rgba\(217,162,62,\.46\)/);
  assert.match(css, /--dream-banshee-composer-top-seam:rgba\(240,197,111,\.64\)/);
  assert.match(css, /var\(--dream-banshee-composer-top-seam\)/);
  assert.match(css, /inset 0 4px 0 var\(--dream-banshee-composer-top-seam\)/);
  assert.match(css, /border:0 !important/);
  assert.match(css, /clip-path:polygon\(10px 0,calc\(100% - 10px\) 0,100% 10px/);
  assert.match(css, /\[data-dream-surface="composer"\]:focus-within/);
  const selectedPlate = css.match(/\[aria-current="page"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(selectedPlate, /bottom\/100% 1px no-repeat/);
  assert.doesNotMatch(selectedPlate, /border:\s*1px solid rgba\(217,162,62/);
  const composerEnergy = css.match(/\[data-dream-surface="composer"\]::after\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(composerEnergy, /left:43%/);
  assert.match(composerEnergy, /right:43%/);
  assert.doesNotMatch(css, /(^|[\s,>])svg\b/m);
  assert.doesNotMatch(css, /outline\s*:\s*none/i);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
});

test("legacy Dream structure is isolated behind its own pack class", () => {
  const css = read("styles/dream/style.css");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const check = (block) => {
    for (const rule of extractTopLevelRules(block)) {
      if (/^@(media|supports)\b/.test(rule.prelude)) check(rule.body);
      else if (!/^@keyframes\b/.test(rule.prelude)) {
        for (const selector of rule.prelude.split(",").map((item) => item.trim()).filter(Boolean)) {
          assert.ok(selector.startsWith("html.codex-dream-skin.dream-pack-dream") || selector.startsWith(":root.codex-dream-skin.dream-pack-dream"), `unscoped Dream selector: ${selector}`);
        }
      }
    }
  };
  check(stripped);
});

test("renderer supports artless switching, pack cleanup, neutral chrome, and one epoch", () => {
  const source = read("assets/renderer-inject.js");
  assert.match(source, /const STYLE_VERSION = "18"/);
  assert.match(source, /THEME_ART_MODES/);
  assert.match(source, /bansheeRuntime\.artVariables/);
  assert.match(source, /cls\.startsWith\("dream-pack-"\)/);
  assert.match(source, /data-dream-pack-ready/);
  assert.match(source, /const waveEpoch = previous\?\.waveEpoch/);
  assert.match(source, /animation\.startTime = waveEpoch/);
  assert.match(source, /aria-hidden/);
  assert.match(source, /setAttribute\("inert", ""\)/);
  assert.match(source, /role", "presentation/);
  assert.match(source, /restoreOwned/);
  assert.match(source, /dream-banshee-armor-svg/);
  assert.match(source, /"听写"/);
  assert.match(source, /dream-banshee-seam-outer/);
  assert.match(source, /dream-banshee-seam-strong/);
  assert.match(source, /dream-banshee-seam-s1/);
  assert.match(source, /dream-banshee-seam-s2/);
  assert.match(source, /dream-banshee-seam-s3/);
  assert.match(source, /dream-banshee-energy-origin/);
  assert.match(source, /dream-banshee-energy-upper/);
  assert.match(source, /dream-banshee-energy-lower/);
  assert.match(source, /dream-banshee-energy-far/);
  assert.match(source, /dream-banshee-conduit-origin/);
  assert.match(source, /dream-banshee-conduit-upper/);
  assert.match(source, /dream-banshee-conduit-lower/);
  assert.match(source, /dream-banshee-spine-plate/);
  assert.match(source, /dream-banshee-content-mask/);
  assert.match(source, /dream-banshee-composer-occluder/);
  assert.match(source, /maskUnits="userSpaceOnUse"/);
  assert.match(source, /composerBox\.left - shellBox\.left/);
  assert.match(source, /composerBox\.top - shellBox\.top/);
  assert.match(source, /const composer = composerResult\.node/);
  assert.match(source, /data-dream-composer-host/);
  assert.match(source, /data-dream-composer-context/);
  assert.match(source, /home\.contains\(composerResult\.node\)/);
  assert.doesNotMatch(source, /home\?\.querySelector\("\.composer-surface-chrome"\)/);
  assert.match(source, /viewBox="0 0 1261 941" preserveAspectRatio="none"/);
  assert.match(source, /dream-banshee-top-plate-fill/);
  assert.match(source, /threadHeaderResult/);
  assert.match(source, /\[threadHeaderResult, "thread-header"\]/);
  assert.match(source, /dream-banshee-spine-shoulder-fill/);
  assert.match(source, /M410 51H500L510 61H751L761 51H851L841 66H761L751 71H510L500 66H420Z/);
  assert.match(source, /M105 41H211M226 51H410L420 61H500L510 66H751L761 61H841L851 51H1035M1050 41H1156/);
  assert.match(source, /M5 14H167L222 59H1039L1094 14H1256/);
  assert.match(source, /M9 920H83L108 902H1153L1178 920H1252/);
  assert.match(source, /M108 900H1153/);
  assert.doesNotMatch(source, /H354M907 902/);
  const rearSeamIndex = source.indexOf('dream-banshee-seam-rear');
  const foregroundPlateIndex = source.indexOf('dream-banshee-top-plate-fill');
  const spineShoulderIndex = source.indexOf('dream-banshee-spine-shoulder-fill');
  const foregroundSeamIndex = source.indexOf('dream-banshee-seam-front');
  assert.ok(rearSeamIndex > -1 && rearSeamIndex < foregroundPlateIndex);
  assert.ok(foregroundPlateIndex < spineShoulderIndex);
  assert.ok(spineShoulderIndex < foregroundSeamIndex);
  const bansheeMarkup = source.match(/const BANSHEE_CHROME_MARKUP = `([\s\S]*?)`;/)?.[1] ?? "";
  assert.match(bansheeMarkup, /<svg class="dream-banshee-armor-svg"/);
  assert.doesNotMatch(bansheeMarkup, /logo|gundam|unicorn|robot|mecha/i);
  const preview = read("docs/banshee-preview.html");
  assert.match(preview, /viewBox="0 0 1261 941"/);
  assert.match(preview, /dream-banshee-top-plate-fill/);
  assert.match(preview, /dream-banshee-content-mask/);
  assert.match(preview, /dream-banshee-composer-occluder/);
  const spec = read("BANSHEE-SPEC.md");
  assert.match(spec, /minimum seam coverage/);
  assert.match(spec, /Sidebar\/content boundary/);
  assert.match(spec, /full-height straight border does not count/);
  assert.match(spec, /Design-language semantics take precedence/);
  assert.match(spec, /S1 structural boundary/);
  assert.match(spec, /topology reveal/);
});

test("installer is dark-first, persists a port, and restores with compare-and-swap", () => {
  const install = read("scripts/install-dream-skin.ps1");
  const restore = read("scripts/restore-dream-skin.ps1");
  const runtimeState = read("scripts/runtime-state.ps1");
  assert.match(install, /appearanceTheme = 'appearanceTheme = "dark"'/);
  assert.doesNotMatch(install, /appearanceTheme = 'appearanceTheme = "light"'/);
  assert.match(install, /install-transaction\.json/);
  assert.match(install, /beforeValue/);
  assert.match(install, /installedValue/);
  assert.match(restore, /currentLine -ne \[string\]\$change\.installedValue/);
  assert.match(restore, /Preserved user-modified setting/);
  assert.match(install, /createdHash = \(Get-FileHash/);
  assert.match(install, /shortcuts = if \(\$previousTransaction/);
  assert.match(install, /Write-DreamSkinJsonAtomic -Path \$script:TransactionPath/);
  assert.match(restore, /currentHash -ne \$createdHash/);
  assert.match(restore, /Preserved user-modified shortcut/);
  assert.match(restore, /Remove-Item -LiteralPath \$StateRoot -Recurse -Force/);
  assert.match(runtimeState, /IPAddress\]::Loopback/);
  assert.match(runtimeState, /IPAddress\]::IPv6Loopback/);
  assert.match(runtimeState, /DualMode = \$false/);
  assert.match(runtimeState, /Write-DreamSkinTextAtomic/);
  const startScript = read("scripts/start-dream-skin.ps1");
  const standalone = read("scripts/standalone-runtime.ps1");
  const watcher = read("scripts/watch-dream-skin.ps1");
  assert.match(standalone, /Get-AuthenticodeSignature/);
  assert.match(standalone, /SignatureKind -ne 'Store'/);
  assert.match(standalone, /PublisherId -ne \$script:DreamSkinExpectedPublisherId/);
  assert.match(standalone, /Status -ne 'Ok'/);
  assert.match(standalone, /StartsWith\(\$parentFull, \[StringComparison\]::OrdinalIgnoreCase\)/);
  assert.match(standalone, /Status -notin @\('Valid', 'NotSigned'\)/);
  assert.match(standalone, /\.codex-dream-skin-runtime\.json/);
  assert.match(standalone, /robocopy\.exe/);
  assert.match(standalone, /\/COPY:DAT/);
  assert.match(standalone, /\/DCOPY:DAT/);
  assert.doesNotMatch(standalone, /\/COPYALL|\/MIR/);
  assert.match(standalone, /Get-FileHash -LiteralPath \$fullPath -Algorithm SHA256/);
  assert.match(standalone, /\.staging-/);
  assert.match(standalone, /Refusing to replace an unowned runtime directory/);
  assert.match(startScript, /Ensure-DreamSkinStandaloneRuntime/);
  assert.ok(startScript.indexOf("Ensure-DreamSkinStandaloneRuntime") < startScript.indexOf("Stop-CodexCompletely"));
  assert.match(startScript, /Start-Process -FilePath \$StandaloneRuntime\.Executable -WorkingDirectory \$StandaloneRuntime\.Root/);
  assert.match(startScript, /StringComparison\]::OrdinalIgnoreCase/);
  assert.match(startScript, /\$maxLaunchAttempts = 1/);
  assert.match(startScript, /automatic retry is disabled/);
  assert.match(startScript, /Get-NetTCPConnection/);
  assert.match(watcher, /Get-DreamSkinStandaloneRuntime/);
  assert.doesNotMatch(watcher, /Ensure-DreamSkinStandaloneRuntime/);
  assert.match(watcher, /watcher will not rebuild it or restart Codex/);
  assert.match(install, /Ensure-DreamSkinStandaloneRuntime/);
  assert.match(install, /runtimePackageFullName/);
});
test("target selection rejects auxiliary and non-loopback renderers", () => {
  const base = { type: "page", url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9335/devtools/page/1" };
  assert.equal(isMainRendererTarget(base), true);
  assert.equal(isMainRendererTarget({ ...base, url: "app://-/index.html?initialRoute=/avatar-overlay" }), false);
  assert.equal(isMainRendererTarget({ ...base, webSocketDebuggerUrl: "ws://192.168.1.20:9335/devtools/page/1" }), false);
  assert.equal(isMainRendererTarget({ ...base, type: "devtools" }), false);
  assert.equal(isLoopbackEndpoint("ws://[::1]:9335/devtools/page/1", ["ws:"]), true);
  assert.equal(isLoopbackEndpoint("ws://localhost:9335/devtools/page/1", ["ws:"]), false);
  const result = classifyTargets([
    base,
    { ...base, url: "app://-/index.html?initialRoute=/avatar-overlay" },
    { type: "page", url: "https://example.com", webSocketDebuggerUrl: "ws://127.0.0.1:9335/devtools/page/2" }
  ]);
  assert.deepEqual([result.main.length, result.auxiliary.length, result.rejected.length], [1, 1, 1]);
});

test("live verifier reports synchronized Banshee motion and native capability hit targets", () => {
  const injector = read("scripts/injector.mjs");
  assert.match(injector, /--open-new-task/);
  assert.match(injector, /async function openNewTask/);
  assert.match(injector, /stablePasses/);
  assert.match(injector, /verified\.cards\.length >= 1/);
  assert.match(injector, /filter\(\(card\) => card\.width > 0 && card\.height > 0\)/);
  assert.match(injector, /dream-banshee-\(wave\|seam-travel\|conduit-breathe\)/);
  assert.match(injector, /startTimeSkewMs/);
  assert.match(injector, /styleVersion:/);
  assert.match(injector, /threadHeaderPass/);
  assert.match(injector, /result\.topRegion\.pass/);
  assert.match(injector, /probeTopControl/);
  assert.match(injector, /Input\.dispatchMouseEvent/);
  assert.match(injector, /cardDiagnostics/);
  assert.match(injector, /composerAncestry/);
  assert.match(injector, /composerStyle/);
  assert.match(injector, /composerStackChildren/);
  assert.match(injector, /composerContextTree/);
  assert.match(injector, /waveStartSkewMs <= 1/);
  assert.match(injector, /data-dream-capability/);
  assert.match(injector, /node\.contains\(candidate\)/);
  assert.match(injector, /tagName === 'BUTTON'/);
  assert.match(injector, /svgPresent && control\.hitPass/);
});

test("runtime capability classifier is double-signal and fail-closed", () => {
  const runtime = vm.runInNewContext(read("assets/banshee-runtime.js"));
  const a = { id: "a" }, b = { id: "b" };
  assert.equal(runtime.classifyCandidates([a], () => [true, true]).state, "verified");
  assert.equal(runtime.classifyCandidates([a], () => [true, false]).state, "unknown");
  assert.equal(runtime.classifyCandidates([a, b], () => [true, true]).state, "ambiguous");
  assert.equal(runtime.classifyCandidates([], () => [true, true]).state, "unknown");
  const enhanced = runtime.selectCapabilityEnhancements([
    { key: "microphone", result: { state: "verified" }, parity: { pass: false } },
    { key: "fast-mode", result: { state: "verified" }, parity: { pass: true } },
  ]);
  assert.deepEqual(Array.from(enhanced), ["fast-mode"]);
});

test("native control parity preserves identity and SVG while allowing state changes", () => {
  const runtime = vm.runInNewContext(read("assets/banshee-runtime.js"));
  const make = (svg = "<svg>A</svg>") => ({
    tagName: "BUTTON", tabIndex: 0, disabled: false,
    attributes: new Map([["aria-label", "Fast mode"], ["aria-pressed", "false"]]),
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    querySelector(selector) { return selector === "svg" ? { outerHTML: svg } : null; },
    getBoundingClientRect() { return { x: 1, y: 2, width: 30, height: 30 }; },
  });
  const node = make();
  const baseline = runtime.snapshotControl(node);
  node.attributes.set("aria-pressed", "true");
  assert.equal(runtime.compareControl(baseline, node).pass, true);
  assert.deepEqual(Array.from(runtime.compareControl(baseline, make()).reasons), ["identity"]);
  assert.ok(runtime.compareControl(baseline, make("<svg>B</svg>")).reasons.includes("svgHash"));
  const changedState = make("<svg>native-on</svg>");
  const refreshed = runtime.snapshotControl(changedState);
  assert.equal(runtime.compareControl(refreshed, changedState).pass, true);
  const hidden = make();
  hidden.getBoundingClientRect = () => ({ x: 1, y: 2, width: 0, height: 0 });
  assert.ok(runtime.compareControl(baseline, hidden, () => ({ display: "block", visibility: "visible", opacity: "1" })).reasons.includes("visibility"));
  assert.ok(runtime.compareControl(baseline, node, () => ({ display: "block", visibility: "visible", opacity: "1" }), () => false).reasons.includes("hitTarget"));
});

test("runtime ownership, artless switching, wave propagation, and burst debounce are behavioral", () => {
  const runtime = vm.runInNewContext(read("assets/banshee-runtime.js"));
  const attrs = new Map([["role", "native"]]);
  const node = { hasAttribute: (k) => attrs.has(k), getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
  const ownership = runtime.createOwnershipRegistry();
  ownership.set(node, "role", "skin"); ownership.set(node, "data-added", "yes");
  ownership.restore();
  assert.equal(attrs.get("role"), "native"); assert.equal(attrs.has("data-added"), false);
  const nativeChild = {}, overlay = {}, decoration = {}, body = {};
  const hitNode = { contains: (candidate) => candidate === nativeChild };
  const styleFor = (candidate) => ({ pointerEvents: candidate === decoration ? "none" : "auto" });
  assert.equal(runtime.hitTestControl(hitNode, [nativeChild, body], styleFor), true);
  assert.equal(runtime.hitTestControl(hitNode, [decoration, nativeChild, body], styleFor), true);
  assert.equal(runtime.hitTestControl(hitNode, [overlay, nativeChild, body], styleFor), false);  assert.equal(runtime.artVariables(null), null);
  assert.match(runtime.artVariables({ home: "h", chat: "c" })["--dream-home-art"], /h/);
  assert.deepEqual([0, .25, .5, 1].map((d) => runtime.propagationDelay(d, 1700)), [0, 425, 850, 1700]);
  const pseudoWave = { animationName: "dream-banshee-wave", effect: { pseudoElement: "::after" } };
  assert.equal(runtime.isBansheeWaveAnimation(pseudoWave), true);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-seam-travel" }), true);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-conduit-breathe" }), true);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "native-spinner" }), false);
  let nextId = 0, callbacks = new Map(), runs = 0;
  const scheduleTimer = (fn) => { const id = ++nextId; callbacks.set(id, fn); return id; };
  const clearTimer = (id) => callbacks.delete(id);
  const scheduler = runtime.createDebouncedScheduler(scheduleTimer, clearTimer, () => runs++, 180);
  for (let i = 0; i < 1000; i++) scheduler.schedule();
  assert.equal(callbacks.size, 1);
  [...callbacks.values()][0]();
  assert.equal(runs, 1);
});

test("motion fallbacks avoid disabling arbitrary native descendants and preserve legacy glyphs", () => {
  const banshee = read("styles/banshee/style.css");
  const reduced = banshee.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(reduced, /dream-pack-banshee[^,{]*\s\*/);
  const forced = banshee.match(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(forced, /\[data-dream-surface="cards"\] button,/);
  assert.match(forced, /background: Canvas !important/);
  assert.match(forced, /box-shadow: none !important/);
  const renderer = read("assets/renderer-inject.js");
  assert.match(renderer, /<span class="dream-note">♫<\/span>/);
  assert.match(renderer, /<div class="dream-ribbon" aria-hidden="true"><span>♡<\/span>🎀<span>✦<\/span><\/div>/);
});
test("shortcut ownership state machine distinguishes reinstall and user modification", () => {
  const install = read("scripts/install-dream-skin.ps1");
  assert.match(install, /Get-DreamSkinShortcutDisposition/);
  assert.match(install, /State -eq 'modified'/);
  assert.match(install, /State -ne 'unregistered'/);
});
