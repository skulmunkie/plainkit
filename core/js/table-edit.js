// Lazy part of <pk-table>: inline cell editing (issue 331, first step). The table imports this on demand, only when `editable` is set, so its own module stays inside
// its budget. The table owns what is drawn (shadow tree): this module marks the rendered body as an ARIA grid after every render, keeps one active cell (roving tabindex,
// arrow keys), and swaps the active cell's content for an editor while it is edited. The edit state lives here and is drawn again on each render, so a render never loses a draft.
// A commit raises the cancelable pk-cell-edit; unless the host cancels it the table then holds the new value in a copy of its rows (the host owns them after the event).

import { sheetFor } from './element.js'; import { rowAt } from './rowset.js';
import { keyStep, stepIndex } from './roving.js'; import V from './table-vw.js';

const STYLES = ('td[data-key][tabindex]{cursor:cell;user-select:none}td[data-key]:focus-visible{outline:var(--focus-ring);outline-offset:-2px}td[aria-selected="true"]{background:color-mix(in srgb,var(--color-accent) 10%,transparent)}td[aria-invalid="true"]{box-shadow:inset 0 0 0 2px var(--field-error)}td[data-editing]{padding:var(--space-1);position:relative}td[data-editing] :is(input,select){inline-size:0;min-inline-size:100%;font:inherit}[data-cell-error]{display:block;color:var(--field-error);font-size:var(--text-meta);text-align:start}td[data-editing] [data-cell-error]{position:absolute;inset-block-start:100%;inset-inline-start:0;z-index:1;inline-size:max-content;max-inline-size:min(16rem,80vw);padding:var(--space-1) var(--space-2);background:var(--color-bg);border-radius:var(--radius-sm);box-shadow:var(--shadow-card)}@media (max-width:640px){td[data-editing] :is(input,select){min-block-size:var(--touch-target);min-inline-size:max(100%,var(--touch-target));font-size:16px}}');
let sheet;

// The message a draft breaks, or '' when it is fine. Pure: `col` is the column definition ({ editor, required, min, max, maxLength }), `text` the draft as typed.
export function check(col, text) {
    const t = String(text ?? '').trim();
    if (col.required && !t) return 'Required';
    if (col.editor === 'number' && t) {
        const n = Number(t);
        if (Number.isNaN(n)) return 'Enter a number';
        if (col.min != null && n < col.min) return `At least ${col.min}`;
        if (col.max != null && n > col.max) return `At most ${col.max}`;
    }
    if (col.maxLength != null && String(text ?? '').length > col.maxLength) return `At most ${col.maxLength} characters`;
    return '';
}

// The value a draft becomes: a number column holds a number (or null when empty), the others the text as typed.
export const typed = (col, text) => col.editor === 'number' ? (String(text).trim() === '' ? null : Number(text)) : text;

const same = (a, b) => String(a ?? '') === String(b ?? '');
const key = (id, k) => `${id}:${k}`;
const st = t => t.$g ??= {};
const col = (t, k) => t.list('columns').find(c => c.key === k) ?? {};
const cells = t => [...t.part('body').querySelectorAll('tr[data-pk-context]')].map(tr => [...tr.querySelectorAll('td[data-key]')]);
const say = (t, text) => { const s = st(t); (s.live ??= t.shadowRoot.appendChild(Object.assign(document.createElement('div'), { className: 'sr', role: 'status' }))).textContent = text; };
const label = (t, id, k) => `${col(t, k).label ?? k}, row ${id}`;

// The cell's editor: the control the column asks for, holding the draft. It is drawn only while the cell is edited.
function editor(t, c, id, s) {
    const e = c.editor, i = document.createElement(e === 'select' ? 'select' : 'input'); i.dataset.cellEditor = ''; i.setAttribute('aria-label', label(t, id, c.key));
    if (e === 'select') for (const o of c.options ?? []) { const v = typeof o === 'object' ? o.value : o, op = document.createElement('option'); op.value = v; op.textContent = typeof o === 'object' ? (o.label ?? v) : o; i.append(op); }
    else { i.type = 'text'; if (e === 'number') i.inputMode = 'decimal'; }
    i.value = s.draft ?? '';
    return i;
}

