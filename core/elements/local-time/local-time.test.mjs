import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInstant, formatLocal, relativeText } from './local-time.js';

const iso = '2026-09-19T14:30:00Z';

test('parseInstant accepts ISO strings and timestamps and rejects the rest', () => {
    assert.equal(parseInstant(iso).toISOString(), '2026-09-19T14:30:00.000Z');
    assert.equal(parseInstant(0).getTime(), 0);
    assert.equal(parseInstant('nope'), null);
    assert.equal(parseInstant(''), null);
    assert.equal(parseInstant(null), null);
});
test('formatLocal writes date, time and datetime in the given locale and zone', () => {
    const o = { locale: 'en-US', timeZone: 'UTC' };
    assert.equal(formatLocal(iso, { ...o, format: 'date' }), 'Sep 19, 2026');
    assert.match(formatLocal(iso, { ...o, format: 'time' }), /^2:30\sPM$/);
    assert.match(formatLocal(iso, { ...o, format: 'datetime' }), /^Sep 19, 2026.*2:30\sPM$/);
    assert.equal(formatLocal(iso, { ...o, format: 'date', length: 'short' }), '9/19/26');
    assert.equal(formatLocal(iso, { locale: 'de-DE', timeZone: 'Europe/Berlin', format: 'time' }), '16:30');
});
test('formatLocal follows the reader zone: the same instant differs across zones', () => {
    assert.notEqual(formatLocal(iso, { locale: 'en-US', timeZone: 'Asia/Tokyo', format: 'time' }), formatLocal(iso, { locale: 'en-US', timeZone: 'America/New_York', format: 'time' }));
});
test('a date-only value stays on its calendar day in any zone; a bad value gives an empty string', () => {
    assert.equal(formatLocal('2026-09-19', { locale: 'en-US', format: 'date' }), 'Sep 19, 2026');
    assert.equal(formatLocal('not a date'), '');
    assert.equal(formatLocal('2026-09-19', { locale: 'en-US', timeZone: 'nowhere/zone' }), '');
});
test('relativeText picks the largest whole unit', () => {
    const now = Date.parse(iso);
    assert.equal(relativeText(new Date(now - 3 * 3600e3), now, 'en'), '3 hours ago');
    assert.equal(relativeText(new Date(now + 2 * 86400e3), now, 'en'), 'in 2 days');
    assert.equal(relativeText(new Date(now), now, 'en'), 'now');
    assert.equal(relativeText(new Date(now - 90e3), now, 'en'), '1 minute ago');
    assert.equal(formatLocal(iso, { format: 'relative', locale: 'en', now: now + 60e3 }), '1 minute ago');
});
