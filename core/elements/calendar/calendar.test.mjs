// Tests for the calendar logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, addDays, addMonths, dateForKey, weekdayNames, monthTitle, isBetween, isoDate, parseIso } from './calendar.js';

test('monthGrid lays September 2026 out in Sunday-first weeks with lead and trail days', () => {
    const g = monthGrid(2026, 8);
    assert.equal(g.length, 5);
    assert.ok(g.every(w => w.length === 7));
    assert.equal(g[0][0].date, '2026-08-30');
    assert.equal(g[0][0].inMonth, false);
    assert.equal(g[0][2].date, '2026-09-01');
    assert.equal(g[0][2].inMonth, true);
    assert.equal(g[4][6].date, '2026-10-03');
});

test('monthGrid respects a Monday week start and covers six weeks when needed', () => {
    assert.equal(monthGrid(2026, 8, 1)[0][0].date, '2026-08-31');
    assert.equal(monthGrid(2026, 2).length, 5);
    assert.equal(monthGrid(2027, 0).length, 6);
});

test('every month has exactly its own number of in-month days', () => {
    for (let m = 0; m < 12; m++) {
        const days = monthGrid(2028, m).flat().filter(c => c.inMonth).length;
        assert.equal(days, new Date(Date.UTC(2028, m + 1, 0)).getUTCDate());
    }
});

test('addDays and addMonths cross boundaries and clamp short months', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
});

test('dateForKey follows the grid pattern', () => {
    assert.equal(dateForKey('2026-09-19', 'ArrowRight'), '2026-09-20');
    assert.equal(dateForKey('2026-09-19', 'ArrowUp'), '2026-09-12');
    assert.equal(dateForKey('2026-09-19', 'PageDown'), '2026-10-19');
    assert.equal(dateForKey('2026-09-19', 'PageDown', true), '2027-09-19');
    assert.equal(dateForKey('2026-09-19', 'Home'), '2026-09-01');
    assert.equal(dateForKey('2026-09-19', 'End'), '2026-09-30');
    assert.equal(dateForKey('2026-09-19', 'x'), null);
});

test('weekday names rotate with the week start and titles read in a locale', () => {
    assert.deepEqual(weekdayNames('en', 0, 'short'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    assert.equal(weekdayNames('en', 1, 'short')[0], 'Mon');
    assert.equal(monthTitle(2026, 8, 'en'), 'September 2026');
});

test('isBetween treats missing bounds as open and iso helpers round-trip', () => {
    assert.equal(isBetween('2026-09-19', '2026-09-01', '2026-09-30'), true);
    assert.equal(isBetween('2026-10-01', '2026-09-01', '2026-09-30'), false);
    assert.equal(isBetween('2026-10-01', undefined, undefined), true);
    assert.deepEqual(parseIso(isoDate(2026, 8, 5)), { y: 2026, m0: 8, d: 5 });
});
