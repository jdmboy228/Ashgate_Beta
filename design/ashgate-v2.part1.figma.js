// Ashgate v2 · part 1 of 2 — theme tokens (3 modes), v2 components, competitive research board.
// Run with the Figma MCP `use_figma` tool (top-level await + return). Then run part 2.
// Requires the "Microsoft Fluent system iconography (Community)" library. Idempotent.
await Promise.all([['Inter', 'Regular'], ['Inter', 'Semi Bold'], ['Inter', 'Bold'], ['JetBrains Mono', 'Regular']].map(([family, style]) => figma.loadFontAsync({ family, style })));
const PFX = 'Ashgate v2 ·';
for (const n of figma.currentPage.children.filter(n => n.name.startsWith(PFX))) n.remove();
for (const c of (await figma.variables.getLocalVariableCollectionsAsync()).filter(c => c.name === PFX + ' Themes')) c.remove();
for (const s of (await figma.getLocalTextStylesAsync()).filter(s => s.name.startsWith('Ashgate v2/'))) s.remove();

// ---------- Tokens: one collection, three theme modes (D Shield · E Daylight · F Lanes)
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const MODES = ['Shield', 'Daylight', 'Lanes'];
const TOK = { // [Shield, Daylight, Lanes, scope]
  'bg/app': ['#0E1320', '#F3F3F3', '#15131C', 'F'], 'bg/surface': ['#161D2E', '#FFFFFF', '#1E1B28', 'F'], 'bg/raised': ['#1E2740', '#F9F9F9', '#282435', 'F'],
  'bg/control': ['#222B42', '#FFFFFF', '#2C283A', 'F'], 'bg/subtle': ['#1B2337', '#F0F0F0', '#262233', 'F'],
  'stroke/default': ['#263049', '#E5E5E5', '#2F2A3D', 'S'], 'stroke/strong': ['#34405E', '#CFCFCF', '#40395A', 'S'],
  'text/primary': ['#F2F5FA', '#1A1A1A', '#F3F1F8', 'T'], 'text/secondary': ['#A9B4C8', '#5D5D5D', '#B8B2C9', 'T'], 'text/tertiary': ['#6F7B93', '#8A8A8A', '#7E7792', 'T'],
  'accent': ['#3DDC97', '#005FB8', '#A78BFA', 'A'], 'accent/fg': ['#06281A', '#FFFFFF', '#1A1130', 'A'], 'accent/soft': ['#133A2D', '#E5F0FB', '#2E2546', 'A'],
  'ok': ['#3DDC97', '#0F7B0F', '#4ADE80', 'A'], 'ok/soft': ['#133A2D', '#DFF6DD', '#183526', 'A'],
  'warn': ['#F5B544', '#9D5D00', '#FBBF24', 'A'], 'warn/soft': ['#3A2E14', '#FFF4CE', '#3A2F14', 'A'],
  'bad': ['#FF6B7A', '#C42B1C', '#F87171', 'A'], 'bad/soft': ['#3D1A22', '#FDE7E9', '#3D1C24', 'A'],
  'chart/proxy': ['#3DDC97', '#005FB8', '#A78BFA', 'A'], 'chart/direct': ['#4A5878', '#B4C0CF', '#4B4560', 'A'], 'chart/block': ['#FF6B7A', '#C42B1C', '#F87171', 'A'],
  'lane/1': ['#3DDC97', '#005FB8', '#A78BFA', 'A'], 'lane/2': ['#4CC2FF', '#0E7490', '#38BDF8', 'A'], 'lane/3': ['#F78FB3', '#B4009E', '#F472B6', 'A'], 'lane/direct': ['#8D99B3', '#6B7280', '#94A3B8', 'A'],
};
const RAD = { 'radius/card': [16, 8, 12], 'radius/control': [10, 4, 8], 'radius/window': [12, 8, 12] };
const SC = { F: ['FRAME_FILL', 'SHAPE_FILL'], S: ['STROKE_COLOR', 'SHAPE_FILL'], T: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'], A: ['ALL_FILLS', 'STROKE_COLOR'] };
const THEMES = figma.variables.createVariableCollection(PFX + ' Themes');
const MID = [THEMES.modes[0].modeId]; THEMES.renameMode(MID[0], MODES[0]); for (const m of MODES.slice(1)) MID.push(THEMES.addMode(m));
const V = {};
for (const [k, a] of Object.entries(TOK)) { const v = figma.variables.createVariable(k, THEMES, 'COLOR'); a.slice(0, 3).forEach((h, i) => v.setValueForMode(MID[i], hex(h))); v.scopes = SC[a[3]]; V[k] = v; }
for (const [k, a] of Object.entries(RAD)) { const v = figma.variables.createVariable(k, THEMES, 'FLOAT'); a.forEach((x, i) => v.setValueForMode(MID[i], x)); v.scopes = ['CORNER_RADIUS']; V[k] = v; }
const TS = {};
for (const [n, f, st, sz, lh] of [['Caption', 'Inter', 'Regular', 12, 16], ['Caption Strong', 'Inter', 'Semi Bold', 12, 16], ['Body', 'Inter', 'Regular', 14, 20], ['Body Strong', 'Inter', 'Semi Bold', 14, 20], ['Subtitle', 'Inter', 'Semi Bold', 20, 28], ['Title', 'Inter', 'Semi Bold', 28, 36], ['Display', 'Inter', 'Bold', 44, 52], ['Mono', 'JetBrains Mono', 'Regular', 12, 16]]) {
  const s = figma.createTextStyle(); s.name = 'Ashgate v2/' + n; s.fontName = { family: f, style: st }; s.fontSize = sz; s.lineHeight = { unit: 'PIXELS', value: lh }; TS[n] = s;
}

// ---------- Helpers (shared with part 2)
const P = (k, op) => { const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[k]); return op == null ? p : Object.assign({}, p, { opacity: op }); };
const RAW = h => ({ type: 'SOLID', color: hex(h) });
function rad(n, k) { for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(f, V[k]); }
async function T(str, st = 'Body', c = 'text/primary', o = {}) {
  const t = figma.createText(); await t.setTextStyleIdAsync(TS[st].id); t.characters = str; t.fills = [P(c)]; t.name = o.name || str.slice(0, 28);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; if (o.trunc !== false) { t.maxLines = 1; t.textTruncation = 'ENDING'; } }
  return t;
}
function L(dir, o = {}, node) {
  const f = node || figma.createAutoLayout(dir);
  if (node) { f.layoutMode = dir; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; }
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
const inInst = (n, root) => { for (let p = n.parent; p && p !== root; p = p.parent) if (p.type === 'INSTANCE') return true; return false; };
const IK = {
  home: 'c58bdf6a2db927f194f335c1743b47bd4d67e2ba', apps: '3d7c8af946afcb10b36b95c155540f180f1ee880', settings: '97c10dba784718dbd9e65e2cfc62759c4886ad4d',
  search: '9bb582b407db890f8a730b68172d8b985d550ce3', add: 'cefc8d0fb2bf6cd73b8e33d7fc92948f43184c99', shield: '2de59d27da7f4bf501e1dbc8f499bb2242742bae',
  pulse: '651da6f96cd116fcc5d993a4f0664a29bacda2b6', chevron: '6ed52f5088a206a6ad00c5090b181c8242320c97', ok: '059f1da0068b5a327c097382db02f8c1c282ae98',
  warn: '355c5bf6901ff207c47ce134327df9f57772b457', err: '9888262daff1ee55266f036ad4548a98023d2f41', server: 'c6668b7d2faede3b8cf9751a2615c9c344e35a61',
  more: 'bc56af56b8e257085ecb164b2e376e585db753fa', flash: 'd0328007499df64690acea4bbbb17e32da3d62ac', dismiss: '330f04450bc69a40acafbe7ab01b0d73ed3892f4',
  minus: '176904dfc8f2f1a297af273316c2e5bafdba064e', square: '43680735fb71aee0455563dc59c223b0a6dfe1fe',
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

// ---------- Components v2 (bound to theme tokens, so they recolour per mode)
const CF = L('HORIZONTAL', { name: PFX + ' Components', gap: 32, pad: 64, fill: 'bg/app', align: 'MIN', w: 2400 }); CF.layoutWrap = 'WRAP'; CF.counterAxisSpacing = 32;
function C(name, dir, o) { const c = figma.createComponent(); c.name = name; L(dir, o, c); CF.appendChild(c); return c; }
function VS(vs, name) { const s = figma.combineAsVariants(vs, CF); L('HORIZONTAL', { gap: 16, pad: 16, r: 8, stroke: 'stroke/strong', align: 'MIN' }, s); s.dashPattern = [4, 4]; s.name = name; return s; }
function bind(owner, label, type, nodeName, def) {
  const vs = owner.type === 'COMPONENT_SET' ? owner.children : [owner];
  const first = vs[0].findAll(x => x.name === nodeName && !inInst(x, vs[0]))[0];
  const k = owner.addComponentProperty(label, type, type === 'TEXT' ? first.characters : type === 'BOOLEAN' ? true : def);
  const field = type === 'TEXT' ? 'characters' : type === 'BOOLEAN' ? 'visible' : 'mainComponent';
  for (const v of vs) for (const n of v.findAll(x => x.name === nodeName && !inInst(x, v))) n.componentPropertyReferences = Object.assign({}, n.componentPropertyReferences || {}, { [field]: k });
}
const texts = (owner, pairs) => { for (const [p, n] of pairs) bind(owner, p, 'TEXT', n); };

const bV = [];
for (const k of ['Primary', 'Secondary', 'Ghost']) {
  const fg = k === 'Primary' ? 'accent/fg' : 'text/primary';
  const c = C('Kind=' + k, 'HORIZONTAL', { gap: 6, pad: [6, 12], h: 32, rk: 'radius/control', fill: k === 'Primary' ? 'accent' : k === 'Secondary' ? 'bg/control' : null, stroke: k === 'Secondary' ? 'stroke/strong' : null });
  c.appendChild(I('add/16', fg)); c.appendChild(await T('Button', k === 'Primary' ? 'Body Strong' : 'Body', fg, { name: 'label' })); bV.push(c);
}
const Btn = VS(bV, 'Button'); bind(Btn, 'Label', 'TEXT', 'label'); bind(Btn, 'Icon', 'INSTANCE_SWAP', 'icon', IC('add/16').id); bind(Btn, 'Has icon', 'BOOLEAN', 'icon');

const IconBtn = C('IconButton', 'HORIZONTAL', { w: 32, h: 32, rk: 'radius/control', justify: 'CENTER' });
IconBtn.appendChild(I('more/16', 'text/secondary')); bind(IconBtn, 'Icon', 'INSTANCE_SWAP', 'icon', IC('more/16').id);

const swV = [];
for (const on of [true, false]) {
  const c = C('State=' + (on ? 'On' : 'Off'), 'HORIZONTAL', { w: 40, h: 20, r: 10, pad: [0, 4], fill: on ? 'accent' : null, stroke: on ? null : 'text/secondary', justify: on ? 'MAX' : 'MIN' });
  const k = dot(on ? 'accent/fg' : 'text/secondary', 12); k.name = 'knob'; c.appendChild(k); swV.push(c);
}
const Switch = VS(swV, 'ToggleSwitch');

const rV = [];
for (const [k, bg, dc, tc, lab, dash] of [['Proxy', 'accent/soft', 'accent', 'accent', 'via aeza'], ['Direct', 'bg/subtle', 'lane/direct', 'text/secondary', 'Direct'], ['Block', 'bad/soft', 'bad', 'bad', 'Blocked'], ['Inherited', null, 'lane/direct', 'text/secondary', 'Direct · from Steam', 1], ['None', 'bg/subtle', 'text/tertiary', 'text/tertiary', 'No rule · direct']]) {
  const c = C('Route=' + k, 'HORIZONTAL', { gap: 6, pad: [2, 8], h: 22, r: 11, fill: bg, stroke: dash ? 'stroke/strong' : null }); if (dash) c.dashPattern = [3, 2];
  c.appendChild(dot(dc, 6)); c.appendChild(await T(lab, 'Caption Strong', tc, { name: 'label' })); rV.push(c);
}
const Route = VS(rV, 'RouteBadge'); bind(Route, 'Label', 'TEXT', 'label');

const lV = [];
for (const [k, bg, fg, lab] of [['Good', 'ok/soft', 'ok', '42 ms'], ['Slow', 'warn/soft', 'warn', '380 ms'], ['Down', 'bad/soft', 'bad', 'No response']]) {
  const c = C('Health=' + k, 'HORIZONTAL', { gap: 6, pad: [2, 8], h: 22, r: 11, fill: bg }); c.appendChild(dot(fg, 6)); c.appendChild(await T(lab, 'Mono', fg, { name: 'label' })); lV.push(c);
}
const Lat = VS(lV, 'LatencyBadge'); bind(Lat, 'Label', 'TEXT', 'label');

const Glyph = C('AppGlyph', 'HORIZONTAL', { w: 32, h: 32, rk: 'radius/control', justify: 'CENTER', fill: 'accent' });
{ const t = await T('A', 'Body Strong', 'text/primary', { name: 'initial' }); t.fills = [RAW('#FFFFFF')]; Glyph.appendChild(t); bind(Glyph, 'Initial', 'TEXT', 'initial'); }

const Chip = C('AppChip', 'HORIZONTAL', { gap: 6, pad: [4, 12, 4, 4], h: 30, r: 15, fill: 'bg/control', stroke: 'stroke/strong' });
{ const g = U(Glyph); g.name = 'glyph'; g.resize(22, 22); Chip.appendChild(g); Chip.appendChild(await T('App', 'Caption Strong', 'text/primary', { name: 'label' })); Chip.appendChild(I('add/12', 'accent')); bind(Chip, 'Label', 'TEXT', 'label'); }

const sV = [];
for (const a of [1, 2, 3]) {
  const c = C('Active=' + a, 'HORIZONTAL', { gap: 2, pad: 3, rk: 'radius/control', fill: 'bg/subtle', stroke: 'stroke/default' });
  for (const [i, n] of [[1, 'a'], [2, 'b'], [3, 'c']]) {
    const on = i === a; const it = L('HORIZONTAL', { pad: [4, 14], rk: 'radius/control', fill: on ? 'bg/control' : null, stroke: on ? 'stroke/strong' : null, name: 'item-' + n });
    it.appendChild(await T(n.toUpperCase(), on ? 'Body Strong' : 'Body', on ? 'text/primary' : 'text/secondary', { name: n })); c.appendChild(it);
  }
  sV.push(c);
}
const Seg = VS(sV, 'SegmentedControl'); texts(Seg, [['A', 'a'], ['B', 'b'], ['C', 'c']]);

const Cap = C('CaptionButtons', 'HORIZONTAL', {});
for (const s of ['minus/16', 'square/16', 'dismiss/16']) { const b = L('HORIZONTAL', { w: 46, h: 32, justify: 'CENTER', name: s.split('/')[0] }); b.appendChild(I(s, 'text/secondary')); Cap.appendChild(b); }

const nV = [];
for (const sel of [false, true]) {
  const c = C('State=' + (sel ? 'Selected' : 'Rest'), 'HORIZONTAL', { gap: 12, pad: [0, 10, 0, 0], h: 36, w: 200, rk: 'radius/control', fill: sel ? 'bg/raised' : null });
  c.appendChild(rect(3, 16, sel ? 'accent' : null, 2, 'indicator')); c.appendChild(I('home/20', 'text/primary')); c.appendChild(await T('Item', 'Body', 'text/primary', { name: 'label' })); nV.push(c);
}
const Nav = VS(nV, 'NavigationViewItem'); bind(Nav, 'Label', 'TEXT', 'label'); bind(Nav, 'Icon', 'INSTANCE_SWAP', 'icon', IC('home/20').id); bind(Nav, 'Show label', 'BOOLEAN', 'label');

const AppRow = C('AppRow', 'HORIZONTAL', { gap: 12, pad: [0, 14], h: 56, w: 400, stroke: 'stroke/default' }); sides(AppRow, 0, 0, 1, 0);
{ const g = U(Glyph); g.name = 'glyph'; AppRow.appendChild(g); const col = add(AppRow, L('VERTICAL', { gap: 2 }), { fw: 1 });
  add(col, await T('App', 'Body Strong', 'text/primary', { name: 'name' }), { fw: 1, trunc: 1 }); add(col, await T('detail', 'Caption', 'text/secondary', { name: 'detail' }), { fw: 1, trunc: 1 });
  const s = U(Switch); s.name = 'switch'; AppRow.appendChild(s); texts(AppRow, [['Name', 'name'], ['Detail', 'detail']]); }

const SPARK = [4, 6, 9, 7, 12, 15, 11, 16, 20, 14, 10, 13, 18, 22, 17, 12];
const Act = C('ActivityRow', 'HORIZONTAL', { gap: 10, pad: [0, 12], h: 44, w: 712, stroke: 'stroke/default' }); sides(Act, 0, 0, 1, 0);
{ const ch = I('chevron/16/Regular/Right', 'text/tertiary'); ch.name = 'chev'; Act.appendChild(ch);
  const g = U(Glyph); g.name = 'glyph'; g.resize(24, 24); Act.appendChild(g);
  const col = L('VERTICAL', { w: 160, name: 'app' }); Act.appendChild(col);
  add(col, await T('App', 'Body Strong', 'text/primary', { name: 'name' }), { fw: 1, trunc: 1 }); add(col, await T('app.exe', 'Caption', 'text/tertiary', { name: 'exe' }), { fw: 1, trunc: 1 });
  const rc = L('HORIZONTAL', { w: 124, name: 'route-cell' }); const rb = U(Route); rb.name = 'route'; rc.appendChild(rb); Act.appendChild(rc);
  const sp = L('HORIZONTAL', { w: 100, h: 24, gap: 2, align: 'MAX', name: 'spark' }); SPARK.forEach(h => sp.appendChild(rect(4, h, 'chart/proxy', 1, 'bar'))); Act.appendChild(sp);
  Act.appendChild(await T('↓ 0  ↑ 0', 'Mono', 'text/secondary', { name: 'rate', w: 160, align: 'RIGHT' })); Act.appendChild(await T('0', 'Caption', 'text/tertiary', { name: 'conns', w: 36, align: 'RIGHT' }));
  texts(Act, [['Name', 'name'], ['Exe', 'exe'], ['Rate', 'rate'], ['Conns', 'conns']]); }

const Dest = C('DestinationRow', 'HORIZONTAL', { gap: 10, pad: [0, 12, 0, 62], h: 28, w: 712, fill: 'bg/raised' });
{ Dest.appendChild(dot('ok', 6)); add(Dest, await T('host:443', 'Mono', 'text/primary', { name: 'dest' }), { fw: 1, trunc: 1 }); Dest.appendChild(await T('via', 'Caption', 'text/tertiary', { name: 'via' }));
  Dest.appendChild(await T('0 KB', 'Mono', 'text/secondary', { name: 'bytes', w: 80, align: 'RIGHT' })); texts(Dest, [['Dest', 'dest'], ['Via', 'via'], ['Bytes', 'bytes']]); }

const aV = [];
for (const [k, ic, fg] of [['Info', 'flash/16', 'accent'], ['Bad', 'err/16/Filled', 'bad'], ['Warn', 'warn/16/Filled', 'warn']]) {
  const c = C('Tone=' + k, 'VERTICAL', { gap: 8, pad: 14, w: 264, rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default' });
  const h = add(c, L('HORIZONTAL', { gap: 8, align: 'MIN' }), { fw: 1 }); h.appendChild(I(ic, fg)); add(h, await T('Title', 'Body Strong', 'text/primary', { name: 'title' }), { fw: 1, wrap: 1 });
  add(c, await T('Body', 'Caption', 'text/secondary', { name: 'body' }), { fw: 1, wrap: 1 });
  const a = add(c, L('HORIZONTAL', { gap: 6 }), { fw: 1 });
  const b1 = U(Btn, { Kind: 'Primary', Label: 'Action', 'Has icon': false }); b1.name = 'a1'; a.appendChild(b1);
  const b2 = U(Btn, { Kind: 'Ghost', Label: 'Dismiss', 'Has icon': false }); b2.name = 'a2'; a.appendChild(b2); aV.push(c);
}
const Alert = VS(aV, 'InsightCard'); texts(Alert, [['Title', 'title'], ['Body', 'body']]);

const Lane = C('LaneCard', 'VERTICAL', { gap: 6, pad: 10, w: 184, rk: 'radius/card', fill: 'bg/raised', stroke: 'stroke/default' });
{ const r1 = add(Lane, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); const g = U(Glyph); g.name = 'glyph'; g.resize(24, 24); r1.appendChild(g);
  add(r1, await T('App', 'Body Strong', 'text/primary', { name: 'name' }), { fw: 1, trunc: 1 });
  const r2 = add(Lane, L('HORIZONTAL', { gap: 6 }), { fw: 1 }); r2.appendChild(await T('↓ 0', 'Mono', 'text/secondary', { name: 'speed' })); gap(r2); r2.appendChild(await T('flags', 'Caption', 'text/tertiary', { name: 'flags' }));
  texts(Lane, [['Name', 'name'], ['Speed', 'speed'], ['Flags', 'flags']]); }

const Comp = C('CompetitorCard', 'VERTICAL', { gap: 8, pad: 20, w: 480, rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default' });
{ Comp.appendChild(await T('KIND', 'Caption Strong', 'accent', { name: 'kind' })); Comp.appendChild(await T('Product', 'Subtitle', 'text/primary', { name: 'name' }));
  add(Comp, rect(10, 1, 'stroke/default', 0, 'divider'), { fw: 1 });
  Comp.appendChild(await T('BORROW', 'Caption Strong', 'ok')); add(Comp, await T('borrow', 'Body', 'text/secondary', { name: 'borrow' }), { fw: 1, wrap: 1 });
  Comp.appendChild(await T('AVOID', 'Caption Strong', 'bad')); add(Comp, await T('avoid', 'Body', 'text/secondary', { name: 'avoid' }), { fw: 1, wrap: 1 });
  texts(Comp, [['Name', 'name'], ['Kind', 'kind'], ['Borrow', 'borrow'], ['Avoid', 'avoid']]); }

const PRow = C('PatternRow', 'HORIZONTAL', { gap: 24, pad: [14, 20], w: 3540, align: 'MIN', stroke: 'stroke/default' }); sides(PRow, 0, 0, 1, 0);
{ PRow.appendChild(await T('00', 'Mono', 'text/tertiary', { name: 'n', w: 32 }));
  PRow.appendChild(await T('Pattern', 'Body Strong', 'text/primary', { name: 'pattern', w: 520, trunc: false }));
  PRow.appendChild(await T('Seen in', 'Body', 'text/secondary', { name: 'seen', w: 520, trunc: false }));
  add(PRow, await T('Adaptation', 'Body', 'text/primary', { name: 'adapt' }), { fw: 1, wrap: 1 });
  PRow.appendChild(await T('data', 'Mono', 'text/secondary', { name: 'data', w: 640, trunc: false }));
  texts(PRow, [['N', 'n'], ['Pattern', 'pattern'], ['Seen', 'seen'], ['Adapt', 'adapt'], ['Data', 'data']]); }

const Spec = C('SpecCard', 'VERTICAL', { gap: 6, pad: 16, w: 260, rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default' });
{ Spec.appendChild(await T('LABEL', 'Caption Strong', 'accent', { name: 'label' })); add(Spec, await T('Text', 'Body', 'text/secondary', { name: 'text' }), { fw: 1, wrap: 1 }); texts(Spec, [['Label', 'label'], ['Text', 'text']]); }

// ---------- Research board (Daylight mode = document look)
let maxY = 0; for (const n of figma.currentPage.children) if (n !== CF) maxY = Math.max(maxY, n.y + n.height);
const board = L('VERTICAL', { name: PFX + ' Research & Concepts', gap: 80, pad: 96, fill: 'bg/app', w: 3732 });
board.setExplicitVariableModeForCollection(THEMES, MID[1]);
const hd = add(board, L('VERTICAL', { gap: 8 }), { fw: 1 });
hd.appendChild(await T('ASHGATE · ROUND 2', 'Caption Strong', 'accent'));
hd.appendChild(await T('Competitive UI/UX scan → three new concepts', 'Display'));
add(hd, await T('How the best desktop network utilities show per-app rules, live traffic, status and modes — and how those patterns map onto Ashgate’s real data (rules, groups, proxies, probe results, ruleStats, connection events).', 'Body', 'text/secondary'), { fw: 1, wrap: 1 });
async function section(num, title, sub) {
  const s = add(board, L('VERTICAL', { gap: 24, name: title }), { fw: 1 }); const h = L('VERTICAL', { gap: 4 });
  h.appendChild(await T(num, 'Caption Strong', 'accent')); h.appendChild(await T(title, 'Title')); if (sub) h.appendChild(await T(sub, 'Body', 'text/secondary')); s.appendChild(h); return s;
}
const COMPETITORS = [
  ['Proxifier', 'PER-APP PROXY CLIENT · CLOSEST RIVAL', 'Ordered rules with one Action column (proxy, chain, direct, block). Direct traffic is still counted, so every app shows up in Connections and Traffic.', 'Rules and proxies live in modal dialogs; the first screen is a raw connection table with no guidance.'],
  ['Clash Verge Rev · Hiddify', 'PROXY CLIENTS (MIHOMO / SING-BOX)', 'One large Connect control with the ping beside it. Profiles import from clipboard, link or QR. Every node has a latency test with colour-coded ms, plus a Rule / Global / Direct mode switch.', 'Engine jargon (TUN, groups, cores) on the main screen; settings written for experts.'],
  ['Proton VPN · Mullvad', 'CONSUMER VPN · SPLIT TUNNELLING', 'Status-first home. Split tunnelling explained as a mode (“only selected apps use the VPN”). Apps picked from an installed-apps list with icons and a + button; “Find another app” as the fallback.', 'Changes need Apply / Reconnect, and app lists show no traffic, so users can’t confirm a rule works.'],
  ['Little Snitch 6', 'NETWORK MONITOR · MACOS', 'Connections grouped by app, expandable to domain and server. Real-time traffic chart. Rule groups switch on and off together; usage statistics expose dead rules. Menu-bar control centre with recently blocked connections.', 'Dense filters and rule syntax; easy to get lost in the hierarchy.'],
  ['Portmaster', 'APP FIREWALL · WINDOWS / LINUX', 'Every app has a profile combining its activity and its settings. Badges show whether a setting follows the global default or is a per-app override.', 'Long, technical settings pages with many options per app.'],
  ['GlassWire', 'TRAFFIC MONITOR · WINDOWS', 'Timeline graph you can drag to pick a period; per-app download/upload totals; “new app is using the network” alerts that fade as it learns; one-click block.', 'Alert fatigue when every event becomes a notification.'],
  ['NetLimiter', 'TRAFFIC SHAPING · WINDOWS', 'Application list with live rates that expands into each app’s connections; limits and rules applied right in the list.', 'The power-user tree is the default view; no simple mode.'],
];
const s1 = await section('1', 'Competitive scan', 'Seven tools that solve parts of Ashgate’s job: picking apps, routing them, and proving it works.');
const cr = add(s1, L('HORIZONTAL', { gap: 20, align: 'MIN' }), { fw: 1 });
for (const [n, k, b, a] of COMPETITORS) add(cr, U(Comp, { Name: n, Kind: k, Borrow: b, Avoid: a }), { fw: 1 });
const PATTERNS = [
  ['Status-first home with one big control', 'Hiddify, Proton VPN, Mullvad', 'One Protect control plus one sentence: “3 apps go through aeza · 1 needs attention”.', 'running, active, ruleStats.Err'],
  ['Plain-language mode switch', 'Proton (Include / Exclude), Clash (Rule / Global / Direct)', 'Off · Selected apps · Strict. Strict = kill switch, explained in one line under the switch.', 'running, killSwitch'],
  ['Route badge: dot + words, never colour alone', 'Proxifier Action column, Portmaster badges', '“via aeza” · “Direct” · “Blocked” · “Direct · from Steam” (inherited, dashed) · “No rule”.', 'rule.action, rule.proxy, event.parent'],
  ['Latency badge on every proxy, one-tap test', 'Clash Verge Rev, Hiddify', '“42 ms” green under 150 ms, amber under 400 ms, red “No response”. UDP support as its own chip.', 'probe.Report (ok, ms, udp)'],
  ['Pick apps from what is installed or running', 'Proton VPN, Mullvad, GlassWire', 'Running apps appear as one-tap chips; Start-menu search by name; “Find another app…” for exe paths and masks.', '/api/processes, /api/installed, /api/icon'],
  ['Activity grouped by app, expandable', 'Little Snitch, NetLimiter', 'App rows with sparkline and live rate; expand to destinations and errors.', 'events (process, dest, via, status), ruleStats'],
  ['Learn from behaviour, then ask', 'GlassWire, Little Snitch', '“Spotify started using the network — Route via aeza / Keep direct”. Only for apps without a rule.', 'events for processes with no matching rule'],
  ['Group switches', 'Little Snitch rule groups', 'One switch and one route for a whole group, e.g. Messengers.', 'config.groups, rule.group'],
  ['Paste to add a proxy', 'Hiddify, v2rayN', 'Paste a vless:// link anywhere → parsed preview → Test → Save.', '/api/vless/parse, /api/probe'],
  ['Tray control centre', 'Little Snitch, Cloudflare WARP', 'Windows 11 flyout: Protect switch, active proxy with ping, recent blocked and new apps.', 'state snapshot (1 s poll)'],
];
const s2 = await section('2', 'Patterns that work for novices — adapted to Ashgate', 'Each pattern is mapped to data the Ashgate engine and local API already expose, so none of them needs a new backend.');
const tb = add(s2, L('VERTICAL', { rk: 'radius/card', fill: 'bg/surface', stroke: 'stroke/default', clip: true, name: 'Pattern table' }), { fw: 1 });
const th = add(tb, U(PRow, { N: '#', Pattern: 'Pattern', Seen: 'Seen in', Adapt: 'Ashgate adaptation', Data: 'Backed by' }), { fw: 1 });
th.fills = [P('bg/subtle')]; for (const t of th.findAll(n => n.type === 'TEXT')) { await t.setTextStyleIdAsync(TS['Caption Strong'].id); t.fills = [P('text/tertiary')]; }
PATTERNS.forEach(([p, s, a, d], i) => add(tb, U(PRow, { N: String(i + 1).padStart(2, '0'), Pattern: p, Seen: s, Adapt: a, Data: d }), { fw: 1 }));
const s3 = await section('3', 'Principles for novice users');
const pr = add(s3, L('HORIZONTAL', { gap: 20, align: 'MIN' }), { fw: 1 });
for (const [l, t] of [['ONE SENTENCE OF STATUS', 'Every screen answers “is it working?” in words before numbers.'], ['WORDS + COLOUR + ICON', 'Route and health badges always carry text, so they survive colour blindness and longer Russian labels.'], ['DECIDE FROM REAL TRAFFIC', 'Suggest apps that are running or just connected, instead of asking for exe paths.'], ['LIVE, NO APPLY', 'Changes take effect immediately; an Undo bar replaces confirmation dialogs.'], ['ADVANCED ONE CLICK AWAY', 'Masks, rule order, DNS and UDP fallback stay available, but off the first screen.']]) add(pr, U(Spec, { Label: l, Text: t }), { fw: 1 });
add(s3, await T('Sources: proxifier.com/docs · help.obdev.at/littlesnitch6 · docs.safing.io/portmaster · protonvpn.com/support/protonvpn-split-tunneling · mullvad.net/help/split-tunneling-with-the-mullvad-app · glasswire.com/quickstartguide · github.com/hiddify/hiddify-next/wiki', 'Caption', 'text/tertiary'), { fw: 1, wrap: 1 });
const s4 = await section('4', 'Three new concepts', 'Each concept uses its own theme mode from the same token set: D Shield (navy + mint), E Daylight (Fluent light), F Lanes (midnight violet).');
const cv = add(s4, L('HORIZONTAL', { gap: 120, align: 'MIN', name: 'Concepts v2' }), { fw: 1 });
board.x = 0; board.y = maxY + 400;
CF.x = 0; CF.y = board.y + board.height + 200;
return { boardId: board.id, conceptsRowId: cv.id, componentsId: CF.id, components: CF.children.map(n => n.name), board: { y: Math.round(board.y), h: Math.round(board.height) } };
