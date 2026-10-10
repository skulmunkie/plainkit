// Browser cases for pk-record-form (#801): the layout around the consumer's own form, pk-form's summary and focus, Save, Cancel and Delete, the busy state and the sidebar.
// Same shape as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

const FORM = '<form><pk-stack><pk-field label="Name" required><pk-input name="name" required data-msg-required="Enter a name."></pk-input></pk-field><pk-field label="Notes"><pk-textarea name="notes"></pk-textarea></pk-field></pk-stack></form>';
const mount = async (t, attrs = '', extra = '') => {
    const el = await t.mount(`<pk-record-form ${attrs}>${FORM}${extra}</pk-record-form>`);
    await t.load(el.shadowRoot); await t.settle(); await t.settle();
    el.querySelector('form').addEventListener('submit', e => e.preventDefault()); // a real page handles the submit; the test page must not navigate
    return el;
};
const button = (el, part) => el.part(part);
const press = async (t, el, part) => { button(el, part).click(); await t.settle(); await t.settle(); };
const type = async (t, el, text) => { const inner = el.querySelector('pk-input').part('control'); inner.value = text; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true })); inner.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle(); };
const count = (el, name) => { const n = { v: 0 }; el.addEventListener(name, () => n.v++); return n; };
const rect = n => n.getBoundingClientRect();

