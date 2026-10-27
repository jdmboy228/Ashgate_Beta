// Business logic of the Lanes UI. Pure functions over the config and the
// state snapshot from /api/state: no DOM, no network, no globals. Every
// mutation returns a new config, so the store can undo by keeping the old one.
//
// Vocabulary
//   lane  – a route: one per proxy ("p:<name>"), plus "direct" and "block".
//   unit  – what sits in a lane: a standalone rule or a whole group.
//   id    – stable key of a unit: "r:<process>" (with "#n" for duplicates)
//           or "g:<group name>". Survives reordering, unlike array indices.

import { appLabel } from "./format.js";

export const isOn = (v) => v !== false;
export const clone = (v) => structuredClone(v);

// ---------- matching: a faithful port of internal/rules ----------

const SHELL = new Set([
  "explorer.exe", "svchost.exe", "services.exe", "wininit.exe", "winlogon.exe", "userinit.exe", "smss.exe",
  "csrss.exe", "lsass.exe", "system", "sihost.exe", "taskhostw.exe", "runtimebroker.exe", "dllhost.exe",
  "wmiprvse.exe", "taskeng.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe", "searchhost.exe",
  "applicationframehost.exe", "ashgate.exe", "textinputhost.exe", "systemsettings.exe", "lockapp.exe",
]);

export function isPath(p) {
  p = String(p ?? "").trim();
  return /[\\/]/.test(p) || (p.length >= 2 && p[1] === ":");
}

export function normPath(p) {
  p = String(p ?? "").trim().replace(/^"+|"+$/g, "").replace(/\//g, "\\").toLowerCase();
  if (p.startsWith("\\??\\")) p = p.slice(4);
  if (p.startsWith("\\\\?\\")) p = p.slice(4);
  return p;
}

export function base(p) {
  p = normPath(p);
  const i = p.lastIndexOf("\\");
  return i >= 0 ? p.slice(i + 1) : p;
}

// glob: '*' is any run of characters ('\' included), '?' one character.
export function glob(pattern, s) {
  let px = 0;
  let sx = 0;
  let star = -1;
  let mark = 0;
  while (sx < s.length) {
    if (px < pattern.length && (pattern[px] === "?" || pattern[px] === s[sx])) { px++; sx++; }
    else if (px < pattern.length && pattern[px] === "*") { star = px; mark = sx; px++; }
    else if (star >= 0) { px = star + 1; mark++; sx = mark; }
    else return false;
  }
  while (px < pattern.length && pattern[px] === "*") px++;
  return px === pattern.length;
}

export function compileRule(r) {
  const raw = String(r.process ?? "").trim().replace(/^"+|"+$/g, "");
  const path = isPath(raw);
  let match = path ? normPath(raw) : base(raw);
  if (!path && match && !match.includes(".") && !match.endsWith("*")) match += ".exe";
  return { path, match, glob: /[*?]/.test(match) };
}

export function ruleMatches(c, proc) {
  const name = base(proc.name || "") || base(proc.path || "");
  const path = normPath(proc.path || "");
  if (c.glob && name === "svchost.exe") return false;
  const want = c.path ? path : name;
  if (!want) return false;
  return c.glob ? glob(c.match, want) : want === c.match;
}

// matchesEverything mirrors the config check that refuses "*" and "*.exe".
export function matchesEverything(process) {
  const p = String(process ?? "").trim().replace(/^"+|"+$/g, "").toLowerCase();
  if (!/[*?]/.test(p)) return false;
  return p.replace(/\*|\?|\.exe|\\|\/|\./g, "") === "";
}

export function validProxyName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(name || ""));
}

// ---------- identity ----------

// ruleKey is the engine's RuleKey: the process field, trimmed and lower-case.
export function ruleKey(process) {
  return String(process ?? "").trim().replace(/^"+|"+$/g, "").toLowerCase();
}

export function ruleIds(cfg) {
  const seen = new Map();
  return (cfg.rules || []).map((r) => {
    const k = ruleKey(r.process);
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return "r:" + k + (n ? "#" + n : "");
  });
}

export function ruleIndex(cfg, id) {
  return ruleIds(cfg).indexOf(id);
}

// ---------- routes and lanes ----------

export function groupOf(cfg, name) {
  return (cfg.groups || []).find((g) => g.name === name) || null;
}

