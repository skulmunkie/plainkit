// Unit tests for pk-wizard-page: step flow, validation blocking Next, state kept going back, the review step, submit errors, load/Retry, the leave guard.
// Stub base and a fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './wizard-page.js';

const fakeEl = (tag = 'div') => ({
    localName: tag, attrs: {}, children: [], connected: true, listeners: {}, hidden: false, value: '',
    ownerDocument: { createElement: fakeEl },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    append(...k) { this.children.push(...k); for (const c of k) c.parent = this; },
    replaceChildren(...k) { this.children = k; for (const c of k) c.parent = this; },
    closest(sel) { let n = this; while (n) { if (n.localName === sel) return n; n = n.parent; } return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, matches() { return false; },
    focus() { this.focused = true; },
    remove() { this.connected = false; },
    get isConnected() { return this.connected; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});
const tick = () => new Promise(r => setTimeout(r));

const make = () => {
    const parts = Object.fromEntries(['header', 'state', 'stepper', 'notice', 'card', 'heading', 'panes', 'bar', 'back', 'next'].map(n => [n, fakeEl()]));
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
    el.config = { review: true, steps: [{ id: 'a', label: 'Account', fields: [{ name: 'email', label: 'Email', required: true }] }, { id: 'b', label: 'Plan', fields: [{ name: 'plan', label: 'Plan', type: 'select', options: [{ value: 'f', label: 'Free' }] }] }] };
    return { el, parts, events, errors, win };
};

test('the steps are the configured ones plus a Review step; the first shows, Back is hidden, Next becomes Submit on the last', async () => {
    const { el, parts } = make();
    el.connected(); await tick();
    assert.equal(el.steps.length, 3);
    assert.equal(parts.stepper.children.length, 3); assert.equal(parts.stepper.current, 0);
    assert.equal(parts.heading.textContent, 'Account');
    assert.equal(parts.back.hidden, true); assert.equal(parts.next.textContent, 'Next');
    el.show(2);
    assert.equal(parts.next.textContent, 'Submit'); assert.equal(parts.heading.focused, true, 'focus goes to the step heading');
});

test('advance runs validate(stepId, values) and stays put on { errors }, marking the field inline; a pass moves on and Back keeps every pane', async () => {
    const { el, parts } = make();
    let out;
    el.validate = async (id, values) => { el.seen = [id, values]; return out; };
    el.connected(); await tick();
    const field = fakeEl('pk-field'), ctl = fakeEl('pk-input'); ctl.attrs.name = 'email'; field.append(ctl);
    el.controls = () => [ctl];
    parts.panes.querySelectorAll = () => (field.attrs.error ? [field] : []);
    out = { errors: { email: 'Already used' } };
    await el.advance();
    assert.equal(el.$i, 0); assert.equal(field.attrs.error, 'Already used'); assert.equal(ctl.focused, true); assert.equal(parts.stepper.errors, '0');
    out = undefined;
    await el.advance();
    assert.deepEqual(el.seen[0], 'a');
    assert.equal(el.$i, 1); assert.equal(parts.stepper.errors, '', 'the error mark clears on a pass');
    assert.equal(field.attrs.error, undefined);
    const paneA = el.$panes.get('a');
    el.go(0);
    assert.equal(el.$i, 0); assert.equal(el.$panes.get('a'), paneA, 'the first pane is kept, not rebuilt'); assert.equal(paneA.hidden, false);
    el.go(2);
    assert.equal(el.$i, 0, 'you cannot skip ahead of the furthest step reached');
});

test('a non-error rejection from validate is a notice above the card and logged', async () => {
    const { el, parts, errors } = make();
    el.validate = async () => { throw new Error('offline'); };
    el.connected(); await tick();
    await el.advance();
    assert.equal(parts.notice.children[0].textContent, 'offline'); assert.equal(errors.length, 1); assert.equal(el.$i, 0); assert.equal(parts.next.busy, false);
});

test('submit: the last step calls submit(values) once, emits pk-wizard-submit and shows the done state; an error naming an earlier step field goes back to it', async () => {
    const { el, parts, events } = make();
    let outcome;
    el.submit = async values => { el.sent = values; if (outcome) throw outcome; };
    el.load = async () => ({ email: 'a@b.c' });
    el.connected(); await tick();
    el.show(2);
    const ctl = fakeEl('pk-input'), field = fakeEl('pk-field'); ctl.attrs.name = 'email'; ctl.value = 'x@y.z'; field.append(ctl);
    el.controls = () => [ctl];
    outcome = Object.assign(new Error('bad'), { errors: { email: 'Taken' } });
    await el.advance();
    assert.equal(el.$i, 0, 'went back to the step that owns the field'); assert.equal(field.attrs.error, 'Taken');
    outcome = null; el.show(2);
    const p = el.advance(); el.advance();
    await p;
    assert.equal(el.sent.email, 'x@y.z');
    assert.equal(parts.card.hidden, true); assert.equal(parts.state.children[0].localName, 'pk-empty-state');
    assert.ok(events.some(([n]) => n === 'pk-wizard-submit'));
});

test('a rejecting load shows the error state and Retry loads again', async () => {
    const { el, parts } = make();
    let calls = 0;
    el.load = async () => { if (++calls === 1) throw new Error('boom'); return {}; };
    el.connected(); await tick();
    assert.equal(parts.state.children[0].textContent, 'boom'); assert.equal(parts.card.hidden, true);
    parts.state.children[0].children[0].listeners.click[0]();
    await tick();
    assert.equal(calls, 2); assert.equal(parts.state.children.length, 0); assert.equal(parts.card.hidden, false);
});

test('dirty fires pk-wizard-dirty once per change and the leave guard follows it and is removed on disconnect', async () => {
    const { el, events, win } = make();
    el.connected(); await tick();
    el.setDirty(true); el.setDirty(true);
    assert.deepEqual(events, [['pk-wizard-dirty', { dirty: true }]]);
    const guard = win.added.find(([t]) => t === 'beforeunload')[1];
    let prevented = false; guard({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    el.setDirty(false); prevented = false; guard({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    el.disconnected();
    assert.equal(win.removed[0][1], guard);
});
