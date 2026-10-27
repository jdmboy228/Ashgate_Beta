import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../ui/js/store.js";
import * as M from "../ui/js/model.js";

function fakeBackend(opts) {
  opts = opts || {};
  const b = {
    saved: [],
    started: 0,
    stopped: 0,
    server: {
      running: false,
      config: { killSwitch: false, proxies: [{ name: "p", type: "socks5", address: "1.2.3.4:1080" }], groups: [], rules: [{ enabled: true, process: "a.exe", action: "direct" }] },
      checks: {},
    },
    async state() { return JSON.parse(JSON.stringify(b.server)); },
    async saveConfig(cfg) {
      if (opts.slow) await new Promise((r) => setTimeout(r, opts.slow));
      if (opts.fail) throw new Error("boom");
      b.saved.push(cfg);
      b.server.config = cfg;
      return { ok: true };
    },
    async start() { b.started++; b.server.running = true; },
    async stop() { b.stopped++; b.server.running = false; },
    async probe(name) { return { ok: true, ms: 10, label: "10 мс", name }; },
  };
  return b;
}

test("edit applies at once and saves the newest config", async () => {
  const b = fakeBackend({ slow: 20 });
  const s = createStore(b);
  await s.refresh();
  const p1 = s.edit((c) => M.setEnabled(c, "r:a.exe", false), { label: "off" });
  assert.equal(s.cfg.rules[0].enabled, false, "optimistic");
  const p2 = s.edit((c) => M.moveUnit(c, "r:a.exe", "block", null));
  const p3 = s.edit((c) => M.moveUnit(c, "r:a.exe", "p:p", null));
  await Promise.all([p1, p2, p3]);
  assert.ok(b.saved.length >= 1 && b.saved.length <= 3);
  const last = b.saved[b.saved.length - 1];
  assert.equal(last.rules[0].proxy, "p");
  assert.equal(last.rules[0].enabled, false);
});

test("a poll during a save does not undo the local edit", async () => {
  const b = fakeBackend({ slow: 40 });
  const s = createStore(b);
  await s.refresh();
  const p = s.edit((c) => M.setEnabled(c, "r:a.exe", false));
  await s.refresh(); // the server still has the old config
  assert.equal(s.cfg.rules[0].enabled, false);
  await p;
});

test("a failed save rolls back to the server config", async () => {
  const b = fakeBackend({ fail: true });
  const s = createStore(b);
  await s.refresh();
  await assert.rejects(s.edit((c) => M.setEnabled(c, "r:a.exe", false)), /boom/);
  assert.notEqual(s.cfg.rules[0].enabled, false);
});

test("undo restores the previous config", async () => {
  const b = fakeBackend();
  const s = createStore(b);
  await s.refresh();
  await s.edit((c) => M.moveUnit(c, "r:a.exe", "block", null), { label: "moved" });
  assert.equal(s.cfg.rules[0].action, "block");
  assert.equal(s.undo(), "moved");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.cfg.rules[0].action, "direct");
  assert.equal(s.canUndo, false);
});

test("strict mode turns on the kill switch and starts capture", async () => {
  const b = fakeBackend();
  const s = createStore(b);
  await s.refresh();
  await s.setMode("strict");
  assert.equal(b.started, 1);
  assert.equal(b.server.config.killSwitch, true);
  assert.equal(M.mode(s.view), "strict");
  await s.setMode("on");
  assert.equal(b.server.config.killSwitch, false);
  assert.equal(b.started, 1, "already running");
  await s.setMode("off");
  assert.equal(b.stopped, 1);
});

test("subscribers get one batched notification per frame", async () => {
  const b = fakeBackend();
  const s = createStore(b);
  const seen = [];
  s.subscribe((r) => seen.push([...r].sort().join(",")));
  await s.refresh();
  s.emit("a");
  s.emit("b");
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(seen, ["a,b,state"]);
});

test("probe marks the proxy busy and stores the report", async () => {
  const b = fakeBackend();
  const s = createStore(b);
  await s.refresh();
  const p = s.probe("p");
  assert.ok(s.local.probing.has("p"));
  await p;
  assert.ok(!s.local.probing.has("p"));
  assert.equal(s.view.checks.p.ms, 10);
});