// effective is the route and switch that apply: a grouped rule follows its group.
export function effective(cfg, r) {
  const g = r.group ? groupOf(cfg, r.group) : null;
  return {
    enabled: isOn(r.enabled) && (!g || isOn(g.enabled)),
    action: g ? g.action : r.action,
    proxy: g ? g.proxy || "" : r.proxy || "",
    group: g,
  };
}

export function ruleKS(cfg, r) {
  return r.killSwitch === undefined || r.killSwitch === null ? !!cfg.killSwitch : !!r.killSwitch;
}

export function laneOf(action, proxy) {
  if (action === "proxy") return "p:" + (proxy || "");
  return action === "block" ? "block" : "direct";
}

export function routeOfLane(id) {
  if (id.startsWith("p:")) return { action: "proxy", proxy: id.slice(2) };
  return { action: id === "block" ? "block" : "direct", proxy: "" };
}

export function lanes(cfg) {
  return [
    ...(cfg.proxies || []).map((p) => ({ id: "p:" + p.name, kind: "proxy", proxy: p })),
    { id: "direct", kind: "direct" },
    { id: "block", kind: "block" },
  ];
}

// units lists cards in config order. A group sits where its first rule is.
export function units(cfg) {
  const rules = cfg.rules || [];
  const ids = ruleIds(cfg);
  const out = [];
  const seen = new Set();
  rules.forEach((r, i) => {
    const g = r.group ? groupOf(cfg, r.group) : null;
    if (g) {
      if (seen.has(g.name)) return;
      seen.add(g.name);
      const members = [];
      rules.forEach((x, j) => { if (x.group === g.name) members.push(j); });
      out.push({ id: "g:" + g.name, kind: "group", group: g, members, memberIds: members.map((j) => ids[j]), lane: laneOf(g.action, g.proxy), enabled: isOn(g.enabled) });
    } else {
      out.push({ id: ids[i], kind: "rule", index: i, rule: r, lane: laneOf(r.action, r.proxy), enabled: isOn(r.enabled) });
    }
  });
  return out;
}

// board groups units by lane. Lanes without a proxy behind them (a broken
// config) still appear, so nothing silently disappears from the screen.
export function board(cfg) {
  const map = new Map(lanes(cfg).map((l) => [l.id, []]));
  for (const u of units(cfg)) {
    if (!map.has(u.lane)) map.set(u.lane, []);
    map.get(u.lane).push(u);
  }
  return map;
}

function unitRules(cfg, u) {
  return u.kind === "group" ? u.members.map((j) => cfg.rules[j]) : [cfg.rules[u.index]];
}

function setRoute(r, route) {
  r.action = route.action;
  if (route.proxy) r.proxy = route.proxy;
  else delete r.proxy;
}

// ---------- mutations (each returns a new config) ----------

// moveUnit puts a card into lane `to`, before card `beforeId` or at the lane
// end. The config keeps lane order: the moved rules are placed next to the
// card they were dropped on, so "first match wins" follows what the user sees.
export function moveUnit(cfg, id, to, beforeId) {
  cfg = clone(cfg);
  const list = units(cfg);
  const u = list.find((x) => x.id === id);
  if (!u) return cfg;
  const route = routeOfLane(to);
  const rules = cfg.rules;
  const mine = unitRules(cfg, u);
  if (u.kind === "group") {
    const g = groupOf(cfg, u.group.name);
    g.action = route.action;
    if (route.proxy) g.proxy = route.proxy;
    else delete g.proxy;
  }
  // Grouped rules keep the group's route too, so ungrouping changes nothing.
  mine.forEach((r) => setRoute(r, route));
  const rest = rules.filter((r) => !mine.includes(r));
  let at = -1;
  const before = beforeId && beforeId !== id ? list.find((x) => x.id === beforeId) : null;
  if (before) at = rest.indexOf(unitRules(cfg, before)[0]);
  if (at < 0) {
    const inLane = list.filter((x) => x.lane === to && x.id !== id);
    if (inLane.length) {
      const last = unitRules(cfg, inLane[inLane.length - 1]);
      at = rest.indexOf(last[last.length - 1]) + 1;
    } else {
      at = rules.slice(0, rules.indexOf(mine[0])).filter((r) => !mine.includes(r)).length;
    }
  }
  rest.splice(at, 0, ...mine);
  cfg.rules = rest;
  return cfg;
}

