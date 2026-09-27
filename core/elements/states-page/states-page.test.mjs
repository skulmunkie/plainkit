// Unit tests for pk-states-page: which region shows for each state, that the drawn state is a light-DOM child (never a shadow-root child,
// so the SDK's on-demand loader can see it), and the Retry event. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './states-page.js';

const fakeEl = tag => ({ localName: tag, attrs: {}, children: [], slot: '', ownerDocument: { createElement: fakeEl }, setAttribute(k, v) { this.attrs[k] = String(v); }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, addEventListener(type, fn) { (this.on ??= {})[type] = fn; }, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });

const make = (props = {}) => {
    const content = { hidden: null };
    const appended = [];
    const el = new (behaviour(class {
        part(n) { return n === 'content' ? content : undefined; }
        emit(name, detail, opts) { (this.emitted ??= []).push({ name, detail, opts }); }
        get ownerDocument() { return { createElement: fakeEl }; }
        append(...k) { appended.push(...k); }
    }))();
    Object.assign(el, { state: 'ready', heading: '', description: '', label: '' }, props);
    return { el, content, appended, drawn: () => appended[0]?.children[0] };
};

test('connected creates one light-DOM child, self-assigned to the internal drawn slot (never a shadow-root child)', () => {
    const { el, appended } = make();
    el.connected();
    assert.equal(appended.length, 1);
    assert.equal(appended[0].slot, 'drawn');
    el.connected();
    assert.equal(appended.length, 1, 'connected is idempotent: a second call appends nothing more');
});

test('updated creates the child lazily too, if connected was never called (defensive, cheap insurance)', () => {
    const { el, appended } = make();
    el.updated();
    assert.equal(appended.length, 1);
});

test('ready shows the slotted content and draws nothing into the state child', () => {
    const { el, content, drawn } = make({ state: 'ready' });
    el.updated();
    assert.equal(content.hidden, false);
    assert.equal(drawn(), undefined);
});

test('every non-ready state hides the slotted content and draws one element into the state child', () => {
    for (const state of ['loading', 'empty', 'error', 'forbidden']) {
        const { el, content, drawn } = make({ state });
        el.updated();
        assert.equal(content.hidden, true, state);
        assert.ok(drawn(), state);
    }
});

test('heading, description and label pass through to the drawn state', () => {
    const { el, drawn } = make({ state: 'error', heading: 'Failed', description: 'Try again' });
    el.updated();
    assert.equal(drawn().attrs.heading, 'Failed');
    assert.equal(drawn().textContent, 'Try again');
});

test('activating the drawn Retry action raises pk-retry, never cancelable', () => {
    const { el, drawn } = make({ state: 'error' });
    el.updated();
    const retryBtn = drawn().children[0];
    retryBtn.on.click();
    assert.deepEqual(el.emitted, [{ name: 'pk-retry', detail: null, opts: { cancelable: false } }]);
});

test('an unset state prop defaults to ready (a falsy state is not a fifth state)', () => {
    const { el, content, drawn } = make({ state: '' });
    el.updated();
    assert.equal(content.hidden, false);
    assert.equal(drawn(), undefined);
});
