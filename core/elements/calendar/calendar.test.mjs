// Tests for the calendar logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { monthGrid, addDays, addMonths, dateForKey, focusForKey, weekdayNames, monthTitle, isBetween, isoDate, parseIso } from './calendar.js';

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

test('focusForKey clamps every key to the nearest enabled day inside min and max (issue 517)', () => {
    const min = '2026-09-05', max = '2026-09-20';
    assert.equal(focusForKey('2026-09-19', 'ArrowRight', false, min, max), '2026-09-20');
    assert.equal(focusForKey('2026-09-20', 'ArrowRight', false, min, max), '2026-09-20');
    assert.equal(focusForKey('2026-09-05', 'ArrowLeft', false, min, max), '2026-09-05');
    assert.equal(focusForKey('2026-09-18', 'ArrowDown', false, min, max), '2026-09-20');
    assert.equal(focusForKey('2026-09-07', 'ArrowUp', false, min, max), '2026-09-05');
    assert.equal(focusForKey('2026-09-10', 'Home', false, min, max), '2026-09-05');
    assert.equal(focusForKey('2026-09-10', 'End', false, min, max), '2026-09-20');
    assert.equal(focusForKey('2026-09-10', 'PageDown', false, min, max), '2026-09-20');
    assert.equal(focusForKey('2026-09-10', 'PageUp', true, min, max), '2026-09-05');
    assert.equal(focusForKey('2026-09-10', 'ArrowRight', false, '', ''), '2026-09-11', 'no bounds: unchanged');
    assert.equal(focusForKey('2026-09-10', 'x', false, min, max), null);
    assert.equal(focusForKey('2026-09-10', 'ArrowRight', false, '2026-09-20', '2026-09-05'), '2026-09-10', 'an empty window keeps the day');
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

// Range mode: the element's pick logic, driven through a stub base so no DOM is needed (the pure part is in core/tests/range-logic.test.mjs).
function makeCalendar(props = {}) {
    const days = [];
    const status = { textContent: '' };
    class Base { emit(name, detail) { this.events.push({ name, detail }); return true; } part() { return status; } toggleAttribute() {} }
    const cal = new (behaviour(Base))();
    Object.assign(cal, { events: [], range: true, start: '', end: '', value: '', min: '', max: '', readonly: false, disabled: false, locale: 'en', ownerDocument: { documentElement: { lang: 'en' } }, shadowRoot: { querySelectorAll: () => days } }, props);
    return { cal, status, days };
}

test('range mode: two picks commit start and end with the pk-range-change detail, and announce both steps', () => {
    const { cal, status } = makeCalendar();
    cal.pick('2026-09-10');
    assert.equal(cal.start, '2026-09-10'); assert.equal(cal.end, ''); assert.equal(cal.$pend, true);
    assert.equal(cal.events.length, 0);
    assert.equal(status.textContent, 'Range start set to Thursday, September 10, 2026');
    cal.pick('2026-09-15');
    assert.deepEqual(cal.events, [{ name: 'pk-range-change', detail: { start: '2026-09-10', end: '2026-09-15', valid: true } }]);
    assert.equal(cal.$pend, false);
    assert.equal(status.textContent, 'Range: Thursday, September 10, 2026 to Tuesday, September 15, 2026');
});

test('range mode: an earlier second pick is swapped, and pk-select is never raised', () => {
    const { cal } = makeCalendar();
    cal.pick('2026-09-20'); cal.pick('2026-09-05');
    assert.equal(cal.start, '2026-09-05'); assert.equal(cal.end, '2026-09-20');
    assert.ok(cal.events.every(e => e.name === 'pk-range-change'));
});

test('range mode: Escape (cancelRange) restores the previous complete range', () => {
    const { cal } = makeCalendar({ start: '2026-09-01', end: '2026-09-03' });
    cal.pick('2026-09-10');
    assert.equal(cal.end, '');
    cal.cancelRange();
    assert.equal(cal.start, '2026-09-01'); assert.equal(cal.end, '2026-09-03'); assert.equal(cal.$pend, false);
    assert.equal(cal.events.length, 0);
});

test('range mode: min, max, readonly and disabled block a pick', () => {
    const bounds = makeCalendar({ min: '2026-09-05', max: '2026-09-20' });
    bounds.cal.pick('2026-09-01'); bounds.cal.pick('2026-09-25');
    assert.equal(bounds.cal.start, ''); assert.ok(!bounds.cal.$pend);
    for (const flag of ['readonly', 'disabled']) { const { cal } = makeCalendar({ [flag]: true }); cal.pick('2026-09-10'); assert.equal(cal.start, ''); }
});

test('single mode is untouched: a pick sets value and raises pk-select', () => {
    const { cal } = makeCalendar({ range: false });
    cal.pick('2026-09-10');
    assert.equal(cal.value, '2026-09-10');
    assert.deepEqual(cal.events, [{ name: 'pk-select', detail: { value: '2026-09-10' } }]);
    assert.equal(cal.start, '');
});

test('paint marks the pending preview with data-range on the existing buttons', () => {
    const { cal, days } = makeCalendar();
    days.push(...['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'].map(date => ({ dataset: { date } })));
    cal.pick('2026-09-10'); cal.$over = '2026-09-12'; cal.paint();
    assert.deepEqual(days.map(d => d.dataset.range), ['', 'start', 'mid', 'end', '']);
});
