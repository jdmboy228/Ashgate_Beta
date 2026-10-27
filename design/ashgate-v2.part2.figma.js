// Ashgate v2 · part 2 of 2 — concepts D (Shield), E (Daylight Activity), F (Lanes).
// Needs part 1 on the page first. Idempotent: rebuilds the "Concepts v2" row.
await Promise.all([['Inter', 'Regular'], ['Inter', 'Semi Bold'], ['Inter', 'Bold'], ['JetBrains Mono', 'Regular']].map(([family, style]) => figma.loadFontAsync({ family, style })));
const PFX = 'Ashgate v2 ·';
const THEMES = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === PFX + ' Themes');
const MID = THEMES.modes.map(m => m.modeId); // 0 Shield · 1 Daylight · 2 Lanes
const V = {}; for (const id of THEMES.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); V[v.name] = v; }
const TS = {}; for (const s of (await figma.getLocalTextStylesAsync()).filter(s => s.name.startsWith('Ashgate v2/'))) TS[s.name.slice(11)] = s;
const CF = figma.currentPage.children.find(n => n.name === PFX + ' Components');
const board = figma.currentPage.children.find(n => n.name === PFX + ' Research & Concepts');
const cv = board.findOne(n => n.name === 'Concepts v2'); for (const c of [...cv.children]) c.remove();
const K = n => CF.children.find(x => x.name === n);
const [Btn, IconBtn, Switch, Route, Lat, Glyph, Chip, Seg, Cap, Nav, AppRow, Act, Dest, Alert, Lane, Spec] =
  ['Button', 'IconButton', 'ToggleSwitch', 'RouteBadge', 'LatencyBadge', 'AppGlyph', 'AppChip', 'SegmentedControl', 'CaptionButtons', 'NavigationViewItem', 'AppRow', 'ActivityRow', 'DestinationRow', 'InsightCard', 'LaneCard', 'SpecCard'].map(K);