// While a cell is edited, the columns keep the widths they had at rest (an editor's own intrinsic width must never reflow the grid); released once nothing is edited.
function lockWidths(t, tb, editing) {
    const ths = [...tb.querySelectorAll('thead th')];
    if (editing) {
        if (!tb.style.tableLayout) {
            const w = ths.map(th => th.getBoundingClientRect().width);
            const cg = tb.querySelector('colgroup') ?? tb.insertBefore(document.createElement('colgroup'), tb.firstElementChild);
            cg.replaceChildren(...w.map(px => { const c = document.createElement('col'); c.style.width = `${px}px`; return c; }));
            tb.style.tableLayout = 'fixed';
        }
    } else if (tb.style.tableLayout) { tb.style.tableLayout = ''; tb.querySelector('colgroup')?.remove(); }
}

// A windowed table draws only the rows near its viewport (table-vw.js). The active row and the edited row are drawn wherever they are, so focus and an open editor survive scrolling: the
// rows already drawn are kept, the missing ones built the way the table builds them, and the spacers between are drawn again for the gaps.
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const k in attrs) attrs[k] && e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); e.append(...kids); return e; };
function pin(t, ix) {
    const s = st(t), body = t.part('body'), have = new Map([...body.querySelectorAll('tr[data-pk-context]')].map(r => [ix.get(r.dataset.pkContext), r]));
    const miss = [s.a?.id, s.edit?.id].map(id => ix.get(id)).filter(i => i != null && !have.has(i));
    if (!miss.length || !have.size) return;
    const sel = t.chosen(), ids = t.ids(), rowH = t.$rowH || 32, out = []; let next = 0;
    for (const i of miss) have.set(i, V.tr(t, t.view[i], ids[i], sel, h));
    const gap = (to, place) => { const td = h('td', { colspan: t.part('foot').colSpan }); td.style.cssText = `padding:0;border:0;block-size:${(to - next) * rowH}px`; out.push(h('tr', { 'data-spacer': place }, td)); };
    for (const i of [...have.keys()].sort((x, y) => x - y)) { if (i > next) gap(i, next ? 'gap' : 'top'); out.push(have.get(i)); next = i + 1; }
    if (next < ix.size) gap(ix.size, 'bottom');
    body.replaceChildren(...out);
}

