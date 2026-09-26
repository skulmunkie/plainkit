// pk-table in the states a still example does not show (issues 255, 131): a wide table in a scroll frame with a sticky header (the header stays put while the rows
// scroll, the frame scrolls sideways on a phone instead of the page), the empty state and the loading state, and the cards layout on a phone (labelled rows, no header
// row, hidePhone columns gone). The scroll frame is a keyboard stop, so its focus ring must show.
const COLS = ['sku', 'title', 'brand', 'category', 'price', 'stock', 'supplier', 'updated'];
const columns = JSON.stringify(COLS.map((k, i) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), sortable: i < 2, ...(k === 'price' || k === 'stock' ? { type: 'number' } : {}), ...(k === 'supplier' ? { hidePhone: true } : {}) })));
const rows = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1} with a rather long product title`, brand: 'Acme', category: 'Hardware', price: `$${(i + 1) * 3}.99`, stock: String(i * 7), supplier: 'Contoso Wholesale Ltd', updated: '2026-01-07' })));
const one = JSON.stringify([{ key: 'sku', label: 'SKU' }]);
const SCROLL = '#t1 >>> [part=scroll]';

export default {
    name: 'table',
    issue: [255],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-stack>
<pk-table id="t1" label="Products" caption="Stock by product" sticky-header striped max-height="260px" columns='${columns}' rows='${rows}'></pk-table>
<pk-table id="t2" label="No products" empty-text="No products match these filters" columns='${one}'></pk-table>
<pk-table id="t3" label="Loading products" loading columns='${one}'></pk-table>
<pk-table id="t4" label="Products as cards" cards columns='${columns}' rows='${JSON.stringify(JSON.parse(rows).slice(0, 3))}'></pk-table>
</pk-stack></div>`,
    steps: [
        { shot: 'rest' },
        { scroll: SCROLL, to: 300 }, { wait: 300 }, { shot: 'scrolled' },
        { focus: SCROLL }, { shot: 'frame-focus' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (a wide table must scroll inside its own frame)');
        t.visible(SCROLL, 'the scroll frame'); t.scrolls(SCROLL);
        t.inViewport('#t1');
        const frame = t.rect(SCROLL), hd = t.rect('#t1 >>> thead th');
        t.ok(t.metric(SCROLL, 'clientHeight') <= 262, `the frame is ${t.metric(SCROLL, 'clientHeight')}px tall, expected its 260px maximum`);
        if (t.viewport.name === 'phone') t.ok(t.metric(SCROLL, 'scrollWidth') > t.metric(SCROLL, 'clientWidth'), 'the wide table fits the phone: the scenario no longer exercises sideways scrolling');
        if (t.shot === 'rest') {
            t.visible('#t2 >>> [part=empty]', 'the empty message'); t.hasText('#t2 >>> [part=empty]', 'No products match these filters'); t.inViewport('#t2 >>> [part=empty]');
            t.ok(t.attr('#t3 >>> [aria-busy]', 'aria-busy') === 'true', 'the loading table is not aria-busy');
            t.hidden('#t3 >>> [part=empty]', 'the empty message while loading');
            t.hasText('#t3 >>> tbody', 'Loading');
            t.hidden('#t1 >>> [part=empty]', 'the empty message of a table with rows');
            if (t.viewport.name === 'phone') {
                t.ok((t.rect('#t4 >>> thead')?.height ?? 0) <= 2, 'the header row of the cards layout takes room (it should be kept for screen readers only)');
                t.hidden('#t4 >>> tbody td[data-hide-phone]', 'the hidePhone column in cards');
                const r1 = t.rect('#t4 >>> tbody tr:nth-child(1)'), r2 = t.rect('#t4 >>> tbody tr:nth-child(2)');
                if (r1 && r2) t.ok(r2.y >= r1.bottom + 4, 'the cards touch each other (no gap between two rows)');
                t.within('#t4 >>> tbody tr:nth-child(1)', '#t4', 1);
                t.ok(t.metric('#t4 >>> [part=scroll]', 'scrollWidth') <= t.metric('#t4 >>> [part=scroll]', 'clientWidth') + 1, 'the cards layout still scrolls sideways');
                t.hasText('#t4 >>> tbody tr:nth-child(1) td:nth-child(2)', 'Widget number 1');
            } else t.visible('#t4 >>> thead th', 'the header row of the table (cards are for phones only)');
        }
        if (t.shot === 'scrolled') {
            t.ok(t.metric(SCROLL, 'scrollTop') > 100, 'the rows did not scroll');
            if (frame && hd) t.ok(Math.abs(hd.y - frame.y) <= 2, `the sticky header is at y=${Math.round(hd.y)} but the scroll frame starts at y=${Math.round(frame.y)}: the header scrolled away`);
            t.visible('#t1 >>> thead th'); t.inViewport('#t1 >>> thead th');
        }
        if (t.shot === 'frame-focus') { t.ringVisible(SCROLL); t.ringUnclipped(SCROLL); }
    },
};
