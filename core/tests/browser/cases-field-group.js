// Browser cases for pk-field-group (#222, #226): rendering from specs, values and pk-change, conditional fields. Same shape as cases.js.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

export const FIELDS = [
    { key: 'name', label: 'Name', required: true, hint: 'As on the invoice.' },
    { key: 'qty', label: 'Quantity', kind: 'number', min: '1' },
    { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
    { key: 'note', label: 'Closing note', kind: 'textarea', required: true, when: { field: 'status', equals: 'closed' } },
    { key: 'rush', label: 'Rush', kind: 'checkbox' },
];

export const mountGroup = async (t, fields = FIELDS, values = { status: 'open' }, attrs = '') => {
    const el = await t.mount(`<pk-field-group label="Order" ${attrs}></pk-field-group>`);
    el.fields = fields; el.values = values;
    await t.load(el.shadowRoot); await t.settle(); await t.settle();
    return el;
};
export const fieldOf = (el, key) => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.firstElementChild?.getAttribute('aria-label') === key || f.getAttribute('label') === key || f.firstElementChild?.dataset?.key === key);
export const keys = el => [...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.getAttribute('label'));
// A committed edit the way a user makes it: through the control's own inner control.
export const type = (control, text) => { const i = control.shadowRoot.querySelector('input,textarea'); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); i.dispatchEvent(new Event('change', { bubbles: true, composed: true })); };
export const choose = (control, value) => { const s = control.shadowRoot.querySelector('select'); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true, composed: true })); };

export const fieldGroupCases = [
    ['field-group: each spec becomes a pk-field with the right control, values come from the values property, and the host is a named group', async t => {
        const el = await mountGroup(t, FIELDS, { name: 'Acme', qty: '3', status: 'open', rush: true });
        t.eq(keys(el).join('|'), 'Name|Quantity|Status|Rush', 'the closed-only note is not drawn');
        const tags = [...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.firstElementChild.localName);
        t.eq(tags.join('|'), 'pk-input|pk-input|pk-select|pk-checkbox');
        const [name, qty, status, rush] = [...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.firstElementChild);
        t.eq(name.value, 'Acme'); t.eq(qty.value, '3'); t.eq(qty.getAttribute('type'), 'number'); t.eq(status.value, 'open'); t.eq(rush.checked, true);
        t.eq(el.shadowRoot.querySelector('pk-field').getAttribute('help'), 'As on the invoice.', 'the hint is the field help');
        t.eq(el.internals.role, 'group'); t.eq(el.internals.ariaLabel, 'Order');
    }],

    ['field-group: a committed edit updates values (a new object, the host\'s is never edited) and raises pk-change with the key, value and every value', async t => {
        const given = { status: 'open' };
        const el = await mountGroup(t, FIELDS, given);
        const events = []; el.addEventListener('pk-change', e => events.push(e.detail));
        type(el.shadowRoot.querySelector('pk-field').firstElementChild, 'Acme'); await t.settle();
        t.eq(events.length, 1); t.eq(events[0].key, 'name'); t.eq(events[0].value, 'Acme'); t.eq(events[0].values.name, 'Acme'); t.eq(events[0].values.status, 'open');
        t.eq(el.values.name, 'Acme', 'values holds the commit'); t.ok(el.values !== given && given.name === undefined, 'the object the host gave is not edited');
        const rush = el.shadowRoot.querySelectorAll('pk-field')[3].firstElementChild;
        rush.shadowRoot.querySelector('input').click(); await t.settle();
        t.eq(events.at(-1).key, 'rush'); t.eq(events.at(-1).value, true);
    }],

    ['field-group: a when rule shows and hides a field after every commit, a hidden field is not in the tree, and its value is kept', async t => {
        const el = await mountGroup(t, FIELDS, { status: 'open', note: 'kept' });
        t.eq(el.shadowRoot.querySelectorAll('textarea, pk-textarea').length, 0, 'hidden: not drawn at all');
        choose(el.shadowRoot.querySelectorAll('pk-field')[2].firstElementChild, 'closed'); await t.settle(); await t.settle();
        t.ok(keys(el).includes('Closing note'), 'closed shows the note');
        const note = el.shadowRoot.querySelectorAll('pk-field')[3].firstElementChild;
        t.eq(note.localName, 'pk-textarea'); t.eq(note.value, 'kept', 'a value kept while hidden is shown again');
        choose(el.shadowRoot.querySelectorAll('pk-field')[2].firstElementChild, 'open'); await t.settle();
        t.ok(!keys(el).includes('Closing note'), 'open hides it again'); t.eq(el.values.note, 'kept', 'values keeps the hidden field');
    }],

    ['field-group: in, not and a visible() callback gate fields too; disabled and readonly reach every control; columns and span lay the fields out', async t => {
        const fields = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', when: { field: 'a', in: ['x', 'y'] } }, { key: 'c', label: 'C', when: { field: 'a', not: 'x' } }, { key: 'd', label: 'D', span: true }];
        const el = await mountGroup(t, fields, { a: 'x' }, 'columns="2"');
        t.eq(keys(el).join('|'), 'A|B|D', 'in matches, not excludes');
        el.visible = spec => spec.key !== 'd'; el.refresh(); await t.settle();
        t.eq(keys(el).join('|'), 'A|B', 'the callback hides D');
        el.visible = undefined; el.refresh(); await t.settle();
        el.disabled = true; el.readonly = true; await t.settle();
        t.ok([...el.shadowRoot.querySelectorAll('pk-field')].every(f => f.firstElementChild.hasAttribute('disabled') && f.firstElementChild.hasAttribute('readonly')), 'every control is disabled and read-only');
        t.ok(el.shadowRoot.querySelector('pk-field[data-span]'), 'span marks the field');
        const grid = el.part('group'); t.eq(grid.getAttribute('columns'), '2');
    }],
];
