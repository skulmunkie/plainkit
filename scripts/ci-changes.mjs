// Should this CI job do its work, given what the pull request changed? Node only, no dependencies (runs before setup-node, on the runner's own Node).
//
//   node scripts/ci-changes.mjs <node|dotnet|browser|pack>     writes `run=true|false` (and `reason=`) to $GITHUB_OUTPUT, prints the reason
//
// Why in every job and not in a first job: a job that always starts and finishes green reports its required check by itself, whatever it decided
// (a job skipped by `needs` after a failed first job would also count as passed for a required check), and no job waits for a runner to decide.
// The cost of a "skip" is one checkout and this script (about 5 s). Pull requests only: a push or a manual run always does everything
// (except the browser suite, which is for pull requests that touch what it tests).
//
// The changed files are `git diff --name-only HEAD^1 HEAD`: on a pull request the checkout is the merge commit, whose first parent is the base branch
// (needs `fetch-depth: 2`). If that does not work the answer is "run", never "skip".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AREAS = ['node', 'dotnet', 'browser', 'pack'];

// Root markdown files that a generator or a test reads: not "just docs".
const ROOT_DOCS_THAT_ARE_INPUTS = new Set(['AGENTS.md', 'README.md', 'PUBLISHING.md', 'CHANGELOG.md']);
// Workflow and settings files that scripts/tests/ci-*.test.mjs read.
const TESTED_GITHUB_FILES = new Set(['.github/workflows/ci.yml', '.github/REPO-SETTINGS.md', '.github/pull_request_template.md']);

/** Changelog fragments, .github files, the license and root markdown that nothing reads (for the node tests: minus what ci-*.test.mjs read). */
export const isDocsOnly = (file, { forNode = false } = {}) => {
    if (file.startsWith('changelog/')) return true;
    if (file.startsWith('.github/')) return !(forNode && TESTED_GITHUB_FILES.has(file));
    if (file === 'LICENSE') return true;
    if (!file.includes('/') && file.endsWith('.md')) return !ROOT_DOCS_THAT_ARE_INPUTS.has(file);
    return false;
};

const BROWSER_PATHS = [/^core\/elements\//, /^core\/modules\//, /^core\/js\//, /^core\/tests\/browser\//, /^scripts\/attest-browser\.mjs$/, /^core\/tools\/serve\.mjs$/];
const PACK_PATHS = [/^blazor\/src\/PlainKit\.Blazor\//, /^blazor\/mappings\//, /^Directory\.(Build|Packages)\.props$/, /^global\.json$/, /^core\/VERSION$/,
    /^scripts\/(publish-dist|generate-blazor|check-package|verify)\.mjs$/, /^core\/(elements|js|modules|base|tokens)\//];
// Tests that only node runs.
const NODE_ONLY_TESTS = [/^core\/tests\//, /^scripts\/tests\//];

/** { run, reason } for one area. `event` is GITHUB_EVENT_NAME; `files` the changed paths (null: unknown). */
export function decide(area, { event, files }) {
    if (!AREAS.includes(area)) throw new Error(`unknown area ${area} (${AREAS.join(', ')})`);
    if (event === 'workflow_dispatch') return { run: true, reason: 'manual run' };
    if (event !== 'pull_request') return area === 'browser' ? { run: false, reason: 'the browser suite runs on pull requests' } : { run: true, reason: `${event || 'local'} run` };
    if (!files) return { run: true, reason: 'could not list the changed files, running to be safe' };
    if (files.length === 0) return { run: true, reason: 'no changed files found, running to be safe' };
    const any = pred => files.some(pred);
    if (area === 'node') return files.every(f => isDocsOnly(f, { forNode: true })) ? { run: false, reason: 'only docs, changelog or workflow files changed' } : { run: true, reason: 'code or tested files changed' };
    if (area === 'dotnet') {
        return files.every(f => isDocsOnly(f) || NODE_ONLY_TESTS.some(re => re.test(f))) ? { run: false, reason: 'only docs, workflow files or node-only tests changed' } : { run: true, reason: 'code changed' };
    }
    if (area === 'browser') return any(f => BROWSER_PATHS.some(re => re.test(f))) ? { run: true, reason: 'element or module sources, browser cases or the runner changed' } : { run: false, reason: 'no element or module sources, browser cases or runner changed' };
    return any(f => PACK_PATHS.some(re => re.test(f))) ? { run: true, reason: 'packaging inputs changed' } : { run: false, reason: 'no packaging inputs changed' };
}

export function changedFiles(cwd) {
    const r = spawnSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { cwd, encoding: 'utf8' });
    if (r.status !== 0) return null;
    return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const area = process.argv[2];
    if (!AREAS.includes(area)) { console.error(`usage: node scripts/ci-changes.mjs <${AREAS.join('|')}>`); process.exit(2); }
    const event = process.env.GITHUB_EVENT_NAME;
    const files = event === 'pull_request' ? changedFiles(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) : null;
    const d = decide(area, { event, files });
    console.log(`${area}: ${d.run ? 'running' : 'skipped'} (${d.reason})${files ? `; ${files.length} changed file(s)` : ''}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\nreason=${d.reason}\n`);
    if (!d.run && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Skipped: ${d.reason}.\n`);
}
