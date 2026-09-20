// The in-browser element tests (tests/browser/) cannot run here, so their last run is attested: report.json holds the results and a SHA-256 of
// every source the run covered. This fails when any of those sources changed since, or when the run had failures, or when an element has no
// coverage. To refresh: node tools/serve.mjs --write-reports, open /tests/browser/ in a visible tab, wait for "report saved".
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementSources } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'browser', 'report.json'), 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const REFRESH = 'run the browser tests: node tools/serve.mjs --write-reports, open /tests/browser/ in a visible tab, wait for "report saved"';

test('the last browser run passed', () => {
    assert.equal(report.failed, 0, `the attested run had ${report.failed} failures: ${REFRESH}`);
    assert.ok(report.passed >= 20, 'the browser suite has at least 20 cases');
    assert.equal(report.results.length, report.passed + report.failed);
});

test('every source the browser run covered is unchanged since the run', () => {
    const stale = Object.entries(report.sources).filter(([f, h]) => sha(f) !== h).map(([f]) => f);
    assert.deepEqual(stale, [], `changed since the browser run: ${REFRESH}`);
});

test('every element and the base modules are covered by the attestation', () => {
    const need = ['js/element.js', 'js/element-core.js', 'js/loader.js', 'tests/browser/cases.js', 'tests/browser/runner.js'];
    for (const el of loadElementSources()) for (const ext of ['html', 'css', 'meta.json']) need.push(`elements/${el.name}/${el.name}.${ext}`);
    const missing = need.filter(f => !(f in report.sources));
    assert.deepEqual(missing, [], `not covered by the attested run: ${REFRESH}`);
});
