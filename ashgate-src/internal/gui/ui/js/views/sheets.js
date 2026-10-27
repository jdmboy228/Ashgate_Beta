// Side sheets over the lanes: Proxies, Connections and Settings.

import * as M from "../model.js";
import { appLabel, bytes, buildText, dnsServer, esc, proxyTypeLabel, words } from "../format.js";
import { el, setHTML, setText } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, closeSheet, sheetKind, toast, openMenu } from "../overlay.js";
import { laneColor } from "./common.js";

// ---------- proxies ----------

export function openProxiesSheet(ctx) {
  const { store, actions } = ctx;
  openSheet({
    kind: "proxies", title: "Прокси", icon: "server",
    render(body, tools) {
      tools.innerHTML = `<button class="btn subtle sm" type="button" data-act="probe-all">${icon("bolt", 14)}Проверить все</button><button class="btn accent sm" type="button" data-act="add">${icon("add", 14)}Добавить</button>`;
      tools.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]");
        if (!a) return;
        if (a.dataset.act === "add") actions.openProxyEditor();
        if (a.dataset.act === "probe-all") store.probeAll().catch((x) => toast(x.message, { kind: "error" }));
      });
      body.innerHTML = `<div class="px-list" role="list"></div>
        <div class="callout">${icon("paste", 18)}<div><strong>Есть ссылка vless://?</strong><p>Скопируйте её из 3x-ui, v2rayN или от провайдера и вставьте — поля заполнятся сами.</p></div><button class="btn" type="button" data-act="paste">Вставить</button></div>
        <div class="callout subtle">${icon("info", 18)}<div><strong>VLESS для Dolphin{anty} и других программ</strong><p>Задайте в прокси локальный порт — Ashgate откроет обычный SOCKS5 на 127.0.0.1 (HTTP — на следующем порту). Правило для такой программы не нужно.</p></div></div>`;
      body.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]");
        if (!a) return;
        const name = a.dataset.name;
        if (a.dataset.act === "paste") actions.pasteLink(false);
        if (a.dataset.act === "test") actions.probe(name);
        if (a.dataset.act === "edit") actions.openProxyEditor(name);
        if (a.dataset.act === "more") actions.laneMenu(a, "p:" + name);
      });
      this.update(body);
    },
    update(body) {
      const v = store.view;
      if (!v) return;
      const list = body.querySelector(".px-list");
      const ps = v.config.proxies || [];
      setHTML(list, ps.length ? ps.map((p) => {
        const h = M.health((v.checks || {})[p.name], store.local.probing.has(p.name));
        const n = M.proxyUsers(v.config, p.name);
        const br = (v.bridges || {})[p.name];
        const bridge = p.type === "vless" && p.socksPort ? `<span class="px-bridge ${br && br.up ? "ok" : br && br.error ? "bad" : ""}" title="${esc(br && br.error ? br.error : "Локальный SOCKS5")}">127.0.0.1:${p.socksPort} · ${br && br.up ? "слушает" : br && br.error ? "ошибка" : "не запущен"}</span>` : "";
        return `<div class="px-row" role="listitem" style="--lane:${laneColor(v.config, "p:" + p.name)}"><i class="px-bar"></i>
          <div class="px-main"><div class="px-name"><b>${esc(p.name)}</b><span class="chip">${esc(proxyTypeLabel(p.type))}</span><span class="health ${h.kind}" title="${esc(h.detail || h.label)}"><i></i>${esc(h.label)}</span></div>
          <div class="px-sub"><span class="mono">${esc(p.address)}</span><span>${n ? `${n} ${words.app(n)}` : "пустая полоса"}</span>${bridge}</div></div>
          <button class="iconbtn" type="button" data-act="test" data-name="${esc(p.name)}" title="Проверить" aria-label="Проверить ${esc(p.name)}">${icon("bolt", 16)}</button>
          <button class="iconbtn" type="button" data-act="edit" data-name="${esc(p.name)}" title="Изменить" aria-label="Изменить ${esc(p.name)}">${icon("edit", 16)}</button>
          <button class="iconbtn" type="button" data-act="more" data-name="${esc(p.name)}" title="Ещё" aria-label="Ещё">${icon("more", 16)}</button></div>`;
      }).join("") : `<div class="empty-note">${icon("server", 24)}<strong>Прокси ещё нет</strong><span>Добавьте SOCKS5, HTTP или вставьте ссылку vless://</span></div>`);
    },
  });
}

