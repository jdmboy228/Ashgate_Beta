// Entry point: build the store on the live (or demo) backend, mount the
// views, and route store changes to them. Global shortcuts live here.

import { liveBackend } from "./api.js";
import { demoBackend } from "./demo.js";
import { createStore } from "./store.js";
import { createTicker } from "./dom.js";
import { createActions } from "./actions.js";
import { createBoard } from "./views/board.js";
import { createTopbar } from "./views/topbar.js";
import { createDock } from "./views/dock.js";
import { createDnd } from "./views/dnd.js";
import { updateSheet, sheetKind, dialogOpen, isMenuOpen, closeSheet, toast } from "./overlay.js";

const params = new URLSearchParams(location.search);
const demo = params.get("demo") === "1";
const backend = demo ? demoBackend(location.hash.slice(1)) : liveBackend;
const store = createStore(backend);

const ctx = { store, ticker: createTicker() };
ctx.actions = createActions(ctx);
ctx.topbar = createTopbar(ctx);
ctx.board = createBoard(ctx);
ctx.dock = createDock(ctx);
ctx.dnd = createDnd(ctx);
ctx.renderAll = (force) => {
  ctx.topbar.render();
  ctx.board.render(force);
  ctx.dock.render();
};

let theme = "";
ctx.applyTheme = (t) => {
  t = t === "light" ? "light" : "dark";
  if (t === theme) return;
  theme = t;
  document.documentElement.dataset.theme = t;
  backend.theme(t === "dark");
};
if (params.get("theme")) ctx.applyTheme(params.get("theme"));

store.subscribe((reasons) => {
  const v = store.view;
  if (!v) return;
  if (!params.get("theme")) ctx.applyTheme(v.theme);
  // The dock list and probe badges change without a new snapshot.
  ctx.renderAll(false);
  if (reasons.has("state") || reasons.has("events") || reasons.has("probe") || reasons.has("config")) updateSheet(reasons);
});

store.onNotice((n) => toast(n.text, { kind: n.kind === "error" ? "error" : "info", key: "notice-" + n.kind }));

// ---------- shortcuts ----------

function typing(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

document.addEventListener("keydown", (e) => {
  if (dialogOpen() || ctx.dnd.active) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z" && !typing(e)) { e.preventDefault(); ctx.actions.undo(); return; }
  if (ctrl && e.key.toLowerCase() === "n") { e.preventDefault(); ctx.actions.openAddApp(); return; }
  if (ctrl && e.key.toLowerCase() === "l") { e.preventDefault(); ctx.actions.openSheet("log"); return; }
  if (ctrl && e.key.toLowerCase() === "p") { e.preventDefault(); ctx.actions.openSheet("proxies"); return; }
  if (ctrl && e.key === ",") { e.preventDefault(); ctx.actions.openSheet("settings"); return; }
  if (e.key === "Escape" && !isMenuOpen()) {
    if (sheetKind()) { closeSheet(); return; }
    ctx.board.clearSelection();
  }
});

// Ctrl+V anywhere outside a text field: a vless:// link opens the proxy editor.
document.addEventListener("paste", (e) => {
  if (typing(e) || dialogOpen()) return;
  const text = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
  if (/^vless:\/\//i.test(text)) { e.preventDefault(); ctx.actions.openProxyEditor(null, { type: "vless", link: text }); }
  else if (text) toast("Чтобы добавить прокси, вставьте ссылку vless://", { key: "paste" });
});

// ---------- start ----------

async function boot() {
  await store.start();
  if (!store.view) {
    // The poll keeps retrying; wait for the first snapshot instead of giving up.
    const close = toast("Подключаюсь к Ashgate…", { ms: 0 });
    while (!store.view) await new Promise((r) => setTimeout(r, 500));
    close();
  }
  const v = store.view;
  ctx.renderAll(true);
  store.loadProcesses();
  // Running programs for the dock; slower while the window is in the tray.
  setInterval(() => {
    const view = store.view;
    if (!document.hidden && !(view && view.hidden) && !ctx.dnd.active) store.loadProcesses();
  }, 4000);
  const cfg = v.config;
  if ((cfg.proxies || []).length && !Object.keys(v.checks || {}).length) store.probeAll().catch(() => {});
  if (!demo && !(cfg.proxies || []).length) ctx.actions.pasteLink(true);
  if (location.hash === "#add") ctx.actions.openAddApp();
  if (location.hash === "#new-proxy") ctx.actions.openProxyEditor(null, { type: "vless", link: "vless://b7e2c1a0-4f3a-4c2b-9a11-111111111111@203.0.113.20:443?type=tcp&security=reality&sni=www.microsoft.com&fp=chrome&pbk=AAEC&sid=ab12#nl-fast" });
  const sheet = params.get("sheet");
  if (sheet) ctx.actions.openSheet(sheet);
}

boot();
window.__ashgate = ctx; // for debugging in DevTools
