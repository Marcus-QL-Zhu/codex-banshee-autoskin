import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackEndpoint, isMainRendererTarget } from "./lib/target-selection.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseArgs(argv) {
  const options = { port: 9335, mode: "watch", timeoutMs: 30000, screenshot: null, reload: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--open-new-task") options.mode = "open-new-task";
    else if (arg === "--probe-top-control") options.mode = "probe-top-control";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--themes") options.mode = "themes";
    else if (arg === "--check") options.mode = "check";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

class CdpSession {
  constructor(target) {
    this.target = target;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    if (!this.closed) this.ws.close();
    this.closed = true;
  }
}


// Chromium binds the DevTools server to a single loopback address, and which
// stack it picks can change between boots (observed: 127.0.0.1 before a reboot,
// [::1] after). Probe both and stick with whichever answers.
const HOST_CANDIDATES = ["127.0.0.1", "[::1]"];
let preferredHost = null;

async function fetchTargets(port) {
  const hosts = preferredHost
    ? [preferredHost, ...HOST_CANDIDATES.filter((host) => host !== preferredHost)]
    : [...HOST_CANDIDATES];
  let lastError;
  for (const host of hosts) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      preferredHost = host;
      return targets;
    } catch (error) {
      lastError = error;
    }
  }
  preferredHost = null;
  throw lastError ?? new Error("no loopback endpoint responded");
}

async function waitForTargets(port, timeoutMs, { includeAuxiliary = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port);
      const pages = targets.filter((item) => item.type === "page" && item.url.startsWith("app://"));
      const selected = includeAuxiliary ? pages : pages.filter(isMainRendererTarget);
      if (selected.length) return selected;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const kind = includeAuxiliary ? "Codex renderer" : "main Codex renderer";
  throw new Error(`No ${kind} target on 127.0.0.1/[::1]:${port}: ${lastError?.message ?? "timed out"}`);
}

// ---------------------------------------------------------------------------
// Theme manifest engine
//
// Themes are data, not code. The injector scans `themes/` (public) and
// `themes-private/` (git-ignored, local only) for folders that contain a
// theme.json, then generates:
//   - one `:root.codex-dream-skin.dream-theme-<name> { ...tokens }` block per theme
//   - the concatenated, scope-validated per-theme extra.css
//   - the art asset table (data URLs) and the runtime manifest (order/meta/defaults)
// See THEME-SPEC.md for the authoring contract.
// ---------------------------------------------------------------------------

const THEME_DIRS = ["themes", "themes-private"];
const PACK_REGISTRY = Object.freeze({
  dream: { file: path.join("styles", "dream", "style.css"), scope: "dream-pack-dream" },
  banshee: { file: path.join("styles", "banshee", "style.css"), scope: "dream-pack-banshee" },
});
const SCHEMA_VERSIONS = new Set([1, 2]);
const ART_MODES = new Set(["image", "none"]);
const MAX_PACK_CSS_BYTES = 512 * 1024;
const DEFAULT_LAYOUT = "fullscreen";
const THEME_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TOKEN_KEY_PATTERN = /^--dream-[a-z0-9-]+$/;
const ART_FILE_PATTERN = /^[\w.-]+\.(png|jpe?g|webp)$/i;
const REQUIRED_TOKENS = [
  "--dream-ink", "--dream-purple", "--dream-violet", "--dream-pink",
  "--dream-page-bg-0", "--dream-page-bg-1", "--dream-page-glow-a", "--dream-page-glow-b",
  "--dream-hero-art-size", "--dream-hero-art-position",
  "--dream-fullscreen-art-size", "--dream-fullscreen-art-position",
  "--dream-polaroid-art-size", "--dream-polaroid-art-position",
  "--dream-hero-overlay", "--dream-fullscreen-overlay", "--dream-fullscreen-wash",
  "--dream-hero-title-color", "--dream-hero-subtitle-color", "--dream-hero-title-shadow",
  "--dream-hero-chip-color", "--dream-hero-chip-bg", "--dream-hero-chip-line",
  "--dream-hero-subtitle",
  "--dream-chat-art-size", "--dream-chat-art-position", "--dream-chat-art-opacity",
  "--dream-chat-wash",
];
const REQUIRED_META = ["button", "brand", "edition", "signature"];
// v1.1 optional decor fields (cards / stickers / composer). They are pure sugar:
// a theme.json without them must behave exactly like v1.0, and an invalid value
// only drops that field with a warning — it never rejects the theme.
const CARD_SUBTITLE_MAX = 4;
const DECOR_TEXT_LIMIT = 120;
// v1.2: built-in badge icon names for cards.icons. Each entry maps a suggestion
// card position to a masked SVG drawn by the structure CSS (--dream-icon-<name>);
// null keeps the native glyph for that position.
const BUILT_IN_CARD_ICONS = new Set(["code", "wand", "scales", "wrench"]);

function warn(message) {
  console.error(`[dream-skin] ${message}`);
}

function cleanDecorText(value) {
  // eslint-disable-next-line no-control-regex
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
}

