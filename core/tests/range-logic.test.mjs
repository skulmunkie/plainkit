// Tests for the pure range selection logic behind pk-calendar's range mode (core/js/range-logic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderRange, clickRange, dayRole, shownRange, roleLabel, announce } from '../js/range-logic.js';

test('orderRange puts the earlier day first', () => {
    assert.deepEqual(orderRange('2026-09-10', '2026-09-02'), { start: '2026-09-02', end: '2026-09-10' });
    assert.deepEqual(orderRange('2026-09-02', '2026-09-10'), { start: '2026-09-02', end: '2026-09-10' });
    assert.deepEqual(orderRange('2026-09-02', '2026-09-02'), { start: '2026-09-02', end: '2026-09-02' });
});

test('the first click sets the start and waits, the second sets the end and is done', () => {
    const one = clickRange({ pending: false, start: '' }, '2026-09-10');
    assert.deepEqual(one, { start: '2026-09-10', end: '', pending: true, done: false });
    assert.deepEqual(clickRange(one, '2026-09-15'), { start: '2026-09-10', end: '2026-09-15', pending: false, done: true });
});

test('a second click before the start swaps the ends; the same day is a one-day range', () => {
    assert.deepEqual(clickRange({ pending: true, start: '2026-09-10' }, '2026-09-03'), { start: '2026-09-03', end: '2026-09-10', pending: false, done: true });
    assert.deepEqual(clickRange({ pending: true, start: '2026-09-10' }, '2026-09-10'), { start: '2026-09-10', end: '2026-09-10', pending: false, done: true });
});

test('a click after a complete range starts a new one', () => {
    assert.deepEqual(clickRange({ pending: false, start: '2026-09-03' }, '2026-09-20'), { start: '2026-09-20', end: '', pending: true, done: false });
});

test('dayRole tells start, end, mid, only and outside apart', () => {
    const r = { start: '2026-09-10', end: '2026-09-14' };
    assert.equal(dayRole('2026-09-10', r), 'start');
    assert.equal(dayRole('2026-09-14', r), 'end');
    assert.equal(dayRole('2026-09-12', r), 'mid');
    assert.equal(dayRole('2026-09-09', r), '');
    assert.equal(dayRole('2026-09-15', r), '');
    assert.equal(dayRole('2026-09-10', { start: '2026-09-10', end: '' }), 'only');
    assert.equal(dayRole('2026-09-11', { start: '2026-09-10', end: '' }), '');
    assert.equal(dayRole('2026-09-10', { start: '2026-09-10', end: '2026-09-10' }), 'only');
    assert.equal(dayRole('2026-09-10', { start: '', end: '' }), '');
});

test('shownRange previews the pending range up to the hovered day, in either direction', () => {
    const pend = { start: '2026-09-10', end: '', pending: true };
    assert.deepEqual(shownRange(pend, '2026-09-14'), { start: '2026-09-10', end: '2026-09-14' });
    assert.deepEqual(shownRange(pend, '2026-09-06'), { start: '2026-09-06', end: '2026-09-10' });
    assert.deepEqual(shownRange(pend, ''), { start: '2026-09-10', end: '' });
    assert.deepEqual(shownRange({ start: '2026-09-01', end: '2026-09-02', pending: false }, '2026-09-20'), { start: '2026-09-01', end: '2026-09-02' });
});

test('labels and announcements name the range state', () => {
    assert.equal(roleLabel('start', false), 'range start');
    assert.equal(roleLabel('end', false), 'range end');
    assert.equal(roleLabel('mid', false), 'in range');
    assert.equal(roleLabel('only', true), 'range start');
    assert.equal(roleLabel('only', false), 'range start and end');
    assert.equal(roleLabel('', false), '');
    const name = x => `<${x}>`;
    assert.equal(announce({ start: '2026-09-10', end: '', pending: true }, name), 'Range start set to <2026-09-10>');
    assert.equal(announce({ start: '2026-09-10', end: '2026-09-14', pending: false }, name), 'Range: <2026-09-10> to <2026-09-14>');
});
