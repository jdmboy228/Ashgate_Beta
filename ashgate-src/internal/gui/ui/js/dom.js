// Small DOM toolkit: element creation, cached writes, keyed lists, FLIP
// animations and a number ticker. Writes are skipped when nothing changed,
// so a poll every second costs almost nothing and never steals a click.

// Fluent motion: decelerate for things arriving, standard for moves.
export const EASE = "cubic-bezier(0.1, 0.9, 0.2, 1)";
export const EASE_OUT = "cubic-bezier(0, 0, 0, 1)";

export function reduceMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

export function setText(n, text) {
  text = String(text ?? "");
  if (n && n.textContent !== text) n.textContent = text;
}

export function setHTML(n, html) {
  if (!n || n._html === html) return false;
  n.innerHTML = html;
  n._html = html;
  return true;
}

export function setClass(n, cls, on) {
  if (n && n.classList.contains(cls) !== !!on) n.classList.toggle(cls, !!on);
}

export function setAttr(n, name, value) {
  if (!n) return;
  if (value === null || value === undefined || value === false) { if (n.hasAttribute(name)) n.removeAttribute(name); return; }
  value = value === true ? "" : String(value);
  if (n.getAttribute(name) !== value) n.setAttribute(name, value);
}

// reconcile makes parent's children match items, in order, reusing elements
// by key. `pool` lets an element move between parents (a card changing
// lanes stays the same node, so FLIP can animate it across).
export function reconcile(parent, items, keyOf, create, update, pool, tail) {
  const local = pool || new Map();
  if (!pool) for (const c of parent.children) if (c.dataset && c.dataset.key) local.set(c.dataset.key, c);
  let at = parent.firstElementChild;
  const keep = new Set();
  for (const item of items) {
    const key = keyOf(item);
    let node = local.get(key);
    if (!node) { node = create(item); node.dataset.key = key; local.set(key, node); }
    update(node, item);
    keep.add(node);
    if (node !== at) parent.insertBefore(node, at || tail || null);
    else at = at.nextElementSibling;
  }
  for (const c of [...parent.children]) {
    if (c === tail || !c.dataset || !c.dataset.key || keep.has(c)) continue;
    c.remove();
    if (!pool) local.delete(c.dataset.key);
  }
  return keep;
}

// flip animates nodes from where they were before mutate() to where they
// are after it: moves glide, new nodes grow in.
export function flip(getNodes, mutate, opts) {
  opts = opts || {};
  if (reduceMotion()) { mutate(); return; }
  const before = new Map();
  for (const n of getNodes()) before.set(n, n.getBoundingClientRect());
  mutate();
  for (const n of getNodes()) {
    const a = before.get(n);
    if (!a) {
      if (opts.enter !== false && n.animate) n.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE_OUT });
      continue;
    }
    const b = n.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if (n.animate) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: opts.duration || 280, easing: EASE });
  }
}

// ticker eases numbers from the old value to the new one, so traffic
// counters glide between one-second polls instead of jumping. One shared
// animation frame drives every counter on screen.
export function createTicker() {
  const tweens = new Map();
  let raf = 0;
  function step(now) {
    raf = 0;
    for (const [n, t] of tweens) {
      const k = Math.min(1, (now - t.t0) / t.ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = t.from + (t.to - t.from) * e;
      n._shown = v;
      setText(n, t.fmt(v));
      if (k >= 1 || !n.isConnected) tweens.delete(n);
    }
    if (tweens.size) raf = requestAnimationFrame(step);
  }
  return {
    set(n, value, fmt, ms) {
      if (!n) return;
      value = Number(value) || 0;
      if (n._v === value && n._fmt === fmt) return;
      const first = n._v === undefined || n._fmt !== fmt;
      n._v = value;
      n._fmt = fmt;
      if (first || reduceMotion() || !n.isConnected) { n._shown = value; setText(n, fmt(value)); return; }
      tweens.set(n, { from: n._shown ?? value, to: value, t0: performance.now(), fmt, ms: ms || 700 });
      if (!raf) raf = requestAnimationFrame(step);
    },
  };
}

// trapFocus keeps Tab inside a dialog or sheet.
export function trapFocus(root, e) {
  if (e.key !== "Tab") return;
  const f = [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