function cssStringToken(text) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Derive per-theme CSS variables from the optional `cards` / `composer` fields.
// Hand-written tokens with the same names win (they are spread after these).
function deriveDecorTokens(name, config) {
  const derived = {};
  const cards = config.cards;
  if (cards !== undefined) {
    if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
      warn(`theme "${name}": "cards" must be an object; field ignored`);
    } else {
      if (cards.subtitles !== undefined) {
        if (!Array.isArray(cards.subtitles) || cards.subtitles.length > CARD_SUBTITLE_MAX) {
          warn(`theme "${name}": cards.subtitles must be an array of at most ${CARD_SUBTITLE_MAX} strings; field ignored`);
        } else {
          cards.subtitles.forEach((subtitle, index) => {
            const text = cleanDecorText(subtitle);
            if (!text || text.length > DECOR_TEXT_LIMIT || /[{};]|<\//.test(text)) {
              warn(`theme "${name}": cards.subtitles[${index}] must be a short plain string; entry ignored`);
              return;
            }
            derived[`--dream-card-sub-${index + 1}`] = cssStringToken(text);
          });
        }
      }
      if (cards.icons !== undefined) {
        if (!Array.isArray(cards.icons) || cards.icons.length > CARD_SUBTITLE_MAX) {
          warn(`theme "${name}": cards.icons must be an array of at most ${CARD_SUBTITLE_MAX} entries; field ignored`);
        } else {
          cards.icons.forEach((icon, index) => {
            if (icon === null) return; // null = keep the native icon at this position
            if (typeof icon !== "string" || !BUILT_IN_CARD_ICONS.has(icon)) {
              warn(`theme "${name}": cards.icons[${index}] must be null or one of ${[...BUILT_IN_CARD_ICONS].join("/")}; entry ignored`);
              return;
            }
            derived[`--dream-card-icon-${index + 1}`] = `var(--dream-icon-${icon})`;
            derived[`--dream-card-native-icon-${index + 1}`] = "hidden";
          });
        }
      }
      if (cards.opacity !== undefined) {
        const alpha = Number(cards.opacity);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
          warn(`theme "${name}": cards.opacity must be a number between 0 and 1; field ignored`);
        } else {
          derived["--dream-card-alpha"] = String(alpha);
        }
      }
    }
  }
  const composer = config.composer;
  if (composer !== undefined) {
    if (!composer || typeof composer !== "object" || Array.isArray(composer)) {
      warn(`theme "${name}": "composer" must be an object; field ignored`);
    } else if (composer.placeholder !== undefined) {
      const text = cleanDecorText(composer.placeholder);
      if (!text || text.length > DECOR_TEXT_LIMIT || /[{};]|<\//.test(text)) {
        warn(`theme "${name}": composer.placeholder must be a short plain string; field ignored`);
      } else {
        derived["--dream-composer-placeholder"] = cssStringToken(text);
      }
    }
  }
  return derived;
}

// Stickers are opt-in decorations rendered by the runtime inside the
// pointer-events:none chrome layer (fullscreen home only). Everything stays
// off unless the theme.json explicitly asks for it. Text reaches the DOM via
// textContent only, so it can never carry markup.
function normalizeStickers(name, config) {
  if (config === undefined) return null;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    warn(`theme "${name}": "stickers" must be an object; field ignored`);
    return null;
  }
  const result = {};
  if (config.bubble !== undefined) {
    const text = cleanDecorText(
      config.bubble && typeof config.bubble === "object" ? config.bubble.text : config.bubble
    );
    if (!text || text.length > DECOR_TEXT_LIMIT) {
      warn(`theme "${name}": stickers.bubble.text must be a short non-empty string; bubble ignored`);
    } else {
      result.bubble = { text };
    }
  }
  if (config.board !== undefined) {
    const lines = Array.isArray(config.board?.lines)
      ? config.board.lines.map(cleanDecorText).filter(Boolean)
      : null;
    if (!lines || !lines.length || lines.length > 3 || lines.some((line) => line.length > DECOR_TEXT_LIMIT)) {
      warn(`theme "${name}": stickers.board.lines must be 1-3 non-empty strings; board ignored`);
    } else {
      result.board = { lines };
    }
  }
  if (config.corner !== undefined) {
    if (config.corner === true) result.corner = true;
    else if (config.corner !== false) warn(`theme "${name}": stickers.corner must be true or false; corner ignored`);
  }
  return Object.keys(result).length ? result : null;
}

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// Split a CSS block body into top-level rules ({prelude, body}) without parsing
// the full grammar. Comments must already be stripped.
function extractTopLevelRules(css) {
  const rules = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          prelude: css.slice(preludeStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, i),
        });
        preludeStart = i + 1;
      }
      if (depth < 0) throw new Error("unbalanced braces");
    }
  }
  if (depth !== 0) throw new Error("unbalanced braces");
  const trailer = css.slice(preludeStart).trim();
  if (trailer) throw new Error(`content outside of any rule: "${trailer.slice(0, 60)}"`);
  return rules;
}

// Every selector in a theme's extra.css must scope itself to that theme:
// the first compound of each selector must be html/:root carrying the
// .dream-theme-<name> class. @media / @supports may wrap such rules.
function validateExtraCssScope(css, themeName) {
  const errors = [];
  const scopeClass = `.dream-theme-${themeName}`;
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const checkRules = (blockCss) => {
    for (const rule of extractTopLevelRules(blockCss)) {
      if (rule.prelude.startsWith("@")) {
        if (/^@(media|supports)\b/.test(rule.prelude)) checkRules(rule.body);
        else errors.push(`at-rule not allowed in theme extra.css: "${rule.prelude.slice(0, 60)}"`);
        continue;
      }
      for (const selector of rule.prelude.split(",").map((part) => part.trim()).filter(Boolean)) {
        const firstCompound = selector.split(/[\s>+~]/, 1)[0];
        const anchored = firstCompound.startsWith("html.") || firstCompound.startsWith(":root.");
        if (!anchored || !firstCompound.includes(scopeClass)) {
          errors.push(`selector not scoped to ${scopeClass}: "${selector.slice(0, 80)}"`);
        }
      }
    }
  };
  try {
    checkRules(stripped);
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

function validateTokens(name, tokens) {
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    return { errors: [`theme "${name}": "tokens" must be an object`] };
  }
  const errors = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (!TOKEN_KEY_PATTERN.test(key)) errors.push(`theme "${name}": invalid token name "${key}"`);
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`theme "${name}": token "${key}" must be a non-empty string`);
    } else if (/[{};]/.test(value) || /<\//.test(value)) {
      errors.push(`theme "${name}": token "${key}" contains forbidden characters`);
    }
  }
  for (const key of REQUIRED_TOKENS) {
    if (!(key in tokens)) errors.push(`theme "${name}": missing required token "${key}"`);
  }
  return { errors };
}

