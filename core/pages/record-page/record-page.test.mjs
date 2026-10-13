// Unit tests for pk-record-page: load states and Retry, view/edit rendering, dirty tracking, save (inline errors, notice, success), the leave guard.
// Stub base and a fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './record-page.js';

const fakeEl = (tag = 'div') => ({
    localName: tag, attrs: {}, children: [], connected: true, listeners: {}, hidden: false, value: '',
    ownerDocument: { createElement: fakeEl },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    append(...k) { this.children.push(...k); for (const c of k) c.parent = this; },
    replaceChildren(...k) { this.children = k; for (const c of k) c.parent = this; },
    closest(sel) { let n = this; while (n) { if (n.localName === sel) return n; n = n.parent; } return null; },
    querySelector() { return null; },
    focus() { this.focused = true; },
    remove() { this.connected = false; },
    get isConnected() { return this.connected; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});
const tick = () => new Promise(r => setTimeout(r));

const make = () => {
    const parts = Object.fromEntries(['header', 'state', 'bar', 'notice', 'layout', 'main', 'side', 'edit', 'cancel', 'save', 'delete'].map(n => [n, fakeEl()]));
    const events = [], errors = [];
    const win = { added: [], removed: [], addEventListener(t, f) { this.added.push([t, f]); }, removeEventListener(t, f) { this.removed.push([t, f]); } };
    globalThis.window = win;
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return { querySelectorAll: () => [], matches: () => false }; }
        get isConnected() { return true; }
        get log() { return { error: (...a) => errors.push(a) }; }
        emit(name, detail) { events.push([name, detail]); }
    }))();
    el.config = { id: '7', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'status', label: 'Status', type: 'select', options: [{ value: 'a', label: 'Active' }] }], sidebar: [{ heading: 'Summary', fields: ['status'] }] };
    el.mode = 'view';
    return { el, parts, events, errors, win };
};

test('load shows loading, then the field list with sidebar cards; a missing record is the empty state', async () => {
    const { el, parts } = make();
    let release;
    el.load = () => new Promise(r => { release = r; });
    el.connected();
    assert.equal(parts.state.children[0].localName, 'pk-skeleton');
    assert.equal(parts.layout.hidden, true);
    release({ name: 'Widget', status: 'a' });
    await tick();
    assert.equal(parts.state.children.length, 0);
    assert.equal(parts.main.children[0].localName, 'pk-field-list');
    assert.equal(parts.main.children[0].children[1].children[0].textContent, 'Widget')
    assert.equal(parts.main.children[0].children[1].children[0].name, 'field-name', 'the value is a field-<name> slot a host child can fill (#1000)');
    assert.equal(parts.side.children[0].children[0].children[1].children[0].textContent, 'Active', 'a select value shows its option label');
    assert.equal(parts.edit.hidden, true, 'no save callback: not editable');
    el.load = async () => null;
    el.config = { ...el.config, id: '8' };
    await el.fetch();
    await tick();
    assert.equal(parts.state.children[0].localName, 'pk-empty-state');
});

test('a rejecting load shows the error state; Retry loads again', async () => {
    const { el, parts, errors } = make();
    let calls = 0;
    el.load = async () => { if (++calls === 1) throw new Error('boom'); return { name: 'x' }; };
    el.connected();
    await tick();
    const alert = parts.state.children[0];
    assert.equal(alert.textContent, 'boom'); assert.equal(errors.length, 1);
    alert.children[0].listeners.click[0]();
    await tick();
    assert.equal(calls, 2); assert.equal(parts.state.children.length, 0);
});

test('no id is a new record: no load, edit mode, a form and no Cancel', () => {
    const { el, parts } = make();
    el.config = { ...el.config, id: undefined };
    el.save = async () => {};
    el.connected();
    assert.equal(parts.main.children[0].localName, 'pk-form');
    assert.equal(parts.save.hidden, false); assert.equal(parts.cancel.hidden, true);
});

