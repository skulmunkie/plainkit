// Tests for the badge logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, countLabel } from './badge.js';

test('formatCount caps large counts and leaves small ones alone', () => {
    assert.equal(formatCount(7), '7');
    assert.equal(formatCount(99), '99');
    assert.equal(formatCount(100), '99+');
    assert.equal(formatCount(1500, 999), '999+');
    assert.equal(formatCount(1500, 0), '1500');
    assert.equal(formatCount(0), '0');
});

test('formatCount passes text through and copes with empty values', () => {
    assert.equal(formatCount('New'), 'New');
    assert.equal(formatCount(null), '');
    assert.equal(formatCount(''), '');
});

test('countLabel joins the count and its noun for assistive tech', () => {
    assert.equal(countLabel(4, 'unread'), '4 unread');
    assert.equal(countLabel(120, 'unread'), '99+ unread');
    assert.equal(countLabel(4), '4');
});
