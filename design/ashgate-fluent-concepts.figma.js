// Ashgate · Windows 11 Fluent (dark) UI concepts A / B / C
// Figma Plugin API script. Run it with the Figma MCP `use_figma` tool (top-level await + `return`),
// or wrap it in an async main() inside a development plugin.
// Requires the "Microsoft Fluent system iconography (Community)" library enabled in the file.
// Idempotent: it deletes its own previous output (frames, variables, text styles) before building.

const KEEP = 'Ashgate ·';
for (const n of figma.currentPage.children.filter(n => n.name.startsWith(KEEP))) n.remove();
for (const c of (await figma.variables.getLocalVariableCollectionsAsync()).filter(c => c.name === 'Ashgate · Fluent Dark')) c.remove();
for (const s of (await figma.getLocalTextStylesAsync()).filter(s => s.name.startsWith('Ashgate/'))) s.remove();
await Promise.all([['Inter', 'Regular'], ['Inter', 'Semi Bold'], ['JetBrains Mono', 'Regular']].map(([family, style]) => figma.loadFontAsync({ family, style })));

// ---------- Tokens: Fluent dark theme as local variables
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const SC = { F: ['FRAME_FILL', 'SHAPE_FILL'], S: ['STROKE_COLOR', 'SHAPE_FILL'], T: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'], A: ['ALL_FILLS', 'STROKE_COLOR'] };
const TOK = {
  'bg/canvas': ['#141414', 'F'], 'bg/mica': ['#202020', 'F'], 'bg/layer': ['#272727', 'F'], 'bg/card': ['#2B2B2B', 'F'],
  'bg/card-strong': ['#323232', 'F'], 'bg/control': ['#353535', 'F'], 'bg/selected': ['#343434', 'F'], 'bg/accent-subtle': ['#1C3747', 'F'],
  'bg/flyout': ['#2C2C2C', 'F'], 'bg/infobar-caution': ['#433519', 'F'], 'bg/infobar-critical': ['#442726', 'F'], 'bg/infobar-success': ['#393D1B', 'F'],
  'stroke/card': ['#363636', 'S'], 'stroke/control': ['#454545', 'S'], 'stroke/divider': ['#333333', 'S'], 'stroke/flyout': ['#404040', 'S'],
  'text/primary': ['#FFFFFF', 'T'], 'text/secondary': ['#C5C5C5', 'T'], 'text/tertiary': ['#9D9D9D', 'T'], 'text/disabled': ['#6B6B6B', 'T'], 'text/on-accent': ['#000000', 'T'],
  'accent/default': ['#60CDFF', 'A'], 'status/success': ['#6CCB5F', 'A'], 'status/caution': ['#FCE100', 'A'], 'status/critical': ['#FF99A4', 'A'], 'status/neutral': ['#9D9D9D', 'A'],
};
const col = figma.variables.createVariableCollection('Ashgate · Fluent Dark');
const MODE = col.modes[0].modeId; col.renameMode(MODE, 'Dark');
const V = {};
for (const [k, [h, s]] of Object.entries(TOK)) { const v = figma.variables.createVariable(k, col, 'COLOR'); v.setValueForMode(MODE, hex(h)); v.scopes = SC[s]; V[k] = v; }
const P = (k, op) => { const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: hex(TOK[k][0]) }, 'color', V[k]); return op == null ? p : Object.assign({}, p, { opacity: op }); };
const RAW = h => ({ type: 'SOLID', color: hex(h) });

// ---------- Type ramp (Inter stands in for Segoe UI Variable; Ashgate already ships Inter + JetBrains Mono)
const TS = {};
for (const [n, f, st, sz, lh] of [['Caption', 'Inter', 'Regular', 12, 16], ['Caption Strong', 'Inter', 'Semi Bold', 12, 16], ['Body', 'Inter', 'Regular', 14, 20], ['Body Strong', 'Inter', 'Semi Bold', 14, 20], ['Subtitle', 'Inter', 'Semi Bold', 20, 28], ['Title', 'Inter', 'Semi Bold', 28, 36], ['Mono', 'JetBrains Mono', 'Regular', 12, 16]]) {
  const s = figma.createTextStyle(); s.name = 'Ashgate/' + n; s.fontName = { family: f, style: st }; s.fontSize = sz; s.lineHeight = { unit: 'PIXELS', value: lh }; TS[n] = s;
}

// ---------- Helpers
async function T(str, st = 'Body', c = 'text/primary', o = {}) {
  const t = figma.createText(); await t.setTextStyleIdAsync(TS[st].id); t.characters = str; t.fills = [P(c)]; t.name = o.name || str.slice(0, 28);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; if (o.trunc !== false) { t.maxLines = 1; t.textTruncation = 'ENDING'; } }
  return t;
}
function L(dir, o = {}, node) {
  const f = node || figma.createAutoLayout(dir);
  if (node) { f.layoutMode = dir; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; }
  f.fills = o.fill ? [P(o.fill)] : [];
  f.itemSpacing = o.gap || 0;
  const p = o.pad == null ? [0, 0, 0, 0] : typeof o.pad === 'number' ? [o.pad, o.pad, o.pad, o.pad] : o.pad.length === 2 ? [o.pad[0], o.pad[1], o.pad[0], o.pad[1]] : o.pad;
  f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
  if (o.r != null) f.cornerRadius = o.r;
  if (o.stroke) { f.strokes = [P(o.stroke)]; f.strokeWeight = 1; f.strokeAlign = 'INSIDE'; }
  f.counterAxisAlignItems = o.align || (dir === 'HORIZONTAL' ? 'CENTER' : 'MIN');
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.name) f.name = o.name;
  if (o.w || o.h) { f.resize(o.w || Math.max(f.width, 1), o.h || Math.max(f.height, 1)); if (!o.w) f.layoutSizingHorizontal = 'HUG'; if (!o.h) f.layoutSizingVertical = 'HUG'; }
  f.clipsContent = !!o.clip;
  return f;
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
const inInst = (n, root) => { for (let p = n.parent; p && p !== root; p = p.parent) if (p.type === 'INSTANCE') return true; return false; };

