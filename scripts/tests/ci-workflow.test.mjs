// .github/workflows/ci.yml, checked as text (there is no YAML parser in this repository; `python -c "import yaml; yaml.safe_load(open(...))"`
// validates the syntax): the jobs, the required check names, timeouts, permissions and the pieces the failure guidance depends on.
// Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOBS, SUMMARY_JOB } from '../ci-report.mjs';
import { GROUPS } from '../verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const ci = read('.github/workflows/ci.yml');

// The text of one job: from "  <id>:" to the next job or the end.
function job(id) {
    const m = new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(ci);
    assert.ok(m, `ci.yml has a job ${id}`);
    return m[1];
}

test('the job table of ci-report.mjs, the groups of verify.mjs and ci.yml agree', () => {
    assert.deepEqual(Object.keys(JOBS).sort(), [...GROUPS].sort());
    for (const [id, meta] of Object.entries(JOBS)) {
        assert.ok(job(id).includes(`    name: ${meta.name}\n`), `job ${id} is named "${meta.name}"`);
        assert.ok(job(id).includes(`node scripts/verify.mjs --only ${id}`), `job ${id} runs its verify group`);
        assert.ok(job(id).includes(`node scripts/verify.mjs --budget ${id}`), `job ${id} reports its time budget`);
    }
    assert.ok(job('ci-summary').includes(`    name: ${SUMMARY_JOB}\n`));
});

test('every job has a timeout; node 10, dotnet 15, browser 10', () => {
    for (const id of [...Object.keys(JOBS), 'ci-summary']) assert.match(job(id), /^    timeout-minutes: \d+$/m, `${id} has timeout-minutes`);
    assert.match(job('node'), /timeout-minutes: 10\n/);
    assert.match(job('dotnet'), /timeout-minutes: 15\n/);
    assert.match(job('browser'), /timeout-minutes: 10\n/);
});

test('required check names in REPO-SETTINGS.md are the job names', () => {
    const settings = read('.github/REPO-SETTINGS.md');
    for (const meta of Object.values(JOBS).filter(j => j.required)) {
        assert.ok(settings.includes(`{ "context": "${meta.name}" }`), `${meta.name} is required in the protection command`);
        assert.ok(ci.includes(`name: ${meta.name}\n`), `${meta.name} is a job name`);
    }
    for (const meta of Object.values(JOBS).filter(j => !j.required)) assert.ok(!settings.includes(`"context": "${meta.name}"`), `${meta.name} is not required yet`);
});

test('concurrency cancels superseded runs; permissions are minimal and only the summary job writes', () => {
    assert.match(ci, /^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m);
    assert.match(ci, /^permissions:\n  contents: read\n/m);
    assert.equal((ci.match(/pull-requests: write/g) || []).length, 1, 'exactly one job writes to pull requests');
    assert.ok(job('ci-summary').includes('pull-requests: write'));
    assert.match(job('ci-summary'), /if: always\(\) && github\.event_name == 'pull_request'/);
    assert.match(job('ci-summary'), /needs: \[lint, node, dotnet, browser, pack\]/);
    assert.ok(job('ci-summary').includes('actions/github-script@v7'));
});

test('only first-party actions are used (actions/*)', () => {
    const uses = [...ci.matchAll(/uses: ([^\s]+)/g)].map(m => m[1]);
    assert.ok(uses.length > 0);
    for (const u of uses) assert.match(u, /^actions\/[a-z-]+@v\d+$/, u);
});

test('the jobs that need generated files bootstrap through verify, the path gate comes before the work', () => {
    for (const id of ['node', 'dotnet', 'browser', 'pack']) {
        const j = job(id);
        assert.ok(j.includes(`node scripts/ci-changes.mjs ${id}`), `${id} gates itself`);
        assert.ok(j.indexOf('ci-changes.mjs') < j.indexOf('scripts/verify.mjs --only'), `${id}: gate first`);
        assert.ok(j.includes('steps.gate.outputs.run'), `${id}: steps wait for the gate`);
        assert.ok(j.includes('fetch-depth: 2'), `${id}: the gate needs the merge commit's parent`);
    }
    assert.ok(!/^  changes:/m.test(ci), 'no first job that everything waits for');
});

test('the dotnet job caches NuGet on the props and project files; the pack job does not (nothing is restored there)', () => {
    assert.match(job('dotnet'), /cache: true\n\s+cache-dependency-path: \|\n\s+Directory\.Packages\.props\n\s+\*\*\/\*\.csproj/);
    // PlainKit.Blazor has no package references, so ~/.nuget/packages never exists in the pack job and setup-dotnet's cache post-step fails on it.
    assert.doesNotMatch(job('pack'), /cache: true/);
});

test('the browser job reruns once, reports flaky, keeps the report and is not required', () => {
    const b = job('browser');
    assert.ok(b.includes('id: first') && b.includes('id: second') && b.includes('flaky=true'));
    assert.ok(b.includes('continue-on-error: true'));
    assert.ok(b.includes('actions/upload-artifact@v4') && b.includes('core/tests/browser/report.json'));
    assert.ok(b.includes('PK_CHROME: /usr/bin/google-chrome'));
    assert.equal(JOBS.browser.required, false);
});

test('the lint job keeps the no-changelog label switch and full history', () => {
    const l = job('lint');
    assert.ok(l.includes("contains(github.event.pull_request.labels.*.name, 'no-changelog')"));
    assert.ok(l.includes('fetch-depth: 0'));
});

test('the pull request template and CONTRIBUTING.md point at verify.mjs', () => {
    assert.ok(read('.github/pull_request_template.md').includes('node scripts/verify.mjs'));
    assert.ok(read('CONTRIBUTING.md').includes('node scripts/verify.mjs'));
    assert.ok(read('AGENTS.md').includes('gh run view <run-id> --log-failed'));
});