test('dirty follows the controls against the loaded values, fires pk-record-dirty once per change, and the leave guard follows it', async () => {
    const { el, parts, events, win } = make();
    el.load = async () => ({ name: 'Widget' });
    el.save = async () => {};
    el.mode = 'edit';
    el.connected();
    await tick();
    const group = parts.main.children[0].children[0].children[0];
    assert.equal(group.localName, 'pk-field-group', 'the edit form is one pk-field-group');
    assert.deepEqual(group.values, { name: 'Widget' }); assert.deepEqual(group.fields.map(f => [f.key, f.kind]), [['name', 'text'], ['status', 'select']]);
    const name = { value: 'Changed' };
    group.snapshot = () => ({ name: name.value });
    el.track(); el.track();
    assert.equal(el.dirty, true); assert.deepEqual(events, [['pk-record-dirty', { dirty: true }]]);
    const guard = win.added.find(([t]) => t === 'beforeunload')[1];
    let prevented = false;
    guard({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    name.value = 'Widget'; el.track();
    assert.equal(el.dirty, false);
    prevented = false; guard({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false, 'clean: leaving is not blocked');
    el.disconnected();
    assert.equal(win.removed[0][1], guard);
});

test('save: a rejection with errors marks the fields inline, another rejection is a notice, success stores the values and returns to view', async () => {
    const { el, parts, events } = make();
    el.load = async () => ({ name: 'Widget' });
    el.mode = 'edit';
    let outcome;
    el.save = async values => { if (outcome) throw outcome; return { rev: 2, ...values }; };
    el.connected();
    await tick();
    const group = parts.main.children[0].children[0].children[0], marked = {}, log = [];
    group.snapshot = () => ({ name: 'Dup' });
    group.setError = (k, m) => { marked[k] = m; }; group.focusField = k => log.push(['focus', k]); group.report = on => log.push(['report', on]);
    outcome = Object.assign(new Error('invalid'), { errors: { name: 'Name is taken', ghost: 'not a field' } });
    await el.submit();
    assert.deepEqual(marked, { name: 'Name is taken' }); assert.deepEqual(log.at(-1), ['focus', 'name']);
    outcome = new Error('offline');
    log.length = 0;
    await el.submit();
    assert.deepEqual(log[0], ['report', false], 'stale field errors are cleared');
    assert.equal(parts.notice.children[0].textContent, 'offline');
    outcome = null;
    await el.submit();
    assert.equal(el.$values.rev, 2); assert.equal(el.mode, 'view');
    assert.ok(events.some(([n]) => n === 'pk-record-save'));
    assert.equal(parts.save.busy, false);
});

test('the page does not override the base class render hook: a prop change (dirty on the first keystroke) must not rebuild the form (#699)', () => {
    assert.equal(Object.hasOwn(behaviour(class {}).prototype, 'render'), false);
});

test('delete: the Delete button shows in view mode of an existing record when config.deletable is set, and raises pk-record-delete with the id (#855)', async () => {
    const { el, parts, events } = make();
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.config = { ...el.config, deletable: true };
    el.connected();
    await tick();
    assert.equal(parts.delete.hidden, false, 'view mode, existing record, deletable');
    parts.delete.fire?.('click');
    for (const fn of parts.delete.listeners?.click ?? []) fn();
    assert.deepEqual(events.filter(e => e[0] === 'pk-record-delete'), [['pk-record-delete', { id: '7' }]]);
    el.mode = 'edit'; el.draw();
    assert.equal(parts.delete.hidden, true, 'not while editing');
    el.config = { ...el.config, deletable: false }; el.mode = 'view'; el.draw();
    assert.equal(parts.delete.hidden, true, 'not without config.deletable');
});

test('deletable: the prop shows Delete like config.deletable, and clearing both hides it (#1000)', async () => {
    const { el, parts } = make();
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.connected();
    await tick();
    assert.equal(parts.delete.hidden, true, 'neither the prop nor the config');
    el.deletable = true; el.changed('deletable');
    assert.equal(parts.delete.hidden, false, 'the prop alone');
    el.deletable = false; el.changed('deletable');
    assert.equal(parts.delete.hidden, true);
});

test('busy: every button waits, Save shows its busy state, and a submit is ignored until it clears (#1000)', async () => {
    const { el, parts } = make();
    let saves = 0;
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.save = async () => { saves++; };
    el.connected();
    await tick();
    el.controls = () => [];
    el.busy = true; el.changed('busy');
    for (const p of ['edit', 'cancel', 'save', 'delete']) assert.equal(parts[p].disabled, true, p);
    assert.equal(parts.save.busy, true);
    await el.submit();
    assert.equal(saves, 0, 'ignored while busy');
    el.busy = false; el.changed('busy');
    for (const p of ['edit', 'cancel', 'save', 'delete']) assert.equal(parts[p].disabled, false, p);
    assert.equal(parts.save.busy, false);
    await el.submit();
    assert.equal(saves, 1);
});

test('error: the host text is a notice above the form, and empty clears it (#1000)', async () => {
    const { el, parts } = make();
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.connected();
    await tick();
    el.error = 'Could not delete the order.'; el.changed('error');
    assert.equal(parts.notice.children[0].textContent, 'Could not delete the order.');
    el.error = ''; el.changed('error');
    assert.equal(parts.notice.children.length, 0);
});

test('a field def in the group spelling (key, kind, hint, help) and a boolean value read in view mode; a new record starts from config.values (#1000)', async () => {
    const { el, parts } = make();
    el.config = { id: undefined, values: { name: 'Draft', active: true }, fields: [{ key: 'name', label: 'Name', kind: 'text', hint: 'Shown on invoices' }, { key: 'active', label: 'Active', kind: 'checkbox' }, { name: 'legacy', help: 'older hint', type: 'email', options: ['a'] }], sidebar: [] };
    el.save = async () => {};
    el.connected();
    const group = parts.main.children[0].children[0].children[0];
    assert.deepEqual(group.values, { name: 'Draft', active: true });
    assert.deepEqual(group.fields.map(f => [f.key, f.kind, f.hint]), [['name', 'text', 'Shown on invoices'], ['active', 'checkbox', undefined], ['legacy', 'email', 'older hint']]);
    assert.deepEqual(group.fields[2].options, [{ value: 'a', label: 'a' }], 'plain string options become { value, label }');
    el.config = { ...el.config, id: '1' }; el.$id = '1'; el.$values = { name: 'Draft', active: true }; el.mode = 'view'; el.draw();
    assert.equal(parts.main.children[0].children[3].children[0].textContent, 'Yes', 'a boolean reads Yes or No');
});
