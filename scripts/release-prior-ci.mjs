// Release tag, one run: did the release pull request that produced this commit already pass the FULL CI on exactly this tree? release.yml's verify job skips its
// full verify only when the answer is yes; any doubt (no merged release pull request, another tree, a check missing, failed or skipped, GitHub not answering) runs everything.
//   node scripts/release-prior-ci.mjs <owner/repo> <sha>   ->  prints `skip=true` or `skip=false` (a GITHUB_OUTPUT line); the reason goes to stderr. Needs `gh` with GH_TOKEN.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The ci.yml checks a release pull request (head release/*) runs in full; every one must have passed on the pull request head.
export const REQUIRED = ['Changelog (fragments)', 'Toolkit (node)', 'Blazor (dotnet)', 'Package (contents)', 'Scorecard (quality)', 'Browser suite (release)'];

export const releasePull = pulls => (pulls ?? []).find(p => p?.merged_at && String(p.head?.ref ?? '').startsWith('release/')) ?? null;

// { skip, reason } from what GitHub said: the pull requests of the commit, the two trees and the check runs on the pull request head.
export function decide({ pulls, tagTree, headTree, checkRuns }) {
    const pr = releasePull(pulls);
    if (!pr) return { skip: false, reason: 'no merged release pull request (head release/*) for this commit: running the full verify' };
    if (!tagTree || tagTree !== headTree) return { skip: false, reason: `the tagged tree ${tagTree} is not the tree ${headTree} of #${pr.number}'s head (merged while behind main?): running the full verify` };
    for (const name of REQUIRED) {
        const last = (checkRuns ?? []).filter(c => c.name === name).sort((a, b) => String(a.completed_at ?? '').localeCompare(String(b.completed_at ?? ''))).pop();
        if (last?.conclusion !== 'success') return { skip: false, reason: `"${name}" on #${pr.number}'s head is ${last ? (last.conclusion ?? last.status) : 'missing'}: running the full verify` };
    }
    return { skip: true, reason: `#${pr.number} (${pr.head.ref}) passed the full CI (${REQUIRED.join(', ')}) on the same tree ${tagTree}: the tag does not run it again` };
}

const gh = route => {
    const r = spawnSync('gh', ['api', route], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`gh api ${route}: ${(r.stderr || r.error?.message || `exit ${r.status}`).trim()}`);
    return JSON.parse(r.stdout);
};

export function main([repo, sha] = []) {
    let result;
    try {
        if (!repo || !sha) throw new Error('usage: node scripts/release-prior-ci.mjs <owner/repo> <sha>');
        const pulls = gh(`repos/${repo}/commits/${sha}/pulls`), pr = releasePull(pulls);
        const tree = s => gh(`repos/${repo}/commits/${s}`).commit.tree.sha;
        result = decide({ pulls, tagTree: tree(sha), headTree: pr ? tree(pr.head.sha) : null, checkRuns: pr ? gh(`repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`).check_runs : [] });
    } catch (e) {
        result = { skip: false, reason: `could not ask GitHub (${e.message}): running the full verify` };
    }
    console.error(result.reason);
    console.log(`skip=${result.skip}`);
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