// shiftUnit moves a card one place up or down inside its lane.
export function shiftUnit(cfg, id, delta) {
  const list = units(cfg);
  const u = list.find((x) => x.id === id);
  if (!u) return cfg;
  const lane = list.filter((x) => x.lane === u.lane);
  const at = lane.indexOf(u);
  const to = at + delta;
  if (to < 0 || to >= lane.length) return cfg;
  const before = delta < 0 ? lane[to].id : lane[to + 1] ? lane[to + 1].id : null;
  return moveUnit(cfg, id, u.lane, before);
}

export function setEnabled(cfg, id, on) {
  cfg = clone(cfg);
  if (id.startsWith("g:")) {
    const g = groupOf(cfg, id.slice(2));
    if (g) g.enabled = !!on;
    return cfg;
  }
  const i = ruleIndex(cfg, id);
  if (i >= 0) cfg.rules[i].enabled = !!on;
  return cfg;
}

export function removeUnit(cfg, id) {
  cfg = clone(cfg);
  if (id.startsWith("g:")) {
    const name = id.slice(2);
    cfg.rules = (cfg.rules || []).filter((r) => r.group !== name);
    cfg.groups = (cfg.groups || []).filter((g) => g.name !== name);
    return cfg;
  }
  const i = ruleIndex(cfg, id);
  if (i >= 0) cfg.rules.splice(i, 1);
  return pruneGroups(cfg);
}

// addRule adds a program to a lane. A program that already has a rule is
// moved and switched on instead of duplicated. New rules go first, so a
// specific rule wins over older masks.
export function addRule(cfg, rule, laneId) {
  cfg = clone(cfg);
  cfg.rules = cfg.rules || [];
  const route = laneId ? routeOfLane(laneId) : { action: rule.action || "direct", proxy: rule.proxy || "" };
  const key = ruleKey(rule.process);
  const at = cfg.rules.findIndex((r) => ruleKey(r.process) === key);
  if (at >= 0) {
    const r = cfg.rules[at];
    const was = laneOf(effective(cfg, r).action, effective(cfg, r).proxy);
    const wasOn = isOn(r.enabled);
    r.enabled = true;
    if (r.group && was !== laneOf(route.action, route.proxy)) delete r.group;
    if (!r.group) setRoute(r, route);
    const id = ruleIds(cfg)[at];
    const status = was !== laneOf(route.action, route.proxy) ? "moved" : wasOn ? "exists" : "enabled";
    return { cfg: pruneGroups(cfg), id, status };
  }
  const r = { enabled: true, process: String(rule.process).trim() };
  setRoute(r, route);
  if (rule.children === false) r.children = false;
  if (typeof rule.killSwitch === "boolean") r.killSwitch = rule.killSwitch;
  if (rule.tcpOnly) r.tcpOnly = true;
  cfg.rules.unshift(r);
  return { cfg, id: ruleIds(cfg)[0], status: "added" };
}

export function setRuleOptions(cfg, id, opts) {
  cfg = clone(cfg);
  const i = ruleIndex(cfg, id);
  if (i < 0) return cfg;
  const r = cfg.rules[i];
  if ("children" in opts) { if (opts.children === false) r.children = false; else delete r.children; }
  if ("killSwitch" in opts) { if (typeof opts.killSwitch === "boolean") r.killSwitch = opts.killSwitch; else delete r.killSwitch; }
  if ("tcpOnly" in opts) { if (opts.tcpOnly) r.tcpOnly = true; else delete r.tcpOnly; }
  if ("process" in opts) r.process = String(opts.process).trim();
  return cfg;
}

export function pruneGroups(cfg) {
  const used = new Set((cfg.rules || []).map((r) => r.group).filter(Boolean));
  cfg.groups = (cfg.groups || []).filter((g) => used.has(g.name));
  return cfg;
}

export function validGroupName(cfg, name, old) {
  const n = String(name || "");
  if (!n.trim() || n.trim() !== n || n.length > 64) return "Название: от 1 до 64 символов, без пробелов по краям";
  if (n !== old && groupOf(cfg, n)) return "Группа с таким названием уже есть";
  return "";
}