// After each render: grid roles and states on the body, the active cell's tab stop, the open editor and the error text.
export function after(t) {
    const root = t.shadowRoot, s = st(t), tb = t.part('table');
    if (!t.editable) { tb.removeAttribute('role'); return; }
    sheet ??= sheetFor(STYLES);
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    if (!s.on) { s.on = 1; root.addEventListener('keydown', e => keydown(t, e)); root.addEventListener('click', e => click(t, e)); root.addEventListener('change', e => change(t, e)); root.addEventListener('input', e => { if (s.edit && e.target.dataset.cellEditor !== undefined) s.edit.draft = e.target.value; }); root.addEventListener('focusout', e => blur(t, e)); root.addEventListener('paste', e => paste(t, e)); root.addEventListener('copy', e => copy(t, e)); t.part('scroll').addEventListener('scroll', () => { if (t.part('body').contains(root.activeElement)) s.focus ||= 'keep'; }, { passive: true }); }
    tb.setAttribute('role', 'grid');
    lockWidths(t, tb, !!s.edit);
    // A windowed grid does not hold every row: say how many there are and which one each drawn row is (the header rows come first).
    const head = t.part('head').children.length, ix = new Map(t.ids().map((x, i) => [x, i]));
    if (t.$virtual) {
        pin(t, ix);
        tb.setAttribute('aria-rowcount', ix.size + head);
        [...t.part('head').children].forEach((r, i) => r.setAttribute('aria-rowindex', i + 1));
        for (const r of t.part('body').children) if (r.dataset.spacer) r.setAttribute('aria-hidden', 'true'); else r.setAttribute('aria-rowindex', ix.get(r.dataset.pkContext) + 1 + head);
    } else tb.removeAttribute('aria-rowcount');
    const rows = cells(t), ids = t.ids(), errors = { ...s.paste, ...t.cellErrors };
    // The active cell is kept by id, even when its row is not drawn (a windowed table, #1474); it falls back to the first drawn cell only when its row left the view.
    if (!(s.a && ids.includes(s.a.id) && t.list('columns').some(c => c.key === s.a.key))) s.a = rows[0]?.[0] ? at(rows[0][0]) : null;
    const rg = range(t), many = rg && (rg.y1 > rg.y0 || rg.x1 > rg.x0), kix = new Map(rg?.keys.map((x, i) => [x, i]));
    if (many) tb.setAttribute('aria-multiselectable', 'true'); else tb.removeAttribute('aria-multiselectable');
    for (const line of rows) for (const td of line) {
        const id = td.closest('tr').dataset.pkContext, k = td.dataset.key, c = col(t, k), on = s.a?.id === id && s.a?.key === k, ed = s.edit?.id === id && s.edit?.key === k;
        const yy = ix.get(id), xx = kix.get(k), inside = many && yy >= rg.y0 && yy <= rg.y1 && xx >= rg.x0 && xx <= rg.x1;
        const slotted = td.firstElementChild?.localName === 'slot', can = c.editor && !slotted;
        td.tabIndex = on ? 0 : -1;
        td.setAttribute('aria-selected', String(on || inside));
        if (!can) td.setAttribute('aria-readonly', 'true');
        const err = ed ? s.edit.error ?? errors[key(id, k)] : errors[key(id, k)];
        if (err) td.setAttribute('aria-invalid', 'true');
        if (can && ed) {
            const i = editor(t, c, id, s.edit);
            td.replaceChildren(i);
            td.dataset.editing = '';
            if (err) { i.setAttribute('aria-invalid', 'true'); const m = document.createElement('span'); m.dataset.cellError = ''; m.id = `pk-e-${id}-${k}`; m.textContent = err; td.append(m); i.setAttribute('aria-describedby', m.id); }
        } else if (err) { const m = document.createElement('span'); m.dataset.cellError = ''; m.textContent = err; td.append(m); }
        // s.focus is true after a move (scroll the cell into view) and 'keep' after a windowed re-render replaced the focused cell (restore focus without scrolling or reselecting).
        if (s.focus && on) { const keep = s.focus === 'keep'; (td.querySelector('[data-cell-editor]') ?? td).focus({ preventScroll: keep }); if (ed && !keep) td.querySelector('input')?.select(); if (!keep && t.$virtual) reveal(t, td); s.focus = false; }
    }
}

const cellOf = e => e.target.closest?.('td[data-key]');
const slot = td => td.firstElementChild?.localName === 'slot' ? td.firstElementChild : null;
// The control a host put in a slotted cell (the slotted element, or the first control inside a wrapper such as the Blazor cell span): Space or Enter on the cell moves focus to it.
const control = td => { const e = slot(td).assignedElements()[0], f = 'button,input,select,textarea,a[href],[tabindex],pk-switch,pk-checkbox'; return e?.matches(f) ? e : e?.querySelector(f); };
const at = td => ({ id: td.closest('tr').dataset.pkContext, key: td.dataset.key });

// Make a cell the active one by its row id and column key (focus moves to it after the next draw, which draws its row even when it was outside the window).
// With `ext` (Shift) the cell where the move started stays as the anchor of a rectangular selection; without it the selection collapses to the cell.
function goto(t, id, k, ext) { const s = st(t); s.anc = ext ? s.anc ?? s.a : null; s.a = { id, key: k }; s.focus = true; t.requestUpdate(); if (ext) { const r = range(t); say(t, `${r.y1 - r.y0 + 1} rows by ${r.x1 - r.x0 + 1} columns selected`); } }

