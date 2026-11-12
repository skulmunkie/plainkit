// The budget ledger (#1985): core/tests/budget-ledger.json mirrors every ratchet and hard-gate budget and holds the owner-approved exceptions.
// It is read-only: a number is edited in its source, and this test fails when the ledger and the source disagree.
// An exception past its `until` date fails here. The date comes from PK_BUDGET_TODAY (YYYY-MM-DD) when set, else the real date; the unit tests pass a fixed date.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../site/scorecard/scoring.data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readText = p => fs.readFileSync(path.join(root, p), 'utf8');
const ledger = JSON.parse(readText('core/tests/budget-ledger.json'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function sourceValue(entry) {
    const s = entry.source;
    if (s.budget) {
        const b = BUDGETS[s.budget];
        return (s.key ? b?.[s.key] : b)?.limit;
    }
    if (s.const) return Number(new RegExp(`const ${s.const} = ([0-9_]+)`).exec(readText(s.file))?.[1].replace(/_/g, ''));
    let v = JSON.parse(readText(s.file));
    if (s.package) v = v.packages.find(p => p.id === s.package);
    for (const k of s.path) v = v?.[k];
    return v;
}

export function checkSchema(l) {
    const errors = [];
    const ids = new Set();
    for (const b of l.budgets ?? []) {
        if (!b.id || ids.has(b.id)) errors.push(`budget id missing or duplicated: ${b.id}`);
        ids.add(b.id);
        if (!['hard', 'ratchet'].includes(b.class)) errors.push(`${b.id}: class must be hard or ratchet`);
        if (typeof b.limit !== 'number' || !b.unit || !b.source?.file || !b.enforcedBy) errors.push(`${b.id}: needs a numeric limit, unit, source.file and enforcedBy`);
    }
    if (!Array.isArray(l.exceptions)) errors.push('exceptions must be an array');
    for (const e of l.exceptions ?? []) {
        const b = (l.budgets ?? []).find(x => x.id === e.budget);
        if (!b) errors.push(`exception for unknown budget ${e.budget}`);
        else if (b.class === 'hard') errors.push(`${e.budget} is a hard gate: it takes no exception`);
        if (!Number.isInteger(e.issue) || e.issue <= 0) errors.push(`exception ${e.budget}: issue must be an issue number`);
        if (!e.reason || !e.plan) errors.push(`exception ${e.budget}: reason and plan are required`);
        if (!ISO.test(e.until ?? '') || Number.isNaN(Date.parse(e.until))) errors.push(`exception ${e.budget}: until must be an ISO date (YYYY-MM-DD)`);
    }
    return errors;
}

export function expiredExceptions(l, today) {
    return (l.exceptions ?? []).filter(e => e.until < today).map(e => {
        const b = l.budgets.find(x => x.id === e.budget);
        return `the carve-out plan expired: bring ${e.budget} back under ${b?.limit} ${b?.unit ?? ''} or ask the owner to renew with a new date (issue #${e.issue}, until ${e.until}). FIX: carve the code out as planned, or get the owner's renewal on the issue.`;
    });
}

const today = /^\d{4}-\d{2}-\d{2}$/.test(process.env.PK_BUDGET_TODAY ?? '') ? process.env.PK_BUDGET_TODAY : new Date().toISOString().slice(0, 10);

test('the ledger is well formed and every exception has an issue, a reason, a plan and a date', () => {
    assert.deepEqual(checkSchema(ledger), [], 'FIX: correct core/tests/budget-ledger.json (schema in its _comment)');
});

test('the ledger agrees with the source of every budget (it is a mirror, never the place to edit a number)', () => {
    for (const b of ledger.budgets) assert.equal(sourceValue(b), b.limit, `${b.id}: the ledger says ${b.limit} but ${b.source.file} says ${sourceValue(b)}. FIX: edit the number in its source under the budget rules (never raise one without an owner-approved exception), then mirror it here.`);
});

test('no budget exception is past its expiry date', () => {
    assert.deepEqual(expiredExceptions(ledger, today), []);
});

test('the rules themselves: schema errors, expiry and hard gates (fixed dates)', () => {
    const ok = { id: 'x', class: 'ratchet', limit: 1, unit: 'b', source: { file: 'f' }, enforcedBy: 't' };
    const hard = { ...ok, id: 'h', class: 'hard' };
    const ex = { budget: 'x', until: '2027-01-31', issue: 5, reason: 'r', plan: 'p' };
    const l = e => ({ budgets: [ok, hard], exceptions: e });
    assert.deepEqual(checkSchema(l([ex])), []);
    assert.equal(checkSchema(l([{ ...ex, issue: undefined }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, plan: '' }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, until: 'soon' }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, budget: 'h' }])).length, 1);
    assert.deepEqual(expiredExceptions(l([ex]), '2027-01-31'), []);
    const [msg] = expiredExceptions(l([ex]), '2027-02-01');
    assert.match(msg, /the carve-out plan expired: bring x back under 1 b or ask the owner to renew with a new date/);
});
