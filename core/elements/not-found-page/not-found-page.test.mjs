// Unit tests for pk-not-found-page: default heading/description with zero config, that the drawn state is a light-DOM child (never a
// shadow-root child, so the SDK's on-demand loader can see it), the optional label action button, and the pk-action event. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './not-found-page.js';

const fakeEl = tag => ({ localName: tag, attrs: {}, children: [], slot: '', ownerDocument: { createElement: fakeEl }, setAttribute(k, v) { this.attrs[k] = String(v); }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, addEventListener(type, fn) { (this.on ??= {})[type] = fn; }, set textContent(v) { this._t = v; }, get textContent() { return this._t; }, get firstElementChild() { return this.children[0]; } });

const make = (props = {}) => {
    const appended = [];
    const el = new (behaviour(class {
        emit(name, detail, opts) { (this.emitted ??= []).push({ name, detail, opts }); }
        get ownerDocument() { return { createElement: fakeEl }; }
        append(...k) { appended.push(...k); }
    }))();
    Object.assign(el, { heading: '', description: '', label: '' }, props);
    return { el, appended, drawn: () => appended[0]?.children[0] };
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

test('zero config draws the default heading and description', () => {
    const { el, drawn } = make();
    el.updated();
    assert.equal(drawn().attrs.heading, 'Page not found');
    assert.equal(drawn().attrs.description, "The page you're looking for doesn't exist or you don't have access to it.");
});

test('heading and description pass through when given', () => {
    const { el, drawn } = make({ heading: 'Gone', description: 'It moved.' });
    el.updated();
    assert.equal(drawn().attrs.heading, 'Gone');
    assert.equal(drawn().attrs.description, 'It moved.');
});

test('no label: no action button is drawn', () => {
    const { el, drawn } = make();
    el.updated();
    assert.equal(drawn().children.length, 0);
});

test('a label draws one pk-button in the actions slot, and activating it raises pk-action, never cancelable', () => {
    const { el, drawn } = make({ label: 'Go home' });
    el.updated();
    const btn = drawn().children[0];
    assert.equal(btn.localName, 'pk-button');
    assert.equal(btn.attrs.slot, undefined, 'slot is a property here, not an attribute');
    assert.equal(btn.slot, 'actions');
    assert.equal(btn.textContent, 'Go home');
    btn.on.click();
    assert.deepEqual(el.emitted, [{ name: 'pk-action', detail: null, opts: { cancelable: false } }]);
});

test('updated is idempotent about the action button: calling it again does not pile up more buttons', () => {
    const { el, drawn } = make({ label: 'Go home' });
    el.updated();
    el.updated();
    assert.equal(drawn().children.length, 1);
});
