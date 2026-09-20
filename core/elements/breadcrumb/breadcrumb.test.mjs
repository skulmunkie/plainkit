// Unit tests for the breadcrumb collapse decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hiddenCrumbs, maxCrumbs } from './breadcrumb.js';

test('a trail that fits is shown whole', () => {
    assert.deepEqual(hiddenCrumbs(3), []);
    assert.deepEqual(hiddenCrumbs(4), []);
});

test('a long trail keeps the root and the last two and folds the middle', () => {
    assert.deepEqual(hiddenCrumbs(6), [1, 2, 3]);
    assert.deepEqual(hiddenCrumbs(5), [1, 2]);
});

test('the phone limit is lower, so a four-step trail folds there but not on a desktop', () => {
    assert.equal(maxCrumbs(1280), 4);
    assert.equal(maxCrumbs(375), 3);
    assert.deepEqual(hiddenCrumbs(4, maxCrumbs(375)), [1]);
    assert.deepEqual(hiddenCrumbs(4, maxCrumbs(1280)), []);
});

test('there is never nothing left to fold when head and tail already cover the trail', () => {
    assert.deepEqual(hiddenCrumbs(3, 2), []);
});

test('the template is a nav landmark with a slot for the crumbs and a real button for the fold', () => {
    const html = fs.readFileSync(new URL('./breadcrumb.html', import.meta.url), 'utf8');
    assert.match(html, /<nav[^>]*aria-label=/);
    assert.match(html, /<slot>/);
    assert.match(html, /<button[^>]*part="more"/);
    assert.ok(!/\sstyle=/.test(html));
});

