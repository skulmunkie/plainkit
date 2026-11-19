// Row actions of pk-data-table (#2046), a lazy part: loaded only when `rowActions` is set. For each drawn row it builds the cell `cell-<id>-_actions` from the shared
// action item ({ key, label, icon?, variant?, disabled?, group?, hint?, confirm? }, js/page-actions.js) and raises one `pk-action { key, id, row }` from the table per press.
// Per-row state is data: a row's `_actions` is { [key]: { disabled?, hidden?, hint? } }. A warn action (or `confirm`) asks first; focus comes back to the row's action after a redraw.
import { renderActions, actionItems } from './page-actions.js';
import { rowId } from './rowset.js';
import { loadElements } from './loader.js';

const sub = (s, title) => String(s ?? '').replaceAll('{title}', title);

/** The row's name: the column marked title, else the first text column, else the id. Pure. */
export function titleOf(columns, row, id) {
    const c = columns.find(x => x.title) ?? columns.find(x => !x.type || x.type === 'text'), v = c && row[c.key];
    return v == null || v === '' ? String(id) : String(v);
}

/** The items a row shows: the row's `_actions` state applied (hidden ones dropped). Pure. */
export function rowItems(items, row) {
    const state = row?._actions ?? {};
    return items.filter(a => !state[a.key]?.hidden).map(a => ({ ...a, ...(state[a.key]?.disabled ? { disabled: true } : {}), ...(state[a.key]?.hint ? { hint: state[a.key].hint } : {}) }));
}

/** The confirm dialog options of an item for a row, or null: warn confirms unless `confirm: false`; `confirm: true | { heading?, message?, confirmLabel? }` asks for any item. Pure. */
export function confirmOf(a, title) {
    if (a.confirm === false || !(a.confirm || a.variant === 'warn')) return null;
    const c = typeof a.confirm === 'object' ? a.confirm : {};
    return { heading: sub(c.heading ?? `${a.label} {title}?`, title), message: c.message ? sub(c.message, title) : undefined, confirmLabel: c.confirmLabel ?? a.label, danger: true };
}

const el = (doc, tag, props) => Object.assign(doc.createElement(tag), props);

export default function draw(host) {
    const table = host.part('table'), doc = host.ownerDocument;
    for (const n of table.querySelectorAll(':scope > [data-ra]')) n.remove();
    const list = Array.isArray(host.rowActions) ? actionItems(host.rowActions, undefined, (k, m) => host.warnOnce?.(k, m)) : [], rows = table.rows ?? [], cols = host.opt('columns'), max = host.rowActionsMax ?? 3;
    let dialogs;
    const confirm = c => (dialogs ??= import('./dialogs.js').then(m => m.createDialogs({ container: doc.body, load: d => loadElements(d) }))).then(d => d.confirm(c));
    const cells = rows.map((row, i) => {
        const id = rowId(row, i, table.rowKey), title = titleOf(cols, row, id), items = rowItems(list.map(a => ({ variant: 'ghost', ...a })), row);
        if (!items.length) return null;
        const press = a => {
            host.$raFocus = { id, i, at: Date.now() };
            const fire = () => host.emit('pk-action', { key: a.key, id, row }), c = confirmOf(a, title);
            if (c) confirm(c).then(ok => ok && fire()); else fire();
        };
        const cell = el(doc, 'span', { slot: `cell-${id}-_actions` });
        if (items.length <= max && !items.some(a => a.group)) {
            const nodes = renderActions(host, items, { collapse: 'always', slot: null, warn: (k, m) => host.warnOnce?.(k, m), onPress: (a, fire) => press(a) });
            nodes.forEach((n, j) => { const b = n.localName === 'pk-button' ? n : n.querySelector('pk-button'); b.label = `${items[j].label} ${title}`; b.setAttribute('icon', ''); });
            cell.append(...nodes);
        } else {
            const dd = el(doc, 'pk-dropdown', { placement: 'bottom-end' }), trigger = el(doc, 'pk-button', { slot: 'trigger', variant: 'ghost', iconName: 'more', label: `More actions for ${title}` });
            trigger.setAttribute('icon', ''); dd.append(trigger);
            let group;
            for (const a of items) {
                if (a.group && a.group !== group) dd.append(el(doc, 'pk-menu-item', { type: 'header', textContent: a.group }));
                group = a.group;
                dd.append(el(doc, 'pk-menu-item', { value: a.key, textContent: a.label, disabled: !!a.disabled, danger: a.variant === 'warn' }));
            }
            dd.addEventListener('pk-select', e => { e.stopPropagation(); const a = items.find(x => x.key === e.detail?.value); if (a) press(a); });
            cell.append(dd);
        }
        cell.dataset.ra = id;
        return cell;
    }).filter(Boolean);
    table.append(...cells);
    loadElements(host.shadowRoot);
    table.requestUpdate?.();
    // Focus follows the redraw: the pressed row's first control, else the row now at that place, else the last row (a deleted row), for a few seconds after a press.
    const f = host.$raFocus;
    if (f && Date.now() - f.at < 5000) requestAnimationFrame(() => {
        if (doc.activeElement && doc.activeElement !== doc.body) return;
        const to = cells.find(c => c.dataset.ra === f.id) ?? cells[Math.min(f.i, cells.length - 1)];
        to?.querySelector('pk-button')?.focus();
    });
}
