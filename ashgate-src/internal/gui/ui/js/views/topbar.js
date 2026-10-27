// Title bar: brand, the Off / On / Strict switch, live totals, the main
// actions and the caption buttons. Empty space drags the window.

import * as M from "../model.js";
import { rate, words, appLabel } from "../format.js";
import { setText, setClass, setAttr } from "../dom.js";
import { icon } from "../icons.js";

const MODES = [
  { id: "off", label: "Выкл", tip: "Ashgate выключен: все программы ходят в сеть напрямую" },
  { id: "on", label: "Вкл", tip: "Приложения идут по своим полосам" },
  { id: "strict", label: "Строго", tip: "Как «Вкл», плюс kill switch: приложения с прокси никогда не выходят в сеть напрямую — даже если прокси упал или Ashgate закрыт" },
];

export function createTopbar(ctx) {
  const { store, actions, ticker } = ctx;
  const root = document.getElementById("topbar");
  root.innerHTML = `<div class="brand"><img src="logo.svg" width="18" height="18" alt=""><span>Ashgate</span></div>
    <div class="mode" role="radiogroup" aria-label="Режим работы"><span class="mode-thumb" aria-hidden="true"></span>${MODES.map((m) => `<button type="button" role="radio" data-mode="${m.id}" title="${m.tip}">${m.id === "strict" ? icon("shieldLock", 14) : ""}<span>${m.label}</span></button>`).join("")}</div>
    <div class="status"><span class="st-dot" aria-hidden="true"></span><span class="st-rate"></span><span class="st-rest"></span></div>
    <div class="drag-fill"></div>
    <button class="btn accent tb-add" type="button" data-act="add-app" title="Добавить приложение (Ctrl+N)">${icon("add", 16)}<span>Добавить приложение</span></button>
    <div class="tb-tools">
      <button class="iconbtn" type="button" data-sheet="proxies" title="Прокси (Ctrl+P)" aria-label="Прокси">${icon("server", 18)}</button>
      <button class="iconbtn" type="button" data-sheet="log" title="Подключения (Ctrl+L)" aria-label="Подключения">${icon("pulse", 18)}</button>
      <button class="iconbtn" type="button" data-sheet="settings" title="Настройки (Ctrl+,)" aria-label="Настройки">${icon("settings", 18)}</button>
    </div>
    <div class="caption"><button type="button" data-win="Min" aria-label="Свернуть">${icon("min", 14)}</button><button type="button" data-win="Max" aria-label="Развернуть">${icon("max", 12)}</button><button type="button" class="close" data-win="Close" aria-label="Закрыть">${icon("close", 14)}</button></div>`;

  const mode = root.querySelector(".mode");
  const thumb = root.querySelector(".mode-thumb");
  const buttons = [...mode.querySelectorAll("[data-mode]")];
  const dot = root.querySelector(".st-dot");
  const rateEl = root.querySelector(".st-rate");
  const rest = root.querySelector(".st-rest");
  let busy = "";
  let current = "";

  function placeThumb(id) {
    const b = buttons.find((x) => x.dataset.mode === id);
    if (!b) return;
    thumb.style.width = b.offsetWidth + "px";
    thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    thumb.dataset.mode = id;
  }

  async function choose(id) {
    if (busy || id === current) return;
    busy = id;
    render();
    try {
      await actions.setMode(id);
    } finally {
      busy = "";
      render();
    }
  }

  mode.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) choose(b.dataset.mode);
  });
  mode.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === current);
    const next = MODES[Math.max(0, Math.min(MODES.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
    buttons.find((b) => b.dataset.mode === next.id).focus();
    choose(next.id);
  });
  root.addEventListener("click", (e) => {
    const w = e.target.closest("[data-win]");
    if (w) { store.backend.window(w.dataset.win); return; }
    const s = e.target.closest("[data-sheet]");
    if (s) { actions.openSheet(s.dataset.sheet); return; }
    if (e.target.closest("[data-act='add-app']")) actions.openAddApp();
  });
  root.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button, input, .mode")) return;
    store.backend.window("Drag");
  });
  root.addEventListener("dblclick", (e) => {
    if (e.target.closest("button, .mode")) return;
    store.backend.window("Max");
  });
  addEventListener("resize", () => placeThumb(current));
  // Button widths change once the web fonts arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeThumb(current));

  function render() {
    const v = store.view;
    if (!v) return;
    const m = M.mode(v);
    const shown = busy || m;
    if (shown !== current || !thumb.style.width) { current = shown; placeThumb(shown); }
    for (const b of buttons) {
      const on = b.dataset.mode === shown;
      setAttr(b, "aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      setClass(b, "on", on);
    }
    setClass(mode, "busy", !!busy);
    setClass(root, "running", !!v.running);
    setClass(root, "strict", m === "strict");
    const ks = v.killSwitch || {};
    const blocked = (ks.blocked || []).length;
    if (v.running) {
      const flows = v.active || 0;
      const speed = Object.values(v.ruleStats || {}).reduce((n, s) => n + (s.downRate || 0), 0);
      setClass(dot, "on", true);
      if (flows) { ticker.set(rateEl, speed, (x) => "↓ " + rate(x)); setText(rest, ` · ${flows} ${words.flow(flows)}`); }
      else { rateEl._v = undefined; setText(rateEl, ""); setText(rest, "Работает · нет соединений"); }
    } else {
      setClass(dot, "on", false);
      rateEl._v = undefined;
      setText(rateEl, "");
      setText(rest, blocked ? `Kill switch: ${blocked} ${words.program(blocked)} без сети` : "Выключен");
      setAttr(rest, "title", blocked ? (ks.blocked || []).map(appLabel).join(", ") : "Ashgate выключен: все программы ходят в сеть напрямую");
    }
  }

  return { render, focusMode: () => (buttons.find((b) => b.dataset.mode === current) || buttons[0]).focus() };
}
