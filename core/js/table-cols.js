// Lazy part of <pk-table>: column resize and reorder (issue 1580). The table imports this on demand, only when `resizable` or `reorderable` is set, so a plain table pays nothing.
// The layout the user makes (a width per column key, an order of keys) lives here, not in the host's `columns`, and is laid over whatever `columns` holds (cols()), so a host that sets
// `columns` again keeps it. The host hears of each change through pk-column-resize / pk-column-reorder and may keep the result itself.

import { sheetFor } from './element.js'; import { mediaBelow } from './breakpoints.js';

const MIN = 48, MAX = 800, STEP = 10, DRAG = 5, HOLD = 400;
const STYLES = (':host(:not([sticky-header])) th[data-key]{position:relative}:is(th[data-reorder],[data-resize]):focus-visible{outline:var(--focus-ring);outline-offset:-2px}th[data-drop]{box-shadow:inset calc(var(--_s,1)*var(--_d,1)*2px) 0 0 var(--color-accent)}th[data-drop=after]{--_s:-1}:host(:dir(rtl)){--_d:-1}' +
    '[data-resize]{position:absolute;inset-block:0;inset-inline-end:-6px;inline-size:12px;z-index:1;cursor:col-resize;touch-action:none;background:linear-gradient(var(--color-border),var(--color-border)) center/2px 60% no-repeat}[data-resize]:hover{background-color:color-mix(in srgb,var(--color-accent) 25%,transparent)}th:last-child>[data-resize]{inset-inline-end:0}' +
    'table[data-sized]{table-layout:fixed;inline-size:0}table[data-sized] tr:first-child>th:not([data-key]){inline-size:var(--space-8)}table[data-sized] tbody td:not([aria-invalid],[data-editing]){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '@media (max-width:640px){[data-resize]{inset-inline-end:calc(var(--touch-target)/-2);inline-size:var(--touch-target)}:host([cards]) [data-resize]{display:none}}');
let sheet;

const st = t => t.$h ??= { w: {}, o: null, n: 0 };
const clamp = w => Math.max(MIN, Math.min(MAX, Math.round(w)));
const heads = t => [...t.part('head').querySelectorAll('tr:first-child > th')];
const keyed = t => heads(t).filter(th => th.dataset.key && th.offsetParent);
const rtl = n => getComputedStyle(n).direction === 'rtl';
const cardsPhone = t => t.hasAttribute('cards') && mediaBelow('phone').matches;
const name = (t, k) => t.list('columns').find(c => c.key === k)?.label ?? k;
const say = (t, text) => { const s = st(t); (s.live ??= t.shadowRoot.appendChild(Object.assign(document.createElement('div'), { className: 'sr', role: 'status' }))).textContent = text; };

// The columns the table works with: the host's, in the user's order, with the user's widths. The same array until either changes (the table asks for it once per cell).
export function cols(t, v) {
    const s = st(t);
    if (!s.o && !Object.keys(s.w).length) return v;
    if (s.c?.v === v && s.c.n === s.n) return s.c.out;
    const o = s.o ?? [], rank = c => { const i = o.indexOf(c.key); return i < 0 ? o.length : i; }, out = [...v].sort((a, b) => rank(a) - rank(b)).map(c => s.w[c.key] ? { ...c, width: s.w[c.key] } : c);
    return (s.c = { v, n: s.n, out }).out;
}

// The rendered widths of the visible columns, by key.
const sizes = t => Object.fromEntries(keyed(t).map(th => [th.dataset.key, Math.round(th.getBoundingClientRect().width)]));

// Every visible column has a width: the table is laid out fixed and is exactly as wide as the columns (data-sized: table-layout fixed at inline-size 0), so a column never stretches to fill the frame and widening one scrolls the frame sideways.
function fit(t, tb, ws) {
    const vis = keyed(t);
    if (!vis.length || !vis.every(th => ws[th.dataset.key] > 0)) return tb.removeAttribute('data-sized');
    tb.setAttribute('data-sized', ''); vis.forEach(th => th.style.inlineSize = `${clamp(ws[th.dataset.key])}px`);
}

export function after(t) {
    const s = st(t), root = t.shadowRoot, tb = t.part('table'), off = cardsPhone(t);
    sheet ??= sheetFor(STYLES);
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    if (!s.on) {
        s.on = 1;
        for (const [ev, fn] of Object.entries({ pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, keydown: key })) root.addEventListener(ev, e => fn(t, e));
        root.addEventListener('touchmove', e => { if (s.d?.on) e.preventDefault(); }, { passive: false });
        root.addEventListener('click', e => { if (s.nc) { e.stopPropagation(); e.preventDefault(); } }, true); // the click that ends a drag is not a sort
    }
    const ths = heads(t).filter(th => th.dataset.key), c = t.list('columns');
    if (t.resizable) fit(t, tb, Object.fromEntries(c.map(x => [x.key, x.width])));
    for (const th of ths) {
        if (t.reorderable && !off) { th.dataset.reorder = ''; if (!th.querySelector('button')) th.tabIndex = 0; }
        if (!t.resizable || off) continue;
        const g = document.createElement('span'), a = { 'data-resize': '', tabindex: 0, role: 'separator', 'aria-orientation': 'vertical', 'aria-label': `Resize ${name(t, th.dataset.key)}`, 'aria-valuenow': Math.round(th.getBoundingClientRect().width) };
        for (const k in a) g.setAttribute(k, a[k]);
        th.append(g);
    }
    if (s.focus) { const th = ths.find(x => x.dataset.key === s.focus.key); (s.focus.sel ? th?.querySelector(s.focus.sel) : th)?.focus(); s.focus = null; }
}

// A new width for a column, from the pointer or the keyboard: every visible column keeps the width it has now, so only this one changes.
function resize(t, th, w) {
    const s = st(t), key = th.dataset.key, ws = sizes(t); ws[key] = clamp(w);
    Object.assign(s.w, ws); s.n++;
    fit(t, t.part('table'), ws); // the DOM already follows (cells follow their header in the fixed layout), so no redraw: a key held down keeps its focus
    th.querySelector('[data-resize]')?.setAttribute('aria-valuenow', ws[key]);
    t.emit('pk-column-resize', { key, width: ws[key] });
    return ws[key];
}

// Move a column to the position `to` of the order (the host may refuse with preventDefault); true when it moved.
function reorder(t, key, to) {
    const s = st(t), c = t.list('columns'), from = c.findIndex(x => x.key === key);
    if (from < 0 || to < 0 || to >= c.length || to === from) return false;
    const next = c.map(x => x.key); next.splice(to, 0, next.splice(from, 1)[0]);
    if (!t.emit('pk-column-reorder', { key, from, to, order: next })) return false;
    s.o = next; s.n++; t.requestUpdate();
    return true;
}

function down(t, e) {
    const s = st(t), n = e.target;
    if (e.button || !n.closest) return;
    const g = n.closest('[data-resize]'), th = n.closest('th[data-key]');
    if (g && t.resizable) {
        e.preventDefault(); grab(t, g, e);
        const ws = sizes(t), k = th.dataset.key; fit(t, t.part('table'), ws);
        s.r = { k, th, x: e.clientX, w: ws[k], dir: rtl(th) ? -1 : 1 };
    } else if (th && t.reorderable && !cardsPhone(t)) {
        const d = s.d = { k: th.dataset.key, th, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch', hold: e.pointerType !== 'touch', on: false };
        if (d.touch) d.timer = setTimeout(() => { d.hold = true; }, HOLD); // a touch drag needs a long press, so a swipe along the header still scrolls the table
    }
}

// Keep following the pointer outside the header; a pointer the browser no longer knows (a synthetic one) is not captured.
function grab(t, n, e) { try { n.setPointerCapture(e.pointerId); } catch (err) { t.warnOnce('capture', 'pointer capture failed', err); } }

function move(t, e) {
    const s = st(t), r = s.r, d = s.d;
    if (r) { const w = clamp(r.w + (e.clientX - r.x) * r.dir); r.th.style.inlineSize = `${w}px`; r.now = w; return; }
    if (!d || e.pointerId !== d.id) return;
    if (!d.on) {
        const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG;
        if (d.touch && !d.hold) { if (far) { clearTimeout(d.timer); s.d = null; } return; }
        if (!far) return;
        d.on = true; grab(t, d.th, e);
    }
    const others = keyed(t).filter(th => th !== d.th), x = e.clientX, dir = rtl(d.th);
    const at = others.find(th => { const b = th.getBoundingClientRect(), mid = b.left + b.width / 2; return dir ? x > mid : x < mid; });
    for (const th of heads(t)) delete th.dataset.drop;
    const c = t.list('columns').map(k => k.key), to = at ? c.indexOf(at.dataset.key) : c.indexOf(others.at(-1)?.dataset.key) + 1;
    (at ?? others.at(-1))?.setAttribute('data-drop', at ? 'before' : 'after');
    d.to = to > c.indexOf(d.k) ? to - 1 : to;
}

function up(t, e) {
    const s = st(t), r = s.r, d = s.d;
    if (r) { s.r = null; if (r.now && r.now !== r.w) resize(t, r.th, r.now); else t.requestUpdate(); return; }
    if (!d) return;
    clearTimeout(d.timer); s.d = null;
    if (!d.on) return;
    for (const th of heads(t)) delete th.dataset.drop;
    s.nc = 1; setTimeout(() => { s.nc = 0; }, 0);
    if (e.type === 'pointerup') reorder(t, d.k, d.to);
}

function key(t, e) {
    const th = e.target.closest?.('th[data-key]'), dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!th || !dx || e.ctrlKey || e.metaKey) return;
    const s = st(t), k = th.dataset.key, dir = rtl(th) ? -1 : 1, grip = e.target.closest('[data-resize]');
    if (e.altKey && t.reorderable) {
        e.preventDefault();
        const c = t.list('columns'), to = c.findIndex(x => x.key === k) + dx * dir;
        if (reorder(t, k, to)) { s.focus = { key: k, sel: grip ? '[data-resize]' : e.target.closest('button') ? 'button' : null }; say(t, `${name(t, k)}, column ${to + 1} of ${c.length}`); }
    } else if (grip && t.resizable && !e.altKey) {
        e.preventDefault();
        resize(t, th, th.getBoundingClientRect().width + dx * dir * STEP * (e.shiftKey ? 4 : 1)); // aria-valuenow changes, which a screen reader reads on the focused separator
    }
}
