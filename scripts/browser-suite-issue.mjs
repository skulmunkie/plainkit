// The nightly in-browser suite workflow (.github/workflows/browser-nightly.yml) reports through this module: one tracking issue, found by its exact
// title, gets a comment per failing run (run URL, failing case names) and one "green again" comment after a recovery. It never closes the issue:
// the owner does. The pure pieces (case names, comment text) are tested in scripts/tests/browser-suite-issue.test.mjs.
//
// Used from actions/github-script: const m = await import(`${process.env.GITHUB_WORKSPACE}/scripts/browser-suite-issue.mjs`); await m.reportToIssue({ github, context, core, ... })
import fs from 'node:fs';

export const TITLE = 'In-browser suite failing on main';
export const GREEN_MARKER = '<!-- browser-suite: green -->';
export const FAIL_MARKER = '<!-- browser-suite: failing -->';

/** Names of the failed cases in a parsed core/tests/browser/report.json (null when it is not a report). */
export function failedCases(report) {
    if (!report || !Array.isArray(report.results)) return null;
    return report.results.filter(r => r && !r.ok).map(r => ({ name: String(r.name ?? '(unnamed case)'), error: r.error ? String(r.error) : '' }));
}

/** The comment for a failing run. `failed` is failedCases() output, or null when the suite could not run (exit code 2, no report). */
export function failureComment({ runUrl, sha, failed, passed = null, total = null }) {
    const lines = [FAIL_MARKER, `The in-browser element suite failed on \`main\` (${sha ? sha.slice(0, 8) : 'unknown commit'}). Run: ${runUrl}`, ''];
    if (failed === null) lines.push('The suite could not finish (no report: no browser, port in use or timeout). See the run log.');
    else {
        if (passed !== null && total !== null) lines.push(`${passed} of ${total} cases passed; ${failed.length} failed:`, '');
        for (const f of failed) lines.push(`- ${f.name}${f.error ? `: ${f.error.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
    }
    lines.push('', 'Reproduce: `node scripts/verify.mjs --browser` (Chrome or Edge installed). This issue is closed by the owner, not automatically.');
    return lines.join('\n');
}

/** The comment for the first green run after a failure. */
export const greenComment = ({ runUrl, sha }) => [GREEN_MARKER, `The in-browser element suite is green again on \`main\` (${sha ? sha.slice(0, 8) : 'unknown commit'}). Run: ${runUrl}`, '', 'Close this issue when you are satisfied it stays green.'].join('\n');

/** Does the issue's latest comment (the list is oldest first) already say "green"? Then a green night adds nothing. */
export const alreadyGreen = comments => comments.length > 0 && String(comments[comments.length - 1].body ?? '').includes(GREEN_MARKER);

/** Read core/tests/browser/report.json; null (with a warning) when it is missing or half-written. */
export function readReport(file, core) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { core.warning(`no readable report at ${file}: ${e.message}`); return null; }
}

/** `failed`: the suite step did not succeed. Finds the open tracking issue by title; files it on the first failure. */
export async function reportToIssue({ github, context, core, failed, report, sha, runUrl }) {
    const { owner, repo } = context.repo;
    const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', per_page: 100 });
    const existing = issues.find(i => !i.pull_request && i.title === TITLE);
    if (failed) {
        const cases = failedCases(report);
        const body = failureComment({ runUrl, sha, failed: cases, passed: report?.passed ?? null, total: Array.isArray(report?.results) ? report.results.length : null });
        if (existing) { await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body }); core.info(`commented on #${existing.number}`); }
        else { const made = await github.rest.issues.create({ owner, repo, title: TITLE, body }); core.info(`opened #${made.data.number}`); }
        return;
    }
    if (!existing) { core.info('green, and no open tracking issue'); return; }
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: existing.number, per_page: 100 });
    if (alreadyGreen(comments)) { core.info(`green, #${existing.number} already says so`); return; }
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body: greenComment({ runUrl, sha }) });
    core.info(`commented green on #${existing.number}`);
}
