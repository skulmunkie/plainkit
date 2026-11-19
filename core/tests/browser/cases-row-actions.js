// Browser cases for row actions (#2046): pk-data-table rowActions draws an icon action column pinned at the inline end, one pk-action { key, id, row } per press,
// names that carry the row title, a confirm step for warn, a menu above rowActionsMax or with a group, per-row state through row._actions, and no pk-row-click from the cell.
import { until } from './wait.js';
const rect = el => el.getBoundingClientRect();
const ROWS = [{ id: 1, name: 'Order 1042', state: 'Open' }, { id: 2, name: 'Order 1043', state: 'Posted', _actions: { delete: { disabled: true, hint: 'Posted orders cannot be deleted' }, edit: { hidden: true } } }];
const COLS = '[{"key":"name","label":"Name","title":true},{"key":"state","label":"State"}]';
const ACTIONS = [{ key: 'view', label: 'View', icon: 'search' }, { key: 'edit', label: 'Edit', icon: 'edit' }, { key: 'delete', label: 'Delete', icon: 'trash', variant: 'warn' }];

async function mount(t, { actions = ACTIONS, width = 900, dir = '', attrs = '', rows = ROWS } = {}) {
    const box = await t.mount(`<div ${dir ? `dir="${dir}" ` : ''}style="inline-size:${width}px"><pk-data-table label="Orders" columns='${COLS}' ${attrs}></pk-data-table></div>`);
    const el = box.firstElementChild;
    await Promise.all(['pk-table', 'pk-pagination', 'pk-table-filters', 'pk-button'].map(n => customElements.whenDefined(n)));
    el.rowActions = actions;
    el.load = async () => ({ rows, total: rows.length });
    el.refresh();
    const tbl = el.part('table'), cells = () => [...tbl.shadowRoot.querySelectorAll('tbody td[data-pin]')];
    await until(() => cells().length === rows.length && cells().every(c => c.querySelector('slot')) && tbl.querySelector('[slot^="cell-"]'), 'the action cells');
    await t.settle();
    const buttons = row => [...tbl.querySelectorAll(`[slot="cell-${row}-_actions"] pk-button`)];
    return { el, tbl, cells, buttons, ctl: b => b.shadowRoot.querySelector('[part=control]') };
}
const press = (m, b) => m.ctl(b).click();

