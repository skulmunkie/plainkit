// Unit tests for the pure strict engine (core/tools/strict/engine.mjs, #605 slice A-1 of the conformance-audit
// design). In-memory only: no fixtures on disk, per the design's testing philosophy (section 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles, registerRuleset, getRuleset, resetRulesets } from '../tools/strict/engine.mjs';

test.afterEach(() => resetRulesets());

test('checkFiles requires an array of files', () => {
    assert.throws(() => checkFiles(null), /files must be an array/);
    assert.throws(() => checkFiles([{ path: 'a.js' }]), /string path and a string text/);
});

test('a rule without applies() runs on every file', () => {
    const rule = { id: 'X1', scan: file => (file.text.includes('bad') ? [{ line: 1, message: 'bad' }] : []) };
    const findings = checkFiles([{ path: 'a.js', text: 'ok' }, { path: 'b.js', text: 'bad code' }], { rules: [rule] });
    assert.deepEqual(findings.map(f => f.file), ['b.js']);
    assert.equal(findings[0].rule, 'X1');
});

test('applies() scopes a rule to matching files', () => {
    const rule = { id: 'X2', applies: file => file.path.endsWith('.css'), scan: () => [{ line: 3, message: 'hit' }] };
    const findings = checkFiles([{ path: 'a.js', text: '' }, { path: 'a.css', text: '' }], { rules: [rule] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'a.css');
    assert.equal(findings[0].line, 3);
});

test('findings are sorted by file then line', () => {
    const rule = {
        id: 'X3',
        scan: file => file.text.split('\n').map((line, i) => ({ line: i + 1, message: line })).filter(h => h.message),
    };
    const files = [{ path: 'b.js', text: 'hit-b1' }, { path: 'a.js', text: '\nhit-a2\nhit-a3' }];
    const findings = checkFiles(files, { rules: [rule] });
    assert.deepEqual(findings.map(f => `${f.file}:${f.line}`), ['a.js:2', 'a.js:3', 'b.js:1']);
});

test('a rule carries its meta slot onto every finding', () => {
    const rule = { id: 'X4', meta: { category: 'D', docs: 'https://example.test/x4' }, scan: () => [{ line: 1, message: 'm' }] };
    const [finding] = checkFiles([{ path: 'a.js', text: '' }], { rules: [rule] });
    assert.deepEqual(finding.meta, { category: 'D', docs: 'https://example.test/x4' });
});

test('a rule with no meta produces no meta field', () => {
    const rule = { id: 'X5', scan: () => [{ line: 1, message: 'm' }] };
    const [finding] = checkFiles([{ path: 'a.js', text: '' }], { rules: [rule] });
    assert.equal('meta' in finding, false);
});

test('registerRuleset/getRuleset name rules for checkFiles({ ruleset })', () => {
    const rule = { id: 'M1', scan: () => [{ line: 1, message: 'm' }] };
    registerRuleset('module', [rule]);
    assert.deepEqual(getRuleset('module'), [rule]);
    const findings = checkFiles([{ path: 'a.js', text: '' }], { ruleset: 'module' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'M1');
});

test('an unknown ruleset name resolves to no rules, not an error', () => {
    assert.deepEqual(getRuleset('nope'), []);
    assert.deepEqual(checkFiles([{ path: 'a.js', text: 'x' }], { ruleset: 'nope' }), []);
});

test('checkFiles defaults to the "module" ruleset when none is named', () => {
    const rule = { id: 'M2', scan: () => [{ line: 1, message: 'm' }] };
    registerRuleset('module', [rule]);
    const findings = checkFiles([{ path: 'a.js', text: '' }]);
    assert.equal(findings.length, 1);
});

test('registerRuleset validates its arguments', () => {
    assert.throws(() => registerRuleset('', []), /non-empty string/);
    assert.throws(() => registerRuleset('module', 'nope'), /must be an array/);
});

test('an allow entry suppresses exactly count real hits, per rule and path', () => {
    const rule = { id: 'D3', scan: file => [1, 2, 3].map(line => ({ line, message: `hit ${file.path}:${line}` })) };
    const allow = [{ rule: 'D3', path: 'legacy.js', count: 2, reason: 'tracked gap, at least twenty characters long', issue: '#1' }];
    const findings = checkFiles([{ path: 'legacy.js', text: '' }], { rules: [rule], allow });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 3);
});

test('an allow entry never suppresses hits in a different file', () => {
    const rule = { id: 'D3', scan: () => [{ line: 1, message: 'hit' }] };
    const allow = [{ rule: 'D3', path: 'other.js', count: 5, reason: 'tracked gap, at least twenty characters long', issue: '#1' }];
    const findings = checkFiles([{ path: 'legacy.js', text: '' }], { rules: [rule], allow });
    assert.equal(findings.length, 1);
});

test('no allow option leaves every finding in place', () => {
    const rule = { id: 'D3', scan: () => [{ line: 1, message: 'hit' }] };
    const findings = checkFiles([{ path: 'a.js', text: '' }], { rules: [rule] });
    assert.equal(findings.length, 1);
});
