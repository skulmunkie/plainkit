// Carve-out test: the SDK must work when this folder is copied anywhere. It copies the whole sdk/ folder to a temp directory OUTSIDE the
// repository, then in the copy: rebuilds dist/ byte-for-byte, runs the tests, the security scanner and the static audit, and serves the
// site (plain, with --csp, and under a /sdk/1.0.0/ prefix) fetching every page, template and component fragment plus their local
// sub-resources. It also checks nothing references the repository layout. Run: node --test "tests/carveout*.test.mjs"
// Split for parallelism (issue #1107), each file with its own copy and cleanup: this file (the layout check), carveout-build,
// carveout-suite and carveout-serve; the shared code is carveout-helpers.mjs.
// (The copy runs the other tests with CARVEOUT_CHILD=1 so these files do not recurse.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skip, walk, rel, makeCopy, removeCopy } from './carveout-helpers.mjs';

let copy;
test('copy the Plainkit folder outside the repository', { skip }, () => { copy = makeCopy(); });

test('nothing in the copy depends on the repository layout, the host app or an absolute path', { skip }, () => {
    const banned = [/wwwroot/, /_content\//, /Backend\.(UI|Web|Core|Data)\b/, /dotnet[\\/]src/, /[A-Za-z]:[\\/]Users[\\/]/, /\/Users\/[a-z]+\//, /(href|src)=["']\/(?!\/)/];
    const ignore = new Set(['site/files/snapshot.json', 'site/files/index.json', 'tests/carveout.test.mjs', 'site/scorecard/sweep-report.json', 'site/scorecard/report.json', 'site/scorecard/security-report.json']);
    const hits = [];
    for (const f of walk(copy)) {
        const r = rel(copy, f);
        if (ignore.has(r) || r.startsWith('dist/') || !/\.(html|css|js|mjs|json|md|svg)$/.test(r)) continue;
        const text = fs.readFileSync(f, 'utf8');
        for (const rx of banned) if (rx.test(text.split('\n').filter(l => !/Blazor|blazor|Razor/.test(l)).join('\n'))) hits.push(`${r}: ${rx}`);
    }
    assert.deepEqual(hits, [], 'files that know about the repository or an absolute path');
});

test('clean up the copy', { skip }, () => removeCopy(copy));
