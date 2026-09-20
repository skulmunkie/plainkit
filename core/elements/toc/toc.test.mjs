// Unit tests for the scroll-spy decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { spyIndex, spyIndexAtEnd, fragmentOf, slug } from './toc.js';

test('the current heading is the last one that has reached the offset', () => {
    assert.equal(spyIndex([-400, -50, 300, 700], 80), 1);
    assert.equal(spyIndex([-400, -50, 60, 700], 80), 2);
});

test('before the first heading reaches the offset the first is current; with no headings there is none', () => {
    assert.equal(spyIndex([200, 500], 80), 0);
    assert.equal(spyIndex([], 80), -1);
});

test('at the very bottom the last heading wins even if it never reached the offset', () => {
    assert.equal(spyIndexAtEnd([-900, -300, 400], 80, 1000, 1500, 500), 2);
    assert.equal(spyIndexAtEnd([-900, -300, 400], 80, 900, 1500, 500), 1);
    assert.equal(spyIndexAtEnd([10, 200], 80, 0, 300, 300), 0, 'a page that does not scroll stays on the first');
});

test('only a same-page fragment is a target', () => {
    assert.equal(fragmentOf('#usage'), 'usage');
    assert.equal(fragmentOf('#a%20b'), 'a b');
    assert.equal(fragmentOf('other.html#usage'), null);
    assert.equal(fragmentOf('#'), null);
    assert.equal(fragmentOf(undefined), null);
});

test('a heading without an id gets a readable, unique one', () => {
    assert.equal(slug('Getting started!'), 'getting-started');
    assert.equal(slug('Getting started', new Set(['getting-started'])), 'getting-started-2');
    assert.equal(slug('Getting started', new Set(['getting-started', 'getting-started-2'])), 'getting-started-3');
    assert.equal(slug('!!!'), 'section');
});

