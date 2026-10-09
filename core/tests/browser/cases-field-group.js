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

    // ---- form association (step 2) -------------------------------------------------------------------------------------------------------
    ['field-group: it is in form.elements and its FormData has one entry per shown field: a checkbox only when checked, a hidden field none, a disabled field none', async t => {
        const { el, form } = await inForm(t, FIELDS, { name: 'Acme', qty: '3', status: 'open', rush: true, note: 'kept' });
        t.ok([...form.elements].includes(el), 'form.elements lists the group');
        t.eq(entries(form).join('&'), 'name=Acme&qty=3&status=open&rush=on', 'the closed-only note is not submitted');
        el.values = { name: 'Acme', status: 'open', rush: false }; await t.settle();
        t.eq(entries(form).join('&'), 'name=Acme&qty=&status=open', 'an unchecked box adds nothing; an empty field adds an empty entry');
        el.fields = [...FIELDS.slice(0, 2), { ...FIELDS[2], disabled: true }]; await t.settle(); await t.settle();
        t.eq(entries(form).join('&'), 'name=Acme&qty=', 'a disabled field adds nothing');
        el.disabled = true; await t.settle();
        t.eq(entries(form).join('&'), '', 'a disabled group adds nothing');
    }],

    ['field-group: prefix submits name.key; a committed edit changes the form value', async t => {
        const { el, form } = await inForm(t, FIELDS.slice(0, 3), { name: 'Acme', status: 'open' }, 'prefix');
        t.eq(entries(form).join('&'), 'order.name=Acme&order.qty=&order.status=open');
        type(el.shadowRoot.querySelector('pk-field').firstElementChild, 'Globex'); await t.settle();
        t.eq(entries(form).join('&'), 'order.name=Globex&order.qty=&order.status=open');
    }],

    ['field-group: validity is the first invalid field\'s message, anchored on it; form.checkValidity follows, and reportValidity focuses that field', async t => {
        const { el, form } = await inForm(t, [{ key: 'name', label: 'Name', required: true, msg: { required: 'Enter a name.' } }, { key: 'qty', label: 'Quantity', kind: 'number', min: '5' }], { qty: '1' });
        t.eq(form.checkValidity(), false, 'a required empty field blocks the form');
        t.eq(el.validationMessage, 'Enter a name.', 'the message is the field\'s data-msg-required');
        t.eq(el.problems().length, 2, 'problems lists every invalid field, in order'); t.eq(el.problems()[0].key, 'name');
        form.reportValidity(); await t.settle();
        { let a = document.activeElement; const p = []; while (a) { p.push(a.localName); a = a.shadowRoot?.activeElement; } t.ok(insideFirst(el), 'the browser focused the first invalid field; active: ' + p.join('>')); }
        type(el.shadowRoot.querySelector('pk-input'), 'Acme'); await t.settle();
        t.eq(el.problems().map(p => p.key).join(','), 'qty', 'only the quantity is left'); t.ok(el.validationMessage.length > 0);
        type(el.shadowRoot.querySelectorAll('pk-input')[1], '9'); await t.settle();
        t.eq(form.checkValidity(), true, 'valid again');
    }],

    ['field-group: a hidden required field does not block the form; showing it does', async t => {
        const { el, form } = await inForm(t, FIELDS, { status: 'open', name: 'Acme' });
        t.eq(form.checkValidity(), true, 'the note is required but hidden');
        choose(el.shadowRoot.querySelectorAll('pk-field')[2].firstElementChild, 'closed'); await t.settle(); await t.settle();
        t.eq(form.checkValidity(), false, 'the note shows and is empty');
        t.eq(el.problems()[0].key, 'note');
    }],

    ['field-group: report shows each problem in its own field and clears them; checkField checks one; focus goes to the first problem; a form reset restores the values', async t => {
        const { el, form } = await inForm(t, FIELDS, { status: 'open' });
        el.report(true); await t.settle();
        const err = k => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === k).error;
        t.ok(err('Name').length > 0, 'the empty required name shows its message'); t.eq(err('Quantity'), '');
        el.report(false); t.eq(err('Name'), '');
        t.eq(el.checkField('name'), false); t.ok(err('Name').length > 0);
        el.focus(); await t.settle();
        t.ok(insideFirst(el), 'focus() goes to the first invalid field');
        type(el.shadowRoot.querySelector('pk-input'), 'Typed'); await t.settle();
        t.eq(entries(form)[0], 'name=Typed');
        form.reset(); await t.settle(); await t.settle();
        t.eq(entries(form).join('&'), 'name=&qty=&status=open', 'reset goes back to the values last assigned'); t.eq(err('Name'), '', 'and clears the messages');
        t.eq(el.values.name, undefined);
    }],
];

// The group in a real form, as the app puts it.
async function inForm(t, fields = FIELDS, values = { status: 'open' }, attrs = '') {
    const host = t.stage(`<form><pk-field-group name="order" label="Order" ${attrs}></pk-field-group></form>`);
    const el = host.querySelector('pk-field-group'), form = host.firstElementChild;
    el.fields = fields; el.values = values;
    await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
    return { el, form };
}
const entries = form => [...new FormData(form).entries()].map(([k, v]) => `${k}=${v}`);
// Whether focus is inside the group's first field (through every shadow root).
function insideFirst(el) {
    let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    const first = el.shadowRoot.querySelector('pk-field')?.firstElementChild;
    return Boolean(a && first && (first.contains(a) || first.shadowRoot?.contains(a)));
}
