// Demo backend for ?demo=1: the window without Windows, for previews and
// screenshots. Same shape as liveBackend in api.js. Hash presets:
//   #empty  first run, nothing configured
//   #proxy  one proxy, no apps yet
//   #off    configured but capture stopped

const MB = 1024 * 1024;

function seed(preset) {
  const cfg = {
    version: 1,
    relay: { tcp4: "127.0.0.1:34010", tcp6: "[::1]:34010" },
    dns: { mode: "proxy", servers: ["1.1.1.1:53", "8.8.8.8:53"], includeSystemResolver: false, systemResolverProxy: "" },
    bypassPrivate: false,
    killSwitch: false,
    udpUnsupported: "block",
    log: { level: "info" },
    ui: { theme: "dark" },
    proxies: [
      { name: "aeza", type: "vless", address: "203.0.113.10:443", socksPort: 10808, link: "vless://b7e2c1a0-4f3a-4c2b-9a11-111111111111@203.0.113.10:443?type=xhttp&security=reality&sni=www.microsoft.com&fp=chrome&pbk=AAEC&sid=ab12#aeza", vless: { uuid: "b7e2c1a0-4f3a-4c2b-9a11-111111111111", network: "xhttp", security: "reality", sni: "www.microsoft.com", fp: "chrome", pbk: "AAEC", sid: "ab12", path: "/", mode: "auto" } },
      { name: "nl1", type: "socks5", address: "198.51.100.7:1080", username: "alice" },
      { name: "work", type: "http", address: "10.0.0.5:3128" },
    ],
    groups: [{ name: "Мессенджеры", enabled: true, action: "proxy", proxy: "aeza", collapsed: false }],
    rules: [
      { enabled: true, process: "C:\\Users\\alex\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe", action: "proxy", proxy: "aeza", group: "Мессенджеры" },
      { enabled: true, process: "*\\Discord\\app-*\\Discord.exe", action: "proxy", proxy: "aeza", group: "Мессенджеры", tcpOnly: true },
      { enabled: true, process: "Cursor.exe", action: "proxy", proxy: "aeza" },
      { enabled: true, process: "opera.exe", action: "proxy", proxy: "aeza" },
      { enabled: true, process: "chrome.exe", action: "proxy", proxy: "nl1", killSwitch: true },
      { enabled: true, process: "C:\\Program Files\\Mozilla Firefox\\firefox.exe", action: "proxy", proxy: "work" },
      { enabled: true, process: "steam.exe", action: "direct" },
      { enabled: false, process: "Spotify.exe", action: "direct" },
      { enabled: true, process: "qbittorrent.exe", action: "block" },
    ],
  };
  const st = {
    version: "0.8.0",
    build: { version: "0.8.0", commit: "demo", time: "2026-10-27T12:00:00Z" },
    path: "C:\\ProgramData\\Ashgate\\config.json",
    running: true,
    admin: true,
    driver: true,
    error: "",
    theme: "dark",
    autostart: false,
    bridges: { aeza: { socks: "127.0.0.1:10808", http: "127.0.0.1:10809", up: true } },
    checks: {
      aeza: { ok: true, udp: true, ms: 42, label: "42 мс", detail: "TCP и UDP" },
      nl1: { ok: false, ms: 5000, label: "нет ответа", detail: "SOCKS5: нет ответа от 198.51.100.7:1080 (таймаут)" },
      work: { ok: true, udp: false, ms: 380, label: "380 мс", detail: "только TCP" },
    },
    killSwitch: { on: false, blocked: [], missing: [] },
    config: cfg,
    events: [],
    generation: 1,
  };
  if (preset === "empty") { cfg.proxies = []; cfg.rules = []; cfg.groups = []; st.running = false; st.checks = {}; st.bridges = {}; }
  if (preset === "proxy") { cfg.proxies = cfg.proxies.slice(0, 1); cfg.rules = []; cfg.groups = []; st.running = false; st.checks = { aeza: st.checks.aeza }; }
  if (preset === "off") st.running = false;
  return st;
}

const TRAFFIC = {
  "c:\\users\\alex\\appdata\\roaming\\telegram desktop\\telegram.exe": [3, 1.2 * MB, 40 * 1024],
  "*\\discord\\app-*\\discord.exe": [1, 40 * 1024, 2 * 1024],
  "cursor.exe": [4, 420 * 1024, 30 * 1024],
  "c:\\program files\\mozilla firefox\\firefox.exe": [5, 320 * 1024, 12 * 1024],
  "steam.exe": [6, 8.4 * MB, 90 * 1024],
};