// The selection as indexes into the view and the column list (a rectangle from the anchor to the active cell); a single cell when nothing is extended. Worked out from ids, never from the DOM.
function range(t) {
    const s = st(t), ids = t.ids(), keys = t.list('columns').map(c => c.key), a = s.a && [ids.indexOf(s.a.id), keys.indexOf(s.a.key)], b = s.anc && [ids.indexOf(s.anc.id), keys.indexOf(s.anc.key)] || a;
    if (!a || a[0] < 0 || a[1] < 0 || b[0] < 0 || b[1] < 0) return null;
    return { ids, keys, y0: Math.min(a[0], b[0]), y1: Math.max(a[0], b[0]), x0: Math.min(a[1], b[1]), x1: Math.max(a[1], b[1]) };
}
const activate = (t, td) => { const { id, key: k } = at(td); goto(t, id, k); };

// A windowed grid draws the active row but may leave it under the sticky header or below the frame: scroll the frame so the cell shows.
function reveal(t, td) {
    const f = t.part('scroll'), r = td.getBoundingClientRect(), b = f.getBoundingClientRect(), hh = t.hasAttribute('sticky-header') ? t.shadowRoot.querySelector('thead').getBoundingClientRect().height : 0;
    if (r.top < b.top + hh) f.scrollTop -= b.top + hh - r.top; else if (r.bottom > b.bottom) f.scrollTop += r.bottom - b.bottom;
}

// Arrow keys and Tab: one cell over, worked out from the row ids and the column list, not from what is drawn. Along a row it wraps to the neighbouring row; false at the edge of the grid.
function move(t, td, dx, dy, ext) {
    const ids = t.ids(), keys = t.list('columns').map(c => c.key), a = at(td);
    let y = ids.indexOf(a.id) + dy, x = keys.indexOf(a.key) + dx;
    if (!dy) { if (x < 0) { y--; x = keys.length - 1; } else if (x >= keys.length) { y++; x = 0; } }
    if (y < 0 || y >= ids.length) return false;
    goto(t, ids[y], keys[x], ext);
    return true;
}

// PageUp / PageDown move by the rows that fit the frame, Ctrl+Home / Ctrl+End to the first / last row; the position is announced, since the rows in between were never drawn.
function jump(t, td, k, ext) {
    const ids = t.ids(), a = at(td), f = t.part('scroll'), rowH = t.$rowH || td.closest('tr').getBoundingClientRect().height || 32, hh = t.shadowRoot.querySelector('thead').getBoundingClientRect().height;
    const page = Math.max(1, Math.floor((f.clientHeight - hh) / rowH)), i = ids.indexOf(a.id);
    const to = k === 'Home' ? 0 : k === 'End' ? ids.length - 1 : Math.min(ids.length - 1, Math.max(0, i + (k === 'PageDown' ? page : -page)));
    goto(t, ids[to], a.key, ext); say(t, `Row ${to + 1} of ${ids.length}`);
}

// Opens the cell's editor. `draft`, when given (type-to-edit), replaces the current value instead of starting from it.
function begin(t, td, draft) {
    const s = st(t), { id, key: k } = at(td), c = col(t, k);
    if (slot(td)) return void control(td)?.focus();
    if (!c.editor) return;
    const v = rowAt(t.view, t.ids(), id)?.[k];
    s.a = { id, key: k }; s.anc = null; s.edit = { id, key: k, draft: draft ?? String(v ?? ''), error: null }; s.focus = true; t.requestUpdate();
}

// Commit a draft (the text as typed): checked, then offered to the host, which may cancel. False when the cell stays open.
function save(t, td, draft, focus = true) {
    const s = st(t), { id, key: k } = at(td), c = col(t, k), i = t.ids().indexOf(id), row = t.view[i], previous = row?.[k];
    const error = check(c, draft), value = typed(c, draft), changed = !same(value, previous);
    const stay = msg => { s.edit = { id, key: k, draft: String(draft), error: msg }; s.focus = focus; t.requestUpdate(); return false; };
    if (error) return stay(error);
    if (changed && !put(t, id, k, value)) return stay(t.cellErrors?.[key(id, k)] ?? 'Value not accepted');
    s.edit = null; s.focus = focus; t.requestUpdate();
    if (changed) { (s.undo ??= []).push({ id, key: k, from: previous, to: value }); trim(s.undo); s.redo = []; say(t, `${label(t, id, k)}: ${shown(value)}`); }
    return true;
}

