const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

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
