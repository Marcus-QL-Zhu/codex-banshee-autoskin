((cssText, artAssets, manifest, bansheeRuntime) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  // Legacy id from v1: the interactive switch container was removed by design
  // (theme/layout changes are programmatic now — scripts/set-theme.mjs), but we
  // keep deleting any stale container an older injection may have left behind.
  const LEGACY_CONTROLS_ID = "codex-dream-skin-controls";
  const INJECTION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const LAYOUT_STORAGE_KEY = "codex-dream-skin.layout";
  const THEME_STORAGE_KEY = "codex-dream-skin.theme";
  const STYLE_VERSION = "38";
  const LAYOUTS = new Set(["banner", "fullscreen"]);
  // Sidebar "new task" row gets a marker class so the structure CSS can restyle
  // it as a capsule. Text matching only; the real button stays fully native.
  const NEW_TASK_LABELS = ["新建任务", "New task"];
  const MICROPHONE_LABELS = new Set(["Microphone", "Voice input", "Dictation", "麦克风", "语音输入", "听写"]);
  const FAST_MODE_LABELS = new Set(["Fast mode", "快速模式"]);
  // Canonical Banshee shell geometry is traced in the approved reference's
  // 1261 x 941 main-frame coordinate space. Rear seams are painted first;
  // the opaque shoulder band then hides their construction overlap before
  // the visible foreground contour is painted. This preserves the approved
  // layered silhouette without exposing accidental X/T intersections.
  const BANSHEE_CHROME_MARKUP = `
    <svg class="dream-banshee-armor-svg" viewBox="0 0 1261 941" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <mask id="dream-banshee-content-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="1261" height="941" style="mask-type:luminance">
          <rect width="1261" height="941" fill="#fff"/>
          <rect class="dream-banshee-composer-occluder" x="0" y="0" width="0" height="0" fill="#000"/>
        </mask>
        <clipPath id="dream-banshee-cavity-pulse-clip" clipPathUnits="userSpaceOnUse">
          <path d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
          <path transform="translate(1261 0) scale(-1 1)" d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
        </clipPath>
        <clipPath id="dream-banshee-center-cavity-clip" clipPathUnits="userSpaceOnUse">
          <path d="M492 49H517L530 56H731L744 49H769L756 66H505Z"/>
        </clipPath>
        <linearGradient id="dream-banshee-cavity-pulse-fill" x1="0" y1="0" x2="0" y2="1">
          <stop class="dream-banshee-emission-stop-deep" offset="0" stop-opacity="0"/>
          <stop class="dream-banshee-emission-stop-rest" offset=".12" stop-opacity=".035"/>
          <stop class="dream-banshee-emission-stop-shoulder" offset=".28" stop-opacity=".12"/>
          <stop class="dream-banshee-emission-stop-body" offset=".42" stop-opacity=".36"/>
          <stop class="dream-banshee-emission-stop-crest" offset=".5" stop-opacity=".62"/>
          <stop class="dream-banshee-emission-stop-body" offset=".58" stop-opacity=".36"/>
          <stop class="dream-banshee-emission-stop-shoulder" offset=".72" stop-opacity=".12"/>
          <stop class="dream-banshee-emission-stop-rest" offset=".88" stop-opacity=".035"/>
          <stop class="dream-banshee-emission-stop-deep" offset="1" stop-opacity="0"/>
        </linearGradient>      </defs>
      <g class="dream-banshee-chrome-content" mask="url(#dream-banshee-content-mask)">
      <g class="dream-banshee-plate-fills">
        <path d="M5 46H105L38 105V185L21 201L5 190Z"/>
        <path d="M1256 46H1156L1223 105V185L1240 201L1256 190Z"/>
        <path d="M9 704L21 717V847L103 905H9Z"/>
        <path d="M1252 704L1240 717V847L1158 905H1252Z"/>
      </g>
      <g class="dream-banshee-cavity">
        <path class="dream-banshee-cavity-upper-rail" d="M0 65L35 101V188L18 207V700H7V214L28 191V108L0 77Z"/>
        <path class="dream-banshee-cavity-lower" d="M8 700L42 717V842L34 848L21 836V713Z"/>
        <path class="dream-banshee-cavity-upper-rail" transform="translate(1261 0) scale(-1 1)" d="M0 65L35 101V188L18 207V700H7V214L28 191V108L0 77Z"/>
        <path class="dream-banshee-cavity-lower" d="M1253 700L1219 717V842L1227 848L1240 836V713Z"/>
      </g>
      <g class="dream-banshee-cavity-rest-light">
        <path class="dream-banshee-cavity-rest-light-side" d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
        <path class="dream-banshee-cavity-rest-light-side" transform="translate(1261 0) scale(-1 1)" d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
      </g>
      <g class="dream-banshee-cavity-pulse" clip-path="url(#dream-banshee-cavity-pulse-clip)">
        <rect class="dream-banshee-cavity-pulse-band" x="0" y="0" width="1261" height="2400" fill="url(#dream-banshee-cavity-pulse-fill)"/>
      </g>      <g class="dream-banshee-cavity-outline">
        <path d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
        <path transform="translate(1261 0) scale(-1 1)" d="M0 65L35 101V188L18 207V700L34 717V848L21 836V713L7 700V214L28 191V108L0 77Z"/>
      </g>
      <g class="dream-banshee-seam dream-banshee-seam-s1 dream-banshee-seam-outer dream-banshee-seam-rear">
        <path d="M5 6H171L226 51H1035L1090 6H1256V932H5Z"/>
        <path d="M9 920H83L108 902H1153L1178 920H1252"/>
      </g>
      <g class="dream-banshee-seam dream-banshee-seam-s2 dream-banshee-seam-strong dream-banshee-seam-rear">
        <path d="M105 41H211M226 51H410L420 61H500L510 66H751L761 61H841L851 51H1035M1050 41H1156"/>
        <path d="M105 41L38 104V185L21 201V704L38 720V847L108 900H1153"/>
        <path d="M1156 41L1223 104V185L1240 201V704L1223 720V847L1153 900"/>
      </g>
      <g class="dream-banshee-seam dream-banshee-seam-s2 dream-banshee-seam-inner dream-banshee-seam-rear">
        <path d="M108 48L48 109V191L32 207V698L48 713V838L116 890H1145"/>
        <path d="M1153 48L1213 109V191L1229 207V698L1213 713V838L1145 890"/>
      </g>
      <g class="dream-banshee-top-plate-fill">
        <path d="M5 6H171L226 51H1035L1090 6H1256V14H1094L1039 59H222L167 14H5Z"/>
      </g>
      <g class="dream-banshee-spine-shoulder-fill">
        <path d="M410 51H500L510 61H751L761 51H851L841 66H761L751 71H510L500 66H420Z"/>
      </g>
      <g class="dream-banshee-seam dream-banshee-seam-s1 dream-banshee-seam-outer dream-banshee-seam-front">
        <path d="M5 6H171L226 51H1035L1090 6H1256"/>
      </g>
      <g class="dream-banshee-seam dream-banshee-seam-s2 dream-banshee-seam-inner dream-banshee-seam-front">
        <path d="M5 14H167L222 59H1039L1094 14H1256"/>
      </g>
      <g class="dream-banshee-spine-plate">
        <path d="M492 49H517L530 56H731L744 49H769L756 66H505Z"/>
      </g>
      <g class="dream-banshee-cavity-rest-light dream-banshee-cavity-rest-light-center">
        <path d="M492 49H517L530 56H731L744 49H769L756 66H505Z"/>
      </g>
      <g class="dream-banshee-center-cavity-pulse" clip-path="url(#dream-banshee-center-cavity-clip)">
        <foreignObject x="492" y="49" width="277" height="17">
          <div xmlns="http://www.w3.org/1999/xhtml" class="dream-banshee-center-cavity-pulse-field"></div>
        </foreignObject>
      </g>
      <g class="dream-banshee-seam-s3 dream-banshee-conduit dream-banshee-conduit-static">
        <path class="dream-banshee-conduit-upper" d="M5 6H171"/>
        <path class="dream-banshee-conduit-upper" d="M1090 6H1256"/>
      </g>
      </g>
    </svg>`;
  // All theme knowledge comes from the manifest generated by scripts/injector.mjs
  // out of themes/<name>/theme.json — nothing theme-specific is hardcoded here.
  const THEME_ORDER = manifest.order;
  const THEMES = new Set(THEME_ORDER);
  const THEME_META = manifest.meta;
  const THEME_STICKERS = manifest.stickers ?? {};
  const THEME_PACKS = manifest.packs ?? {};
  const THEME_ART_MODES = manifest.artModes ?? {};
  const DEFAULT_THEME = THEMES.has(manifest.defaultTheme) ? manifest.defaultTheme : THEME_ORDER[0];
  const DEFAULT_LAYOUT = LAYOUTS.has(manifest.defaultLayout) ? manifest.defaultLayout : "fullscreen";
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  previous?.scheduler?.cancel?.();
  previous?.restoreOwned?.();
  const waveEpoch = previous?.waveEpoch ?? (document.timeline?.currentTime ?? 0);
  const ownership = bansheeRuntime.createOwnershipRegistry();
  const setOwnedAttribute = ownership.set;
  const restoreOwned = ownership.restore;
  const createObjectUrl = (dataUrl) => {
    const comma = dataUrl.indexOf(",");
    const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  // Cheap per-theme art fingerprint (data URL lengths + base64 tail). Blob URLs
  // from a previous injection are only reused when the fingerprints still match,
  // so replacing a theme's art file takes effect on live re-injection without a
  // renderer reload (stale blobs are revoked below).
  const artSignature = (assets) =>
    `${assets.home.length}:${assets.home.slice(-24)}|${assets.chat.length}:${assets.chat.slice(-24)}`;
  const artSigs = Object.fromEntries(
    Object.entries(artAssets).map(([theme, assets]) => [theme, artSignature(assets)])
  );
  const previousUrlsUsable = previous?.artUrls && previous?.artSigs &&
    THEME_ORDER.every((theme) => THEME_ART_MODES[theme] === "none" ||
      (previous.artUrls[theme]?.home && previous.artSigs[theme] === artSigs[theme]));
  const artUrls = previousUrlsUsable ? previous.artUrls : Object.fromEntries(
    Object.entries(artAssets).map(([theme, assets]) => [theme, {
      home: createObjectUrl(assets.home),
      chat: assets.chat === assets.home ? null : createObjectUrl(assets.chat),
    }])
  );
  if (!previousUrlsUsable && previous?.artUrls) {
    for (const assets of Object.values(previous.artUrls)) {
      if (assets.home) URL.revokeObjectURL(assets.home);
      if (assets.chat && assets.chat !== assets.home) URL.revokeObjectURL(assets.chat);
    }
  }
  for (const assets of Object.values(artUrls)) {
    if (!assets.chat) assets.chat = assets.home;
  }
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = STYLE_VERSION;
  }

  const readLayout = () => {
    try {
      const storedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (LAYOUTS.has(storedLayout)) return storedLayout;
    } catch {}
    return LAYOUTS.has(previous?.layout) ? previous.layout : DEFAULT_LAYOUT;
  };
  let activeLayout = readLayout();

  const readTheme = () => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (THEMES.has(storedTheme)) return storedTheme;
    } catch {}
    return THEMES.has(previous?.theme) ? previous.theme : DEFAULT_THEME;
  };
  let activeTheme = readTheme();
  let dreamChromeMarkup = previous?.dreamChromeMarkup ?? null;
  let lastCapabilityReport = "";

  const syncThemeMeta = () => {
    const meta = THEME_META[activeTheme];
    const chrome = document.getElementById(CHROME_ID);
    const pack = THEME_PACKS[activeTheme] ?? "dream";
    if (!chrome) return;
    if (pack === "banshee") {
      if (chrome.dataset.dreamPack !== "banshee") {
        chrome.innerHTML = BANSHEE_CHROME_MARKUP;
      }
      chrome.dataset.dreamPack = "banshee";
      chrome.classList.remove("dream-has-bubble", "dream-has-board", "dream-has-corner");
      return;
    }
    if (chrome.dataset.dreamPack !== "dream" && dreamChromeMarkup) chrome.innerHTML = dreamChromeMarkup;
    chrome.dataset.dreamPack = "dream";
    const brand = chrome.querySelector(".dream-brand b");
    const edition = chrome?.querySelector(".dream-brand small");
    const signature = chrome?.querySelector(".dream-signature");
    if (brand) brand.textContent = meta.brand;
    if (edition) edition.textContent = meta.edition;
    if (signature) signature.textContent = meta.signature;
    // Opt-in stickers (theme.json "stickers"): text goes through textContent
    // only, visibility through marker classes consumed by the structure CSS.
    const stickers = THEME_STICKERS[activeTheme] ?? null;
    chrome.classList.toggle("dream-has-bubble", Boolean(stickers?.bubble));
    chrome.classList.toggle("dream-has-board", Boolean(stickers?.board));
    chrome.classList.toggle("dream-has-corner", Boolean(stickers?.corner));
    const bubbleText = chrome.querySelector(".dream-sticker-bubble > span");
    if (bubbleText) bubbleText.textContent = stickers?.bubble?.text ?? "";
    const boardLines = stickers?.board?.lines ?? [];
    chrome.querySelectorAll(".dream-sticker-board > span").forEach((line, index) => {
      line.textContent = boardLines[index] ?? "";
      line.style.display = boardLines[index] ? "" : "none";
    });
  };

  const applyLayout = (layout, persist = true) => {
    activeLayout = LAYOUTS.has(layout) ? layout : DEFAULT_LAYOUT;
    const root = document.documentElement;
    root?.classList.toggle("dream-layout-banner", activeLayout === "banner");
    root?.classList.toggle("dream-layout-fullscreen", activeLayout === "fullscreen");
    if (persist) {
      try { localStorage.setItem(LAYOUT_STORAGE_KEY, activeLayout); } catch {}
    }
  };

  const applyTheme = (theme, persist = true) => {
    activeTheme = THEMES.has(theme) ? theme : DEFAULT_THEME;
    const root = document.documentElement;
    if (root) {
      // Strip every dream-theme-* class (including stale ones from an older
      // manifest), then set the active one.
      for (const cls of [...root.classList]) {
        if ((cls.startsWith("dream-theme-") && cls !== `dream-theme-${activeTheme}`) ||
            (cls.startsWith("dream-pack-") && cls !== `dream-pack-${THEME_PACKS[activeTheme] ?? "dream"}`)) {
          root.classList.remove(cls);
        }
      }
      root.classList.add(`dream-theme-${activeTheme}`);
      root.classList.add(`dream-pack-${THEME_PACKS[activeTheme] ?? "dream"}`);
    }
    const artVars = bansheeRuntime.artVariables(artUrls[activeTheme]);
    for (const name of ["--dream-home-art", "--dream-chat-art", "--dream-art"]) {
      if (artVars) root?.style.setProperty(name, artVars[name]);
      else root?.style.removeProperty(name);
    }
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, activeTheme); } catch {}
    }
    syncThemeMeta();
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    metrics.ensureRuns += 1;
    metrics.globalScans += 1;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("codex-dream-skin");
    applyLayout(activeLayout, false);
    applyTheme(activeTheme, false);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== STYLE_VERSION) {
      style.textContent = cssText;
      style.dataset.dreamVersion = STYLE_VERSION;
    }

    // Fail-closed capability adapter: every structural surface needs one unique
    // candidate and two independent signals before it receives a marker.
    const sideResult = bansheeRuntime.classifyCandidates(
      [...document.querySelectorAll("aside.app-shell-left-panel")],
      (node) => [node.tagName === "ASIDE", node.classList.contains("app-shell-left-panel")]
    );
    const mainResult = bansheeRuntime.classifyCandidates(
      [...document.querySelectorAll("main.main-surface")],
      (node) => [node.tagName === "MAIN", node.classList.contains("main-surface")]
    );
    const composerResult = bansheeRuntime.classifyCandidates(
      [...document.querySelectorAll(".composer-surface-chrome")],
      (node) => [node.classList.contains("composer-surface-chrome"), Boolean(node.querySelector("textarea, [contenteditable='true']"))]
    );
    const cardsResult = bansheeRuntime.classifyCandidates(
      [...document.querySelectorAll(".group\\/home-suggestions")],
      (node) => [node.classList.contains("group/home-suggestions"), node.querySelectorAll("button").length > 0]
    );
    const threadHeaderCandidates = mainResult.node
      ? [...mainResult.node.querySelectorAll(":scope > header.app-header-tint")]
      : [];
    const threadHeaderResult = bansheeRuntime.classifyCandidates(
      threadHeaderCandidates,
      (node) => [
        node.tagName === "HEADER",
        node.classList.contains("app-header-tint"),
        node.parentElement === mainResult.node,
        Boolean(node.querySelector("button")),
      ]
    );
    const homeCandidates = document.querySelectorAll('[role="main"]:has([data-testid="home-icon"])');
    const home = homeCandidates.length === 1 ? homeCandidates[0] : null;
    const composerHost = (() => {
      if (!home || !composerResult.node || !home.contains(composerResult.node)) return null;
      const composerWidth = composerResult.node.getBoundingClientRect().width;
      for (let node = composerResult.node.parentElement; node && node !== mainResult.node; node = node.parentElement) {
        const maxWidth = Number.parseFloat(getComputedStyle(node).maxWidth);
        if (Number.isFinite(maxWidth) && maxWidth >= composerWidth) return node;
      }
      return null;
    })();
    const composerStack = composerResult.node?.parentElement?.parentElement ?? null;
    const contextWrapper = composerStack?.firstElementChild ?? null;
    const composerContext = composerHost &&
      contextWrapper &&
      composerStack?.lastElementChild?.contains(composerResult.node) &&
      contextWrapper.firstElementChild?.getBoundingClientRect().width > 0
        ? contextWrapper.firstElementChild
        : null;
    const requiredResults = [sideResult, mainResult, composerResult];
    if (home) requiredResults.push(cardsResult);
    const verifiedShell = requiredResults.every((result) => result.state === "verified") &&
      !window.__CODEX_DREAM_SKIN_PALETTE_ONLY__;
    const sidePanel = sideResult.node;
    const shellMain = mainResult.node || document.querySelector("main");

    const bansheeActive = (THEME_PACKS[activeTheme] ?? "dream") === "banshee" && verifiedShell;
    const buttons = bansheeActive ? [...document.querySelectorAll("button")] : [];
    const classifyControl = (labels) => bansheeRuntime.classifyCandidates(buttons, (button) => {
      const label = (button.getAttribute("aria-label") || button.getAttribute("title") || "").trim();
      return [labels.has(label), Boolean(button.querySelector("svg"))];
    });
    const microphoneResult = classifyControl(MICROPHONE_LABELS);
    const fastModeResult = bansheeRuntime.classifyCandidates(buttons, (button) => {
      const label = (button.getAttribute("aria-label") || button.getAttribute("title") || "").trim();
      const dedicatedFastControl = FAST_MODE_LABELS.has(label);
      const nativeModelTrigger = button.getAttribute("data-codex-intelligence-trigger") === "true" &&
        button.getAttribute("data-composer-navigation-target") === "reasoning";
      return [dedicatedFastControl || nativeModelTrigger, Boolean(button.querySelector("svg")),
        dedicatedFastControl ? button.hasAttribute("aria-pressed") : nativeModelTrigger];
    });
    const styleForControl = (node) => getComputedStyle(node);
    const hitTestControl = (node, rect) => {
      const stack = document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return bansheeRuntime.hitTestControl(node, stack, styleForControl);
    };

    // Briefly close the structural gate (synchronously, before paint) so every
    // reconciliation snapshots the controls in their current native state. This
    // permits legitimate Fast/microphone glyph changes and React node replacement.
    if (bansheeActive) {
      root.removeAttribute("data-dream-pack-ready");
      root.removeAttribute("data-dream-fast");
      restoreOwned();
    }
    const activationBaselines = new Map();
    for (const [key, result] of [["microphone", microphoneResult], ["fast-mode", fastModeResult]]) {
      if (result.state === "verified") {
        activationBaselines.set(key, bansheeRuntime.snapshotControl(result.node, styleForControl, hitTestControl));
      }
    }

    if (bansheeActive) {
      root.setAttribute("data-dream-pack-ready", "banshee-v1");
      for (const [result, surface] of [
        [sideResult, "sidebar"],
        [mainResult, "main"],
        [composerResult, "composer"],
        [cardsResult, "cards"],
        [threadHeaderResult, "thread-header"],
      ]) {
        if (result.state !== "verified") continue;
        setOwnedAttribute(result.node, "data-dream-surface", surface);
        setOwnedAttribute(result.node, "data-dream-owner", INJECTION_ID);
      }
      if (composerHost) {
        setOwnedAttribute(composerHost, "data-dream-composer-host", "home");
        setOwnedAttribute(composerHost, "data-dream-owner", INJECTION_ID);
      }
      if (composerContext) {
        setOwnedAttribute(composerContext, "data-dream-composer-context", "home");
        setOwnedAttribute(composerContext, "data-dream-owner", INJECTION_ID);
      }
    } else {
      root.removeAttribute("data-dream-pack-ready");
      restoreOwned();
    }

    const microphoneParity = microphoneResult.node && activationBaselines.has("microphone")
      ? bansheeRuntime.compareControl(activationBaselines.get("microphone"), microphoneResult.node, styleForControl, hitTestControl)
      : null;
    const fastModeParity = fastModeResult.node && activationBaselines.has("fast-mode")
      ? bansheeRuntime.compareControl(activationBaselines.get("fast-mode"), fastModeResult.node, styleForControl, hitTestControl)
      : null;
    const capabilityEntries = [
      { key: "microphone", result: microphoneResult, parity: microphoneParity },
      { key: "fast-mode", result: fastModeResult, parity: fastModeParity },
    ];
    const enhancedCapabilities = new Set(bansheeRuntime.selectCapabilityEnhancements(capabilityEntries));
    if (bansheeActive) {
      for (const entry of capabilityEntries) {
        if (!enhancedCapabilities.has(entry.key)) {
          if (entry.result.state === "verified") console.warn(`[dream-skin] ${entry.key} parity failed; its enhancement marker was withheld`);
          continue;
        }
        setOwnedAttribute(entry.result.node, "data-dream-capability", entry.key);
        setOwnedAttribute(entry.result.node, "data-dream-owner", INJECTION_ID);
      }
    }
    const fastAwakeningActive = bansheeActive && enhancedCapabilities.has("fast-mode") &&
      bansheeRuntime.isFastAwakeningActive(fastModeResult, fastModeParity);
    const fastModeState = bansheeRuntime.fastModeState(fastModeResult, fastModeParity);
    if (fastAwakeningActive) root.setAttribute("data-dream-fast", "on");
    else root.removeAttribute("data-dream-fast");

    if (bansheeActive) {
      const report = JSON.stringify({
        surfaces: {
          sidebar: sideResult.state,
          main: mainResult.state,
          composer: composerResult.state,
          cards: home ? cardsResult.state : "not-applicable",
          threadHeader: threadHeaderResult.state,
        },
        microphone: { state: microphoneResult.state, parity: microphoneParity?.pass ?? null },
        fastMode: {
          state: fastModeResult.state,
          availability: fastModeState,
          parity: fastModeParity?.pass ?? null,
          awakening: fastAwakeningActive,
        },
      });
      if (report !== lastCapabilityReport) {
        console.info("[dream-skin] banshee capabilities " + report);
        lastCapabilityReport = report;
      }
    }

    if (sidePanel) {
      let newTaskButton = null;
      for (const button of sidePanel.querySelectorAll("nav button")) {
        const isNewTask = !newTaskButton &&
          NEW_TASK_LABELS.some((label) => (button.textContent || "").includes(label));
        if (isNewTask) newTaskButton = button;
        button.classList.toggle("dream-new-task", isNewTask);
      }
    }
    for (const candidate of document.querySelectorAll('[role="main"].dream-home')) {
      if (candidate !== home) candidate.classList.remove("dream-home");
    }
    if (home) home.classList.add("dream-home");

    if (!shellMain || !document.body) return;
    if (resizeObserver && observedShell !== shellMain) {
      if (observedShell) resizeObserver.unobserve(observedShell);
      resizeObserver.observe(shellMain);
      observedShell = shellMain;
    }
    shellMain.classList.toggle("dream-home-shell", Boolean(home));
    document.getElementById(LEGACY_CONTROLS_ID)?.remove();
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body || chrome.dataset.dreamInjection !== INJECTION_ID) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.dataset.dreamInjection = INJECTION_ID;
      chrome.innerHTML = `
        <div class="dream-brand"><span class="dream-note">♫</span><span><b></b><small></small></span></div>
        <div class="dream-signature"></div>
        <div class="dream-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-ribbon" aria-hidden="true"><span>♡</span>🎀<span>✦</span></div>
        <div class="dream-polaroid" aria-hidden="true"></div>
        <div class="dream-sticker dream-sticker-bubble" aria-hidden="true"><span></span></div>
        <div class="dream-sticker dream-sticker-board" aria-hidden="true">${
          ["tl", "tr", "bl", "br"].map((corner) => `<i class="dream-board-corner dream-board-corner-${corner}">
            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none">
              <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M30 3 C15 3 3 15 3 30"/>
                <path d="M30 8 C17.7 8 8 17.7 8 30"/>
                <path d="M30 3 c-3.3 0 -4.3 3.3 -1.9 4.3 2 .9 3.7 -1.4 1.9 -2.8"/>
                <path d="M3 30 c0 -3.3 3.3 -4.3 4.3 -1.9 .9 2 -1.4 3.7 -2.8 1.9"/>
              </g>
              <circle cx="6.8" cy="6.8" r="1.7" fill="currentColor"/>
            </svg>
          </i>`).join("")
        }<span class="dream-board-l1"></span><span class="dream-board-l2"></span><span class="dream-board-l3"></span></div>
        <div class="dream-sticker dream-sticker-corner" aria-hidden="true">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" fill="none">
            <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M192 198 C170 172 152 154 132 136"/>
              <path d="M132 136 C120 122 114 108 116 92"/>
              <path d="M156 158 C150 142 150 128 158 114"/>
              <path d="M116 92 C98 92 88 78 95 65 C102 52 121 51 129 63 C137 75 130 90 116 90 C106 90 100 82 104 74 C108 66 118 67 119 75 C120 81 114 84 110 80"/>
              <path d="M158 114 C146 110 142 97 149 89 C156 81 169 84 171 94 C173 104 163 110 156 104 C151 100 154 93 159 94"/>
              <path d="M132 136 C143 130 155 130 164 137 C155 145 143 144 132 136 Z"/>
              <path d="M175 179 C166 170 163 159 167 148 C176 154 180 166 175 179 Z"/>
              <path d="M116 92 C106 98 95 98 86 91 C95 84 106 85 116 92 Z"/>
              <path d="M150 172 C140 168 134 160 133 150"/>
            </g>
            <g fill="currentColor" opacity=".55">
              <circle cx="76" cy="120" r="2.2"/><circle cx="96" cy="150" r="1.8"/><circle cx="120" cy="176" r="2.2"/><circle cx="180" cy="128" r="1.8"/>
            </g>
          </svg>
        </div>`;
      dreamChromeMarkup = chrome.innerHTML;
      chrome.setAttribute("aria-hidden", "true");
      chrome.setAttribute("role", "presentation");
      chrome.setAttribute("inert", "");
      document.body.appendChild(chrome);
    }

    chrome.setAttribute("aria-hidden", "true");
    chrome.setAttribute("role", "presentation");
    chrome.setAttribute("inert", "");
    syncThemeMeta();
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    // The composer exists on both the home route and active conversation routes.
    // Its live verified rectangle occludes the still-continuous footer rail, so
    // the composer reads as a foreground plate rather than a hard-coded gap.
    const composer = composerResult.node;
    const composerOccluder = chrome.querySelector(".dream-banshee-composer-occluder");
    if (composer) {
      const composerBox = composer.getBoundingClientRect();
      chrome.style.setProperty("--dream-composer-top", `${Math.round(composerBox.top - shellBox.top)}px`);
      if (composerOccluder) {
        const scaleX = 1261 / Math.max(1, shellBox.width);
        const scaleY = 941 / Math.max(1, shellBox.height);
        const padding = 1;
        composerOccluder.setAttribute("x", String(Math.max(0, Math.floor((composerBox.left - shellBox.left) * scaleX) - padding)));
        composerOccluder.setAttribute("y", String(Math.max(0, Math.floor((composerBox.top - shellBox.top) * scaleY) - padding)));
        composerOccluder.setAttribute("width", String(Math.ceil(composerBox.width * scaleX) + padding * 2));
        composerOccluder.setAttribute("height", String(Math.ceil(composerBox.height * scaleY) + padding * 2));
      }
    } else {
      chrome.style.removeProperty("--dream-composer-top");
      composerOccluder?.setAttribute("width", "0");
      composerOccluder?.setAttribute("height", "0");
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    if ((THEME_PACKS[activeTheme] ?? "dream") === "banshee" && verifiedShell) {
      for (const animation of document.getAnimations()) {
        if (!bansheeRuntime.isBansheeWaveAnimation(animation)) continue;
        if (animation.startTime !== waveEpoch) animation.startTime = waveEpoch;
      }
    }
  };

  const cleanup = () => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const rootElement = document.documentElement;
    if (rootElement) {
      for (const cls of [...rootElement.classList]) {
        if (cls === "codex-dream-skin" || cls.startsWith("dream-theme-") || cls.startsWith("dream-layout-") || cls.startsWith("dream-pack-")) {
          rootElement.classList.remove(cls);
        }
      }
      rootElement.style.removeProperty("--dream-art");
      rootElement.style.removeProperty("--dream-home-art");
      rootElement.style.removeProperty("--dream-chat-art");
      rootElement.style.removeProperty("--dream-banshee-wave-epoch-offset");
      rootElement.removeAttribute("data-dream-pack-ready");
      rootElement.removeAttribute("data-dream-fast");
    }
    restoreOwned();
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(".dream-new-task").forEach((node) => node.classList.remove("dream-new-task"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(LEGACY_CONTROLS_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    state?.scheduler?.cancel?.();
    for (const assets of Object.values(state?.artUrls || {})) {
      if (assets.home) URL.revokeObjectURL(assets.home);
      if (assets.chat && assets.chat !== assets.home) URL.revokeObjectURL(assets.chat);
    }
    delete window[STATE_KEY];
    return true;
  };

  const metrics = { ensureRuns: 0, globalScans: 0, mutationBatches: 0, addedNodes: 0 };
  const scheduler = bansheeRuntime.createDebouncedScheduler(setTimeout, clearTimeout, ensure, 180);
  const scheduleEnsure = scheduler.schedule;
  let observedShell = null;
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleEnsure) : null;
  const observer = new MutationObserver((mutations) => {
    metrics.mutationBatches += 1;
    for (const mutation of mutations) metrics.addedNodes += mutation.addedNodes?.length ?? 0;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    metrics,
    resizeObserver,
    artUrls,
    artSigs,
    waveEpoch,
    restoreOwned,
    dreamChromeMarkup,
    themes: [...THEME_ORDER],
    defaultTheme: DEFAULT_THEME,
    defaultLayout: DEFAULT_LAYOUT,
    get layout() { return activeLayout; },
    setLayout: applyLayout,
    get theme() { return activeTheme; },
    setTheme: applyTheme,
    version: "2.3.0"
  };
  ensure();
  return { installed: true, version: "2.3.0", layout: activeLayout, theme: activeTheme, themes: [...THEME_ORDER] };
})(__DREAM_CSS_JSON__, __DREAM_ART_ASSETS_JSON__, __DREAM_MANIFEST_JSON__, __BANSHEE_RUNTIME_FACTORY__)