const shown = v => v ?? 'empty';

// A batch (a paste, an undo step) resolves rows by id once and replaces the table's rows once at the end, so thousands of cells cost one copy, not one each.
const batch = t => { const ids = t.ids(); return { view: t.view, at: new Map(ids.map((x, i) => [x, i])), ids, patch: new Map() }; };
const flush = (t, cx) => { if (cx.patch.size) t.rows = t.list('rows').map(r => cx.patch.has(r) ? { ...r, ...cx.patch.get(r) } : r); };
const trim = u => { let i = Math.max(0, u.length - 100); while (i > 0 && u[i].g && u[i].g === u[i - 1].g) i--; u.splice(0, i); }; // keep the last 100 steps, never cutting a paste in two

// Offer a value for a cell to the host (pk-cell-edit) and, unless it cancels, hold it in a copy of the rows (at once, or at flush() when a batch is given). False when the row is not in the view or the host refused.
function put(t, id, k, value, source = 'keyboard', cx) {
    const own = !cx, c = cx ?? batch(t), i = c.at.get(id), row = c.view[i];
    if (!row || !t.emit('pk-cell-edit', { id, index: i, row, key: k, value, previous: row[k], source })) return false;
    c.patch.set(row, { ...c.patch.get(row), [k]: value });
    delete st(t).paste?.[key(id, k)];
    if (own) flush(t, c);
    return true;
}

// Ctrl/Cmd+Z and Ctrl+Y (or Ctrl+Shift+Z) step through the committed edits of this table. A step goes through the same pk-cell-edit, so the host sees it like any edit and may refuse it.
function step(t, back) {
    const s = st(t), from = back ? s.undo : s.redo, to = back ? (s.redo ??= []) : (s.undo ??= []), h = from?.pop();
    if (!h) return say(t, back ? 'Nothing to undo' : 'Nothing to redo');
    // A paste is one step: every cell of its group goes back (or forward) together.
    const group = [h]; while (h.g && from.at(-1)?.g === h.g) group.push(from.pop());
    if (back) group.reverse();
    const cx = batch(t), done = group.filter(x => put(t, x.id, x.key, back ? x.from : x.to, back ? 'undo' : 'redo', cx)); flush(t, cx);
    if (!done.length) { from.push(...group.reverse()); return say(t, `${label(t, h.id, h.key)}: ${back ? 'undo' : 'redo'} not accepted`); }
    to.push(...(back ? done.reverse() : done)); s.anc = null; s.a ={ id: group[0].id, key: group[0].key }; s.focus = true; t.requestUpdate(); // the earliest cell of the step: drawn and scrolled to even when it was far away
    say(t, `${back ? 'Undo' : 'Redo'}, ${label(t, group[0].id, group[0].key)}: ${shown(back ? group[0].from : group[0].to)}`);
}

