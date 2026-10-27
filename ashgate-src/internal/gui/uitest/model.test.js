// Unit tests for the window's business logic. Run: node --test internal/gui/uitest/
import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../ui/js/model.js";
import { bytes, plural, appLabel, dnsServer, rate } from "../ui/js/format.js";

const cfg = () => ({
  killSwitch: false,
  proxies: [
    { name: "aeza", type: "vless", address: "203.0.113.10:443" },
    { name: "nl1", type: "socks5", address: "198.51.100.7:1080" },
  ],
  groups: [{ name: "Чаты", enabled: true, action: "proxy", proxy: "aeza" }],
  rules: [
    { enabled: true, process: "Telegram.exe", action: "proxy", proxy: "aeza", group: "Чаты" },
    { enabled: true, process: "*\\Discord\\app-*\\Discord.exe", action: "proxy", proxy: "aeza", group: "Чаты" },
    { enabled: true, process: "chrome.exe", action: "proxy", proxy: "nl1" },
    { enabled: true, process: "steam.exe", action: "direct" },
    { enabled: false, process: "spotify.exe", action: "block" },
  ],
});

test("glob mirrors internal/rules", () => {
  assert.ok(m.glob("*\\discord\\app-*\\discord.exe", "c:\\users\\a\\appdata\\local\\discord\\app-1.0.9\\discord.exe"));
  assert.ok(m.glob("a?c", "abc"));
  assert.ok(!m.glob("a?c", "ac"));
  assert.ok(m.glob("*", ""));
  assert.ok(!m.glob("chrome.exe", "chrome.exe.bak"));
});

test("compileRule adds .exe to bare names and keeps masks", () => {
  assert.deepEqual(m.compileRule({ process: "chrome" }), { path: false, match: "chrome.exe", glob: false });
  assert.deepEqual(m.compileRule({ process: "Disc*" }), { path: false, match: "disc*", glob: true });
  assert.equal(m.compileRule({ process: '"C:/Apps/X.exe"' }).match, "c:\\apps\\x.exe");
  const c = m.compileRule({ process: "*.exe" });
  assert.ok(!m.ruleMatches(c, { name: "svchost.exe", path: "c:\\windows\\system32\\svchost.exe" }), "masks never take svchost");
});

test("matchesEverything refuses masks that catch every program", () => {
  assert.ok(m.matchesEverything("*"));
  assert.ok(m.matchesEverything("*.exe"));
  assert.ok(m.matchesEverything("*\\*.exe"));
  assert.ok(!m.matchesEverything("*\\Discord\\*.exe"));
  assert.ok(!m.matchesEverything("chrome.exe"));
});

test("proxy names follow the config rule", () => {
  assert.ok(m.validProxyName("aeza-1.nl"));
  assert.ok(!m.validProxyName("-x"));
  assert.ok(!m.validProxyName("имя"));
  assert.ok(!m.validProxyName(""));
});

test("ids are stable and unique for duplicate processes", () => {
  const c = cfg();
  c.rules.push({ process: "STEAM.exe", action: "direct" });
  const ids = m.ruleIds(c);
  assert.equal(ids[3], "r:steam.exe");
  assert.equal(ids[5], "r:steam.exe#1");
});

test("board puts groups and rules in their lanes, in config order", () => {
  const b = m.board(cfg());
  assert.deepEqual([...b.keys()], ["p:aeza", "p:nl1", "direct", "block"]);
  assert.deepEqual(b.get("p:aeza").map((u) => u.id), ["g:Чаты"]);
  assert.deepEqual(b.get("p:aeza")[0].memberIds, ["r:telegram.exe", "r:*\\discord\\app-*\\discord.exe"]);
  assert.deepEqual(b.get("p:nl1").map((u) => u.id), ["r:chrome.exe"]);
  assert.deepEqual(b.get("block").map((u) => u.id), ["r:spotify.exe"]);
});

test("board keeps cards whose proxy is missing", () => {
  const c = cfg();
  c.rules.push({ process: "x.exe", action: "proxy", proxy: "gone" });
  assert.deepEqual(m.board(c).get("p:gone").map((u) => u.id), ["r:x.exe"]);
});

