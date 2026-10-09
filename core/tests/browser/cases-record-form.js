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
];