// groupUnits turns standalone rule cards into one group. The group takes the
// route of the first card and sits where that card stood.
export function groupUnits(cfg, ids, name) {
  cfg = clone(cfg);
  const idx = ruleIds(cfg);
  const picked = ids.map((id) => idx.indexOf(id)).filter((i) => i >= 0 && !cfg.rules[i].group).sort((a, b) => a - b);
  if (!picked.length) return cfg;
  const first = cfg.rules[picked[0]];
  const g = { name, enabled: true, action: first.action, collapsed: false };
  if (first.proxy) g.proxy = first.proxy;
  const moved = picked.map((i) => cfg.rules[i]);
  moved.forEach((r) => { r.group = name; setRoute(r, { action: g.action, proxy: g.proxy || "" }); });
  const rest = cfg.rules.filter((r) => !moved.includes(r));
  const at = cfg.rules.slice(0, picked[0]).filter((r) => !moved.includes(r)).length;
  rest.splice(at, 0, ...moved);
  cfg.rules = rest;
  cfg.groups = [...(cfg.groups || []), g];
  return cfg;
}

export function ungroup(cfg, name) {
  cfg = clone(cfg);
  (cfg.rules || []).forEach((r) => { if (r.group === name) delete r.group; });
  cfg.groups = (cfg.groups || []).filter((g) => g.name !== name);
  return cfg;
}

// removeFromGroup takes one rule out of its group; it lands right after the
// group so the group stays contiguous.
export function removeFromGroup(cfg, id) {
  cfg = clone(cfg);
  const i = ruleIndex(cfg, id);
  if (i < 0 || !cfg.rules[i].group) return cfg;
  const r = cfg.rules[i];
  const name = r.group;
  delete r.group;
  cfg.rules.splice(i, 1);
  let last = -1;
  cfg.rules.forEach((x, j) => { if (x.group === name) last = j; });
  cfg.rules.splice(last + 1, 0, r);
  return pruneGroups(cfg);
}

export function renameGroup(cfg, old, name) {
  cfg = clone(cfg);
  const g = groupOf(cfg, old);
  if (!g) return cfg;
  g.name = name;
  (cfg.rules || []).forEach((r) => { if (r.group === old) r.group = name; });
  return cfg;
}

export function setGroupCollapsed(cfg, name, collapsed) {
  cfg = clone(cfg);
  const g = groupOf(cfg, name);
  if (g) g.collapsed = !!collapsed;
  return cfg;
}

// removeProxy deletes a proxy. Its cards move to Block, never to Direct:
// silently sending them around the proxy would leak the user's address.
export function removeProxy(cfg, name) {
  cfg = clone(cfg);
  cfg.proxies = (cfg.proxies || []).filter((p) => p.name !== name);
  const block = { action: "block", proxy: "" };
  (cfg.rules || []).forEach((r) => { if (r.action === "proxy" && r.proxy === name) setRoute(r, block); });
  (cfg.groups || []).forEach((g) => { if (g.action === "proxy" && g.proxy === name) { g.action = "block"; delete g.proxy; } });
  return cfg;
}

export function renameProxyRefs(cfg, old, name) {
  if (old === name) return cfg;
  (cfg.rules || []).forEach((r) => { if (r.proxy === old) r.proxy = name; });
  (cfg.groups || []).forEach((g) => { if (g.proxy === old) g.proxy = name; });
  if (cfg.dns && cfg.dns.systemResolverProxy === old) cfg.dns.systemResolverProxy = name;
  return cfg;
}

export function proxyUsers(cfg, name) {
  return units(cfg).filter((u) => u.lane === "p:" + name).length;
}

// ---------- reading state ----------

// shadows maps a rule card to the earlier rule that already catches its
// program, so the card can explain why it never applies.
export function shadows(cfg) {
  const out = new Map();
  const rules = cfg.rules || [];
  const ids = ruleIds(cfg);
  const comp = rules.map(compileRule);
  rules.forEach((r, i) => {
    if (!effective(cfg, r).enabled || comp[i].glob) return;
    const c = comp[i];
    const probe = c.path ? { name: base(c.match), path: c.match } : { name: c.match, path: "" };
    for (let j = 0; j < i; j++) {
      if (!effective(cfg, rules[j]).enabled) continue;
      if (comp[j].path && !probe.path) continue;
      if (ruleMatches(comp[j], probe)) { out.set(ids[i], appLabel(rules[j].process)); break; }
    }
  });
  return out;
}

export function mode(state) {
  if (!state || !state.running) return "off";
  return state.config && state.config.killSwitch ? "strict" : "on";
}

export function onboarding(state) {
  const c = (state && state.config) || {};
  const proxy = (c.proxies || []).length > 0;
  const app = (c.rules || []).length > 0;
  const start = !!(state && state.running);
  const step = !proxy ? "proxy" : !app ? "app" : !start ? "start" : "done";
  return { proxy, app, start, step };
}

