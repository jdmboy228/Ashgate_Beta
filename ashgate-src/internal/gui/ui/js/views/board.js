// The lanes board: one lane per route, app cards inside. Structure (which
// card sits where) is rebuilt only when it changes, with FLIP motion; live
// figures update in place every poll without touching the layout.

import * as M from "../model.js";
import { rate, words, appLabel, esc, unquote } from "../format.js";
import { el, setText, setHTML, setClass, setAttr, reconcile, flip } from "../dom.js";
import { icon } from "../icons.js";
import { appIcon, laneColor, laneName, laneSub, routePhrase } from "./common.js";

const METER_MAX = Math.log10(16 * 1024 * 1024); // 16 MB/s fills the activity bar
const COACH_KEY = "ashgate.coach.done";

function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

export function createBoard(ctx) {
  const { store, actions, ticker } = ctx;
  const root = document.getElementById("board");
  const pool = new Map(); // unit id -> card; shared by every lane so a card can glide across
  const laneNodes = new Map();
  const selected = new Set();
  let view = ""; // "welcome" | "lanes"
  let sig = "";
  let wrap = null;
  let coach = null;
  let focusId = "";
  let deferred = false;
  let coachShown = false;

  // ---------- structure ----------

  function lanesOf(cfg, b) {
    const ls = M.lanes(cfg);
    for (const id of b.keys()) if (!ls.some((l) => l.id === id)) ls.splice(ls.length - 2, 0, { id, kind: "orphan" });
    return ls;
  }

  function signature(cfg, ls, b) {
    return ls.map((l) => l.id + "~" + laneSub(cfg, l.id) + ":" + (b.get(l.id) || []).map((u) => u.kind === "group" ? u.id + (u.group.collapsed ? "-" : "+") + "[" + u.memberIds.join(",") + "]" : u.id).join(",")).join("|");
  }

  function render(force) {
    const v = store.view;
    if (!v) return;
    const cfg = v.config;
    if (ctx.dnd && ctx.dnd.active) { deferred = true; live(v); return; }
    deferred = false;
    if (!(cfg.proxies || []).length && !(cfg.rules || []).length) { showWelcome(); return; }
    if (view !== "lanes") {
      root.textContent = "";
      coach = el("div", "coach");
      coach.hidden = true;
      wrap = el("div", "lanes");
      root.append(coach, wrap);
      view = "lanes";
      sig = "";
      pool.clear();
      laneNodes.clear();
    }
    const b = M.board(cfg);
    const ls = lanesOf(cfg, b);
    const s = signature(cfg, ls, b);
    if (s !== sig || force) {
      const mutate = () => structure(cfg, ls, b);
      if (!sig) mutate();
      else flip(() => [...pool.values(), ...laneNodes.values()].filter((n) => n.isConnected), mutate);
      sig = s;
    }
    live(v);
    renderCoach(v);
  }

  function structure(cfg, ls, b) {
    reconcile(wrap, [...ls, { id: "+add", kind: "add" }], (l) => l.id, (l) => (l.kind === "add" ? makeAddLane() : makeLane(l)), (n, l) => { if (l.kind !== "add") laneStatic(n, cfg, l, ls); });
    for (const k of [...laneNodes.keys()]) if (!ls.some((l) => l.id === k)) laneNodes.delete(k);
    for (const l of ls) {
      const n = laneNodes.get(l.id);
      const list = b.get(l.id) || [];
      reconcile(n._list, list, (u) => u.id, makeCard, (c, u) => cardStatic(c, u, cfg), pool, n._drop);
    }
    const used = new Set();
    b.forEach((us) => us.forEach((u) => used.add(u.id)));
    for (const [k, c] of pool) if (!used.has(k)) { c.remove(); pool.delete(k); }
    for (const id of [...selected]) if (!used.has(id)) selected.delete(id);
    if (focusId && !used.has(focusId)) focusId = "";
    ensureTabStop();
  }

  function makeAddLane() {
    const n = el("button", "lane add-lane", `${icon("add", 20)}<span class="al-title">Прокси</span><span class="al-sub">Новая полоса</span>`);
    n.type = "button";
    n.dataset.act = "add-proxy";
    n.title = "Добавить прокси — новая полоса";
    return n;
  }

  function makeLane(l) {
    const n = el("section", "lane");
    n.dataset.lane = l.id;
    n.innerHTML = `<header class="lane-head"><span class="lane-bar"></span><div class="lane-row"><h3 class="lane-name"></h3><kbd class="lane-key"></kbd><span class="lane-tools"></span></div><div class="lane-sub"></div><div class="lane-meta"></div></header><div class="lane-traffic"><span class="lt-rate"></span><span class="lt-rest"></span></div><div class="lane-list" role="list"></div>`;
    const list = n.querySelector(".lane-list");
    const drop = el("button", "dropzone", `${icon("add", 16)}<span class="dz-text"></span>`);
    drop.type = "button";
    drop.dataset.act = "drop-add";
    list.appendChild(drop);
    Object.assign(n, {
      _list: list, _drop: drop, _name: n.querySelector(".lane-name"), _key: n.querySelector(".lane-key"), _sub: n.querySelector(".lane-sub"),
      _meta: n.querySelector(".lane-meta"), _tools: n.querySelector(".lane-tools"), _rate: n.querySelector(".lt-rate"), _rest: n.querySelector(".lt-rest"),
    });
    if (l.kind === "proxy") {
      n._tools.innerHTML = `<button class="iconbtn sm" type="button" data-act="lane-test" title="Проверить прокси" aria-label="Проверить прокси">${icon("bolt", 14)}</button><button class="iconbtn sm" type="button" data-act="lane-menu" title="Ещё" aria-label="Действия с прокси">${icon("more", 14)}</button>`;
    }
    laneNodes.set(l.id, n);
    return n;
  }

  function laneStatic(n, cfg, l, ls) {
    const i = ls.indexOf(l);
    n.style.setProperty("--lane", laneColor(cfg, l.id));
    setClass(n, "is-direct", l.id === "direct");
    setClass(n, "is-block", l.id === "block");
    setClass(n, "is-orphan", l.kind === "orphan");
    setText(n._name, laneName(l.id));
    setText(n._sub, laneSub(cfg, l.id));
    setText(n._key, i < 9 ? String(i + 1) : "");
    setAttr(n._key, "title", i < 9 ? `Клавиша ${i + 1}: переместить выбранную карточку сюда` : null);
    setAttr(n, "aria-label", `Полоса ${laneName(l.id)}`);
  }

  function makeCard(u) {
    const n = el("div", "card" + (u.kind === "group" ? " group" : ""));
    n.dataset.drag = "card";
    n.tabIndex = -1;
    n.setAttribute("role", "listitem");
    // Two rows: name and live status on the left; switch on top right, flags
    // and the menu under it. Narrow lanes keep the whole name readable.
    const body = `<div class="card-main"><div class="card-name">${u.kind === "group" ? `<span class="group-ic">${icon("folder", 14)}</span>` : ""}<span class="nm"></span></div><div class="card-sub"><span class="c-rate"></span><span class="c-rest"></span></div></div>
      <button class="switch sm" type="button" role="switch" data-act="toggle"><i></i></button>
      <div class="card-tail"><span class="flags"></span><button class="iconbtn xs card-more" type="button" data-act="card-menu" aria-label="Параметры" title="Параметры">${icon("more", 14)}</button></div>`;
    if (u.kind === "group") {
      n.innerHTML = `<div class="group-head"><button class="chev" type="button" data-act="collapse">${icon("chevDown", 14)}</button>${body}</div><div class="group-body"><div class="group-members" role="list"></div></div><div class="meter"><i></i></div>`;
      n._members = n.querySelector(".group-members");
      n._chev = n.querySelector(".chev");
    } else {
      n.innerHTML = `<span class="card-ic"></span>${body}<div class="meter"><i></i></div>`;
      n._ic = n.querySelector(".card-ic");
    }
    Object.assign(n, {
      _nm: n.querySelector(".nm"), _flags: n.querySelector(".flags"), _sub: n.querySelector(".card-sub"), _rate: n.querySelector(".c-rate"),
      _rest: n.querySelector(".c-rest"), _sw: n.querySelector(".switch"), _meter: n.querySelector(".meter i"),
    });
    return n;
  }

  function cardStatic(n, u, cfg) {
    if (u.kind === "group") {
      setText(n._nm, u.group.name);
      setClass(n, "collapsed", !!u.group.collapsed);
      setAttr(n._chev, "aria-expanded", String(!u.group.collapsed));
      setAttr(n._chev, "aria-label", u.group.collapsed ? "Развернуть группу" : "Свернуть группу");
      reconcile(n._members, u.members.map((j, k) => ({ id: u.memberIds[k], rule: cfg.rules[j] })), (m) => m.id, makeMember, (row, m) => memberStatic(row, m));
      return;
    }
    const p = u.rule.process;
    if (n._proc !== p) {
      n._proc = p;
      setHTML(n._ic, appIcon(store.backend, unquote(p)));
      setText(n._nm, appLabel(p));
      n.title = unquote(p);
    }
  }

  function makeMember(m) {
    const n = el("div", "member");
    n.setAttribute("role", "listitem");
    n.dataset.member = "1";
    n.innerHTML = `<span class="card-ic sm"></span><span class="m-text"><span class="m-name"></span><span class="m-sub"></span></span><button class="switch sm" type="button" role="switch" data-act="toggle"><i></i></button><button class="iconbtn xs m-more" type="button" data-act="card-menu" aria-label="Параметры" title="Параметры">${icon("more", 12)}</button>`;
    Object.assign(n, { _ic: n.querySelector(".card-ic"), _nm: n.querySelector(".m-name"), _sub: n.querySelector(".m-sub"), _sw: n.querySelector(".switch") });
    return n;
  }

  function memberStatic(n, m) {
    const p = m.rule.process;
    if (n._proc === p) return;
    n._proc = p;
    setHTML(n._ic, appIcon(store.backend, unquote(p), "sm"));
    setText(n._nm, appLabel(p));
    n.title = unquote(p);
  }

  // ---------- live figures ----------

  function live(v) {
    if (view !== "lanes") return;
    const cfg = v.config;
    const b = M.board(cfg);
    const sh = M.shadows(cfg);
    for (const [id, n] of laneNodes) {
      const list = b.get(id) || [];
      laneLive(n, id, list, v, cfg);
    }
    for (const list of b.values()) for (const u of list) {
      const n = pool.get(u.id);
      if (n) cardLive(n, u, v, cfg, sh);
    }
  }

  function laneLive(n, id, list, v, cfg) {
    if (id.startsWith("p:")) {
      const name = id.slice(2);
      const p = (cfg.proxies || []).find((x) => x.name === name);
      const h = M.health((v.checks || {})[name], store.local.probing.has(name));
      const udp = p && p.type === "http" ? `<span class="chip" title="HTTP-прокси не передаёт UDP">только TCP</span>` : h.udp ? `<span class="chip" title="Прокси передаёт UDP">UDP</span>` : "";
      const bridge = p && p.type === "vless" && p.socksPort ? `<span class="chip mono" title="Локальный SOCKS5 для других программ">:${p.socksPort}</span>` : "";
      setHTML(n._meta, `<span class="health ${h.kind}" title="${esc(h.detail || h.label)}"><i></i>${esc(h.label)}</span>${udp}${bridge}`);
      setClass(n, "is-down", h.kind === "down");
    } else setHTML(n._meta, "");
    const t = M.laneTraffic(v, cfg, list);
    if (!v.running) { n._rate._v = undefined; setText(n._rate, ""); setText(n._rest, list.length ? "Ashgate выключен" : ""); }
    else if (t.flows) { ticker.set(n._rate, t.down, (x) => "↓ " + rate(x)); setText(n._rest, ` · ${t.flows} ${words.flow(t.flows)}`); }
    else { n._rate._v = undefined; setText(n._rate, ""); setText(n._rest, list.length ? "Нет трафика" : ""); }
    setClass(n, "empty", !list.length);
    setText(n._drop.querySelector(".dz-text"), list.length ? "Добавить" : id === "block" ? "Перетащите сюда, чтобы запретить сеть" : id === "direct" ? "Перетащите сюда, чтобы идти без прокси" : "Перетащите приложение сюда");
  }

  function cardLive(n, u, v, cfg, sh) {
    const st = M.status(v, cfg, u);
    for (const tone of ["off", "error", "held", "live", "block"]) setClass(n, "t-" + tone, st.tone === tone);
    setClass(n, "sel", selected.has(u.id));
    const on = u.enabled;
    setClass(n._sw, "on", on);
    setAttr(n._sw, "aria-checked", String(on));
    setAttr(n._sw, "aria-label", on ? "Выключить правило" : "Включить правило");
    setAttr(n._sw, "title", on ? "Выключить" : "Включить");
    if (st.tone === "live") {
      ticker.set(n._rate, st.down, (x) => "↓ " + rate(x));
      setText(n._rest, "");
    } else {
      n._rate._v = undefined;
      setText(n._rate, "");
      setText(n._rest, st.text || "");
    }
    setAttr(n._sub, "title", st.error ? (st.held ? "Kill switch держит программу без сети, пока прокси не ответит.\n" : "") + st.error : (st.tone === "live" ? `${st.flows} ${words.flow(st.flows)} · ↓ ${rate(st.down)} · ↑ ${rate(st.up)}` : st.text || null));
    const w = st.tone === "live" ? Math.min(1, Math.log10(Math.max(1, st.down + st.up)) / METER_MAX) : 0;
    const tf = `scaleX(${w.toFixed(3)})`;
    if (n._meter._tf !== tf) { n._meter._tf = tf; n._meter.style.transform = tf; }
    let label;
    if (u.kind === "group") {
      setHTML(n._flags, `<span class="count" title="${u.members.length} ${words.app(u.members.length)}">${u.members.length}</span>`);
      label = `Группа ${u.group.name}, ${u.members.length} ${words.app(u.members.length)}`;
      for (const row of n._members.children) {
        const j = M.ruleIndex(cfg, row.dataset.key);
        if (j < 0) continue;
        const r = cfg.rules[j];
        const ms = M.status(v, cfg, { kind: "rule", rule: r, enabled: M.isOn(r.enabled) });
        const ron = M.isOn(r.enabled);
        setClass(row, "off", !ron);
        setClass(row._sw, "on", ron);
        setAttr(row._sw, "aria-checked", String(ron));
        setAttr(row._sw, "aria-label", (ron ? "Выключить " : "Включить ") + appLabel(r.process));
        setText(row._sub, ms.tone === "live" ? "↓ " + rate(ms.down) : ms.tone === "error" ? "ошибка" : "");
        setClass(row, "err", ms.tone === "error");
      }
    } else {
      const r = u.rule;
      const ks = M.ruleKS(cfg, r);
      const shadow = sh.get(u.id);
      setHTML(n._flags,
        (r.children !== false ? `<span title="Дочерние процессы идут по этому же правилу">${icon("branch", 12)}</span>` : "") +
        (ks && u.lane.startsWith("p:") ? `<span title="Kill switch: без прокси — без сети">${icon("shieldLock", 12)}</span>` : "") +
        (r.tcpOnly ? `<span title="Только TCP: UDP и QUIC отбрасываются">${icon("tcp", 12)}</span>` : "") +
        (shadow ? `<span class="warn" title="Не срабатывает: раньше стоит правило «${esc(shadow)}», которое ловит ту же программу">${icon("warn", 12)}</span>` : ""));
      label = appLabel(r.process);
    }
    setAttr(n, "aria-label", `${label}, ${routePhrase(u.lane)}, ${st.tone === "live" ? "↓ " + rate(st.down) : st.text || ""}`);
  }

  // ---------- onboarding ----------

  function showWelcome() {
    if (view === "welcome") return;
    view = "welcome";
    sig = "";
    pool.clear();
    laneNodes.clear();
    wrap = null;
    coach = null;
    root.innerHTML = `<div class="welcome" role="region" aria-label="Первый запуск">
      <div class="welcome-card">
        <div class="welcome-art" aria-hidden="true">
          <div class="wa-lane"><i class="wa-bar a"></i><span class="wa-card"></span><span class="wa-card"></span></div>
          <div class="wa-lane"><i class="wa-bar b"></i><span class="wa-card"></span></div>
          <div class="wa-lane"><i class="wa-bar c"></i></div>
          <span class="wa-fly"></span>
        </div>
        <h1>Направьте нужные приложения через прокси</h1>
        <p class="welcome-lead">Ashgate перехватывает трафик только выбранных программ. Остальные работают как обычно — без настроек прокси в самих программах.</p>
        <ol class="steps">
          <li class="now"><b>1</b><span><strong>Подключите прокси</strong><small>ссылка vless:// или SOCKS5 / HTTP</small></span></li>
          <li><b>2</b><span><strong>Перетащите приложения</strong><small>на полосу прокси</small></span></li>
          <li><b>3</b><span><strong>Включите Ashgate</strong><small>одним переключателем</small></span></li>
        </ol>
        <div class="welcome-actions">
          <button class="btn accent lg" type="button" data-act="paste-link">${icon("paste", 16)}Вставить ссылку vless://</button>
          <button class="btn lg" type="button" data-act="add-proxy">${icon("server", 16)}SOCKS5 или HTTP</button>
        </div>
        <p class="welcome-hint"><kbd>Ctrl</kbd> + <kbd>V</kbd> в любом месте окна вставит ссылку из буфера обмена</p>
      </div>
    </div>`;
  }

  function renderCoach(v) {
    if (!coach) return;
    const ob = M.onboarding(v);
    const done = storeGet(COACH_KEY) === "1";
    const target = (v.config.proxies || [])[0];
    for (const [id, n] of laneNodes) setClass(n, "coach-target", !done && ob.step === "app" && target && id === "p:" + target.name);
    if (ob.step === "done") {
      // Reaching the end once is enough: later "Off" must not bring hints back.
      if (!done) {
        storeSet(COACH_KEY, "1");
        if (coachShown) actions.notify("Готово! Выбранные приложения идут через прокси.", "success");
      }
      coach.hidden = true;
      document.body.classList.remove("coach-start");
      return;
    }
    if (done || ob.step === "proxy") { coach.hidden = true; document.body.classList.remove("coach-start"); return; }
    coachShown = true;
    const n = ob.step === "app" ? 2 : 3;
    const html = ob.step === "app"
      ? `<div class="coach-txt"><strong>Шаг 2 из 3 · Выберите приложения</strong><span>Перетащите программу из нижней панели на полосу «${esc(target ? target.name : "")}» — или добавьте её по названию.</span></div><div class="coach-act"><button class="btn accent" type="button" data-act="add-app">${icon("add", 16)}Добавить приложение</button></div>`
      : `<div class="coach-txt"><strong>Шаг 3 из 3 · Включите Ashgate</strong><span>Пока Ashgate выключен, все программы ходят в сеть напрямую.</span></div><div class="coach-act"><button class="btn accent" type="button" data-act="power-on">${icon("power", 16)}Включить</button></div>`;
    setHTML(coach, `<div class="coach-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i < n ? "done" : i === n ? "now" : ""}"></i>`).join("")}</div>${html}<button class="iconbtn sm coach-x" type="button" data-act="coach-dismiss" aria-label="Скрыть подсказки" title="Скрыть подсказки">${icon("close", 12)}</button>`);
    document.body.classList.toggle("coach-start", ob.step === "start");
    if (coach.hidden) {
      coach.hidden = false;
      if (coach.animate) coach.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: "cubic-bezier(0,0,0,1)" });
    }
  }

  // ---------- focus and selection ----------

  function cardIds() {
    const out = [];
    for (const n of laneNodes.values()) for (const c of n._list.children) if (c.dataset.key && c.classList.contains("card")) out.push(c.dataset.key);
    return out;
  }

  function ensureTabStop() {
    const ids = cardIds();
    const keep = focusId && ids.includes(focusId) ? focusId : ids[0];
    for (const [k, c] of pool) c.tabIndex = k === keep ? 0 : -1;
  }

  function focusCard(id, opts) {
    const n = pool.get(id);
    if (!n) return;
    focusId = id;
    ensureTabStop();
    n.focus({ preventScroll: false });
    if (opts && opts.scroll !== false) n.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function select(id, additive) {
    if (!additive) selected.clear();
    if (additive && selected.has(id)) selected.delete(id);
    else selected.add(id);
    actions.selectionChanged([...selected]);
    live(store.view);
  }

  function clearSelection() {
    if (!selected.size) return;
    selected.clear();
    actions.selectionChanged([]);
    if (store.view) live(store.view);
  }

  // ---------- events ----------

  function cardOf(t) {
    const member = t.closest("[data-member]");
    if (member) return { id: member.dataset.key, node: member, member: true };
    const c = t.closest(".card");
    return c ? { id: c.dataset.key, node: c, member: false } : null;
  }

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    const lane = e.target.closest("[data-lane]");
    const laneId = lane ? lane.dataset.lane : "";
    const c = cardOf(e.target);
    if (act) {
      const a = act.dataset.act;
      if (a === "toggle" && c) return actions.toggle(c.id);
      if (a === "card-menu" && c) return actions.cardMenu(act, c.id);
      if (a === "collapse" && c) return actions.collapse(c.id);
      if (a === "lane-test") return actions.probe(laneId.slice(2));
      if (a === "lane-menu") return actions.laneMenu(act, laneId);
      if (a === "drop-add") return actions.openAddApp(laneId);
      if (a === "add-proxy") return actions.openProxyEditor();
      if (a === "paste-link") return actions.pasteLink(false);
      if (a === "add-app") return actions.openAddApp();
      if (a === "power-on") return actions.setMode("on");
      if (a === "coach-dismiss") { storeSet(COACH_KEY, "1"); if (coach) coach.hidden = true; document.body.classList.remove("coach-start"); render(); return; }
      return;
    }
    if (c && !c.member) {
      focusId = c.id;
      ensureTabStop();
      if (e.ctrlKey || e.metaKey || e.shiftKey) select(c.id, true);
      else if (selected.size) clearSelection();
    } else if (!c && selected.size && !e.target.closest(".lane-head")) clearSelection();
  });

  root.addEventListener("contextmenu", (e) => {
    const c = cardOf(e.target);
    if (!c) return;
    e.preventDefault();
    actions.cardMenu(null, c.id, { x: e.clientX, y: e.clientY });
  });

  root.addEventListener("focusin", (e) => {
    const c = e.target.closest && e.target.closest(".card");
    if (c && c.dataset.key && e.target === c) { focusId = c.dataset.key; ensureTabStop(); }
  });

  root.addEventListener("keydown", (e) => {
    const c = e.target.classList && e.target.classList.contains("card") ? e.target.dataset.key : "";
    if (!c) return;
    const laneEl = e.target.closest("[data-lane]");
    const laneIds = [...laneNodes.keys()];
    const inLane = [...laneEl._list.children].filter((x) => x.classList.contains("card")).map((x) => x.dataset.key);
    const at = inLane.indexOf(c);
    const k = e.key;
    if (/^[1-9]$/.test(k) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const to = laneIds[Number(k) - 1];
      if (to && to !== laneEl.dataset.lane) { e.preventDefault(); actions.moveCard(c, to, null, { focus: true }); }
      return;
    }
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); actions.shift(c, k === "ArrowUp" ? -1 : 1); return; }
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      const next = inLane[at + (k === "ArrowDown" ? 1 : -1)];
      if (next) focusCard(next);
      return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      let li = laneIds.indexOf(laneEl.dataset.lane);
      for (;;) {
        li += k === "ArrowRight" ? 1 : -1;
        if (li < 0 || li >= laneIds.length) return;
        const cards = [...laneNodes.get(laneIds[li])._list.children].filter((x) => x.classList.contains("card"));
        if (cards.length) { focusCard(cards[Math.min(at, cards.length - 1)].dataset.key); return; }
      }
    }
    if (k === " " || k === "Spacebar") { e.preventDefault(); actions.toggle(c); return; }
    if (k === "Delete") { e.preventDefault(); actions.remove(c); return; }
    if (k === "Enter" || k === "F10" || k === "ContextMenu") { e.preventDefault(); actions.cardMenu(e.target.querySelector(".card-more"), c); return; }
    if (k === "Escape" && selected.size) { e.preventDefault(); clearSelection(); }
  });

  return {
    root,
    render,
    focusCard,
    clearSelection,
    get selected() { return [...selected]; },
    get deferred() { return deferred; },
    card: (id) => pool.get(id),
    lane: (id) => laneNodes.get(id),
    laneIds: () => [...laneNodes.keys()],
  };
}
