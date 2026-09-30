import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBaseline, filterBaseline, groupBaselineByFile, groupBaselineByRule, baselineRows, describeStaleness, baselineDetail } from '../modules/audit-dashboard/logic.js';

// A small fixture matching the real shape of plainkit.audit.modules.baseline.json (repo root): { version, entries: [{ rule, file, fingerprint }] }.
const FIXTURE = {
    version: 1,
    entries: [
        { rule: 'S1', file: 'core/modules/code-explorer/code-explorer.css', fingerprint: 'a' },
        { rule: 'S3', file: 'core/modules/code-explorer/element.js', fingerprint: 'b' },
        { rule: 'S3', file: 'core/modules/code-explorer/element.js', fingerprint: 'b' },
        { rule: 'S9', file: 'core/modules/code-explorer/code-explorer.css', fingerprint: 'c' },
        { rule: 'S3', file: 'core/modules/logs/logs.js', fingerprint: 'd' },
    ],
};

test('parseBaseline reads a valid document and rejects a malformed one', () => {
    assert.equal(parseBaseline(FIXTURE).length, 5);
    assert.throws(() => parseBaseline(null), /not a module baseline/);
    assert.throws(() => parseBaseline({}), /entries/);
    assert.throws(() => parseBaseline({ entries: [{ rule: 'S1' }] }), /rule and a file/);
});

test('filterBaseline matches rule and file substrings case-insensitively, and either alone', () => {
    const entries = parseBaseline(FIXTURE);
    assert.equal(filterBaseline(entries, { rule: 's3' }).length, 3);
    assert.equal(filterBaseline(entries, { file: 'code-explorer' }).length, 4);
    assert.equal(filterBaseline(entries, { rule: 's3', file: 'logs' }).length, 1);
    assert.equal(filterBaseline(entries).length, 5);
});

test('groupBaselineByFile groups by file then rule id, sorted, with counts', () => {
    const groups = groupBaselineByFile(parseBaseline(FIXTURE));
    assert.deepEqual(groups.map(g => g.file), ['core/modules/code-explorer/code-explorer.css', 'core/modules/code-explorer/element.js', 'core/modules/logs/logs.js']);
    const explorerCss = groups.find(g => g.file.endsWith('code-explorer.css'));
    assert.equal(explorerCss.count, 2);
    assert.deepEqual(explorerCss.rules, [{ rule: 'S1', count: 1 }, { rule: 'S9', count: 1 }]);
    const element = groups.find(g => g.file.endsWith('element.js'));
    assert.deepEqual(element.rules, [{ rule: 'S3', count: 2 }]);
});

test('groupBaselineByRule groups by rule id then file, sorted, with counts', () => {
    const groups = groupBaselineByRule(parseBaseline(FIXTURE));
    assert.deepEqual(groups.map(g => g.rule), ['S1', 'S3', 'S9']);
    const s3 = groups.find(g => g.rule === 'S3');
    assert.equal(s3.count, 3);
    assert.deepEqual(s3.files, [{ file: 'core/modules/code-explorer/element.js', count: 2 }, { file: 'core/modules/logs/logs.js', count: 1 }]);
});

test('baselineRows flattens to one row per file/rule pair with a stable id', () => {
    const rows = baselineRows(parseBaseline(FIXTURE));
    assert.equal(rows.length, 4);
    assert.deepEqual(new Set(rows.map(r => r.id)).size, rows.length);
    assert.deepEqual(rows.find(r => r.file.endsWith('element.js')), { id: 'core/modules/code-explorer/element.js::S3', file: 'core/modules/code-explorer/element.js', rule: 'S3', count: 2 });
});

test('describeStaleness formats a valid mtime and falls back for an invalid one', () => {
    assert.equal(describeStaleness('2026-09-30T12:00:00.000Z'), 'generated 2026-09-30 12:00:00 UTC');
    assert.equal(describeStaleness('not a date'), 'generated: unknown');
});

test('baselineDetail describes a row for the Properties panel, and null for no selection', () => {
    assert.equal(baselineDetail(null), null);
    const detail = baselineDetail({ id: 'x', file: 'a.js', rule: 'S3', count: 2 });
    assert.equal(detail.heading, 'S3');
    assert.deepEqual(detail.fields, [{ label: 'Rule', value: 'S3' }, { label: 'File', value: 'a.js' }, { label: 'Occurrences', value: '2' }]);
    assert.match(detail.fix, /scripts\/audit-modules\.mjs/);
});
