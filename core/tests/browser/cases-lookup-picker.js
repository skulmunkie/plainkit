// Browser cases for pk-lookup-picker (#801 step 8): the lazy popup, focus, keyboard, selection, labels, form value and placement. Same shape as cases.js.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const ALL = Array.from({ length: 40 }, (_, i) => ({ id: `C${i + 1}`, name: `Customer ${i + 1}`, city: i % 2 ? 'Oslo' : 'Lima' }));
const CFG = `columns='${JSON.stringify([{ key: 'name', label: 'Name' }, { key: 'city', label: 'City' }])}' page-size="5" search-debounce="20"`;
const mount = async (t, attrs = '', extra = '') => {
    const el = await t.mount(`<pk-lookup-picker label="Customer" placeholder="Choose" label-key="name" ${CFG} ${attrs}>${extra}</pk-lookup-picker>`);
    await t.load(el.shadowRoot); el.queries = [];
    el.load = async (q) => { el.queries.push(q); const rs = ALL.filter(r => r.name.toLowerCase().includes(q.search.toLowerCase())); return { rows: rs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rs.length }; };
    return el;
};
const active = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
const dt = el => el.part('table');
const tbl = el => { const d = dt(el); return typeof d?.part === 'function' ? d.part('table') : null; };
const rowEls = el => [...tbl(el)?.shadowRoot?.querySelectorAll('tbody tr[data-pk-context]') ?? []];
const popoverOf = el => el.part('popover');
const search = el => { const d = dt(el); return typeof d?.part === 'function' ? d.part('filters')?.shadowRoot?.querySelector('[part="search"]') : null; };
const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

