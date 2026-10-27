// Overlays: popover menus, toasts, dialogs and side sheets. Each one handles
// its own keyboard (arrows, Enter, Esc), focus return and enter/leave motion.

import { el, trapFocus, reduceMotion, EASE_OUT } from "./dom.js";
import { icon } from "./icons.js";
import { esc } from "./format.js";

const motion = (n, frames, ms) => (!reduceMotion() && n.animate ? n.animate(frames, { duration: ms || 167, easing: EASE_OUT }) : null);

// ---------- menu ----------

let menu = null;

export function closeMenu(focusAnchor) {
  if (!menu) return;
  const { node, anchor } = menu;
  menu = null;
  node.remove();
  document.removeEventListener("pointerdown", onOutside, true);
  if (anchor) anchor.removeAttribute("aria-expanded");
  if (focusAnchor && anchor && anchor.isConnected) anchor.focus();
}

function onOutside(e) {
  if (menu && !menu.node.contains(e.target) && !(menu.anchor && menu.anchor.contains(e.target))) closeMenu(false);
}

export function isMenuOpen(anchor) {
  return !!menu && (!anchor || menu.anchor === anchor);
}

// openMenu shows items under anchor (or at a point). An item is
// { label, sub, icon, check, danger, disabled, run } or { sep: true } or { header }.
export function openMenu(anchor, items, opts) {
  opts = opts || {};
  if (menu && menu.anchor === anchor && anchor) { closeMenu(true); return; }
  closeMenu(false);
  const node = el("div", "menu");
  node.setAttribute("role", "menu");
  const buttons = [];
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { node.appendChild(el("div", "menu-sep")); continue; }
    if (it.header) { node.appendChild(el("div", "menu-head", esc(it.header))); continue; }
    const b = el("button", "menu-item" + (it.danger ? " danger" : ""));
    b.type = "button";
    b.setAttribute("role", typeof it.check === "boolean" ? "menuitemcheckbox" : "menuitem");
    if (typeof it.check === "boolean") b.setAttribute("aria-checked", String(it.check));
    if (it.disabled) b.disabled = true;
    const lead = typeof it.check === "boolean" ? `<span class="mi-check">${it.check ? icon("check", 16) : ""}</span>` : `<span class="mi-icon">${it.icon ? icon(it.icon, 16) : ""}</span>`;
    b.innerHTML = `${lead}<span class="mi-text"><span class="mi-label">${esc(it.label)}</span>${it.sub ? `<span class="mi-sub">${esc(it.sub)}</span>` : ""}</span>${it.hint ? `<kbd class="mi-hint">${esc(it.hint)}</kbd>` : ""}${it.trail ? `<span class="mi-trail">${it.trail}</span>` : ""}`;
    b.addEventListener("click", () => { closeMenu(!opts.noReturn); if (it.run) it.run(); });
    node.appendChild(b);
    buttons.push(b);
  }
  document.body.appendChild(node);
  // Place under the anchor, flipped up when it would leave the window.
  const r = anchor ? anchor.getBoundingClientRect() : { left: opts.x, right: opts.x, top: opts.y, bottom: opts.y };
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let x = opts.alignLeft ? r.left : r.right - w;
  let y = r.bottom + 4;
  let up = false;
  if (y + h > innerHeight - 8 && r.top - h - 4 > 8) { y = r.top - h - 4; up = true; }
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  y = Math.max(8, Math.min(y, innerHeight - h - 8));
  node.style.left = x + "px";
  node.style.top = y + "px";
  motion(node, [{ opacity: 0, transform: `translateY(${up ? 6 : -6}px)` }, { opacity: 1, transform: "none" }], 200);
  if (anchor) anchor.setAttribute("aria-expanded", "true");
  menu = { node, anchor };
  document.addEventListener("pointerdown", onOutside, true);
  node.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); buttons[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); buttons[buttons.length - 1].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === "Tab") closeMenu(false);
  });
  const first = buttons.find((b) => !b.disabled);
  if (first && opts.focus !== false) first.focus({ preventScroll: true });
}

