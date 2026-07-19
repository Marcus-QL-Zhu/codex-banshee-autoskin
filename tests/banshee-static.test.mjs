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
  assert.match(theme.tokens["--dream-banshee-wave-cycle"], /^10s$/);
  assert.equal(theme.tokens["--dream-banshee-energy-core"], "#d9a23e");
  assert.equal(theme.tokens["--dream-banshee-accent-gold"], "#f0c56f");
  assert.equal(theme.tokens["--dream-banshee-emission-deep-rgb"], "143, 50, 6");
  assert.equal(theme.tokens["--dream-banshee-emission-rest-rgb"], "183, 68, 8");
  assert.equal(theme.tokens["--dream-banshee-emission-body-rgb"], "244, 119, 22");
  assert.equal(theme.tokens["--dream-banshee-emission-crest-rgb"], "255, 173, 54");
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
  assert.doesNotMatch(css, /dream-banshee-seam-travel/);
  assert.match(css, /dream-banshee-conduit-breathe/);
  assert.doesNotMatch(css, /dream-banshee-energy-upper/);
  assert.doesNotMatch(css, /dream-banshee-energy-lower/);
  assert.doesNotMatch(css, /animation-delay:/);
  assert.match(css, /linear-gradient\(160deg,#121f32,#050b14\) !important;/);
  assert.match(css, /isolation:isolate;/);
  assert.match(css, /dream-banshee-seam-s1/);
  assert.match(css, /dream-banshee-seam-s2/);
  const cavityRestLightRule = css.match(/\.dream-banshee-cavity-rest-light\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(cavityRestLightRule, /fill:rgba\(var\(--dream-banshee-emission-rest-rgb\),\.07\)/);
  assert.match(cavityRestLightRule, /stroke:none/);
  assert.doesNotMatch(cavityRestLightRule, /animation|filter|drop-shadow/);
  assert.match(css, /animation:dream-banshee-cavity-pulse var\(--dream-banshee-wave-cycle\) linear infinite/);
  assert.match(css, /0% \{ opacity:1; transform:translateY\(-256\.876%\); \}/);
  assert.match(css, /31\.99% \{ opacity:1; transform:translateY\(93\.289%\); \}/);
  assert.match(css, /32%,100% \{ opacity:0; transform:translateY\(-256\.876%\); \}/);
  assert.match(css, /transform-box:view-box/);
  assert.match(css, /\.dream-banshee-cavity-pulse-band[\s\S]*?animation:none !important;[\s\S]*?opacity:0 !important;/);
  const hiddenSuggestions = css.match(/\[data-dream-surface="cards"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(hiddenSuggestions, /display:none !important/);
  assert.doesNotMatch(css, /\[data-dream-surface="cards"\] button/);
  assert.doesNotMatch(css, /animation-delay:780ms/);
  assert.doesNotMatch(css, /grid-template-columns:repeat\(4/);
  assert.match(css, /\[data-dream-composer-host="home"\]/);
  assert.match(css, /max-width:min\(1132px,max\(480px,calc\(100vw - clamp\(386px,33vw,576px\)\)\)\) !important/);
  assert.match(css, /min-height:clamp\(108px,12\.7vh,116px\) !important/);
  assert.match(css, /\[data-dream-composer-context="home"\]/);
  assert.match(css, /clip-path:polygon\(12px 0,calc\(100% - 12px\) 0,100% 12px/);
  assert.match(css, /--dream-banshee-composer-top-seam:rgba\(var\(--dream-banshee-emission-bloom-rgb\),\.46\)/);
  assert.match(css, /--dream-banshee-composer-top-seam:rgba\(var\(--dream-banshee-emission-active-rgb\),\.64\)/);
  assert.match(css, /var\(--dream-banshee-composer-top-seam\)/);
  assert.match(css, /inset 0 4px 0 var\(--dream-banshee-composer-top-seam\)/);
  assert.match(css, /border:0 !important/);
  assert.match(css, /clip-path:polygon\(10px 0,calc\(100% - 10px\) 0,100% 10px/);
  assert.match(css, /\[data-dream-surface="composer"\]:focus-within/);
  assert.match(css, /\[data-dream-sidebar-crown-controls="true"\]\s*\{[\s\S]*?transform:translateY\(-6px\)/);
  const sidebarRowPlate = css.match(/\[data-app-action-sidebar-thread-row\]::before\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(sidebarRowPlate, /pointer-events:none/);
  assert.match(sidebarRowPlate, /clip-path:polygon\(0 0,calc\(100% - 9px\) 0,100% 9px/);
  assert.match(sidebarRowPlate, /transition:opacity 160ms ease,filter 160ms ease/);
  const selectedPlate = css.match(/\[data-app-action-sidebar-thread-row\]\[data-app-action-sidebar-thread-active="true"\]::before\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(selectedPlate, /opacity:1/);
  assert.match(selectedPlate, /rgba\(var\(--dream-banshee-emission-active-rgb\),\.78\)/);
  assert.doesNotMatch(selectedPlate, /border:\s*1px solid rgba\(217,162,62/);
  const fastThreadStatus = css.match(/\[data-dream-fast="on"\] \[data-app-action-sidebar-thread-row\] \.size-2\.rounded-full\.bg-token-charts-yellow\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fastThreadStatus, /background-color:var\(--dream-banshee-energy-core\) !important/);
  assert.match(fastThreadStatus, /box-shadow:0 0 7px rgba\(var\(--dream-banshee-emission-crest-rgb\),\.42\) !important/);
  const composerEnergy = css.match(/\[data-dream-surface="composer"\]::after\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(composerEnergy, /left:10px/);
  assert.match(composerEnergy, /right:10px/);
  assert.equal((composerEnergy.match(/linear-gradient/g) ?? []).length, 2);
  assert.match(composerEnergy, /background-size:2% 100%,2% 100%/);
  const composerWave = css.match(/@keyframes dream-banshee-wave \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(composerWave, /4\.8%/);
  assert.match(composerWave, /11\.52%/);
  assert.match(composerWave, /29\.76%/);
  assert.match(composerWave, /30%,100% \{\s*opacity:0/);
  assert.match(composerWave, /background-size:33% 100%,33% 100%/);
  assert.match(composerWave, /background-position:34% 0,66% 0/);
  assert.match(composerWave, /background-size:24% 100%,24% 100%/);
  assert.match(composerWave, /background-position:0 0,100% 0/);
  const centerCavityPulse = css.match(/\.dream-banshee-center-cavity-pulse-field \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(centerCavityPulse, /background-size:300% 100%/);
  assert.equal((centerCavityPulse.match(/linear-gradient/g) ?? []).length, 1);
  assert.match(centerCavityPulse, /rgba\(var\(--dream-banshee-emission-deep-rgb\),0\) 0/);
  assert.match(centerCavityPulse, /rgba\(var\(--dream-banshee-emission-crest-rgb\),\.62\) 50%/);
  assert.doesNotMatch(centerCavityPulse, /var\(--dream-banshee-energy-active\)/);
  assert.match(centerCavityPulse, /animation:dream-banshee-center-cavity-wave/);
  const centerCavityWave = css.match(/@keyframes dream-banshee-center-cavity-wave \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(centerCavityWave, /background-size:300% 100%/);
  assert.doesNotMatch(centerCavityWave, /background-position:0 0,100% 0/);
  assert.doesNotMatch(centerCavityWave, /mask-size/);
  assert.match(centerCavityWave, /2\.65%/);
  assert.match(centerCavityWave, /15\.88%/);
  assert.match(centerCavityWave, /30%,100% \{\s*opacity:0/);
  assert.doesNotMatch(css, /(^|[\s,>])svg\b/m);
  assert.doesNotMatch(css, /outline\s*:\s*none/i);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
  const awakeningTokens = css.match(/\[data-dream-fast="on"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(awakeningTokens, /--dream-banshee-emission-deep-rgb:0,52,58/);
  assert.match(awakeningTokens, /--dream-banshee-emission-rest-rgb:0,112,128/);
  assert.match(awakeningTokens, /--dream-banshee-emission-body-rgb:64,200,176/);
  assert.match(awakeningTokens, /--dream-banshee-emission-crest-rgb:184,255,228/);
  assert.match(awakeningTokens, /--dream-banshee-emission-bloom-rgb:64,200,176/);
  const fastFileReference = css.match(/\[data-dream-fast="on"\] \[data-file-reference="true"\] \.inline-mention-brand-aware\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fastFileReference, /--inline-mention-base-color:color-mix\(in srgb,rgb\(var\(--dream-banshee-emission-body-rgb\)\) 82%,var\(--dream-banshee-text-primary\) 18%\) !important/);
  assert.match(fastFileReference, /--inline-mention-resolved-base-color:var\(--inline-mention-base-color\) !important/);
  assert.match(fastFileReference, /--inline-mention-color:var\(--inline-mention-resolved-base-color\) !important/);
  assert.doesNotMatch(fastFileReference, /(?:^|\n)\s*(?:color|pointer-events|display|visibility):/);
  const fastSliderRange = css.match(/\[data-dream-fast="on"\] \[data-model-picker-power-slider\] \[data-fast-mode="true"\] \[class\*="_Range_"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fastSliderRange, /background-color:var\(--dream-banshee-energy-core\) !important/);
  const fastSliderParticles = css.match(/\[data-dream-fast="on"\] \[data-model-picker-power-slider\] \[data-fast-mode="true"\] \[class\*="_TrackParticle_"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fastSliderParticles, /background-color:rgba\(var\(--dream-banshee-emission-crest-rgb\),\.78\) !important/);
  const fastMarkerRule = css.match(/\[data-dream-fast="on"\] \[data-fast-mode-enabled="true"\],[\s\S]*?\[class\*="ModelPickerTriggerInlineFastIcon"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(fastMarkerRule, /color:var\(--dream-banshee-energy-core\) !important/);
  for (const fastNativeBlock of [fastSliderRange, fastSliderParticles, fastMarkerRule]) {
    assert.doesNotMatch(fastNativeBlock, /(?:^|\n)\s*(?:pointer-events|display|visibility|width|height|transform):/);
  }
  assert.doesNotMatch(css, /rgba\((?:217,162,62|240,197,111|183,68,8|143,50,6|219,90,13|244,119,22|255,173,54|255,140,32),/);
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
  assert.match(source, /const STYLE_VERSION = "41"/);
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
  assert.doesNotMatch(source, /dream-banshee-energy-origin/);
  assert.doesNotMatch(source, /dream-banshee-energy-upper/);
  assert.doesNotMatch(source, /dream-banshee-energy-lower/);
  assert.doesNotMatch(source, /dream-banshee-energy-far/);
  assert.doesNotMatch(source, /dream-banshee-conduit-origin/);
  assert.match(source, /dream-banshee-conduit-upper/);
  assert.doesNotMatch(source, /dream-banshee-conduit-lower/);
  assert.match(source, /dream-banshee-spine-plate/);
  assert.match(source, /dream-banshee-cavity-upper-rail" d="M0 65L35 101V188L18 207V700H7V214L28 191V108L0 77Z"/);
  assert.match(source, /dream-banshee-cavity-upper-rail" transform="translate\(1261 0\) scale\(-1 1\)" d="M0 65L35 101V188L18 207V700H7V214L28 191V108L0 77Z"/);
  const cavityMarkup = source.match(/<g class="dream-banshee-cavity">([\s\S]*?)<\/g>/)?.[1] ?? "";
  const cavityLightMarkup = source.match(/<g class="dream-banshee-cavity-rest-light">([\s\S]*?)<\/g>/)?.[1] ?? "";
  const centerRestLightMarkup = source.match(/<g class="dream-banshee-cavity-rest-light dream-banshee-cavity-rest-light-center">([\s\S]*?)<\/g>/)?.[1] ?? "";
  const cavityPaths = [...cavityMarkup.matchAll(/<path(?: class="[^"]+")?(?: transform="([^"]+)")? d="([^"]+)"\/>/g)].map((match) => (match[1] ?? "") + "|" + match[2]);
  assert.equal(cavityPaths.length, 4);
  const sideRestLightPath = "M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z";
  assert.ok(cavityLightMarkup.includes('<path class="dream-banshee-cavity-rest-light-side" d="' + sideRestLightPath + '"/>'));
  assert.ok(cavityLightMarkup.includes('<path class="dream-banshee-cavity-rest-light-side" transform="translate(1261 0) scale(-1 1)" d="' + sideRestLightPath + '"/>'));
  const centerRestLightPath = "M492 49H517L530 56H731L744 49H769L756 66H505Z";
  assert.doesNotMatch(cavityLightMarkup, /M492 49H517L530 56H731L744 49H769L756 66H505Z/);
  assert.ok(centerRestLightMarkup.includes('<path d="' + centerRestLightPath + '"/>'));
  assert.ok(source.indexOf('<g class="dream-banshee-spine-plate">') < source.indexOf('<g class="dream-banshee-cavity-rest-light dream-banshee-cavity-rest-light-center">'));
  assert.ok(source.indexOf('<g class="dream-banshee-cavity-rest-light dream-banshee-cavity-rest-light-center">') < source.indexOf('<g class="dream-banshee-center-cavity-pulse"'));
  assert.ok(source.indexOf('<g class="dream-banshee-center-cavity-pulse"') < source.indexOf('<g class="dream-banshee-seam-s3 dream-banshee-conduit dream-banshee-conduit-static">'));
  assert.match(source, /id="dream-banshee-center-cavity-clip" clipPathUnits="userSpaceOnUse"/);
  assert.match(source, /<foreignObject x="492" y="49" width="277" height="17">/);
  assert.match(source, /class="dream-banshee-center-cavity-pulse-field"/);
  assert.match(source, /id="dream-banshee-cavity-pulse-clip" clipPathUnits="userSpaceOnUse"/);
  assert.match(source, /id="dream-banshee-cavity-pulse-fill" x1="0" y1="0" x2="0" y2="1"/);
  assert.match(source, /class="dream-banshee-emission-stop-deep" offset="0" stop-opacity="0"/);
  assert.match(source, /class="dream-banshee-emission-stop-crest" offset="\.5" stop-opacity="\.62"/);
  assert.match(source, /class="dream-banshee-cavity-pulse-band" x="0" y="0" width="1261" height="2400"/);
  assert.doesNotMatch(source, /dream-banshee-cavity-(?:lamp|tube)/);
  const cavityOutlineMarkup = source.match(/<g class="dream-banshee-cavity-outline">([\s\S]*?)<\/g>/)?.[1] ?? "";
  assert.ok(cavityOutlineMarkup.includes('<path d="' + sideRestLightPath + '"/>'));
  assert.ok(cavityOutlineMarkup.includes('<path transform="translate(1261 0) scale(-1 1)" d="' + sideRestLightPath + '"/>'));
  assert.doesNotMatch(source, /dream-banshee-cavity-(?:upper-cut|conduit-slot|return-cut|long-slot)/);
  assert.doesNotMatch(source, /dream-banshee-conduit-upper" d="M31\.5 113V184"/);
  assert.doesNotMatch(source, /dream-banshee-conduit-upper" d="M1229\.5 113V184"/);
  assert.doesNotMatch(source, /dream-banshee-conduit-lower" d="M34 743V837"/);
  assert.doesNotMatch(source, /dream-banshee-conduit-lower" d="M1227 743V837"/);
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
  assert.match(source, /bansheeRuntime\.isFastAwakeningActive\(fastModeResult, fastModeParity\)/);
  assert.match(source, /data-codex-intelligence-trigger/);
  assert.match(source, /data-composer-navigation-target/);
  assert.match(source, /root\.setAttribute\("data-dream-fast", "on"\)/);
  assert.match(source, /const SIDEBAR_SEARCH_LABELS = new Set\(\["Search", "\\u641c\\u7d22"\]\)/);
  assert.match(source, /data-dream-sidebar-crown-controls/);
  assert.match(source, /for \(let node = searchCandidates\[0\]\.parentElement; node && node !== sidePanel; node = node\.parentElement\)/);
  assert.match(source, /crownButtons\.length === 2/);
  assert.match(source, /attributeFilter: \["aria-pressed"\]/);
  assert.match(source, /\[threadHeaderResult, "thread-header"\]/);
  assert.match(source, /dream-banshee-spine-shoulder-fill/);
  assert.match(source, /M410 51H500L510 61H751L761 51H851L841 66H761L751 71H510L500 66H420Z/);
  assert.match(source, /M105 41H211M226 51H410L420 61H500L510 66H751L761 61H841L851 51H1035M1050 41H1156/);
  assert.match(source, /M5 14H167L222 59H1039L1094 14H1256/);
  assert.match(source, /dream-banshee-conduit-upper" d="M5 6H171"/);
  assert.match(source, /dream-banshee-conduit-upper" d="M1090 6H1256"/);
  assert.match(source, /M9 920H83L108 902H1153L1178 920H1252/);
  assert.doesNotMatch(source, /M108 900H1153/);
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
  assert.match(preview, /dream-banshee-conduit-upper" d="M5 6H171"/);
  assert.match(preview, /dream-banshee-conduit-upper" d="M1090 6H1256"/);
  assert.doesNotMatch(preview, /dream-banshee-conduit-upper" d="M31\.5 113V184"/);
  assert.doesNotMatch(preview, /dream-banshee-conduit-upper" d="M1229\.5 113V184"/);
  assert.doesNotMatch(preview, /dream-banshee-conduit-lower/);
  assert.doesNotMatch(preview, /dream-banshee-conduit-origin/);
  assert.match(preview, /dream-banshee-cavity-upper-rail" d="M0 65L35 101V188L18 207V700H7V214L28 191V108L0 77Z"/);
  assert.match(preview, /dream-banshee-cavity-upper-rail" transform="translate\(1261 0\) scale\(-1 1\)"/);
  assert.doesNotMatch(preview, /dream-banshee-cavity-(?:upper-cut|conduit-slot|return-cut|long-slot)/);
  assert.doesNotMatch(preview, /dream-banshee-conduit-travel|dream-banshee-energy-(?:origin|upper|lower|far)/);
  assert.doesNotMatch(preview, /data-dream-surface="cards"/);
  const spec = read("BANSHEE-SPEC.md");
  assert.match(spec, /minimum seam coverage/);
  assert.match(spec, /Sidebar\/content boundary/);
  assert.match(spec, /full-height straight border does not count/);
  assert.match(spec, /Design-language semantics take precedence/);
  assert.match(spec, /S1 structural boundary/);
  assert.match(spec, /topology reveal/);
  assert.match(spec, /two elongated luminous bands/);
  assert.match(spec, /old short frame `seam-travel` crest remains removed completely/);
  assert.match(spec, /completes its breathing pass in exactly `3s`/i);
  assert.match(spec, /centered gradient canvas equal to `300%` of the cavity width/i);
  assert.match(spec, /one shared `10s` global cycle/);
  assert.match(spec, /all dynamic zones begin brightening within ≤100ms/);
  assert.match(spec, /continuous vertical luminance field/);
  assert.match(spec, /never a stack of visible lamp or tube primitives/);
  assert.match(spec, /independent upper\/lower vertical conduit strokes are removed/i);
  assert.match(spec, /native file-reference mentions rendered inside conversation content/i);
  assert.match(spec, /suggestion-shortcut group is intentionally suppressed/);
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
  assert.match(watcher, /function Sync-DreamSkinStandaloneRuntime/);
  assert.match(watcher, /function Update-DreamSkinRuntimeRecord/);
  assert.match(watcher, /Get-DreamSkinStandaloneRuntime/);
  assert.match(watcher, /Ensure-DreamSkinStandaloneRuntime/);
  assert.ok(watcher.indexOf("Ensure-DreamSkinStandaloneRuntime") < watcher.indexOf("Detected Codex launched without Dream Skin"));
  assert.match(watcher, /the running Codex process was not interrupted during the copy/);
  assert.match(watcher, /Codex will keep running without structural injection/);
  assert.match(watcher, /runtimePackageFullName/);
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
  assert.match(injector, /verified\.suggestionsSuppressed === true/);
  assert.match(injector, /result\.suggestionsSuppressed = suggestionsSuppressed/);
  assert.match(injector, /waveAnimations\.length >= 5/);
  assert.match(injector, /filter\(\(card\) => card\.width > 0 && card\.height > 0\)/);
  assert.match(injector, /dream-banshee-\(wave\|center-cavity-wave\|conduit-breathe\|cavity-pulse\)/);
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
  assert.match(injector, /fastAwakeningActive/);
  assert.match(injector, /result\.fastAwakening\.pass/);
  assert.match(injector, /nativeFastIndicator/);
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
  const fastNode = { getAttribute: (name) => name === "aria-pressed" ? "true" : null };
  assert.equal(runtime.isFastAwakeningActive({ state: "verified", node: fastNode }, { pass: true }), true);
  assert.equal(runtime.isFastAwakeningActive({ state: "verified", node: fastNode }, { pass: false }), false);
  assert.equal(runtime.isFastAwakeningActive({ state: "ambiguous", node: fastNode }, { pass: true }), false);
  assert.equal(runtime.isFastAwakeningActive({ state: "verified", node: { getAttribute: () => "false" } }, { pass: true }), false);
  const inlineIcon = {
    getAttribute: (name) => name === "class" ? "_ModelPickerTriggerInlineFastIcon_hash" : name === "viewBox" ? "0 0 24 24" : null,
    querySelector: (selector) => selector === 'path[fill="currentColor"]' ? {} : null,
  };
  const modelPicker = { getAttribute: () => null, querySelectorAll: () => [inlineIcon] };
  assert.equal(runtime.fastModeState({ state: "verified", node: modelPicker }, { pass: true }), "on");
  assert.equal(runtime.fastModeState({ state: "verified", node: { getAttribute: () => null, querySelectorAll: () => [] } }, { pass: true }), "off");
  assert.equal(runtime.fastModeState({ state: "verified", node: modelPicker }, { pass: false }), "unavailable");
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
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-seam-travel" }), false);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-center-cavity-wave" }), true);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-conduit-breathe" }), true);
  assert.equal(runtime.isBansheeWaveAnimation({ animationName: "dream-banshee-cavity-pulse" }), true);
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
  assert.doesNotMatch(forced, /\[data-dream-surface="cards"\] button/);
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
