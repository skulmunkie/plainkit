// Browser cases for the forms and inputs elements (pk-input, textarea, select, field, form, checkbox, radio-group, range, rating, combobox, tag-input, otp-input, colour-input,
// dropzone, button additions, button-group, split-button, switch additions, form-section, form-actions). Same shape as cases.js: [name, async (t) => void].
const ev = (type, init = {}) => new Event(type, { bubbles: true, composed: true, ...init });
const press = (el, key) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }); el.dispatchEvent(e); return e; };
const type = async (t, inner, text) => { inner.value = text; inner.dispatchEvent(ev('input')); await t.settle(); };

export const formCases = [
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
];
