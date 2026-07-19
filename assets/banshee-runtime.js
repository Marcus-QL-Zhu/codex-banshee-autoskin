(() => {
  const hashText = (value) => {
    let hash = 2166136261;
    for (const character of String(value ?? "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };

  const evidenceScore = (evidence) => {
    if (Array.isArray(evidence)) return evidence.filter(Boolean).length;
    if (evidence && typeof evidence === 'object') {
      return Object.values(evidence).filter(Boolean).length;
    }
    return Number(evidence) || 0;
  };
  const classifyCandidates = (candidates, evidenceFor) => {
    const verified = [];
    for (const candidate of candidates) {
      const evidence = evidenceFor(candidate);
      const score = evidenceScore(evidence);
      if (score >= 2) verified.push(candidate);
    }
    if (verified.length === 1) return { state: "verified", node: verified[0] };
    if (verified.length > 1 || candidates.length > 1) return { state: "ambiguous", node: null };
    return { state: "unknown", node: null };
  };

  const snapshotControl = (node, styleFor, hitTestFor) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect?.() ?? { x: 0, y: 0, width: 0, height: 0 };
    const svgMarkup = node.querySelector?.("svg")?.outerHTML ?? "";
    const style = styleFor?.(node) ?? null;
    return {
      node,
      role: node.getAttribute?.("role") ?? node.tagName?.toLowerCase?.() ?? "",
      name: node.getAttribute?.("aria-label") ?? node.getAttribute?.("title") ?? "",
      tabIndex: Number(node.tabIndex ?? -1),
      disabled: Boolean(node.disabled),
      pressed: node.getAttribute?.("aria-pressed") ?? null,
      checked: node.getAttribute?.("aria-checked") ?? null,
      rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(Number(value) || 0)),
      svgHash: hashText(svgMarkup),
      visible: rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden" && Number(style?.opacity ?? 1) !== 0,
      hitTarget: hitTestFor ? Boolean(hitTestFor(node, rect)) : true,
    };
  };

  const compareControl = (baseline, node, styleFor, hitTestFor, options = {}) => {
    const current = snapshotControl(node, styleFor, hitTestFor);
    if (!baseline || !current) return { pass: false, reasons: ["missing"] };
    const reasons = [];
    if (baseline.node !== node) reasons.push("identity");
    for (const key of ["role", "name", "tabIndex", "svgHash"]) {
      if (baseline[key] !== current[key]) reasons.push(key);
    }
    if (options.compareState) {
      for (const key of ['disabled', 'pressed', 'checked']) {
        if (baseline[key] !== current[key]) reasons.push(key);
      }
    }
    if (options.compareRect) {
      const [baseX, baseY, baseWidth, baseHeight] = baseline.rect;
      const [x, y, width, height] = current.rect;
      const positionTolerance = Number(options.positionTolerance ?? 4);
      const sizeTolerance = Number(options.sizeTolerance ?? 1);
      if (Math.abs(baseX - x) > positionTolerance || Math.abs(baseY - y) > positionTolerance) reasons.push('position');
      if (Math.abs(baseWidth - width) > sizeTolerance || Math.abs(baseHeight - height) > sizeTolerance) reasons.push('size');
      const minimumHitSize = Number(options.minimumHitSize ?? 24);
      if (width < minimumHitSize || height < minimumHitSize) reasons.push('hitArea');
    }
    if (!current.visible) reasons.push("visibility");
    if (!current.hitTarget) reasons.push("hitTarget");
    return { pass: reasons.length === 0, reasons, current };
  };

  const artVariables = (assets) => assets ? {
    "--dream-home-art": `url("${assets.home}")`,
    "--dream-chat-art": `url("${assets.chat}")`,
    "--dream-art": `url("${assets.home}")`,
  } : null;

  const createOwnershipRegistry = () => {
    const changesByNode = new Map();
    return {
      set(node, name, value) {
        if (!node) return;
        let changes = changesByNode.get(node);
        if (!changes) {
          changes = new Map();
          changesByNode.set(node, changes);
        }
        if (!changes.has(name)) changes.set(name, node.hasAttribute(name) ? node.getAttribute(name) : null);
        if (node.getAttribute(name) !== value) node.setAttribute(name, value);
      },
      restore() {
        for (const [node, changes] of changesByNode) {
          if (!node?.setAttribute) continue;
          for (const [name, previousValue] of changes) {
            if (previousValue === null) node.removeAttribute(name);
            else node.setAttribute(name, previousValue);
          }
        }
        changesByNode.clear();
      },
      get size() { return changesByNode.size; },
    };
  };

  const createDebouncedScheduler = (setTimer, clearTimer, callback, delay) => {
    const scheduler = {
      timeout: null,
      schedule() {
        if (scheduler.timeout !== null) clearTimer(scheduler.timeout);
        scheduler.timeout = setTimer(() => {
          scheduler.timeout = null;
          callback();
        }, delay);
      },
      cancel() {
        if (scheduler.timeout !== null) clearTimer(scheduler.timeout);
        scheduler.timeout = null;
      },
    };
    return scheduler;
  };
  const selectCapabilityEnhancements = (entries) => entries
    .filter((entry) => entry?.result?.state === "verified" && entry?.parity?.pass === true)
    .map((entry) => entry.key);
  const fastModeState = (result, parity) => {
    if (result?.state !== "verified" || parity?.pass !== true || !result.node) return "unavailable";
    const pressed = result.node.getAttribute?.("aria-pressed");
    if (pressed === "true") return "on";
    if (pressed === "false") return "off";
    const nativeInlineIcon = [...(result.node.querySelectorAll?.("svg") ?? [])].some((icon) =>
      String(icon.getAttribute?.("class") ?? "").includes("ModelPickerTriggerInlineFastIcon") &&
      icon.getAttribute?.("viewBox") === "0 0 24 24" &&
      Boolean(icon.querySelector?.('path[fill="currentColor"]'))
    );
    return nativeInlineIcon ? "on" : "off";
  };
  const isFastAwakeningActive = (result, parity) => fastModeState(result, parity) === "on";
  const hitTestControl = (node, stack, styleFor) => {
    const top = [...(stack ?? [])].find((candidate) => (styleFor?.(candidate)?.pointerEvents ?? "auto") !== "none");
    return Boolean(top && (top === node || node?.contains?.(top)));
  };
  const parseRgb = (value) => {
    const match = String(value ?? '').match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const isAmberStatusColor = (value) => {
    const rgb = parseRgb(value);
    if (!rgb) return false;
    const [red, green, blue] = rgb;
    return red >= 150 && green >= 85 && green <= 220 && blue <= 130 &&
      red >= green + 20 && green >= blue + 20 && green >= red * .58;
  };
  const isIdleCompletedStatusDot = (node, styleFor) => {
    if (!node?.classList) return false;
    const legacySemantic = node.classList.contains('size-2') &&
      node.classList.contains('rounded-full') &&
      node.classList.contains('bg-token-charts-yellow');
    const inlineFallback = node.tagName === 'SPAN' &&
      node.classList.contains('absolute') &&
      node.classList.contains('inset-0') &&
      node.classList.contains('rounded-full') &&
      String(node.getAttribute?.('style') ?? '').includes('--vscode-textLink-foreground');
    if (!legacySemantic && !inlineFallback) return false;
    const style = styleFor?.(node);
    return isAmberStatusColor(style?.backgroundColor ?? node.style?.backgroundColor ?? '');
  };
  const isBansheeWaveAnimation = (animation) =>
    /^dream-banshee-(wave|center-cavity-wave|conduit-breathe|cavity-pulse)$/.test(animation?.animationName ?? "");

  const propagationDelay = (distance, travelMs) => {
    const normalized = Math.max(0, Math.min(1, Number(distance) || 0));
    return Math.round(normalized * Math.max(0, Number(travelMs) || 0));
  };

  return { artVariables, classifyCandidates, compareControl, createDebouncedScheduler, createOwnershipRegistry, fastModeState, hashText, hitTestControl, isAmberStatusColor, isBansheeWaveAnimation, isFastAwakeningActive, isIdleCompletedStatusDot, propagationDelay, selectCapabilityEnhancements, snapshotControl };
})()