async function loadThemeDir(baseName, dirName) {
  const dir = path.join(root, baseName, dirName);
  const manifestPath = path.join(dir, "theme.json");
  let raw;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    return null; // not a theme folder
  }
  const name = dirName;
  if (!THEME_NAME_PATTERN.test(name)) {
    warn(`theme folder "${baseName}/${dirName}" skipped: folder name must be kebab-case ([a-z0-9-])`);
    return null;
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    warn(`theme "${name}" skipped: theme.json is not valid JSON (${error.message})`);
    return null;
  }
  if (config.name && config.name !== name) {
    warn(`theme "${name}" skipped: theme.json "name" (${config.name}) must match the folder name`);
    return null;
  }
  const meta = config.meta ?? {};
  const metaErrors = REQUIRED_META.filter((key) => typeof meta[key] !== "string" || !meta[key].trim());
  if (metaErrors.length) {
    warn(`theme "${name}" skipped: meta.${metaErrors.join(", meta.")} missing or empty`);
    return null;
  }
  const { errors: tokenErrors } = validateTokens(name, config.tokens);
  if (tokenErrors.length) {
    for (const error of tokenErrors) warn(error);
    warn(`theme "${name}" skipped because of invalid tokens`);
    return null;
  }
  const schemaVersion = config.schemaVersion ?? 1;
  if (!SCHEMA_VERSIONS.has(schemaVersion)) {
    warn(`theme "${name}" skipped: unsupported schemaVersion "${schemaVersion}"`);
    return null;
  }
  const stylePack = config.stylePack ?? "dream";
  const artMode = config.artMode ?? "image";
  if (schemaVersion === 1 && (config.stylePack !== undefined || config.artMode !== undefined)) {
    warn(`theme "${name}" skipped: stylePack/artMode require schemaVersion 2`);
    return null;
  }
  if (!Object.hasOwn(PACK_REGISTRY, stylePack)) {
    warn(`theme "${name}" skipped: unknown stylePack "${stylePack}"`);
    return null;
  }
  if (!ART_MODES.has(artMode)) {
    warn(`theme "${name}" skipped: unknown artMode "${artMode}"`);
    return null;
  }
  const art = config.art ?? {};
  let artUrls = null;
  if (artMode === "image") {
    const homeFile = art.home ?? "art.png";
    const chatFile = art.chat ?? homeFile;
    artUrls = {};
    for (const [role, file] of Object.entries({ home: homeFile, chat: chatFile })) {
      if (typeof file !== "string" || !ART_FILE_PATTERN.test(file) || path.basename(file) !== file) {
        warn(`theme "${name}" skipped: art.${role} ("${file}") must be a plain png/jpg/webp filename inside the theme folder`);
        return null;
      }
      if (role === "chat" && file === homeFile && artUrls.home) {
        artUrls.chat = artUrls.home;
        continue;
      }
      try {
        const assetPath = path.join(dir, file);
        const stat = await fs.lstat(assetPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file");
        const buffer = await fs.readFile(assetPath);
        const mime = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "image/png";
        artUrls[role] = `data:${mime};base64,${buffer.toString("base64")}`;
      } catch {
        warn(`theme "${name}" skipped: art file not found or unsafe: ${path.join(baseName, dirName, file)}`);
        return null;
      }
    }
  }
  let extraCss = null;
  try {
    extraCss = await fs.readFile(path.join(dir, "extra.css"), "utf8");
  } catch {}
  if (extraCss !== null) {
    const scopeErrors = validateExtraCssScope(extraCss, name);
    if (scopeErrors.length) {
      for (const error of scopeErrors) warn(`theme "${name}" extra.css: ${error}`);
      warn(`theme "${name}": extra.css REJECTED (kept out of the payload); fix the scoping and re-run`);
      extraCss = null;
    }
  }
  return {
    name,
    source: baseName,
    schemaVersion,
    stylePack,
    artMode,
    order: Number.isFinite(config.order) ? config.order : 100,
    isDefault: config.default === true,
    meta: {
      button: meta.button,
      brand: meta.brand,
      edition: meta.edition,
      signature: meta.signature,
    },
    // Derived decor tokens first so hand-written tokens of the same name win.
    tokens: { ...deriveDecorTokens(name, config), ...config.tokens },
    stickers: normalizeStickers(name, config.stickers),
    extraCss,
    artUrls,
  };
}

async function loadThemes() {
  const themes = [];
  for (const baseName of THEME_DIRS) {
    let entries = [];
    try {
      entries = await fs.readdir(path.join(root, baseName), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const theme = await loadThemeDir(baseName, entry.name);
      if (!theme) continue;
      if (themes.some((existing) => existing.name === theme.name)) {
        warn(`theme "${theme.name}" in ${baseName}/ skipped: a theme with the same name was already loaded`);
        continue;
      }
      themes.push(theme);
    }
  }
  if (!themes.length) {
    throw new Error("No valid themes found under themes/ or themes-private/. See THEME-SPEC.md.");
  }
  themes.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, "en"));
  const defaultTheme = (themes.find((theme) => theme.isDefault) ?? themes[0]).name;
  return { themes, defaultTheme };
}

