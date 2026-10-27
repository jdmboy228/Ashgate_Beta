// Transport to the local Ashgate API. The window host injects the token
// before the page loads; every request must carry it (see server.go).

const TOKEN = (typeof window !== "undefined" && window.__ashgateToken) || "";

async function call(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ "X-Ashgate-Token": TOKEN }, opts.headers || {});
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "ошибка");
  return data;
}

function post(path, body) {
  return call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
}

// liveBackend talks to the Go controller. The demo backend in demo.js has
// the same shape, so the store never knows which one it drives.
export const liveBackend = {
  demo: false,
  // events=0 skips the connection log while nobody looks at it.
  state: (gen, events) => call(`/api/state?gen=${gen || 0}${events ? "" : "&events=0"}`),
  start: () => post("/api/start"),
  stop: () => post("/api/stop"),
  saveConfig: (config, autostart) => post("/api/config", autostart === undefined ? { config } : { config, autostart }),
  parseVLESS: (link) => post("/api/vless/parse", { link }),
  probe: (name, proxy) => post("/api/probe", proxy ? { proxy } : { name }),
  probeAll: () => post("/api/probe-all"),
  processes: () => call("/api/processes"),
  installed: () => call("/api/installed"),
  browse: () => post("/api/browse"),
  reveal: () => post("/api/reveal"),
  clearLog: () => post("/api/log/clear"),
  window: (op) => {
    const fn = window["ashgate" + op];
    if (typeof fn === "function") return fn();
    return post("/api/window", { op: op.toLowerCase() }).catch(() => {});
  },
  theme: (dark) => { if (typeof window.ashgateTheme === "function") window.ashgateTheme(!!dark); },
  iconURL: (process) => "/api/icon?path=" + encodeURIComponent(process) + "&t=" + encodeURIComponent(TOKEN),
};
