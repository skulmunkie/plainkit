import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAttrs } from './button.js';

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
