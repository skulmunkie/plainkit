// The by-tier composition report (#769): derived from the real element metas and the two baselines, and the file the scorecard loads is what the build produces.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementSources } from '../tools/build.mjs';
import { tierReport, DEBT_RULES } from '../tools/tier-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const tiers = json('tools/tiers.baseline.json');
const tags = json('tools/tier-tags.baseline.json');
const elements = loadElementSources();
const modulesBaseline = JSON.parse(fs.readFileSync(path.join(root, '..', 'plainkit.audit.modules.baseline.json'), 'utf8'));
const report = tierReport(elements, tiers, tags, modulesBaseline);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

test('the tier counts add up to the element count and match each meta tier', () => {
    assert.equal(report.total, elements.length);
    assert.equal(sum(report.counts), elements.length);
    for (const t of report.tiers) assert.equal(report.counts[t], elements.filter(e => e.meta.tier === t).length, t);
});

test('the debt per rule adds up to the baseline totals', () => {
    for (const r of ['C1', 'C4']) assert.equal(sum(report.debt[r]), tiers.entries.filter(e => e.rule === r).length, r);
    for (const r of ['D1', 'S3', 'T1']) assert.equal(sum(report.debt[r]), tags.entries.filter(e => e.rule === r).reduce((n, e) => n + e.count, 0), r);
    assert.equal(report.debtTotal, tiers.entries.length + tags.entries.reduce((n, e) => n + e.count, 0));
    assert.deepEqual(Object.keys(report.debt), DEBT_RULES);
});

test('the module baseline is one separate group: debt per module rule, summing to the baseline, and no tier gains debt from it', () => {
    assert.equal(report.modules.total, modulesBaseline.entries.length);
    assert.equal(sum(report.modules.rules), modulesBaseline.entries.length);
    assert.deepEqual(Object.keys(report.modules.rules), [...new Set(modulesBaseline.entries.map(e => e.rule))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    assert.equal(report.debtTotal, tiers.entries.length + tags.entries.reduce((n, e) => n + e.count, 0), 'the module debt is not added to the tier debt');
    assert.equal(tierReport(elements, tiers, tags).modules, undefined, 'without the module baseline (a core/ built on its own) the group is absent');
});

test('a baseline entry for something that is not an element is an error, not silently dropped', () => {
    assert.throws(() => tierReport(elements, { entries: [{ rule: 'C1', element: 'nope', ref: 'pk-x' }] }, { entries: [] }), /not an element/);
});

test('tiers.current.json holds the report derived from the sources and baselines (that the file is what the build produces is generated-current.test.mjs)', () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'site/scorecard/tiers.current.json'), 'utf8')), report);
});