// ---------- Helpers (same as part 1)
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const P = (k, op) => { const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[k]); return op == null ? p : Object.assign({}, p, { opacity: op }); };
const RAW = h => ({ type: 'SOLID', color: hex(h) });
function rad(n, k) { for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(f, V[k]); }
async function T(str, st = 'Body', c = 'text/primary', o = {}) {
  const t = figma.createText(); await t.setTextStyleIdAsync(TS[st].id); t.characters = str; t.fills = [P(c)]; t.name = o.name || str.slice(0, 28);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; if (o.trunc !== false) { t.maxLines = 1; t.textTruncation = 'ENDING'; } }
  return t;
}
function L(dir, o = {}) {
  const f = figma.createAutoLayout(dir);
  f.fills = o.fill ? [P(o.fill)] : []; f.itemSpacing = o.gap || 0;
  const p = o.pad == null ? [0, 0, 0, 0] : typeof o.pad === 'number' ? [o.pad, o.pad, o.pad, o.pad] : o.pad.length === 2 ? [o.pad[0], o.pad[1], o.pad[0], o.pad[1]] : o.pad;
  f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
  if (o.rk) rad(f, o.rk); else if (o.r != null) f.cornerRadius = o.r;
  if (o.stroke) { f.strokes = [P(o.stroke)]; f.strokeWeight = 1; f.strokeAlign = 'INSIDE'; }
  f.counterAxisAlignItems = o.align || (dir === 'HORIZONTAL' ? 'CENTER' : 'MIN');
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.name) f.name = o.name;
  if (o.w || o.h) { f.resize(o.w || Math.max(f.width, 1), o.h || Math.max(f.height, 1)); if (!o.w) f.layoutSizingHorizontal = 'HUG'; if (!o.h) f.layoutSizingVertical = 'HUG'; }
  f.clipsContent = !!o.clip; return f;
}
function add(p, c, o = {}) {
  if (c.type === 'TEXT' && (o.wrap || o.trunc)) { c.textAutoResize = 'HEIGHT'; if (o.trunc) { c.maxLines = 1; c.textTruncation = 'ENDING'; } }
  p.appendChild(c); if (o.fw) c.layoutSizingHorizontal = 'FILL'; if (o.fh) c.layoutSizingVertical = 'FILL'; return c;
}
function gap(p) { const s = figma.createFrame(); s.name = 'spacer'; s.fills = []; s.resize(1, 1); p.appendChild(s); if (p.layoutMode === 'HORIZONTAL') s.layoutSizingHorizontal = 'FILL'; else s.layoutSizingVertical = 'FILL'; return s; }
function dot(c, s = 8) { const e = figma.createEllipse(); e.resize(s, s); e.fills = [P(c)]; e.name = 'status'; return e; }
function rect(w, h, c, r = 0, name = 'rect') { const x = figma.createRectangle(); x.resize(w, h); x.fills = c ? [P(c)] : []; x.cornerRadius = r; x.name = name; return x; }
function sides(f, t, r, b, l) { f.strokeTopWeight = t; f.strokeRightWeight = r; f.strokeBottomWeight = b; f.strokeLeftWeight = l; }
const SHADOW = (y, r, a) => [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a }, offset: { x: 0, y }, radius: r, spread: 0, visible: true, blendMode: 'NORMAL' }];
const IK = {
  apps: '3d7c8af946afcb10b36b95c155540f180f1ee880', settings: '97c10dba784718dbd9e65e2cfc62759c4886ad4d', search: '9bb582b407db890f8a730b68172d8b985d550ce3',
  add: 'cefc8d0fb2bf6cd73b8e33d7fc92948f43184c99', shield: '2de59d27da7f4bf501e1dbc8f499bb2242742bae', pulse: '651da6f96cd116fcc5d993a4f0664a29bacda2b6',
  chevron: '6ed52f5088a206a6ad00c5090b181c8242320c97', ok: '059f1da0068b5a327c097382db02f8c1c282ae98', err: '9888262daff1ee55266f036ad4548a98023d2f41',
  server: 'c6668b7d2faede3b8cf9751a2615c9c344e35a61', flash: 'd0328007499df64690acea4bbbb17e32da3d62ac',
};
const IS = {};
await Promise.all(Object.entries(IK).map(async ([k, key]) => { IS[k] = await figma.importComponentSetByKeyAsync(key); }));
function IC(spec) {
  const [n, s = '20', th = 'Regular', d] = spec.split('/'); const set = IS[n];
  const want = (d ? `Direction=${d}, ` : '') + `Size=${s}, Theme=${th}`;
  return set.children.find(c => c.name === want) || set.children.find(c => c.name.includes('Size=20') && c.name.includes(`Theme=${th}`) && (!d || c.name.includes(d))) || set.defaultVariant;
}
function tint(n, c) { for (const v of n.findAll(x => x.type === 'VECTOR' || x.type === 'BOOLEAN_OPERATION')) v.fills = [P(c)]; }
function I(spec, c = 'text/primary') { const i = IC(spec).createInstance(); const sz = +(spec.split('/')[1] || 20); if (Math.round(i.width) !== sz) i.resize(sz, sz); tint(i, c); i.name = 'icon'; return i; }
function setP(i, vals) {
  const cp = i.componentProperties; const out = {}; let swap = false;
  for (const [k, v] of Object.entries(vals)) {
    const key = Object.keys(cp).find(d => d === k || d.split('#')[0] === k); if (!key) continue;
    if (cp[key].type === 'INSTANCE_SWAP') { out[key] = IC(v).id; swap = true; } else out[key] = v;
  }
  const saved = swap ? i.findAll(n => n.type === 'VECTOR').map(n => n.fills) : null;
  i.setProperties(out);
  if (swap) i.findAll(n => n.type === 'VECTOR').forEach((n, x) => { const f = saved[Math.min(x, saved.length - 1)]; if (f) n.fills = f; });
  return i;
}
function U(c, vals = {}) { const i = (c.type === 'COMPONENT_SET' ? c.defaultVariant : c).createInstance(); if (Object.keys(vals).length) setP(i, vals); return i; }
function N(i, name, vals) { const n = i.findOne(x => x.type === 'INSTANCE' && x.name === name); if (n && vals) setP(n, vals); return n; }
function gl(i, hx, ch) { const g = i.name === 'glyph' ? i : i.findOne(x => x.type === 'INSTANCE' && x.name === 'glyph'); if (!g) return; setP(g, { Initial: ch }); g.fills = [RAW(hx)]; }
function win(name, w, h, mode) { const f = L('VERTICAL', { name, w, h, rk: 'radius/window', fill: 'bg/app', stroke: 'stroke/strong', clip: true }); f.setExplicitVariableModeForCollection(THEMES, MID[mode]); f.effects = SHADOW(24, 56, mode === 1 ? 0.16 : 0.5); return f; }
async function field(ph, w) { const f = L('HORIZONTAL', { w, h: 32, pad: [0, 10], gap: 8, rk: 'radius/control', fill: 'bg/control', stroke: 'stroke/strong', name: 'SearchBox' }); f.appendChild(I('search/16', 'text/tertiary')); add(f, await T(ph, 'Body', 'text/tertiary'), { fw: 1, trunc: 1 }); return f; }
async function column(k, title, desc, palette, mode, specs) {
  const c = L('VERTICAL', { name: `Concept ${k} · ${title}`, gap: 24, w: 1100 }); cv.appendChild(c);
  const h = add(c, L('VERTICAL', { gap: 10 }), { fw: 1 });
  h.appendChild(await T(`Concept ${k} · ${title}`, 'Title')); add(h, await T(desc, 'Body', 'text/secondary'), { fw: 1, wrap: 1 });
  const pr = L('HORIZONTAL', { gap: 10 }); const sw = L('HORIZONTAL', { gap: 4, pad: 4, r: 8, fill: 'bg/app', stroke: 'stroke/strong', name: 'Palette' });
  sw.setExplicitVariableModeForCollection(THEMES, MID[mode]); for (const t of ['bg/app', 'bg/surface', 'accent', 'ok', 'warn', 'bad']) sw.appendChild(rect(22, 22, t, 5, t));
  pr.appendChild(sw); pr.appendChild(await T(palette, 'Caption', 'text/secondary')); h.appendChild(pr);
  const sr = add(c, L('HORIZONTAL', { gap: 16, align: 'MIN', name: 'Specs' }), { fw: 1 });
  for (const [l, t] of specs) add(sr, U(Spec, { Label: l, Text: t }), { fw: 1 });
  return c;
}

