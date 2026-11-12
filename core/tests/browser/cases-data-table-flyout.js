// Browser cases for the filter flyout plumbing (#1939, PR 1): with filterPanel set the open panel is placed against the table area
// (its top is the area's top, below the toolbar) and the rows do not move; unset, the panel stays inline and pushes the rows down.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const filters = '[{"key":"channel","type":"select","label":"Channel","options":["a","b"]},{"key":"note","type":"text","label":"Note"}]';

async function mount(t, attrs, width = 1000, { dir = '', height = 0, fields = filters } = {}) {
    const box = await t.mount(`<div ${dir ? `dir="${dir}" ` : ''}style="inline-size:${width}px${height ? `;block-size:${height}px;display:flex;flex-direction:column` : ''}"><pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5" filters='${fields}' ${attrs}></pk-data-table></div>`);
    const el = box.firstElementChild;
    await Promise.all(['pk-table', 'pk-pagination', 'pk-table-filters'].map(n => customElements.whenDefined(n)));
    el.load = async () => ({ rows: [{ id: 1, sku: 'A' }, { id: 2, sku: 'B' }], total: 2 });
    el.refresh();
    const f = el.part('filters');
    await until(() => f.children.length > 0, 'the filter controls');
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
        m.f.toggle(true); await t.settle(); await wait(400); // past the slide-in
        const a = m.area.getBoundingClientRect(), p = m.panel.getBoundingClientRect();
        t.ok(p.height > 0, 'the panel is drawn');
        t.ok(Math.abs(p.top - a.top) <= 1, `panel top ${p.top} is the area top ${a.top}`);
        t.ok(Math.abs(p.left - a.left) <= 1 && p.right <= a.right + 1, 'panel starts at the area start and stays inside its width');
        t.ok(Math.abs(m.top() - before) <= 1, `rows did not move (${before} -> ${m.top()})`);
    }],
    ['data-table flyout: rows beneath stay clickable outside the panel, none reflow, Escape closes and returns focus to the trigger, aria-expanded and aria-controls follow (#1939)', async t => {
        const m = await mount(t, 'filter-panel="flyout"'), before = m.row().getBoundingClientRect(), trigger = m.f.shadowRoot.querySelector('[part="trigger"]');
        t.eq(m.panel.id, trigger.getAttribute('aria-controls'), 'the trigger controls the panel');
        trigger.click(); await t.settle(); await wait(400);
        t.eq(trigger.getAttribute('aria-expanded'), 'true', 'aria-expanded is true while open');
        const r0 = m.row().getBoundingClientRect(), p0 = m.panel.getBoundingClientRect();
        const stage = document.getElementById('stage'), was = stage.style.left; stage.style.left = '0'; // hit testing needs the stage on screen
        try {
        const r = m.row().getBoundingClientRect(), p = m.panel.getBoundingClientRect();
        t.ok(r0.left === before.left && r0.top === before.top && r0.width === before.width && r0.height === before.height, 'the row rect is identical open and closed');
        const x = (p.right + r.right) / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
        t.ok(p.right < r.right - 20, `the panel (right ${Math.round(p.right)}) leaves the row's end uncovered`);
        t.ok(hit && !hit.closest?.('pk-table-filters') && (hit.closest('pk-data-table') === m.el || hit === m.el), `a point on the row beside the panel hits the table, not the panel (hit ${hit?.localName}, x ${Math.round(x)} y ${Math.round(y)}, panel ${Math.round(p.left)}-${Math.round(p.right)}, row ${Math.round(r.left)}-${Math.round(r.right)})`);
        } finally { stage.style.left = was; }
        m.f.focus(); m.f.shadowRoot.querySelector('[part="close"]').focus();
        m.f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        await t.settle();
        t.ok(!m.f.open && m.panel.hidden, 'Escape closes the panel');
        t.eq(m.f.shadowRoot.activeElement, trigger, 'focus returns to the Filters trigger');
        t.eq(trigger.getAttribute('aria-expanded'), 'false', 'aria-expanded is false again');
    }],
    ['data-table flyout: 40 fields at a short area, the panel stays inside the area, its body scrolls, Close and Clear filters stay reachable (#1939)', async t => {
        const many = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ key: 'f' + i, type: 'text', label: 'Field ' + i })));
        const m = await mount(t, 'filter-panel="flyout"', 1000, { height: 420, fields: many });
        m.f.toggle(true); await t.settle(); await wait(400);
        const a = m.area.getBoundingClientRect(), p = m.panel.getBoundingClientRect(), body = m.panel.querySelector('[part="body"]') ?? m.f.shadowRoot.querySelector('[part="body"]');
        t.ok(p.bottom <= a.bottom + 1 && p.top >= a.top - 1, `panel ${Math.round(p.top)}-${Math.round(p.bottom)} is inside the area ${Math.round(a.top)}-${Math.round(a.bottom)}`);
        t.ok(body.scrollHeight > body.clientHeight + 20, 'the body scrolls on its own');
        for (const part of ['close', 'clear']) { const b = m.f.shadowRoot.querySelector(`[part="${part}"]`).getBoundingClientRect(); t.ok(b.top >= a.top - 1 && b.bottom <= a.bottom + 1, `${part} is inside the area`); }
    }],
    ['data-table flyout in right to left: the panel starts at the area inline-start (right) edge (#1939)', async t => {
        const m = await mount(t, 'filter-panel="flyout"', 1000, { dir: 'rtl' });
        m.f.toggle(true); await t.settle(); await wait(400);
        const a = m.area.getBoundingClientRect(), p = m.panel.getBoundingClientRect();
        t.ok(Math.abs(p.right - a.right) <= 1 && p.left >= a.left - 1, `panel right ${Math.round(p.right)} is the area right ${Math.round(a.right)}`);
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
