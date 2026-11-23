// The budget ledger (#1985): core/tests/budget-ledger.json mirrors every ratchet and hard-gate budget and holds the owner-approved exceptions.
// It is read-only: a number is edited in its source, and this test fails when the ledger and the source disagree.
// An exception is { budget, pr, approvedBy, reason }, added in the approving pull request; there is no expiry. Classes: hard (never exceeded, no exception), release (ceiling = last release measured + 5 percent, set by set-ceilings.mjs), ratchet (moves down; the class of today's element, module and package budgets until steps 3 and 4 of the policy migration), advisory (reported, backstop only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGETS } from '../site/scorecard/scoring.data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readText = p => fs.readFileSync(path.join(root, p), 'utf8');
const ledger = JSON.parse(readText('core/tests/budget-ledger.json'));
const CLASSES = ['hard', 'release', 'ratchet', 'advisory'];

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
        if (!CLASSES.includes(b.class)) errors.push(`${b.id}: class must be one of ${CLASSES.join(', ')}`);
        if ((b.movedBy ? b.limit !== null : typeof b.limit !== 'number') || !b.unit || !b.source?.file || !b.enforcedBy) errors.push(`${b.id}: needs a numeric limit (null when movedBy names the tool that rewrites its source), unit, source.file and enforcedBy`);
    }
    if (!Array.isArray(l.exceptions)) errors.push('exceptions must be an array');
    for (const e of l.exceptions ?? []) {
        const b = (l.budgets ?? []).find(x => x.id === e.budget);
        if (!b) errors.push(`exception for unknown budget ${e.budget}`);
        else if (b.class === 'hard') errors.push(`${e.budget} is a hard gate: it takes no exception`);
        if (!Number.isInteger(e.pr) || e.pr <= 0) errors.push(`exception ${e.budget}: pr must be the pull request number`);
        if (typeof e.approvedBy !== 'string' || !e.approvedBy.trim()) errors.push(`exception ${e.budget}: approvedBy is required (the owner or the orchestrator)`);
        if (typeof e.reason !== 'string' || !e.reason.trim()) errors.push(`exception ${e.budget}: reason is required`);
        for (const old of ['until', 'issue', 'plan']) if (old in e) errors.push(`exception ${e.budget}: ${old} is no longer part of an exception (policy of 2026-11-23)`);
    }
    return errors;
}

test('the ledger is well formed and every exception names a pull request, an approver and a reason', () => {
    assert.deepEqual(checkSchema(ledger), [], 'FIX: correct core/tests/budget-ledger.json (schema in its _comment)');
});

test('the ledger agrees with the source of every budget (it is a mirror, never the place to edit a number)', () => {
    for (const b of ledger.budgets.filter(x => x.limit !== null)) assert.equal(sourceValue(b), b.limit, `${b.id}: the ledger says ${b.limit} but ${b.source.file} says ${sourceValue(b)}. FIX: edit the number in its source under the budget rules (never raise one without an owner-approved exception), then mirror it here.`);
});

test('the rules themselves: schema errors, classes and hard gates', () => {
    const ok = { id: 'x', class: 'ratchet', limit: 1, unit: 'b', source: { file: 'f' }, enforcedBy: 't' };
    const hard = { ...ok, id: 'h', class: 'hard' };
    const ex = { budget: 'x', pr: 5, approvedBy: 'owner', reason: 'r' };
    const l = e => ({ budgets: [ok, hard], exceptions: e });
    assert.deepEqual(checkSchema(l([ex])), []);
    for (const cls of ['release', 'advisory']) assert.deepEqual(checkSchema({ budgets: [{ ...ok, class: cls }], exceptions: [] }), []);
    assert.equal(checkSchema({ budgets: [{ ...ok, class: 'soft' }], exceptions: [] }).length, 1);
    assert.equal(checkSchema(l([{ ...ex, pr: undefined }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, approvedBy: '' }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, reason: '' }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, until: '2027-01-31' }])).length, 1);
    assert.equal(checkSchema(l([{ ...ex, budget: 'h' }])).length, 1);
});
