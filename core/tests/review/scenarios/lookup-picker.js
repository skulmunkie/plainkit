// pk-lookup-picker (issue 801 step 8): the states a still example cannot show. The closed fields (empty, a chosen value, chips, invalid, disabled), the popup open with rows, the
// states of its table (loading, error, empty), a row picked, the multiple picker with ticks and chips, and the popup against the phone edge. Each popup fits the viewport and sits under
// its field. Right-to-left runs the same steps with dir=rtl on the page.
const P = id => `#${id}`;
const CTL = id => `${P(id)} >>> [part=control]`;
const PANEL = id => `${P(id)} >>> [part=popover] >>> [part=panel]`;
const TABLE = id => `${P(id)} >>> [part=table]`;
const ROWS = id => `${TABLE(id)} >>> [part=table] >>> tbody tr`;
const ALL = Array.from({ length: 30 }, (_, i) => ({ id: `C${i + 1}`, name: `Customer ${i + 1} Hardware and Fasteners`, city: i % 2 ? 'Oslo' : 'Lima' }));
const CONFIG = { columns: [{ key: 'name', label: 'Name' }, { key: 'city', label: 'City' }], pageSize: 5, searchDebounce: 50 };

export default {
    name: 'lookup-picker',
    issue: [801],
    elements: ['lookup-picker'],
    html: `<div id="stage"><pk-stack gap="md">
<pk-lookup-picker id="single" label="Customer" placeholder="Choose a customer"></pk-lookup-picker>
<pk-lookup-picker id="stored" label="Stored" selected-labels='{"C9":"Customer 9 Hardware and Fasteners"}' value="C9"></pk-lookup-picker>
<pk-lookup-picker id="multi" multiple max="4" label="Customers" placeholder="Choose customers" values='["C1","C2","C3"]' selected-labels='{"C1":"Acme","C2":"Globex","C3":"Initech"}'></pk-lookup-picker>
<pk-lookup-picker id="loading" label="Loading" placeholder="Slow list"></pk-lookup-picker>
<pk-lookup-picker id="fail" label="Failing" placeholder="Broken list"></pk-lookup-picker>
<pk-lookup-picker id="none" label="Empty" placeholder="Empty list"></pk-lookup-picker>
<pk-lookup-picker id="bad" invalid label="Invalid" placeholder="Required"></pk-lookup-picker>
<pk-lookup-picker id="off" disabled label="Disabled" placeholder="Not available"></pk-lookup-picker>
</pk-stack></div>`,
    setup(frame) {
        const config = { ...CONFIG, empty: { heading: 'No customers' }, loadError: 'Customers failed' };
        const paged = async q => { const rs = ALL.filter(r => r.name.toLowerCase().includes((q.search ?? '').toLowerCase())); return { rows: rs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rs.length }; };
        const loads = { single: paged, stored: paged, multi: paged, bad: paged, off: paged, loading: () => new Promise(() => {}), fail: () => Promise.reject(new Error('The customers could not be loaded.')), none: async () => ({ rows: [], total: 0 }) };
        for (const [id, load] of Object.entries(loads)) { const el = frame.querySelector(P(id)); el.config = config; el.load = load; }
    },
    steps: [
        { shot: 'closed' },
        { click: CTL('single') }, { wait: 500 }, { shot: 'open' },
        { key: 'ArrowDown' }, { wait: 100 }, { shot: 'row-focus' },
        { click: ROWS('single') + ':nth-child(2)' }, { wait: 200 }, { shot: 'picked' },
        { click: CTL('multi') }, { wait: 500 }, { shot: 'multi-open' },
        { key: 'Escape' }, { wait: 100 },
        { click: CTL('loading') }, { wait: 300 }, { shot: 'loading' },
        { key: 'Escape' }, { wait: 100 },
        { click: CTL('fail') }, { wait: 400 }, { shot: 'error' },
        { key: 'Escape' }, { wait: 100 },
        { click: CTL('none') }, { wait: 400 }, { shot: 'empty' },
        { key: 'Escape' }, { wait: 100 },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { click: CTL('single') }, { wait: 500 }, { shot: 'rtl-open' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'closed') {
            for (const id of ['single', 'stored', 'multi', 'bad', 'off']) { t.visible(CTL(id), `${id}: the field`); t.inViewport(CTL(id)); }
            t.atLeast(CTL('single'), 'height', t.viewport.name === 'phone' ? 44 : 32, 'the field height');
            t.hasText(`${P('stored')} >>> [part=text]`, 'Customer 9');
            t.hasText(`${P('multi')} >>> [part=text]`, '3 selected');
            t.visible(`${P('multi')} >>> [part=chips]`, 'the chips'); t.noOverlap(CTL('multi'), `${P('multi')} >>> [part=chips]`);
            t.hidden(PANEL('single'), 'the popup while closed');
        }
        if (['open', 'row-focus', 'multi-open', 'rtl-open'].includes(t.shot)) {
            const id = t.shot === 'multi-open' ? 'multi' : 'single', panel = PANEL(id);
            t.visible(panel, 'the popup'); t.inViewport(panel); t.ok(t.metric(panel, 'width') <= t.viewport.width - 8, 'the popup is narrower than the viewport (phone width check)'); t.visible(ROWS(id), 'the rows');
            t.visible(`${TABLE(id)} >>> [part=filters] >>> [part=search]`, 'the search box'); t.visible(`${TABLE(id)} >>> [part=pagination]`, 'the pager');
            t.noOverlap(CTL(id), panel, 'the popup over its own field');
            t.ok(t.viewport.name !== 'phone' || (t.rect(`${TABLE(id)} >>> [part=filters] >>> [part=search]`)?.height ?? 0) >= 44, 'the popup search box is at least 44px tall on a phone', 'the table-filters search box needs min-block-size: var(--touch-target) in its phone rule (#889)');
        }
        if (t.shot === 'picked') { t.hidden(PANEL('single'), 'the popup after a pick'); t.hasText(`${P('single')} >>> [part=text]`, 'Customer 2'); }
        if (t.shot === 'loading') { t.visible(`${TABLE('loading')} >>> [part=state] pk-skeleton`, 'the loading skeleton'); t.inViewport(PANEL('loading')); }
        if (t.shot === 'error') { t.visible(`${TABLE('fail')} >>> [part=state] pk-alert`, 'the error alert'); t.hasText(`${TABLE('fail')} >>> [part=state] pk-alert`, 'could not be loaded'); t.inViewport(PANEL('fail')); }
        if (t.shot === 'empty') { t.visible(`${TABLE('none')} >>> [part=state] pk-empty-state`, 'the empty state'); t.inViewport(PANEL('none')); }
    },
};