function validatePackCss(name, css) {
  const errors = [];
  const scope = `html.codex-dream-skin.${PACK_REGISTRY[name].scope}`;
  if (Buffer.byteLength(css, "utf8") > MAX_PACK_CSS_BYTES) errors.push("CSS exceeds size limit");
  if (/@import\b/i.test(css)) errors.push("@import is forbidden");
  if (/url\(\s*['"]?https?:/i.test(css)) errors.push("network URLs are forbidden");
  if (name === "banshee") {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const check = (block) => {
      for (const rule of extractTopLevelRules(block)) {
        if (/^@(media|supports)\b/.test(rule.prelude)) { check(rule.body); continue; }
        if (/^@keyframes\s+dream-banshee-[a-z0-9-]+$/i.test(rule.prelude)) continue;
        if (rule.prelude.startsWith("@")) { errors.push(`unsupported at-rule: ${rule.prelude}`); continue; }
        for (const selector of rule.prelude.split(",").map((part) => part.trim()).filter(Boolean)) {
          if (!selector.startsWith(scope)) errors.push(`unscoped selector: ${selector.slice(0, 100)}`);
        }
      }
    };
    try { check(stripped); } catch (error) { errors.push(error.message); }
  }
  return errors;
}

async function loadPackCss(themes) {
  const names = [...new Set(themes.map((theme) => theme.stylePack))];
  const blocks = [];
  for (const name of names) {
    const entry = PACK_REGISTRY[name];
    const file = path.join(root, entry.file);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe style pack entry: ${entry.file}`);
    const css = await fs.readFile(file, "utf8");
    const errors = validatePackCss(name, css);
    if (errors.length) throw new Error(`Invalid style pack "${name}": ${errors.join("; ")}`);
    blocks.push(`/* style pack: ${name} */\n${css.trim()}`);
  }
  return blocks.join("\n\n");
}

function buildThemeCss(themes) {
  const blocks = [];
  for (const theme of themes) {
    const lines = Object.entries(theme.tokens).map(([key, value]) => `  ${key}: ${value};`);
    blocks.push(`:root.codex-dream-skin.dream-theme-${theme.name} {\n${lines.join("\n")}\n}`);
  }
  for (const theme of themes) {
    if (theme.extraCss) {
      blocks.push(`/* theme "${theme.name}" extra.css */\n${theme.extraCss.trim()}`);
    }
  }
  return blocks.join("\n\n");
}

async function loadPayload() {
  const [{ themes, defaultTheme }, template, bansheeRuntime] = await Promise.all([
    loadThemes(),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    fs.readFile(path.join(root, "assets", "banshee-runtime.js"), "utf8"),
  ]);
  const structureCss = await loadPackCss(themes);
  const css = `${structureCss}\n\n/* --- generated theme token blocks --- */\n\n${buildThemeCss(themes)}\n`;
  const artAssets = Object.fromEntries(
    themes.filter((theme) => theme.artMode === "image").map((theme) => [theme.name, theme.artUrls])
  );
  const manifest = {
    order: themes.map((theme) => theme.name),
    meta: Object.fromEntries(themes.map((theme) => [theme.name, theme.meta])),
    stickers: Object.fromEntries(themes.map((theme) => [theme.name, theme.stickers])),
    packs: Object.fromEntries(themes.map((theme) => [theme.name, theme.stylePack])),
    artModes: Object.fromEntries(themes.map((theme) => [theme.name, theme.artMode])),
    defaultTheme,
    defaultLayout: DEFAULT_LAYOUT,
  };
  return template
    .replace("__DREAM_CSS_JSON__", () => JSON.stringify(css))
    .replace("__DREAM_ART_ASSETS_JSON__", () => JSON.stringify(artAssets))
    .replace("__DREAM_MANIFEST_JSON__", () => JSON.stringify(manifest))
    .replace("__BANSHEE_RUNTIME_FACTORY__", () => bansheeRuntime.trim());
}

async function connectTarget(target) {
  if (!isLoopbackEndpoint(target.webSocketDebuggerUrl, ["ws:"])) {
    throw new Error(`Rejected non-loopback CDP WebSocket: ${target.webSocketDebuggerUrl}`);
  }
  return new CdpSession(target).open();
}

async function applyToSession(session, payload, { paletteOnly = false } = {}) {
  await session.evaluate("window.__CODEX_DREAM_SKIN_PALETTE_ONLY__ = " + JSON.stringify(paletteOnly));
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    const rootElement = document.documentElement;
    if (rootElement) {
      rootElement.style.removeProperty('--dream-art');
      rootElement.style.removeProperty('--dream-home-art');
      rootElement.style.removeProperty('--dream-chat-art');
      rootElement.style.removeProperty('--dream-banshee-wave-epoch-offset');
      rootElement.removeAttribute('data-dream-pack-ready');
      for (const cls of [...rootElement.classList]) {
        if (cls === 'codex-dream-skin' || cls.startsWith('dream-theme-') || cls.startsWith('dream-layout-') || cls.startsWith('dream-pack-')) {
          rootElement.classList.remove(cls);
        }
      }
    }
    document.querySelectorAll('.dream-home').forEach((node) => node.classList.remove('dream-home'));
    document.querySelectorAll('.dream-home-shell').forEach((node) => node.classList.remove('dream-home-shell'));
    document.querySelectorAll('.dream-new-task').forEach((node) => node.classList.remove('dream-new-task'));
    document.querySelectorAll('[data-dream-owner], [data-dream-surface], [data-dream-capability]').forEach((node) => {
      node.removeAttribute('data-dream-owner');
      node.removeAttribute('data-dream-surface');
      node.removeAttribute('data-dream-capability');
    });
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    document.getElementById('codex-dream-skin-controls')?.remove();
    return true;
  })()`);
}

async function verifyAuxiliarySession(session) {
  return session.evaluate(`(() => {
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      styleVersion: document.getElementById('codex-dream-skin-style')?.dataset?.dreamVersion ?? null,
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      statePresent: Boolean(window.__CODEX_DREAM_SKIN_STATE__),
      bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
      viewport: { width: innerWidth, height: innerHeight },
    };
    result.pass = !result.installed && !result.stylePresent && !result.chromePresent && !result.statePresent;
    return result;
  })()`);
}

async function inspectAuxiliaryTarget(target, { remove = false } = {}) {
  const session = await connectTarget(target);
  try {
    if (remove) await removeFromSession(session);
    return await verifyAuxiliarySession(session);
  } finally {
    session.close();
  }
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.dream-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cardNodes = suggestions ? [...suggestions.querySelectorAll('button')] : [];
    // Recent Codex builds may keep the other suggestion buttons mounted as
    // zero-rectangle nodes while exposing only one native suggestion. Report
    // rendered cards separately from diagnostics so hidden React state cannot
    // fail visual parity or be mistaken for a visible native control.
    const cards = cardNodes.map(box).filter((card) => card.width > 0 && card.height > 0);
    const cardDiagnostics = cardNodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        label: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) || null,
        className: typeof node.className === 'string' ? node.className : null,
        parentClassName: typeof node.parentElement?.className === 'string' ? node.parentElement.className : null,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        ariaHidden: node.getAttribute('aria-hidden'),
        clientRects: node.getClientRects().length,
        box: box(node),
      };
    });
    const composerNode = document.querySelector('.composer-surface-chrome');
    const composerStyle = composerNode ? getComputedStyle(composerNode) : null;
    const composerAncestry = [];
    for (let node = composerNode, depth = 0; node && depth < 7; node = node.parentElement, depth += 1) {
      const style = getComputedStyle(node);
      composerAncestry.push({
        depth,
        tagName: node.tagName,
        className: typeof node.className === 'string' ? node.className : null,
        box: box(node),
        display: style.display,
        position: style.position,
        width: style.width,
        maxWidth: style.maxWidth,
      });
    }
    const composerStack = composerNode?.parentElement?.parentElement ?? null;
    const composerStackChildren = composerStack ? [...composerStack.children].map((node, index) => ({
      index,
      tagName: node.tagName,
      className: typeof node.className === 'string' ? node.className : null,
      text: (node.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) || null,
      box: box(node),
    })) : [];
    const composerContextNode = composerStack?.firstElementChild ?? null;
    const composerContextTree = composerContextNode
      ? [composerContextNode, ...composerContextNode.querySelectorAll(':scope > *, :scope > * > *')].slice(0, 10).map((node, index) => {
          const style = getComputedStyle(node);
          return {
            index,
            tagName: node.tagName,
            className: typeof node.className === 'string' ? node.className : null,
            box: box(node),
            background: style.background,
            borderRadius: style.borderRadius,
            overflow: style.overflow,
          };
        })
      : [];
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    const nativeControl = (key) => {
      const node = document.querySelector('[data-dream-capability="' + key + '"]');
      if (!node) return { enhanced: false };
      const rect = node.getBoundingClientRect();
      const stack = document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const hitPass = stack.some((candidate) => candidate === node || node.contains(candidate));
      return {
        enhanced: true,
        tagName: node.tagName,
        ariaLabel: node.getAttribute('aria-label') || node.getAttribute('title') || null,
        ariaPressed: node.getAttribute('aria-pressed'),
        svgPresent: Boolean(node.querySelector('svg')),
        hitPass,
        box: box(node),
      };
    };
    const composerControlHints = [...document.querySelectorAll('.composer-surface-chrome button')].map((node) => ({
      ariaLabel: node.getAttribute('aria-label') || null,
      title: node.getAttribute('title') || null,
      controlText: (node.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) || null,
      testId: node.getAttribute('data-testid') || null,
      ariaPressed: node.getAttribute('aria-pressed'),
      svgPresent: Boolean(node.querySelector('svg')),
      svgClass: node.querySelector('svg')?.getAttribute('class') || null,
      svgViewBox: node.querySelector('svg')?.getAttribute('viewBox') || null,
      box: box(node),
    }));
    const mainNode = document.querySelector('main.main-surface');
    const mainRect = mainNode?.getBoundingClientRect() ?? null;
    const topBandLimit = mainRect ? Math.min(innerHeight, mainRect.top + 180) : 180;
    const describeTopNode = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const stack = rect.width > 0 && rect.height > 0
        ? document.elementsFromPoint(centerX, centerY)
        : [];
      const topHit = stack.find((candidate) => getComputedStyle(candidate).pointerEvents !== 'none') ?? null;
      const topInteractiveNode = topHit?.closest?.('button, a, [role="button"]') ?? null;
      const clippingAncestors = [];
      for (let current = node.parentElement; current && current !== document.body; current = current.parentElement) {
        const currentStyle = getComputedStyle(current);
        if (!/(hidden|clip|scroll|auto)/.test(currentStyle.overflow + ' ' + currentStyle.overflowX + ' ' + currentStyle.overflowY)) continue;
        const currentRect = current.getBoundingClientRect();
        clippingAncestors.push({
          tagName: current.tagName,
          className: typeof current.className === 'string' ? current.className : null,
          box: box(current),
          overflow: [currentStyle.overflowX, currentStyle.overflowY],
          centerInside: centerX >= currentRect.left && centerX <= currentRect.right &&
            centerY >= currentRect.top && centerY <= currentRect.bottom,
        });
      }
      return {
        tagName: node.tagName,
        className: typeof node.className === 'string' ? node.className : null,
        role: node.getAttribute('role'),
        ariaLabel: node.getAttribute('aria-label') || node.getAttribute('title') || null,
        testId: node.getAttribute('data-testid'),
        directTextLength: [...node.childNodes].reduce((total, child) =>
          total + (child.nodeType === Node.TEXT_NODE ? (child.textContent || '').trim().length : 0), 0),
        box: box(node),
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        pointerEvents: style.pointerEvents,
        hitPass: stack.some((candidate) => candidate === node || node.contains(candidate)),
        topHitTag: topHit?.tagName ?? null,
        topHitClassName: typeof topHit?.className === 'string' ? topHit.className : null,
        topInteractivePass: topInteractiveNode === node,
        clippingAncestors,
      };
    };
    const inTopBand = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > (mainRect?.top ?? 0) &&
        rect.top < topBandLimit && rect.right > (mainRect?.left ?? 0);
    };
    const topInteractiveNodes = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(inTopBand);
    const topInteractive = topInteractiveNodes.map(describeTopNode);
    const describeAncestry = (node) => {
      const result = [];
      for (let current = node, depth = 0; current && depth < 9; current = current.parentElement, depth += 1) {
        const style = getComputedStyle(current);
        result.push({
          depth,
          tagName: current.tagName,
          className: typeof current.className === 'string' ? current.className : null,
          box: box(current),
          display: style.display,
          position: style.position,
          inset: [style.top, style.right, style.bottom, style.left],
          transform: style.transform,
          width: style.width,
          maxWidth: style.maxWidth,
          overflow: style.overflow,
          justifyContent: style.justifyContent,
        });
        if (current === mainNode) break;
      }
      return result;
    };
    const titleAnchor = topInteractiveNodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return mainRect && rect.left >= mainRect.left && rect.left < mainRect.left + mainRect.width / 2 &&
        rect.top >= mainRect.top && rect.top < mainRect.top + 100 &&
        Boolean(node.getAttribute('aria-label') || node.getAttribute('title'));
    }) ?? null;
    const offscreenToolbarAnchor = topInteractiveNodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return mainRect && rect.left >= mainRect.right;
    }) ?? null;
    const topTextNodes = mainNode
      ? [...mainNode.querySelectorAll('span, p, h1, h2, h3, div')]
          .filter((node) => inTopBand(node) && [...node.childNodes].some((child) =>
            child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim().length > 0
          ))
          .slice(0, 40)
          .map(describeTopNode)
      : [];
    const threadHeaderNode = document.querySelector('[data-dream-surface="thread-header"]');
    const threadHeaderRect = threadHeaderNode?.getBoundingClientRect() ?? null;
    const threadHeaderControlNodes = threadHeaderNode
      ? [...threadHeaderNode.querySelectorAll('button, a, [role="button"]')].filter((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && threadHeaderRect &&
            rect.right > threadHeaderRect.left && rect.left < threadHeaderRect.right &&
            rect.bottom > threadHeaderRect.top && rect.top < threadHeaderRect.bottom &&
            style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
        })
      : [];
    const threadHeaderControls = threadHeaderControlNodes.map(describeTopNode);
    const threadHeaderTitle = threadHeaderNode
      ? [...threadHeaderNode.querySelectorAll('span')]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && [...node.childNodes].some((child) =>
              child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim().length > 0
            );
          })
          .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)[0] ?? null
      : null;
    const threadHeaderTitleRect = threadHeaderTitle?.getBoundingClientRect() ?? null;
    const threadHeaderPass = !threadHeaderNode || Boolean(
      mainRect && threadHeaderRect && threadHeaderTitleRect && threadHeaderControls.length > 0 &&
      threadHeaderRect.left >= mainRect.left && threadHeaderRect.right <= mainRect.right &&
      threadHeaderRect.top >= mainRect.top + 44 && threadHeaderRect.bottom < mainRect.top + 140 &&
      threadHeaderTitleRect.top >= threadHeaderRect.top && threadHeaderTitleRect.bottom <= threadHeaderRect.bottom &&
      threadHeaderControls.every((control) => control.hitPass && control.topInteractivePass &&
        control.clippingAncestors.every((ancestor) => ancestor.centerInside) && control.box.x >= mainRect.left &&
        control.box.x + control.box.width <= Math.min(innerWidth, mainRect.right))
    );
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const waveAnimations = document.getAnimations().filter((animation) =>
      /^dream-banshee-(wave|seam-travel|conduit-breathe)$/.test(animation.animationName || '')
    );
    const waveStartTimes = waveAnimations.map((animation) => animation.startTime).filter(Number.isFinite);
    const waveStartSkewMs = waveStartTimes.length
      ? Math.max(...waveStartTimes) - Math.min(...waveStartTimes)
      : null;
    const waveDelaysMs = [...new Set(waveAnimations.map((animation) =>
      Math.round(Number(animation.effect?.getTiming?.().delay) || 0)
    ))].sort((a, b) => a - b);
    const wave = {
      reducedMotion,
      animationCount: waveAnimations.length,
      startTimeCount: waveStartTimes.length,
      startTimeSkewMs: waveStartSkewMs,
      delaysMs: waveDelaysMs,
      pass: reducedMotion
        ? waveAnimations.length === 0 || waveStartSkewMs === 0
        : waveAnimations.length >= 6 && waveStartTimes.length === waveAnimations.length && waveStartSkewMs <= 1,
    };
    const capabilities = {
      microphone: nativeControl('microphone'),
      fastMode: nativeControl('fast-mode'),
    };
    const markedCapabilitiesPass = Object.values(capabilities).every((control) =>
      !control.enhanced || (control.tagName === 'BUTTON' && control.svgPresent && control.hitPass && Boolean(control.box))
    );
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: state?.version ?? null,
      theme: state?.theme ?? null,
      layout: state?.layout ?? null,
      themes: state?.themes ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      styleVersion: document.getElementById('codex-dream-skin-style')?.dataset?.dreamVersion ?? null,
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      legacyControlsPresent: Boolean(document.getElementById('codex-dream-skin-controls')),
      chromePointerEvents: getComputedStyle(document.getElementById('codex-dream-skin-chrome') || document.body).pointerEvents,
      homePresent: Boolean(home),
      suggestionsPresent: Boolean(suggestions),
      suggestionSurface: suggestions ? {
        box: box(suggestions),
        className: typeof suggestions.className === 'string' ? suggestions.className : null,
        display: getComputedStyle(suggestions).display,
        columns: getComputedStyle(suggestions).gridTemplateColumns,
      } : null,
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild),
      cards,
      cardDiagnostics,
      composer: box(composerNode),
      composerStyle: composerStyle ? {
        borderTopColor: composerStyle.borderTopColor,
        borderTopWidth: composerStyle.borderTopWidth,
        clipPath: composerStyle.clipPath,
        boxShadow: composerStyle.boxShadow,
        focusWithin: composerNode.matches(':focus-within'),
      } : null,
      composerAncestry,
      composerStackChildren,
      composerContextTree,
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
      wave,
      capabilities,
      composerControlHints,
      topRegion: {
        main: box(mainNode),
        bandBottom: Math.round(topBandLimit),
        threadHeader: box(threadHeaderNode),
        threadHeaderTitle: box(threadHeaderTitle),
        threadHeaderControls,
        pass: threadHeaderPass,
        interactive: topInteractive,
        textNodes: topTextNodes,
        titleAnchorAncestry: describeAncestry(titleAnchor),
        offscreenToolbarAncestry: describeAncestry(offscreenToolbarAnchor),
      },
    };
    const bansheeActive = document.documentElement.classList.contains('dream-pack-banshee') &&
      document.documentElement.getAttribute('data-dream-pack-ready') === 'banshee-v1';
    const suggestionsSuppressed = bansheeActive && result.suggestionsPresent &&
      result.suggestionSurface?.display === 'none' && result.cards.length === 0;
    result.suggestionsSuppressed = suggestionsSuppressed;
    result.pass = result.installed && result.stylePresent && result.chromePresent &&
      Array.isArray(result.themes) && result.themes.length > 0 && result.themes.includes(result.theme) &&
      ['banner', 'fullscreen'].includes(result.layout) &&
      !result.legacyControlsPresent &&
      result.chromePointerEvents === 'none' && Boolean(result.composer) && Boolean(result.sidebar) &&
      (!bansheeActive || (result.wave.pass && markedCapabilitiesPass)) &&
      result.topRegion.pass &&
      (!result.homePresent || (Boolean(result.hero) &&
        (!result.suggestionsPresent || result.suggestionsSuppressed || (result.cards.length >= 1 && result.cards.length <= 4 &&
          result.cards.every((card) => card.width > 0 && card.height > 0)))));
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function openNewTask(session, timeoutMs) {
  const action = await session.evaluate(`(() => {
    const sidebar = document.querySelector('aside.app-shell-left-panel');
    const labels = ['新建任务', 'New task'];
    const candidates = sidebar ? [...sidebar.querySelectorAll('button')].filter((button) =>
      labels.some((label) => (button.innerText || button.textContent || '').trim().includes(label))
    ) : [];
    if (candidates.length !== 1) return { clicked: false, candidateCount: candidates.length };
    candidates[0].click();
    return { clicked: true, candidateCount: 1 };
  })()`);
  if (!action.clicked) throw new Error(`Expected one native new-task button, found ${action.candidateCount}`);
  const deadline = Date.now() + timeoutMs;
  let verified;
  let stableSignature = null;
  let stablePasses = 0;
  while (Date.now() < deadline) {
    verified = await verifySession(session);
    const suppressedCards = verified.suggestionsSuppressed === true;
    const visibleCards = verified.cards.length >= 1 && verified.cards.length <= 4 &&
      verified.cards.every((card) => card.width > 0 && card.height > 0);
    const signature = suppressedCards ? 'suppressed' : visibleCards ? JSON.stringify(verified.cards) : null;
    stablePasses = signature && signature === stableSignature ? stablePasses + 1 : 0;
    stableSignature = signature;
    if (verified.homePresent && verified.suggestionsPresent && (suppressedCards || visibleCards) && stablePasses >= 1) return verified;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`New-task view did not stabilize its suggestion presentation: ${JSON.stringify(verified)}`);
}

