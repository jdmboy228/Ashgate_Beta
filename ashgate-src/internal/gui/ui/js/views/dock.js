// The dock under the lanes: running programs with a window that no rule
// covers yet. Drag a chip onto a lane, or click it to pick a lane. When cards
// are selected, the dock turns into the selection bar.

import * as M from "../model.js";
import { appLabel, esc, words } from "../format.js";
import { el, setText, setHTML, reconcile } from "../dom.js";
import { icon } from "../icons.js";
import { appIcon } from "./common.js";

export function createDock(ctx) {
  const { store, actions } = ctx;
  const root = document.getElementById("dock");
  root.innerHTML = `<div class="dock-apps"><div class="dock-label"><strong>Запущены, без правила</strong><span>Перетащите на полосу или нажмите</span></div><div class="dock-chips" role="list" aria-label="Запущенные приложения без правила"></div><span class="dock-empty" hidden>Все открытые программы уже на полосах</span><button class="btn subtle dock-find" type="button" data-act="find-app" title="Найти другое приложение (Ctrl+N)">${icon("search", 16)}<span>Найти другое приложение…</span></button></div><div class="selbar" hidden></div>`;
  const apps = root.querySelector(".dock-apps");
  const chips = root.querySelector(".dock-chips");
  const empty = root.querySelector(".dock-empty");
  const selbar = root.querySelector(".selbar");
  let selection = [];

  function makeChip(a) {
    const b = el("button", "app-chip");
    b.type = "button";
    b.dataset.drag = "app";
    b.setAttribute("role", "listitem");
    return b;
  }
  function updateChip(b, a) {
    const label = appLabel(a.path || a.name);
    b.dataset.path = a.path || a.name;
    b.dataset.name = label;
    b.title = (a.title ? a.title + "\n" : "") + (a.path || a.name) + "\nПеретащите на полосу или нажмите, чтобы выбрать";
    setHTML(b, `${appIcon(store.backend, a.path || a.name, "sm")}<span>${esc(label)}</span>${icon("add", 12)}`);
  }

  root.addEventListener("click", (e) => {
    const chip = e.target.closest(".app-chip");
    if (chip) { actions.chipMenu(chip, chip.dataset.path); return; }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const a = act.dataset.act;
    if (a === "find-app") actions.openAddApp();
    else if (a === "sel-group") actions.groupSelection(selection);
    else if (a === "sel-move") actions.moveSelectionMenu(act, selection);
    else if (a === "sel-off") actions.disableSelection(selection);
    else if (a === "sel-del") actions.removeSelection(selection);
    else if (a === "sel-clear") actions.clearSelection();
  });

  function render() {
    const v = store.view;
    if (!v) return;
    const cfg = v.config;
    const welcome = !(cfg.proxies || []).length && !(cfg.rules || []).length;
    root.hidden = welcome;
    if (selection.length) {
      apps.hidden = true;
      selbar.hidden = false;
      const groups = selection.some((id) => id.startsWith("g:"));
      setHTML(selbar, `<strong>Выбрано: ${selection.length}</strong><span class="sel-hint">Ctrl + щелчок — добавить или убрать</span><span class="grow"></span>
        ${selection.length > 1 && !groups ? `<button class="btn" type="button" data-act="sel-group">${icon("folder", 16)}Сгруппировать</button>` : ""}
        <button class="btn" type="button" data-act="sel-move">${icon("arrowRight", 16)}Переместить</button>
        <button class="btn" type="button" data-act="sel-off">${icon("pause", 16)}Выключить</button>
        <button class="btn danger-subtle" type="button" data-act="sel-del">${icon("trash", 16)}Удалить</button>
        <button class="btn subtle" type="button" data-act="sel-clear">Отмена</button>`);
      return;
    }
    apps.hidden = false;
    selbar.hidden = true;
    const list = M.dockApps(store.local.processes, cfg).slice(0, 12);
    reconcile(chips, list, (a) => (a.path || a.name).toLowerCase(), makeChip, updateChip);
    empty.hidden = list.length > 0 || !store.local.processes.length;
    setText(root.querySelector(".dock-label span"), list.length ? `${list.length} ${words.app(list.length)} · перетащите на полосу` : "Перетащите на полосу или нажмите");
  }

  return {
    render,
    setSelection(ids) { selection = ids; render(); },
  };
}
