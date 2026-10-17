// Browser cases for pk-record-form (#801): the layout around the consumer's own form, pk-form's summary and focus, Save, Cancel and Delete, the busy state and the sidebar.
// Same shape as cases.js: [name, async (t) => void].
import { cpuScale } from './cpu-scale.js';
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

    ['record-form: Enter in a single-line field saves like Save (#1198): invalid shows the summary and raises nothing; valid raises once; a textarea, IME composition and modifier keys do not', async t => {
        const el = await mount(t); const saved = count(el, 'pk-record-save');
        const form = el.querySelector('form');
        form.querySelector('pk-stack').insertAdjacentHTML('beforeend', '<pk-field label="Code"><pk-input name="code"></pk-input></pk-field>');
        await t.load(form); await t.settle();
        const enter = (target, init = {}) => { const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true, ...init }); target.dispatchEvent(e); return e; };
        const code = form.querySelector('pk-input[name=code]').part('control');
        const e1 = enter(code); await t.settle(); await t.settle();
        t.ok(e1.defaultPrevented, 'the default (implicit submission) is taken over, so no double submit');
        t.ok(!el.part('form').part('summary').hidden, 'Enter on an invalid form shows the summary'); t.eq(saved.v, 0, 'and raises nothing');
        await type(t, el, 'Acme');
        enter(code); await t.settle(); await t.settle();
        t.eq(saved.v, 1, 'Enter on a valid form raises pk-record-save once');
        const area = el.querySelector('pk-textarea').part('control');
        const e2 = enter(area); await t.settle(); await t.settle();
        t.ok(!e2.defaultPrevented && saved.v === 1, 'Enter in a textarea is left alone (a newline) and does not save');
        enter(code, { isComposing: true }); await t.settle(); t.eq(saved.v, 1, 'Enter that confirms an IME composition does not save');
        for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) enter(code, { [m]: true });
        await t.settle(); t.eq(saved.v, 1, 'Enter with a modifier does not save');
        const e3 = enter(el.part('save')); await t.settle(); t.ok(!e3.defaultPrevented && saved.v === 1, 'Enter on a button is left to the button');
    }],

    ['record-form: Enter in a pk-field-group field saves like Save (#1299): invalid blocks it, valid raises once, a textarea and the busy state do not', async t => {
        const el = await t.mount('<pk-record-form><form><pk-field-group></pk-field-group></form></pk-record-form>');
        const group = el.querySelector('pk-field-group');
        group.fields = [{ key: 'name', label: 'Name', required: true }, { key: 'notes', label: 'Notes', kind: 'textarea' }];
        await t.load(el.shadowRoot); await t.load(group.shadowRoot); await t.settle(); await t.settle();
        el.querySelector('form').addEventListener('submit', e => e.preventDefault());
        const saved = count(el, 'pk-record-save');
        const enter = target => { const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }); target.dispatchEvent(e); return e; };
        const inner = key => [...group.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === key).firstElementChild.shadowRoot.querySelector('input,textarea');
        const name = inner('Name');
        const e1 = enter(name); await t.settle(); await t.settle();
        t.ok(e1.defaultPrevented, 'Enter is taken over'); t.eq(saved.v, 0, 'an invalid group blocks it');
        name.value = 'Acme'; name.dispatchEvent(new Event('input', { bubbles: true, composed: true })); name.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle();
        enter(name); await t.settle(); await t.settle(); t.eq(saved.v, 1, 'a valid group saves once');
        const e2 = enter(inner('Notes')); await t.settle(); t.ok(!e2.defaultPrevented && saved.v === 1, 'a textarea keeps its newline');
        el.busy = true; await t.settle(); enter(name); await t.settle(); await t.settle(); t.eq(saved.v, 1, 'busy does not save again');
    }],

    // #1365: typing then Enter, without leaving the field, must hand the typed value to the group's values (and pk-field-change) before pk-record-save is raised.
    ['record-form: Enter straight after typing commits the focused field before pk-record-save (#1365)', async t => {
        const el = await t.mount('<pk-record-form><form><pk-field-group></pk-field-group></form></pk-record-form>');
        const group = el.querySelector('pk-field-group');
        group.fields = [{ key: 'name', label: 'Name', required: true }];
        await t.load(el.shadowRoot); await t.load(group.shadowRoot); await t.settle(); await t.settle();
        el.querySelector('form').addEventListener('submit', e => e.preventDefault());
        const seen = [], changes = [];
        el.addEventListener('pk-record-save', () => seen.push(group.values.name));
        group.addEventListener('pk-field-change', e => changes.push(e.detail.value));
        const name = [...group.shadowRoot.querySelectorAll('pk-field')][0].firstElementChild.shadowRoot.querySelector('input');
        name.value = 'Acme'; name.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle(); // typed, never blurred: no change event
        name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
        await t.settle(); await t.settle();
        t.eq(seen.length, 1, 'one save'); t.eq(seen[0], 'Acme', 'the model holds the typed value when the save is raised'); t.eq(changes[0], 'Acme', 'pk-field-change carried it');
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
        t.ok(rect(bare.part('layout')).right <= rect(bare).right + 1, `the bare layout does not stick out past the host (${rect(bare.part('layout')).right} vs ${rect(bare).right})`);
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

    // #342: tabs as data - the element draws the strip, with a count badge and per-tab visibility.
    ['record-form: tabs array draws the strip (count badge, visible:false left out), tags show one tab at a time, a hidden active tab falls back, and a slotted pk-tabs wins (#342)', async t => {
        const body = '<form><pk-stack><pk-card id="a" tab="main">A</pk-card><pk-card id="b" tab="pricing">B</pk-card></pk-stack></form>';
        const data = [{ value: 'main', label: 'Main' }, { value: 'pricing', label: 'Pricing', count: 3 }, { value: 'audit', label: 'Audit', visible: false }];
        const el = await t.mount(`<pk-record-form tabs-from="always">${body}</pk-record-form>`); await t.load(el.shadowRoot); await t.settle();
        t.ok(el.part('tabs').hidden, 'no tabs: the row is hidden');
        el.tabs = data; await t.settle(); await t.settle();
        const strip = el.part('strip'), tabs = [...strip.querySelectorAll('pk-tab')];
        t.eq(tabs.map(x => x.getAttribute('value')).join(), 'main,pricing', 'the visible tabs are drawn, the other is left out');
        t.eq(tabs[1].getAttribute('count'), '3', 'the count is the badge'); t.ok(!el.part('tabs').hidden && strip.getBoundingClientRect().height > 0, 'the strip shows');
        t.ok(!el.querySelector('#a').hidden && el.querySelector('#b').hidden, 'the first tab\'s section shows');
        strip.value = 'pricing'; strip.dispatchEvent(new CustomEvent('pk-tab-change', { bubbles: true, composed: true, detail: { value: 'pricing', previous: 'main' } })); await t.settle();
        t.ok(el.querySelector('#a').hidden && !el.querySelector('#b').hidden, 'choosing a tab shows its sections');
        el.tabs = data.map(d => d.value === 'pricing' ? { ...d, visible: false } : d); await t.settle(); await t.settle();
        t.eq(strip.value, 'main', 'the chosen tab went: back to the first'); t.ok(!el.querySelector('#a').hidden && el.querySelector('#b').hidden, 'and its sections follow');
        const attr = await t.mount(`<pk-record-form tabs-from="always" tabs='${JSON.stringify(data)}'>${body}</pk-record-form>`); await t.load(attr.shadowRoot); await t.settle(); await t.settle();
        t.eq(attr.part('strip').querySelectorAll('pk-tab').length, 2, 'a tabs attribute draws the strip as well'); t.ok(!attr.part('tabs').hidden && attr.part('strip').getBoundingClientRect().height > 0, 'and it shows');
        const own = await t.mount(`<pk-record-form tabs-from="always"><pk-tabs slot="tabs" value="pricing"><pk-tab value="main">Main</pk-tab><pk-tab value="pricing">Pricing</pk-tab></pk-tabs>${body}</pk-record-form>`); await t.load(own.shadowRoot); own.tabs = data; await t.settle(); await t.settle();
        t.eq(own.part('strip').children.length, 0, 'a slotted pk-tabs wins: nothing is drawn'); t.ok(own.querySelector('#a').hidden && !own.querySelector('#b').hidden, 'and it decides what shows');
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

    // #1364/#1401: a host that binds load after the page drew its first (empty) answer, then calls the page's own refresh(), gets its first page without a typed search.
    ['list-page: a load set after the first draw is called by refresh() on the page, no search needed (#1364)', async t => {
        const el = await t.mount(`<pk-list-page config='{"columns":[{"key":"sku","label":"SKU"}]}' row-href-template="/p/{id}"></pk-list-page>`);
        await t.load(el.shadowRoot); await t.settle();
        let calls = 0;
        el.load = async () => { calls++; return { rows: [{ id: 'a1', sku: 'SKU-1' }], total: 1 }; };
        el.refresh();
        const rows = () => el.part('table').part('table')?.shadowRoot?.querySelectorAll('tbody tr') ?? [];
        await until(() => rows().length === 1, 'the first page after refresh()');
        t.ok(calls >= 1, 'load was called');
    }],
    // #1550: a host seeds the list from its route (config.search, sort, sortDir, page, filterValues) and reloads it after an action with refresh(), which keeps the reader's query.
    ['list-page: config seeds search, sort, page and filter values for the first load and the panel shows them; refresh() reloads with the same query; the reader\'s change wins (#1550)', async t => {
        const cfg = { columns: [{ key: 'sku', label: 'SKU', sortable: true }], filters: [{ key: 'status', type: 'select', label: 'Status', options: ['open', 'done'] }, { key: 'tags', type: 'multiselect', label: 'Tags', options: ['a', 'b'] }],
            search: 'ab', sort: 'sku', sortDir: 'descending', startPage: 3, pageSize: 10, filterValues: { status: 'open', tags: ['b'] }, searchDebounce: 0 };
        const el = await t.mount(`<pk-list-page></pk-list-page>`);
        await t.load(el.shadowRoot); await t.settle();
        const seen = [];
        el.load = async q => { seen.push(q); return { rows: [{ id: 'a1', sku: 'SKU-1' }], total: 100 }; };
        el.config = cfg; await t.settle(); await t.settle();
        await until(() => seen.length > 0, 'the first load');
        const q = seen.at(-1);
        t.eq([q.search, q.sort, q.sortDir, q.page, q.pageSize, q.filters.status, q.filters.tags.join()].join('|'), 'ab|sku|descending|3|10|open|b', 'the first load carries the seeded query');
        const table = el.part('table'), box = table.part('filters'), ctl = key => box.querySelector(`[data-key="${key}"]`);
        t.eq(ctl('status').value, 'open', 'the status field shows its seed'); t.eq(ctl('tags').value.join(), 'b', 'the multiselect shows its seed');
        t.eq(box.filterCount, 2, 'the filter count counts the seeded filters');
        await until(() => table.part('pagination').page === 3, 'the pager on page 3');
        const before = seen.length; await el.refresh(); await t.settle();
        t.ok(seen.length > before, 'refresh() loads again');
        t.eq(JSON.stringify(seen.at(-1)), JSON.stringify(q), 'with the same page, sort, search and filters');
        ctl('status').value = 'done'; ctl('status').dispatchEvent(new CustomEvent('pk-value-change', { bubbles: true, composed: true, detail: { value: 'done' } })); await t.settle(); await t.settle();
        t.eq([seen.at(-1).filters.status, seen.at(-1).page, seen.at(-1).sort].join('|'), 'done|1|sku', 'a reader\'s filter change replaces the seed, goes to page 1 and keeps the sort');
    }],
    // #436: the acceptance criteria #352 named for pk-list-page. A search string is data end to end: never markup, never script.
    ['list-page: a search string with markup and script text reaches load() verbatim and is drawn only as text - no element or handler is created from it (#436)', async t => {
        const evil = '<img src=x onerror="window.__pkXss=1"><script>window.__pkXss=1</scr' + 'ipt>';
        delete window.__pkXss;
        const el = await t.mount(`<pk-list-page config='{"columns":[{"key":"sku","label":"SKU"}],"searchDebounce":0}'></pk-list-page>`);
        await t.load(el.shadowRoot); await t.settle();
        const asked = []; el.load = async q => { asked.push(q.search); return { rows: [{ id: 'a', sku: q.search }], total: 1 }; };
        const table = el.part('table'); table.refresh(); await until(() => asked.length >= 1, 'first load');
        table.part('filters').dispatchEvent(new CustomEvent('pk-search', { bubbles: true, composed: true, detail: { query: evil } }));
        await until(() => asked.includes(evil), 'load called with the search string');
        const inner = () => table.part('table')?.shadowRoot;
        await until(() => inner()?.textContent.includes('onerror'), 'the string drawn as text'); await t.settle();
        t.eq(asked.at(-1), evil, 'load received the string unchanged');
        for (const root of [inner(), table.shadowRoot, el.shadowRoot, el]) t.ok(!root.querySelector('img, script'), 'no img or script element was created from it');
        t.ok(window.__pkXss === undefined, 'no handler ran');
    }],

    ['list-page: a 10,000-row load() result paints its first page in 100 ms or less (#436)', async t => {
        const el = await t.mount(`<pk-list-page config='{"columns":[{"key":"sku","label":"SKU"},{"key":"name","label":"Name"}]}'></pk-list-page>`);
        await t.load(el.shadowRoot); await t.settle();
        const all = Array.from({ length: 10000 }, (_, i) => ({ id: 'r' + i, sku: 'SKU-' + i, name: 'Item ' + i }));
        el.load = async q => ({ rows: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: all.length });
        const rows = () => el.part('table').part('table')?.shadowRoot?.querySelectorAll('tbody tr') ?? [];
        // Measures the work (load -> first rows in the table), not the two animation frames after it: those cost ~33 ms of scheduling whatever the code does. The 100 ms
        // budget is unchanged on an idle machine; on a loaded one it scales by how much slower a fixed workload runs right now (cpu-scale.js, #1247). The page-size
        // row count below is what proves the 10,000 rows are not all rendered.
        const scale = cpuScale();
        // Best of three: the first-paint work is measured again from a fresh refresh() (it hides the table and loads again) and the fastest counts, so one scheduling hiccup on a busy machine does not decide the case.
        let ms = Infinity;
        for (let attempt = 0; attempt < 3 && ms > 100 * scale; attempt++) {
            const t0 = performance.now(); el.part('table').refresh();
            // polled every macrotask, not every 50 ms like until(): the poll interval would be counted in the 100 ms
            for (let k = 0; k < 5000 && !(rows().length && !el.part('table').part('table').hidden); k++) await new Promise(r => setTimeout(r, 0));
            ms = Math.min(ms, performance.now() - t0);
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        t.ok(rows().length > 0, 'rows appeared');
        t.ok(rows()[0].textContent.includes('SKU-0'), 'the first page shows the first row');
        t.ok(rows().length <= 100, 'only the first page is rendered, not all 10,000 rows (' + rows().length + ' rows)');
        t.ok(ms <= 100 * scale, 'first rows of a 10,000-row result took ' + Math.round(ms) + ' ms (limit 100, x' + scale.toFixed(1) + ' for the machine load)');
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

    // #342: the page header draws the docked strip from data.
    ['page-header: tabs draws a strip docked at the foot of the header (below the title bar, inside it), a visible:false tab is left out, tabs-from=phone hides it on desktop, and a slotted pk-tabs wins (#342)', async t => {
        const data = [{ value: 'details', label: 'Details' }, { value: 'orders', label: 'Orders', count: 3 }, { value: 'audit', label: 'Audit', visible: false }];
        const make = async attrs => { const el = await t.mount(`<pk-page-header heading="Mug" ${attrs}></pk-page-header>`); await t.load(el.shadowRoot); await t.settle(); await t.settle(); return el; };
        const el = await make(`tabs='${JSON.stringify(data)}'`);
        t.eq(el.part('strip').querySelectorAll('pk-tab').length, 2, 'two tabs are drawn, the hidden one left out');
        t.ok(!el.part('tabs').hidden, 'the strip row shows');
        const head = el.part('header').getBoundingClientRect(), tabs = el.part('tabs').getBoundingClientRect(), title = el.part('titlebar').getBoundingClientRect();
        t.ok(tabs.height > 0 && tabs.top >= title.bottom - 1 && tabs.bottom <= head.bottom + 1, 'the strip sits under the title bar, inside the header');
        const wide = await make(`tabs-from="phone" tabs='${JSON.stringify(data)}'`);
        t.ok(wide.part('tabs').hidden, 'tabs-from=phone hides the strip at desktop width');
        wide.tabsFrom = 'always'; await t.settle(); await t.settle();
        t.ok(!wide.part('tabs').hidden, 'changing tabs-from applies at once');
        const own = await t.mount(`<pk-page-header heading="Mug"><pk-tabs slot="tabs"><pk-tab value="x">X</pk-tab></pk-tabs></pk-page-header>`); await t.load(own.shadowRoot); own.tabs = data; await t.settle(); await t.settle();
        t.eq(own.part('strip').children.length, 0, 'a slotted pk-tabs wins: nothing is drawn');
    }],
];