// ---------- Fluent System Icons (library component sets)
const IK = {
  home: 'c58bdf6a2db927f194f335c1743b47bd4d67e2ba', apps: '3d7c8af946afcb10b36b95c155540f180f1ee880', settings: '97c10dba784718dbd9e65e2cfc62759c4886ad4d',
  stop: 'fc1cf1f13f1d0a6813e6d58dd5a52a7cc9a341c9', search: '9bb582b407db890f8a730b68172d8b985d550ce3', add: 'cefc8d0fb2bf6cd73b8e33d7fc92948f43184c99',
  shield: '2de59d27da7f4bf501e1dbc8f499bb2242742bae', pulse: '651da6f96cd116fcc5d993a4f0664a29bacda2b6', filter: '481cfe7a2e4bc46a76bc868a9eb02221967a63d9',
  pause: '2b61589f928a549afc97f27862055628c4617390', delete: '870ca298dfc69721d10f5d82be8dec6d21508625', copy: 'e91268a615580b3c1d73c126c51ca07f4c221e7d',
  group: '05b76014816f64aab9aa049c33c004e6e2b05ee5', chevron: '6ed52f5088a206a6ad00c5090b181c8242320c97', up: '39762c5eab8b40fbbdea82bec540c2a64e2d65fe',
  down: '964622154acea200675485e581c83c82cec8f416', ok: '059f1da0068b5a327c097382db02f8c1c282ae98', warn: '355c5bf6901ff207c47ce134327df9f57772b457',
  err: '9888262daff1ee55266f036ad4548a98023d2f41', server: 'c6668b7d2faede3b8cf9751a2615c9c344e35a61', more: 'bc56af56b8e257085ecb164b2e376e585db753fa',
  nav: 'bff5f0e3c8cc0f6ec057f1896bd8a3ac7ffcc490', flash: 'd0328007499df64690acea4bbbb17e32da3d62ac', globe: '483154fc9223beceb2718724366fc158f184ef6c',
  dismiss: '330f04450bc69a40acafbe7ab01b0d73ed3892f4', check: 'fdaac1ff6a35d1c73b540a06deeb1224ac9ce42b', minus: '176904dfc8f2f1a297af273316c2e5bafdba064e',
  square: '43680735fb71aee0455563dc59c223b0a6dfe1fe', route: '13702ab50ffaa0ee7900a42e3c2453c2c57fefa7',
};
const IS = {};
await Promise.all(Object.entries(IK).map(async ([k, key]) => { IS[k] = await figma.importComponentSetByKeyAsync(key); }));
// spec: "name" | "name/16" | "name/20/Filled" | "chevron/16/Regular/Down"
function IC(spec) {
  const [n, s = '20', th = 'Regular', d] = spec.split('/'); const set = IS[n];
  const want = (d ? `Direction=${d}, ` : '') + `Size=${s}, Theme=${th}`;
  return set.children.find(c => c.name === want) || set.children.find(c => c.name.includes(`Size=20`) && c.name.includes(`Theme=${th}`) && (!d || c.name.includes(d))) || set.defaultVariant;
}
function tint(n, c) { for (const v of n.findAll(x => x.type === 'VECTOR' || x.type === 'BOOLEAN_OPERATION')) v.fills = [P(c)]; }
function I(spec, c = 'text/primary') { const i = IC(spec).createInstance(); const sz = +(spec.split('/')[1] || 20); if (Math.round(i.width) !== sz) i.resize(sz, sz); tint(i, c); i.name = 'icon'; return i; }

// ---------- Component helpers
const CF = L('HORIZONTAL', { name: 'Ashgate · Components', gap: 32, pad: 64, fill: 'bg/canvas', align: 'MIN', w: 2400 });
CF.layoutWrap = 'WRAP'; CF.counterAxisSpacing = 32;
function C(name, dir, o) { const c = figma.createComponent(); c.name = name; L(dir, o, c); CF.appendChild(c); return c; }
function VS(variants, name) { const s = figma.combineAsVariants(variants, CF); s.name = name; L('HORIZONTAL', { gap: 16, pad: 16, r: 8, stroke: 'stroke/control', align: 'MIN' }, s); s.dashPattern = [4, 4]; s.name = name; return s; }
function bind(owner, label, type, nodeName, def) {
  const vs = owner.type === 'COMPONENT_SET' ? owner.children : [owner];
  const first = vs[0].findAll(x => x.name === nodeName && !inInst(x, vs[0]))[0];
  const k = owner.addComponentProperty(label, type, type === 'TEXT' ? first.characters : type === 'BOOLEAN' ? true : def);
  const field = type === 'TEXT' ? 'characters' : type === 'BOOLEAN' ? 'visible' : 'mainComponent';
  for (const v of vs) for (const n of v.findAll(x => x.name === nodeName && !inInst(x, v))) n.componentPropertyReferences = Object.assign({}, n.componentPropertyReferences || {}, { [field]: k });
  return k;
}
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

// ---------- Components (Fluent controls, built locally)
// Button: Accent / Standard / Subtle
const btnV = [];
for (const s of ['Accent', 'Standard', 'Subtle']) {
  const fg = s === 'Accent' ? 'text/on-accent' : 'text/primary';
  const c = C('Style=' + s, 'HORIZONTAL', { gap: 8, pad: [6, 12], r: 4, h: 32, fill: s === 'Accent' ? 'accent/default' : s === 'Standard' ? 'bg/control' : null, stroke: s === 'Standard' ? 'stroke/control' : null });
  c.appendChild(I('add/16', fg)); c.appendChild(await T('Button', 'Body', fg, { name: 'label' })); btnV.push(c);
}
const Button = VS(btnV, 'Button');
bind(Button, 'Label', 'TEXT', 'label'); bind(Button, 'Icon', 'INSTANCE_SWAP', 'icon', IC('add/16').id); bind(Button, 'Has icon', 'BOOLEAN', 'icon');

const IconBtn = C('IconButton', 'HORIZONTAL', { w: 32, h: 32, r: 4, justify: 'CENTER' });
IconBtn.appendChild(I('more/16', 'text/secondary')); bind(IconBtn, 'Icon', 'INSTANCE_SWAP', 'icon', IC('more/16').id);

const KeyTip = C('KeyTip', 'HORIZONTAL', { pad: [1, 6], r: 4, fill: 'bg/card-strong', stroke: 'stroke/control' });
KeyTip.appendChild(await T('Ctrl+K', 'Mono', 'text/secondary', { name: 'key' })); bind(KeyTip, 'Key', 'TEXT', 'key');

const tagV = [];
for (const [tone, bg, fg] of [['Neutral', 'bg/selected', 'text/secondary'], ['Accent', 'bg/accent-subtle', 'accent/default'], ['Critical', 'bg/infobar-critical', 'status/critical'], ['Caution', 'bg/infobar-caution', 'status/caution'], ['Success', 'bg/infobar-success', 'status/success']]) {
  const c = C('Tone=' + tone, 'HORIZONTAL', { pad: [2, 8], r: 4, fill: bg }); c.appendChild(await T('Tag', 'Caption', fg, { name: 'label' })); tagV.push(c);
}
const Tag = VS(tagV, 'Tag'); bind(Tag, 'Label', 'TEXT', 'label');

const togV = [];
for (const on of [true, false]) {
  const c = C('State=' + (on ? 'On' : 'Off'), 'HORIZONTAL', { w: 40, h: 20, r: 10, pad: [0, 4], fill: on ? 'accent/default' : null, stroke: on ? null : 'text/secondary', justify: on ? 'MAX' : 'MIN' });
  const k = dot(on ? 'text/on-accent' : 'text/secondary', 12); k.name = 'knob'; c.appendChild(k); togV.push(c);
}
const Toggle = VS(togV, 'ToggleSwitch');

const chkV = [];
for (const on of [true, false]) {
  const c = C('State=' + (on ? 'Checked' : 'Unchecked'), 'HORIZONTAL', { gap: 8 });
  const box = L('HORIZONTAL', { w: 20, h: 20, r: 4, justify: 'CENTER', name: 'box', fill: on ? 'accent/default' : 'bg/control', stroke: on ? null : 'text/tertiary' });
  if (on) box.appendChild(I('check/16', 'text/on-accent'));
  c.appendChild(box); c.appendChild(await T('Checkbox', 'Body', 'text/primary', { name: 'label' })); chkV.push(c);
}
const Checkbox = VS(chkV, 'CheckBox'); bind(Checkbox, 'Label', 'TEXT', 'label'); bind(Checkbox, 'Has label', 'BOOLEAN', 'label');