export const recordFormCases = [
    ['record-form: Save on an invalid form shows pk-form\'s summary and the message in the field, focuses the first problem and raises nothing; a valid form raises pk-record-save once', async t => {
        const el = await mount(t); const saved = count(el, 'pk-record-save');
        await press(t, el, 'save');
        const summary = el.part('form').part('summary'), list = el.part('form').part('summary-list');
        t.ok(!summary.hidden, 'the summary shows'); t.eq(list.children.length, 1); t.eq(list.children[0].textContent, 'Name: Enter a name.');
        t.eq(el.querySelector('pk-field').error, 'Enter a name.', 'the message is in the field (the consumer\'s own pk-field)');
        const input = el.querySelector('pk-input'); t.ok(document.activeElement === input || input.shadowRoot.activeElement, 'focus moved to the first invalid control');
        t.eq(saved.v, 0, 'an invalid form raises no pk-record-save');
        await type(t, el, 'Acme'); await press(t, el, 'save');
        t.eq(saved.v, 1, 'a valid form raises pk-record-save once'); t.ok(el.part('form').part('summary').hidden, 'and the summary is gone');
    }],

    ['record-form: submit() from outside and Enter in a field do what Save does; pk-form\'s own pk-valid does not leave the element', async t => {
        const el = await mount(t); const saved = count(el, 'pk-record-save'); const leaked = count(el.parentElement, 'pk-valid');
        el.submit(); await t.settle(); t.eq(saved.v, 0, 'submit() on an invalid form raises nothing');
        await type(t, el, 'Acme'); el.submit(); await t.settle(); await t.settle(); t.eq(saved.v, 1, 'submit() on a valid form raises pk-record-save');
        el.querySelector('form').requestSubmit(); await t.settle(); await t.settle(); t.eq(saved.v, 2, 'a submit of the form itself too');
        t.eq(leaked.v, 0, 'pk-valid stops inside: the element\'s own event is the contract');
    }],

    ['record-form: Cancel and Delete show only when asked, raise their own event once, Delete is disabled while busy, and Save shows its busy text, label and disabled state', async t => {
        const plain = await mount(t);
        t.ok(button(plain, 'cancel').hidden && button(plain, 'delete').hidden, 'neither shows by default');
        const el = await mount(t, 'cancellable deletable save-label="Record payout" delete-label="Remove" busy-text="Recording…"');
        const cancels = count(el, 'pk-record-cancel'), deletes = count(el, 'pk-record-delete');
        t.ok(!button(el, 'cancel').hidden && !button(el, 'delete').hidden);
        await press(t, el, 'cancel'); await press(t, el, 'delete'); t.eq(cancels.v, 1); t.eq(deletes.v, 1);
        t.ok(button(el, 'save').textContent.includes('Record payout'), 'saveLabel'); t.ok(button(el, 'delete').textContent.includes('Remove'), 'deleteLabel');
        el.busy = true; await t.settle(); await t.settle();
        t.ok(button(el, 'delete').hasAttribute('disabled'), 'Delete is disabled while busy'); t.ok(button(el, 'save').hasAttribute('busy'), 'Save is busy');
        t.eq(button(el, 'save').getAttribute('busy-text'), 'Recording…');
        el.busy = false; el.saveDisabled = true; await t.settle(); await t.settle();
        t.ok(button(el, 'save').hasAttribute('disabled') && !button(el, 'save').hasAttribute('busy'), 'saveDisabled is independent of busy');
    }],

    ['record-form: the error alert shows its message and hides when empty; actions-in-header leaves the toolbar row out; the actions slot sits between Cancel and Delete', async t => {
        const el = await mount(t, 'cancellable deletable', '<pk-button slot="actions" variant="ghost">Duplicate</pk-button>');
        t.ok(el.part('error').hidden, 'no message, no alert');
        el.error = 'The record could not be saved.'; await t.settle(); await t.settle();
        t.ok(!el.part('error').hidden); t.ok(el.part('error').textContent.includes('could not be saved'));
        const order = ['cancel', 'delete'].map(p => rect(button(el, p)).left), dup = rect(el.querySelector('[slot=actions]')).left;
        t.ok(order[0] < dup && dup < order[1], 'Duplicate sits between Cancel and Delete');
        el.actionsInHeader = true; await t.settle(); await t.settle();
        t.ok(el.part('toolbar').hidden, 'the toolbar row is left out');
        t.ok(rect(el.part('save')).width === 0, 'and so are its buttons');
    }],

    ['record-form: a sidebar sits beside the form on desktop and below it on a 375px phone; without one the form takes the whole width', async t => {
        const side = '<pk-card slot="sidebar" heading="Status"><pk-badge>Active</pk-badge></pk-card>';
        const bare = await mount(t);
        t.ok(bare.part('layout').hasAttribute('data-bare'), 'no sidebar content marks the layout bare');
        t.ok(Math.abs(rect(bare.part('form')).right - rect(bare).right) <= 2, `the form reaches the right edge (${rect(bare.part('form')).right} vs ${rect(bare).right})`);
        const el = await mount(t, '', side);
        t.ok(!el.part('layout').hasAttribute('data-bare'), 'a sidebar card clears it');
        const f = rect(el.part('form')), s = rect(el.querySelector('[slot=sidebar]'));
        t.ok(s.left >= f.right - 1 && s.top < f.bottom, 'the sidebar is beside the form on desktop');
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), frame = document.createElement('iframe');
        frame.title = 'phone'; frame.style.width = '375px'; frame.style.height = '700px'; frame.style.border = '0';
        const loaded = new Promise(r => frame.addEventListener('load', r, { once: true }));
        host.append(frame); frame.srcdoc = sampleDoc(`<pk-record-form>${FORM}${side}</pk-record-form>`); await loaded;
        // The first load event can be the blank page: read the frame's document afresh until the sample's own is there.
        const rf = await until(() => { const e = frame.contentDocument?.querySelector('pk-record-form'); return frame.contentWindow.customElements.get('pk-record-form') && e?.shadowRoot?.querySelector('[part=layout]') && e; }, 'the record form');
        await wait(1000);
        const pf = rf.part('form').getBoundingClientRect(), ps = rf.querySelector('[slot=sidebar]').getBoundingClientRect();
        t.ok(ps.top >= pf.bottom - 1, `on a phone the sidebar is below the form (${ps.top} vs ${pf.bottom})`); t.ok(pf.width > 300, 'and the form is the page width');
    }],

    // #342: sections tagged by tab, shown by breakpoint with no per-page CSS.
    ['record-form: tabs-from=always shows only the chosen tab\'s sections (form and sidebar, none-tagged always), follows the tab, and tabs-from=phone shows every section and hides the strip on desktop (#342)', async t => {
        const tabs = '<pk-tabs slot="tabs" value="main"><pk-tab value="main">Main</pk-tab><pk-tab value="pricing">Pricing</pk-tab></pk-tabs>';
        const body = '<form><pk-stack><pk-card id="a" tab="main">A</pk-card><pk-card id="b" tab="pricing">B</pk-card><pk-card id="c">C</pk-card></pk-stack></form><pk-card id="d" slot="sidebar" tab="pricing main">D</pk-card>';
        const make = async attrs => { const el = await t.mount(`<pk-record-form ${attrs}>${tabs}${body}</pk-record-form>`); await t.load(el.shadowRoot); await t.settle(); await t.settle(); return el; };
        const shown = el => ['a', 'b', 'c', 'd'].filter(id => !el.querySelector(`#${id}`).hidden).join('');
        const el = await make('tabs-from="always"');
        t.eq(shown(el), 'acd', 'the first tab\'s sections show'); t.ok(!el.part('tabs').hidden, 'the strip shows');
        el.querySelector('pk-tabs').value = 'pricing'; el.querySelector('pk-tabs').dispatchEvent(new CustomEvent('pk-tab-change', { bubbles: true, detail: { value: 'pricing' } })); await t.settle();
        t.eq(shown(el), 'bcd', 'choosing Pricing swaps the tagged sections');
        const wide = await make('');
        t.eq(shown(wide), 'abcd', 'above the phone width every section shows (the desktop layout)'); t.ok(wide.part('tabs').hidden, 'and the strip is hidden');
        wide.tabsFrom = 'always'; await t.settle(); await t.settle();
        t.eq(shown(wide), 'acd', 'changing tabs-from applies at once');
    }],

    // #342: tab-param keeps the chosen tab in the query string and opens on it.
    ['record-form: tab-param writes the chosen tab to the query (other parameters and hash kept, no history entry) and opens on the tab a link names; a bad value is ignored (#342)', async t => {
        const tabs = '<pk-tabs slot="tabs" value="main"><pk-tab value="main">Main</pk-tab><pk-tab value="pricing">Pricing</pk-tab></pk-tabs>';
        const body = '<form><pk-stack><pk-card id="a" tab="main">A</pk-card><pk-card id="b" tab="pricing">B</pk-card></pk-stack></form>';
        const make = async () => { const el = await t.mount(`<pk-record-form tabs-from="always" tab-param="tab">${tabs}${body}</pk-record-form>`); await t.load(el.shadowRoot); await t.settle(); await t.settle(); return el; };
        const before = location.href, len = history.length;
        try {
            history.replaceState(null, '', '?x=1#h');
            const el = await make();
            const strip = el.querySelector('pk-tabs');
            t.eq(strip.value, 'main', 'no parameter: the first tab');
            strip.value = 'pricing'; strip.dispatchEvent(new CustomEvent('pk-tab-change', { bubbles: true, detail: { value: 'pricing', previous: 'main' } })); await t.settle();
            t.eq(location.search, '?x=1&tab=pricing', 'the chosen tab is written, other parameters kept'); t.eq(location.hash, '#h', 'the hash is kept'); t.eq(history.length, len, 'no history entry is added');
            const again = await make();
            t.eq(again.querySelector('pk-tabs').value, 'pricing', 'a link carrying the parameter opens on that tab'); t.ok(again.querySelector('#a').hidden && !again.querySelector('#b').hidden, 'and shows that tab\'s sections');
            history.replaceState(null, '', '?tab=nope');
            t.eq((await make()).querySelector('pk-tabs').value, 'main', 'a value matching no tab is ignored');
        } finally { history.replaceState(null, '', before); }
    }],

    // #1000: what the Blazor wrapper relies on - a property set after the page connected, then refresh().
    ['list-page: clickable without rowHref makes rows clickable and a click raises pk-row-click with the row id (#1000)', async t => {
        const el = await t.mount(`<pk-list-page config='{"columns":[{"key":"sku","label":"SKU"}]}'></pk-list-page>`);
        await t.load(el.shadowRoot); await t.settle();
        el.load = async () => ({ rows: [{ id: 'a1', sku: 'SKU-1' }, { id: 'a2', sku: 'SKU-2' }], total: 2 });
        const rows = () => el.part('table').part('table')?.shadowRoot?.querySelectorAll('tbody tr') ?? [];
        el.part('table').refresh(); await until(() => rows().length === 2, 'two rows');
        const seen = []; el.addEventListener('pk-row-click', e => seen.push(e.detail));
        rows()[1].querySelector('td').click(); await t.settle();
        t.eq(seen.length, 0, 'not clickable by default');
        el.clickable = true; await t.settle(); await t.settle(); await wait(300);
        rows()[1].querySelector('td').click(); await t.settle();
        t.eq(seen.length, 1, 'one pk-row-click reaches the page host'); t.eq(seen[0].id, 'a2'); t.eq(seen[0].row.sku, 'SKU-2');
    }],

    ['record-page: load set after connect is used only once refresh() is called, which loads the record and shows Edit when save is set (#1000)', async t => {
        const el = await t.mount(`<pk-record-page config='{"id":"7","fields":[{"name":"name","label":"Name"}]}'></pk-record-page>`);
        await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const asked = []; el.load = async id => { asked.push(id); return { name: 'Ada' }; }; el.save = async () => {};
        await t.settle(); await t.settle();
        t.eq(asked.length, 0, 'setting load alone does not load');
        el.refresh(); await until(() => asked.length === 1, 'load called'); t.eq(asked[0], '7');
        await until(() => el.part('edit') && !el.part('edit').hidden, 'Edit shows once save exists');
        t.ok(el.shadowRoot.textContent.includes('Ada'), 'the loaded value is drawn');
    }],
];
