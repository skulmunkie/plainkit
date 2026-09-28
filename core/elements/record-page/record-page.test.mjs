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
    const parts = Object.fromEntries(['state', 'bar', 'notice', 'layout', 'main', 'side', 'edit', 'cancel', 'save'].map(n => [n, fakeEl()]));
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
    assert.equal(parts.main.children[0].children[1].textContent, 'Widget');
    assert.equal(parts.side.children[0].children[0].children[1].textContent, 'Active', 'a select value shows its option label');
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
    const name = parts.main.children[0].children[0].children[0].children[0];
    name.value = 'Changed'; el.controls = () => [name]; name.attrs.name = 'name';
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
    const field = parts.main.children[0].children[0].children[0], ctl = field.children[0];
    ctl.attrs.name = 'name'; ctl.value = 'Dup'; el.controls = () => [ctl];
    outcome = Object.assign(new Error('invalid'), { errors: { name: 'Name is taken' } });
    await el.submit();
    assert.equal(field.attrs.error, 'Name is taken'); assert.equal(ctl.focused, true);
    outcome = new Error('offline');
    await el.submit();
    assert.equal(field.attrs.error, undefined, 'stale field errors are cleared');
    assert.equal(parts.notice.children[0].textContent, 'offline');
    outcome = null;
    await el.submit();
    assert.equal(el.$values.rev, 2); assert.equal(el.mode, 'view');
    assert.ok(events.some(([n]) => n === 'pk-record-save'));
    assert.equal(parts.save.busy, false);
});