const radV = [];
for (const on of [true, false]) {
  const c = C('State=' + (on ? 'Selected' : 'Rest'), 'HORIZONTAL', { gap: 8 });
  const ring = L('HORIZONTAL', { w: 20, h: 20, r: 10, justify: 'CENTER', name: 'ring', fill: on ? 'accent/default' : null, stroke: on ? null : 'text/tertiary' });
  if (on) ring.appendChild(dot('text/on-accent', 8));
  c.appendChild(ring); c.appendChild(await T('Option', 'Body', 'text/primary', { name: 'label' })); radV.push(c);
}
const Radio = VS(radV, 'RadioButton'); bind(Radio, 'Label', 'TEXT', 'label');

async function field(name, txt, txtColor, iconSpec, w, prop) {
  const c = C(name, 'HORIZONTAL', { gap: 8, pad: [6, 10], r: 4, h: 32, w, fill: 'bg/control', stroke: 'stroke/control' });
  add(c, await T(txt, 'Body', txtColor, { name: 'value' }), { fw: 1, trunc: 1 }); c.appendChild(I(iconSpec, 'text/secondary'));
  bind(c, prop, 'TEXT', 'value'); return c;
}
const SearchBox = await field('SearchBox', 'Search', 'text/tertiary', 'search/16', 240, 'Placeholder');
const ComboBox = await field('ComboBox', 'Value', 'text/primary', 'chevron/16/Regular/Down', 200, 'Value');

const navV = [];
for (const sel of [false, true]) {
  const c = C('State=' + (sel ? 'Selected' : 'Rest'), 'HORIZONTAL', { gap: 12, pad: [0, 8, 0, 0], h: 36, w: 264, r: 4, fill: sel ? 'bg/selected' : null });
  c.appendChild(rect(3, 16, sel ? 'accent/default' : null, 2, 'indicator'));
  c.appendChild(I('home/20', 'text/primary')); c.appendChild(await T('Item', 'Body', 'text/primary', { name: 'label' })); gap(c);
  const b = U(Tag, { Tone: 'Critical', Label: '1' }); b.name = 'badge'; c.appendChild(b); navV.push(c);
}
const NavItem = VS(navV, 'NavigationViewItem');
bind(NavItem, 'Label', 'TEXT', 'label'); bind(NavItem, 'Icon', 'INSTANCE_SWAP', 'icon', IC('home/20').id); bind(NavItem, 'Show label', 'BOOLEAN', 'label'); bind(NavItem, 'Badge', 'BOOLEAN', 'badge');

const ibV = [];
for (const [sev, bg, ic, fg] of [['Critical', 'bg/infobar-critical', 'err', 'status/critical'], ['Caution', 'bg/infobar-caution', 'warn', 'status/caution'], ['Success', 'bg/infobar-success', 'ok', 'status/success']]) {
  const c = C('Severity=' + sev, 'HORIZONTAL', { gap: 12, pad: [8, 8, 8, 16], r: 4, w: 640, fill: bg, stroke: 'stroke/card' });
  c.appendChild(I(ic + '/20/Filled', fg)); c.appendChild(await T('Title', 'Body Strong', 'text/primary', { name: 'title' }));
  add(c, await T('Message', 'Body', 'text/secondary', { name: 'message' }), { fw: 1, trunc: 1 });
  c.appendChild(await T('Action', 'Body', 'accent/default', { name: 'action' })); c.appendChild(U(IconBtn, { Icon: 'dismiss/16' })); ibV.push(c);
}
const InfoBar = VS(ibV, 'InfoBar'); bind(InfoBar, 'Title', 'TEXT', 'title'); bind(InfoBar, 'Message', 'TEXT', 'message'); bind(InfoBar, 'Action', 'TEXT', 'action');

const WinCtl = C('CaptionButtons', 'HORIZONTAL', {});
for (const s of ['minus/16', 'square/16', 'dismiss/16']) { const b = L('HORIZONTAL', { w: 46, h: 32, justify: 'CENTER', name: s.split('/')[0] }); b.appendChild(I(s, 'text/secondary')); WinCtl.appendChild(b); }

const Glyph = C('AppGlyph', 'HORIZONTAL', { w: 32, h: 32, r: 6, justify: 'CENTER', fill: 'accent/default' });
Glyph.appendChild(await T('A', 'Body Strong', 'text/primary', { name: 'initial' })); bind(Glyph, 'Initial', 'TEXT', 'initial');

// App card (concept A)
const Card = C('AppCard', 'VERTICAL', { gap: 8, pad: [12, 14], r: 8, w: 248, fill: 'bg/card', stroke: 'stroke/card' });
{
  const head = add(Card, L('HORIZONTAL', { gap: 12, name: 'head' }), { fw: 1 });
  const g = U(Glyph); g.name = 'glyph'; head.appendChild(g);
  const nc = add(head, L('VERTICAL', { name: 'title' }), { fw: 1 });
  add(nc, await T('App', 'Body Strong', 'text/primary', { name: 'name' }), { fw: 1, trunc: 1 });
  add(nc, await T('app.exe', 'Caption', 'text/tertiary', { name: 'path' }), { fw: 1, trunc: 1 });
  const tg = U(Toggle); tg.name = 'toggle'; head.appendChild(tg);
  const cb = U(ComboBox, { Value: 'aeza · VLESS' }); cb.name = 'route'; add(Card, cb, { fw: 1 });
  const tags = add(Card, L('HORIZONTAL', { gap: 4, name: 'tags' }), { fw: 1 }); tags.layoutWrap = 'WRAP'; tags.counterAxisSpacing = 4;
  for (const [n, tone, lab] of [['tag-children', 'Neutral', '+children'], ['tag-ks', 'Accent', 'Kill switch'], ['tag-tcp', 'Neutral', 'TCP only'], ['tag-err', 'Critical', 'Proxy error']]) { const t = U(Tag, { Tone: tone, Label: lab }); t.name = n; tags.appendChild(t); }
  const st = add(Card, L('HORIZONTAL', { gap: 8, name: 'stats' }), { fw: 1 });
  st.appendChild(await T('0 flows', 'Caption', 'text/secondary', { name: 'flows' })); gap(st);
  st.appendChild(await T('↓ 0  ↑ 0', 'Mono', 'text/secondary', { name: 'speed' }));
  bind(Card, 'Name', 'TEXT', 'name'); bind(Card, 'Path', 'TEXT', 'path'); bind(Card, 'Flows', 'TEXT', 'flows'); bind(Card, 'Speed', 'TEXT', 'speed');
  bind(Card, 'Children', 'BOOLEAN', 'tag-children'); bind(Card, 'Kill switch', 'BOOLEAN', 'tag-ks'); bind(Card, 'TCP only', 'BOOLEAN', 'tag-tcp'); bind(Card, 'Error', 'BOOLEAN', 'tag-err');
}

