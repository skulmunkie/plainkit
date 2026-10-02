// pk-data-table (issue 801): the states of a paged list. Loading (a skeleton, the table hidden), an error with Retry, the empty state, the loaded page with its search box and
// pager, a page selected ("Select all 112 rows" in the bulk bar) and all selected ("All 112 selected" with "Clear selection"). Each state fits the width and nothing overlaps.
// The route buttons set what load() does and reload.
const DT = '#dt';
const PARTS = `${DT} >>> `;
const TABLE = `${PARTS}[part=table]`;
const BTN = `${TABLE} >>> [part=bulk-all]`;
const COUNT = `${TABLE} >>> [part=bulk-count]`;
const BAR = `${TABLE} >>> [part=bulk]`;
const ROWS = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners', total: `$${(i + 1) * 120}.00` }));

export default {
    name: 'data-table',
    issue: [801, 798],
    elements: ['data-table'],
    html: `<pk-stack gap="md"><pk-stack direction="row" gap="sm"><pk-button id="loading" size="sm">Loading</pk-button><pk-button id="fail" size="sm">Fail</pk-button><pk-button id="none" size="sm">Empty</pk-button><pk-button id="ok" size="sm">Rows</pk-button></pk-stack>
<pk-data-table id="dt" selectable striped clickable current-row="2"><pk-badge slot="cell-1-po">PO&nbsp;1042</pk-badge><pk-button slot="bulk" id="del" size="sm">Delete</pk-button></pk-data-table></pk-stack>`,
    setup(frame) {
        const el = frame.querySelector(DT);
        el.config = { columns: [{ key: 'po', label: 'PO', sortable: true }, { key: 'customer', label: 'Customer' }, { key: 'total', label: 'Total', type: 'number' }], empty: { heading: 'No orders match', description: 'Try another search.' }, pageSize: 5, pageSizeOptions: [5, 10, 25], caption: 'Orders', sort: 'po', sortDir: 'descending' };
        const use = load => () => { el.load = load; el.refresh(); };
        frame.querySelector('#loading').addEventListener('click', use(() => new Promise(() => {})));
        frame.querySelector('#fail').addEventListener('click', use(() => Promise.reject(new Error('The orders could not be loaded.'))));
        frame.querySelector('#none').addEventListener('click', use(() => ({ rows: [], total: 0 })));
        frame.querySelector('#ok').addEventListener('click', use(() => ({ rows: ROWS, total: 112 })));
        el.load = () => ({ rows: ROWS, total: 112 });
    },
    steps: [
        { click: '#loading' }, { wait: 150 }, { shot: 'loading' },
        { click: '#fail' }, { wait: 200 }, { shot: 'error' },
        { click: '#none' }, { wait: 200 }, { shot: 'empty' },
        { click: '#ok' }, { wait: 300 }, { shot: 'rows' },
        { click: `${TABLE} >>> [data-select-all]` }, { wait: 300 }, { shot: 'page' },
        { click: BTN }, { wait: 200 }, { shot: 'all' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.inViewport(DT);
        const state = `${PARTS}[part=state] `;
        if (t.shot === 'loading') { t.visible(`${state}pk-skeleton`, 'the loading skeleton'); t.hidden(TABLE, 'the table while loading'); }
        if (t.shot === 'error') { t.visible(`${state}pk-alert`, 'the error alert'); t.hasText(`${state}pk-alert`, 'could not be loaded'); t.visible(`${state}pk-button`, 'Retry'); t.hidden(TABLE, 'the table after an error'); }
        if (t.shot === 'empty') { t.visible(`${state}pk-empty-state`, 'the empty state'); t.hasText(`${state}pk-empty-state >>> [part=heading]`, 'No orders match'); t.hidden(TABLE, 'the table when empty'); }
        if (['rows', 'page', 'all'].includes(t.shot)) {
            t.visible(TABLE, 'the table'); t.visible(`${PARTS}[part=pagination]`, 'the pager'); t.visible(`${PARTS}[part=filters] >>> [part=search]`, 'the search box');
            t.noOverlap(`${PARTS}[part=filters] >>> [part=search]`, `${PARTS}[part=pagination]`);
            t.inViewport(`${PARTS}[part=pagination]`);
        }
        if (t.shot === 'rows') { t.hidden(BAR, 'the bulk bar with nothing selected'); t.visible('#dt > pk-badge', 'the slotted cell content'); t.visible(`${TABLE} >>> tr[aria-current]`, 'the current row'); t.visible(`${PARTS}[part=pagination] >>> [part=size-select]`, 'the page size select'); t.noOverlap(`${PARTS}[part=pagination] >>> [part=size]`, `${PARTS}[part=pagination] >>> [part=summary]`); }
        if (t.shot === 'page' || t.shot === 'all') { t.visible(BAR, 'the bulk bar'); t.visible(BTN, 'the select-all button'); t.within(BTN, BAR, 1); t.noOverlap(BTN, COUNT); t.atLeast(BTN, 'height', t.viewport.name === 'phone' ? 44 : 20); }
        if (t.shot === 'page' || t.shot === 'all') { t.visible('#del', 'the bulk action'); t.within('#del', BAR, 1); t.noOverlap('#del', COUNT); t.noOverlap('#del', BTN); }
        if (t.shot === 'page') { t.hasText(BTN, 'Select all 112 rows'); t.hasText(COUNT, '5 selected'); }
        if (t.shot === 'all') { t.hasText(BTN, 'Clear selection'); t.hasText(COUNT, 'All 112 selected'); }
    },
};
