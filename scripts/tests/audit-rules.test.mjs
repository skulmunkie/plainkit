// Rule/skill parity (design "Where the rules live in the skills", issue #518 A-8): the rule table in
// core/tools/audit/rules.mjs is meant to be the single source for the CLI (`--list-rules`, `--explain`) and the
// generated skill reference (references/conformance-rules.md); this test fails when any of those three views
// disagree, or when a rule has no example to render (the reverse - an example with no matching rule - is already
// caught by core/tools/audit/rules.test.mjs, "every S/D/T/A rule in the table has a test case").
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../build-skills.mjs';
import { RULES, getRuleMeta } from '../../core/tools/audit/rules.mjs';
import { EXAMPLES, MANUALLY_TESTED } from '../../core/tools/audit/examples.mjs';
import { run } from '../../core/tools/audit/cli.mjs';
import { SKILL_NAMES } from '../build-skills.mjs';

const gen = generate();
const RULE_ID = /^[SDTAPB]\d+$/;

function capture() {
    const out = [];
    return { out, stdout: (...a) => out.push(a.join(' ')), stderr: () => {} };
}

test('every rule id is well-formed and unique', () => {
    const seen = new Set();
    for (const rule of RULES) {
        assert.match(rule.id, RULE_ID, `FIX: rule id "${rule.id}" does not look like a family letter plus a number`);
        assert.ok(!seen.has(rule.id), `FIX: rule id "${rule.id}" is used twice in RULES`);
        seen.add(rule.id);
    }
});

test('every rule has a doc anchor, a fix template carrying its own id, and either an example or a recorded reason it has none', () => {
    for (const rule of RULES) {
        assert.ok(rule.docs, `FIX: rule ${rule.id} has no doc anchor`);
        assert.ok(rule.fixTemplate.includes(`[${rule.id}]`), `FIX: rule ${rule.id}'s fix template does not carry [${rule.id}]`);
        const hasExample = EXAMPLES.some(e => e.id === rule.id);
        assert.ok(hasExample || MANUALLY_TESTED.has(rule.id), `FIX: rule ${rule.id} has no wrong/right example in core/tools/audit/examples.mjs and is not in MANUALLY_TESTED - add one so it renders into references/conformance-rules.md`);
    }
});

test('references/conformance-rules.md (both skills) documents every rule id, and nothing else', () => {
    for (const skill of SKILL_NAMES) {
        const text = gen.get(`${skill}/references/conformance-rules.md`);
        assert.ok(text, `FIX: ${skill} has no references/conformance-rules.md - build-skills.mjs should generate one for every skill in SKILL_NAMES`);
        const headings = [...text.matchAll(/^### ([SDTAPB]\d+)$/gm)].map(m => m[1]);
        assert.deepEqual(headings.sort(), RULES.map(r => r.id).sort(), `FIX: ${skill}/references/conformance-rules.md's rule headings do not match RULES - run node scripts/bootstrap.mjs`);
    }
});

test('every rendered rule with an example carries its wrong and right snippet verbatim', () => {
    for (const skill of SKILL_NAMES) {
        const text = gen.get(`${skill}/references/conformance-rules.md`);
        for (const ex of EXAMPLES) {
            assert.ok(text.includes(ex.wrong), `FIX: ${skill}/references/conformance-rules.md is missing ${ex.id}'s wrong snippet - run node scripts/bootstrap.mjs`);
            assert.ok(text.includes(ex.right), `FIX: ${skill}/references/conformance-rules.md is missing ${ex.id}'s right snippet - run node scripts/bootstrap.mjs`);
        }
    }
});

test('"Check your work" in both SKILL.md tells an agent to run the CLI and lists every rule family', () => {
    const families = [...new Set(RULES.map(r => r.category))].sort();
    for (const skill of SKILL_NAMES) {
        const text = gen.get(`${skill}/SKILL.md`);
        assert.match(text, /npx plainkit audit --strict/, `FIX: ${skill}/SKILL.md's "Check your work" step does not tell an agent to run the CLI`);
        for (const fam of families) assert.ok(text.includes(`\`${RULES.find(r => r.category === fam).id}\``), `FIX: ${skill}/SKILL.md's checklist is missing family ${fam}`);
    }
});

test('`--list-rules` and `--explain <id>` agree with RULES for every id', async () => {
    const list = capture();
    await run(['--list-rules'], { stdout: list.stdout, stderr: () => {} });
    const listedIds = list.out.join('\n').split('\n').slice(1).map(l => l.trim().split(/\s+/)[0]).filter(Boolean);
    assert.deepEqual(listedIds.sort(), RULES.map(r => r.id).sort(), 'FIX: --list-rules and RULES disagree on the id set');

    for (const rule of RULES) {
        const explain = capture();
        const code = await run(['--explain', rule.id], { stdout: explain.stdout, stderr: () => {} });
        assert.equal(code, 0, `FIX: --explain ${rule.id} exited non-zero`);
        const text = explain.out.join('\n');
        assert.ok(text.startsWith(`${rule.id} (${rule.category})`), `FIX: --explain ${rule.id} does not start with its own id and category`);
        assert.ok(text.includes(rule.docs), `FIX: --explain ${rule.id} does not print its doc anchor`);
    }
});

test('getRuleMeta and the CLI --explain read the same table', () => {
    for (const rule of RULES) assert.equal(getRuleMeta(rule.id), rule);
});