// Rule list row (concept B)
const rowV = [];
for (const sel of [false, true]) {
  const c = C('State=' + (sel ? 'Selected' : 'Rest'), 'HORIZONTAL', { gap: 10, pad: [0, 12, 0, 0], h: 32, w: 368, r: 4, fill: sel ? 'bg/selected' : null });
  c.appendChild(rect(3, 16, sel ? 'accent/default' : null, 2, 'indicator')); c.appendChild(dot('status/success'));
  c.appendChild(await T('App', 'Body', 'text/primary', { name: 'name' })); c.appendChild(await T('route', 'Caption', 'text/tertiary', { name: 'route' })); gap(c);
  c.appendChild(await T('0', 'Mono', 'text/tertiary', { name: 'flows', w: 24, align: 'RIGHT' })); c.appendChild(await T('0', 'Mono', 'text/secondary', { name: 'down', w: 64, align: 'RIGHT' }));
  rowV.push(c);
}
const ListRow = VS(rowV, 'RuleListItem');
for (const [p, n] of [['Name', 'name'], ['Route', 'route'], ['Flows', 'flows'], ['Down', 'down']]) bind(ListRow, p, 'TEXT', n);

// Connection log row (concept B)
const LogRow = C('LogRow', 'HORIZONTAL', { gap: 16, pad: [0, 16], h: 26, w: 1000 });
for (const [n, w, al] of [['time', 64], ['proto', 40], ['dest', 0], ['via', 56], ['status', 48], ['bytes', 64, 'RIGHT']]) {
  const t = await T(n, 'Mono', n === 'dest' ? 'text/primary' : 'text/secondary', { name: n, w: w || undefined, align: al });
  if (w) LogRow.appendChild(t); else add(LogRow, t, { fw: 1, trunc: 1 });
}
for (const n of ['Time', 'Proto', 'Dest', 'Via', 'Status', 'Bytes']) bind(LogRow, n, 'TEXT', n.toLowerCase());

// DataGrid row (concept C)
const COLS = [['check', 36], ['idx', 32], ['name', 170], ['match', 200], ['route', 124], ['group', 110], ['flags', 116], ['flows', 56, 'RIGHT'], ['down', 84, 'RIGHT'], ['up', 0, 'RIGHT']];
async function gridCells(row, header) {
  for (const [n, w, al] of COLS) {
    const cell = L('HORIZONTAL', { gap: 8, h: header ? 32 : 36, pad: [0, 8], name: 'col-' + n, justify: al === 'RIGHT' ? 'MAX' : 'MIN' });
    if (w) { cell.resize(w, cell.height); row.appendChild(cell); } else add(row, cell, { fw: 1 });
    if (header) { if (n !== 'check') add(cell, await T({ idx: '#', name: 'App', match: 'Match', route: 'Route', group: 'Group', flags: 'Flags', flows: 'Flows', down: '↓ Down', up: '↑ Up' }[n], 'Caption Strong', 'text/tertiary'), {}); continue; }
    if (n === 'check') { const c = U(Checkbox, { State: 'Unchecked', 'Has label': false }); c.name = 'check'; cell.appendChild(c); continue; }
    if (n === 'name') { const g = U(Glyph); g.name = 'glyph'; g.resize(20, 20); cell.appendChild(g); }
    if (n === 'route') cell.appendChild(dot('status/success'));
    const mono = ['idx', 'match', 'flows', 'down', 'up'].includes(n);
    add(cell, await T(n, mono ? 'Mono' : n === 'flags' ? 'Caption' : 'Body', ['name', 'route'].includes(n) ? 'text/primary' : n === 'idx' || n === 'flags' ? 'text/tertiary' : 'text/secondary', { name: n, align: al }), { fw: !al, trunc: !al });
  }
}
const gridV = [];
for (const sel of [false, true]) {
  const c = C('State=' + (sel ? 'Selected' : 'Rest'), 'HORIZONTAL', { w: 1052, h: 36, pad: [0, 8], fill: sel ? 'bg/accent-subtle' : null, stroke: 'stroke/divider' });
  sides(c, 0, 0, 1, 0); await gridCells(c, false);
  if (sel) setP(c.findOne(x => x.type === 'INSTANCE' && x.name === 'check'), { State: 'Checked' });
  gridV.push(c);
}
const GridRow = VS(gridV, 'DataGridRow');
for (const n of ['idx', 'name', 'match', 'route', 'group', 'flags', 'flows', 'down', 'up']) bind(GridRow, n[0].toUpperCase() + n.slice(1), 'TEXT', n);

// Command palette item (concept C)
const palV = [];
for (const sel of [false, true]) {
  const c = C('State=' + (sel ? 'Selected' : 'Rest'), 'HORIZONTAL', { gap: 12, pad: [0, 8, 0, 0], h: 36, w: 464, r: 4, fill: sel ? 'bg/selected' : null });
  c.appendChild(rect(3, 16, sel ? 'accent/default' : null, 2, 'indicator')); c.appendChild(I('route/16', 'text/secondary'));
  c.appendChild(await T('Command', 'Body', 'text/primary', { name: 'label' })); c.appendChild(await T('hint', 'Caption', 'text/tertiary', { name: 'hint' })); gap(c);
  const k = U(KeyTip, { Key: 'Enter' }); k.name = 'keytip'; c.appendChild(k); palV.push(c);
}
const PalItem = VS(palV, 'PaletteItem'); bind(PalItem, 'Label', 'TEXT', 'label'); bind(PalItem, 'Hint', 'TEXT', 'hint'); bind(PalItem, 'Icon', 'INSTANCE_SWAP', 'icon', IC('route/16').id);

const Spec = C('SpecCard', 'VERTICAL', { gap: 6, pad: 16, r: 8, w: 260, fill: 'bg/card', stroke: 'stroke/card' });
Spec.appendChild(await T('LABEL', 'Caption Strong', 'accent/default', { name: 'label' }));
add(Spec, await T('Text', 'Body', 'text/secondary', { name: 'text' }), { fw: 1, wrap: 1 });
bind(Spec, 'Label', 'TEXT', 'label'); bind(Spec, 'Text', 'TEXT', 'text');

// ---------- Screen helpers
function win(name) { const w = L('VERTICAL', { name, w: 1100, h: 720, r: 8, fill: 'bg/mica', stroke: 'stroke/flyout', clip: true }); w.effects = SHADOW(24, 56, 0.45); return w; }
async function titleBar(w) {
  const tb = add(w, L('HORIZONTAL', { name: 'TitleBar', h: 48, pad: [0, 0, 0, 16], gap: 12 }), { fw: 1 });
  tb.appendChild(I('shield/16/Filled', 'accent/default')); tb.appendChild(await T('Ashgate', 'Caption', 'text/secondary')); return tb;
}
function layer(body, topLeft, o = {}) { const c = add(body, L('VERTICAL', Object.assign({ name: 'Content', fill: 'bg/layer', stroke: 'stroke/card' }, o)), { fw: 1, fh: 1 }); if (topLeft) { c.topLeftRadius = 8; sides(c, 1, 0, 0, 1); } else sides(c, 1, 0, 0, 0); return c; }
async function hint(p, key, label) { const r = L('HORIZONTAL', { gap: 6 }); r.appendChild(U(KeyTip, { Key: key })); r.appendChild(await T(label, 'Caption', 'text/tertiary')); p.appendChild(r); }
function glyphColor(i, hx, initial) { const g = N(i, 'glyph', { Initial: initial }); if (g) g.fills = [RAW(hx)]; }
const vdiv = (p, h = 20) => p.appendChild(rect(1, h, 'stroke/control', 0, 'divider'));

