// The store owns all application state and every side effect: polling the
// backend, optimistic config edits, a serialized save queue and undo.
// Views read store.view and call store methods; they never fetch.

import * as M from "./model.js";

const UNDO_MAX = 30;

export function createStore(backend) {
  let server = null; // last snapshot from the backend
  let cfg = null; // working config; runs ahead of the server while saves are pending
  let view = null; // server snapshot with the working config and kept events
  let events = [];
  let gen = 0;
  let pending = 0;
  let chain = Promise.resolve();
  let lastSent = "";
  let lastErr = "";
  let seq = 0;
  let shown = 0;
  let eventsWanted = false;
  let eventsFresh = false;
  let timer = 0;
  const undoStack = [];
  const listeners = new Set();
  const noticeListeners = new Set();
  const local = { probing: new Set(), processes: [], installed: null };

  // Renders are batched into one animation frame however many changes land.
  let frame = 0;
  let reasons = new Set();
  function emit(reason) {
    reasons.add(reason);
    if (frame) return;
    const run = () => {
      frame = 0;
      const r = reasons;
      reasons = new Set();
      for (const fn of listeners) fn(r);
    };
    frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : setTimeout(run, 16);
  }
  function notice(kind, text, extra) {
    if (!text) return;
    for (const fn of noticeListeners) fn(Object.assign({ kind, text }, extra || {}));
  }
  function rebuild() {
    if (!server) return;
    view = Object.assign({}, server, { config: cfg, events });
  }

  async function refresh() {
    const s = ++seq;
    const withEvents = eventsWanted;
    let next;
    try {
      next = await backend.state(withEvents && eventsFresh ? gen : 0, withEvents);
    } catch (e) {
      return; // keep the last frame; the next poll retries
    }
    if (s < shown) return; // an older answer must not replace a newer one
    shown = s;
    if (withEvents && !next.eventsSame) {
      events = next.events || [];
      gen = next.generation || 0;
      eventsFresh = true;
      emit("events");
    }
    const err = next.error || "";
    server = next;
    if (pending === 0) cfg = next.config;
    rebuild();
    emit("state");
    if (next.notice) notice("info", next.notice);
    if (err && err !== lastErr) notice("error", err);
    lastErr = err;
  }

  function schedule() {
    clearTimeout(timer);
    let wait = 1000;
    if ((typeof document !== "undefined" && document.hidden) || (server && server.hidden)) wait = 3000;
    else if (eventsWanted) wait = 250;
    timer = setTimeout(async () => { await refresh(); schedule(); }, wait);
  }

  function save(opts) {
    opts = opts || {};
    pending++;
    const p = chain.then(async () => {
      const body = JSON.stringify(cfg);
      // Several quick edits collapse: a queued save sends the newest config once.
      if (body === lastSent && opts.autostart === undefined) return;
      await backend.saveConfig(JSON.parse(body), opts.autostart);
      lastSent = body;
    }).catch((err) => {
      if (server) cfg = server.config;
      lastSent = "";
      rebuild();
      emit("config");
      throw err;
    }).finally(() => {
      pending--;
      if (pending === 0) refresh();
    });
    chain = p.catch(() => {});
    return p;
  }

  // edit applies fn to the working config at once (the UI never waits for
  // the disk) and queues a save. fn must return a new config, see model.js.
  function edit(fn, opts) {
    opts = opts || {};
    const prev = cfg;
    const next = fn(cfg);
    if (!next || next === prev) return Promise.resolve(false);
    if (opts.undo !== false) {
      undoStack.push({ cfg: prev, label: opts.label || "" });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    }
    cfg = next;
    rebuild();
    emit("config");
    return save(opts).then(() => true);
  }

  function undo() {
    const last = undoStack.pop();
    if (!last) return null;
    edit(() => last.cfg, { undo: false }).catch((e) => notice("error", e.message));
    return last.label;
  }

  async function setMode(mode) {
    if (!view) return;
    if (mode === "off") {
      if (view.running) await backend.stop();
    } else {
      const strict = mode === "strict";
      if (!!cfg.killSwitch !== strict) {
        await edit((c) => Object.assign(M.clone(c), { killSwitch: strict }), { undo: false });
      }
      if (!view.running) await backend.start();
    }
    await refresh();
  }

  async function probe(name) {
    local.probing.add(name);
    emit("probe");
    try {
      const rep = await backend.probe(name);
      if (server) { server.checks = Object.assign({}, server.checks, { [name]: rep }); rebuild(); }
      return rep;
    } finally {
      local.probing.delete(name);
      emit("probe");
    }
  }

  async function probeAll() {
    const names = (cfg.proxies || []).map((p) => p.name);
    if (!names.length) return;
    names.forEach((n) => local.probing.add(n));
    emit("probe");
    try {
      const checks = await backend.probeAll();
      if (server && checks) { server.checks = checks; rebuild(); }
    } finally {
      names.forEach((n) => local.probing.delete(n));
      emit("probe");
    }
  }

  async function loadProcesses() {
    try {
      const list = await backend.processes();
      local.processes = Array.isArray(list) ? list : [];
      emit("processes");
    } catch (e) { /* the dock keeps its last list */ }
    return local.processes;
  }

  async function loadInstalled() {
    if (local.installed) return local.installed;
    try {
      const list = await backend.installed();
      local.installed = Array.isArray(list) ? list : [];
    } catch (e) {
      local.installed = [];
    }
    emit("processes");
    return local.installed;
  }

  return {
    backend,
    get view() { return view; },
    get cfg() { return cfg; },
    get local() { return local; },
    get saving() { return pending > 0; },
    get canUndo() { return undoStack.length > 0; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onNotice(fn) { noticeListeners.add(fn); return () => noticeListeners.delete(fn); },
    notice,
    emit,
    refresh,
    edit,
    undo,
    setMode,
    probe,
    probeAll,
    loadProcesses,
    loadInstalled,
    // wantEvents switches the 250 ms connection-log polling on and off.
    wantEvents(on) {
      if (eventsWanted === !!on) return;
      eventsWanted = !!on;
      if (on) { eventsFresh = false; refresh(); }
      schedule();
    },
    async start() {
      await refresh();
      schedule();
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); schedule(); } });
      }
    },
    async power(on) {
      await (on ? backend.start() : backend.stop());
      await refresh();
    },
    async clearLog() {
      await backend.clearLog();
      events = [];
      eventsFresh = false;
      rebuild();
      emit("events");
      await refresh();
    },
  };
}