// ---------- connections ----------

const STATUS = {
  open: ["открыто", "ok"], closed: ["закрыто", "neutral"], direct: ["напрямую", "info"],
  blocked: ["блокировано", "warn"], error: ["ошибка", "bad"],
};

export function openLogSheet(ctx) {
  const { store, actions } = ctx;
  let q = "";
  let proto = "all";
  let errorsOnly = false;
  let frozen = null;
  let open = "";
  const key = (e) => [e.time, e.pid, e.proto, e.dest, e.status, e.error || ""].join("|");
  openSheet({
    kind: "log", title: "Подключения", icon: "pulse", wide: true,
    onClose: () => store.wantEvents(false),
    render(body, tools) {
      store.wantEvents(true);
      tools.innerHTML = `<span class="live-dot" title="Обновляется 4 раза в секунду"><i></i>в реальном времени</span><button class="btn subtle sm" type="button" data-act="pause">${icon("pause", 14)}Пауза</button><button class="btn subtle sm" type="button" data-act="clear">${icon("trash", 14)}Очистить</button>`;
      body.innerHTML = `<div class="log-tools"><div class="textbox sm grow"><span class="tb-ic">${icon("search", 14)}</span><input id="log-q" placeholder="Программа, адрес или прокси" autocomplete="off" spellcheck="false" autofocus></div>
        <div class="seg sm" role="radiogroup" aria-label="Протокол">${[["all", "Все"], ["TCP", "TCP"], ["UDP", "UDP"]].map(([v, l]) => `<button type="button" role="radio" data-proto="${v}" class="${v === "all" ? "on" : ""}" aria-checked="${v === "all"}">${l}</button>`).join("")}</div>
        <label class="check inline"><input type="checkbox" id="log-err"><span class="box">${icon("check", 12)}</span><span class="check-text"><b>Только ошибки</b></span></label></div>
        <div class="pause-bar" hidden></div>
        <div class="log-table" role="table" aria-label="Подключения"></div>
        <p class="help">Журнал также пишется в ashgate.log рядом с конфигурацией. Очистка не трогает файл.</p>`;
      body.querySelector("#log-q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); this.update(body); });
      body.querySelector("#log-err").addEventListener("change", (e) => { errorsOnly = e.target.checked; this.update(body); });
      body.addEventListener("click", (e) => {
        const p = e.target.closest("[data-proto]");
        if (p) { proto = p.dataset.proto; body.querySelectorAll("[data-proto]").forEach((b) => { b.classList.toggle("on", b === p); b.setAttribute("aria-checked", String(b === p)); }); this.update(body); return; }
        const a = e.target.closest("[data-act]");
        if (a && a.dataset.act === "copy") { actions.copy(a.dataset.text); return; }
        if (a && a.dataset.act === "goto") { goto(a.dataset.proc); return; }
        if (a && a.dataset.act === "resume") { frozen = null; syncPause(tools); this.update(body); return; }
        const row = e.target.closest("[data-row]");
        if (row && row.dataset.err === "1") { open = open === row.dataset.row ? "" : row.dataset.row; this.update(body); }
      });
      const self = this;
      tools.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]");
        if (!a) return;
        if (a.dataset.act === "pause") { frozen = frozen ? null : (store.view.events || []).slice(); syncPause(tools); self.update(body); }
        if (a.dataset.act === "clear") store.clearLog().then(() => { frozen = frozen ? [] : null; self.update(body); }).catch((x) => toast(x.message, { kind: "error" }));
      });
      this.update(body);
    },
    update(body) {
      const v = store.view;
      if (!v || !body.querySelector(".log-table")) return;
      const all = v.events || [];
      const src = frozen || all;
      const rows = src.filter((e) => {
        if (errorsOnly && e.status !== "error") return false;
        if (proto !== "all" && e.proto !== proto) return false;
        if (!q) return true;
        return ((e.process || "") + " " + (e.dest || "") + " " + (e.via || "") + " " + (e.parent || "")).toLowerCase().includes(q);
      });
      const bar = body.querySelector(".pause-bar");
      if (frozen) {
        const seen = new Set(frozen.map(key));
        const n = all.filter((e) => !seen.has(key(e))).length;
        bar.hidden = false;
        setHTML(bar, `${icon("pause", 14)}<span>Пауза · ${n} новых не показаны</span><button class="btn subtle sm" type="button" data-act="resume">Показать</button>`);
      } else bar.hidden = true;
      const table = body.querySelector(".log-table");
      if (!rows.length) {
        setHTML(table, `<div class="empty-note">${icon("pulse", 24)}<strong>${all.length ? "Ничего не найдено" : "Соединений пока нет"}</strong><span>${all.length ? "Измените фильтр" : v.running ? "Они появятся, когда приложения с полос выйдут в сеть" : "Включите Ashgate — и соединения появятся здесь"}</span></div>`);
        return;
      }
      setHTML(table, `<div class="lt-head" role="row"><span>Время</span><span>Программа</span><span>Куда</span><span>Через</span><span>Статус</span><span class="r">Трафик</span></div>` + rows.map((e) => {
        const k = key(e);
        const st = STATUS[e.status] || [e.status || "—", "neutral"];
        const via = !e.via || ["direct", "block", "relay"].includes(e.via) ? "—" : e.via;
        const isErr = e.status === "error";
        const main = `<div class="lt-row${isErr ? " err" : ""}${open === k ? " open" : ""}" role="row" data-row="${esc(k)}" data-err="${isErr ? 1 : 0}"><span class="mono dim">${esc(e.time)}</span>
          <span class="lt-proc"><b>${esc(appLabel(e.process))}</b><small class="mono">${e.pid || 0}${e.parent ? " · от " + esc(appLabel(e.parent)) : ""}</small></span>
          <span class="mono lt-dest"><span class="tag${e.proto === "UDP" ? " udp" : ""}">${esc(e.proto || "")}</span>${esc(e.dest || "")}</span>
          <span>${esc(via)}</span><span><span class="badge ${st[1]}"><i></i>${esc(st[0])}</span></span>
          <span class="mono r dim">↑ ${esc(bytes(e.bytesUp))}<br>↓ ${esc(bytes(e.bytesDown))}</span></div>`;
        if (!isErr || open !== k) return main;
        return main + `<div class="lt-err" role="row"><span>${icon("error", 14)}${esc(e.error || "ошибка")}</span><button class="btn sm" type="button" data-act="copy" data-text="${esc(e.error || "")}">${icon("copy", 14)}Копировать</button><button class="btn sm" type="button" data-act="goto" data-proc="${esc(e.process || "")}">${icon("arrowRight", 14)}К карточке</button></div>`;
      }).join(""));
    },
  });

  function syncPause(tools) {
    const b = tools.querySelector("[data-act='pause']");
    b.innerHTML = frozen ? `${icon("play", 14)}Продолжить` : `${icon("pause", 14)}Пауза`;
    tools.querySelector(".live-dot").classList.toggle("paused", !!frozen);
  }

  // goto finds the card whose rule catches this process and focuses it.
  function goto(proc) {
    const cfg = store.cfg;
    const i = (cfg.rules || []).findIndex((r) => M.ruleMatches(M.compileRule(r), { name: proc, path: proc }));
    closeSheet();
    if (i < 0) { toast(`Для ${appLabel(proc)} нет карточки — его трафик шёл через родительское приложение или напрямую`); return; }
    const r = cfg.rules[i];
    const id = r.group ? "g:" + r.group : M.ruleIds(cfg)[i];
    setTimeout(() => ctx.board.focusCard(id), 200);
  }
}

