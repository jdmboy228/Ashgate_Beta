// Dialogs: add an application, edit a proxy, name a group, edit a path,
// confirm and alert. Each builds its own body and validates before saving.

import * as M from "../model.js";
import { appLabel, esc, unquote, baseName, words } from "../format.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { openDialog, toast } from "../overlay.js";
import { appIcon, laneName, laneColor, routePhrase } from "./common.js";

const GROUP_PRESETS = ["Мессенджеры", "Браузеры", "Игры", "Работа", "Звонки"];

function checkbox(id, label, sub, on) {
  return `<label class="check"><input type="checkbox" id="${id}"${on ? " checked" : ""}><span class="box">${icon("check", 12)}</span><span class="check-text"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></label>`;
}

function lanePicker(cfg, current) {
  return M.lanes(cfg).map((l) => `<button type="button" role="radio" class="lane-pill${l.id === current ? " on" : ""}" aria-checked="${l.id === current}" data-lane-pick="${esc(l.id)}" style="--lane:${laneColor(cfg, l.id)}"><i></i>${esc(laneName(l.id))}</button>`).join("");
}

function processError(process) {
  if (!process) return "Укажите программу: найдите её по названию или введите путь к exe";
  if (/^svchost\.exe$/i.test(baseName(process))) return "svchost.exe несёт трафик всех программ. Для системного DNS есть «Системный резолвер» в настройках";
  if (M.matchesEverything(process)) return "Такая маска совпадает со всеми программами. Укажите имя или часть пути, например *\\Discord\\*.exe";
  return "";
}

// ---------- add application ----------

