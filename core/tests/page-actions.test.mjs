// Unit tests for js/page-actions.js (#1943): the one action item shape, newAction first, collapse, disabled and busy, one pk-action event. Stub DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionItems, renderActions } from '../js/page-actions.js';

const fakeEl = tag => ({
    localName: tag, listeners: {}, kids: [], slot: '', textContent: '',
    addEventListener(t, fn) { this.listeners[t] = fn; }, removeAttribute(k) { if (k === 'slot') this.slot = ''; }, append(...k) { this.kids.push(...k); },
});
const make = () => { const events = []; return { events, ownerDocument: { createElement: fakeEl }, dispatchEvent: e => events.push(e) }; };
const warnings = () => { const w = []; w.fn = k => w.push(k); return w; };

test('newAction is drawn first and primary unless it names a variant', () => {
    const w = warnings();
    assert.deepEqual(actionItems([{ key: 'a', label: 'A' }], { key: 'new', label: 'New' }, w.fn).map(a => [a.key, a.variant]), [['new', 'primary'], ['a', undefined]]);
    assert.equal(actionItems([], { key: 'new', variant: 'ghost' })[0].variant, 'ghost');
});
test('an item with neither key nor href is not drawn and warns once per position', () => {
    const w = warnings();
    assert.deepEqual(actionItems([{ label: 'Nothing' }, { href: '#x', label: 'Go' }], undefined, w.fn).map(a => a.label), ['Go']);
    assert.deepEqual([...w], ['action:0']);
});
test('an existing item (label, href, variant, hint) draws as before: a button, a tooltip around it only with a hint', () => {
    const host = make();
    const [plain, hinted] = renderActions(host, [{ key: 'a', label: 'A', variant: 'ghost' }, { key: 'b', label: 'B', hint: 'Why' }]);
    assert.equal(plain.localName, 'pk-button');
    assert.equal(plain.slot, 'actions');
    assert.equal(plain.collapse, undefined, 'no icon: never collapsed');
    assert.equal(hinted.localName, 'pk-tooltip');
    assert.equal(hinted.text, 'Why');
    assert.equal(hinted.kids[0].textContent, 'B');
});
test('an icon item folds at the bar value (default phone); the label stays the content', () => {
    const host = make();
    assert.equal(renderActions(host, [{ key: 'a', label: 'A', icon: 'plus' }])[0].collapse, 'phone');
    const [b, c] = renderActions(host, [{ key: 'a', label: 'A', icon: 'plus' }, { key: 'b', label: 'B' }], { collapse: 'always' });
    assert.equal(b.collapse, 'always');
    assert.equal(b.iconName, 'plus');
    assert.equal(b.textContent, 'A');
    assert.equal(c.collapse, undefined);
    assert.equal(renderActions(host, [{ key: 'a', label: 'A', icon: 'plus' }], { collapse: 'none' })[0].collapse, 'none');
});
test('an unknown actionsCollapse warns and falls back to phone; an icon-less item under always warns', () => {
    const host = make(), w = warnings();
    assert.equal(renderActions(host, [{ key: 'a', label: 'A', icon: 'x' }], { collapse: 'wide', warn: w.fn })[0].collapse, 'phone');
    renderActions(host, [{ key: 'a', label: 'A' }], { collapse: 'always', warn: w.fn });
    assert.deepEqual([...w], ['actionsCollapse', 'action:icon']);
});
test('a key item raises one pk-action { key }; href, disabled and busy items raise nothing', () => {
    const host = make();
    const nodes = renderActions(host, [{ key: 'a', label: 'A' }, { key: 'l', label: 'L', href: '#l' }, { key: 'd', label: 'D', disabled: true }, { key: 'b', label: 'B', busy: true }]);
    for (const n of nodes) n.listeners.click?.();
    assert.equal(host.events.length, 1);
    assert.deepEqual([host.events[0].type, host.events[0].detail, host.events[0].bubbles], ['pk-action', { key: 'a' }, true]);
    assert.equal(nodes[1].href, '#l');
    assert.equal(nodes[2].disabled, true);
    assert.equal(nodes[3].busy, true);
});
