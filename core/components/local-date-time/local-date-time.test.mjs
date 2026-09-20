// Unit tests for the local-date-time component.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocal } from './local-date-time.js';

test('formatLocal formats an ISO instant in the given locale, date only on request, and passes bad input through', () => {
    assert.equal(formatLocal('2026-09-19T14:30:00Z', 'date', 'en-US'), new Date('2026-09-19T14:30:00Z').toLocaleDateString('en-US'));
    assert.equal(formatLocal('2026-09-19T14:30:00Z', 'datetime', 'en-US'), new Date('2026-09-19T14:30:00Z').toLocaleString('en-US'));
    assert.equal(formatLocal('not a date'), 'not a date');
});