export function addAppDialog(ctx, laneId, preset) {
  const { store, actions } = ctx;
  const cfg = store.cfg;
  const ls = M.lanes(cfg);
  let lane = laneId || (ls.find((l) => l.kind === "proxy") || ls[0]).id;
  let path = (preset && preset.path) || "";
  let active = -1;
  let items = [];
  const body = el("div", "form add-app");
  body.innerHTML = `
    <label class="field-label" for="aa-q">Программа</label>
    <div class="textbox"><span class="tb-ic">${icon("search", 16)}</span><input id="aa-q" autocomplete="off" spellcheck="false" placeholder="Начните вводить: Telegram, Discord, Steam…" role="combobox" aria-controls="aa-list" aria-autocomplete="list" autofocus></div>
    <div class="suggest" id="aa-list" role="listbox" aria-label="Найденные программы"></div>
    <label class="field-label" for="aa-path">Путь к exe, имя или маска</label>
    <div class="row-field"><div class="textbox"><input id="aa-path" class="mono" autocomplete="off" spellcheck="false" placeholder="Подставится, когда вы выберете программу"></div><button class="btn" type="button" data-act="browse">${icon("folderOpen", 16)}Обзор…</button></div>
    <p class="help">Имя (<code>chrome</code>) — любая копия программы, полный путь — только эта. <code>*</code> — любые символы, например <code>*\\Discord\\app-*\\Discord.exe</code>.</p>
    <div class="field-label" id="aa-lane-l">Полоса</div>
    <div class="lane-picker" role="radiogroup" aria-labelledby="aa-lane-l">${lanePicker(cfg, lane)}</div>
    <details class="expander"><summary>${icon("chevRight", 14)}Дополнительно</summary><div class="exp-body">
      ${checkbox("aa-children", "Дочерние процессы", "Помощники, обновления и игры из лаунчера идут по этому же правилу", true)}
      ${checkbox("aa-ks", "Kill switch", "Если прокси недоступен или Ashgate выключен, программа не выходит в сеть напрямую", !!cfg.killSwitch)}
      ${checkbox("aa-tcp", "Только TCP", "UDP и QUIC отбрасываются; браузеры сами перейдут на TCP", false)}
    </div></details>
    <p class="field-err" role="alert" hidden></p>`;
  const q = body.querySelector("#aa-q");
  const list = body.querySelector("#aa-list");
  const pathIn = body.querySelector("#aa-path");
  const err = body.querySelector(".field-err");
  if (path) { pathIn.value = path; q.value = appLabel(path); }

  function draw() {
    const term = q.value.trim();
    const run = store.local.processes || [];
    if (!term) {
      const waiting = M.dockApps(run, store.cfg);
      items = M.suggestions(waiting, [], "", 6);
    } else items = M.suggestions(run, store.local.installed || [], term, 7);
    if (active >= items.length) active = items.length - 1;
    const cur = pathIn.value.trim().toLowerCase();
    list.innerHTML = items.length
      ? `${term ? "" : `<div class="suggest-cap">Открыты сейчас</div>`}${items.map((c, i) => `<button type="button" role="option" id="aa-o${i}" class="suggest-item${i === active ? " active" : ""}${cur === String(c.path).toLowerCase() ? " picked" : ""}" aria-selected="${i === active}" data-i="${i}">${appIcon(store.backend, c.path, "sm")}<span class="si-text"><span class="si-name">${esc(c.name)}</span><span class="si-sub">${esc(c.title || c.path)}</span></span><span class="si-src">${c.src === "run" ? "запущена" : "установлена"}</span></button>`).join("")}`
      : `<div class="suggest-empty">${term ? (store.local.installed ? "Не нашлось. Введите путь к exe или нажмите «Обзор…»." : "Ищу среди установленных программ…") : "Начните вводить название программы."}</div>`;
    q.setAttribute("aria-activedescendant", active >= 0 ? "aa-o" + active : "");
  }
  function pick(i) {
    const c = items[i];
    if (!c) return;
    pathIn.value = c.path;
    q.value = c.name;
    active = i;
    err.hidden = true;
    draw();
  }
  q.addEventListener("input", () => {
    active = q.value.trim() ? 0 : -1;
    draw();
    // A confident match fills the path, as long as the user did not type one.
    if (items[0] && items[0].score >= 3 && (!pathIn.value || pathIn.dataset.auto === "1")) { pathIn.value = items[0].path; pathIn.dataset.auto = "1"; }
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      draw();
    } else if (e.key === "Enter" && active >= 0 && items[active] && pathIn.value.toLowerCase() !== String(items[active].path).toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      pick(active);
    }
  });
  pathIn.addEventListener("input", () => { pathIn.dataset.auto = ""; err.hidden = true; });
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) pick(Number(b.dataset.i)); });
  list.addEventListener("dblclick", (e) => { if (e.target.closest("[data-i]")) dlg.buttons[0].click(); });
  body.addEventListener("click", (e) => {
    const lp = e.target.closest("[data-lane-pick]");
    if (lp) {
      lane = lp.dataset.lanePick;
      body.querySelectorAll("[data-lane-pick]").forEach((b) => { b.classList.toggle("on", b === lp); b.setAttribute("aria-checked", String(b === lp)); });
      return;
    }
    if (e.target.closest("[data-act='browse']")) {
      store.backend.browse().then((res) => {
        if (res && res.path) { pathIn.value = res.path; if (!q.value.trim()) q.value = appLabel(res.path); pathIn.dataset.auto = ""; draw(); }
      }).catch((x) => { if (x.message && x.message !== "отменено") toast(x.message, { kind: "error" }); });
    }
  });
  const dlg = openDialog({
    title: "Добавить приложение", sub: "Выберите программу и полосу, по которой пойдёт её трафик", icon: "apps", wide: true, body,
    buttons: [
      { label: "Добавить", kind: "primary", run: () => {
        let process = unquote(pathIn.value);
        if (!process && q.value.trim()) {
          process = q.value.trim().replace(/\s+/g, "");
          if (!/\.[A-Za-z0-9]+$/.test(process)) process += ".exe";
        }
        const problem = processError(process);
        if (problem) { err.textContent = problem; err.hidden = false; (pathIn.value ? pathIn : q).focus(); return false; }
        const ks = body.querySelector("#aa-ks").checked;
        actions.addApp(process, lane, undefined, {
          children: body.querySelector("#aa-children").checked ? undefined : false,
          killSwitch: ks === !!store.cfg.killSwitch ? undefined : ks,
          tcpOnly: body.querySelector("#aa-tcp").checked,
        });
      } },
      { label: "Отмена", kind: "secondary" },
    ],
  });
  draw();
  store.loadProcesses().then(draw);
  store.loadInstalled().then(draw);
}