test("moveUnit changes the route and places the rule next to the drop target", () => {
  const before = cfg();
  const next = m.moveUnit(before, "r:steam.exe", "p:nl1", "r:chrome.exe");
  assert.notEqual(next, before, "returns a new config");
  assert.equal(before.rules[3].action, "direct", "input untouched");
  const steam = next.rules.find((r) => r.process === "steam.exe");
  assert.equal(steam.action, "proxy");
  assert.equal(steam.proxy, "nl1");
  assert.deepEqual(next.rules.map((r) => r.process).slice(2, 4), ["steam.exe", "chrome.exe"]);
});

test("moveUnit to the end of a lane goes after its last card", () => {
  const next = m.moveUnit(cfg(), "r:spotify.exe", "p:nl1", null);
  assert.deepEqual(next.rules.map((r) => r.process).slice(2, 4), ["chrome.exe", "spotify.exe"]);
  assert.equal(next.rules[3].proxy, "nl1");
});

test("moveUnit into an empty lane keeps the rule's place", () => {
  const c = cfg();
  c.rules = c.rules.filter((r) => r.action !== "block");
  const next = m.moveUnit(c, "r:chrome.exe", "block", null);
  assert.deepEqual(next.rules.map((r) => r.process), c.rules.map((r) => r.process));
  assert.equal(next.rules[2].action, "block");
  assert.equal(next.rules[2].proxy, undefined, "block has no proxy");
});

test("moving a group moves every member and the group route", () => {
  const next = m.moveUnit(cfg(), "g:Чаты", "direct", null);
  assert.equal(next.groups[0].action, "direct");
  assert.equal(next.groups[0].proxy, undefined);
  next.rules.filter((r) => r.group === "Чаты").forEach((r) => { assert.equal(r.action, "direct"); assert.equal(r.proxy, undefined); });
  const order = next.rules.map((r) => r.process);
  assert.equal(order.indexOf("Telegram.exe") + 1, order.indexOf("*\\Discord\\app-*\\Discord.exe"), "members stay together");
});

test("shiftUnit reorders inside a lane", () => {
  let c = m.moveUnit(cfg(), "r:steam.exe", "p:nl1", null);
  c = m.shiftUnit(c, "r:steam.exe", -1);
  assert.deepEqual(m.board(c).get("p:nl1").map((u) => u.id), ["r:steam.exe", "r:chrome.exe"]);
  assert.equal(m.shiftUnit(c, "r:steam.exe", -1), c, "no move past the top");
});

test("addRule adds new programs first and reuses existing rules", () => {
  const a = m.addRule(cfg(), { process: "obs64.exe" }, "p:aeza");
  assert.equal(a.status, "added");
  assert.deepEqual(a.cfg.rules[0], { enabled: true, process: "obs64.exe", action: "proxy", proxy: "aeza" });
  const b = m.addRule(cfg(), { process: "SPOTIFY.exe" }, "block");
  assert.equal(b.status, "enabled");
  assert.equal(b.cfg.rules.length, 5);
  const c = m.addRule(cfg(), { process: "chrome.exe" }, "direct");
  assert.equal(c.status, "moved");
  assert.equal(c.cfg.rules[2].action, "direct");
  const d = m.addRule(cfg(), { process: "telegram.exe" }, "direct");
  assert.equal(d.status, "moved");
  assert.equal(d.cfg.rules[0].group, undefined, "leaves its group to change lane");
  const e = m.addRule(cfg(), { process: "x.exe", children: false, killSwitch: true, tcpOnly: true }, "direct");
  assert.deepEqual(e.cfg.rules[0], { enabled: true, process: "x.exe", action: "direct", children: false, killSwitch: true, tcpOnly: true });
});

