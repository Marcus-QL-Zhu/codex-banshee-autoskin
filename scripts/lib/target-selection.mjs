const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
export const LOOPBACK_HTTP_HOSTS = Object.freeze(['127.0.0.1', '[::1]']);

export async function fetchTargetsFromLoopback(port, {
  preferredHost = null,
  timeoutMs = 1500,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid port: ${port}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`Invalid timeout: ${timeoutMs}`);
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const hosts = preferredHost && LOOPBACK_HTTP_HOSTS.includes(preferredHost)
    ? [preferredHost, ...LOOPBACK_HTTP_HOSTS.filter((host) => host !== preferredHost)]
    : [...LOOPBACK_HTTP_HOSTS];
  let lastError;
  for (const host of hosts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('CDP target request timed out')), timeoutMs);
    try {
      const response = await fetchImpl(`http://${host}:${port}/json/list`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      if (!Array.isArray(targets)) throw new Error('CDP target response is not an array');
      return { targets, host };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`CDP unreachable on 127.0.0.1/[::1]:${port}: ${lastError?.message ?? 'no response'}`);
}

export function isLoopbackEndpoint(value, protocols = ["http:", "ws:"]) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

export function isMainRendererTarget(target) {
  try {
    const url = new URL(target.url);
    return target.type === "page" &&
      url.protocol === "app:" &&
      url.hostname === "-" &&
      url.pathname === "/index.html" &&
      !url.searchParams.has("initialRoute") &&
      isLoopbackEndpoint(target.webSocketDebuggerUrl, ["ws:"]);
  } catch {
    return false;
  }
}

export function classifyTargets(targets) {
  const main = [];
  const auxiliary = [];
  const rejected = [];
  for (const target of targets) {
    if (isMainRendererTarget(target)) main.push(target);
    else if (target?.type === "page" && String(target?.url ?? "").startsWith("app://")) auxiliary.push(target);
    else rejected.push(target);
  }
  return { main, auxiliary, rejected, ambiguousMain: main.length > 1 };
}

export function requireSingleMainRendererTarget(targets) {
  const main = (targets ?? []).filter(isMainRendererTarget);
  if (main.length === 1) return main[0];
  if (main.length > 1) throw new Error(`ambiguous main Codex renderers: ${main.length}`);
  throw new Error('no main Codex renderer');
}

export function paletteOnlyForMainTargets(targets) {
  return (targets ?? []).filter(isMainRendererTarget).length !== 1;
}
