// Browser cases for the forms and inputs elements (pk-input, textarea, select, field, form, checkbox, radio-group, range, rating, combobox, tag-input, otp-input, colour-input,
// dropzone, button additions, button-group, split-button, switch additions, form-section, form-actions). Same shape as cases.js: [name, async (t) => void].
const ev = (type, init = {}) => new Event(type, { bubbles: true, composed: true, ...init });
const press = (el, key) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }); el.dispatchEvent(e); return e; };
const type = async (t, inner, text) => { inner.value = text; inner.dispatchEvent(ev('input')); await t.settle(); };

export const formCases = [
    ['field-group: a plain field spec renders pk-field + the right control, initial values come from data, a commit updates data and calls onChange, and pk-form\'s own validation needs no wiring', async t => {
        const { mountFieldGroup } = await import('../../modules/field-group/field-group.js');
        const host = t.stage('<pk-form><form><div id="fields"></div><pk-button type="submit">Save</pk-button></form></pk-form>'); await t.load(host);
        const data = { name: 'Ada', qty: 2, active: true, status: 'open' };
        const changes = [];
        const group = mountFieldGroup(host.querySelector('#fields'), {
            fields: [
                { key: 'name', label: 'Name', required: true },
                { key: 'qty', label: 'Quantity', kind: 'number', min: '1' },
                { key: 'active', label: 'Active', kind: 'checkbox' },
                { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
            ],
            data,
            onChange: (key, value) => changes.push([key, value]),
        });
        await t.settle();
        const [nameField, qtyField, activeField, statusField] = host.querySelectorAll('pk-field');
        const nameInput = nameField.querySelector('pk-input'), qtyInput = qtyField.querySelector('pk-input');
        const activeBox = activeField.querySelector('pk-checkbox'), statusSelect = statusField.querySelector('pk-select');
        t.eq(nameInput.value, 'Ada'); t.eq(qtyInput.value, '2'); t.ok(activeBox.checked); t.eq(statusSelect.value, 'open');
        t.eq(statusSelect.querySelectorAll('option').length, 2);

        await type(t, nameInput.part('control'), 'Grace');
        nameInput.part('control').dispatchEvent(ev('change')); await t.settle();
        t.eq(data.name, 'Grace'); t.eq(JSON.stringify(changes.at(-1)), JSON.stringify(['name', 'Grace']));

        activeBox.part('input').click(); await t.settle();
        t.eq(data.active, false); t.eq(JSON.stringify(changes.at(-1)), JSON.stringify(['active', false]));

        const f = host.querySelector('form'); let invalid = 0; host.querySelector('pk-form').addEventListener('pk-invalid', () => invalid++);
        await type(t, nameInput.part('control'), ''); f.requestSubmit(); await t.settle();
        t.eq(invalid, 1, 'a required field this module rendered is validated by pk-form with no extra wiring');

        group.refresh({ name: 'Restored', qty: 9, active: true, status: 'closed' });
        t.eq(nameInput.value, 'Restored'); t.eq(qtyInput.value, '9'); t.ok(activeBox.checked); t.eq(statusSelect.value, 'closed');

        group.destroy();
        t.eq(host.querySelectorAll('pk-field').length, 0, 'destroy removes every field it built');
    }],

    ['input: typing updates value, reports input and change, and the form receives it', async t => {
        const host = t.stage('<form><pk-input name="q" label="Query" value="a"></pk-input></form>'); await t.load(host);
        const el = host.querySelector('pk-input'); const inner = el.part('control');
        t.eq(inner.value, 'a'); t.eq(inner.getAttribute('aria-label'), 'Query', 'label is the accessible name');
        let inputs = 0; let changes = 0; el.addEventListener('input', () => inputs++); el.addEventListener('change', () => changes++);
        await type(t, inner, 'abc');
        t.eq(el.value, 'abc'); t.eq(inputs, 1); t.eq(new FormData(host.firstElementChild).get('q'), 'abc');
        inner.dispatchEvent(new Event('change', { bubbles: true })); t.eq(changes, 1, 'change is re-dispatched, composed');
        el.value = 'xyz'; await t.settle(); t.eq(inner.value, 'xyz', 'property to inner');
        host.firstElementChild.reset(); await t.settle(); t.eq(el.value, 'a', 'form reset restores the initial value');
    }],

    ['input: required and pattern set validity through ElementInternals; invalid reflects to aria-invalid', async t => {
        const el = await t.mount('<pk-input label="Code" required pattern="[A-Z]+"></pk-input>');
        t.ok(!el.checkValidity(), 'required and empty is invalid'); t.ok(el.validity.valueMissing);
        await type(t, el.part('control'), 'abc'); t.ok(el.validity.patternMismatch, 'lowercase fails the pattern');
        await type(t, el.part('control'), 'ABC'); t.ok(el.checkValidity());
        el.invalid = true; await t.settle(); t.eq(el.part('control').getAttribute('aria-invalid'), 'true'); t.ok(el.hasAttribute('invalid'));
    }],

    ['input: clear button, password reveal and the number stepper', async t => {
        const c = await t.mount('<pk-input clearable value="x"></pk-input>');
        t.ok(c.hasAttribute('has-value')); c.part('clear').click(); await t.settle(); t.eq(c.value, ''); t.ok(!c.hasAttribute('has-value'));
        const p = await t.mount('<pk-input type="password" reveal value="s3"></pk-input>');
        t.eq(p.part('control').type, 'password'); p.part('reveal').click(); await t.settle(); t.eq(p.part('control').type, 'text'); t.eq(p.part('reveal').getAttribute('aria-pressed'), 'true');
        p.part('reveal').click(); await t.settle(); t.eq(p.part('control').type, 'password');
        const n = await t.mount('<pk-input type="number" stepper min="0" max="2" value="1"></pk-input>');
        n.part('step-up').click(); await t.settle(); t.eq(n.value, '2'); t.ok(n.part('step-up').disabled, 'disabled at the maximum');
        n.part('step-down').click(); n.part('step-down').click(); await t.settle(); t.eq(n.value, '0'); t.ok(n.part('step-down').disabled);
    }],

    ['input: copyable copies the value, gives transient feedback, and disables itself while empty', async t => {
        const el = await t.mount('<pk-input type="password" label="API key" reveal copyable value="sk_live_1"></pk-input>');
        const copy = el.part('copy'); t.ok(!copy.disabled, 'a value makes the button live');
        let written = null;
        const original = navigator.clipboard;
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { written = text; } }, configurable: true });
        try {
            copy.click(); await t.settle();
            t.eq(written, 'sk_live_1', 'the current value went to the clipboard');
            t.eq(copy.getAttribute('aria-label'), 'Copied', 'transient feedback replaces the label');
            el.value = ''; await t.settle(); t.ok(copy.disabled, 'disabled once the field is empty');
        } finally {
            Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true });
        }
    }],

    ['input: money shows the plain number while editing and the formatted amount when left, and keeps the number in value', async t => {
        const el = await t.mount('<pk-input format="money" value="1234.5"></pk-input>');
        const i = el.part('control'); t.eq(i.value, '1,234.50'); t.eq(el.part('currency').textContent, '$');
        i.dispatchEvent(new Event('focus')); await t.settle(); t.eq(i.value, '1234.5');
        await type(t, i, '$99.999'); t.eq(el.value, '99.999');
        i.dispatchEvent(new Event('blur')); await t.settle(); t.eq(i.value, '100.00'); t.eq(el.value, '99.999');
        await type(t, i, 'abc'); t.ok(!el.checkValidity(), 'text that is not an amount is invalid');
    }],

    ['input: search debounces pk-search, Escape clears, and add-on slots and the floating label render', async t => {
        const el = await t.mount('<pk-input type="search" clearable debounce="30" label="Find"><span slot="prefix">$</span></pk-input>');
        const got = []; el.addEventListener('pk-search', e => got.push(e.detail.value));
        await type(t, el.part('control'), 'a'); await type(t, el.part('control'), 'ab');
        t.eq(got.length, 0, 'nothing yet'); await new Promise(r => setTimeout(r, 80)); t.eq(got.join('|'), 'ab', 'one event with the last text');
        press(el.part('control'), 'Escape'); await t.settle(); t.eq(el.value, ''); t.eq(got.at(-1), '', 'clearing reports an empty search');
        t.eq(el.slotted('prefix').length, 1);
        const f = await t.mount('<pk-input floating label="Title"></pk-input>'); t.eq(f.part('floating-label').textContent, 'Title'); t.eq(f.part('control').placeholder, ' ');
    }],

    ['textarea: value, form entry and reset; autogrow reflects', async t => {
        const host = t.stage('<form><pk-textarea name="n" label="Notes" autogrow max-height="120" value="hi"></pk-textarea></form>'); await t.load(host);
        const el = host.querySelector('pk-textarea'); const inner = el.part('control');
        t.eq(inner.value, 'hi'); await type(t, inner, 'hello'); t.eq(new FormData(host.firstElementChild).get('n'), 'hello');
        t.eq(el.style.getPropertyValue('--pk-textarea-max-height'), '120px'); t.ok(el.hasAttribute('autogrow'));
        host.firstElementChild.reset(); await t.settle(); t.eq(el.value, 'hi');
    }],

    ['select: option children become the choices, value and change flow, multiple submits one entry each', async t => {
        const host = t.stage('<form><pk-select name="s" label="Status" value="b"><option value="a">A</option><option value="b">B</option></pk-select><pk-select name="m" multiple value="x,z"><option>x</option><option>y</option><option>z</option></pk-select></form>'); await t.load(host); await t.settle();
        const [s, m] = host.querySelectorAll('pk-select');
        t.eq(s.part('control').options.length, 2); t.eq(s.part('control').value, 'b');
        s.part('control').value = 'a'; s.part('control').dispatchEvent(new Event('change', { bubbles: true })); await t.settle(); t.eq(s.value, 'a'); t.eq(new FormData(host.firstElementChild).get('s'), 'a');
        t.eq(new FormData(host.firstElementChild).getAll('m').join(','), 'x,z');
        s.insertAdjacentHTML('beforeend', '<option value="c">C</option>'); await t.settle(); t.eq(s.part('control').options.length, 3, 'children changes are picked up');
    }],

    ['field: hands label, description and error to the control; counter follows the value; required marks the control', async t => {
        const f = await t.mount('<pk-field label="Title" help="Shown on invoices." max="10" required><pk-input value="abc"></pk-input></pk-field>'); await t.settle();
        const c = f.querySelector('pk-input');
        t.eq(c.label, 'Title'); t.ok(c.required); t.ok(c.description.includes('Shown on invoices.')); t.eq(f.part('count').textContent, '3 / 10');
        await type(t, c.part('control'), 'abcdefghij'); t.eq(f.part('count').dataset.state, 'near'); await type(t, c.part('control'), 'abcdefghijk'); t.eq(f.part('count').dataset.state, 'over');
        f.error = 'Too long.'; await t.settle(); t.ok(c.invalid, 'error puts the control into the invalid state'); t.eq(c.part('control').getAttribute('aria-invalid'), 'true'); t.ok(c.description.includes('Too long.'));
        f.error = ''; await t.settle(); t.ok(!c.invalid, 'clearing the error clears what the field set');
        f.part('label').click(); t.ok(c.shadowRoot.activeElement, 'clicking the label focuses the control');
    }],

    ['form: an invalid submit is stopped, messages appear in the fields, focus goes to the first problem, and fixing clears it', async t => {
        const host = t.stage('<pk-form summary><form><pk-field label="Name"><pk-input name="n" required data-msg-required="Enter a name."></pk-input></pk-field><pk-field label="Email"><pk-input name="e" type="email" required></pk-input></pk-field><pk-button type="submit">Save</pk-button></form></pk-form>'); await t.load(host); await t.settle();
        const sf = host.firstElementChild; const f = host.querySelector('form'); const [name, mail] = host.querySelectorAll('pk-field');
        let submitted = 0; let invalid = 0; host.addEventListener('submit', e => { if (!e.defaultPrevented) submitted++; e.preventDefault(); }); sf.addEventListener('pk-invalid', () => invalid++);
        f.requestSubmit(); await t.settle();
        t.eq(invalid, 1); t.eq(name.error, 'Enter a name.'); t.ok(mail.error.length > 0, 'native message is the fallback'); t.ok(!sf.part('summary').hidden); t.eq(sf.part('summary-list').children.length, 2);
        t.eq(sf.part('summary-list').children[0].textContent, 'Name: Enter a name.', 'each summary item names its field'); t.ok(sf.part('summary-list').children[1].textContent.startsWith('Email: '), 'the native message keeps its field name in front');
        const first = host.querySelector('pk-input'); t.ok(document.activeElement === first || first.shadowRoot.activeElement, 'focus moves to the first invalid control');
        await type(t, name.querySelector('pk-input').part('control'), 'Ann'); t.eq(name.error, '', 'a shown error clears as soon as it is fixed');
        await type(t, mail.querySelector('pk-input').part('control'), ['a', 'b.co'].join('@')); f.requestSubmit(); await t.settle();
        t.eq(submitted, 1, 'a valid form is submitted'); t.ok(sf.part('summary').hidden);
    }],

    ['checkbox: toggles, submits its value only when checked, resets, and a master mirrors its group with the mixed state', async t => {
        const host = t.stage('<form><pk-checkbox name="c" value="yes" checked>C</pk-checkbox><pk-checkbox master="rows">All</pk-checkbox><pk-checkbox group="rows" checked>1</pk-checkbox><pk-checkbox group="rows">2</pk-checkbox></form>'); await t.load(host); await t.settle();
        const [c, master, a, b] = host.querySelectorAll('pk-checkbox'); const fd = () => new FormData(host.firstElementChild);
        t.eq(fd().get('c'), 'yes'); c.toggle(); await t.settle(); t.ok(!c.checked); t.eq(fd().get('c'), null); host.firstElementChild.reset(); await t.settle(); t.ok(c.checked);
        master.sync(); await t.settle(); t.ok(master.indeterminate, 'one of two is mixed');
        master.toggle(); await t.settle(); t.ok(a.checked && b.checked, 'master checks every member');
        a.toggle(); await t.settle(); t.ok(master.indeterminate && !master.checked);
        t.eq(c.part('input').getAttribute('type'), 'checkbox');
    }],

    ['radio-group: options become native radios in one group; choosing sets value and submits it; segmented is a variant', async t => {
        const host = t.stage('<form><pk-radio-group name="r" label="Cond" value="b" required><option value="a">A</option><option value="b">B</option><option value="c" disabled>C</option></pk-radio-group><pk-radio-group variant="segmented" name="v" label="View"><option value="d">Day</option><option value="w">Week</option></pk-radio-group></form>'); await t.load(host); await t.settle();
        const [g, seg] = host.querySelectorAll('pk-radio-group'); const radios = g.part('group').querySelectorAll('input');
        t.eq(radios.length, 3); t.ok(radios[1].checked); t.ok(radios[2].disabled); t.eq(g.part('group').getAttribute('role'), 'radiogroup');
        radios[0].click(); await t.settle(); t.eq(g.value, 'a'); t.eq(new FormData(host.firstElementChild).get('r'), 'a');
        t.ok(seg.hasAttribute('variant')); t.eq(seg.value, '', 'nothing chosen yet'); seg.part('group').querySelectorAll('input')[1].click(); await t.settle(); t.eq(seg.value, 'w');
        t.ok(!g.hasAttribute('invalid'));
    }],

    ['range: single value and fill; dual keeps low below high and submits two entries', async t => {
        const host = t.stage('<form><pk-range name="s" value="25"></pk-range><pk-range name="d" dual value-low="20" value-high="80" output></pk-range></form>'); await t.load(host); await t.settle();
        const [s, d] = host.querySelectorAll('pk-range');
        t.eq(s.style.getPropertyValue('--f'), '0.25'); s.part('control').value = '60'; s.part('control').dispatchEvent(ev('input')); await t.settle(); t.eq(s.value, 60); t.eq(new FormData(host.firstElementChild).get('s'), '60');
        const lo = d.part('control'); lo.value = '95'; lo.dispatchEvent(ev('input')); await t.settle();
        t.eq(d.valueLow, 80, 'the low thumb stops at the high one'); t.eq(new FormData(host.firstElementChild).getAll('d').join(','), '80,80'); t.eq(d.part('output').textContent, '80 to 80');
    }],

    ['rating: stars are radios, choosing sets value, readonly is an image with a text alternative', async t => {
        const r = await t.mount('<pk-rating label="Score" value="3"></pk-rating>');
        const stars = r.part('group').querySelectorAll('input'); t.eq(stars.length, 5); t.ok(stars[2].checked); t.eq(stars[0].getAttribute('aria-label'), '1 star');
        stars[3].click(); await t.settle(); t.eq(r.value, 4); t.eq(r.part('group').querySelectorAll('.on').length, 4);
        const ro = await t.mount('<pk-rating readonly value="4"></pk-rating>'); t.eq(ro.part('group').getAttribute('role'), 'img'); t.eq(ro.part('group').getAttribute('aria-label'), '4 out of 5 stars'); t.eq(ro.part('group').querySelectorAll('input').length, 0);
    }],

    ['combobox: typing filters, arrows and Enter pick, Escape closes; blur reverts stray text; select mode uses the trigger and typeahead', async t => {
        const host = t.stage('<form><pk-combobox name="v" label="Variant"><option value="1">Widget A</option><option value="2">Gadget</option><option value="3">Widget C</option></pk-combobox><pk-combobox mode="select" name="c" label="Channel" placeholder="Pick"><option value="s">Web</option><option value="e">Market</option></pk-combobox></form>'); await t.load(host); await t.settle();
        const [ac, sel] = host.querySelectorAll('pk-combobox'); const inp = ac.part('control'); const ops = () => [...ac.part('popup').querySelectorAll('.op')];
        t.eq(ops().length, 3); await type(t, inp, 'widget'); t.ok(ac.open); t.eq(ops().filter(o => !o.hidden).length, 2); t.eq(inp.getAttribute('aria-activedescendant'), ops()[0].id);
        press(inp, 'ArrowDown'); await t.settle(); t.ok(ops()[2].classList.contains('hl'), 'ArrowDown moves the highlight');
        press(inp, 'Enter'); await t.settle(); t.eq(ac.value, '3'); t.eq(inp.value, 'Widget C'); t.ok(!ac.open); t.eq(new FormData(host.firstElementChild).get('v'), '3');
        await type(t, inp, 'zzz'); t.ok(!ac.part('empty').hidden, 'no match message'); press(inp, 'Escape'); await t.settle(); t.ok(!ac.open);
        inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true })); await t.settle(); t.eq(inp.value, 'Widget C', 'stray text reverts to the chosen option');
        const tr = sel.part('trigger'); t.eq(tr.dataset.placeholder, 'Pick'); tr.click(); await t.settle(); t.ok(sel.open); press(tr, 'ArrowDown'); press(tr, 'Enter'); await t.settle(); t.eq(sel.value, 's'); t.eq(tr.textContent, 'Web');
        press(tr, 'm'); await t.settle(); t.eq(sel.value, 'e', 'a letter on the closed trigger picks the match');
    }],

    ['tag-input: Enter and separators add, duplicates and the limit are refused, Backspace and the cross remove, the form gets one entry per tag', async t => {
        const host = t.stage('<form><pk-tag-input name="t" label="Tags" value="dc" max="3"></pk-tag-input></form>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-tag-input'); const f = el.part('field'); const labels = () => [...el.part('box').querySelectorAll('.pl')].map(x => x.textContent);
        t.eq(labels().join(), 'dc'); f.value = 'variant'; press(f, 'Enter'); await t.settle(); t.eq(el.value, 'dc,variant');
        f.value = 'DC'; press(f, 'Enter'); await t.settle(); t.ok(el.part('status').textContent.includes('already')); t.eq(labels().length, 2);
        f.value = 'foil'; press(f, ','); await t.settle(); f.value = 'x'; press(f, 'Enter'); await t.settle(); t.eq(labels().length, 3, 'the limit holds'); t.ok(el.part('status').textContent.includes('limit'));
        t.eq(new FormData(host.firstElementChild).getAll('t').join(), 'dc,variant,foil');
        press(f, 'Backspace'); await t.settle(); t.eq(labels().join(), 'dc,variant');
        el.part('box').querySelector('.px').click(); await t.settle(); t.eq(labels().join(), 'variant');
        let changes = 0; el.addEventListener('pk-tags-change', () => changes++); f.value = 'a'; f.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await t.settle(); t.eq(changes, 1, 'leaving the field adds what is typed');
    }],

    ['tag-input: locked tags render before the editable ones, without a remove button, and Backspace never touches them', async t => {
        const host = t.stage('<pk-tag-input label="Tags" locked-tags="system" locked-title="Inferred" value="dc,variant"></pk-tag-input>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-tag-input'); const f = el.part('field'); const pills = () => [...el.part('box').querySelectorAll('.pill')];
        t.eq(pills().map(p => p.querySelector('.pl').textContent).join(), 'system,dc,variant');
        const locked = pills()[0];
        t.ok(locked.hasAttribute('data-locked')); t.eq(locked.title, 'Inferred'); t.eq(locked.querySelector('.px'), null);
        t.eq(el.value, 'dc,variant', 'the locked tag never joins value');
        press(f, 'Backspace'); await t.settle(); t.eq(el.value, 'dc', 'Backspace removes only the last editable tag, never a locked one');
        for (let i = 0; i < 3; i++) { press(f, 'Backspace'); await t.settle(); }
        t.eq(pills().map(p => p.querySelector('.pl').textContent).join(), 'system', 'the locked tag survives removing every editable one');
    }],

    ['otp-input: typing advances, a pasted or autofilled code spreads, Backspace steps back, completion is an event', async t => {
        const host = t.stage('<form><pk-otp-input name="code" length="4" label="Code"></pk-otp-input></form>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-otp-input'); const cells = () => [...el.part('group').querySelectorAll('input')]; t.eq(cells().length, 4); t.eq(cells()[1].getAttribute('aria-label'), 'Digit 2 of 4');
        let done = ''; el.addEventListener('pk-otp-complete', e => { done = e.detail.value; });
        cells()[0].value = '7'; cells()[0].dispatchEvent(ev('input')); await t.settle(); t.eq(el.value, '7'); t.eq(el.shadowRoot.activeElement, cells()[1]);
        cells()[1].value = 'x'; cells()[1].dispatchEvent(ev('input')); await t.settle(); t.eq(el.value, '7', 'letters are refused in numeric mode');
        cells()[0].value = '1234'; cells()[0].dispatchEvent(ev('input')); await t.settle(); t.eq(el.value, '1234'); t.eq(done, '1234'); t.eq(new FormData(host.firstElementChild).get('code'), '1234');
        cells()[3].value = ''; press(cells()[3], 'Backspace'); await t.settle(); t.eq(el.shadowRoot.activeElement, cells()[2]);
    }],

    ['colour-input: the swatch and hex field stay in step, short hex is expanded, junk is invalid', async t => {
        const host = t.stage('<form><pk-colour-input name="c" value="#4a90e2" label="Accent"></pk-colour-input></form>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-colour-input'); const sw = el.part('swatch'); const hex = el.part('control');
        t.eq(sw.value, '#4a90e2'); t.eq(hex.value, '#4a90e2'); await type(t, hex, 'F00'); t.eq(el.value, '#ff0000'); t.eq(sw.value, '#ff0000');
        sw.value = '#112233'; sw.dispatchEvent(ev('input')); await t.settle(); t.eq(hex.value, '#112233');
        await type(t, hex, 'zz'); t.ok(!el.checkValidity()); t.eq(hex.getAttribute('aria-invalid'), 'true'); t.eq(new FormData(host.firstElementChild).get('c'), '#112233', 'the last good colour is submitted');
    }],

    ['textarea and colour-input: show-label shows a visible label linked to the control, hidden by default', async t => {
        for (const tag of ['pk-textarea', 'pk-colour-input']) {
            const el = await t.mount('<' + tag + ' label="Notes"></' + tag + '>'); await t.settle();
            const l = el.part('label'); t.eq(getComputedStyle(l).display, 'none', tag + ' label hidden by default');
            el.showLabel = true; await t.settle(); t.ok(el.hasAttribute('show-label')); t.ok(getComputedStyle(l).display !== 'none'); t.eq(l.textContent, 'Notes'); t.eq(l.htmlFor, 'c'); t.eq(el.shadowRoot.getElementById('c'), el.part('control'));
        }
    }],

    ['dropzone: accepted files are listed and submitted, rejected ones get a reason, Remove drops a file', async t => {
        const host = t.stage('<form><pk-dropzone name="f" label="Files" accept=".csv" multiple max-size="1KB" max-files="2">Drop</pk-dropzone></form>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-dropzone'); const input = el.part('control');
        const dt = new DataTransfer(); for (const [n, s] of [['a.csv', 10], ['b.exe', 10], ['c.csv', 5000], ['d.csv', 10], ['e.csv', 10]]) dt.items.add(new File([new Uint8Array(s)], n));
        let got; el.addEventListener('pk-files', e => { got = e.detail; });
        input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(got.files.map(f => f.name).join(), 'a.csv,d.csv'); t.eq(got.rejected.length, 3); t.eq(el.part('list').children.length, 5);
        t.eq(new FormData(host.firstElementChild).getAll('f').length, 2, 'the form submits the accepted files');
        el.part('list').querySelector('.rm').click(); await t.settle(); t.eq(el.files.map(f => f.name).join(), 'd.csv');
        el.part('zone').dispatchEvent(new Event('dragover', { cancelable: true })); t.ok(el.hasAttribute('dragover')); el.part('zone').dispatchEvent(new Event('dragleave')); t.ok(!el.hasAttribute('dragover'));
    }],

    ['button: busy ignores clicks without losing focus, a toggle flips pressed and reports it, icon and block reflect', async t => {
        const b = await t.mount('<pk-button busy busy-text="Saving">Save</pk-button>'); let clicks = 0; b.addEventListener('click', () => clicks++);
        b.part('control').click(); b.click(); t.eq(clicks, 0, 'a busy button swallows clicks'); t.ok(!b.part('control').disabled, 'and stays focusable'); t.ok(!b.part('spinner').hidden); t.eq(b.part('control').getAttribute('aria-busy'), 'true'); t.ok(b.hasAttribute('has-busy-text'));
        b.busy = false; await t.settle(); b.click(); t.eq(clicks, 1);
        const tg = await t.mount('<pk-button toggle value="bold">B</pk-button>'); let seen; tg.addEventListener('pk-toggle', e => { seen = e.detail; });
        t.eq(tg.part('control').getAttribute('aria-pressed'), 'false'); tg.click(); await t.settle(); t.ok(tg.pressed); t.eq(seen.value, 'bold'); t.eq(tg.part('control').getAttribute('aria-pressed'), 'true'); t.ok(tg.hasAttribute('pressed'));
    }],

    ['button link: href renders an anchor that keeps its slots and takes target, rel and download; disabled and busy drop the href and swallow the click', async t => {
        const b = await t.mount('<pk-button href="#x" download="a.csv" variant="secondary" label="Go now">Go</pk-button>'); t.ok(!b.part('control').hasAttribute('rel')); b.target = '_blank'; await t.settle();
        let c = b.part('control'); t.eq(c.localName, 'a'); t.eq(c.getAttribute('href'), '#x'); t.eq(c.getAttribute('target'), '_blank'); t.eq(c.getAttribute('rel'), 'noopener', 'noopener is the default for _blank'); t.eq(c.getAttribute('download'), 'a.csv'); t.eq(c.getAttribute('role'), 'link'); t.eq(c.getAttribute('aria-label'), 'Go now');
        t.eq(c.querySelector('slot:not([name])').assignedNodes().length, 1, 'the label stays slotted');
        let clicks = 0; b.addEventListener('click', e => { e.preventDefault(); clicks++; });
        c.click(); t.eq(clicks, 1, 'a link still fires click, and the host can cancel the navigation');
        b.rel = 'nofollow'; await t.settle(); t.eq(b.part('control').getAttribute('rel'), 'nofollow', 'an explicit rel wins');
        b.disabled = true; await t.settle(); c = b.part('control'); t.ok(!c.hasAttribute('href') && !c.hasAttribute('download'), 'disabled drops the href'); t.eq(c.getAttribute('aria-disabled'), 'true'); t.eq(c.getAttribute('role'), 'link');
        const ev = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }); c.dispatchEvent(ev); t.ok(ev.defaultPrevented && clicks === 1, 'disabled swallows the click');
        b.disabled = false; b.busy = true; await t.settle(); c = b.part('control'); t.ok(!c.hasAttribute('href')); t.eq(c.getAttribute('aria-disabled'), 'true'); t.eq(c.getAttribute('tabindex'), '0', 'a busy link stays a tab stop'); t.ok(!b.part('spinner').hidden, 'the spinner moved with the children');
        b.busy = false; await t.settle(); c = b.part('control'); t.eq(c.getAttribute('href'), '#x'); t.ok(!c.hasAttribute('aria-disabled') && !c.hasAttribute('tabindex'));
        b.removeAttribute('href'); await t.settle(); c = b.part('control'); t.eq(c.localName, 'button', 'without an href it is a button again'); t.eq(c.querySelector('slot:not([name])').assignedNodes().length, 1); t.eq(c.getAttribute('aria-label'), 'Go now');
        const d = await t.mount('<pk-button href="#y" download>File</pk-button>'); t.eq(d.part('control').getAttribute('download'), '', 'a bare download attribute keeps the URL file name');
    }],

    ['button link: focus lands on the anchor, a link ignores type and toggle, and a submit button still submits its form', async t => {
        const b = await t.mount('<pk-button href="#x" toggle type="submit">Open</pk-button>'); b.addEventListener('click', e => e.preventDefault()); b.focus(); t.ok(b.matches(':focus') && b.shadowRoot.activeElement === b.part('control') && b.part('control').localName === 'a', 'delegated focus reaches the link');
        b.part('control').click(); await t.settle(); t.ok(!b.pressed, 'a link does not toggle'); t.ok(!b.part('control').hasAttribute('aria-pressed'));
        const host = t.stage('<form><input name="q" value="1"><pk-button type="submit">Send</pk-button></form>'); await t.load(host); let submitted = 0; host.querySelector('form').addEventListener('submit', e => { e.preventDefault(); submitted++; });
        host.querySelector('pk-button').part('control').click(); await t.settle(); t.eq(submitted, 1, 'the button form is unchanged');
    }],

    ['button-group: single mode keeps exactly one toggle pressed', async t => {
        const g = await t.mount('<pk-button-group mode="single" label="Density"><pk-button toggle pressed>A</pk-button><pk-button toggle>B</pk-button></pk-button-group>'); await t.load(g);
        const [a, b] = g.querySelectorAll('pk-button'); b.click(); await t.settle(); t.ok(b.pressed && !a.pressed); b.click(); await t.settle(); t.ok(b.pressed, 'the pressed one cannot be released'); t.eq(g.part('group').getAttribute('role'), 'group');
    }],

    ['button-group: single mode works as a segmented control (value per button, pk-toggle bubbles to the group)', async t => {
        const g = await t.mount('<pk-button-group mode="single" label="Theme"><pk-button toggle pressed value="dark">Dark</pk-button><pk-button toggle value="light">Light</pk-button></pk-button-group>'); await t.load(g);
        const [d, l] = g.querySelectorAll('pk-button'); const seen = []; g.addEventListener('pk-toggle', e => { if (e.detail.pressed) seen.push(e.detail.value); });
        l.click(); await t.settle(); t.eq(seen.join(), 'light'); t.ok(l.pressed && !d.pressed); t.eq(d.part('control').getAttribute('aria-pressed'), 'false'); t.eq(l.part('control').getAttribute('aria-pressed'), 'true');
    }],

    ['split-button: the caret opens the menu, arrows and Escape work, choosing reports and closes', async t => {
        const s = await t.mount('<pk-split-button toggle-label="More"><span>Save</span><button slot="menu" value="close">Save and close</button><button slot="menu" value="new">Save and new</button></pk-split-button>'); await t.settle();
        t.ok(s.part('menu').hidden); t.eq(s.part('toggle').getAttribute('aria-label'), 'More'); t.eq(s.querySelector('button').getAttribute('role'), 'menuitem');
        s.part('toggle').click(); await t.settle(); t.ok(!s.part('menu').hidden); t.eq(s.part('toggle').getAttribute('aria-expanded'), 'true');
        press(s.part('toggle'), 'Escape'); await t.settle(); t.ok(s.part('menu').hidden);
        press(s.part('toggle'), 'ArrowDown'); await t.settle(); await t.settle(); t.eq(document.activeElement, s.querySelector('button'), 'ArrowDown opens onto the first item');
        let chosen; s.addEventListener('pk-split-select', e => { chosen = e.detail; }); s.querySelectorAll('button')[1].click(); await t.settle();
        t.eq(chosen.value, 'new'); t.ok(!s.open);
    }],

    ['switch: invalid, size and label position reflect and the invalid ring shows', async t => {
        const s = await t.mount('<pk-switch invalid size="lg" label-position="between">Alerts</pk-switch>');
        t.ok(s.hasAttribute('invalid')); t.eq(s.size, 'lg'); t.eq(s.labelPosition, 'between'); t.eq(s.part('control').getAttribute('aria-invalid'), 'true');
    }],

    ['form-section and form-actions: heading, description and status render from props and slots', async t => {
        const s = await t.mount('<pk-form-section heading="Profile" description="Shown on invoices."><span>Body</span></pk-form-section>');
        t.eq(s.part('title').textContent.trim(), 'Profile'); t.eq(s.part('description').textContent.trim(), 'Shown on invoices.'); t.eq(s.slotted().length, 1);
        const a = await t.mount('<pk-form-actions sticky align="end"><span slot="status">Unsaved</span><button>Save</button></pk-form-actions>');
        t.ok(a.hasAttribute('sticky')); t.eq(a.slotted('status').length, 1); t.eq(a.slotted().length, 1);
    }],

    ['select: a value set from outside (a Blazor re-render) moves the inner select', async t => {
        const s = await t.mount('<pk-select label="S" value="a"><option value="a">A</option><option value="b">B</option><option value="">None</option></pk-select>'); await t.settle();
        t.eq(s.part('control').value, 'a'); s.setAttribute('value', 'b'); await t.settle(); t.eq(s.part('control').value, 'b');
        s.removeAttribute('value'); await t.settle(); t.eq(s.part('control').value, '', 'no value picks the empty option');
    }],

    ['dropzone: with an input in the input slot the zone only draws the target and drops go into that input', async t => {
        const host = t.stage('<pk-dropzone><span slot="input"><input type="file" multiple></span>Drop</pk-dropzone>'); await t.load(host); await t.settle();
        const z = host.firstElementChild; const input = z.querySelector('input'); t.ok(z.hasAttribute('has-input'));
        let changes = 0; input.addEventListener('change', () => changes++);
        const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.csv'));
        const drop = new Event('drop', { cancelable: true }); drop.dataTransfer = dt; z.part('zone').dispatchEvent(drop);
        t.eq(input.files.length, 1); t.eq(changes, 1, 'the slotted input reports the change so Blazor can read it');
    }],

    ['dropzone: an input placed directly in the input slot (Blazor InputFile) gets one file unless multiple, and a drop without files changes nothing', async t => {
        const host = t.stage('<pk-dropzone><input slot="input" type="file">Drop</pk-dropzone>'); await t.load(host); await t.settle();
        const z = host.firstElementChild; const input = z.querySelector('input'); t.ok(z.hasAttribute('has-input'));
        let changes = 0; input.addEventListener('change', () => changes++);
        const drop = files => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); const e = new Event('drop', { cancelable: true }); e.dataTransfer = dt; z.part('zone').dispatchEvent(e); };
        drop([new File(['x'], 'a.csv'), new File(['y'], 'b.csv')]);
        t.eq(input.files.length, 1, 'a single-file input keeps the first file, like a native drop'); t.eq(input.files[0].name, 'a.csv'); t.eq(changes, 1);
        drop([]); t.eq(changes, 1, 'no files, no change event'); t.eq(input.files.length, 1);
        input.multiple = true; drop([new File(['x'], 'c.csv'), new File(['y'], 'd.csv')]); t.eq(input.files.length, 2); t.eq(changes, 2);
    }],

    ['combobox: typing reports the query even when the client filters, and an option refresh keeps the filter', async t => {
        const c = await t.mount('<pk-combobox label="V"><option value="1">Widget A</option><option value="2">Gadget</option></pk-combobox>'); await t.settle();
        const q = []; c.addEventListener('pk-combo-query', e => q.push(e.detail.query));
        await type(t, c.part('control'), 'wid'); t.eq(q.join(), 'wid');
        c.insertAdjacentHTML('beforeend', '<option value="3">Widget C</option>'); await t.settle();
        t.eq([...c.part('popup').querySelectorAll('.op')].filter(o => !o.hidden).length, 2, 'Widget A and Widget C match, Gadget stays hidden');
    }],

    ['field and checkbox: inline layout, small size and the checkbox custom properties reflect', async t => {
        const f = await t.mount('<pk-field label="L" layout="inline" size="sm"><input></pk-field>'); t.eq(f.layout, 'inline'); t.eq(f.size, 'sm');
        const c = await t.mount('<pk-checkbox size="sm">C</pk-checkbox>'); t.eq(c.size, 'sm'); t.ok(getComputedStyle(c.part('control')).fontSize.length > 0);
    }],

    ['unit-input: the number and unit make one value, the form submits it, the commit event carries it, a foreign unit is kept', async t => {
        const host = t.stage('<form><pk-unit-input name="w" label="Width" show-label value="1.5rem"></pk-unit-input></form>'); await t.load(host); await t.settle();
        const el = host.querySelector('pk-unit-input'); const n = el.part('control'); const u = el.part('unit');
        t.eq(n.value, '1.5'); t.eq(u.value, 'rem'); t.eq(new FormData(host.firstElementChild).get('w'), '1.5rem'); t.eq(n.getAttribute('aria-label'), 'Width'); t.eq(u.getAttribute('aria-label'), 'Width unit');
        t.ok(getComputedStyle(el.part('label')).display !== 'none'); t.eq(el.part('label').htmlFor, 'c');
        const seen = []; el.addEventListener('pk-value-change', e => seen.push(e.detail.value));
        n.value = '2'; n.dispatchEvent(new Event('input', { bubbles: true, composed: true })); await t.settle(); t.eq(el.value, '2rem'); t.eq(seen.length, 0, 'no commit while typing');
        n.dispatchEvent(new Event('change', { bubbles: true })); t.eq(seen.join(), '2rem');
        u.value = 'px'; u.dispatchEvent(new Event('change', { bubbles: true })); await t.settle(); t.eq(el.value, '2px'); t.eq(seen.join(), '2rem,2px'); t.eq(new FormData(host.firstElementChild).get('w'), '2px');
        el.value = '10vh'; await t.settle(); t.eq(u.value, 'vh'); t.eq(n.value, '10'); t.eq(seen.length, 2, 'a value the host sets raises nothing');
        el.units = 'ms s'; el.value = '250ms'; await t.settle(); t.eq([...u.options].map(o => o.value).join(), 'ms,s'); t.eq(u.value, 'ms');
        el.required = true; el.value = ''; await t.settle(); t.ok(!el.checkValidity(), 'required needs a number');
        el.readonly = true; await t.settle(); t.ok(u.disabled);
    }],
    ['dropzone: pick() opens the picker for a host button, and browse-label draws a real button that is the zone\'s one keyboard stop', async t => {
        const host = t.stage('<div><pk-dropzone label="Attachments">Drop</pk-dropzone><pk-dropzone label="Photos" browse-label="Choose files" required><span slot="hint">Up to 2 MB</span>Drop</pk-dropzone><pk-dropzone><span slot="input"><input type="file"></span>Drop</pk-dropzone></div>'); await t.load(host); await t.settle();
        const [plain, browse, slotted] = host.querySelectorAll('pk-dropzone'); const clicks = el => { const n = { count: 0 }; el.addEventListener('click', () => n.count++); return n; };
        t.ok(plain.part('browse').hidden, 'no button unless browse-label is set'); t.eq(plain.part('control').tabIndex, 0); t.ok(!plain.part('control').hasAttribute('aria-hidden'));
        const a = clicks(plain.part('control')); plain.pick(); t.eq(a.count, 1, 'pick() clicks the file input'); plain.disabled = true; await t.settle(); plain.pick(); t.eq(a.count, 1, 'nothing while disabled');
        const s = clicks(slotted.querySelector('input')); slotted.pick(); t.eq(s.count, 1, 'with an input in the input slot pick() opens that one');
        const b = browse.part('browse'), input = browse.part('control'); t.ok(!b.hidden); t.eq(b.textContent.trim(), 'Choose files'); t.eq(b.localName, 'button'); t.eq(b.getAttribute('aria-label'), 'Choose files, Photos');
        t.eq(input.tabIndex, -1, 'the input leaves the tab order'); t.eq(input.getAttribute('aria-hidden'), 'true');
        const c = clicks(input); b.click(); t.eq(c.count, 1, 'the button opens the picker');
        const r = b.getBoundingClientRect(); t.ok(r.height >= 44 || innerWidth > 640, 'the button is 44px tall on a phone'); t.ok(r.width > 0 && r.top >= browse.part('zone').getBoundingClientRect().top && r.bottom <= browse.part('zone').getBoundingClientRect().bottom, 'the button is inside the zone');
        browse.focus(); t.eq(browse.shadowRoot.activeElement, b, 'focus() goes to the button'); t.ok(!browse.checkValidity(), 'required is anchored on the button');
        browse.disabled = true; await t.settle(); t.ok(b.disabled);
    }],
    ['button icon: the words are hidden visually and stay the accessible name; the icon is drawn; the label wins; the title mirrors the name', async t => {
        const b = await t.mount('<pk-button icon variant="ghost" icon-name="plus">Add item</pk-button>'); await t.settle();
        const c = b.part('control'), lbl = b.shadowRoot.querySelector('.lbl'), svg = b.part('icon');
        const rect = lbl.getBoundingClientRect(); t.ok(rect.width === 0 && rect.height === 0, 'the text takes no room');
        t.ok(getComputedStyle(lbl).display !== 'none' && getComputedStyle(lbl).visibility === 'visible', 'it is not display:none or visibility:hidden, so it stays in the accessibility tree');
        t.eq(b.textContent, 'Add item', 'the name is still the slotted text'); t.ok(b.shadowRoot.querySelector('slot:not([name])').assignedNodes().length === 1, 'and it reaches the button through the default slot');
        t.ok(!svg.hasAttribute('hidden') && svg.getBoundingClientRect().width > 0, 'the icon-name symbol is drawn'); t.ok(svg.firstChild.getAttribute('href').endsWith('icons.svg#plus'), 'from the SDK sprite');
        t.eq(c.getAttribute('title'), 'Add item', 'the native tooltip shows the name'); t.eq(c.getAttribute('aria-description'), '', 'and is not read a second time as a description');
        t.ok(!c.hasAttribute('aria-label'), 'no aria-label is needed');
        t.ok(Math.abs(c.getBoundingClientRect().width - c.getBoundingClientRect().height) < 1, 'the button is square');
        const w = c.getBoundingClientRect().width; b.textContent = 'A much longer name for the very same button'; await t.settle(); t.eq(c.getBoundingClientRect().width, w, 'no layout shift when the text changes');
        b.label = 'Add'; await t.settle(); t.eq(c.getAttribute('aria-label'), 'Add', 'the label wins over the slotted text'); t.eq(c.getAttribute('title'), 'Add');
        b.icon = false; await t.settle(); t.ok(!c.hasAttribute('title') && svg.getBoundingClientRect().width > 0, 'without icon there is no tooltip title and the text shows'); t.ok(lbl.getBoundingClientRect().width > 0);
        const bare = await t.mount('<pk-button variant="ghost">Save</pk-button>'); await t.settle(); t.ok(bare.part('icon').hasAttribute('hidden'), 'no icon-name, no icon drawn'); t.eq(bare.shadowRoot.querySelector('.lbl').getBoundingClientRect().width > 0, true);
        const tip = await t.mount('<pk-tooltip text="Add"><pk-button icon icon-name="plus">Add</pk-button></pk-tooltip>'); const inner = tip.querySelector('pk-button'); await t.settle();
        t.ok(!inner.part('control').hasAttribute('title'), 'inside a pk-tooltip the tooltip is the pk-tooltip, not a native title');
        const own = await t.mount('<pk-button icon icon-name="plus" title="Custom">Add</pk-button>'); t.ok(!own.part('control').hasAttribute('title'), 'a title on the host is left to the host');
    }],

    ['button icon: a link, a busy button and a toggle keep their name and behaviour; an element in the slot stays drawn', async t => {
        const a = await t.mount('<pk-button icon variant="ghost" href="#orders"><pk-icon name="chevron-left"></pk-icon>Back to Orders</pk-button>'); await t.settle();
        const link = a.part('control'); t.eq(link.localName, 'a'); t.eq(link.getAttribute('href'), '#orders'); t.eq(link.getAttribute('title'), 'Back to Orders');
        t.ok(a.querySelector('pk-icon').getBoundingClientRect().width > 0, 'the pk-icon in the slot is drawn'); t.eq(link.getBoundingClientRect().width, link.getBoundingClientRect().height, 'a square link');
        a.focus(); t.eq(a.shadowRoot.activeElement, link, 'the link takes focus'); let clicks = 0; a.addEventListener('click', e => { clicks++; e.preventDefault(); }); link.click(); t.eq(clicks, 1, 'a link click still fires click');
        const b = await t.mount('<pk-button icon icon-name="search" busy>Search</pk-button>'); await t.settle();
        t.ok(b.part('icon').getBoundingClientRect().width === 0 && !b.part('spinner').hidden && b.part('spinner').getBoundingClientRect().width > 0, 'the spinner replaces the icon');
        t.eq(b.part('control').getAttribute('aria-busy'), 'true'); t.eq(b.part('control').getAttribute('title'), 'Search', 'the name stays'); let n = 0; b.addEventListener('click', () => n++); b.click(); t.eq(n, 0, 'a busy icon button ignores clicks');
        const g = await t.mount('<pk-button icon toggle icon-name="menu" busy-text="Working">Menu</pk-button>'); let seen; g.addEventListener('pk-toggle', e => { seen = e.detail; });
        t.eq(g.part('control').getAttribute('aria-pressed'), 'false'); g.click(); await t.settle(); t.ok(seen.pressed); t.eq(g.part('control').getAttribute('aria-pressed'), 'true', 'aria-pressed follows the toggle');
        g.busy = true; await t.settle(); t.ok(!g.hasAttribute('has-busy-text'), 'busy-text does not replace the name of an icon button'); t.eq(g.shadowRoot.querySelector('.lbl').getBoundingClientRect().width, 0);
        const sized = {}; for (const s of ['md', 'mini', 'lg']) { const x = await t.mount(`<pk-button icon size="${s}" icon-name="plus">Add</pk-button>`); await t.settle(); const r = x.part('control').getBoundingClientRect(); sized[s] = r; t.ok(Math.abs(r.width - r.height) < 1, `${s} is square`); }
        t.ok(sized.mini.width < sized.md.width && sized.md.width < sized.lg.width, 'the size follows size');
    }],

    ['button icon (375px): every size is a 44px target and the text takes no room', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = ['md', 'mini', 'lg'].map(s => `<pk-button icon size="${s}" icon-name="plus">Add ${s}</pk-button>`).join('') + '<pk-button icon href="#x"><pk-icon name="chevron-left"></pk-icon>Back</pk-button>';
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '200px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
        const until = async fn => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error('the buttons did not upgrade'); };
        const buttons = await until(() => { const l = [...f.contentDocument.querySelectorAll('pk-button')]; return l.length === 4 && l.every(b => b.shadowRoot?.querySelector('[part="icon"]')) && l; });
        await new Promise(r => setTimeout(r, 200)); t.eq(f.contentWindow.innerWidth, 375);
        for (const b of buttons) { const r = b.part('control').getBoundingClientRect(); t.ok(r.width >= 43.5 && r.height >= 43.5, `${b.getAttribute('size') ?? 'link'} is ${r.width}x${r.height}, not under 44px`); if (!b.querySelector('pk-icon')) t.eq(b.shadowRoot.querySelector('.lbl').getBoundingClientRect().width, 0, 'the text takes no room'); }
    }],
];