export const lookupPickerCases = [
    ['lookup-picker: plain props give the popup its columns, page size, search label, empty state and load error (#805)', async t => {
        const el = await t.mount(`<pk-lookup-picker label="Customer" label-key="name" columns='[{"key":"name","label":"Name"}]' page-size="3" search-label="Find a customer"></pk-lookup-picker>`);
        await t.load(el.shadowRoot); const queries = [];
        el.load = async q => { queries.push(q); return { rows: ALL.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: ALL.length }; };
        el.open = true;
        await until(() => rowEls(el).length === 3, 'a first page of three rows');
        t.eq(queries.at(-1).pageSize, 3, 'page-size sets the popup page size');
        t.eq(tbl(el).shadowRoot.querySelectorAll('thead th').length, 1, 'columns sets the popup columns: one column'); t.eq(tbl(el).shadowRoot.querySelector('thead th').textContent.trim(), 'Name');
        t.eq(search(el).getAttribute('aria-label'), 'Find a customer', 'search-label names the search box');
    }],

    ['lookup-picker: the invalid field draws the error colour on its border', async t => {
        const a = await mount(t), b = await mount(t, 'invalid'), edge = el => getComputedStyle(el.part('control').shadowRoot.querySelector('button')).borderTopColor;
        t.ok(edge(b) !== edge(a), 'invalid changes the border colour');
    }],
    ['lookup-picker: a closed picker builds no table and loads nothing; opening it builds the popup, loads page one and moves focus into the search box', async t => {
        const el = await mount(t);
        const ctl = el.part('control');
        t.ok(!el.part('table'), 'no table before the first open'); t.eq(el.queries.length, 0, 'no load while closed');
        t.eq(ctl.getAttribute('aria-haspopup'), 'dialog'); t.eq(ctl.getAttribute('aria-expanded'), 'false'); t.eq(ctl.label, 'Customer: Choose', 'the field is named by the label and the placeholder');
        const panel = () => el.part('popover').shadowRoot.querySelector('[part="panel"]'); t.ok(panel().getBoundingClientRect().width === 0, 'the popup is hidden');
        ctl.click(); await t.settle();
        t.eq(ctl.getAttribute('aria-expanded'), 'true');
        await until(() => rowEls(el).length === 5, 'the first page of five rows');
        t.eq(el.queries.at(-1).page, 1);
        await until(() => active() === search(el), `focus in the search box`);
        t.eq(el.part('status').textContent, '40 results', 'the result count is announced');
        const box = ctl.getBoundingClientRect(), pop = panel().getBoundingClientRect();
        t.ok(pop.width > 0 && pop.top >= box.bottom - 1 && pop.bottom <= innerHeight + 1, 'the popup sits under the field and inside the viewport');
    }],

    ['lookup-picker: Down enters the rows, the arrows and Home/End walk them, Enter picks: the popup closes, focus returns to the field, the label shows and the form value is the key', async t => {
        const host = t.stage(`<form><pk-lookup-picker name="customer" label="Customer" label-key="name" ${CFG}></pk-lookup-picker></form>`);
        await t.load(host);
        const el = host.querySelector('pk-lookup-picker'); await t.load(el.shadowRoot); el.load = async q => ({ rows: ALL.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: ALL.length });
        const events = []; for (const n of ['input', 'change', 'pk-lookup-select']) el.addEventListener(n, e => events.push(n));
        key(el.part('control'), 'ArrowDown'); await t.settle();
        t.ok(el.open, 'Down opens'); await until(() => rowEls(el).length === 5 && active() === search(el), 'rows and focus');
        await until(() => rowEls(el)[0]?.getAttribute('tabindex') === '0', 'clickable rows (one tab stop each)');
        key(search(el), 'ArrowDown'); await t.settle();
        t.ok(active() === rowEls(el)[0], `Down from the search box focuses the first row`);
        key(active(), 'ArrowDown'); key(active(), 'ArrowDown'); t.ok(active() === rowEls(el)[2], 'Down walks the rows');
        key(active(), 'End'); t.ok(active() === rowEls(el)[4], 'End goes to the last row');
        key(active(), 'Home'); t.ok(active() === rowEls(el)[0], 'Home goes to the first');
        key(active(), 'ArrowDown'); t.ok(active() === rowEls(el)[1], 'Down moves to the second row');
        rowEls(el)[1].click(); // pk-table raises pk-row-click for a click or for Enter/Space on the focused row (its own cases cover the keys): the same activation
        await t.settle();
        t.eq(el.value, 'C2'); t.ok(!el.open, 'the popup closed'); t.ok(el.shadowRoot.activeElement === el.part('control'), 'focus is back on the field');
        t.eq(el.part('text').textContent, 'Customer 2', 'the field shows the label');
        t.eq(events.join(), 'input,change,pk-lookup-select');
        t.eq(new FormData(host.querySelector('form')).get('customer'), 'C2', 'the form submits the key');
    }],

    ['lookup-picker: Escape closes and returns focus to the field, Tab out closes, a pick-free close raises pk-lookup-toggle once, disabled and readonly never open', async t => {
        const el = await mount(t);
        const ctl = el.part('control'), toggles = []; el.addEventListener('pk-lookup-toggle', e => toggles.push(e.detail.open));
        ctl.focus(); key(ctl, 'ArrowDown'); await t.settle();
        t.ok(el.open, 'Down opens');
        await until(() => active() === search(el), 'focus in search');
        key(search(el), 'Escape'); await t.settle();
        t.eq(toggles.join(), 'true,false', 'one event per change');
        t.ok(!el.open && el.shadowRoot.activeElement === ctl, 'Escape closes and focus returns to the field');
        ctl.click(); await until(() => active() === search(el), 'reopened');
        document.body.insertAdjacentHTML('beforeend', '<button id="lp-out">out</button>'); const out = document.getElementById('lp-out');
        out.focus(); await t.settle(); out.remove();
        t.ok(!el.open, 'focus leaving closes it');
        for (const attr of ['disabled', 'readonly']) { el.toggleAttribute(attr, true); await t.settle(); ctl.click(); key(ctl, 'ArrowDown'); await t.settle(); t.ok(!el.open, `${attr}: does not open`); el.toggleAttribute(attr, false); }
    }],

    ['lookup-picker: a stored value shows its label from selectedLabels or resolve(keys) without the row being on a loaded page, and required is invalid while empty', async t => {
        const a = await mount(t, 'value="C33"');
        a.selectedLabels = { C33: 'Customer 33' }; await t.settle();
        t.eq(a.part('text').textContent, 'Customer 33', 'selectedLabels');
        const asked = [];
        const b = await t.mount(`<pk-lookup-picker label="Customer" value="C35" ${CFG}></pk-lookup-picker>`);
        await t.load(b.shadowRoot);
        b.resolve = async keys => { asked.push(keys); return [{ key: 'C35', label: 'Customer 35' }]; };
        b.requestUpdate(); await until(() => b.part('text').textContent === 'Customer 35', 'resolve to fill the label');
        t.eq(JSON.stringify(asked), '[["C35"]]', 'resolve asked once, with the key');
        const c = await t.mount(`<pk-lookup-picker label="Customer" required ${CFG}></pk-lookup-picker>`);
        t.ok(!c.checkValidity(), 'required and empty: invalid');
        c.value = 'C1'; await t.settle(); t.ok(c.checkValidity(), 'valid with a value');
    }],

    ['lookup-picker: opening twice keeps one table, a new search reloads, and paging keeps the popup open', async t => {
        const el = await mount(t);
        el.part('control').click(); await until(() => rowEls(el).length === 5, 'rows');
        const table = dt(el); el.hide(); await t.settle(); el.show(); await t.settle();
        t.ok(dt(el) === table, 'the same table is reused'); t.eq(el.part('popover').querySelectorAll('pk-data-table').length, 1);
        const box = search(el); box.value = 'Customer 3'; box.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await until(() => el.queries.at(-1).search === 'Customer 3' && rowEls(el).length === 5, 'the searched rows');
        t.eq(el.queries.at(-1).page, 1);
        t.eq(el.queries.filter(q => q.search === 'Customer 3').length, 1, 'one load per search, not one per update');
        dt(el).part('pagination').shadowRoot.querySelector('[part~="next"]')?.click(); await until(() => el.queries.at(-1).page === 2, 'page two');
        t.ok(el.open, 'paging does not close the popup');
    }],

    ['lookup-picker multiple: ticking rows keeps the popup open and makes chips, the selection survives paging and has no select-all across pages, max undoes a tick, a chip removes itself, and the form gets one entry per key', async t => {
        const host = t.stage(`<form><pk-lookup-picker multiple max="3" name="customers" label="Customers" placeholder="Choose" label-key="name" ${CFG}></pk-lookup-picker></form>`);
        await t.load(host);
        const el = host.querySelector('pk-lookup-picker'); await t.load(el.shadowRoot);
        el.load = async q => ({ rows: ALL.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: ALL.length });
        const events = []; el.addEventListener('pk-values-change', e => events.push(e.detail.values.join()));
        el.part('control').click(); await until(() => rowEls(el).length === 5, 'rows');
        const box = n => tbl(el).shadowRoot.querySelector(`[data-select="${n}"]`);
        box('C1').click(); await t.settle(); box('C2').click(); await t.settle();
        t.eq(el.values.join(), 'C1,C2'); t.ok(el.open, 'the popup stays open while ticking');
        t.eq(events.join('|'), 'C1|C1,C2');
        const chips = () => [...el.part('chips').querySelectorAll('pk-tag')];
        t.eq(chips().map(c => c.textContent).join(), 'Customer 1,Customer 2', 'one chip per key, with its label'); t.ok(!el.part('chips').hidden);
        t.eq(el.part('text').textContent, '2 selected');
        dt(el).part('pagination').shadowRoot.querySelector('[part~="next"]').click(); await until(() => box('C6'), 'page two');
        box('C6').click(); await t.settle();
        t.eq(el.values.join(), 'C1,C2,C6', 'the selection survives paging');
        box('C7').click(); await t.settle();
        t.eq(el.values.join(), 'C1,C2,C6', 'a fourth tick past max is undone'); t.eq(el.part('status').textContent, 'Limit of 3 reached');
        t.ok(!tbl(el).shadowRoot.querySelector('[part=bulk-all]') || tbl(el).shadowRoot.querySelector('[part=bulk-all]').hidden, 'no select-all across pages');
        t.eq(JSON.stringify(new FormData(host.querySelector('form')).getAll('customers')), '["C1","C2","C6"]', 'one form entry per key');
        await until(() => chips()[0].shadowRoot?.querySelector('[part=remove]'), 'the chip remove button');
        chips()[0].shadowRoot.querySelector('[part=remove]').click(); await t.settle();
        t.eq(el.values.join(), 'C2,C6'); t.eq(chips().length, 2); t.eq(el.shadowRoot.activeElement, el.part('control'), 'focus returns to the field after a chip is removed');
    }],

    ['lookup-picker multiple: values set by the host show chips from selectedLabels or one batched resolve(keys), required is invalid while empty, a reset restores the initial values', async t => {
        const host = t.stage(`<form><pk-lookup-picker multiple required name="c" label="Customers" ${CFG}></pk-lookup-picker></form>`);
        await t.load(host);
        const el = host.querySelector('pk-lookup-picker'); await t.load(el.shadowRoot);
        t.ok(!el.checkValidity(), 'required and empty: invalid');
        const asked = []; el.resolve = async keys => { asked.push(keys); return Object.fromEntries(keys.map(k => [k, `Name ${k}`])); };
        el.selectedLabels = { C9: 'Nine' }; el.values = ['C9', 'C30', 'C31']; await t.settle();
        const chips = () => [...el.part('chips').querySelectorAll('pk-tag')].map(c => c.textContent).join();
        await until(() => chips() === 'Nine,Name C30,Name C31', 'chip labels');
        t.eq(JSON.stringify(asked), '[["C30","C31"]]', 'one resolve call for the keys without a label');
        t.ok(el.checkValidity(), 'valid with values');
        host.querySelector('form').reset(); await t.settle();
        t.eq(el.values.length, 0, 'a reset restores the initial (empty) values');
    }],
];