// Paste from a spreadsheet (tab-separated text) into the grid, anchored at the active cell. Each cell goes through the same check and cancelable pk-cell-edit as a typed edit
// (source: 'paste'); cells off the grid, cells of read-only columns and refused values are skipped and counted, and one undo step takes the whole paste back.
function paste(t, e) {
    const td = cellOf(e), s = st(t);
    if (!td || !t.editable || e.defaultPrevented || e.target !== td) return;
    const text = e.clipboardData?.getData('text/plain'); if (!text) return;
    e.preventDefault();
    const cx = batch(t), keys = t.list('columns').map(c => c.key), a = at(td), y = cx.at.get(a.id), x = keys.indexOf(a.key), g = (s.gid = (s.gid ?? 0) + 1), done = [], rejected = [];
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    s.paste = {};
    lines.forEach((line, dy) => line.forEach((raw, dx) => {
        const id = cx.ids[y + dy], k = keys[x + dx], ref = { row: y + dy, col: x + dx };
        if (id == null || k == null) return rejected.push({ ...ref, reason: 'outside' });
        const c = col(t, k), previous = cx.view[y + dy][k], err = c.editor && !t.querySelector(`:scope > [slot="${CSS.escape(`cell-${id}-${k}`)}"]`) ? check(c, raw) : 'Read-only';
        if (err === 'Read-only') return rejected.push({ ...ref, id, key: k, reason: 'readonly' });
        if (err) { s.paste[key(id, k)] = err; return rejected.push({ ...ref, id, key: k, reason: err }); }
        const value = typed(c, raw);
        if (same(value, previous)) return;
        if (!put(t, id, k, value, 'paste', cx)) return rejected.push({ ...ref, id, key: k, reason: 'refused' });
        done.push({ id, key: k, from: previous, to: value, g });
    }));
    flush(t, cx);
    if (done.length) { (s.undo ??= []).push(...done); trim(s.undo); s.redo = []; }
    s.a = at(td); s.focus = true; t.requestUpdate();
    t.emit('pk-cells-paste', { cells: done.map(({ id, key: k, to }) => ({ id, key: k, value: to })), rejected });
    say(t, `${done.length} cells updated, ${rejected.length} rejected`);
}

// Ctrl/Cmd+D: the top cell of each selected column is copied down the selected rows. Each cell goes through the same check and cancelable pk-cell-edit (source: 'fill'); read-only
// columns and refused values are skipped and counted, and one undo step takes the whole fill back. Rows come from ids, so rows that are not drawn are filled too.
function fill(t) {
    const r = range(t), s = st(t);
    if (!r || r.y1 === r.y0) return say(t, 'Select two or more rows to fill down');
    const cx = batch(t), g = (s.gid = (s.gid ?? 0) + 1), done = []; let rejected = 0;
    s.paste = {};
    for (let x = r.x0; x <= r.x1; x++) {
        const k = r.keys[x], c = col(t, k), src = cx.view[r.y0][k], text = String(src ?? '');
        for (let y = r.y0 + 1; y <= r.y1; y++) {
            const id = r.ids[y], previous = cx.view[y][k];
            if (!c.editor || t.querySelector(`:scope > [slot="${CSS.escape(`cell-${id}-${k}`)}"]`)) { rejected++; continue; }
            const err = check(c, text);
            if (err) { s.paste[key(id, k)] = err; rejected++; continue; }
            if (same(src, previous)) continue;
            if (put(t, id, k, src, 'fill', cx)) done.push({ id, key: k, from: previous, to: src, g }); else rejected++;
        }
    }
    flush(t, cx);
    if (done.length) { (s.undo ??= []).push(...done); trim(s.undo); s.redo = []; }
    s.focus = true; t.requestUpdate();
    say(t, `${done.length} cells filled, ${rejected} rejected`);
}

