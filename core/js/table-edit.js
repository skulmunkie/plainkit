// Lazy part of <pk-table>: inline cell editing (issue 331, first step). The table imports this on demand, only when `editable` is set, so its own module stays inside
// its budget. The table owns what is drawn (shadow tree): this module marks the rendered body as an ARIA grid after every render, keeps one active cell (roving tabindex,
// arrow keys), and swaps the active cell's content for an editor while it is edited. The edit state lives here and is drawn again on each render, so a render never loses a draft.
// A commit raises the cancelable pk-cell-edit; unless the host cancels it the table then holds the new value in a copy of its rows (the host owns them after the event).

import { sheetFor } from './element.js';
import { keyStep, stepIndex } from './roving.js';
import { loadElements } from './loader.js';

const STYLES = ('td[data-key][tabindex]{cursor:cell}td[data-key]:focus-visible{outline:var(--focus-ring);outline-offset:-2px}td[aria-selected="true"]{background:color-mix(in srgb,var(--color-accent) 10%,transparent)}td[aria-invalid="true"]{box-shadow:inset 0 0 0 2px var(--field-error)}td[data-editing]{padding:var(--space-1);position:relative}td[data-editing] :is(input,select){inline-size:0;min-inline-size:100%;font:inherit}[data-cell-error]{display:block;color:var(--field-error);font-size:var(--text-meta);text-align:start}td[data-editing] [data-cell-error]{position:absolute;inset-block-start:100%;inset-inline-start:0;z-index:1;inline-size:max-content;max-inline-size:min(16rem,80vw);padding:var(--space-1) var(--space-2);background:var(--color-bg);border-radius:var(--radius-sm);box-shadow:var(--shadow-card)}@media (max-width:640px){td[data-key] pk-switch::part(control){min-inline-size:var(--touch-target)}td[data-editing] :is(input,select){min-block-size:var(--touch-target);min-inline-size:max(100%,var(--touch-target));font-size:16px}}');
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

// The value a draft becomes: a number column holds a number (or null when empty), a switch a boolean, the others the text as typed.
export const typed = (col, text) => col.editor === 'number' ? (String(text).trim() === '' ? null : Number(text)) : col.editor === 'switch' ? !!text : text;

const same = (a, b) => String(a ?? '') === String(b ?? '');
const key = (id, k) => `${id}:${k}`;
const st = t => t.$g ??= {};
const col = (t, k) => t.list('columns').find(c => c.key === k) ?? {};
const cells = t => [...t.part('body').querySelectorAll('tr[data-pk-context]')].map(tr => [...tr.querySelectorAll('td[data-key]')]);
const say = (t, text) => { const s = st(t); (s.live ??= t.shadowRoot.appendChild(Object.assign(document.createElement('div'), { className: 'sr', role: 'status' }))).textContent = text; };
const label = (t, id, k) => `${col(t, k).label ?? k}, row ${id}`;

// The cell's editor: the control the column asks for, holding the draft. A switch is drawn always (it is the value), the others only while editing.
function editor(t, c, id, s, value) {
    const e = c.editor, name = label(t, id, c.key);
    if (e === 'switch') { const i = document.createElement('pk-switch'), l = document.createElement('span'); l.className = 'sr'; l.textContent = name; i.append(l); i.checked = value === true || value === 'true'; i.dataset.cellEditor = ''; keep(i); return i; }
    const i = document.createElement(e === 'select' ? 'select' : 'input'); i.dataset.cellEditor = ''; i.setAttribute('aria-label', name);
    if (e === 'select') for (const o of c.options ?? []) { const v = typeof o === 'object' ? o.value : o, op = document.createElement('option'); op.value = v; op.textContent = typeof o === 'object' ? (o.label ?? v) : o; i.append(op); }
    else { i.type = 'text'; if (e === 'number') i.inputMode = 'decimal'; }
    i.value = s.draft ?? '';
    return i;
}

// The switch is the pk-switch element (defined on demand); its button is not a tab stop, the cell is (roving tabindex).
function keep(sw) { const go = () => { const b = sw.shadowRoot?.querySelector('button'); if (b) b.tabIndex = -1; return !!b; }; if (!go()) customElements.whenDefined('pk-switch').then(() => setTimeout(go, 0)); }

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