// health turns a probe report into a badge: good under 300 ms, slow above,
// down when the proxy did not answer.
export function health(check, busy) {
  if (busy) return { kind: "busy", label: "проверка…", detail: "" };
  if (!check) return { kind: "unknown", label: "не проверен", detail: "" };
  if (!check.ok) return { kind: "down", label: "нет ответа", detail: check.detail || "" };
  const ms = check.ms || 0;
  return { kind: ms >= 300 ? "slow" : "good", label: check.label || ms + " мс", detail: check.detail || "", udp: !!check.udp };
}

function statOf(state, r) {
  return ((state && state.ruleStats) || {})[ruleKey(r.process)] || null;
}

// status describes a card: live traffic, idle, held by the kill switch,
// failing, or switched off. Groups add up their members.
export function status(state, cfg, u) {
  const rs = u.kind === "group" ? u.members.map((j) => cfg.rules[j]) : [u.rule];
  const first = rs[0] || {};
  const eff = effective(cfg, first);
  const on = u.kind === "group" ? isOn(u.group.enabled) : eff.enabled;
  if (!on) return { tone: "off", text: "Выключено — идёт напрямую" };
  if (eff.action === "block") return { tone: "block", text: "Трафик отбрасывается" };
  let flows = 0, down = 0, up = 0, total = 0, error = "", held = false;
  for (const r of rs) {
    if (!effective(cfg, r).enabled) continue;
    const st = statOf(state, r);
    if (st) {
      flows += st.flows || 0; down += st.downRate || 0; up += st.upRate || 0; total += (st.up || 0) + (st.down || 0);
      if (st.error && !st.flows) { error = error || st.error; held = held || ruleKS(cfg, r); }
    }
  }
  if (!state.running) {
    // The lane header already says Ashgate is off; the card says what that means.
    if (eff.action === "proxy" && rs.some((r) => ruleKS(cfg, r))) return { tone: "held", text: "Без сети" };
    return { tone: "idle", text: "Идёт напрямую" };
  }
  if (error && !flows) return held ? { tone: "error", text: "Прокси не отвечает", error, held: true } : { tone: "error", text: "Прокси не отвечает", error };
  if (flows) return { tone: "live", flows, down, up, total };
  return { tone: "idle", text: "Нет соединений", total };
}

export function laneTraffic(state, cfg, list) {
  let down = 0, up = 0, flows = 0;
  for (const u of list || []) {
    const s = status(state, cfg, u);
    if (s.tone === "live") { down += s.down; up += s.up; flows += s.flows; }
  }
  return { down, up, flows };
}

// dockApps lists running programs with a window that no rule covers yet:
// the "waiting" dock under the lanes.
export function dockApps(processes, cfg) {
  const comp = (cfg.rules || []).map(compileRule);
  const seen = new Set();
  const out = [];
  for (const a of processes || []) {
    if (!a || !a.window) continue;
    const name = base(a.name || a.path);
    if (!name || SHELL.has(name)) continue;
    const k = normPath(a.path || a.name);
    if (seen.has(k)) continue;
    seen.add(k);
    if (comp.some((c) => ruleMatches(c, { name: a.name, path: a.path }))) continue;
    out.push(a);
  }
  return out;
}

// suggestions ranks running and installed programs for a search query:
// prefix matches first, running programs with a window win ties.
export function suggestions(running, installed, q, limit) {
  q = String(q || "").trim().toLowerCase().replace(/\.exe$/i, "");
  const seen = new Set();
  const out = [];
  const score = (name, path) => {
    if (!q) return 1;
    const n = String(name || "").toLowerCase();
    const exe = base(path || "");
    if (n.startsWith(q) || exe.startsWith(q)) return 3;
    if (n.includes(q) || exe.includes(q)) return 2;
    return normPath(path).includes(q) ? 1 : 0;
  };
  const push = (name, path, src, extra) => {
    const k = normPath(path || name);
    if (!path || seen.has(k)) return;
    const s = score(name, path);
    if (q && !s) return;
    seen.add(k);
    out.push({ name, path, src, title: (extra && extra.title) || "", score: s + (src === "run" && extra && extra.window ? 0.5 : 0) });
  };
  (running || []).forEach((a) => push(String(a.name || "").replace(/\.exe$/i, ""), a.path, "run", a));
  (installed || []).forEach((a) => push(a.name, a.path, "inst"));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit || 8);
}
