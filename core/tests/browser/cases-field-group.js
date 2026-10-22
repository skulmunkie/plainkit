// Browser cases for pk-field-group (#222, #226): rendering from specs, values and pk-field-change, conditional fields. Same shape as cases.js.
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
    ['field-group: patch(fields) keeps the controls of the fields that stay (same node, same text, focus kept), applies new disabled and label, drops the ones that left and draws new ones (#1641)', async t => {
        const el = await mountGroup(t, [{ key: 'name', label: 'Name' }, { key: 'qty', label: 'Quantity', kind: 'number' }, { key: 'note', label: 'Note' }], { name: 'Acme', qty: '2' });
        const control = fieldOf(el, 'Name').firstElementChild;
        control.focus(); type(control, 'Typed'); await t.settle();
        const typing = fieldOf(el, 'Quantity').firstElementChild.shadowRoot.querySelector('input');
        typing.value = '7'; typing.dispatchEvent(new Event('input', { bubbles: true, composed: true })); // typed, not committed
        const deep = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
        const had = deep(); t.ok(had && control.shadowRoot?.contains(had), 'the control has focus before the patch (' + had?.localName + ')');
        el.patch([{ key: 'name', label: 'Name (edited)' }, { key: 'qty', label: 'Quantity', kind: 'number', disabled: true }, { key: 'extra', label: 'Extra' }]);
        await t.load(el.shadowRoot); await t.settle(); await t.settle();
        t.eq(keys(el).join('|'), 'Name (edited)|Quantity|Extra', 'the label followed, the removed field is gone and the new one is drawn');
        const same = fieldOf(el, 'Name (edited)').firstElementChild;
        t.ok(same === control, 'the control is the same node (no rebuild)');
        t.eq(el.snapshot().name, 'Typed', 'the typed text stays');
        t.eq(fieldOf(el, 'Quantity').firstElementChild.shadowRoot.querySelector('input').value, '7', 'text typed in another field and not committed yet is not written over');
        t.ok(fieldOf(el, 'Quantity').firstElementChild.hasAttribute('disabled'), 'the new disabled applies');
        t.ok(deep() === had, 'focus stays in the control');
    }],
    ['field-group: a custom field shows the editor-<key> child in its body and takes no part in values, the form or validation (#264)', async t => {
        const host = t.stage('<form><pk-field-group label="Order"><span slot="editor-sum" id="sum">Total 5</span></pk-field-group></form>');
        const el = host.querySelector('pk-field-group');
        el.fields = [{ key: 'name', label: 'Name', required: true }, { key: 'sum', label: 'Summary', kind: 'custom' }]; el.values = { name: 'Acme' };
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const field = fieldOf(el, 'Summary'), slot = field.querySelector('slot[name="editor-sum"]');
        t.eq(keys(el).join('|'), 'Name|Summary', 'both fields are drawn');
        t.ok(slot && slot.assignedNodes()[0]?.id === 'sum', 'the slotted child fills the field body');
        t.eq([...new FormData(host.firstElementChild).keys()].join(','), 'name', 'only the real field is in the form value');
        el.values = { name: '' }; await t.settle(); await t.settle();
        t.ok(el.problems().length === 1 && el.problems()[0].key === 'name', 'validation sees only the control');
    }],
    ['templated attributes: a shadow template never stamps a raw {{placeholder}} onto a child (#1188)', async t => {
        const log = await import('../../js/log.js'); await t.mount('<pk-grid></pk-grid><pk-button></pk-button>'); await t.settle(); log.clearLogBuffer(); // the children are defined first, as in an app that loaded them
        const seen = [];
        const mo = new MutationObserver(() => {});
        await t.mount('<pk-field-group label="Order" columns="2"></pk-field-group><pk-card-menu></pk-card-menu>');
        await t.settle();
        const bad = log.getLogBuffer().filter(e => (e.level === 'warn' || e.level === 'error') && /\{\{/.test(e.message)).map(e => `${e.scope}: ${e.message}`);
        t.eq(bad.join('; '), '', 'no child warned about an unresolved {{placeholder}}');
        const left = [...document.querySelectorAll('pk-field-group,pk-card-menu')].flatMap(h => [...h.shadowRoot.querySelectorAll('*')].filter(n => [...n.attributes].some(a => a.value.includes('{{'))));
        t.eq(left.length, 0, 'no stamped child kept a {{placeholder}} attribute');
    }],
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

    ['field-group: a committed edit updates values (a new object, the host\'s is never edited) and raises pk-field-change with the key, value and every value', async t => {
        const given = { status: 'open' };
        const el = await mountGroup(t, FIELDS, given);
        const events = []; el.addEventListener('pk-field-change', e => events.push(e.detail));
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

    // #1614: cols is a width in twelfths of the row; a narrow group gives a small field half the row.
    ['field-group: cols puts fields on a 12-column grid (2+2+3+3 share a row, a field without cols fills it) and a narrow group shows two per row (#1614)', async t => {
        const host = t.stage('<pk-field-group label="Box"></pk-field-group>');
        const el = host.firstElementChild;
        el.fields = [{ key: 'q', label: 'Q', kind: 'number', cols: 2 }, { key: 'g', label: 'G', cols: 2 }, { key: 'd', label: 'D', cols: 3 }, { key: 'p', label: 'P', cols: 3 }, { key: 't', label: 'T' }, { key: 'w', label: 'W', cols: 8 }, { key: 'v', label: 'V', cols: 8 }];
        host.style.width = '1200px'; await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const r = k => fieldOf(el, k).getBoundingClientRect(), box = el.getBoundingClientRect();
        t.ok(['Q', 'G', 'D', 'P'].every(k => Math.abs(r(k).top - r('Q').top) < 1) && r('Q').right <= r('G').left && r('G').right <= r('D').left && r('D').right <= r('P').left, 'four short fields share one row');
        t.ok(Math.abs(r('D').width - r('P').width) < 1 && Math.abs(r('Q').width * 1.5 - r('D').width) < 8, '2/12 is two thirds of 3/12');
        t.ok(Math.abs(r('T').width - box.width) < 1 && r('T').top > r('Q').bottom, 'a field without cols fills the row below');
        t.ok(r('V').top > r('W').bottom - 1, 'a field that does not fit wraps');
        host.style.width = '320px'; await t.settle(); await t.settle();
        t.ok(Math.abs(r('Q').top - r('G').top) < 1 && Math.abs(r('D').top - r('P').top) < 1 && r('D').top > r('Q').bottom - 1 && r('Q').width > el.getBoundingClientRect().width * 0.4, 'a narrow group shows two small fields per row, never narrower than half');
        t.ok(el.scrollWidth <= 320 + 1, 'no horizontal overflow');
    }],
    // #1314: fields share a row; the rects are what the user sees.
    ['field-group: columns=3 puts short fields side by side, columnSpan takes two columns and span the row, and a narrow group stacks them in one column (#1314)', async t => {
        const host = t.stage('<pk-field-group label="Box" columns="3"></pk-field-group>');
        const el = host.firstElementChild;
        el.fields = [{ key: 'w', label: 'W', kind: 'number' }, { key: 'h', label: 'H', kind: 'number' }, { key: 'd', label: 'D', kind: 'number' }, { key: 'n', label: 'N', columnSpan: 2 }, { key: 'u', label: 'U' }, { key: 'x', label: 'X', span: true }, { key: 'y', label: 'Y', columnSpan: 3 }];
        host.style.width = '900px'; await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const r = k => fieldOf(el, k).getBoundingClientRect(), box = el.getBoundingClientRect();
        t.ok(Math.abs(r('W').top - r('H').top) < 1 && Math.abs(r('H').top - r('D').top) < 1 && r('W').right <= r('H').left && r('H').right <= r('D').left, 'three number fields share one row');
        t.ok(r('N').width > r('W').width * 1.9 && Math.abs(r('N').top - r('U').top) < 1, 'columnSpan 2 is two columns wide and shares its row with the next field');
        t.ok(Math.abs(r('X').width - box.width) < 1 && Math.abs(r('Y').width - box.width) < 1, 'span, and a columnSpan that reaches every column, fill the row');
        host.style.width = '320px'; await t.settle(); await t.settle();
        t.ok(['W', 'H', 'D', 'N', 'U'].every(k => Math.abs(r(k).left - r('W').left) < 1 && Math.abs(r(k).width - r('W').width) < 1), 'a narrow group is one column, a span does not overflow it');
        t.ok(el.getBoundingClientRect().width <= 320 && el.scrollWidth <= 320 + 1, 'no horizontal overflow');
    }],

    // #1313: a datetime-local field.
    ['field-group: kind datetime-local is a datetime-local input that holds yyyy-MM-ddTHH:mm, commits it and validates min like date (#1313)', async t => {
        const el = await mountGroup(t, [{ key: 'at', label: 'At', kind: 'datetime-local', required: true, min: '2026-01-01T08:00' }], { at: '2026-10-14T09:30' });
        const c = el.shadowRoot.querySelector('pk-input');
        t.eq(c.getAttribute('type'), 'datetime-local'); t.eq(c.value, '2026-10-14T09:30');
        let got; el.addEventListener('pk-field-change', e => { got = e.detail; });
        type(c, '2027-02-03T18:30'); await t.settle();
        t.eq(got?.value, '2027-02-03T18:30', 'the committed value is the wall-clock text'); t.eq(el.values.at, '2027-02-03T18:30');
        type(c, '2025-12-31T10:00'); await t.settle(); await t.settle();
        t.ok(el.checkValidity() === false, 'a value before min is invalid');
        type(c, ''); await t.settle(); await t.settle();
        t.ok(el.checkValidity() === false, 'required: empty is invalid');
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
        type(el.shadowRoot.querySelectorAll('pk-input')[1], '9'); await t.settle(); await t.settle();
        t.eq(form.checkValidity(), true, 'valid again');
    }],

    ['field-group: a hidden required field does not block the form; showing it does', async t => {
        const { el, form } = await inForm(t, FIELDS, { status: 'open', name: 'Acme' });
        t.eq(form.checkValidity(), true, 'the note is required but hidden');
        choose(el.shadowRoot.querySelectorAll('pk-field')[2].firstElementChild, 'closed'); await t.settle(); await t.settle();
        for (let i = 0; i < 300 && form.checkValidity(); i++) await wait(50); // readiness wait for the on-demand control; the assertion below still decides
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

    // ---- pk-form looks through the group (step 3) ---------------------------------------------------------------------------------------
    ['field-group in pk-form: a stopped submit lists every invalid field in the summary (one line each), shows each message in its own field, focuses the first, and pk-invalid carries every problem', async t => {
        const host = await inPkForm(t, 'summary');
        const sf = host.querySelector('pk-form'), el = host.querySelector('pk-field-group'), form = host.querySelector('form');
        let invalid = 0, detail = null; sf.addEventListener('pk-invalid', e => { invalid++; detail = e.detail; });
        form.requestSubmit(); await t.settle();
        t.eq(invalid, 1, 'the submit was stopped');
        const lines = [...sf.part('summary-list').children].map(li => li.textContent);
        t.eq(lines.length, 3, 'one line per invalid field, then the plain control outside the group');
        t.eq(lines[0], 'Title: Enter a title.'); t.ok(lines[1].startsWith('Quantity: '), lines[1]); t.ok(lines[2].startsWith('Plain: '), lines[2]);
        t.eq(detail.count, 3); t.eq(detail.problems.map(p => p.label).join(','), 'Title,Quantity,Plain'); t.eq(detail.controls.length, 2, 'the group is listed once');
        const err = k => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === k).error;
        t.eq(err('Title'), 'Enter a title.'); t.ok(err('Quantity').length > 0);
        t.ok(insideFirst(el), 'focus moved to the first invalid field in the group');
        // A summary link focuses its own field, inside the group's shadow tree.
        sf.part('summary-list').children[1].firstElementChild.click(); await t.settle();
        let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
        t.ok(el.shadowRoot.querySelectorAll('pk-input')[1].shadowRoot.contains(a), 'the second link focuses the quantity');
    }],

    ['field-group in pk-form: live validation re-checks one field of the group: on blur by default, while typing in input mode, and a field already showing an error as you type', async t => {
        const host = await inPkForm(t, '');
        const el = host.querySelector('pk-field-group');
        const field = k => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === k);
        const title = el.shadowRoot.querySelector('pk-input'), inner = title.shadowRoot.querySelector('input');
        inner.value = 'x'; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle();
        t.eq(field('Title').error, '', 'typing does not check in blur mode');
        inner.value = ''; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true })); inner.focus(); inner.blur(); await t.settle(); await t.settle();
        t.eq(field('Title').error, 'Enter a title.', 'leaving the field checks it'); t.eq(field('Quantity').error, '', 'and only that field');
        inner.value = 'Acme'; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle(); await t.settle();
        t.eq(field('Title').error, '', 'a field showing an error re-checks as you type, and clears when fixed');
        const host2 = await inPkForm(t, 'validate="input"');
        const el2 = host2.querySelector('pk-field-group'), q = el2.shadowRoot.querySelectorAll('pk-input')[1].shadowRoot.querySelector('input');
        q.value = '1'; q.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle(); await t.settle();
        t.ok([...el2.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === 'Quantity').error.length > 0, 'input mode checks while typing');
    }],

    ['field-group in pk-form: a valid group submits, and a form reset clears the messages and the summary', async t => {
        const host = await inPkForm(t, 'summary');
        const sf = host.querySelector('pk-form'), el = host.querySelector('pk-field-group'), form = host.querySelector('form');
        host.querySelector('pk-input[name=plain]').remove();
        form.requestSubmit(); await t.settle();
        t.eq(sf.part('summary-list').children.length, 2, 'two problems in the group');
        form.reset(); await t.settle(); await t.settle();
        t.eq(sf.part('summary-list').children.length, 0, 'reset clears the summary'); t.eq([...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.getAttribute('label') + '=' + f.error).join(';'), 'Title=;Quantity=', 'and every message');
        el.values = { title: 'Acme', qty: '9' }; await t.settle(); await t.settle();
        let valid = 0, submitted = 0; sf.addEventListener('pk-valid', () => valid++); form.addEventListener('submit', e => { submitted++; e.preventDefault(); });
        form.requestSubmit(); await t.settle();
        t.eq(valid, 1); t.eq(submitted, 1);
    }],

    ['field-group: label-action-<key> reaches the label of a custom field too, and labelActionEnd pins it to the end of the label row', async t => {
        const host = t.stage('<pk-field-group label="Order"><b slot="label-action-w">None</b><i slot="label-action-q">kg</i><div slot="editor-w">body</div></pk-field-group>');
        const el = host.firstElementChild;
        el.fields = [{ key: 'w', label: 'Weight', kind: 'custom', labelActionEnd: true }, { key: 'q', label: 'Qty', kind: 'number' }]; el.values = {};
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const [custom, plain] = el.shadowRoot.querySelectorAll('pk-field');
        t.ok(custom.hasAttribute('action-end') && !plain.hasAttribute('action-end'), 'only the field that asks is pinned');
        t.ok(custom.shadowRoot.querySelector('slot[name="label-action"]').assignedElements({ flatten: true }).some(b => b.textContent === 'None'), 'a custom field draws its label action');
        await t.load(custom.shadowRoot); await t.settle();
        const lab = custom.part('label').getBoundingClientRect(), act = host.querySelector('b').getBoundingClientRect(), pl = plain.part('label').getBoundingClientRect(), pa = host.querySelector('i').getBoundingClientRect();
        t.ok(lab.right - act.right < 4, `the pinned action sits at the end of the label row (label right ${lab.right}, action right ${act.right})`);
        t.ok(pl.right - pa.right > 40, 'an unpinned action stays beside the label text');
    }],

    ['field-group: a combobox field with mode select is a styled select: a button, a themed list of the options, a pick is a field change (#1621)', async t => {
        const el = await mountGroup(t, [{ key: 'ch', label: 'Channel', kind: 'combobox', mode: 'select', placeholder: 'Choose', options: [{ value: 'web', label: 'Web' }, { value: 'live', label: 'Live' }] }], {});
        const combo = el.shadowRoot.querySelector('pk-combobox');
        t.eq(combo.getAttribute('mode'), 'select', 'the mode reaches the element');
        const changes = []; el.addEventListener('pk-field-change', e => changes.push(e.detail));
        combo.part('trigger').click(); await t.settle();
        const pop = combo.part('popup'); t.ok(pop && pop.getBoundingClientRect().height > 40, 'the styled list opens, not the native popup');
        t.eq(combo.querySelectorAll('option').length, 2);
        combo.value = 'live'; combo.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(el.values.ch, 'live'); t.eq(changes.at(-1)?.key, 'ch');
    }],

    ['field-group: a combobox spec with clearable shows the clear button and clearing commits an empty value as a field change (#1687)', async t => {
        const el = await mountGroup(t, [{ key: 'v', label: 'Variant', kind: 'combobox', clearable: true, options: [{ value: 'a', label: 'Alpha' }] }], { v: 'a' });
        const combo = el.shadowRoot.querySelector('pk-combobox'); t.ok(combo.hasAttribute('clearable'), 'the spec reaches the element');
        const changes = []; el.addEventListener('pk-field-change', e => changes.push(e.detail));
        combo.part('clear').click(); await t.settle(); await t.settle();
        t.eq(el.values.v, ''); t.eq(changes.at(-1)?.key, 'v');
    }],

    ['field-group: a combobox spec with debounce reaches the element, which holds pk-combo-query until typing pauses (#1720)', async t => {
        const el = await mountGroup(t, [{ key: 'v', label: 'Variant', kind: 'combobox', debounce: 250 }], {});
        const combo = el.shadowRoot.querySelector('pk-combobox'); t.eq(combo.debounce, 250, 'the spec reaches the element');
        const queries = []; combo.addEventListener('pk-combo-query', e => queries.push(e.detail.query));
        const input = combo.part('control');
        for (const text of ['a', 'ab', 'abc']) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
        t.eq(queries.length, 0, 'nothing fires while typing');
        await new Promise(r => setTimeout(r, 450));
        t.eq(queries.join('|'), 'abc', 'one query with the latest text after the pause');
    }],

    ['field-group: layout inline puts short fields and the end slot on one bottom-aligned row, wrapping on a narrow container, without the 16rem column minimum (#1688)', async t => {
        const fields = [{ key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Quantity', kind: 'number' }, { key: 'note', label: 'Note' }];
        const host = t.stage('<div><pk-field-group label="Add line" layout="inline"><pk-button slot="end" id="add">Add</pk-button><pk-button slot="end" id="cancel" variant="ghost">Cancel</pk-button></pk-field-group></div>');
        const el = host.querySelector('pk-field-group'); el.fields = fields; el.values = {};
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const fs = [...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.getBoundingClientRect()), add = host.querySelector('#add').getBoundingClientRect(), cancel = host.querySelector('#cancel').getBoundingClientRect();
        t.eq(fs.length, 3);
        t.ok(fs.every(r => Math.abs(r.top - fs[0].top) < 2) || fs.every(r => Math.abs(r.bottom - fs[0].bottom) < 2), 'the three fields share one row');
        t.ok(fs[0].right <= fs[1].left + 1 && fs[1].right <= fs[2].left + 1, 'left to right, no overlap');
        t.ok(add.left >= fs[2].right - 1 && cancel.left >= add.right - 1, 'Add and Cancel follow the fields on the same row');
        const bottom = Math.max(...fs.map(r => r.bottom)); t.ok(Math.abs(add.bottom - bottom) < 24 && add.top >= fs[0].top - 2, `the buttons sit on the fields' row (button bottom ${add.bottom}, row bottom ${bottom})`);
        t.ok(fs[0].width < 16 * 16, 'a field is not stretched to a full column');
        host.style.width = '320px'; await t.settle(); await t.settle();
        const narrow = [...el.shadowRoot.querySelectorAll('pk-field')].map(f => f.getBoundingClientRect()), box = el.getBoundingClientRect();
        t.ok(narrow.every(r => r.right <= box.right + 1 && r.left >= box.left - 1), 'on a narrow container every field stays inside it');
        t.ok(narrow[2].top > narrow[0].top + 10, 'and the row wraps');
        const grid = await t.mount('<pk-field-group label="Plain"></pk-field-group>'); t.ok(!grid.hasAttribute('layout'), 'grid stays the default');
    }],

    ['field-group: a select field with styled renders the themed list with the native select value, change, required, disabled and keyboard behaviour (#1621)', async t => {
        const opts = [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }];
        const { el, form } = await inForm(t, [{ key: 'st', label: 'Status', kind: 'select', styled: true, required: true, options: opts, msg: { required: 'Pick a status.' } }, { key: 'nat', label: 'Native', kind: 'select', options: opts }], {});
        const combo = el.shadowRoot.querySelector('pk-combobox'), native = el.shadowRoot.querySelector('pk-select');
        t.eq(combo.getAttribute('mode'), 'select', 'styled makes a select-mode combobox'); t.ok(native, 'without styled the select stays pk-select');
        t.eq(form.checkValidity(), false, 'required and empty blocks the form'); t.eq(el.validationMessage, 'Pick a status.');
        const changes = []; el.addEventListener('pk-field-change', e => changes.push(e.detail));
        const press = (x, key) => x.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
        const tr = combo.part('trigger'); tr.click(); await t.settle(); t.ok(combo.open, 'the trigger opens the list');
        press(tr, 'ArrowDown'); press(tr, 'Enter'); await t.settle(); await t.settle();
        t.ok(el.values.st, 'the keyboard picks an option'); t.eq(changes.at(-1)?.key, 'st'); t.eq(form.checkValidity(), true, 'valid once chosen');
        t.eq(entries(form).join('&'), 'st=' + el.values.st + '&nat=', 'the form value is the chosen value');
        el.values = { st: 'closed' }; await t.settle(); t.eq(combo.value, 'closed', 'a value set from outside reaches the control');
        el.disabled = true; await t.settle(); t.ok(combo.hasAttribute('disabled'), 'disabled reaches the control');
    }],

    ['field-group: an unpinned label action keeps a gap from the label text, and the pinned one still sits at the end of the row (#1632)', async t => {
        const host = t.stage('<pk-field-group label="Order"><b slot="label-action-q">kg</b><i slot="label-action-w">None</i></pk-field-group>');
        const el = host.firstElementChild;
        el.fields = [{ key: 'q', label: 'Quantity', kind: 'number' }, { key: 'w', label: 'Weight', kind: 'number', labelActionEnd: true }]; el.values = {};
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const [plain, pinned] = el.shadowRoot.querySelectorAll('pk-field');
        await t.load(plain.shadowRoot); await t.load(pinned.shadowRoot); await t.settle();
        const labText = plain.part('label').querySelector('slot[name="label"]').assignedNodes({ flatten: true }), range = document.createRange();
        const node = labText[0] ?? plain.part('label').querySelector('slot[name="label"]').firstChild; range.selectNodeContents(node);
        const gap = host.querySelector('b').getBoundingClientRect().left - range.getBoundingClientRect().right;
        t.ok(gap >= 4, `the unpinned action starts at least 4px after the label text (gap ${gap})`);
        const lab = pinned.part('label').getBoundingClientRect(), act = host.querySelector('i').getBoundingClientRect();
        t.ok(lab.right - act.right < 4, `the pinned action still sits at the end of the label row (label right ${lab.right}, action right ${act.right})`);
    }],
    ['field-group: a combobox field takes its options from the search callback, does not filter them itself, and a stale answer is dropped; a label-action slot reaches the field\'s label', async t => {
        const fields = [{ key: 'city', label: 'City', kind: 'combobox', options: [{ value: 'a', label: 'Static' }] }];
        const host = t.stage('<pk-field-group label="Where"><button slot="label-action-city" type="button">Use home</button></pk-field-group>');
        const el = host.firstElementChild; const pending = [];
        el.search = ({ key, query }) => new Promise(r => pending.push({ key, query, r }));
        el.fields = fields; el.values = {};
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const combo = el.shadowRoot.querySelector('pk-combobox');
        t.eq(combo.getAttribute('filtering'), 'off', 'the element does not filter what a search answers');
        t.eq(combo.querySelectorAll('option').length, 1, 'the static options show first');
        const q = async text => { const i = combo.part('control'); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle(); }; await q('os'); await q('osl');
        t.eq(pending.map(p => p.query).join(','), 'os,osl'); t.eq(pending[0].key, 'city');
        pending[1].r([{ value: 'oslo', label: 'Oslo' }, { value: 'osaka', label: 'Osaka' }]); await t.settle();
        pending[0].r([{ value: 'x', label: 'Stale' }]); await t.settle();
        t.eq([...combo.querySelectorAll('option')].map(o => o.value).join(','), 'oslo,osaka', 'the newest answer replaces the options and the older one is dropped');
        const slot = el.shadowRoot.querySelector('slot[name="label-action-city"]');
        t.ok(slot && slot.assignedElements().some(b => b.textContent === 'Use home'), 'the host\'s button is assigned to the field\'s label-action slot');
        const field = el.shadowRoot.querySelector('pk-field');
        t.ok(field.shadowRoot.querySelector('slot[name="label-action"]').assignedElements({ flatten: true }).some(b => b.textContent === 'Use home'), 'and flattens into the pk-field label-action slot');
        const changes = []; el.addEventListener('pk-field-change', e => changes.push(e.detail));
        const inner = combo.part('control'); inner.value = 'oslo'; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true })); inner.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle();
        t.eq(changes.at(-1)?.key, 'city', 'a committed combobox value is a field change'); t.eq(el.values.city, combo.value);
        el.search = undefined; el.refresh(); await t.settle();
        t.ok(!combo.hasAttribute('filtering'), 'without a callback the combobox filters its own options again');
    }],

    ['field-group: an async commit callback shows the field busy, the newest edit wins, a rejection or a returned message shows as the field error with the typed text kept, and pk-field-change comes only after success', async t => {
        const host = t.stage('<pk-field-group label="Order"></pk-field-group>');
        const el = host.firstElementChild, pending = [], changes = [];
        el.commit = ({ key, value }) => new Promise((resolve, reject) => pending.push({ key, value, resolve, reject }));
        el.fields = [{ key: 'name', label: 'Name' }]; el.values = { name: '' };
        el.addEventListener('pk-field-change', e => changes.push(e.detail.value));
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        const field = el.shadowRoot.querySelector('pk-field'), input = el.shadowRoot.querySelector('pk-input');
        const type = async text => { const i = input.part('control'); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true, composed: true })); i.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle(); };
        await type('a'); await type('ab');
        t.eq(pending.map(p => p.value).join(','), 'a,ab', 'every edit is handed to the host');
        t.eq(changes.length, 0, 'no pk-field-change while the commit is pending');
        t.eq(input.getAttribute('aria-busy'), 'true', 'the control is busy'); t.ok(field.querySelector('[data-busy]'), 'and the field shows it');
        pending[1].resolve(); await t.settle();
        t.eq(changes.join(','), 'ab', 'the newest edit raised pk-field-change'); t.ok(!input.hasAttribute('aria-busy'), 'and the field is no longer busy');
        pending[0].reject(new Error('stale')); await t.settle();
        t.eq(field.error, '', 'a stale completion does not show an error'); t.eq(changes.length, 1, 'or raise pk-field-change'); t.eq(el.values.name, 'ab');
        await type('abc'); pending[2].reject(new Error('Name is taken')); await t.settle();
        t.eq(field.error, 'Name is taken', 'a rejection is the field error'); t.eq(input.value, 'abc', 'the typed text stays'); t.eq(changes.length, 1, 'with no pk-field-change');
        await type('abcd'); t.eq(field.error, '', 'a new edit clears the message'); pending[3].resolve('Too long'); await t.settle();
        t.eq(field.error, 'Too long', 'a returned string is the field error'); t.eq(changes.length, 1);
        await type('abcde'); pending[4].resolve(); await t.settle();
        t.eq(field.error, ''); t.eq(changes.at(-1), 'abcde');
    }],

    ['field-group in pk-form: assigning valid values after a stopped submit lets the next submit through and clears the summary and every message', async t => {
        const fields = [{ key: 'name', label: 'Name', required: true }, { key: 'qty', label: 'Quantity', kind: 'number', min: '5' }, { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] }, { key: 'note', label: 'Note', kind: 'textarea', required: true, when: { field: 'status', equals: 'closed' } }];
        const host = t.stage('<pk-form summary><form><pk-field-group label="Order"></pk-field-group><pk-button type="submit">Save</pk-button></form></pk-form>');
        const sf = host.firstElementChild, el = host.querySelector('pk-field-group'), form = host.querySelector('form');
        el.fields = fields; el.values = { qty: '1', status: 'open' };
        await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
        let valid = 0; sf.addEventListener('pk-valid', () => valid++); form.addEventListener('submit', e => e.preventDefault());
        form.requestSubmit(); await t.settle();
        t.eq(sf.part('summary-list').children.length, 2);
        el.values = { qty: '1', status: 'closed' }; await t.settle(); await t.settle();
        await customElements.whenDefined('pk-textarea'); await t.settle(); // the Note field appears with status closed; its control loads on demand, so wait until it can validate (a slow machine took over 2 s)
        form.requestSubmit(); await t.settle();
        t.eq(sf.part('summary-list').children.length, 3);
        const err = k => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === k).error;
        t.ok(err('Name').length > 0 && err('Note').length > 0, 'messages are showing');
        el.values = { name: 'Acme', qty: '9', status: 'closed', note: 'Paid.' }; await t.settle(); await t.settle(); await t.settle();
        t.eq(err('Name') + err('Quantity') + err('Note'), '', 'values from the host clear the messages they now satisfy');
        host.querySelector('pk-button').click(); await t.settle();
        t.eq(el.problems().map(p => p.key + ':' + p.message).join(','), '', 'no problems');
        t.eq(sf.part('summary-list').children.length, 0, 'the summary is gone'); t.eq(valid, 1);
    }],
    ['field-group: a spec autocomplete reaches the drawn pk-input (text, password, email, tel, url); other kinds ignore it (#1501)', async t => {
        const el = await mountGroup(t, [
            { key: 'u', label: 'User', autocomplete: 'off' }, { key: 'p', label: 'Pass', kind: 'password', autocomplete: 'new-password' },
            { key: 'e', label: 'Mail', kind: 'email', autocomplete: 'email' }, { key: 't', label: 'Tel', kind: 'tel', autocomplete: 'tel' }, { key: 'w', label: 'Web', kind: 'url', autocomplete: 'url' },
            { key: 'plain', label: 'Plain' }, { key: 'n', label: 'Num', kind: 'number', autocomplete: 'off' }, { key: 'a', label: 'Area', kind: 'textarea', autocomplete: 'off' },
        ], {});
        const ctl = k => [...el.shadowRoot.querySelectorAll('pk-field')].find(f => f.getAttribute('label') === k).firstElementChild;
        t.eq(['User', 'Pass', 'Mail', 'Tel', 'Web'].map(k => ctl(k).getAttribute('autocomplete')).join('|'), 'off|new-password|email|tel|url', 'the spec token is the control attribute');
        t.ok(!ctl('Plain').hasAttribute('autocomplete'), 'no spec key, no attribute');
        t.ok(!ctl('Num').hasAttribute('autocomplete') && !ctl('Area').hasAttribute('autocomplete'), 'number and textarea are unchanged');
        t.eq(ctl('Pass').shadowRoot.querySelector('input').getAttribute('autocomplete'), 'new-password', 'the inner input carries it');
    }],
    ['field-group: declarative conditions (whenExpr, requiredExpr, disabledExpr, readonlyExpr) follow the live values, keep focus and need no server round trip (#1282)', async t => {
        const el = await mountGroup(t, [
            { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }] },
            { key: 'amount', label: 'Amount', kind: 'number' },
            { key: 'paidon', label: 'Paid on', kind: 'date', whenExpr: "status == 'paid'" },
            { key: 'ref', label: 'Reference', requiredExpr: 'amount > 100', disabledExpr: "status == 'void'" },
            { key: 'memo', label: 'Memo', readonlyExpr: "status in ['paid', 'void']" },
            { key: 'oops', label: 'Oops', whenExpr: "nope == 'x'" },
        ], { status: 'open' });
        await until(() => keys(el).includes('Oops'), 'the lazy condition module to load and the fields to draw'); await t.settle();
        t.eq(keys(el).join('|'), 'Status|Amount|Reference|Memo|Oops', 'Paid on is not drawn while status is not paid; an unknown field in a condition shows the field');
        const control = key => fieldOf(el, key).firstElementChild;
        t.ok(!fieldOf(el, 'Reference').hasAttribute('required'), 'not required below 100');
        choose(control('Status'), 'paid'); await until(() => keys(el).includes('Paid on'), 'Paid on to appear, keys: ' + keys(el).join('|')); await t.settle();
        t.eq(keys(el).join('|'), 'Status|Amount|Paid on|Reference|Memo|Oops', 'Paid on appears in order');
        const a = fieldOf(el, 'Amount').getBoundingClientRect(), p = fieldOf(el, 'Paid on').getBoundingClientRect(), r = fieldOf(el, 'Reference').getBoundingClientRect();
        t.ok(p.height > 0 && p.top >= a.bottom - 1 && r.top >= p.bottom - 1, 'the new field sits between Amount and Reference, in the flow');
        t.ok(control('Memo').hasAttribute('readonly'), 'readonlyExpr applied');
        let deep = document.activeElement; control('Amount').focus(); await t.settle();
        type(control('Amount'), '150'); await t.settle(); await t.settle();
        deep = document.activeElement; while (deep?.shadowRoot?.activeElement) deep = deep.shadowRoot.activeElement;
        t.ok(control('Amount').contains(deep) || control('Amount').shadowRoot?.contains(deep), 'focus stays in the field being edited while others change');
        t.ok(fieldOf(el, 'Reference').hasAttribute('required') && control('Reference').hasAttribute('required'), 'requiredExpr: required above 100');
        t.ok(el.problems().some(x => x.key === 'ref'), 'and it blocks validation while empty');
        choose(control('Status'), 'void'); await t.settle(); await t.settle();
        t.ok(control('Reference').hasAttribute('disabled') && !el.problems().some(x => x.key === 'ref'), 'disabledExpr disables the control, which takes it out of validation');
        t.eq(keys(el).includes('Paid on'), false, 'Paid on goes again');
    }],
    ['field-group: a condition may name a value the host gave that this group does not draw (a field in another card of a record page, #1600)', async t => {
        const el = await mountGroup(t, [{ key: 'name', label: 'Name' }, { key: 'seats', label: 'Seats', kind: 'number', whenExpr: "plan == 'team'" }], { plan: 'solo' });
        await until(() => keys(el).includes('Name'), 'the fields to draw'); await t.settle(); await t.settle();
        t.eq(keys(el).join('|'), 'Name', 'plan is a known value, so a false condition hides Seats instead of showing it as an unknown key');
        el.values = { plan: 'team' }; await until(() => keys(el).includes('Seats'), 'Seats to appear once the other card says team'); await t.settle();
        t.eq(keys(el).join('|'), 'Name|Seats', 'and it follows the value');
    }],
    ['field-group: labelWhenExpr and helpWhenExpr change the label and help tooltip with the live values, in place, keeping focus (#1282)', async t => {
        const el = await mountGroup(t, [
            { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'paid', label: 'Paid' }] },
            { key: 'due', label: 'Due date', kind: 'date', labelWhenExpr: "status == 'paid' ? 'Paid on' : 'Due on'", helpWhenExpr: "status == 'paid' ? 'Money arrived.' : ''" },
            { key: 'who', label: 'Who', kind: 'text', labelWhenExpr: "status == 'paid' ? 'Paid by' : nope" },
        ], { status: 'open' });
        await until(() => keys(el)[1] === 'Due on', 'the lazy module to set the label'); await t.settle();
        const row = i => el.shadowRoot.querySelectorAll('pk-field')[i], tip = i => row(i).querySelector('pk-tooltip[help]');
        t.eq(keys(el).join('|'), 'Status|Due on|Who', 'an empty answer or an unknown field keeps the plain label'); t.ok(!tip(1), 'no tooltip while the help text is empty');
        const control = row(1).firstElementChild, before = control.getBoundingClientRect();
        choose(row(0).firstElementChild, 'paid'); await until(() => keys(el)[1] === 'Paid on', 'the label to follow the status'); await t.settle();
        t.eq(keys(el).join('|'), 'Status|Paid on|Who', 'the label follows the value; an expression naming an unknown field keeps the plain label'); t.ok(tip(1) && tip(1).getAttribute('text') === 'Money arrived.', 'the help tooltip appears with the text');
        t.ok(row(1).firstElementChild === control, 'the control is the same node (no rebuild)');
        const tr = tip(1).getBoundingClientRect(), cr = control.getBoundingClientRect();
        t.ok(tr.height > 0 && tr.bottom <= cr.top + 1 && Math.abs(cr.left - before.left) < 1, 'the tooltip sits in the label row above the control, which does not move sideways');
        choose(row(0).firstElementChild, 'open'); await until(() => keys(el)[1] === 'Due on' && !tip(1), 'the label and the tooltip to go back');
    }],
];

// The group in a real form, as the app puts it.
async function inPkForm(t, attrs = '') {
    const fields = JSON.stringify([{ key: 'title', label: 'Title', required: true, msg: { required: 'Enter a title.' } }, { key: 'qty', label: 'Quantity', kind: 'number', min: '5' }]);
    const host = t.stage(`<pk-form ${attrs}><form><pk-field-group label="Order"></pk-field-group><pk-field label="Plain"><pk-input name="plain" required></pk-input></pk-field><pk-button type="submit">Save</pk-button></form></pk-form>`);
    const el = host.querySelector('pk-field-group');
    el.fields = JSON.parse(fields); el.values = { qty: '1' };
    await t.load(host); await t.load(el.shadowRoot); await t.settle(); await t.settle();
    return host;
}
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