// ---------- toasts ----------

// toast shows a short message above the dock. An action (Undo) keeps it a
// little longer; errors stay until closed or replaced.
export function toast(text, opts) {
  opts = opts || {};
  const host = document.getElementById("toasts");
  if (!host || !text) return () => {};
  if (opts.key) host.querySelectorAll(`[data-key="${CSS.escape(opts.key)}"]`).forEach((n) => n.remove());
  while (host.children.length >= 3) host.firstElementChild.remove();
  const kind = opts.kind || "info";
  const t = el("div", "toast " + kind);
  if (opts.key) t.dataset.key = opts.key;
  t.setAttribute("role", kind === "error" ? "alert" : "status");
  const ic = kind === "error" ? "error" : kind === "success" ? "check" : kind === "warn" ? "warn" : "info";
  t.innerHTML = `<span class="toast-ic">${icon(ic, 16)}</span><span class="toast-text">${esc(text)}</span>`;
  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    if (!t.isConnected) return;
    const a = motion(t, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px)" }], 140);
    if (a) a.onfinish = () => t.remove(); else t.remove();
  };
  if (opts.action) {
    const b = el("button", "btn subtle sm toast-act", (opts.action.icon ? icon(opts.action.icon, 14) : "") + esc(opts.action.label));
    b.type = "button";
    b.addEventListener("click", () => { close(); opts.action.run(); });
    t.appendChild(b);
  }
  const x = el("button", "iconbtn sm toast-x", icon("close", 12));
  x.type = "button";
  x.setAttribute("aria-label", "Закрыть");
  x.addEventListener("click", close);
  t.appendChild(x);
  host.appendChild(t);
  motion(t, [{ opacity: 0, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "none" }], 250);
  const ms = opts.ms ?? (kind === "error" ? 9000 : opts.action ? 6000 : 3200);
  if (ms > 0) {
    const arm = () => { timer = setTimeout(close, ms); };
    t.addEventListener("pointerenter", () => clearTimeout(timer));
    t.addEventListener("pointerleave", arm);
    arm();
  }
  return close;
}

// ---------- dialogs ----------

let dialog = null;

export function dialogOpen() {
  return !!dialog;
}

