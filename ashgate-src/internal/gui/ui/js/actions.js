// Actions: what the user can do, in one place. Views call these; these call
// the store (data) and the overlays (menus, dialogs, toasts). No markup of
// the board lives here.

import * as M from "./model.js";
import { appLabel, unquote, words } from "./format.js";
import { openMenu, toast, openDialog } from "./overlay.js";
import { laneName, routePhrase, proxyEndpoint } from "./views/common.js";
import { addAppDialog, proxyDialog, groupNameDialog, pathDialog, confirmDialog, alertDialog } from "./views/dialogs.js";
import { openProxiesSheet, openLogSheet, openSettingsSheet } from "./views/sheets.js";

export function createActions(ctx) {
  const { store } = ctx;
  const cfg = () => store.cfg;

  const unitName = (id) => {
    if (id.startsWith("g:")) return "Группа «" + id.slice(2) + "»";
    const i = M.ruleIndex(cfg(), id);
    return i >= 0 ? appLabel(cfg().rules[i].process) : id;
  };

  function fail(e) {
    if (e && e.message) toast(e.message, { kind: "error" });
  }

  // change runs a config edit and offers Undo for it.
  function change(fn, label, opts) {
    opts = opts || {};
    const p = store.edit(fn, { label });
    p.then((changed) => {
      if (!changed || opts.quiet) return;
      toast(label, { action: { label: "Отменить", icon: "undo", run: undo }, key: "change" });
    }).catch(fail);
    return p;
  }

  function undo() {
    const label = store.undo();
    if (label) toast("Отменено: " + label, { key: "change" });
  }

  function focusLater(id) {
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.board.focusCard(id, { scroll: true })));
  }

  const a = {
    undo,
    notify(text, kind) { toast(text, { kind: kind || "info" }); },

    moveCard(id, to, beforeId, opts) {
      const from = M.units(cfg()).find((u) => u.id === id);
      const sameLane = from && from.lane === to;
      const label = sameLane ? `${unitName(id)}: порядок изменён` : `${unitName(id)} — ${routePhrase(to)}`;
      change((c) => M.moveUnit(c, id, to, beforeId), label, { quiet: sameLane });
      if (opts && opts.focus) focusLater(id);
    },

    shift(id, delta) {
      store.edit((c) => M.shiftUnit(c, id, delta), { label: unitName(id) + ": порядок изменён" }).catch(fail);
      focusLater(id);
    },

    addApp(path, laneId, beforeId, opts) {
      const process = unquote(path);
      if (!process) return;
      let id = "";
      let status = "";
      const label = `${appLabel(process)} — ${routePhrase(laneId)}`;
      store.edit((c) => {
        const r = M.addRule(c, Object.assign({ process }, opts || {}), laneId);
        id = r.id;
        status = r.status;
        return beforeId !== undefined ? M.moveUnit(r.cfg, r.id, laneId, beforeId) : r.cfg;
      }, { label }).then((ok) => {
        if (!ok) { toast(`${appLabel(process)} уже на этой полосе`, { key: "change" }); return; }
        toast(status === "added" ? `Добавлено: ${label}` : label, { action: { label: "Отменить", icon: "undo", run: undo }, key: "change" });
        focusLater(id);
      }).catch(fail);
    },

    toggle(id) {
      let on = true;
      if (id.startsWith("g:")) { const g = M.groupOf(cfg(), id.slice(2)); on = !(g && M.isOn(g.enabled)); }
      else { const i = M.ruleIndex(cfg(), id); on = !(i >= 0 && M.isOn(cfg().rules[i].enabled)); }
      store.edit((c) => M.setEnabled(c, id, on), { label: `${unitName(id)} ${on ? "включено" : "выключено"}` }).catch(fail);
    },

    remove(id) {
      if (id.startsWith("g:")) {
        const n = (M.units(cfg()).find((u) => u.id === id) || { members: [] }).members.length;
        confirmDialog({ title: "Удалить группу?", text: `Группа «${id.slice(2)}» и ${n} ${words.app(n)} в ней исчезнут с полос. Это можно отменить сразу после удаления.`, ok: "Удалить", danger: true, run: () => change((c) => M.removeUnit(c, id), `Удалено: ${unitName(id)}`) });
        return;
      }
      change((c) => M.removeUnit(c, id), `Удалено: ${unitName(id)}`);
    },

    setOptions(id, opts, label) {
      change((c) => M.setRuleOptions(c, id, opts), label || unitName(id) + ": параметры изменены");
    },

    collapse(id) {
      const g = M.groupOf(cfg(), id.slice(2));
      if (g) store.edit((c) => M.setGroupCollapsed(c, g.name, !g.collapsed), { undo: false }).catch(fail);
    },

    async setMode(mode) {
      try {
        await store.setMode(mode);
      } catch (e) {
        if (mode !== "off") showStartError(e.message);
        else fail(e);
      }
    },

    probe(name) {
      store.probe(name).then((rep) => {
        if (rep && !rep.ok) toast(`${name}: ${rep.detail || "нет ответа"}`, { kind: "error", key: "probe-" + name });
      }).catch(fail);
    },

    openAddApp(laneId, preset) { addAppDialog(ctx, laneId, preset); },
    openProxyEditor(name, preset) { proxyDialog(ctx, name, preset); },

    async pasteLink(silent) {
      let text = "";
      try { text = (await navigator.clipboard.readText()).trim(); } catch (e) {
        if (!silent) a.openProxyEditor(null, { type: "vless" });
        return;
      }
      if (!/^vless:\/\//i.test(text)) {
        if (!silent) { toast("В буфере обмена нет ссылки vless:// — вставьте её в поле", { kind: "info" }); a.openProxyEditor(null, { type: "vless" }); }
        return;
      }
      a.openProxyEditor(null, { type: "vless", link: text });
    },

    openSheet(kind) {
      if (kind === "proxies") openProxiesSheet(ctx);
      else if (kind === "log") openLogSheet(ctx);
      else if (kind === "settings") openSettingsSheet(ctx);
    },

    // ---------- menus ----------

    cardMenu(anchor, id, at) {
      const c = cfg();
      const isGroup = id.startsWith("g:");
      const unit = M.units(c).find((u) => u.id === id);
      const i = isGroup ? -1 : M.ruleIndex(c, id);
      const r = i >= 0 ? c.rules[i] : null;
      const member = !!(r && r.group);
      const lane = unit ? unit.lane : r ? M.laneOf(M.effective(c, r).action, M.effective(c, r).proxy) : "";
      const ls = M.lanes(c);
      const items = [{ header: isGroup ? id.slice(2) : appLabel(r.process) }];
      if (!member) {
        ls.forEach((l, k) => items.push({ label: laneName(l.id), check: l.id === lane, hint: k < 9 ? String(k + 1) : "", disabled: l.id === lane, run: () => a.moveCard(id, l.id, null, { focus: true }) }));
        items.push({ sep: true });
      }
      if (r) {
        const ksDefault = r.killSwitch === undefined || r.killSwitch === null;
        items.push(
          { label: "Дочерние процессы", sub: "Помощники и игры из лаунчера идут так же", check: r.children !== false, run: () => a.setOptions(id, { children: r.children === false }, `${appLabel(r.process)}: дочерние процессы ${r.children === false ? "включены" : "выключены"}`) },
          { label: "Kill switch", sub: ksDefault ? "Как в настройках" : "Своя настройка правила", check: M.ruleKS(c, r), run: () => a.setOptions(id, { killSwitch: !M.ruleKS(c, r) }, `${appLabel(r.process)}: kill switch ${M.ruleKS(c, r) ? "выключен" : "включён"}`) },
          { label: "Только TCP", sub: "UDP и QUIC отбрасываются", check: !!r.tcpOnly, run: () => a.setOptions(id, { tcpOnly: !r.tcpOnly }, `${appLabel(r.process)}: ${r.tcpOnly ? "TCP и UDP" : "только TCP"}`) },
          { sep: true });
      }
      if (!member) {
        items.push({ label: "Выше в полосе", icon: "up", hint: "Alt+↑", run: () => a.shift(id, -1) }, { label: "Ниже в полосе", icon: "down", hint: "Alt+↓", run: () => a.shift(id, 1) });
      }
      if (r) {
        items.push(
          { label: "Изменить путь или маску…", icon: "edit", run: () => pathDialog(ctx, id) },
          { label: "Скопировать путь", icon: "copy", run: () => copy(unquote(r.process)) });
        if (member) items.push({ label: `Исключить из группы «${r.group}»`, icon: "folder", run: () => change((x) => M.removeFromGroup(x, id), `${appLabel(r.process)} вынесено из группы`) });
      }
      if (isGroup) {
        items.push(
          { label: "Переименовать…", icon: "edit", run: () => groupNameDialog(ctx, { rename: id.slice(2) }) },
          { label: "Разгруппировать", icon: "folder", sub: "Приложения станут отдельными карточками", run: () => change((x) => M.ungroup(x, id.slice(2)), `Группа «${id.slice(2)}» разгруппирована`) });
      }
      items.push({ sep: true }, { label: isGroup ? "Удалить группу…" : "Удалить", icon: "trash", danger: true, hint: "Del", run: () => a.remove(id) });
      openMenu(anchor, items, at ? { x: at.x, y: at.y, alignLeft: true } : {});
    },

    laneMenu(anchor, laneId) {
      const name = laneId.slice(2);
      const p = (cfg().proxies || []).find((x) => x.name === name);
      if (!p) return;
      const n = M.proxyUsers(cfg(), name);
      openMenu(anchor, [
        { header: `${name} · ${proxyEndpoint(p)}` },
        { label: "Проверить", icon: "bolt", run: () => a.probe(name) },
        { label: "Изменить…", icon: "edit", run: () => a.openProxyEditor(name) },
        p.socksPort ? { label: `Скопировать 127.0.0.1:${p.socksPort}`, sub: "Локальный SOCKS5 для других программ", icon: "copy", run: () => copy("127.0.0.1:" + p.socksPort) } : null,
        { label: "Добавить приложение сюда…", icon: "add", run: () => a.openAddApp(laneId) },
        { sep: true },
        { label: "Удалить прокси…", icon: "trash", danger: true, run: () => a.deleteProxy(name, n) },
      ]);
    },

    deleteProxy(name, n) {
      const dns = cfg().dns || {};
      if (dns.includeSystemResolver && dns.systemResolverProxy === name) {
        alertDialog("Прокси используется", `«${name}» выбран для системного резолвера. Смените его в настройках, затем удалите прокси.`);
        return;
      }
      confirmDialog({
        title: "Удалить прокси?",
        text: n ? `«${name}» исчезнет. ${n} ${words.app(n)} с этой полосы перейдут в «Блокировать» — без сети, а не напрямую, чтобы не раскрыть ваш адрес.` : `«${name}» исчезнет из списка.`,
        ok: "Удалить", danger: true,
        run: () => change((c) => M.removeProxy(c, name), `Прокси «${name}» удалён`),
      });
    },

    chipMenu(anchor, path) {
      const ls = M.lanes(cfg());
      openMenu(anchor, [
        { header: `Добавить «${appLabel(path)}»` },
        ...ls.map((l, k) => ({ label: laneName(l.id), icon: l.id === "direct" ? "globe" : l.id === "block" ? "block" : "server", hint: k < 9 ? String(k + 1) : "", run: () => a.addApp(path, l.id) })),
        { sep: true },
        { label: "Другие параметры…", icon: "settings", run: () => a.openAddApp(null, { path }) },
      ], { alignLeft: true });
    },

    // ---------- selection ----------

    selectionChanged(ids) { ctx.dock.setSelection(ids); },
    clearSelection() { ctx.board.clearSelection(); },
    groupSelection(ids) { groupNameDialog(ctx, { ids }); },
    moveSelectionMenu(anchor, ids) {
      openMenu(anchor, M.lanes(cfg()).map((l) => ({ label: laneName(l.id), icon: l.id === "direct" ? "globe" : l.id === "block" ? "block" : "server", run: () => {
        change((c) => ids.reduce((x, id) => M.moveUnit(x, id, l.id, null), c), `${ids.length} ${words.app(ids.length)} — ${routePhrase(l.id)}`);
        a.clearSelection();
      } })), { alignLeft: true });
    },
    disableSelection(ids) {
      change((c) => ids.reduce((x, id) => M.setEnabled(x, id, false), c), `Выключено: ${ids.length}`);
      a.clearSelection();
    },
    removeSelection(ids) {
      change((c) => ids.reduce((x, id) => M.removeUnit(x, id), c), `Удалено: ${ids.length}`);
      a.clearSelection();
    },
  };

  function copy(text) {
    const done = () => toast("Скопировано: " + text, { key: "copy" });
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    }
  }
  a.copy = copy;

  // showStartError turns driver error codes into steps the user can take.
  function showStartError(msg) {
    const text = String(msg || "").trim();
    const m = /код\s+(\d+)/.exec(text) || /code\s+(\d+)/i.exec(text);
    const code = m ? Number(m[1]) : 0;
    const help = {
      5: "Нет прав администратора, или перехват уже занят другой программой (вторая копия Ashgate, Proxifier, zapret/winws, GoodbyeDPI). Закройте их и запустите Ashgate от имени администратора.",
      2: "Рядом с ashgate.exe нет WinDivert.dll или WinDivert64.sys. Положите их в ту же папку.",
      577: "Windows отклонила подпись драйвера. Попробуйте вариант WinDivert B или C со страницы релизов.",
      1275: "Драйвер заблокирован политикой Windows или антивирусом. Разрешите WinDivert64.sys или отключите блокировку уязвимых драйверов.",
      654: "Уже загружен несовместимый драйвер WinDivert. Перезагрузите компьютер и запустите Ashgate снова.",
      1753: "Служба базовой фильтрации Windows (Base Filtering Engine) выключена. Включите её и повторите.",
    };
    let body = help[code];
    if (!body && /access is denied/i.test(text)) body = help[5];
    alertDialog("Ashgate не включился", (body ? body + (code ? ` (код ${code})` : "") : text || "Не удалось запустить перехват."));
  }
  a.showStartError = showStartError;
  a.openDialog = openDialog;
  return a;
}