// ---------- Concept D · Shield (compact companion + tray flyout)
async function conceptD() {
  const col = await column('D', 'Shield', 'A compact companion window in the style of consumer VPN apps: one Protect button, one mode switch, and the few apps that go through the proxy. Best default for first-time users.', 'Shield · deep navy with mint “protected” accent, 16 px cards', 0, [
    ['NAVIGATION', 'Compact 440 px window with a top Pivot (Home · Apps · Proxies · Settings), plus a Windows 11 tray flyout for everyday use.'],
    ['MAIN AREA', 'Status hero with one Protect button and a 3-state mode switch, the active proxy with live ping, then the routed apps with switches.'],
    ['NOVICE UX', 'One sentence explains the state. Running apps appear as chips: one click routes them. Nothing to save or apply.'],
    ['ASHGATE FIT', 'Off / Selected apps / Strict = running + killSwitch. Masks, rule order and DNS move under Apps › Advanced.']]);
  const row = add(col, L('HORIZONTAL', { gap: 48, align: 'MIN', name: 'Windows' }), {});
  const w = win('Window · Concept D · main', 440, 720, 0); row.appendChild(w);
  const tb = add(w, L('HORIZONTAL', { h: 40, pad: [0, 0, 0, 14], gap: 10, name: 'TitleBar' }), { fw: 1 }); tb.appendChild(I('shield/16/Filled', 'accent')); tb.appendChild(await T('Ashgate', 'Caption', 'text/secondary')); gap(tb); tb.appendChild(U(Cap));
  const pv = add(w, L('HORIZONTAL', { h: 40, pad: [0, 14], gap: 4, align: 'MAX', name: 'Pivot' }), { fw: 1 });
  for (const [l, sel] of [['Home', 1], ['Apps'], ['Proxies'], ['Settings']]) { const it = L('VERTICAL', { gap: 6, pad: [0, 8], align: 'CENTER' }); it.appendChild(await T(l, sel ? 'Body Strong' : 'Body', sel ? 'text/primary' : 'text/secondary')); it.appendChild(rect(16, 3, sel ? 'accent' : null, 2, 'indicator')); pv.appendChild(it); }
  const c = add(w, L('VERTICAL', { pad: [12, 20, 16, 20], gap: 14, name: 'Content' }), { fw: 1, fh: 1 });
  const hero = add(c, L('VERTICAL', { gap: 10, pad: [16, 20, 14, 20], rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', align: 'CENTER', name: 'Status hero' }), { fw: 1 });
  const ring = L('HORIZONTAL', { w: 96, h: 96, r: 48, fill: 'accent/soft', justify: 'CENTER', name: 'Protect button' });
  const core = L('HORIZONTAL', { w: 68, h: 68, r: 34, fill: 'accent', justify: 'CENTER' }); core.appendChild(I('shield/32/Filled', 'accent/fg')); ring.appendChild(core);
  ring.effects = [{ type: 'DROP_SHADOW', color: { r: 0.24, g: 0.86, b: 0.59, a: 0.28 }, offset: { x: 0, y: 0 }, radius: 36, spread: 0, visible: true, blendMode: 'NORMAL' }]; hero.appendChild(ring);
  hero.appendChild(await T('Protected', 'Subtitle')); hero.appendChild(await T('3 apps go through aeza · 1 needs attention', 'Caption', 'text/secondary'));
  hero.appendChild(U(Seg, { Active: '2', A: 'Off', B: 'Selected apps', C: 'Strict' }));
  const pr = add(c, L('HORIZONTAL', { gap: 10, pad: [10, 8, 10, 14], rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', name: 'Active proxy' }), { fw: 1 });
  pr.appendChild(I('server/20', 'text/secondary')); const pc = add(pr, L('VERTICAL', {}), { fw: 1 }); pc.appendChild(await T('aeza', 'Body Strong')); pc.appendChild(await T('VLESS · REALITY · UDP ok', 'Caption', 'text/tertiary'));
  pr.appendChild(U(Lat, { Health: 'Good', Label: '42 ms' })); pr.appendChild(U(Btn, { Kind: 'Ghost', Label: 'Change', 'Has icon': false }));
  const sh = add(c, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); sh.appendChild(await T('Apps through the proxy', 'Body Strong')); sh.appendChild(await T('4', 'Caption', 'text/tertiary')); gap(sh); sh.appendChild(U(Btn, { Kind: 'Ghost', Label: 'Add', Icon: 'add/16' }));
  const lst = add(c, L('VERTICAL', { rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', clip: true, name: 'App list' }), { fw: 1 });
  for (const [n, d, hx, bad] of [['Telegram', 'via aeza · ↓ 1.2 MB/s', '#2A8FD0'], ['Discord', 'via aeza · ↓ 40 KB/s · TCP only', '#5865F2'], ['Chrome', 'nl1 isn’t responding — held by Strict', '#C5473A', 1]]) {
    const r = add(lst, U(AppRow, { Name: n, Detail: d }), { fw: 1 }); gl(r, hx, n[0]); if (bad) r.findOne(x => x.name === 'detail').fills = [P('bad')];
  }
  const sg = add(c, L('VERTICAL', { gap: 8, name: 'Suggestions' }), { fw: 1 }); sg.appendChild(await T('Running now — click to route through aeza', 'Caption', 'text/tertiary'));
  const chips = add(sg, L('HORIZONTAL', { gap: 6 }), { fw: 1 });
  for (const [n, hx] of [['Steam', '#3D6A8F'], ['Spotify', '#1E9E4C'], ['OBS', '#6B4FBB']]) { const ch = U(Chip, { Label: n }); gl(ch, hx, n[0]); chips.appendChild(ch); }
  // Tray flyout
  const fc = L('VERTICAL', { gap: 12, name: 'Tray flyout column' }); row.appendChild(fc);
  const f = L('VERTICAL', { name: 'Tray flyout', w: 360, pad: 16, gap: 12, rk: 'radius/window', fill: 'bg/surface', stroke: 'stroke/strong' }); f.setExplicitVariableModeForCollection(THEMES, MID[0]); f.effects = SHADOW(16, 48, 0.5); fc.appendChild(f);
  const fh = add(f, L('HORIZONTAL', { gap: 10 }), { fw: 1 }); fh.appendChild(I('shield/20/Filled', 'accent'));
  const ft = add(fh, L('VERTICAL', {}), { fw: 1 }); ft.appendChild(await T('Protected', 'Body Strong')); ft.appendChild(await T('Selected apps · aeza 42 ms', 'Caption', 'text/secondary')); fh.appendChild(U(Switch));
  f.appendChild(U(Seg, { Active: '2', A: 'Off', B: 'Selected', C: 'Strict' }));
  add(f, rect(10, 1, 'stroke/default', 0, 'divider'), { fw: 1 });
  f.appendChild(await T('Recent', 'Caption Strong', 'text/tertiary'));
  for (const [ic, cl, t, tm] of [['err/16/Filled', 'bad', 'Chrome held — nl1 isn’t responding', '12:01'], ['ok/16/Filled', 'ok', 'Discord → aeza', '12:00'], ['flash/16', 'accent', 'New: Spotify is using the network', '11:58']]) {
    const r = add(f, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); r.appendChild(I(ic, cl)); add(r, await T(t, 'Caption', 'text/primary'), { fw: 1, trunc: 1 }); r.appendChild(await T(tm, 'Mono', 'text/tertiary'));
  }
  const fa = add(f, L('HORIZONTAL', { gap: 6, pad: [0, 0, 0, 24] }), { fw: 1 }); fa.appendChild(U(Btn, { Kind: 'Primary', Label: 'Route via aeza', 'Has icon': false })); fa.appendChild(U(Btn, { Kind: 'Ghost', Label: 'Keep direct', 'Has icon': false }));
  add(f, rect(10, 1, 'stroke/default', 0, 'divider'), { fw: 1 });
  const ff = add(f, L('HORIZONTAL', { gap: 6 }), { fw: 1 }); ff.appendChild(U(Btn, { Kind: 'Secondary', Label: 'Open Ashgate', Icon: 'apps/16' })); gap(ff); ff.appendChild(U(IconBtn, { Icon: 'settings/16' }));
  const fn = L('VERTICAL', { gap: 4 }); fn.appendChild(await T('Tray flyout', 'Body Strong')); fn.appendChild(await T('Windows 11 quick-settings style. Most days users never open the main window.', 'Caption', 'text/secondary', { w: 340, trunc: false })); fc.appendChild(fn);
  return w.id;
}

// ---------- Concept E · Daylight Activity (light theme, activity-first)
async function conceptE() {
  const col = await column('E', 'Daylight Activity', 'An activity-first home in the Fluent light theme: every app that touched the network, what route it took, and live suggestions for apps without a rule. Users route what they see.', 'Daylight · Fluent light Mica, Windows blue accent, 8 px cards', 1, [
    ['NAVIGATION', 'LeftCompact rail: Activity (home) · Rules · Proxies · Settings. The Protect switch lives in the title bar.'],
    ['MAIN AREA', 'Stacked timeline (proxy / direct / blocked), then apps sorted by live traffic with route badge, sparkline and rate. Rows expand to destinations.'],
    ['NOVICE UX', 'An Insights rail asks about new apps and explains blocks in plain words, with the fix as the primary button.'],
    ['ASHGATE FIT', 'Built on connection events (process, dest, via, parent), ruleStats and the process list. Direct apps are counted too, as in Proxifier.']]);
  const w = win('Window · Concept E · Activity', 1100, 720, 1); col.appendChild(w);
  const tb = add(w, L('HORIZONTAL', { h: 44, pad: [0, 0, 0, 14], gap: 10, name: 'TitleBar' }), { fw: 1 }); tb.appendChild(I('shield/16/Filled', 'accent')); tb.appendChild(await T('Ashgate', 'Caption', 'text/secondary')); gap(tb);
  const pill = L('HORIZONTAL', { gap: 8, pad: [4, 6, 4, 12], r: 16, fill: 'ok/soft', name: 'Protect pill' }); pill.appendChild(dot('ok')); pill.appendChild(await T('Protected · Selected apps', 'Caption Strong', 'ok')); pill.appendChild(U(Switch)); tb.appendChild(pill); tb.appendChild(U(Cap));
  const body = add(w, L('HORIZONTAL', { align: 'MIN', name: 'Body' }), { fw: 1, fh: 1 });
  const rail = add(body, L('VERTICAL', { w: 56, pad: [4, 8, 12, 8], gap: 4, align: 'CENTER', name: 'NavigationView · LeftCompact' }), { fh: 1 });
  const ri = (ic, sel) => { const i = U(Nav, { State: sel ? 'Selected' : 'Rest', Icon: ic, 'Show label': false }); i.resize(40, 36); rail.appendChild(i); };
  ri('pulse/20', 1); ri('apps/20'); ri('server/20'); gap(rail); ri('settings/20');
  const content = add(body, L('HORIZONTAL', { align: 'MIN', fill: 'bg/raised', stroke: 'stroke/default', name: 'Content' }), { fw: 1, fh: 1 }); content.topLeftRadius = 8; sides(content, 1, 0, 0, 1);
  const main = add(content, L('VERTICAL', { pad: [16, 20], gap: 14, name: 'Main' }), { fw: 1, fh: 1 });
  const hr = add(main, L('HORIZONTAL', { gap: 12 }), { fw: 1 }); hr.appendChild(await T('Activity', 'Title')); hr.appendChild(U(Seg, { Active: '1', A: 'Live', B: '1 hour', C: '24 hours' })); gap(hr); hr.appendChild(await field('Filter apps or hosts', 220));
  const tl = add(main, L('VERTICAL', { gap: 10, pad: 14, rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', name: 'Traffic timeline' }), { fw: 1 });
  const lg = add(tl, L('HORIZONTAL', { gap: 20 }), { fw: 1 });
  for (const [cl, l, v] of [['chart/proxy', 'Through proxy', '2.1 MB/s'], ['chart/direct', 'Direct', '8.6 MB/s'], ['chart/block', 'Blocked', '14 attempts']]) { const it = L('HORIZONTAL', { gap: 6 }); it.appendChild(rect(10, 10, cl, 2, 'swatch')); it.appendChild(await T(l, 'Caption', 'text/secondary')); it.appendChild(await T(v, 'Mono', 'text/primary')); lg.appendChild(it); }
  gap(lg); lg.appendChild(await T('last 10 min · drag to zoom', 'Caption', 'text/tertiary'));
  const chart = add(tl, L('HORIZONTAL', { h: 64, gap: 3, align: 'MAX', name: 'Stacked bars' }), { fw: 1 });
  for (let i = 0; i < 60; i++) {
    const p = 6 + ((i * 7) % 13), d = 8 + ((i * 11) % 23) + (i > 40 ? 10 : 0), b = (i % 9 === 4) ? 4 : 0;
    const bar = L('VERTICAL', { gap: 1, name: 't' + i }); if (b) bar.appendChild(rect(8, b, 'chart/block', 1)); bar.appendChild(rect(8, d, 'chart/direct', 1)); bar.appendChild(rect(8, p, 'chart/proxy', 1)); chart.appendChild(bar);
  }
  const lst = add(main, L('VERTICAL', { rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', clip: true, name: 'Apps with activity' }), { fw: 1 });
  const lh = add(lst, L('HORIZONTAL', { h: 32, gap: 10, pad: [0, 12], fill: 'bg/subtle', name: 'Header' }), { fw: 1 });
  for (const [l, wd, al] of [[' ', 16], [' ', 24], ['App', 160], ['Route', 124], ['Last 60 s', 94], ['↓ / ↑', 160, 'RIGHT'], ['Conn.', 36, 'RIGHT']]) lh.appendChild(await T(l, 'Caption Strong', 'text/tertiary', { w: wd, align: al }));
  const R = [
    { n: 'Steam', e: 'steam.exe', rt: 'Direct', rl: 'Direct', rate: '↓ 8.4 MB/s  ↑ 90 KB/s', c: '6', hx: '#3D6A8F', ch: 'chart/direct' },
    { n: 'Telegram', e: 'Telegram.exe', rt: 'Proxy', rl: 'via aeza', rate: '↓ 1.2 MB/s  ↑ 40 KB/s', c: '3', hx: '#2A8FD0', ch: 'chart/proxy', open: 1 },
    { n: 'steamwebhelper', e: 'child of Steam', rt: 'Inherited', rl: 'Direct · from Steam', rate: '↓ 210 KB/s  ↑ 6 KB/s', c: '4', hx: '#3D6A8F', ch: 'chart/direct' },
    { n: 'Spotify', e: 'Spotify.exe · new', rt: 'None', rl: 'No rule · direct', rate: '↓ 320 KB/s  ↑ 8 KB/s', c: '2', hx: '#1E9E4C', ch: 'chart/direct', hi: 1 },
    { n: 'Discord', e: 'Discord.exe', rt: 'Proxy', rl: 'via aeza', rate: '↓ 40 KB/s  ↑ 2 KB/s', c: '1', hx: '#5865F2', ch: 'chart/proxy' },
    { n: 'Chrome', e: 'chrome.exe', rt: 'Block', rl: 'Held · nl1 down', rate: '—', c: '0', hx: '#C5473A', ch: 'chart/block', flat: 1 },
  ];
  for (const r of R) {
    const i = add(lst, U(Act, { Name: r.n, Exe: r.e, Rate: r.rate, Conns: r.c }), { fw: 1 }); gl(i, r.hx, r.n[0]); N(i, 'route', { Route: r.rt, Label: r.rl });
    i.findAll(x => x.name === 'bar').forEach(b => { b.fills = [P(r.ch)]; if (r.flat) b.visible = false; }); // held app: empty sparkline
    if (r.flat) i.findOne(x => x.name === 'spark').resize(94, 24);
    if (r.hi) i.fills = [P('accent/soft')];
    if (r.open) {
      const chv = i.findOne(x => x.name === 'chev'); chv.swapComponent(IC('chevron/16/Regular/Down')); tint(chv, 'text/tertiary');
      for (const [d, v, b, bad] of [['149.154.167.51:443', 'aeza · TCP', '12.4 KB'], ['149.154.175.50:443', 'aeza · TCP', '48.0 KB'], ['91.108.56.130:443', 'REALITY handshake failed', '—', 1]]) {
        const dr = add(lst, U(Dest, { Dest: d, Via: v, Bytes: b }), { fw: 1 });
        if (bad) { dr.findOne(x => x.name === 'status').fills = [P('bad')]; dr.findOne(x => x.name === 'via').fills = [P('bad')]; }
      }
    }
  }
  const ins = add(content, L('VERTICAL', { w: 300, pad: 16, gap: 12, fill: 'bg/app', stroke: 'stroke/default', name: 'Insights' }), { fh: 1 }); sides(ins, 0, 0, 0, 1);
  const ih = add(ins, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); ih.appendChild(await T('Insights', 'Subtitle')); ih.appendChild(await T('3 new', 'Caption', 'text/tertiary'));
  for (const [tone, t, b, a1, a2] of [
    ['Info', 'Spotify started using the network', 'It has no rule, so it goes direct. Route it like your other apps?', 'Route via aeza', 'Keep direct'],
    ['Bad', 'Chrome is held by Strict mode', 'nl1 isn’t responding (timeout). Chrome can’t go direct while Strict is on.', 'Use aeza', 'Open proxy'],
    ['Warn', 'The Opera rule can’t match', 'opera.exe wasn’t found among running or installed apps.', 'Find exe…', 'Remove']]) {
    const a = add(ins, U(Alert, { Tone: tone, Title: t, Body: b }), { fw: 1 }); N(a, 'a1', { Label: a1 }); N(a, 'a2', { Label: a2 });
  }
  gap(ins); add(ins, await T('Built from live connection events on this PC. Nothing leaves your computer.', 'Caption', 'text/tertiary'), { fw: 1, wrap: 1 });
  return w.id;
}

// ---------- Concept F · Lanes (route = lane, drag to change)
async function conceptF() {
  const col = await column('F', 'Lanes', 'Every route is a lane: one per proxy, plus Direct and Block. An app’s route is simply the lane its card sits in, so changing it is a drag (or a number key). Running apps without a rule wait in a dock.', 'Lanes · midnight violet with a colour per route, 12 px cards', 2, [
    ['NAVIGATION', 'No sidebar: a slim top bar with the Off / On / Strict switch. Proxies, Log and Settings open as side sheets over the lanes.'],
    ['MAIN AREA', 'Lane headers show the proxy type, latency badge and UDP support. App cards show live speed and flags; a dashed zone accepts drops.'],
    ['NOVICE UX', 'A spatial mental model (“Telegram is in the aeza lane”). Drag, or select a card and press 1–5. Undo bar after every move.'],
    ['ASHGATE FIT', 'Lanes = proxies[] + Direct + Block; a card = a rule. First-match order only matters for overlapping masks, flagged on the card.']]);
  const w = win('Window · Concept F · Lanes', 1100, 720, 2); col.appendChild(w);
  const tb = add(w, L('HORIZONTAL', { h: 52, pad: [0, 0, 0, 16], gap: 12, name: 'Top bar' }), { fw: 1 });
  tb.appendChild(I('shield/20/Filled', 'accent')); tb.appendChild(await T('Ashgate', 'Body Strong')); tb.appendChild(rect(1, 20, 'stroke/strong', 0, 'divider'));
  tb.appendChild(U(Seg, { Active: '2', A: 'Off', B: 'On', C: 'Strict' })); tb.appendChild(await T('14 flows · ↓ 2.1 MB/s · ↑ 140 KB/s', 'Caption', 'text/secondary')); gap(tb);
  for (const ic of ['server/16', 'pulse/16', 'settings/16']) tb.appendChild(U(IconBtn, { Icon: ic })); tb.appendChild(U(Cap));
  const lanes = add(w, L('HORIZONTAL', { pad: [4, 16, 12, 16], gap: 12, align: 'MIN', name: 'Lanes' }), { fw: 1, fh: 1 });
  const LD = [
    { n: 'aeza', t: 'VLESS · REALITY', c: 'lane/1', h: ['Good', '42 ms'], u: 'UDP', cards: [['Telegram', '↓ 1.2 MB/s', 'children · KS', '#2A8FD0'], ['Discord', '↓ 40 KB/s', 'TCP only', '#5865F2'], ['Opera', '—', 'exe not found', '#B8323A', 'warn']], drop: 1 },
    { n: 'nl1', t: 'SOCKS5', c: 'lane/2', h: ['Down', 'No response'], u: 'UDP', cards: [['Chrome', 'held', 'kill switch', '#C5473A', 'bad']] },
    { n: 'work', t: 'HTTP CONNECT', c: 'lane/3', h: ['Slow', '380 ms'], u: 'TCP only', cards: [['Firefox', '↓ 320 KB/s', 'children', '#D9661F']] },
    { n: 'Direct', t: 'Skips the proxy', c: 'lane/direct', cards: [['Steam', '↓ 8.4 MB/s', 'children', '#3D6A8F']] },
    { n: 'Block', t: 'Traffic is dropped', c: 'bad', cards: [['qBittorrent', 'dropped', '', '#5A8F29']] },
  ];
  let dropZone = null;
  for (const [ix, l] of LD.entries()) {
    const ln = add(lanes, L('VERTICAL', { gap: 8, pad: 10, rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', name: 'Lane · ' + l.n }), { fw: 1, fh: 1 });
    const hh = add(ln, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); hh.appendChild(rect(4, 20, l.c, 2, 'lane colour')); hh.appendChild(await T(l.n, 'Subtitle')); gap(hh); hh.appendChild(await T(String(ix + 1), 'Mono', 'text/tertiary'));
    ln.appendChild(await T(l.t, 'Caption', 'text/tertiary'));
    const hr = add(ln, L('HORIZONTAL', { gap: 6 }), { fw: 1 });
    if (l.h) { hr.appendChild(U(Lat, { Health: l.h[0], Label: l.h[1] })); hr.appendChild(U(Route, { Route: 'Direct', Label: l.u })); }
    add(ln, rect(10, 1, 'stroke/default', 0, 'divider'), { fw: 1 });
    for (const [n, s, fl, hx, st] of l.cards) { const cd = add(ln, U(Lane, { Name: n, Speed: s, Flags: fl }), { fw: 1 }); gl(cd, hx, n[0]); if (st) { cd.strokes = [P(st)]; cd.findOne(x => x.name === 'flags').fills = [P(st)]; } }
    const dz = add(ln, L('VERTICAL', { h: 56, rk: 'radius/card', stroke: l.drop ? 'accent' : 'stroke/strong', fill: l.drop ? 'accent/soft' : null, justify: 'CENTER', align: 'CENTER', name: 'Drop zone' }), { fw: 1 }); dz.dashPattern = [4, 4];
    dz.appendChild(await T(l.drop ? 'Drop to route via aeza' : 'Drop an app here', 'Caption Strong', l.drop ? 'accent' : 'text/tertiary'));
    if (l.drop) dropZone = dz;
  }
  const dock = add(w, L('HORIZONTAL', { h: 72, pad: [0, 16], gap: 10, fill: 'bg/surface', stroke: 'stroke/default', name: 'Dock · running, no rule' }), { fw: 1 }); sides(dock, 1, 0, 0, 0);
  const dl = L('VERTICAL', { gap: 2 }); dl.appendChild(await T('Running, no rule yet', 'Caption Strong', 'text/secondary')); dl.appendChild(await T('Drag into a lane, or select and press 1–5', 'Caption', 'text/tertiary')); dock.appendChild(dl);
  for (const [n, hx, ghost] of [['Spotify', '#1E9E4C', 1], ['OBS', '#6B4FBB'], ['Zoom', '#2D8CFF'], ['Edge', '#0F7BCB']]) { const ch = U(Chip, { Label: n }); gl(ch, hx, n[0]); if (ghost) ch.opacity = 0.35; dock.appendChild(ch); }
  gap(dock); dock.appendChild(U(Btn, { Kind: 'Secondary', Label: 'Find another app…', Icon: 'search/16' }));
  const gh = U(Lane, { Name: 'Spotify', Speed: '↓ 320 KB/s', Flags: 'moving…' }); gl(gh, '#1E9E4C', 'S'); w.appendChild(gh); gh.layoutPositioning = 'ABSOLUTE';
  gh.effects = SHADOW(14, 30, 0.6); gh.strokes = [P('accent')]; gh.name = 'Dragging card (ghost)';
  const wb = w.absoluteBoundingBox, db = dropZone.absoluteBoundingBox; gh.x = db.x - wb.x + 22; gh.y = db.y - wb.y - 10; gh.rotation = -3;
  return w.id;
}

const out = { D: await conceptD(), E: await conceptE(), F: await conceptF() };
CF.y = board.y + board.height + 200;
return { windows: out, board: { w: Math.round(board.width), h: Math.round(board.height) }, columns: cv.children.map(n => n.name) };