// openDialog shows a modal ContentDialog. body is a Node; buttons are
// { label, kind: "primary" | "secondary" | "danger", run }. A button's run
// may return false to keep the dialog open, or a Promise (the dialog shows
// it is busy until it settles).
export function openDialog(o) {
  closeDialog(false);
  const back = document.activeElement;
  const scrim = el("div", "scrim");
  const box = el("div", "dialog" + (o.wide ? " wide" : "") + (o.cls ? " " + o.cls : ""));
  box.setAttribute("role", o.alert ? "alertdialog" : "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "dlg-title");
  const head = el("div", "dlg-head", `${o.icon ? `<span class="dlg-ic ${o.tone || ""}">${icon(o.icon, 20)}</span>` : ""}<div><h2 id="dlg-title">${esc(o.title)}</h2>${o.sub ? `<p class="dlg-sub">${esc(o.sub)}</p>` : ""}</div>`);
  const body = el("div", "dlg-body");
  if (o.body) body.appendChild(o.body);
  const foot = el("div", "dlg-foot");
  const btns = (o.buttons || [{ label: "Закрыть", kind: "secondary" }]).map((b) => {
    const n = el("button", "btn " + (b.kind === "primary" ? "accent" : b.kind === "danger" ? "danger" : ""), esc(b.label));
    n.type = "button";
    if (b.disabled) n.disabled = true;
    n.addEventListener("click", async () => {
      if (!b.run) { closeDialog(true); return; }
      let res;
      try {
        box.classList.add("busy");
        btns.forEach((x) => { x.disabled = true; });
        res = await b.run();
      } catch (e) {
        res = false;
        toast(e.message, { kind: "error" });
      } finally {
        if (box.isConnected) { box.classList.remove("busy"); btns.forEach((x, i) => { x.disabled = !!(o.buttons[i] || {}).disabled; }); }
      }
      if (res !== false) closeDialog(true);
    });
    foot.appendChild(n);
    return n;
  });
  box.append(head, body, foot);
  scrim.appendChild(box);
  document.body.appendChild(scrim);
  motion(scrim, [{ opacity: 0 }, { opacity: 1 }], 167);
  motion(box, [{ opacity: 0, transform: "scale(1.04)" }, { opacity: 1, transform: "none" }], 250);
  dialog = { scrim, back, onClose: o.onClose };
  const primary = btns[(o.buttons || []).findIndex((b) => b.kind === "primary" || b.kind === "danger")];
  scrim.addEventListener("keydown", (e) => {
    trapFocus(box, e);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDialog(true); }
    if (e.key === "Enter" && primary && !primary.disabled && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") { e.preventDefault(); primary.click(); }
  });
  const focus = box.querySelector("[autofocus]") || box.querySelector("input, select, textarea") || primary || btns[0];
  if (focus) setTimeout(() => focus.focus(), 0);
  return { box, body, buttons: btns, close: () => closeDialog(true) };
}

export function closeDialog(returnFocus) {
  if (!dialog) return;
  const { scrim, back, onClose } = dialog;
  dialog = null;
  const a = motion(scrim, [{ opacity: 1 }, { opacity: 0 }], 120);
  if (a) a.onfinish = () => scrim.remove(); else scrim.remove();
  if (onClose) onClose();
  if (returnFocus && back && back.isConnected) back.focus();
}

// ---------- side sheet ----------

let sheet = null;

export function sheetKind() {
  return sheet ? sheet.kind : "";
}

// openSheet slides a panel in from the right. render(body) fills it;
// update() is called on every store change while it is open.
export function openSheet(o) {
  if (sheet && sheet.kind === o.kind) { closeSheet(); return null; }
  closeSheet(true);
  const back = document.activeElement;
  const scrim = el("div", "sheet-scrim");
  const node = el("aside", "sheet" + (o.wide ? " wide" : ""));
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-label", o.title);
  node.innerHTML = `<header class="sheet-head"><span class="sheet-ic">${icon(o.icon, 20)}</span><h2>${esc(o.title)}</h2><span class="sheet-tools"></span><button class="iconbtn" type="button" data-close aria-label="Закрыть (Esc)" title="Закрыть (Esc)">${icon("close", 16)}</button></header><div class="sheet-body"></div>`;
  const body = node.querySelector(".sheet-body");
  const tools = node.querySelector(".sheet-tools");
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) closeSheet(); });
  node.querySelector("[data-close]").addEventListener("click", () => closeSheet());
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !isMenuOpen()) { e.preventDefault(); e.stopPropagation(); closeSheet(); }
  });
  document.body.append(scrim, node);
  motion(scrim, [{ opacity: 0 }, { opacity: 1 }], 200);
  motion(node, [{ transform: "translateX(40px)", opacity: 0 }, { transform: "none", opacity: 1 }], 333);
  sheet = { kind: o.kind, node, scrim, body, tools, back, update: o.update, onClose: o.onClose };
  if (o.render) o.render(body, tools);
  setTimeout(() => { const f = body.querySelector("[autofocus]") || node.querySelector("[data-close]"); if (f) f.focus({ preventScroll: true }); }, 0);
  return sheet;
}

export function updateSheet(reasons) {
  if (sheet && sheet.update) sheet.update(sheet.body, reasons);
}

export function closeSheet(instant) {
  if (!sheet) return;
  const { node, scrim, back, onClose } = sheet;
  sheet = null;
  if (onClose) onClose();
  closeMenu(false);
  if (instant || reduceMotion()) { node.remove(); scrim.remove(); }
  else {
    const a = motion(node, [{ transform: "none", opacity: 1 }, { transform: "translateX(40px)", opacity: 0 }], 167);
    motion(scrim, [{ opacity: 1 }, { opacity: 0 }], 167);
    if (a) a.onfinish = () => { node.remove(); scrim.remove(); }; else { node.remove(); scrim.remove(); }
  }
  if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
}