async function probeTopControl(session) {
  const target = await session.evaluate(`(() => {
    const header = document.querySelector('[data-dream-surface="thread-header"]');
    const labels = new Set(['次要操作', 'Secondary actions']);
    const matches = header ? [...header.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect();
      const label = (button.getAttribute('aria-label') || button.getAttribute('title') || '').trim();
      return labels.has(label) && rect.width > 0 && rect.height > 0;
    }) : [];
    if (matches.length !== 1) return { ready: false, candidateCount: matches.length };
    const button = matches[0];
    const rect = button.getBoundingClientRect();
    const state = { expected: button, pointerdown: false, click: false, pointerTarget: null, clickTarget: null };
    const observe = (key, event) => {
      const interactive = event.target?.closest?.('button, a, [role="button"]') ?? null;
      state[key] = interactive === state.expected;
      state[key + 'Target'] = interactive?.getAttribute?.('aria-label') || interactive?.getAttribute?.('title') || null;
    };
    document.addEventListener('pointerdown', (event) => observe('pointerdown', event), { capture: true, once: true });
    document.addEventListener('click', (event) => observe('click', event), { capture: true, once: true });
    window.__DREAM_SKIN_TOP_CONTROL_PROBE__ = state;
    return {
      ready: true,
      ariaLabel: button.getAttribute('aria-label') || button.getAttribute('title') || null,
      point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  })()`);
  if (!target.ready) return { pass: false, reason: 'target-not-unique', candidateCount: target.candidateCount };
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.point.x, y: target.point.y });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.point.x, y: target.point.y, button: 'left', clickCount: 1 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.point.x, y: target.point.y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const observed = await session.evaluate(`(() => {
    const state = window.__DREAM_SKIN_TOP_CONTROL_PROBE__;
    const menuVisible = [...document.querySelectorAll('[role="menu"]')].some((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const result = state ? {
      pointerdown: state.pointerdown,
      click: state.click,
      pointerTarget: state.pointerdownTarget,
      clickTarget: state.clickTarget,
      menuVisible,
    } : null;
    delete window.__DREAM_SKIN_TOP_CONTROL_PROBE__;
    return result;
  })()`);
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  return {
    target: target.ariaLabel,
    ...observed,
    pass: Boolean(observed?.pointerdown && observed?.click),
  };
}