const APPS = [
  { n: 'Telegram', p: 'Telegram.exe', r: 'aeza', rl: 'aeza · VLESS', g: 'Messengers', f: 3, d: '1.2 MB/s', u: '40 KB/s', ch: 1, ks: 1, c: '#2A8FD0', st: 'status/success' },
  { n: 'Discord', p: '*\\Discord\\app-*\\Discord.exe', r: 'aeza', rl: 'aeza · VLESS', g: 'Messengers', f: 1, d: '40 KB/s', u: '2 KB/s', ch: 1, tcp: 1, c: '#5865F2', st: 'status/success' },
  { n: 'Chrome', p: 'chrome.exe', r: 'nl1', rl: 'nl1 · SOCKS5', g: '—', f: 0, d: '—', u: '—', ch: 1, ks: 1, err: 'nl1: no response', c: '#C5473A', st: 'status/critical' },
  { n: 'Firefox', p: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', r: 'work', rl: 'work · HTTP', g: '—', f: 4, d: '320 KB/s', u: '12 KB/s', ch: 1, c: '#D9661F', st: 'status/success' },
  { n: 'Steam', p: 'steam.exe', r: 'Direct', rl: 'Direct', g: 'Games', f: 6, d: '8.4 MB/s', u: '90 KB/s', ch: 1, c: '#3D6A8F', st: 'status/neutral' },
  { n: 'qBittorrent', p: 'qbittorrent.exe', r: 'Block', rl: 'Block', g: '—', f: 0, d: '—', u: '—', c: '#5A8F29', st: 'text/disabled' },
  { n: 'Opera', p: 'opera.exe', r: 'aeza', rl: 'aeza · VLESS', g: '—', f: 0, d: '—', u: '—', miss: 1, c: '#B8323A', st: 'status/caution' },
  { n: 'Spotify', p: 'Spotify.exe', r: 'off', rl: 'Direct', g: '—', f: 0, d: '—', u: '—', off: 1, c: '#1E9E4C', st: 'text/disabled' },
];
const flagText = a => a.miss ? 'exe not found' : a.off ? 'disabled' : [a.ch && 'children', a.ks && 'kill switch', a.tcp && 'TCP only'].filter(Boolean).join(' · ') || '—';

// ---------- Concept A · Fluent Classic
async function conceptA() {
  const w = win('Window · Concept A'); const tb = await titleBar(w); gap(tb);
  const pill = L('HORIZONTAL', { gap: 6, pad: [4, 10], r: 12, fill: 'bg/infobar-success' }); pill.appendChild(dot('status/success')); pill.appendChild(await T('Capturing · 14 flows', 'Caption', 'status/success')); tb.appendChild(pill);
  tb.appendChild(U(WinCtl));
  const body = add(w, L('HORIZONTAL', { name: 'Body', align: 'MIN' }), { fw: 1, fh: 1 });
  const nav = add(body, L('VERTICAL', { name: 'NavigationView · Left (280)', w: 280, pad: [4, 8, 12, 8], gap: 4 }), { fh: 1 });
  nav.appendChild(U(IconBtn, { Icon: 'nav/16' }));
  for (const [lab, ic, sel, badge] of [['Home', 'home/20'], ['Proxies', 'server/20', 0, 1], ['Apps', 'apps/20', 1], ['Connections', 'pulse/20']]) add(nav, U(NavItem, { State: sel ? 'Selected' : 'Rest', Label: lab, Icon: ic, Badge: !!badge }), { fw: 1 });
  gap(nav);
  const card = add(nav, L('VERTICAL', { name: 'Status card', gap: 8, pad: 12, r: 8, fill: 'bg/card', stroke: 'stroke/card' }), { fw: 1 });
  const r1 = add(card, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); r1.appendChild(dot('status/success')); r1.appendChild(await T('Capturing', 'Body Strong')); gap(r1); r1.appendChild(U(KeyTip, { Key: 'F5' }));
  card.appendChild(await T('14 flows · ↓ 2.1 MB/s · ↑ 140 KB/s', 'Caption', 'text/secondary'));
  const sb = add(card, U(Button, { Style: 'Standard', Label: 'Stop capture', Icon: 'stop/16' }), { fw: 1 }); sb.primaryAxisAlignItems = 'CENTER';
  add(nav, U(NavItem, { Label: 'Settings', Icon: 'settings/20', Badge: false }), { fw: 1 });

  const c = layer(body, true, { pad: [20, 24, 14, 24], gap: 10 });
  c.appendChild(await T('Apps', 'Title'));
  const cmd = add(c, L('HORIZONTAL', { name: 'CommandBar', gap: 4 }), { fw: 1 });
  cmd.appendChild(U(Button, { Style: 'Accent', Label: 'Add app', Icon: 'add/16' })); cmd.appendChild(U(Button, { Style: 'Subtle', Label: 'Group', Icon: 'group/16' }));
  cmd.appendChild(U(Button, { Style: 'Subtle', Label: 'Test proxies', Icon: 'flash/16' })); vdiv(cmd); cmd.appendChild(U(Button, { Style: 'Subtle', Label: 'Filter', Icon: 'filter/16' }));
  gap(cmd); const s = U(SearchBox, { Placeholder: 'Search apps' }); s.resize(200, 32); cmd.appendChild(s); cmd.appendChild(U(IconBtn, { Icon: 'more/16' }));
  add(c, U(InfoBar, { Severity: 'Critical', Title: 'nl1 isn’t responding', Message: 'Chrome is held by the kill switch until nl1 is back or its route changes.', Action: 'Open proxy' }), { fw: 1 });
  const sec = L('HORIZONTAL', { gap: 8 }); sec.appendChild(I('chevron/16/Regular/Down', 'text/secondary')); sec.appendChild(await T('Active', 'Body Strong')); sec.appendChild(await T('6', 'Caption', 'text/tertiary')); c.appendChild(sec);
  const grid = add(c, L('HORIZONTAL', { name: 'Cards (wrap)', gap: 12, align: 'MIN' }), { fw: 1 }); grid.layoutWrap = 'WRAP'; grid.counterAxisSpacing = 12;
  for (const a of APPS.slice(0, 6)) {
    const i = U(Card, { Name: a.n, Path: a.p, Flows: a.f === 1 ? '1 flow' : a.f + ' flows', Speed: a.r === 'Block' ? 'dropped' : a.err ? 'held' : `↓ ${a.d}  ↑ ${a.u}`, Children: !!a.ch, 'Kill switch': !!a.ks, 'TCP only': !!a.tcp, Error: !!a.err });
    glyphColor(i, a.c, a.n[0]); N(i, 'route', { Value: a.rl }); if (a.err) N(i, 'tag-err', { Label: a.err }); grid.appendChild(i);
  }
  const sec2 = L('HORIZONTAL', { gap: 8 }); sec2.appendChild(I('chevron/16/Regular/Right', 'text/secondary')); sec2.appendChild(await T('Disabled', 'Body Strong')); sec2.appendChild(await T('2', 'Caption', 'text/tertiary')); c.appendChild(sec2);
  gap(c);
  const keys = add(c, L('HORIZONTAL', { name: 'Shortcut legend', gap: 16 }), { fw: 1 });
  for (const [k, l] of [['Ctrl+N', 'Add app'], ['Space', 'Toggle'], ['Alt+↑↓', 'Reorder'], ['F2', 'Edit path'], ['Del', 'Remove (undo)'], ['Ctrl+1…5', 'Pages']]) await hint(keys, k, l);
  return w;
}

// ---------- Concept B · Split Console
async function conceptB() {
  const w = win('Window · Concept B'); const tb = await titleBar(w);
  vdiv(tb, 16); tb.appendChild(dot('status/success')); tb.appendChild(await T('Capturing', 'Body Strong')); tb.appendChild(await T('14 flows · ↓ 2.1 MB/s · ↑ 140 KB/s', 'Caption', 'text/secondary'));
  gap(tb); tb.appendChild(U(Button, { Style: 'Standard', Label: 'Stop', Icon: 'stop/16' })); tb.appendChild(U(KeyTip, { Key: 'F5' })); tb.appendChild(U(WinCtl));
  const body = add(w, L('HORIZONTAL', { name: 'Body', align: 'MIN' }), { fw: 1, fh: 1 });
  const rail = add(body, L('VERTICAL', { name: 'NavigationView · LeftCompact (48)', w: 48, pad: [4, 4, 12, 4], gap: 4, align: 'CENTER' }), { fh: 1 });
  const railItem = (ic, sel) => { const i = U(NavItem, { State: sel ? 'Selected' : 'Rest', Icon: ic, 'Show label': false, Badge: false }); i.resize(40, 36); rail.appendChild(i); };
  railItem('home/20'); railItem('server/20'); railItem('apps/20', 1); railItem('pulse/20'); gap(rail); railItem('settings/20');
  const c = layer(body, true);
  const top = add(c, L('HORIZONTAL', { name: 'List / Details', align: 'MIN' }), { fw: 1, fh: 1 });
  const list = add(top, L('VERTICAL', { name: 'Master list', w: 392, pad: [16, 12, 8, 12], gap: 8 }), { fh: 1 });
  const lh = add(list, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); lh.appendChild(await T('Apps', 'Subtitle')); lh.appendChild(await T('8 rules · first match wins', 'Caption', 'text/tertiary'));
  const lc = add(list, L('HORIZONTAL', { name: 'CommandBar · compact', gap: 2 }), { fw: 1 });
  for (const ic of ['add/16', 'group/16', 'up/16', 'down/16', 'delete/16']) lc.appendChild(U(IconBtn, { Icon: ic }));
  gap(lc); const fs = U(SearchBox, { Placeholder: 'Filter  Ctrl+F' }); fs.resize(150, 32); lc.appendChild(fs);
  const gh = add(list, L('HORIZONTAL', { name: 'Group header', gap: 8, h: 32, pad: [0, 4, 0, 8] }), { fw: 1 });
  gh.appendChild(I('chevron/16/Regular/Down', 'text/secondary')); gh.appendChild(I('group/16', 'text/secondary')); gh.appendChild(await T('Messengers', 'Body Strong')); gh.appendChild(await T('via aeza', 'Caption', 'text/tertiary')); gap(gh); gh.appendChild(U(Toggle));
  APPS.forEach((a, x) => {
    const i = U(ListRow, { State: x === 0 ? 'Selected' : 'Rest', Name: a.n, Route: a.miss ? 'exe not found' : a.off ? 'disabled' : a.err ? 'nl1 · no response' : a.r, Flows: a.f ? String(a.f) : '—', Down: a.f ? a.d.replace(' MB/s', 'M').replace(' KB/s', 'K') : '—' });
    add(list, i, { fw: 1 });
    i.findOne(n => n.name === 'status').fills = [P(a.st)];
    if (a.g === 'Messengers') i.paddingLeft = 20; // grouped rows sit under the group header
    if (a.off) i.findOne(n => n.name === 'name').fills = [P('text/disabled')];
  });
  add(top, rect(1, 10, 'stroke/divider', 0, 'divider'), { fh: 1 });
  const det = add(top, L('VERTICAL', { name: 'Details pane', pad: [18, 24, 12, 24], gap: 14 }), { fw: 1, fh: 1 });
  const dh = add(det, L('HORIZONTAL', { gap: 12 }), { fw: 1 });
  const g = U(Glyph, { Initial: 'T' }); g.fills = [RAW('#2A8FD0')]; g.resize(40, 40); dh.appendChild(g);
  const dt = add(dh, L('VERTICAL', {}), { fw: 1 }); dt.appendChild(await T('Telegram', 'Subtitle'));
  add(dt, await T('C:\\Users\\alex\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe', 'Caption', 'text/tertiary'), { fw: 1, trunc: 1 });
  dh.appendChild(U(IconBtn, { Icon: 'copy/16' })); dh.appendChild(U(Toggle));
  const rs = add(det, L('VERTICAL', { gap: 8, name: 'Route' }), { fw: 1 }); rs.appendChild(await T('Route', 'Caption Strong', 'text/secondary'));
  const rr = L('HORIZONTAL', { gap: 24 }); rr.appendChild(U(Radio, { State: 'Selected', Label: 'Proxy' })); rr.appendChild(U(Radio, { State: 'Rest', Label: 'Direct' })); rr.appendChild(U(Radio, { State: 'Rest', Label: 'Block' })); rs.appendChild(rr);
  add(rs, U(ComboBox, { Value: 'aeza · VLESS · REALITY · xhttp · 42 ms' }), { fw: 1 });
  const os = add(det, L('VERTICAL', { gap: 8, name: 'Rule options' }), { fw: 1 }); os.appendChild(await T('Rule options', 'Caption Strong', 'text/secondary'));
  for (const [st, lab] of [['Checked', 'Apply to child processes'], ['Checked', 'Kill switch — never go direct'], ['Unchecked', 'TCP only — drop UDP / QUIC']]) os.appendChild(U(Checkbox, { State: st, Label: lab }));
  const tr = add(det, L('VERTICAL', { gap: 8, pad: 12, r: 8, fill: 'bg/card', stroke: 'stroke/card', name: 'Live traffic' }), { fw: 1 });
  const th = add(tr, L('HORIZONTAL', { gap: 8 }), { fw: 1 }); th.appendChild(await T('Live traffic · 60 s', 'Caption Strong', 'text/secondary')); gap(th); th.appendChild(await T('3 flows · ↓ 1.2 MB/s · ↑ 40 KB/s', 'Mono', 'text/secondary'));
  const sp = add(tr, L('HORIZONTAL', { gap: 3, h: 36, align: 'MAX', name: 'Sparkline' }), { fw: 1 });
  [6, 9, 14, 12, 20, 26, 22, 30, 34, 28, 18, 24, 31, 36, 29, 22, 16, 20, 27, 33, 30, 24, 19, 14, 22, 28, 32, 26, 21, 18, 25, 30, 34, 29, 23].forEach(h => sp.appendChild(rect(6, h, 'accent/default', 1, 'bar')));
  const sh = add(det, L('HORIZONTAL', { gap: 14, name: 'Shortcuts' }), { fw: 1 }); sh.layoutWrap = 'WRAP'; sh.counterAxisSpacing = 6;
  for (const [k, l] of [['Space', 'Toggle'], ['P D B', 'Route'], ['1–9', 'Proxy'], ['Ctrl+T', 'Test'], ['Tab', 'Next pane']]) await hint(sh, k, l);
  // Docked connections panel
  const log = add(c, L('VERTICAL', { name: 'Connections · docked (Ctrl+J)', h: 196, fill: 'bg/mica', stroke: 'stroke/card' }), { fw: 1 }); sides(log, 1, 0, 0, 0);
  const lgh = add(log, L('HORIZONTAL', { gap: 8, h: 40, pad: [0, 8, 0, 16] }), { fw: 1 });
  lgh.appendChild(I('pulse/16', 'text/secondary')); lgh.appendChild(await T('Connections', 'Body Strong')); lgh.appendChild(U(Tag, { Tone: 'Accent', Label: 'Telegram' }));
  const seg = L('HORIZONTAL', { r: 4, stroke: 'stroke/control', pad: 2, gap: 2, name: 'Segmented' });
  for (const [l, on] of [['All', 1], ['TCP'], ['UDP']]) { const b = L('HORIZONTAL', { pad: [2, 10], r: 3, fill: on ? 'bg/selected' : null }); b.appendChild(await T(l, 'Caption', on ? 'text/primary' : 'text/secondary')); seg.appendChild(b); }
  lgh.appendChild(seg); lgh.appendChild(U(Checkbox, { State: 'Unchecked', Label: 'Errors only' })); gap(lgh);
  lgh.appendChild(U(KeyTip, { Key: 'Ctrl+J' })); for (const ic of ['pause/16', 'delete/16', 'chevron/16/Regular/Down']) lgh.appendChild(U(IconBtn, { Icon: ic }));
  const hdr = add(log, U(LogRow, { Time: 'TIME', Proto: 'PROTO', Dest: 'DESTINATION', Via: 'VIA', Status: 'STATUS', Bytes: 'BYTES' }), { fw: 1 });
  hdr.findAll(n => n.type === 'TEXT').forEach(t => { t.fills = [P('text/tertiary')]; });
  for (const [t, p, d, v, s, b, bad] of [['12:01:03', 'TCP', '149.154.167.51:443', 'aeza', 'OK', '12.4 KB'], ['12:01:03', 'TCP', '149.154.167.91:443', 'aeza', 'OK', '3.1 KB'], ['12:01:04', 'UDP', '91.108.56.130:443 — REALITY: handshake failed. Check public key, short id and SNI', 'aeza', 'ERROR', '—', 1], ['12:01:05', 'DNS', '1.1.1.1:53', 'aeza', 'OK', '0.2 KB'], ['12:01:06', 'TCP', '149.154.175.50:443', 'aeza', 'OK', '48.0 KB']]) {
    const r = add(log, U(LogRow, { Time: t, Proto: p, Dest: d, Via: v, Status: s, Bytes: b }), { fw: 1 });
    if (bad) { r.fills = [P('bg/infobar-critical', 0.6)]; ['dest', 'status'].forEach(n => { r.findOne(x => x.name === n).fills = [P('status/critical')]; }); }
  }
  return w;
}

// ---------- Concept C · Command Grid
async function conceptC() {
  const w = win('Window · Concept C'); const tb = await titleBar(w); gap(tb);
  const pal = U(SearchBox, { Placeholder: 'Search commands, apps, proxies…' }); pal.resize(340, 32); tb.appendChild(pal); tb.appendChild(U(KeyTip, { Key: 'Ctrl+K' })); gap(tb);
  tb.appendChild(dot('status/success')); tb.appendChild(await T('Capture', 'Caption', 'text/secondary')); tb.appendChild(U(Toggle)); tb.appendChild(U(WinCtl));
  const tn = add(w, L('HORIZONTAL', { name: 'NavigationView · Top', h: 44, pad: [0, 16], gap: 4, align: 'MAX' }), { fw: 1 });
  for (const [l, sel] of [['Home'], ['Proxies'], ['Apps', 1], ['Connections'], ['Settings']]) {
    const it = L('VERTICAL', { gap: 6, pad: [0, 12, 0, 12], align: 'CENTER', name: 'TopNavItem' }); it.appendChild(await T(l, sel ? 'Body Strong' : 'Body', sel ? 'text/primary' : 'text/secondary'));
    it.appendChild(rect(16, 3, sel ? 'accent/default' : null, 2, 'indicator')); tn.appendChild(it);
  }
  gap(tn); const nh = L('HORIZONTAL', { pad: [0, 0, 12, 0] }); nh.appendChild(await T('Ctrl+1…5', 'Caption', 'text/tertiary')); tn.appendChild(nh);
  const c = add(w, L('VERTICAL', { name: 'Content', fill: 'bg/layer', stroke: 'stroke/card', pad: [16, 24], gap: 12 }), { fw: 1, fh: 1 }); sides(c, 1, 0, 0, 0);
  const hr = add(c, L('HORIZONTAL', { gap: 8, name: 'Page header + CommandBar' }), { fw: 1 });
  hr.appendChild(await T('Apps', 'Subtitle')); hr.appendChild(await T('8 rules · 2 groups · first match wins', 'Caption', 'text/tertiary')); gap(hr);
  const fb = U(SearchBox, { Placeholder: 'Filter rules' }); fb.resize(200, 32); hr.appendChild(fb);
  hr.appendChild(U(Button, { Style: 'Standard', Label: 'Columns', Icon: 'filter/16' })); hr.appendChild(U(Button, { Style: 'Accent', Label: 'Add app', Icon: 'add/16' })); hr.appendChild(U(KeyTip, { Key: 'Ctrl+N' }));
  const grid = add(c, L('VERTICAL', { name: 'DataGrid', r: 8, fill: 'bg/card', stroke: 'stroke/card', clip: true }), { fw: 1 });
  const head = add(grid, L('HORIZONTAL', { name: 'Header', h: 32, pad: [0, 8], fill: 'bg/card-strong', stroke: 'stroke/divider' }), { fw: 1 }); sides(head, 0, 0, 1, 0); await gridCells(head, true);
  APPS.forEach((a, x) => {
    const i = add(grid, U(GridRow, { State: x === 1 || x === 2 ? 'Selected' : 'Rest', Idx: String(x + 1), Name: a.n, Match: a.p, Route: a.r === 'off' ? 'Direct' : a.r, Group: a.g, Flags: flagText(a), Flows: a.f ? String(a.f) : '—', Down: a.d, Up: a.u }), { fw: 1 });
    glyphColor(i, a.c, a.n[0]); i.findOne(n => n.name === 'status').fills = [P(a.st)];
    if (a.miss) i.findOne(n => n.name === 'flags').fills = [P('status/caution')];
    if (a.off) i.findOne(n => n.name === 'name').fills = [P('text/disabled')];
  });
  gap(c);
  const bw = add(c, L('HORIZONTAL', { justify: 'CENTER', name: 'Bulk bar row' }), { fw: 1 });
  const bar = L('HORIZONTAL', { name: 'CommandBar · bulk (2 selected)', gap: 8, pad: [8, 8, 8, 16], r: 8, fill: 'bg/flyout', stroke: 'stroke/flyout' }); bar.effects = SHADOW(8, 24, 0.35); bw.appendChild(bar);
  bar.appendChild(await T('2 selected', 'Body Strong')); vdiv(bar); bar.appendChild(await T('Route', 'Caption', 'text/secondary'));
  const rc = U(ComboBox, { Value: 'aeza · VLESS' }); rc.resize(160, 32); bar.appendChild(rc);
  bar.appendChild(U(Button, { Style: 'Subtle', Label: 'Group…', Icon: 'group/16' })); bar.appendChild(U(Button, { Style: 'Subtle', Label: 'Disable', Icon: 'pause/16' })); bar.appendChild(U(Button, { Style: 'Subtle', Label: 'Delete', Icon: 'delete/16' }));
  vdiv(bar); await hint(bar, 'Esc', 'Clear');
  return w;
}
async function palette() {
  const f = L('VERTICAL', { name: 'Flyout · Command palette (Ctrl+K open)', gap: 4, pad: 8, r: 8, w: 480, fill: 'bg/flyout', stroke: 'stroke/flyout' }); f.effects = SHADOW(16, 40, 0.45);
  const inp = add(f, L('HORIZONTAL', { gap: 8, h: 36, pad: [0, 8, 0, 12], r: 4, fill: 'bg/control', stroke: 'accent/default' }), { fw: 1 }); sides(inp, 0, 0, 2, 0);
  inp.appendChild(I('search/16', 'text/secondary')); inp.appendChild(await T('route disc', 'Body')); inp.appendChild(rect(1, 16, 'accent/default', 0, 'caret')); gap(inp); inp.appendChild(U(KeyTip, { Key: 'Esc' }));
  const lab = L('HORIZONTAL', { pad: [8, 12, 4, 12] }); lab.appendChild(await T('Commands', 'Caption Strong', 'text/tertiary')); f.appendChild(lab);
  for (const [ic, l, h, k, sel] of [['route/16', 'Route Discord → nl1', 'Apps', 'Enter', 1], ['route/16', 'Route selected (2) → aeza', 'Bulk', 'P'], ['flash/16', 'Test all proxies', 'Proxies', 'Ctrl+T'], ['pulse/16', 'Show Discord connections', 'Connections', 'Ctrl+J'], ['shield/16', 'Kill switch for Discord', 'Rule option', 'K']]) {
    const i = add(f, U(PalItem, { State: sel ? 'Selected' : 'Rest', Label: l, Hint: h, Icon: ic }), { fw: 1 }); N(i, 'keytip', { Key: k });
  }
  return f;
}

// ---------- Board: three concepts side by side
const board = L('VERTICAL', { name: 'Ashgate · Fluent UI Concepts', gap: 56, pad: 96, fill: 'bg/canvas' });
const bt = L('VERTICAL', { gap: 8 }); bt.appendChild(await T('Ashgate — Windows 11 Fluent concepts · dark', 'Title'));
bt.appendChild(await T('Per-app transparent proxy (WinDivert + SOCKS5 / HTTP / VLESS). Same data in every concept: rules, groups, proxies, ruleStats and connection events.', 'Body', 'text/secondary')); board.appendChild(bt);
const row = L('HORIZONTAL', { gap: 120, align: 'MIN', name: 'Concepts' }); board.appendChild(row);
const META = [
  ['A', 'Fluent Classic', 'A cleaned-up version of today’s window: left NavigationView, card-based Apps page, live status pinned in the pane.', 0, [
    ['NAVIGATION', 'Left NavigationView, 280 px → 48 px compact below 920 px. Start/Stop and live status card in the pane footer.'],
    ['MAIN AREA', 'CommandBar + InfoBar on top; app cards in a 3-column wrap grid, split into Active / Disabled. Standard density: 32 px controls.'],
    ['KEYBOARD', 'F5 / Shift+F5 start-stop · Ctrl+1…5 pages · Ctrl+N add · Space toggle · Alt+↑/↓ reorder · F2 edit path · Del with undo.'],
    ['WHY IT FITS', 'Most users route 3–10 apps and rarely edit them. Cards show route, flags and live traffic at a glance; lowest migration cost.']], conceptA],
  ['B', 'Split Console', 'List / details workspace with a docked connection log: select an app, change its route and watch its traffic without leaving the page.', 1, [
    ['NAVIGATION', 'LeftCompact rail (48 px, icons + tooltips). Capture status and Stop live in the title bar on every page.'],
    ['MAIN AREA', 'Dense 32 px rule list with group headers → details pane (route, rule options, live sparkline). Connections dock below, filtered to the selection.'],
    ['KEYBOARD', '↑/↓ select · Space toggle · P / D / B route · 1–9 pick proxy · Tab list → details → log · Ctrl+J log · Ctrl+T test proxy.'],
    ['WHY IT FITS', 'The core loop is pick app → set route → confirm traffic. All three happen on one screen, fed by ruleStats and per-process events.']], conceptB],
  ['C', 'Command Grid', 'Keyboard- and table-first console for power users managing dozens of rules and proxies.', 0, [
    ['NAVIGATION', 'Top NavigationView frees the full width for tables; a Ctrl+K command palette reaches every command, app, proxy and setting.'],
    ['MAIN AREA', 'Sortable DataGrid with inline edit (F2), multi-select and a floating bulk CommandBar. Compact density: 36 px rows.'],
    ['KEYBOARD', 'Ctrl+K palette · Shift+↑/↓ extend selection · Ctrl+Shift+↑/↓ reorder · Ctrl+D duplicate · Esc clear · paste vless:// to add a proxy.'],
    ['WHY IT FITS', 'Rules, proxies and events are flat records that map 1:1 to columns. Built for antidetect farms and admins with many rules.']], conceptC],
];
const out = {};
for (const [k, title, desc, rec, specs, build] of META) {
  const colm = L('VERTICAL', { name: `Concept ${k} · ${title}`, gap: 24, w: 1100 }); row.appendChild(colm);
  const h = add(colm, L('VERTICAL', { gap: 8 }), { fw: 1 });
  const tl = L('HORIZONTAL', { gap: 12 }); tl.appendChild(await T(`Concept ${k} · ${title}`, 'Title')); if (rec) tl.appendChild(U(Tag, { Tone: 'Accent', Label: 'Recommended' })); h.appendChild(tl);
  add(h, await T(desc, 'Body', 'text/secondary'), { fw: 1, wrap: 1 });
  const sr = add(colm, L('HORIZONTAL', { gap: 16, align: 'MIN', name: 'Specs' }), { fw: 1 });
  for (const [l, t] of specs) add(sr, U(Spec, { Label: l, Text: t }), { fw: 1 });
  const wnd = await build(); colm.appendChild(wnd); out[k] = wnd.id;
  if (k === 'C') { const pr = L('HORIZONTAL', { gap: 24, align: 'MIN', name: 'States' }); pr.appendChild(await palette()); const n = L('VERTICAL', { gap: 6 }); n.appendChild(await T('Command palette · open state', 'Body Strong')); n.appendChild(await T('Ctrl+K from anywhere. Fuzzy search over commands, apps, proxies and settings; every row shows its shortcut.', 'Caption', 'text/tertiary', { w: 360, trunc: false })); pr.appendChild(n); colm.appendChild(pr); }
}
board.x = 0; board.y = 0;
CF.x = 0; CF.y = board.height + 200;
return { boardId: board.id, componentsId: CF.id, windows: out, board: { w: Math.round(board.width), h: Math.round(board.height) }, components: CF.children.map(n => n.name), variables: Object.keys(V).length };
