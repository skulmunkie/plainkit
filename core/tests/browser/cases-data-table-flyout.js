// Browser cases for the filter flyout plumbing (#1939, PR 1): with filterPanel set the open panel is placed against the table area
// (its top is the area's top, below the toolbar) and the rows do not move; unset, the panel stays inline and pushes the rows down.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const filters = '[{"key":"channel","type":"select","label":"Channel","options":["a","b"]},{"key":"note","type":"text","label":"Note"}]';

async function mount(t, attrs, width = 1000) {
    const box = await t.mount(`<div style="inline-size:${width}px"><pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5" filters='${filters}' ${attrs}></pk-data-table></div>`);
    const el = box.firstElementChild;
    await Promise.all(['pk-table', 'pk-pagination', 'pk-table-filters'].map(n => customElements.whenDefined(n)));
    el.load = async () => ({ rows: [{ id: 1, sku: 'A' }, { id: 2, sku: 'B' }], total: 2 });
    el.refresh();
    const f = el.part('filters');
    await until(() => f.querySelectorAll('pk-select').length === 1, 'the filter controls');
    await t.settle();
    const row = () => el.part('table').shadowRoot.querySelector('tbody tr');
    await until(row, 'a row');
    return { el, f, area: el.shadowRoot.querySelector('[part="area"]'), panel: f.shadowRoot.querySelector('[part="panel"]'), row, top: () => row().getBoundingClientRect().top };
}

export const dataTableFlyoutCases = [
    ['data-table filterPanel flyout: the open panel sits at the table area (top equal, inside it) and the rows do not move (#1939)', async t => {
        const m = await mount(t, 'filter-panel="flyout"'), before = m.top();
        t.ok(m.area?.contains(m.el.part('table')), 'the table is inside [part=area]');
        t.eq(m.f.getAttribute('placement'), 'start', 'the flyout sets placement=start on the filters');
        m.f.toggle(true); await t.settle(); await wait(50);
        const a = m.area.getBoundingClientRect(), p = m.panel.getBoundingClientRect();
        t.ok(p.height > 0, 'the panel is drawn');
        t.ok(Math.abs(p.top - a.top) <= 1, `panel top ${p.top} is the area top ${a.top}`);
        t.ok(Math.abs(p.left - a.left) <= 1 && p.right <= a.right + 1, 'panel starts at the area start and stays inside its width');
        t.ok(Math.abs(m.top() - before) <= 1, `rows did not move (${before} -> ${m.top()})`);
    }],
    ['data-table filterPanel unset: the panel stays inline and pushes the rows down, the area wraps the table without moving it (#1939)', async t => {
        const m = await mount(t, ''), before = m.top();
        t.ok(!m.f.hasAttribute('placement') || m.f.getAttribute('placement') === 'inline', 'no flyout placement by default');
        m.f.toggle(true); await t.settle(); await wait(50);
        t.ok(m.top() > before + 20, `rows pushed down by the inline panel (${before} -> ${m.top()})`);
        t.ok(Math.abs(m.panel.getBoundingClientRect().width - m.el.getBoundingClientRect().width) <= 24, 'the inline panel is full width');
    }],
    ['list-page filterPanel config reaches the data table (#1939)', async t => {
        const el = await t.mount('<pk-list-page></pk-list-page>');
        await Promise.all(['pk-list-page', 'pk-data-table'].map(n => customElements.whenDefined(n)));
        el.config = { title: 'Orders', columns: [{ key: 'sku', label: 'SKU' }], filters: JSON.parse(filters), filterPanel: 'flyout' };
        await t.settle();
        const dt = el.shadowRoot.querySelector('pk-data-table');
        t.eq(dt.filterPanel, 'flyout', 'config.filterPanel is forwarded');
    }],
];
