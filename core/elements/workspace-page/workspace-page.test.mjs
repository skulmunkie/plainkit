// Unit tests for pk-workspace-page: which panes exist, mount(panes) with its loading/error boundary and Retry, cleanup on disconnect and on a
// superseded mount. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './workspace-page.js';

const fakeEl = (tag = 'div') => ({
    localName: tag, attrs: {}, children: [], connected: true, listeners: {},
    ownerDocument: { createElement: fakeEl },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); for (const c of k) c.connected = true; },
    replaceChildren(...k) { this.children = k; },
    remove() { this.connected = false; },
    toggleAttribute() {},
    get isConnected() { return this.connected; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});
const tick = () => new Promise(r => setTimeout(r));

const make = () => {
    const parts = { state: fakeEl(), workspace: fakeEl('pk-workspace'), nav: fakeEl(), main: fakeEl(), aside: fakeEl() };
    const errors = [];
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
        get isConnected() { return true; }
        get log() { return { error: (...a) => errors.push(a) }; }
        hasAttribute() { return false; }
    }))();
    el.config = {};
    return { el, parts, errors };
};

test('panes: main always exists, nav by default, aside only when listed; labels and asideOpen pass to pk-workspace', () => {
    const { el, parts } = make();
    el.connected();
    assert.equal(parts.nav.isConnected, true); assert.equal(parts.aside.isConnected, false);
    assert.equal(parts.workspace.asideOpen, false);
    el.config = { panes: ['aside'], mainLabel: 'Editor', asideLabel: 'Outline' };
    el.sync();
    assert.equal(parts.nav.isConnected, false); assert.equal(parts.aside.isConnected, true);
    assert.equal(parts.workspace.mainLabel, 'Editor'); assert.equal(parts.workspace.asideLabel, 'Outline');
    assert.equal(parts.workspace.asideOpen, true);
});

test('mount receives only the panes that exist, shows loading while pending, then clears the state', async () => {
    const { el, parts } = make();
    let release, got;
    el.mount = panes => { got = panes; return new Promise(r => { release = r; }); };
    el.connected();
    assert.deepEqual(Object.keys(got).sort(), ['main', 'nav']);
    assert.equal(parts.state.children[0].localName, 'pk-skeleton');
    release(() => {});
    await tick();
    assert.equal(parts.state.children.length, 0);
});

test('a rejecting mount shows the error state with Retry, which mounts again', async () => {
    const { el, parts, errors } = make();
    let calls = 0;
    el.mount = async () => { calls++; if (calls === 1) throw new Error('boom'); };
    el.connected();
    await tick();
    const alert = parts.state.children[0];
    assert.equal(alert.localName, 'pk-alert'); assert.equal(alert.textContent, 'boom'); assert.equal(errors.length, 1);
    alert.children[0].listeners.click[0]();
    await tick();
    assert.equal(calls, 2); assert.equal(parts.state.children.length, 0);
});

test('disconnected runs the mount handle (a function or { destroy }) once; a mount superseded while pending is destroyed when it lands', async () => {
    const { el } = make();
    let destroyed = 0;
    el.mount = async () => ({ destroy() { destroyed++; } });
    el.connected();
    await tick();
    el.disconnected(); el.disconnected();
    assert.equal(destroyed, 1);

    let release; const late = { destroy() { destroyed++; } };
    el.mount = () => new Promise(r => { release = r; });
    el.connected();
    el.disconnected();
    release(late);
    await tick();
    assert.equal(destroyed, 2, 'a stale mount result is destroyed, never kept');
});

test('no mount callback: nothing runs and no state is drawn', () => {
    const { el, parts } = make();
    el.connected();
    assert.equal(parts.state.children.length, 0);
});
