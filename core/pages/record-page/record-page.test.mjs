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
    assert.deepEqual(group.values, { name: 'Widget' }); assert.deepEqual(group.fields.map(f => [f.key, f.kind]), [['name', 'text']], 'a field a sidebar card names is edited in that card only');
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
    assert.equal(parts.delete.hidden, false, 'also while editing an existing record (#1597)');
    el.config = { ...el.config, id: undefined }; el.$id = null; el.draw();
    assert.equal(parts.delete.hidden, true, 'not for a new record');
    el.$id = '7'; el.config = { ...el.config, deletable: false }; el.mode = 'view'; el.draw();
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

test('a custom field forwards its editor-<key> slot into the group, so the host child fills it in edit mode (#1000)', () => {
    const { el, parts } = make();
    el.config = { fields: [{ key: 'name', label: 'Name' }, { key: 'extra', label: 'Extra', kind: 'custom' }] };
    el.save = async () => {};
    el.connected();
    const group = parts.main.children[0].children[0].children[0];
    assert.equal(group.children.length, 1, 'one slot for the one custom field');
    assert.equal(group.children[0].attrs.name, 'editor-extra'); assert.equal(group.children[0].attrs.slot, 'editor-extra');
});

test('sections draw one titled card each, in view and edit mode, with the unnamed fields first', async () => {
    const { el, parts } = make();
    el.config = { id: '7', heading: 'Details', fields: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }], sections: [{ heading: 'Address', fields: ['b'] }, { heading: 'Notes', fields: ['c'] }] };
    el.load = async () => ({ a: '1', b: '2', c: '3' });
    el.save = async () => {};
    el.connected(); await tick();
    assert.deepEqual(parts.main.children.map(c => c.attrs.heading), ['Details', 'Address', 'Notes']);
    assert.equal(parts.main.children[1].children[1].children[0].textContent, '2');
    el.mode = 'edit'; el.draw();
    const form = parts.main.children[0].children[0];
    assert.equal(form.localName, 'form');
    assert.deepEqual(form.children.map(c => c.attrs.heading), ['Details', 'Address', 'Notes']);
    assert.deepEqual(form.children[1].children[0].fields.map(f => f.key), ['b']);
});

test('sidebar cards are editable field groups joined to the main form; values and errors route to the right group', async () => {
    const { el, parts } = make();
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.save = async v => { saved = v; throw { errors: { status: 'Bad' } }; };
    let saved;
    el.mode = 'edit'; el.connected(); await tick();
    const side = parts.side.children[0].children[0];
    assert.equal(side.localName, 'pk-field-group');
    assert.equal(side.attrs.form, parts.main.children[0].children[0].id, 'joins the form by id');
    parts.main.children[0].children[0].children[0].snapshot = () => ({ name: 'N', status: 'a' });
    let err; side.snapshot = () => ({ name: 'stale', status: 'b' }); side.setError = (k, m) => { err = [k, m]; }; side.focusField = k => { err.push(k); };
    assert.deepEqual(el.collect(), { name: 'N', status: 'b' });
    await el.submit();
    assert.deepEqual(saved, { name: 'N', status: 'b' });
    assert.deepEqual(err, ['status', 'Bad', 'status']);
});

test('titleField takes the page title from the loaded record, config.title is the fallback', async () => {
    const { el, parts } = make();
    el.config = { id: '7', title: 'Fallback', titleField: 'code', fields: [{ key: 'code' }] };
    el.load = async () => ({ code: 'ABC' });
    el.save = async () => {};
    el.connected();
    assert.equal(parts.header.attrs.heading, 'Fallback', 'while loading');
    await tick();
    assert.equal(parts.header.attrs.heading, 'ABC');
    el.$values = { code: '  ' }; el.bar();
    assert.equal(parts.header.attrs.heading, 'Fallback', 'an empty value falls back');
    el.$values = { code: 'OLD' };
    el.mode = 'edit'; el.draw();
    el.live = () => ({ code: 'NEW' });
    await el.submit();
    assert.equal(parts.header.attrs.heading, 'NEW', 'a save updates it');
});

test('Cancel emits pk-record-cancel; a new record shows Cancel only when cancellable', async () => {
    const { el, parts, events } = make();
    el.load = async () => ({ name: 'Widget' }); el.save = async () => {};
    el.mode = 'edit'; el.connected(); await tick();
    assert.equal(parts.cancel.hidden, false);
    parts.cancel.listeners.click[0]();
    assert.deepEqual(events.at(-1), ['pk-record-cancel', { id: '7' }]);
    el.config = { fields: [{ key: 'a' }] };
    el.fetch(); await tick();
    assert.equal(parts.cancel.hidden, true, 'a new record has nowhere to go back to');
    el.cancellable = true; el.draw();
    assert.equal(parts.cancel.hidden, false);
    parts.cancel.listeners.click[0]();
    assert.deepEqual(events.at(-1), ['pk-record-cancel', { id: null }]);
});

test('a committed change in one card reaches the other cards, so a condition there follows it (#1600)', async () => {
    const { el } = make();
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.mode = 'edit';
    el.connected();
    await tick();
    const [main, side] = el.$groups;
    assert.equal(el.$groups.length, 2, 'the main form and the Summary card');
    side.snapshot = () => ({ status: 'a' });
    el.mirror({ target: main, detail: { key: 'name', value: 'Changed' } });
    assert.equal(side.values.name, 'Changed', 'the other card now knows the new value');
    assert.equal(side.values.status, 'a', 'and keeps what it held');
    main.values = { untouched: true };
    el.mirror({ target: main, detail: { key: 'name', value: 'Again' } });
    assert.deepEqual(main.values, { untouched: true }, 'the card that raised it is left alone');
});

test('a redraw while edits are unsaved keeps what was typed (the host rewrites config after a rejected save, #1598)', async () => {
    const { el, parts } = make();
    el.config = { ...el.config, id: undefined, sidebar: [] };
    el.save = async () => { throw new Error('offline'); };
    el.connected();
    await tick();
    const group = () => parts.main.children[0].children[0].children[0];
    group().snapshot = () => ({ name: 'Typed' });
    el.track();
    assert.equal(el.dirty, true);
    el.changed('config');
    assert.equal(group().values.name, 'Typed', 'the rebuilt form starts from the live values, not the blank ones');
    assert.equal(el.dirty, true);
});

test('a section or sidebar card with columns gives its field group that many columns in edit mode (#1601)', async () => {
    const { el, parts } = make();
    el.config = { ...el.config, sections: [{ heading: 'Name', fields: ['name'], columns: 3 }], sidebar: [{ heading: 'Summary', fields: ['status'], columns: 2 }] };
    el.load = async () => ({ name: 'Widget', status: 'a' });
    el.mode = 'edit';
    el.connected();
    await tick();
    assert.deepEqual(el.$groups.map(g => g.columns), [3, 2]);
    el.config = { ...el.config, sections: [{ heading: 'Name', fields: ['name'], columns: null }], sidebar: [] };
    el.changed('config');
    assert.equal(el.$groups[0].columns, undefined, 'null or 1 leaves the group at its own default');
    assert.ok(parts.main.children.length);
});
