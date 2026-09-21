import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAttrs, tipText } from './button.js';
import { accessibleName, evaluate, DEFAULTS } from '../../js/quality.js';

const base = { href: '/a', target: '', rel: '', download: null, disabled: false, busy: false, label: '' };

test('a link carries its href, role link and no rel unless it opens a new tab', () => {
    const a = linkAttrs(base);
    assert.equal(a.href, '/a'); assert.equal(a.role, 'link'); assert.equal(a.rel, null); assert.equal(a.target, null); assert.equal(a['aria-disabled'], null);
});
test('a _blank link defaults to noopener, an explicit rel wins', () => {
    assert.equal(linkAttrs({ ...base, target: '_blank' }).rel, 'noopener');
    assert.equal(linkAttrs({ ...base, target: '_blank', rel: 'nofollow' }).rel, 'nofollow');
});
test('download passes through, empty string included', () => {
    assert.equal(linkAttrs({ ...base, download: 'a.csv' }).download, 'a.csv');
    assert.equal(linkAttrs({ ...base, download: '' }).download, '');
});
test('disabled and busy drop href and download and say aria-disabled; only busy keeps a tab stop', () => {
    const d = linkAttrs({ ...base, download: 'a', disabled: true });
    assert.equal(d.href, null); assert.equal(d.download, null); assert.equal(d['aria-disabled'], 'true'); assert.equal(d.tabindex, null);
    const b = linkAttrs({ ...base, busy: true });
    assert.equal(b.href, null); assert.equal(b['aria-disabled'], 'true'); assert.equal(b.tabindex, '0'); assert.equal(b['aria-busy'], 'true');
});
test('the label becomes aria-label only when given', () => {
    assert.equal(linkAttrs({ ...base, label: 'Open' })['aria-label'], 'Open');
    assert.equal(linkAttrs(base)['aria-label'], null);
});

// ---- icon mode: the name and the tooltip
test('an icon button is named by its label, else by the words in the slot, with the whitespace tidied', () => {
    assert.equal(tipText({ icon: true, label: '' }, '  Back to\n   Orders '), 'Back to Orders');
    assert.equal(tipText({ icon: true, label: 'Add' }, 'Add item'), 'Add', 'the label wins over the slotted text');
    assert.equal(tipText({ icon: true, label: '' }, ''), '', 'no name, no tooltip');
    assert.equal(tipText({ icon: false, label: 'Add' }, 'Add item'), '', 'a button that is not icon-only has no tooltip title');
});

const fakeButton = (attrs, text) => ({ localName: 'pk-button', tagName: 'PK-BUTTON', textContent: text, ownerDocument: {}, getAttribute: n => attrs[n] ?? null });

test('the quality checks see a pk-button and name it from label, text or aria-label', () => {
    assert.ok(DEFAULTS.hosts.split(',').map(s => s.trim()).includes('pk-button'), 'measured as a control');
    assert.ok(!DEFAULTS.interactive.includes('pk-button'), 'but not focus-probed: its ring is drawn inside its shadow root');
    assert.equal(accessibleName(fakeButton({ label: 'Add' }, 'Add item')), 'Add');
    assert.equal(accessibleName(fakeButton({}, ' Back to Orders ')), 'Back to Orders');
    assert.equal(accessibleName(fakeButton({ 'aria-label': 'Close' }, '')), 'Close');
    assert.equal(accessibleName(fakeButton({ 'icon-name': 'plus' }, '')), '', 'an icon and nothing else has no name');
});

test('an icon-only button with no accessible name is a failure', () => {
    const measures = name => ({ controls: [{ selector: 'pk-button', tag: 'pk-button', name, width: 44, height: 44, tabindex: null }], images: [], scrollers: [], literals: [], overflowX: 0, width: 375, nodes: 0 });
    assert.deepEqual(evaluate(measures(''), { phone: true }).map(f => [f.check, f.severity]), [['unnamed-input', 'error']]);
    assert.deepEqual(evaluate(measures('Add item'), { phone: true }), []);
});