async function runOneShot(options) {
  const allTargets = await waitForTargets(options.port, options.timeoutMs, { includeAuxiliary: true });
  let mainTargets = allTargets.filter(isMainRendererTarget);
  if (options.mode !== "remove" && !mainTargets.length) {
    mainTargets = await waitForTargets(options.port, options.timeoutMs);
  }
  const targets = options.mode === "remove" ? allTargets : mainTargets;
  const auxiliaryTargets = allTargets.filter((target) => !isMainRendererTarget(target));
  const payload = (options.mode === "once" || options.reload) ? await loadPayload() : null;
  const results = [];
  const auxiliaryResults = [];
  if (options.mode !== "remove") {
    for (const target of auxiliaryTargets) {
      const result = await inspectAuxiliaryTarget(target, {
        remove: options.mode === "once" || options.reload,
      });
      auxiliaryResults.push({ targetId: target.id, title: target.title, url: target.url, result });
    }
  }
  for (const target of targets) {
    const session = await connectTarget(target);
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload, { paletteOnly: mainTargets.length !== 1 });
      if (options.mode === "once") {
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload, { paletteOnly: mainTargets.length !== 1 });
      }
      const verified = options.mode === "probe-top-control"
        ? await probeTopControl(session)
        : options.mode === "open-new-task"
        ? await openNewTask(session, options.timeoutMs)
        : options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-dream-skin')")
        : (options.reload || options.mode === "once")
          ? await waitForVerifiedSession(session, options.timeoutMs)
          : await verifySession(session);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally {
      session.close();
    }
  }
  console.log(JSON.stringify({
    mode: options.mode,
    port: options.port,
    targets: results,
    auxiliaryTargets: auxiliaryResults,
  }, null, 2));
  if (options.mode === "verify" && (
    results.some((item) => !item.result.pass) || auxiliaryResults.some((item) => !item.result.pass)
  )) process.exitCode = 2;
  if (options.mode === "probe-top-control" && results.some((item) => !item.result.pass)) process.exitCode = 2;
}

