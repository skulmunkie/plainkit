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
    // 'browser' is a verify.mjs group with no ci.yml job: a manual-only local check (issue #451), not gated or reported by CI.
    assert.deepEqual(Object.keys(JOBS).sort(), [...GROUPS].filter(g => g !== 'browser').sort());
    for (const [id, meta] of Object.entries(JOBS)) {
        assert.ok(job(id).includes(`    name: ${meta.name}\n`), `job ${id} is named "${meta.name}"`);
        assert.ok(job(id).includes(`node scripts/verify.mjs --only ${id}`), `job ${id} runs its verify group`);
        assert.ok(job(id).includes(`node scripts/verify.mjs --budget ${id}`), `job ${id} reports its time budget`);
    }
    assert.ok(job('ci-summary').includes(`    name: ${SUMMARY_JOB}\n`));
});

test('every job has a timeout; node 10, dotnet 15', () => {
    for (const id of [...Object.keys(JOBS), 'ci-summary']) assert.match(job(id), /^    timeout-minutes: \d+$/m, `${id} has timeout-minutes`);
    assert.match(job('node'), /timeout-minutes: 10\n/);
    assert.match(job('dotnet'), /timeout-minutes: 15\n/);
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
    assert.match(ci, /^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
    assert.match(ci, /^permissions:\n  contents: read\n/m);
    assert.equal((ci.match(/pull-requests: write/g) || []).length, 1, 'exactly one job writes to pull requests');
    assert.ok(job('ci-summary').includes('pull-requests: write'));
    assert.match(job('ci-summary'), /if: always\(\) && github\.event_name == 'pull_request'/);
    assert.match(job('ci-summary'), /needs: \[lint, node, dotnet, pack, scorecard\]/);
    assert.match(job('ci-summary'), /actions\/github-script@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
});

test('only first-party actions are used (actions/*), pinned to a commit SHA', () => {
    const uses = [...ci.matchAll(/uses: ([^\s]+)/g)].map(m => m[1]);
    assert.ok(uses.length > 0);
    for (const u of uses) assert.match(u, /^actions\/[a-z-]+@[0-9a-f]{40}$/, u);
});

test('the jobs that need generated files bootstrap through verify, the path gate comes before the work', () => {
    for (const id of ['node', 'dotnet', 'pack']) {
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

test('there is no browser CI job any more (issue #451)', () => {
    assert.ok(!/^  browser:\n/m.test(ci));
    assert.ok(!JOBS.browser);
});

test('the scorecard job gates on the same paths as the browser suite, uses Chrome, is not required', () => {
    const s = job('scorecard');
    assert.ok(s.includes('node scripts/ci-changes.mjs browser'), 'gates on the browser area (same paths it measures)');
    assert.ok(s.indexOf('ci-changes.mjs') < s.indexOf('scripts/verify.mjs --only scorecard'), 'gate first');
    assert.ok(s.includes('steps.gate.outputs.run'));
    assert.ok(s.includes('fetch-depth: 2'));
    assert.ok(s.includes('PK_CHROME: /usr/bin/google-chrome'));
    assert.equal(JOBS.scorecard.required, false);
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

test('the UI review jobs restore a content-addressed render cache and pass --cache (#749)', () => {
    const sweep = read('.github/workflows/ui-review-sweep.yml');
    for (const [name, text] of [['ci.yml', job('ui-review')], ['ui-review-sweep.yml', sweep]]) {
        assert.match(text, /uses: actions\/cache@[0-9a-f]{40} # v\d/, `${name} pins actions/cache by SHA`);
        assert.match(text, /path: review-cache\n/, `${name} caches review-cache`);
        assert.match(text, /restore-keys:/, `${name} has restore keys`);
        assert.match(text, /node scripts\/ui-review\.mjs --cache /, `${name} runs ui-review with --cache`);
    }
});


// ---- tiered CI for a repository whose work lands on main through pull requests (no integration branch) ----

const wf = f => read(`.github/workflows/${f}`);
const jobOf = (text, id) => {
    const m = new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(text);
    assert.ok(m, `a job ${id}`);
    return m[1];
};

test('every workflow pins every action to a commit SHA with a version comment (no unpinned actions)', () => {
    for (const f of fs.readdirSync(path.join(root, '.github/workflows')).filter(n => n.endsWith('.yml'))) {
        const lines = wf(f).split('\n').filter(l => /^\s*(- )?uses: /.test(l));
        for (const l of lines) assert.match(l, /uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v?\d+(\.\d+)*\s*$/, `${f}: ${l.trim()}`);
    }
});

test('PR concurrency cancels superseded pull request runs only; the tag, nightly and release runs are never cancelled by a newer one', () => {
    assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    assert.doesNotMatch(wf('release.yml'), /cancel-in-progress: true/);
    assert.doesNotMatch(wf('release.yml'), /^concurrency:/m);
    assert.match(wf('nightly-full.yml'), /^concurrency:\n  group: nightly-full\n  cancel-in-progress: false$/m);
    assert.match(wf('browser-nightly.yml') + wf('nightly-full.yml'), /schedule:/);
});

test('ordinary pull requests run the targeted plan; full only for push, the label full-ci or a release pull request', () => {
    for (const id of ['node', 'dotnet']) {
        const j = job(id);
        assert.ok(j.includes(`node scripts/verify.mjs --only ${id}`), `${id}: the full command stays`);
        assert.ok(j.includes(`node scripts/verify.mjs --changed --only ${id} --base`), `${id}: the targeted command`);
        assert.match(j, /PK_FULL: \$\{\{ github\.event_name != 'pull_request' \|\| startsWith\(github\.head_ref, 'release\/'\) \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'full-ci'\) \}\}/, `${id}: full conditions`);
        assert.ok(j.includes('git fetch --no-tags --depth=1 origin'), `${id}: fetches the base for --changed`);
    }
});

test('the heavy jobs are gated by changed files (or the full-ci label) and still exist in every run, so required checks never hang', () => {
    for (const id of ['node', 'dotnet', 'pack', 'scorecard']) {
        const j = job(id);
        assert.match(j, /ci-changes\.mjs (node|dotnet|pack|browser)/, `${id}: gate step`);
        assert.ok(j.includes('CI_FULL:') && j.includes("'full-ci'"), `${id}: the gate sees the full-ci label`);
        assert.ok(!/^    if: .*(paths|changed)/m.test(j), `${id}: no job-level skip that would leave a required check pending`);
    }
    assert.ok(job('ui-review').includes('ci-changes.mjs ui-review'));
    assert.ok(job('ui-review').includes("'full-ci'"), 'the label full-ci also means the full UI review');
    assert.match(job('browser-release'), /if: github\.event_name == 'pull_request' && startsWith\(github\.head_ref, 'release\/'\)/);
    assert.ok(!/paths:/.test(ci), 'no workflow-level paths filter (a required check would stay pending)');
});

test('the nightly workflows exist: full verify, browser suite, UI review sweep; each files or updates a tracking issue or fails red', () => {
    const full = wf('nightly-full.yml');
    assert.match(full, /cron: '/);
    assert.ok(full.includes('node scripts/verify.mjs --pack --scorecard'));
    assert.ok(full.includes('Full verify failing on main') && full.includes('issues: write'));
    assert.ok(full.includes("github.ref == 'refs/heads/main'"));
    assert.ok(full.includes('Fail the run when the full verify failed'));
    assert.ok(wf('browser-nightly.yml').includes('In-browser suite') || wf('browser-nightly.yml').includes('reportToIssue'));
    assert.match(wf('ui-review-sweep.yml'), /schedule:[\s\S]*--all/);
});

test('the UI review sweep files or updates one tracking issue (#781), with issues: write only on that job, on main, never on a pull request', () => {
    const sweep = wf('ui-review-sweep.yml');
    assert.ok(sweep.includes('UI review sweep failing on main'));
    assert.ok(sweep.includes('github.rest.issues.create') && sweep.includes('createComment'), 'creates the issue and comments on it');
    assert.ok(!sweep.includes('state: \'closed\'') && !/issues\.update/.test(sweep), 'never closes the issue');
    assert.equal((sweep.match(/^\s+issues: write$/gm) ?? []).length, 1, 'issues: write appears once');
    assert.match(sweep, /^permissions:\n  contents: read\n/m, 'the workflow default stays read-only');
    const report = jobOf(sweep, 'report');
    assert.ok(report.includes('issues: write'), 'only the report job holds issues: write');
    assert.ok(!jobOf(sweep, 'sweep').includes('issues:'), 'the shards do not');
    assert.match(report, /^    needs: sweep$/m);
    assert.match(report, /if: always\(\) && github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(sweep, /^\s*pull_request/m, 'the sweep never triggers on a pull request');
    assert.match(report, /uses: actions\/github-script@[0-9a-f]{40} # v\d/);
});

test('release.yml runs the full verify first; build and publish both need it, so nothing is published when it fails', () => {
    const rel = wf('release.yml');
    const v = jobOf(rel, 'verify');
    assert.ok(v.includes('node scripts/verify.mjs --pack --browser'));
    assert.ok(!/continue-on-error/.test(v), 'a verify failure must fail the run');
    assert.match(jobOf(rel, 'build'), /^    needs: verify$/m);
    assert.match(jobOf(rel, 'publish'), /^    needs: \[verify, build\]$/m);
    assert.ok(rel.indexOf('  verify:\n') < rel.indexOf('  build:\n'), 'verify is the first job');
    assert.doesNotMatch(v, /secrets\.|id-token|contents: write/, 'the verify job holds no publishing rights');
});

test('the docs describe the main-based flow: verify --changed compares with origin/main, no integration batch', () => {
    for (const f of ['AGENTS.md', 'CONTRIBUTING.md']) {
        const t = read(f);
        assert.ok(!t.includes('origin/next-0.13'), `${f}: no integration branch`);
        assert.ok(!t.includes('integration batch'), `${f}: no integration batch`);
        assert.ok(t.includes('full-ci'), `${f}: names the label full-ci`);
    }
});
