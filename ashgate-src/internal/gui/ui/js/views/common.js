// Helpers shared by the views: app icons, lane names and colours.

import { appLabel, esc, glyphHue, proxyTypeLabel } from "../format.js";

const misses = new Set();
// Forget misses now and then: a program may get installed meanwhile.
setInterval(() => misses.clear(), 5 * 60 * 1000);

if (typeof document !== "undefined") {
  // load/error do not bubble; listen in the capture phase for every icon.
  document.addEventListener("load", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.dataset.icon) t.parentNode.classList.add("has-img");
  }, true);
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.dataset.icon) { misses.add(t.dataset.icon); t.remove(); }
  }, true);
}

// appIcon is the exe icon (the server resolves names and masks) over a
// coloured letter tile that shows until, or instead of, the icon.
export function appIcon(backend, process, cls) {
  const label = appLabel(process);
  const key = String(process || "").trim().toLowerCase();
  const url = key && !misses.has(key) ? backend.iconURL(process) : "";
  const img = url ? `<img alt="" draggable="false" src="${esc(url)}" data-icon="${esc(key)}">` : "";
  return `<span class="app-ic${cls ? " " + cls : ""}" style="--hue:${glyphHue(label)}" aria-hidden="true">${img}<b>${esc((label.replace(/^[^\p{L}\p{N}]+/u, "") || "?").slice(0, 1).toUpperCase())}</b></span>`;
}

// Proxy lanes take colours in turn; Direct is neutral and Block is red.
export const LANE_COLORS = 6;

export function laneColor(cfg, laneId) {
  if (laneId === "direct") return "var(--lane-direct)";
  if (laneId === "block") return "var(--lane-block)";
  const i = (cfg.proxies || []).findIndex((p) => "p:" + p.name === laneId);
  return `var(--lane-${(i < 0 ? 0 : i) % LANE_COLORS})`;
}

export function laneName(laneId) {
  if (laneId === "direct") return "Напрямую";
  if (laneId === "block") return "Блокировать";
  return laneId.slice(2);
}

export function laneSub(cfg, laneId) {
  if (laneId === "direct") return "Без прокси";
  if (laneId === "block") return "Трафик отбрасывается";
  const p = (cfg.proxies || []).find((x) => "p:" + x.name === laneId);
  if (!p) return "Прокси не найден";
  if (p.type === "vless" && p.vless) return ["VLESS", p.vless.network, p.vless.security].filter(Boolean).map((s) => String(s).toUpperCase()).join(" · ");
  return proxyTypeLabel(p.type);
}

// routePhrase reads naturally after an app name: "через aeza", "напрямую".
export function routePhrase(laneId) {
  if (laneId === "direct") return "напрямую";
  if (laneId === "block") return "блокируется";
  return "через " + laneId.slice(2);
}

export function proxyEndpoint(p) {
  if (p.type === "vless" && p.socksPort) return "127.0.0.1:" + p.socksPort;
  return p.address || "";
}