test("rule options use the config's defaults", () => {
  let c = m.setRuleOptions(cfg(), "r:chrome.exe", { children: false, killSwitch: true, tcpOnly: true });
  assert.deepEqual(c.rules[2], { enabled: true, process: "chrome.exe", action: "proxy", proxy: "nl1", children: false, killSwitch: true, tcpOnly: true });
  c = m.setRuleOptions(c, "r:chrome.exe", { children: true, killSwitch: null, tcpOnly: false });
  assert.deepEqual(c.rules[2], { enabled: true, process: "chrome.exe", action: "proxy", proxy: "nl1" });
});

test("enable, remove, and group operations", () => {
  let c = m.setEnabled(cfg(), "g:Чаты", false);
  assert.equal(c.groups[0].enabled, false);
  assert.equal(m.effective(c, c.rules[0]).enabled, false);
  c = m.removeFromGroup(cfg(), "r:telegram.exe");
  assert.deepEqual(c.rules.map((r) => r.group || ""), ["Чаты", "", "", "", ""]);
  assert.equal(c.rules[1].process, "Telegram.exe");
  c = m.removeFromGroup(c, "r:*\\discord\\app-*\\discord.exe");
  assert.deepEqual(c.groups, [], "empty group is pruned");
  c = m.groupUnits(cfg(), ["r:steam.exe", "r:chrome.exe"], "Игры");
  assert.deepEqual(c.groups[1], { name: "Игры", enabled: true, action: "proxy", proxy: "nl1", collapsed: false });
  assert.equal(c.rules.find((r) => r.process === "steam.exe").proxy, "nl1");
  c = m.renameGroup(c, "Игры", "Games");
  assert.ok(c.rules.filter((r) => r.group === "Games").length === 2);
  c = m.ungroup(c, "Games");
  assert.ok(!c.groups.some((g) => g.name === "Games"));
  c = m.removeUnit(cfg(), "g:Чаты");
  assert.equal(c.rules.length, 3);
  assert.equal(m.validGroupName(cfg(), "Чаты"), "Группа с таким названием уже есть");
  assert.equal(m.validGroupName(cfg(), " x"), "Название: от 1 до 64 символов, без пробелов по краям");
  assert.equal(m.validGroupName(cfg(), "Чаты", "Чаты"), "");
});

test("removing a proxy sends its apps to Block, never Direct", () => {
  const c = m.removeProxy(cfg(), "aeza");
  assert.equal(c.groups[0].action, "block");
  assert.ok(c.rules.slice(0, 2).every((r) => r.action === "block" && !r.proxy));
  assert.equal(m.proxyUsers(cfg(), "nl1"), 1);
  const r = m.renameProxyRefs(cfg(), "nl1", "nl2");
  assert.equal(r.rules[2].proxy, "nl2");
});

test("shadows finds a rule that an earlier one already catches", () => {
  const c = { rules: [
    { process: "*\\Discord\\*.exe", action: "direct" },
    { process: "C:\\Apps\\Discord\\Discord.exe", action: "proxy", proxy: "a" },
    { process: "discord", action: "block" },
    { process: "chrome.exe", action: "direct" },
    { process: "C:\\x\\chrome.exe", action: "block" },
  ] };
  const s = m.shadows(c);
  assert.equal(s.get("r:c:\\apps\\discord\\discord.exe"), "Discord");
  assert.equal(s.has("r:discord"), false, "a path mask cannot see a bare name");
  assert.equal(s.get("r:c:\\x\\chrome.exe"), "chrome");
});

test("mode and onboarding follow the state", () => {
  assert.equal(m.mode({ running: false, config: {} }), "off");
  assert.equal(m.mode({ running: true, config: { killSwitch: false } }), "on");
  assert.equal(m.mode({ running: true, config: { killSwitch: true } }), "strict");
  assert.equal(m.onboarding({ config: { proxies: [], rules: [] } }).step, "proxy");
  assert.equal(m.onboarding({ config: { proxies: [{}], rules: [] } }).step, "app");
  assert.equal(m.onboarding({ config: { proxies: [{}], rules: [{}] } }).step, "start");
  assert.equal(m.onboarding({ running: true, config: { proxies: [{}], rules: [{}] } }).step, "done");
});

