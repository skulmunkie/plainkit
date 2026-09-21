// What CI says about itself: the job table (names, required or not, time budgets) and the text of the sticky pull request comment and of the
// time-budget notes. Node only, no dependencies. Pure functions; .github/workflows/ci.yml calls them (the "CI summary" job imports this file from
// actions/github-script) and scripts/tests/ci-report.test.mjs checks them.
//
// The job names are the required check names of branch protection (.github/REPO-SETTINGS.md); scripts/tests/ci-workflow.test.mjs checks that
// ci.yml and REPO-SETTINGS.md say the same.

export const MARKER = '<!-- ci-summary -->';

// id = the job id in ci.yml (and the group of scripts/verify.mjs), name = the job's `name:` (the check name), budget = seconds the job should take.
export const JOBS = {
    lint: { name: 'Changelog (fragments)', required: true, budget: 15 },
    node: { name: 'Toolkit (node)', required: true, budget: 30 },
    dotnet: { name: 'Blazor (dotnet)', required: true, budget: 45 },
    browser: { name: 'Browser (element suite)', required: false, budget: 300 },
    pack: { name: 'Package (contents)', required: false, budget: 45 },
};
export const RUN_BUDGET = 60; // seconds, the whole pull request run (wall time)
export const SUMMARY_JOB = 'CI summary';

const secs = n => `${Math.round(n)} s`;

/** One line for the job summary: seconds against the budget, with a warning line when over. */
export function budgetNote(label, seconds, budget) {
    const line = `${label}: ${secs(seconds)} of a ${budget} s budget`;
    if (seconds <= budget) return `${line}.`;
    return `${line}.\nWARNING: ${label} is ${secs(seconds - budget)} over its time budget. Do not raise the budget: find what got slower (the per-check timings above) and make that faster.`;
}

/** The "failures" job output written by scripts/verify.mjs: [{ id, name, fix, excerpt }]. Never throws. */
export function parseFailures(text) {
    if (!text) return [];
    try {
        const v = JSON.parse(text);
        return Array.isArray(v) ? v.filter(f => f && typeof f === 'object').map(f => ({ id: String(f.id ?? ''), name: String(f.name ?? f.id ?? ''), fix: String(f.fix ?? ''), excerpt: String(f.excerpt ?? '') })) : [];
    } catch { return []; }
}

const fence = text => `\`\`\`\n${String(text).replaceAll('```', "'''").trimEnd()}\n\`\`\``;

/**
 * Builds the comment. `needs` is `toJSON(needs)` of the summary job ({ jobId: { result, outputs } }), `jobs` the run's jobs from the API
 * ([{ name, html_url }]), `runSeconds` the wall time so far (or null).
 * Returns { problems, cancelled, body, summary }: `problems` counts failed jobs and flaky reruns.
 */
export function buildReport({ needs, jobs = [], runSeconds = null, runUrl = '' }) {
    const failed = []; const flaky = [];
    let cancelled = false;
    for (const [id, meta] of Object.entries(JOBS)) {
        const n = needs?.[id];
        if (!n) continue;
        if (n.result === 'cancelled') cancelled = true;
        const job = jobs.find(j => j.name === meta.name);
        if (n.result === 'failure') failed.push({ id, ...meta, url: job?.html_url ?? runUrl, failures: parseFailures(n.outputs?.failures) });
        else if (n.outputs?.flaky === 'true') flaky.push({ id, ...meta, url: job?.html_url ?? runUrl });
    }
    const lines = [];
    const timing = runSeconds == null ? '' : `\n${budgetNote('Whole run so far', runSeconds, RUN_BUDGET)}`;
    if (failed.length === 0 && flaky.length === 0) {
        lines.push(MARKER, '### CI is green', '', `Nothing to fix.${timing}`);
        return { problems: 0, cancelled, body: lines.join('\n'), summary: lines.slice(1).join('\n') };
    }
    lines.push(MARKER);
    lines.push(failed.length ? `### CI failed: ${failed.map(f => f.name).join(', ')}` : '### CI passed, with a flaky check');
    lines.push('', 'Reproduce locally with the same checks: `node scripts/verify.mjs` (one job: `node scripts/verify.mjs --only <lint|node|dotnet|browser|pack>`). '
        + 'The rules for fixing are in AGENTS.md, "When CI fails": fix the root cause, never edit a test or raise a budget to get green, at most three attempts, then stop and report.');
    for (const f of failed) {
        lines.push('', `#### ${f.name}${f.required ? '' : ' (not a required check)'}: [log](${f.url})`);
        if (f.failures.length === 0) {
            lines.push('No check reported a failure, so the job failed outside them (checkout, setup, a runner problem or a timeout). Open the log; if it is an infrastructure error, re-run the failed jobs. '
                + 'From a terminal: `gh run view <run-id> --log-failed`.');
            continue;
        }
        for (const x of f.failures) {
            lines.push(`- **${x.name}**`, `  FIX: ${x.fix}`);
            if (x.excerpt) lines.push('', fence(x.excerpt).split('\n').map(l => `  ${l}`).join('\n'));
        }
    }
    for (const f of flaky) lines.push('', `#### ${f.name}: flaky`, `The first run failed and the rerun passed ([log](${f.url})). Do not ignore it: note it on the issue if it happens again.`);
    if (timing) lines.push(timing.trim());
    let body = lines.join('\n');
    if (body.length > 60000) body = `${body.slice(0, 60000)}\n\n(truncated: see the run log)`;
    return { problems: failed.length + flaky.length, cancelled, body, summary: body.replace(MARKER, '').trim() };
}
