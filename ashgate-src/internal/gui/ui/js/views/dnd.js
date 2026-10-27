// Drag and drop on pointer events (HTML5 DnD gives a blurry ghost and no
// control over motion). A drag lifts a copy of the card, opens a gap where
// it will land (neighbours glide aside), and on release the copy snaps into
// the gap. Esc or a drop outside the lanes flies it back.
//
// Sources: lane cards ([data-drag=card]) and dock chips ([data-drag=app]).
// Targets: lanes ([data-lane]).

import { el, flip, reduceMotion, EASE } from "../dom.js";
import { esc, appLabel } from "../format.js";
import { icon } from "../icons.js";
import { appIcon, laneName } from "./common.js";

const THRESHOLD = 5; // px before a press becomes a drag
const EDGE = 56; // autoscroll zone at the edges
const SNAP_MS = 220;

export function createDnd(ctx) {
  const { store, actions } = ctx;
  let s = null;
  let suppressUntil = 0;

  const api = {
    get active() { return !!(s && s.started); },
  };

  document.addEventListener("pointerdown", onDown);
  // A drag must not end in a click on what lies under the pointer.
  document.addEventListener("click", (e) => {
    if (performance.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  function onDown(e) {
    if (e.button !== 0 || s || e.pointerType === "touch" && e.isPrimary === false) return;
    const src = e.target.closest("[data-drag]");
    if (!src || src.closest(".drag-ghost")) return;
    if (src.dataset.drag === "card" && e.target.closest("[data-act], [data-member], button, input")) return;
    s = { src, kind: src.dataset.drag, id: src.dataset.key || "", path: src.dataset.path || "", pointer: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, raf: 0 };
    addEventListener("pointermove", onMove, { passive: false });
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
    addEventListener("keydown", onKey, true);
  }

  function detach() {
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onCancel);
    removeEventListener("keydown", onKey, true);
  }

  function onMove(e) {
    if (!s || e.pointerId !== s.pointer) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      if (Math.hypot(s.x - s.x0, s.y - s.y0) < THRESHOLD) return;
      if (!begin()) return;
    }
    e.preventDefault();
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  }

  function ghostForApp(src) {
    const n = el("div", "card fresh-card");
    const label = src.dataset.name || appLabel(src.dataset.path);
    n.innerHTML = `<span class="card-ic">${appIcon(store.backend, src.dataset.path)}</span><div class="card-main"><div class="card-name"><span class="nm">${esc(label)}</span></div><div class="card-sub"><span class="c-rest">Новое правило</span></div></div>`;
    return n;
  }

  function begin() {
    const wrap = document.querySelector(".lanes");
    if (!wrap) { cleanup(); return false; }
    const r = s.src.getBoundingClientRect();
    s.started = true;
    s.rect = r;
    s.wrap = wrap;
    const ghost = el("div", "drag-ghost");
    let inner;
    let width = r.width;
    if (s.kind === "card") {
      inner = s.src.cloneNode(true);
      inner.removeAttribute("data-key");
      inner.removeAttribute("tabindex");
      inner.classList.remove("sel");
      s.offX = s.x0 - r.left;
      s.offY = s.y0 - r.top;
    } else {
      inner = ghostForApp(s.src);
      const sample = wrap.querySelector(".lane-list");
      width = sample ? sample.clientWidth : 200;
      s.offX = 28;
      s.offY = 24;
    }
    inner.classList.add("drag-inner");
    ghost.appendChild(inner);
    s.tip = el("div", "drag-tip");
    ghost.appendChild(s.tip);
    // The ghost lives on <body>, outside its lane: carry the lane colour over.
    const fromLane = s.src.closest("[data-lane]");
    ghost.style.setProperty("--lane", fromLane ? getComputedStyle(fromLane).getPropertyValue("--lane") : "var(--accent)");
    ghost.style.width = width + "px";
    ghost.style.transform = `translate3d(${s.x - s.offX}px, ${s.y - s.offY}px, 0)`;
    document.body.appendChild(ghost);
    s.ghost = ghost;
    s.inner = inner;
    requestAnimationFrame(() => inner.classList.add("lifted"));
    if (s.kind === "card") {
      s.ph = s.src;
      s.origin = { parent: s.src.parentNode, next: s.src.nextElementSibling, lane: s.src.closest("[data-lane]") };
      s.ph.classList.add("placeholder");
    } else {
      s.ph = el("div", "card placeholder fresh");
      s.ph.style.height = r.height > 40 ? "" : "56px";
      s.src.classList.add("drag-src");
    }
    // Lane geometry is read once (and again only after an autoscroll), so a
    // frame never forces layout just to find the lane under the pointer.
    s.lanes = [...wrap.querySelectorAll("[data-lane]")].map((el) => ({ el, list: el.querySelector(".lane-list") }));
    s.rects = null;
    wrap.addEventListener("scroll", onWrapScroll, { passive: true });
    document.body.classList.add("is-dragging");
    return true;
  }

  // laneRects is invalidated only when the board scrolls sideways (see
  // autoscroll and the scroll listener); reading scrollLeft every frame would
  // itself force a layout.
  function laneRects() {
    if (!s.rects) s.rects = s.lanes.map((o) => ({ el: o.el, list: o.list, r: o.el.getBoundingClientRect(), lr: o.list.getBoundingClientRect() }));
    return s.rects;
  }
  function onWrapScroll() { if (s) s.rects = null; }

  function cardsIn(list) {
    return [...list.children].filter((c) => c.classList.contains("card") && c !== s.ph);
  }

  function frame() {
    if (!s || !s.started) return;
    s.raf = 0;
    // Reads first (cached geometry), writes after: no forced layout per frame.
    const hit = laneRects().find((o) => s.x >= o.r.left && s.x <= o.r.right && s.y >= o.r.top && s.y <= o.r.bottom);
    const lane = hit ? hit.el : null;
    s.ghost.style.transform = `translate3d(${s.x - s.offX}px, ${s.y - s.offY}px, 0)`;
    if (lane !== s.lane) {
      if (s.lane) s.lane.classList.remove("drop-target");
      s.lane = lane;
      if (lane) lane.classList.add("drop-target");
      s.ghost.classList.toggle("no-target", !lane);
      const name = lane ? laneName(lane.dataset.lane) : "";
      s.tip.innerHTML = lane ? `${icon("arrowRight", 12)}<span>${esc(lane.dataset.lane.startsWith("p:") ? "через " + name : name)}</span>` : `<span>Отпустите над полосой</span>`;
    }
    const scrolling = autoscroll(hit);
    if (hit) place(hit);
    if (scrolling) s.raf = requestAnimationFrame(frame);
  }

  // place opens the gap in the lane where the card would land. Positions come
  // from offsetTop, which ignores running transforms, so the gap does not
  // jitter while neighbours are still gliding.
  function place(hit) {
    const list = hit.list;
    const drop = list.querySelector(".dropzone");
    const y = s.y - hit.lr.top + list.scrollTop;
    let before = null;
    for (const c of cardsIn(list)) {
      if (y < c.offsetTop + c.offsetHeight / 2) { before = c; break; }
    }
    const anchor = before || drop;
    if (s.ph.parentNode === list && s.ph.nextElementSibling === anchor) return;
    const from = s.ph.parentNode;
    const nodes = () => [...list.children, ...(from && from !== list ? from.children : [])].filter((n) => n !== s.ph && (n.classList.contains("card") || n.classList.contains("dropzone")));
    flip(nodes, () => list.insertBefore(s.ph, anchor), { enter: false, duration: 200 });
  }

  function autoscroll(hit) {
    let moved = false;
    const wr = s.wrapRect || (s.wrapRect = s.wrap.getBoundingClientRect());
    const sx = s.x < wr.left + EDGE ? -1 : s.x > wr.right - EDGE ? 1 : 0;
    if (sx) {
      const before = s.wrap.scrollLeft;
      s.wrap.scrollLeft += sx * 12;
      if (s.wrap.scrollLeft !== before) { moved = true; s.rects = null; }
    }
    if (hit) {
      const lr = hit.lr;
      const sy = s.y < lr.top + EDGE * 0.6 ? -1 : s.y > lr.bottom - EDGE * 0.6 ? 1 : 0;
      if (sy) {
        const before = hit.list.scrollTop;
        hit.list.scrollTop += sy * 10;
        moved = moved || hit.list.scrollTop !== before;
      }
    }
    return moved;
  }

  function onKey(e) {
    if (e.key === "Escape" && s) {
      e.preventDefault();
      e.stopPropagation();
      if (s.started) { detach(); cancel(); } else cleanup();
    }
  }

  function onCancel(e) {
    if (!s || e.pointerId !== s.pointer) return;
    detach();
    if (s.started) cancel(); else cleanup();
  }

  function onUp(e) {
    if (!s || e.pointerId !== s.pointer) return;
    detach();
    if (!s.started) { cleanup(); return; }
    suppressUntil = performance.now() + 350;
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
    if (s.lane) drop(); else cancel();
  }

  function flyTo(rect, after) {
    const g = s.ghost;
    const done = () => { if (g.isConnected) g.remove(); after(); };
    if (reduceMotion()) { done(); return; }
    g.style.transition = `transform ${SNAP_MS}ms ${EASE}, opacity ${SNAP_MS}ms`;
    g.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    s.inner.classList.remove("lifted");
    s.tip.style.opacity = "0";
    setTimeout(done, SNAP_MS);
  }

  function drop() {
    const d = s;
    const to = d.lane.dataset.lane;
    const next = d.ph.nextElementSibling;
    const beforeId = next && next.classList.contains("card") ? next.dataset.key : null;
    flyTo(d.ph.getBoundingClientRect(), () => {
      const same = d.kind === "card" && d.origin.lane === d.lane && d.origin.next === next;
      finish(d);
      if (d.kind === "card") {
        if (!same) actions.moveCard(d.id, to, beforeId, { focus: true });
        else ctx.renderAll(true);
      } else {
        d.ph.remove();
        actions.addApp(d.path, to, beforeId);
      }
    });
  }

  function cancel() {
    const d = s;
    if (d.kind === "card") {
      flip(() => [...d.origin.parent.children, ...(d.ph.parentNode ? d.ph.parentNode.children : [])].filter((n) => n !== d.ph), () => d.origin.parent.insertBefore(d.ph, d.origin.next && d.origin.next.parentNode === d.origin.parent ? d.origin.next : d.origin.parent.querySelector(".dropzone")), { enter: false, duration: 200 });
      flyTo(d.ph.getBoundingClientRect(), () => { finish(d); ctx.renderAll(true); });
    } else {
      if (d.ph.parentNode) d.ph.remove();
      d.ghost.style.opacity = "0";
      flyTo(d.src.getBoundingClientRect(), () => { finish(d); ctx.renderAll(true); });
    }
  }

  function finish(d) {
    if (d.wrap) d.wrap.removeEventListener("scroll", onWrapScroll);
    if (d.lane) d.lane.classList.remove("drop-target");
    if (d.kind === "card") d.ph.classList.remove("placeholder");
    else d.src.classList.remove("drag-src");
    document.body.classList.remove("is-dragging");
    if (s === d) s = null;
  }

  function cleanup() {
    detach();
    if (s && s.ghost) s.ghost.remove();
    s = null;
    document.body.classList.remove("is-dragging");
  }

  return api;
}