// Copy: the selection (or the active cell) as tab-separated text, one line per row, the way a spreadsheet reads it.
function copy(t, e) {
    const td = cellOf(e), r = range(t);
    if (!td || !t.editable || e.defaultPrevented || e.target !== td || !r || !e.clipboardData) return;
    const cx = batch(t), lines = [];
    for (let y = r.y0; y <= r.y1; y++) lines.push(r.keys.slice(r.x0, r.x1 + 1).map(k => String(cx.view[y][k] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'));
    e.clipboardData.setData('text/plain', lines.join('\n')); e.preventDefault();
    say(t, `${lines.length * (r.x1 - r.x0 + 1)} cells copied`);
}

function cancel(t) { const s = st(t); if (!s.edit) return; s.a = { id: s.edit.id, key: s.edit.key }; s.edit = null; s.focus = true; t.requestUpdate(); say(t, 'Edit cancelled'); }

function keydown(t, e) {
    const td = cellOf(e), s = st(t);
    // Escape in a control the host slotted into a cell hands focus back to the cell (the roving tab stop).
    if (!td && e.key === 'Escape' && t.editable) { const c = e.composedPath().find(n => n.localName === 'td' && n.dataset?.key); if (c) { e.preventDefault(); c.focus(); } return; }
    if (!td || !t.editable || e.defaultPrevented) return;
    const editing = !!s.edit && e.target.dataset.cellEditor !== undefined && s.edit.id === at(td).id && s.edit.key === at(td).key, k = e.key;
    if (editing) {
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(t); }
        // Enter commits the draft and moves the active cell down one row, the way a spreadsheet does.
        else if (k === 'Enter' && e.target.localName !== 'select') { e.preventDefault(); if (save(t, td, e.target.value)) move(t, td, 0, 1); }
        else if (k === 'Tab') { e.preventDefault(); if (save(t, td, e.target.value)) move(t, td, e.shiftKey ? -1 : 1, 0); }
        return;
    }
    if (e.target !== td) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(k)) { e.preventDefault(); step(t, k.toLowerCase() === 'z' && !e.shiftKey); return; }
    const dx = keyStep(k, { horizontal: true }) | 0, dy = keyStep(k) | 0; // Home / End are 'start' / 'end': not a step
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === 'd') { e.preventDefault(); fill(t); }
    else if (k === 'Escape' && s.anc) { e.preventDefault(); goto(t, s.a.id, s.a.key); }
    else if (dx || dy) { e.preventDefault(); move(t, td, dx, dy, e.shiftKey); }
    else if (k === 'Enter' || k === 'F2' || (k === ' ' && slot(td))) { e.preventDefault(); begin(t, td); }
    else if (k === 'PageDown' || k === 'PageUp' || ((e.ctrlKey || e.metaKey) && (k === 'Home' || k === 'End'))) { e.preventDefault(); jump(t, td, k, e.shiftKey); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); const r = cells(t).find(r => r.includes(td)); activate(t, r[stepIndex(k, 0, r.length)]); }
    // Tab moves right along the row only (never wraps to the next row); at the row's last cell it is left alone so focus leaves the grid normally.
    else if (k === 'Tab' && !e.shiftKey) {
        const r = cells(t).find(r => r.includes(td)), x = r.indexOf(td);
        if (x < r.length - 1) { e.preventDefault(); activate(t, r[x + 1]); }
    }
    // A printable key with no modifier starts editing the active cell, replacing its content with what was typed (standard grid convention).
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const c = col(t, td.dataset.key);
        if (c.editor && !slot(td)) { e.preventDefault(); begin(t, td, k); }
    }
}

// A click selects a cell; a click on the cell that is already active opens it (the way a touch screen edits, where there is no Enter).
function click(t, e) {
    const td = cellOf(e), s = st(t);
    if (!td || !t.editable || td.hasAttribute('data-editing')) return;
    const c = col(t, td.dataset.key), a = at(td), was = s.a?.id === a.id && s.a?.key === a.key;
    if (e.shiftKey && s.a && !s.edit) goto(t, a.id, a.key, true); // Shift+click extends the selection from the active cell
    else if (was && !s.edit && !s.anc) begin(t, td); else activate(t, td);
}

// A select commits when its choice changes.
function change(t, e) { const td = cellOf(e); if (td && t.editable && e.target.localName === 'select' && e.target.dataset.cellEditor !== undefined) save(t, td, e.target.value); }

// Leaving the open editor for somewhere outside its cell commits it; an invalid draft is dropped, since there is nowhere to show its message.
function blur(t, e) {
    const s = st(t), td = cellOf(e), i = e.target;
    if (!s.edit || !td || i.dataset.cellEditor === undefined || td.contains(e.relatedTarget)) return;
    // The browser also raises this when a render replaces the editor (it is still connected while it does): by the next task a replaced editor is gone.
    setTimeout(() => { if (i.isConnected && s.edit && !save(t, td, i.value, false)) { s.edit = null; s.focus = false; t.requestUpdate(); } }, 0);
}