// After each render: grid roles and states on the body, the active cell's tab stop, the open editor and the error text.
export function after(t) {
    const root = t.shadowRoot, s = st(t), tb = t.part('table');
    if (!t.editable) { tb.removeAttribute('role'); return; }
    sheet ??= sheetFor(STYLES);
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    if (!s.on) { s.on = 1; root.addEventListener('keydown', e => keydown(t, e)); root.addEventListener('click', e => click(t, e)); root.addEventListener('change', e => change(t, e)); root.addEventListener('input', e => { if (s.edit && e.target.dataset.cellEditor !== undefined) s.edit.draft = e.target.value; }); root.addEventListener('focusout', e => blur(t, e)); }
    tb.setAttribute('role', 'grid');
    lockWidths(t, tb, !!s.edit);
    const rows = cells(t), ids = t.ids(), errors = t.cellErrors ?? {};
    if (!rows.flat().some(td => at(td).id === s.a?.id && at(td).key === s.a?.key)) s.a = rows[0]?.[0] ? at(rows[0][0]) : null;
    for (const line of rows) for (const td of line) {
        const id = td.closest('tr').dataset.pkContext, k = td.dataset.key, c = col(t, k), on = s.a?.id === id && s.a?.key === k, ed = s.edit?.id === id && s.edit?.key === k;
        const slotted = td.firstElementChild?.localName === 'slot', can = c.editor && !slotted, row = t.view[ids.indexOf(id)];
        td.tabIndex = on ? 0 : -1;
        td.setAttribute('aria-selected', String(on));
        if (!can) td.setAttribute('aria-readonly', 'true');
        const err = ed ? s.edit.error ?? errors[key(id, k)] : errors[key(id, k)];
        if (err) td.setAttribute('aria-invalid', 'true');
        if (can && (ed || c.editor === 'switch')) {
            const i = editor(t, c, id, ed ? s.edit : {}, row?.[k]);
            td.replaceChildren(i);
            if (ed) td.dataset.editing = '';
            if (err) { i.setAttribute('aria-invalid', 'true'); const m = document.createElement('span'); m.dataset.cellError = ''; m.id = `pk-e-${id}-${k}`; m.textContent = err; td.append(m); i.setAttribute('aria-describedby', m.id); }
        } else if (err) { const m = document.createElement('span'); m.dataset.cellError = ''; m.textContent = err; td.append(m); }
        if (s.focus && on) { (td.querySelector('[data-cell-editor]:not(pk-switch)') ?? td).focus(); if (ed) td.querySelector('input')?.select(); s.focus = false; }
    }
    if (!s.sw && root.querySelector('pk-switch')) { s.sw = 1; loadElements(root); }
}

const cellOf = e => e.target.closest?.('td[data-key]');
const at = td => ({ id: td.closest('tr').dataset.pkContext, key: td.dataset.key });

// Make a cell the active one (focus moves to it after the next draw, or now when it is already drawn).
function activate(t, td) { const s = st(t); s.a = at(td); s.focus = true; t.requestUpdate(); }

// Arrow keys and Tab: one cell over. Along a row it wraps to the neighbouring row; false at the edge of the grid.
function move(t, td, dx, dy) {
    const rows = cells(t), y = rows.findIndex(r => r.includes(td)), x = rows[y].indexOf(td) + dx;
    const target = dy ? rows[y + dy]?.[Math.min(rows[y + dy].length - 1, x)] : rows[y][x] ?? (x < 0 ? rows[y - 1]?.at(-1) : rows[y + 1]?.[0]);
    if (target) activate(t, target);
    return !!target;
}

// Opens the cell's editor. `draft`, when given (type-to-edit), replaces the current value instead of starting from it.
function begin(t, td, draft) {
    const s = st(t), { id, key: k } = at(td), c = col(t, k);
    if (!c.editor || td.firstElementChild?.localName === 'slot') return;
    const row = t.view[t.ids().indexOf(id)], v = row?.[k];
    if (c.editor === 'switch') return void save(t, td, !(v === true || v === 'true'));
    s.a = { id, key: k }; s.edit = { id, key: k, draft: draft ?? String(v ?? ''), error: null }; s.focus = true; t.requestUpdate();
}