// ---------- proxy editor ----------

const VLESS_FIELDS = [
  ["uuid", "UUID", 2], ["network", "Транспорт", 1, ["tcp", "xhttp", "ws", "grpc", "httpupgrade"]], ["security", "Защита", 1, ["reality", "tls", "none"]],
  ["sni", "SNI", 1], ["fp", "Fingerprint", 1], ["pbk", "Публичный ключ (pbk)", 2], ["sid", "Short ID", 1], ["flow", "Flow", 1],
  ["path", "Path", 1], ["host", "Host", 1], ["serviceName", "serviceName", 1], ["mode", "Режим", 1],
];

export function proxyDialog(ctx, name, preset) {
  const { store } = ctx;
  const cfg = store.cfg;
  const editing = name ? (cfg.proxies || []).find((p) => p.name === name) : null;
  const d = editing ? structuredClone(editing) : { name: "", type: (preset && preset.type) || "vless", address: "" };
  if (preset && preset.link) d.link = preset.link;
  d.vless = d.vless || {};
  let parsedLink = editing ? editing.link || "" : "";
  let parseTimer = 0;
  let showPass = false;
  const body = el("div", "form proxy-form");

  function input(id, label, value, o) {
    o = o || {};
    return `<div class="${o.span ? "span2" : ""}"><label class="field-label" for="${id}">${esc(label)}</label><div class="textbox"><input id="${id}" class="${o.mono ? "mono" : ""}" value="${esc(value || "")}" placeholder="${esc(o.ph || "")}" type="${o.type || "text"}" autocomplete="off" spellcheck="false"${o.focus ? " autofocus" : ""}>${o.eye ? `<button class="iconbtn sm" type="button" data-act="eye" aria-label="Показать пароль">${icon("eye", 14)}</button>` : ""}</div>${o.help ? `<p class="help">${o.help}</p>` : ""}</div>`;
  }

  function fields() {
    const v = d.vless || {};
    if (d.type === "vless") {
      return `<label class="field-label" for="p-link">Ссылка vless://</label>
        <div class="textbox area"><textarea id="p-link" class="mono" rows="3" placeholder="vless://…  — скопируйте из 3x-ui, v2rayN или от провайдера" spellcheck="false"${editing ? "" : " autofocus"}>${esc(d.link || "")}</textarea></div>
        <div class="parse-line" id="p-parse" aria-live="polite"></div>
        ${input("p-name", "Имя полосы", d.name, { ph: "Подставится из ссылки", help: "Латиница, цифры, точка, _ или -" })}
        <details class="expander"><summary>${icon("chevRight", 14)}Параметры подключения</summary><div class="exp-body grid2">
          ${input("p-addr", "Адрес сервера", d.address, { mono: true, span: true, ph: "хост:порт" })}
          ${VLESS_FIELDS.map(([k, label, span, opts]) => opts
            ? `<div><label class="field-label" for="v-${k}">${label}</label><div class="textbox"><select id="v-${k}">${[...new Set([v[k] || opts[0], ...opts])].map((o) => `<option${o === (v[k] || opts[0]) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></div></div>`
            : input("v-" + k, label, v[k], { mono: true, span: span === 2 })).join("")}
        </div></details>
        <details class="expander"${d.socksPort ? " open" : ""}><summary>${icon("chevRight", 14)}Локальный SOCKS5 для других программ</summary><div class="exp-body grid2">
          ${input("p-socks", "Порт на 127.0.0.1", d.socksPort ? String(d.socksPort) : "", { mono: true, ph: "например 10808", help: "Пусто — только для полос Ashgate. Следующий порт — HTTP." })}
          <div></div>
          ${input("p-luser", "Логин", d.localUser, { ph: "необязательно" })}
          ${input("p-lpass", "Пароль", d.localPass, { type: "password", ph: "необязательно" })}
        </div></details>`;
    }
    return `<div class="grid2">
      ${input("p-name", "Имя полосы", d.name, { ph: "например nl1", help: "Латиница, цифры, точка, _ или -", focus: !editing })}
      ${input("p-addr", "Адрес", d.address, { mono: true, ph: d.type === "http" ? "10.0.0.5:3128" : "127.0.0.1:1080", help: "хост:порт" })}
      ${input("p-user", "Логин", d.username, { ph: "необязательно" })}
      ${input("p-pass", "Пароль", d.password, { type: showPass ? "text" : "password", ph: "необязательно", eye: true })}
    </div>${d.type === "http" ? `<p class="help">${icon("info", 14)} HTTP-прокси не передаёт UDP: игры и звонки через него не пойдут, QUIC браузеры заменят на TCP.</p>` : ""}`;
  }

  function read() {
    const val = (id) => { const n = body.querySelector("#" + id); return n ? n.value.trim() : undefined; };
    const set = (k, v) => { if (v !== undefined) d[k] = v; };
    set("name", val("p-name"));
    set("address", val("p-addr"));
    set("link", val("p-link"));
    set("username", val("p-user"));
    const pass = body.querySelector("#p-pass");
    if (pass) d.password = pass.value;
    const socks = val("p-socks");
    if (socks !== undefined) d.socksPort = socks === "" ? 0 : /^\d+$/.test(socks) ? Number(socks) : -1;
    set("localUser", val("p-luser"));
    const lp = body.querySelector("#p-lpass");
    if (lp) d.localPass = lp.value;
    if (d.type === "vless") for (const [k] of VLESS_FIELDS) { const v = val("v-" + k); if (v !== undefined) d.vless[k] = v; }
  }

  function parseStatus(text, kind) {
    const n = body.querySelector("#p-parse");
    if (n) n.innerHTML = text ? `<span class="pl ${kind}">${icon(kind === "ok" ? "check" : kind === "err" ? "error" : "refresh", 14)}${esc(text)}</span>` : "";
  }

  async function parse(force) {
    read();
    const link = (d.link || "").trim();
    if (!link) { parseStatus("", ""); return true; }
    if (!force && link === parsedLink && d.vless && d.vless.uuid) return true;
    parseStatus("Разбираю ссылку…", "busy");
    try {
      const p = await store.backend.parseVLESS(link);
      d.address = p.address || d.address;
      d.vless = p.vless || {};
      if (!d.name && p.name) d.name = p.name;
      parsedLink = link;
      draw();
      const v = d.vless;
      parseStatus(`Разобрано: ${[d.address, (v.network || "").toUpperCase(), (v.security || "").toUpperCase()].filter(Boolean).join(" · ")}`, "ok");
      return true;
    } catch (e) {
      parseStatus(String(e.message || "").replace(/^Не удалось разобрать ссылку VLESS:?\s*/i, "Ссылка не разобрана: ") || "Ссылка не разобрана", "err");
      return false;
    }
  }

  function draw() {
    const keepLink = body.querySelector("#p-link");
    const caret = keepLink && document.activeElement === keepLink ? keepLink.selectionStart : -1;
    body.querySelector(".pf-fields").innerHTML = fields();
    if (caret >= 0) { const n = body.querySelector("#p-link"); n.focus(); n.setSelectionRange(caret, caret); }
  }

  body.innerHTML = `<div class="seg type-seg" role="radiogroup" aria-label="Тип прокси">${[["vless", "VLESS"], ["socks5", "SOCKS5"], ["http", "HTTP"]].map(([v, l]) => `<button type="button" role="radio" data-type="${v}" class="${d.type === v ? "on" : ""}" aria-checked="${d.type === v}">${l}</button>`).join("")}</div>
    <div class="pf-fields"></div>
    <div class="test-line"><button class="btn" type="button" data-act="test">${icon("bolt", 16)}Проверить</button><span class="test-out" aria-live="polite"></span></div>`;
  draw();
  body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-type]");
    if (t && t.dataset.type !== d.type) {
      read();
      d.type = t.dataset.type;
      body.querySelectorAll("[data-type]").forEach((b) => { b.classList.toggle("on", b === t); b.setAttribute("aria-checked", String(b === t)); });
      draw();
      return;
    }
    if (e.target.closest("[data-act='eye']")) { read(); showPass = !showPass; draw(); return; }
    if (e.target.closest("[data-act='test']")) test();
  });
  body.addEventListener("input", (e) => {
    if (e.target.id === "p-link") { clearTimeout(parseTimer); parseTimer = setTimeout(() => parse(false), 450); }
  });

  async function test() {
    read();
    const out = body.querySelector(".test-out");
    if (d.type === "vless" && !(await parse(false))) return;
    out.innerHTML = `<span class="health busy"><i></i>проверка…</span>`;
    try {
      const rep = await store.backend.probe(null, clean(structuredClone(d)));
      const h = M.health(rep);
      out.innerHTML = `<span class="health ${h.kind}"><i></i>${esc(h.label)}</span><span class="test-detail">${esc(rep.ok ? (d.type === "http" ? "только TCP" : rep.udp ? "TCP и UDP" : "TCP; UDP не прошёл") : rep.detail || "")}</span>`;
    } catch (x) {
      out.innerHTML = `<span class="health down"><i></i>${esc(x.message)}</span>`;
    }
  }

  function clean(p) {
    if (p.type === "vless") {
      delete p.username; delete p.password;
      if (!p.socksPort) delete p.socksPort;
      if (!p.localUser) delete p.localUser;
      if (!p.localPass) delete p.localPass;
      if (!p.link) delete p.link;
    } else {
      delete p.link; delete p.vless; delete p.socksPort; delete p.localUser; delete p.localPass;
      if (!p.username) delete p.username;
      if (!p.password) delete p.password;
    }
    return p;
  }

  openDialog({
    title: editing ? `Прокси «${editing.name}»` : "Новый прокси",
    sub: editing ? "Изменения применяются сразу после сохранения" : "Для прокси появится своя полоса — на неё перетаскивают приложения",
    icon: "server", wide: d.type === "vless", body,
    buttons: [
      { label: editing ? "Сохранить" : "Добавить", kind: "primary", run: async () => {
        read();
        if (d.type === "vless") {
          if (!(await parse(false))) return false;
          if (!d.vless.uuid) { parseStatus("Вставьте ссылку vless:// или заполните параметры", "err"); return false; }
          if (d.socksPort < 0 || d.socksPort > 65535) { toast("Локальный порт: число от 1 до 65535 или пусто", { kind: "error" }); return false; }
        }
        if (!M.validProxyName(d.name)) { toast("Имя полосы: латиница, цифры, точка, _ или -, начинается с буквы или цифры", { kind: "error" }); return false; }
        if ((!editing || editing.name !== d.name) && (store.cfg.proxies || []).some((p) => p.name === d.name)) { toast("Прокси с таким именем уже есть", { kind: "error" }); return false; }
        if (!d.address) { toast("Укажите адрес: хост:порт", { kind: "error" }); return false; }
        const p = clean(structuredClone(d));
        await store.edit((c) => {
          const n = M.clone(c);
          n.proxies = n.proxies || [];
          if (editing) {
            const i = n.proxies.findIndex((x) => x.name === editing.name);
            n.proxies[i] = p;
            M.renameProxyRefs(n, editing.name, p.name);
          } else n.proxies.push(p);
          return n;
        }, { label: editing ? `Прокси «${p.name}» изменён` : `Прокси «${p.name}» добавлен` });
        toast(editing ? `Прокси «${p.name}» сохранён` : `Прокси «${p.name}» добавлен — перетащите на его полосу приложения`, { kind: "success" });
        store.probe(p.name).catch(() => {});
      } },
      { label: "Отмена", kind: "secondary" },
    ],
  });
  if (d.type === "vless" && d.link && !parsedLink) parse(true);
}

// ---------- groups, paths, confirm ----------

export function groupNameDialog(ctx, o) {
  const { store } = ctx;
  const rename = o.rename || "";
  const body = el("div", "form");
  body.innerHTML = `<label class="field-label" for="g-name">Название группы</label><div class="textbox"><input id="g-name" value="${esc(rename)}" autocomplete="off" autofocus placeholder="Например: Мессенджеры"></div>
    ${rename ? "" : `<div class="presets">${GROUP_PRESETS.map((p) => `<button type="button" class="chip-btn" data-preset="${esc(p)}">${esc(p)}</button>`).join("")}</div><p class="help">У группы один переключатель и одна полоса на всех. Разгруппировать можно в любой момент.</p>`}`;
  const input = body.querySelector("#g-name");
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-preset]"); if (b) { input.value = b.dataset.preset; input.focus(); } });
  openDialog({
    title: rename ? "Переименовать группу" : `Сгруппировать: ${o.ids.length} ${words.app(o.ids.length)}`,
    icon: "folder", body,
    buttons: [
      { label: rename ? "Сохранить" : "Сгруппировать", kind: "primary", run: () => {
        const name = input.value.trim();
        const problem = M.validGroupName(store.cfg, name, rename);
        if (problem) { toast(problem, { kind: "error" }); return false; }
        if (rename) store.edit((c) => M.renameGroup(c, rename, name), { label: `Группа переименована: «${name}»` }).catch((e) => toast(e.message, { kind: "error" }));
        else {
          store.edit((c) => M.groupUnits(c, o.ids, name), { label: `Группа «${name}» создана` })
            .then(() => toast(`Группа «${name}» создана`, { action: { label: "Отменить", icon: "undo", run: () => ctx.actions.undo() } }))
            .catch((e) => toast(e.message, { kind: "error" }));
          ctx.actions.clearSelection();
        }
      } },
      { label: "Отмена", kind: "secondary" },
    ],
  });
}

export function pathDialog(ctx, id) {
  const { store } = ctx;
  const i = M.ruleIndex(store.cfg, id);
  if (i < 0) return;
  const r = store.cfg.rules[i];
  const body = el("div", "form");
  body.innerHTML = `<label class="field-label" for="pth">Имя файла, путь или маска</label><div class="textbox"><input id="pth" class="mono" value="${esc(unquote(r.process))}" autocomplete="off" spellcheck="false" autofocus></div><p class="help"><code>*</code> — любые символы в пути, например <code>*\\Discord\\app-*\\Discord.exe</code>. Имя без расширения (<code>chrome</code>) значит <code>chrome.exe</code>.</p>`;
  openDialog({
    title: appLabel(r.process), sub: "Какой программе принадлежит карточка", icon: "edit", body,
    buttons: [
      { label: "Сохранить", kind: "primary", run: () => {
        const v = unquote(body.querySelector("#pth").value);
        const problem = processError(v);
        if (problem) { toast(problem, { kind: "error" }); return false; }
        ctx.actions.setOptions(id, { process: v }, `${appLabel(v)}: путь изменён`);
      } },
      { label: "Отмена", kind: "secondary" },
    ],
  });
}

export function confirmDialog(o) {
  const body = el("p", "dlg-text");
  body.textContent = o.text;
  openDialog({ title: o.title, icon: o.danger ? "warn" : "info", tone: o.danger ? "danger" : "", body, alert: true, buttons: [{ label: o.ok || "OK", kind: o.danger ? "danger" : "primary", run: o.run }, { label: "Отмена", kind: "secondary" }] });
}

export function alertDialog(title, text) {
  const body = el("p", "dlg-text");
  body.textContent = text;
  openDialog({ title, icon: "warn", tone: "warn", body, alert: true, buttons: [{ label: "Понятно", kind: "primary" }] });
}

export { routePhrase };