const RUNNING = [
  { pid: 4120, name: "chrome.exe", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", window: true, title: "Google Chrome" },
  { pid: 7788, name: "Telegram.exe", path: "C:\\Users\\alex\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe", window: true, title: "Telegram" },
  { pid: 9310, name: "obs64.exe", path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", window: true, title: "OBS 31.0" },
  { pid: 9411, name: "Zoom.exe", path: "C:\\Users\\alex\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe", window: true, title: "Zoom Workplace" },
  { pid: 9512, name: "msedge.exe", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", window: true, title: "Microsoft Edge" },
  { pid: 9613, name: "Notion.exe", path: "C:\\Users\\alex\\AppData\\Local\\Programs\\Notion\\Notion.exe", window: true, title: "Notion" },
  { pid: 1300, name: "explorer.exe", path: "C:\\Windows\\explorer.exe", window: true, title: "" },
];

const INSTALLED = [
  { name: "Telegram Desktop", path: "C:\\Users\\alex\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe" },
  { name: "Spotify", path: "C:\\Users\\alex\\AppData\\Roaming\\Spotify\\Spotify.exe" },
  { name: "Steam", path: "C:\\Program Files (x86)\\Steam\\steam.exe" },
  { name: "OBS Studio", path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe" },
  { name: "Visual Studio Code", path: "C:\\Users\\alex\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function demoBackend(preset) {
  const st = seed(preset);
  const totals = {};
  let t = 0;
  let gen = 1;
  const events = [];
  const proc = (name, i) => ({ time: new Date(Date.now() - i * 1700).toTimeString().slice(0, 8), process: name, pid: 7788 + i, proto: i % 4 === 3 ? "UDP" : "TCP" });
  ["Telegram.exe", "chrome.exe", "Cursor.exe", "steam.exe", "Telegram.exe", "Discord.exe", "firefox.exe", "chrome.exe"].forEach((n, i) => {
    const e = proc(n, i);
    if (n === "chrome.exe") Object.assign(e, { dest: "142.250.74.46:443", via: "nl1", status: "error", error: "SOCKS5: нет ответа от 198.51.100.7:1080 (таймаут)" });
    else if (n === "steam.exe") Object.assign(e, { dest: "store.steampowered.com:443", via: "direct", status: "direct", bytesUp: 2400, bytesDown: 96000 });
    else Object.assign(e, { dest: "149.154.167." + (50 + i) + ":443", via: n === "firefox.exe" ? "work" : "aeza", status: i % 3 ? "open" : "closed", bytesUp: 3200 * (i + 1), bytesDown: 61000 * (i + 1) });
    events.push(e);
  });

  function stats() {
    t += 1;
    const out = {};
    if (!st.running) return out;
    const keys = new Set((st.config.rules || []).filter((r) => r.enabled !== false).map((r) => r.process.trim().toLowerCase()));
    for (const [k, [flows, down, up]] of Object.entries(TRAFFIC)) {
      if (!keys.has(k)) continue;
      const wobble = 0.75 + 0.5 * Math.abs(Math.sin(t * 0.7 + k.length));
      const dr = Math.round(down * wobble);
      const ur = Math.round(up * wobble);
      totals[k] = (totals[k] || [0, 0]);
      totals[k][0] += ur; totals[k][1] += dr;
      out[k] = { flows, up: totals[k][0] + 9 * MB, down: totals[k][1] + 140 * MB, upRate: ur, downRate: dr };
    }
    if (keys.has("chrome.exe")) out["chrome.exe"] = { flows: 0, up: 0, down: 0, upRate: 0, downRate: 0, error: st.checks.nl1 && !st.checks.nl1.ok ? st.checks.nl1.detail : "" };
    return out;
  }

  return {
    demo: true,
    async state(since, withEvents) {
      const ruleStats = stats();
      const active = Object.values(ruleStats).reduce((n, s) => n + (s.flows || 0), 0);
      const snap = JSON.parse(JSON.stringify(Object.assign({}, st, { ruleStats, active, tcp: active, udp: 0 })));
      snap.bytesDown = Object.values(totals).reduce((n, v) => n + v[1], 0);
      snap.bytesUp = Object.values(totals).reduce((n, v) => n + v[0], 0);
      snap.generation = gen;
      if (!withEvents || since === gen) { snap.events = null; snap.eventsSame = true; }
      else snap.events = events.slice();
      return snap;
    },
    async start() { await wait(250); st.running = true; },
    async stop() { await wait(150); st.running = false; },
    async saveConfig(config) { await wait(60); st.config = JSON.parse(JSON.stringify(config)); st.theme = (config.ui && config.ui.theme) || "dark"; return { ok: true }; },
    async parseVLESS(link) {
      await wait(120);
      const m = /^vless:\/\/([0-9a-f-]{36})@([^:/?#]+):(\d+)\??([^#]*)#?(.*)$/i.exec(String(link || "").trim());
      if (!m) throw new Error("Не удалось разобрать ссылку VLESS");
      const q = new URLSearchParams(m[4]);
      return { name: decodeURIComponent(m[5] || "").replace(/[^A-Za-z0-9_.-]/g, "") || "vless", address: m[2] + ":" + m[3], vless: { uuid: m[1], network: q.get("type") || "tcp", security: q.get("security") || "none", sni: q.get("sni") || "", fp: q.get("fp") || "", pbk: q.get("pbk") || "", sid: q.get("sid") || "" } };
    },
    async probe(name, proxy) {
      await wait(700);
      const ms = 30 + Math.round(Math.random() * 60);
      const rep = { ok: true, udp: !proxy || proxy.type !== "http", ms, label: ms + " мс", detail: "TCP и UDP" };
      if (name) st.checks[name] = rep;
      return rep;
    },
    async probeAll() { await wait(900); return st.checks; },
    async processes() { return RUNNING; },
    async installed() { await wait(200); return INSTALLED; },
    async browse() { throw new Error("отменено"); },
    async reveal() {},
    async clearLog() { events.length = 0; gen++; },
    window() {},
    theme() {},
    iconURL: () => "",
  };
}