// Commit a draft (text as typed, or a boolean for a switch): checked, then offered to the host, which may cancel. False when the cell stays open.
function save(t, td, draft, focus = true) {
    const s = st(t), { id, key: k } = at(td), c = col(t, k), i = t.ids().indexOf(id), row = t.view[i], previous = row?.[k];
    const error = c.editor === 'switch' ? '' : check(c, draft), value = typed(c, draft), changed = !same(value, previous);
    const stay = msg => { s.edit = { id, key: k, draft: String(draft), error: msg }; s.focus = focus; t.requestUpdate(); return false; };
    if (error) return stay(error);
    if (changed && !put(t, id, k, value)) return stay(t.cellErrors?.[key(id, k)] ?? 'Value not accepted');
    s.edit = null; s.focus = focus; t.requestUpdate();
    if (changed) { (s.undo ??= []).push({ id, key: k, from: previous, to: value }); s.undo.splice(0, s.undo.length - 100); s.redo = []; say(t, `${label(t, id, k)}: ${shown(c, value)}`); }
    return true;
}

const shown = (c, v) => c.editor === 'switch' ? (v ? 'on' : 'off') : v ?? 'empty';

// Offer a value for a cell to the host (pk-cell-edit) and, unless it cancels, hold it in a copy of the rows. False when the row is not drawn or the host refused.
function put(t, id, k, value) {
    const i = t.ids().indexOf(id), row = t.view[i];
    if (!row || !t.emit('pk-cell-edit', { id, index: i, row, key: k, value, previous: row[k] })) return false;
    t.rows = t.list('rows').map(r => r === row ? { ...r, [k]: value } : r);
    return true;
}

// Ctrl/Cmd+Z and Ctrl+Y (or Ctrl+Shift+Z) step through the committed edits of this table. A step goes through the same pk-cell-edit, so the host sees it like any edit and may refuse it.
function step(t, back) {
    const s = st(t), from = back ? s.undo : s.redo, to = back ? (s.redo ??= []) : (s.undo ??= []), h = from?.pop();
    if (!h) return say(t, back ? 'Nothing to undo' : 'Nothing to redo');
    const value = back ? h.from : h.to, c = col(t, h.key);
    if (!put(t, h.id, h.key, value)) { from.push(h); return say(t, `${label(t, h.id, h.key)}: ${back ? 'undo' : 'redo'} not accepted`); }
    to.push(h); s.a = { id: h.id, key: h.key }; s.focus = true; t.requestUpdate();
    say(t, `${back ? 'Undo' : 'Redo'}, ${label(t, h.id, h.key)}: ${shown(c, value)}`);
}

function cancel(t) { const s = st(t); if (!s.edit) return; s.a = { id: s.edit.id, key: s.edit.key }; s.edit = null; s.focus = true; t.requestUpdate(); say(t, 'Edit cancelled'); }

function keydown(t, e) {
    const td = cellOf(e), s = st(t);
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
    if (dx || dy) { e.preventDefault(); move(t, td, dx, dy); }
    else if (k === 'Enter' || k === 'F2' || (k === ' ' && col(t, td.dataset.key).editor === 'switch')) { e.preventDefault(); begin(t, td); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); const r = cells(t).find(r => r.includes(td)); activate(t, r[stepIndex(k, 0, r.length)]); }
    // Tab moves right along the row only (never wraps to the next row); at the row's last cell it is left alone so focus leaves the grid normally.
    else if (k === 'Tab' && !e.shiftKey) {
        const r = cells(t).find(r => r.includes(td)), x = r.indexOf(td);
        if (x < r.length - 1) { e.preventDefault(); activate(t, r[x + 1]); }
    }
    // A printable key with no modifier starts editing the active cell, replacing its content with what was typed (standard grid convention).
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const c = col(t, td.dataset.key);
        if (c.editor && c.editor !== 'switch' && td.firstElementChild?.localName !== 'slot') { e.preventDefault(); begin(t, td, k); }
    }
}

// A click selects a cell; a click on the cell that is already active opens it (the way a touch screen edits, where there is no Enter). A switch toggles on any click.
function click(t, e) {
    const td = cellOf(e), s = st(t);
    if (!td || !t.editable || td.hasAttribute('data-editing')) return;
    const c = col(t, td.dataset.key), a = at(td), was = s.a?.id === a.id && s.a?.key === a.key;
    if (c.editor === 'switch' && e.target.localName === 'pk-switch') { e.preventDefault(); begin(t, td); } else if (was && !s.edit) begin(t, td); else activate(t, td);
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