// ---------- settings ----------

export function openSettingsSheet(ctx) {
  const { store } = ctx;
  let timer = 0;
  const save = (fn, extra) => {
    store.edit((c) => { const n = M.clone(c); fn(n); return n; }, Object.assign({ undo: false }, extra || {})).catch((e) => toast(e.message, { kind: "error" }));
  };
  const toggle = (k, on, label) => `<button class="switch${on ? " on" : ""}" type="button" role="switch" data-set="${k}" aria-checked="${on}" aria-label="${esc(label)}"><i></i></button>`;
  const row = (t, d, ctl, warn) => `<div class="set-card"><div class="set-text"><b>${esc(t)}</b><span${warn ? ' class="warn"' : ""}>${esc(d)}</span></div><div class="set-ctl">${ctl}</div></div>`;
  const seg = (k, opts, cur) => `<div class="seg sm" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" data-seg="${k}" data-value="${v}" class="${v === cur ? "on" : ""}" aria-checked="${v === cur}">${l}</button>`).join("")}</div>`;

  function html() {
    const v = store.view;
    const c = v.config;
    const dnsOn = c.dns.mode !== "original";
    const names = (c.proxies || []).map((p) => p.name);
    const sysProxy = c.dns.systemResolverProxy || names[0] || "";
    return `
      <h3 class="set-group">Защита</h3>
      ${row("Kill switch по умолчанию", "Приложения с прокси не выходят в сеть напрямую — даже если прокси упал или Ashgate закрыт. Режим «Строго» включает это сразу. У карточки может быть своя настройка", toggle("kill", !!c.killSwitch, "Kill switch"))}
      <h3 class="set-group">DNS</h3>
      ${row("DNS приложений через прокси", "Запросы к порту 53 выбранных программ идут через прокси их полосы", toggle("dns", dnsOn, "DNS через прокси"))}
      ${row("DNS-серверы", "Через запятую, например 1.1.1.1, 8.8.8.8", `<div class="textbox sm"><input id="dns-servers" class="mono" value="${esc((c.dns.servers || []).join(", "))}"${dnsOn ? "" : " disabled"}></div>`)}
      ${row("Системный резолвер (svchost.exe)", "Влияет на DNS всех программ, не только выбранных", `<div class="textbox sm"><select id="sys-proxy"${c.dns.includeSystemResolver ? "" : " disabled"}>${names.map((n) => `<option${n === sysProxy ? " selected" : ""}>${esc(n)}</option>`).join("") || `<option value="">нет прокси</option>`}</select></div>${toggle("sys", !!c.dns.includeSystemResolver, "Системный резолвер")}`, true)}
      <h3 class="set-group">Сеть</h3>
      ${row("UDP, который прокси не умеет", "Для HTTP-прокси: QUIC, игры, звонки. «Блокировать» не даёт обойти прокси", seg("udp", [["block", "Блокировать"], ["direct", "Напрямую"]], c.udpUnsupported === "direct" ? "direct" : "block"))}
      ${row("Не проксировать частные сети", "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 и fc00::/7 — напрямую", toggle("bypass", !!c.bypassPrivate, "Частные сети напрямую"))}
      <h3 class="set-group">Запуск и журнал</h3>
      ${row("Запускать с Windows", "При входе в систему открывается окно и включается перехват", toggle("auto", !!v.autostart, "Автозапуск"))}
      ${row("Подробный журнал", "Уровень debug вместо info в ashgate.log", toggle("verbose", c.log && c.log.level === "debug", "Подробный журнал"))}
      <h3 class="set-group">Оформление</h3>
      ${row("Тема", "Тёмная или светлая", seg("theme", [["dark", "Тёмная"], ["light", "Светлая"]], v.theme === "light" ? "light" : "dark"))}
      ${row("Подсказки первого запуска", "Показать шаги настройки ещё раз", `<button class="btn sm" type="button" data-act="coach">Показать</button>`)}
      <h3 class="set-group">О программе</h3>
      ${row("Версия", "Коммит должен совпадать с последним в репозитории — иначе пересоберите exe", `<span class="mono">${esc(buildText(v.build || { version: v.version }))}</span><button class="iconbtn sm" type="button" data-act="copy-ver" aria-label="Скопировать версию">${icon("copy", 14)}</button>`)}
      ${row("Конфигурация", v.path || "config.json", `<button class="btn sm" type="button" data-act="folder">${icon("folderOpen", 14)}Открыть папку</button>`)}`;
  }

  openSheet({
    kind: "settings", title: "Настройки", icon: "settings",
    render(body) {
      setHTML(body, html());
      body.addEventListener("click", (e) => {
        const t = e.target.closest("[data-set]");
        if (t) {
          const on = t.getAttribute("aria-checked") !== "true";
          t.setAttribute("aria-checked", String(on));
          t.classList.toggle("on", on);
          const k = t.dataset.set;
          if (k === "kill") save((c) => { c.killSwitch = on; });
          if (k === "dns") { body.querySelector("#dns-servers").disabled = !on; save((c) => { c.dns.mode = on ? "proxy" : "original"; }); }
          if (k === "sys") {
            const sel = body.querySelector("#sys-proxy");
            if (on && !sel.value) {
              toast("Сначала добавьте прокси", { kind: "error" });
              t.setAttribute("aria-checked", "false");
              t.classList.remove("on");
              return;
            }
            sel.disabled = !on;
            save((c) => { c.dns.includeSystemResolver = on; c.dns.systemResolverProxy = on ? sel.value : c.dns.systemResolverProxy; });
          }
          if (k === "bypass") save((c) => { c.bypassPrivate = on; });
          if (k === "verbose") save((c) => { c.log = Object.assign({}, c.log, { level: on ? "debug" : "info" }); });
          if (k === "auto") save(() => {}, { autostart: on });
          return;
        }
        const s = e.target.closest("[data-seg]");
        if (s) {
          s.parentElement.querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b === s); b.setAttribute("aria-checked", String(b === s)); });
          if (s.dataset.seg === "udp") save((c) => { c.udpUnsupported = s.dataset.value; });
          if (s.dataset.seg === "theme") { ctx.applyTheme(s.dataset.value); save((c) => { c.ui = Object.assign({}, c.ui, { theme: s.dataset.value }); }); }
          return;
        }
        const a = e.target.closest("[data-act]");
        if (!a) return;
        if (a.dataset.act === "copy-ver") ctx.actions.copy(buildText(store.view.build || {}));
        if (a.dataset.act === "folder") store.backend.reveal().catch((x) => toast(x.message, { kind: "error" }));
        if (a.dataset.act === "coach") { try { localStorage.removeItem("ashgate.coach.done"); } catch (x) { /* ignore */ } toast("Подсказки появятся над полосами"); ctx.renderAll(true); }
      });
      body.addEventListener("change", (e) => {
        if (e.target.id === "dns-servers") {
          const list = e.target.value.split(/[,\s]+/).map(dnsServer).filter(Boolean);
          e.target.value = list.join(", ");
          clearTimeout(timer);
          timer = setTimeout(() => save((c) => { c.dns.servers = list; }), 50);
        }
        if (e.target.id === "sys-proxy") save((c) => { c.dns.systemResolverProxy = e.target.value; });
      });
    },
  });
}

export { sheetKind, openMenu, setText, el };