export const rowActionsCases = [
    ['data-table row-actions: the action column is last, pinned at the inline end in ltr and rtl, its header text stays for screen readers, and it is not sortable', async t => {
        for (const dir of ['ltr', 'rtl']) {
            const m = await mount(t, { dir }), td = m.cells()[0], th = m.tbl.shadowRoot.querySelector('thead th[data-pin]'), frame = rect(m.tbl.shadowRoot.querySelector('[part=scroll]')), r = rect(td);
            t.ok(th && th.textContent.trim() === 'Actions' && !th.querySelector('button'), `${dir}: header Actions, no sort button`);
            t.ok(dir === 'ltr' ? Math.abs(r.right - frame.right) <= 2 : Math.abs(r.left - frame.left) <= 2, `${dir}: the cell sits at the inline end (${r.left}..${r.right} in ${frame.left}..${frame.right})`);
            t.ok(getComputedStyle(td).position === 'sticky', `${dir}: pinned`);
        }
    }],
    ['data-table row-actions: every button is icon-only and its name carries the row title; a hint is the tooltip', async t => {
        const m = await mount(t), b = m.buttons(1);
        t.eq(b.map(x => x.label).join(), 'View Order 1042,Edit Order 1042,Delete Order 1042', 'names with the row title');
        t.ok(b.every(x => rect(x).width <= 48), 'icon-only (one control wide)');
        const second = m.buttons(2);
        t.eq(second.map(x => x.label).join(), 'View Order 1043,Delete Order 1043', 'a hidden action is not drawn');
        t.ok(second[1].closest('pk-tooltip')?.text === 'Posted orders cannot be deleted' && second[1].disabled, 'disabled with its hint');
    }],
    ['data-table row-actions: one pk-action { key, id, row } per press; a warn action asks first and fires only when confirmed', async t => {
        const m = await mount(t), got = []; m.el.addEventListener('pk-action', e => got.push(e.detail));
        press(m, m.buttons(1)[1]); await t.settle();
        t.eq(got.length, 1, 'one event'); t.eq(`${got[0].key}/${got[0].id}/${got[0].row.name}`, 'edit/1/Order 1042', 'key, id and row');
        press(m, m.buttons(1)[2]);
        const dlg = await until(() => document.querySelector('pk-dialog[open]'), 'the confirm dialog'); await t.settle();
        t.eq(got.length, 1, 'nothing fired before the answer');
        dlg.querySelector('[data-result=""]').click(); await until(() => !document.querySelector('pk-dialog'), 'the dialog gone');
        t.eq(got.length, 1, 'cancel fires nothing');
        press(m, m.buttons(1)[2]);
        const d2 = await until(() => document.querySelector('pk-dialog[open]'), 'the confirm dialog again'); await t.settle();
        d2.querySelector('[data-result="ok"]').click(); await until(() => got.length === 2, 'the confirmed event');
        t.eq(got[1].key, 'delete', 'delete fired after confirm');
    }],
    ['data-table row-actions: confirm false opts a warn action out, and the cell never raises pk-row-click', async t => {
        const m = await mount(t, { actions: [{ key: 'delete', label: 'Delete', icon: 'trash', variant: 'warn', confirm: false }], attrs: 'clickable' }), got = [], clicks = [];
        m.el.addEventListener('pk-action', e => got.push(e.detail)); m.el.addEventListener('pk-row-click', e => clicks.push(e.detail));
        press(m, m.buttons(1)[0]); await t.settle();
        t.eq(got.length, 1, 'fired at once'); t.eq(clicks.length, 0, 'no row click from the actions cell');
    }],
    ['data-table row-actions: more than three actions, or a group, fold into one row menu named for the row; choosing an item fires pk-action', async t => {
        const four = [...ACTIONS, { key: 'copy', label: 'Copy', icon: 'copy' }];
        for (const actions of [four, [{ key: 'a', label: 'A', icon: 'edit' }, { key: 'b', label: 'B', icon: 'edit', group: 'More' }]]) {
            const m = await mount(t, { actions }), dd = m.tbl.querySelector('[slot="cell-1-_actions"] pk-dropdown'), got = [];
            t.ok(dd, 'a menu'); t.eq(m.tbl.querySelectorAll('[slot="cell-1-_actions"] pk-button').length, 1, 'only the trigger is a button');
            t.eq(dd.querySelector('[slot=trigger]').label, 'More actions for Order 1042', 'trigger name');
            m.el.addEventListener('pk-action', e => got.push(e.detail));
            dd.dispatchEvent(new CustomEvent('pk-select', { bubbles: true, detail: { value: actions[1].key } })); await t.settle();
            t.eq(got.map(g => g.key + g.id).join(), actions[1].key + '1', 'the chosen key and the row id');
        }
    }],
    ['data-table row-actions: focus returns to the same row action after the table redraws', async t => {
        const m = await mount(t, { actions: [{ key: 'edit', label: 'Edit', icon: 'edit' }], rows: ROWS.map(({ id, name, state }) => ({ id, name, state })) });
        m.ctl(m.buttons(1)[0]).focus(); press(m, m.buttons(1)[0]); await t.settle();
        m.el.refresh(); await until(() => m.buttons(1)[0]?.isConnected && m.tbl.querySelector('[slot="cell-1-_actions"]'), 'redrawn'); await t.settle(); await new Promise(r => setTimeout(r, 200));
        t.ok(m.buttons(1)[0].shadowRoot.activeElement, 'focus is on the row action again');
    }],
];