async function runPayloadCheck() {
  const payload = await loadPayload();
  const { themes, defaultTheme } = await loadThemes();
  console.log(JSON.stringify({
    valid: true,
    payloadBytes: Buffer.byteLength(payload, "utf8"),
    defaultTheme,
    themes: themes.map((theme) => ({
      name: theme.name,
      schemaVersion: theme.schemaVersion,
      stylePack: theme.stylePack,
      artMode: theme.artMode,
    })),
  }, null, 2));
}
async function runThemesReport() {
  const { themes, defaultTheme } = await loadThemes();
  console.log(JSON.stringify({
    defaultTheme,
    defaultLayout: DEFAULT_LAYOUT,
    themes: themes.map((theme) => ({
      name: theme.name,
      source: theme.source,
      order: theme.order,
      default: theme.isDefault,
      button: theme.meta.button,
      schemaVersion: theme.schemaVersion,
      stylePack: theme.stylePack,
      artMode: theme.artMode,
      extraCss: theme.extraCss !== null,
      stickers: theme.stickers ? Object.keys(theme.stickers) : [],
    })),
  }, null, 2));
}

async function runWatch(options) {
  const payload = await loadPayload();
  const sessions = new Map();
  const cleanedAuxiliary = new Set();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let allTargets = [];
    try {
      allTargets = await waitForTargets(options.port, 2000, { includeAuxiliary: true });
    } catch (error) {
      console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const targets = allTargets.filter(isMainRendererTarget);
    const activeAllIds = new Set(allTargets.map((target) => target.id));
    for (const id of cleanedAuxiliary) {
      if (!activeAllIds.has(id)) cleanedAuxiliary.delete(id);
    }
    for (const target of allTargets.filter((item) => !isMainRendererTarget(item))) {
      if (cleanedAuxiliary.has(target.id)) continue;
      try {
        const result = await inspectAuxiliaryTarget(target, { remove: true });
        if (!result.pass) throw new Error("auxiliary renderer still contains Dream Skin state");
        cleanedAuxiliary.add(target.id);
        console.log(`[dream-skin] kept auxiliary target transparent ${target.id} (${target.url})`);
      } catch (error) {
        console.error(`[dream-skin] auxiliary cleanup failed for ${target.id}: ${error.message}`);
      }
    }

    const activeIds = new Set(targets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) || session.closed) {
        session.close();
        sessions.delete(id);
      }
    }

    for (const target of targets) {
      if (sessions.has(target.id)) continue;
      try {
        const session = await connectTarget(target);
        session.on("Page.loadEventFired", () => {
          setTimeout(() => applyToSession(session, payload, { paletteOnly: targets.length !== 1 }).catch((error) => {
            console.error(`[dream-skin] reinject failed: ${error.message}`);
          }), 250);
        });
        await applyToSession(session, payload, { paletteOnly: targets.length !== 1 });
        sessions.set(target.id, session);
        console.log(`[dream-skin] injected target ${target.id} (${target.title || target.url})`);
      } catch (error) {
        console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else if (options.mode === "themes") await runThemesReport();
else if (options.mode === "check") await runPayloadCheck();
else await runOneShot(options);
