// Unit tests for pk-master-detail-page: the selection drives the view, mountDetail with its loading/error boundary and Retry, cleanup on
// change, disconnect and a superseded mount, and Back. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './master-detail-page.js';

const fakeEl = (tag = 'div') => ({
    localName: tag, attrs: {}, children: [], dataset: {}, listeners: {}, focused: 0,
    ownerDocument: { createElement: fakeEl },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    focus() { this.focused++; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});
const tick = () => new Promise(r => setTimeout(r));

const make = () => {
    const parts = Object.fromEntries(['header', 'layout', 'list', 'back', 'none', 'record', 'state', 'detail'].map(p => [p, fakeEl()]));
    const errors = [];
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get shadowRoot() { return { querySelectorAll: () => [], matches: () => false }; }
        get isConnected() { return true; }
        get log() { return { error: (...a) => errors.push(a) }; }
    }))();
    el.config = {}; el.recordId = '';
    return { el, parts, errors };
};

test('no selection shows the list view and the empty record pane; a selection shows the detail view', () => {
    const { el, parts } = make();
    el.connected();
    assert.equal(parts.layout.dataset.view, 'list');
    assert.equal(parts.none.children[0].localName, 'pk-empty-state');
    el.recordId = '2'; el.changed('recordId');
    assert.equal(parts.layout.dataset.view, 'detail');
    assert.equal(parts.none.children.length, 0);
});

test('the list is fed by load(query) and a row calls open(row); Back calls close()', async () => {
    const { el, parts } = make();
    const seen = [];
    el.load = q => { seen.push(q); return { rows: [1] }; };
    el.open = r => seen.push(r); el.close = () => seen.push('close');
    el.connected();
    assert.deepEqual(await parts.list.load('query'), { rows: [1] });
    parts.list.rowHref('row');
    parts.back.listeners.click[0]();
    assert.deepEqual(seen, ['query', 'row', 'close']);
});

test('mountDetail gets the pane and id, shows loading while pending, clears the state, focuses the record, and its handle is destroyed when the id changes', async () => {
    const { el, parts } = make();
    let release, got, destroyed = 0;
    el.mountDetail = (pane, id) => { got = [pane, id]; return new Promise(r => { release = r; }); };
    el.recordId = '1'; el.connected();
    assert.equal(got[0], parts.record); assert.equal(got[1], '1');
    assert.equal(parts.state.children[0].localName, 'pk-skeleton');
    release({ destroy() { destroyed++; } });
    await tick();
    assert.equal(parts.state.children.length, 0); assert.equal(parts.detail.focused, 1);
    el.mountDetail = () => ({ destroy() { destroyed++; } });
    el.recordId = '2'; el.changed('recordId'); await tick();
    assert.equal(destroyed, 1, 'the previous record was cleaned up');
    el.recordId = ''; el.changed('recordId'); await tick();
    assert.equal(destroyed, 2, 'clearing the selection cleans up too');
    assert.equal(parts.layout.dataset.view, 'list');
});

test('a rejection shows the error state with Retry that mounts again; a superseded mount is destroyed, never kept; disconnect cleans up', async () => {
    const { el, parts, errors } = make();
    let attempts = 0, destroyed = 0, release;
    el.mountDetail = () => { attempts++; if (attempts === 1) throw new Error('boom'); return { destroy() { destroyed++; } }; };
    el.recordId = '1'; el.connected();
    await tick();
    const alert = parts.state.children[0];
    assert.equal(alert.localName, 'pk-alert'); assert.equal(alert.attrs.kind, 'danger'); assert.equal(errors.length, 1);
    alert.children[0].listeners.click[0]();
    await tick();
    assert.equal(attempts, 2); assert.equal(parts.state.children.length, 0);
    el.disconnected();
    assert.equal(destroyed, 1);
    el.mountDetail = () => new Promise(r => { release = r; });
    el.recordId = '3'; el.changed('recordId');
    el.recordId = ''; el.changed('recordId');
    release({ destroy() { destroyed++; } });
    await tick();
    assert.equal(destroyed, 2, 'a mount that finished after the selection moved is destroyed');
});
