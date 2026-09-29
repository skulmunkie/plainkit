// Unit tests for the baseline/ratchet module (design 5.3, #629 A-6). The CLI's own baseline tests
// (core/tools/audit/cli.test.mjs) cover the end-to-end flag wiring; these stay at the pure-function level.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, loadBaseline, writeBaseline, applyBaseline, BaselineError, DEFAULT_BASELINE_NAME } from './baseline.mjs';

test('fingerprint ignores whitespace differences and is stable for the same rule/message/file', () => {
    const a = { rule: 'D1', message: 'writes <table>', file: 'a.html' };
    const b = { rule: 'D1', message: 'writes  <table>  ', file: 'a.html' };
    assert.equal(fingerprint(a), fingerprint(b));
});

test('fingerprint differs when the rule, message or file differs', () => {
    const base = { rule: 'D1', message: 'writes <table>', file: 'a.html' };
    assert.notEqual(fingerprint(base), fingerprint({ ...base, rule: 'D2' }));
    assert.notEqual(fingerprint(base), fingerprint({ ...base, message: 'writes <button>' }));
    assert.notEqual(fingerprint(base), fingerprint({ ...base, file: 'b.html' }));
});

test('loadBaseline: a missing file is an empty baseline, not an error', () => {
    assert.deepEqual(loadBaseline(path.join(os.tmpdir(), 'plainkit-audit-does-not-exist.json')), []);
});

test('loadBaseline: malformed JSON or a missing entries array throws BaselineError', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plainkit-audit-'));
    const badJson = path.join(dir, 'a.json');
    fs.writeFileSync(badJson, '{not json');
    assert.throws(() => loadBaseline(badJson), BaselineError);

    const noEntries = path.join(dir, 'b.json');
    fs.writeFileSync(noEntries, JSON.stringify({ version: 1 }));
    assert.throws(() => loadBaseline(noEntries), BaselineError);
});

test('writeBaseline then loadBaseline round-trips the same findings, sorted', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plainkit-audit-'));
    const file = path.join(dir, DEFAULT_BASELINE_NAME);
    const findings = [
        { rule: 'D1', file: 'b.html', message: 'writes <table>' },
        { rule: 'D1', file: 'a.html', message: 'writes <button>' },
    ];
    writeBaseline(file, findings);
    const entries = loadBaseline(file);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].file, 'a.html'); // sorted by file first
    assert.equal(entries.every(e => e.fingerprint.length === 16), true);
});

test('applyBaseline hides a known finding and reports an unmatched entry as stale', () => {
    const known = { rule: 'D1', file: 'a.html', message: 'writes <table>' };
    const fresh = { rule: 'D2', file: 'a.html', message: 'writes <div class="modal">' };
    const entries = [{ rule: known.rule, file: known.file, fingerprint: fingerprint(known) }];
    const { visible, stale } = applyBaseline([known, fresh], entries);
    assert.deepEqual(visible, [fresh]);
    assert.equal(stale.length, 0);

    const { visible: visible2, stale: stale2 } = applyBaseline([fresh], entries);
    assert.deepEqual(visible2, [fresh]);
    assert.equal(stale2.length, 1);
    assert.equal(stale2[0].rule, 'D1');
});