test("health badges", () => {
  assert.equal(m.health(null).kind, "unknown");
  assert.equal(m.health({ ok: false, detail: "timeout" }).kind, "down");
  assert.equal(m.health({ ok: true, ms: 42, label: "42 мс" }).kind, "good");
  assert.equal(m.health({ ok: true, ms: 380 }).kind, "slow");
  assert.equal(m.health(null, true).kind, "busy");
});

test("status explains each card", () => {
  const c = cfg();
  const us = m.units(c);
  const chrome = us.find((u) => u.id === "r:chrome.exe");
  const st = { running: true, ruleStats: { "chrome.exe": { flows: 0, error: "SOCKS5: timeout" } } };
  assert.deepEqual(m.status(st, c, chrome), { tone: "error", text: "Прокси не отвечает", error: "SOCKS5: timeout" });
  c.killSwitch = true;
  assert.deepEqual(m.status(st, c, chrome), { tone: "error", text: "Прокси не отвечает", error: "SOCKS5: timeout", held: true });
  assert.equal(m.status({ running: false }, c, chrome).tone, "held");
  const group = us.find((u) => u.kind === "group");
  const live = { running: true, ruleStats: { "telegram.exe": { flows: 3, downRate: 100, upRate: 10, up: 1, down: 2 }, "*\\discord\\app-*\\discord.exe": { flows: 1, downRate: 50, upRate: 5 } } };
  assert.deepEqual(m.status(live, c, group), { tone: "live", flows: 4, down: 150, up: 15, total: 3 });
  assert.deepEqual(m.laneTraffic(live, c, [group]), { down: 150, up: 15, flows: 4 });
  assert.equal(m.status(live, c, us.find((u) => u.id === "r:spotify.exe")).tone, "off");
});

test("dock lists window apps without a rule", () => {
  const procs = [
    { name: "Telegram.exe", path: "C:\\T\\Telegram.exe", window: true },
    { name: "Discord.exe", path: "C:\\Users\\a\\AppData\\Local\\Discord\\app-1.2\\Discord.exe", window: true },
    { name: "obs64.exe", path: "C:\\OBS\\obs64.exe", window: true },
    { name: "obs64.exe", path: "C:\\OBS\\obs64.exe", window: true },
    { name: "explorer.exe", path: "C:\\Windows\\explorer.exe", window: true },
    { name: "helper.exe", path: "C:\\h.exe", window: false },
  ];
  assert.deepEqual(m.dockApps(procs, cfg()).map((a) => a.name), ["obs64.exe"]);
});

test("suggestions rank prefix matches and running windows first", () => {
  const run = [{ name: "Telegram.exe", path: "C:\\T\\Telegram.exe", window: true }];
  const inst = [{ name: "Telegram Desktop", path: "C:\\T\\Telegram.exe" }, { name: "Steam", path: "C:\\S\\steam.exe" }];
  const s = m.suggestions(run, inst, "tele", 5);
  assert.equal(s.length, 1);
  assert.equal(s[0].src, "run");
  assert.equal(m.suggestions(run, inst, "", 5).length, 2);
});

test("formatting", () => {
  assert.equal(bytes(0), "0 Б");
  assert.equal(bytes(1536), "1,5 КБ");
  assert.equal(bytes(150 * 1024 * 1024), "150 МБ");
  assert.equal(rate(2048), "2,0 КБ/с");
  assert.equal(plural(1, "a", "b", "c"), "a");
  assert.equal(plural(3, "a", "b", "c"), "b");
  assert.equal(plural(12, "a", "b", "c"), "c");
  assert.equal(plural(22, "a", "b", "c"), "b");
  assert.equal(appLabel('"C:\\Program Files\\App\\Tool.exe"'), "Tool");
  assert.equal(appLabel("*\\Discord\\*.exe"), "Discord");
  assert.equal(appLabel("*\\Discord\\app-*\\Discord.exe"), "Discord");
  assert.equal(appLabel("Disc*"), "Disc…");
  assert.equal(dnsServer("1.1.1.1"), "1.1.1.1:53");
  assert.equal(dnsServer("2606:4700::1111"), "[2606:4700::1111]:53");
});
