// Link check for the pages that became modules of the site app (#355, #346): the owner decided on no redirect stubs, so nothing may still point at a retired address.
// Add a path here when another page of the old site becomes a module; fix the reference, never the list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RETIRED = ['settings/index.html', 'devtools/index.html', 'site/settings/page.js', 'site/devtools/page.js'];
const SKIP = /(^|\/)(index\.json|snapshot\.json|CHANGELOG\.md|changelog\/)|\.test\.mjs$|\.(png|zip|woff2?)$/;

test('no source file refers to a retired site page address', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(f => f && !SKIP.test(f) && fs.existsSync(path.join(repo, f)));
    const hits = [];
    for (const f of files) {
        const text = fs.readFileSync(path.join(repo, f), 'utf8');
        for (const r of RETIRED) if (text.includes(r)) hits.push(`${f}: ${r}`);
    }
    assert.deepEqual(hits, [], 'FIX: point the reference at the app (app.html#/settings, app.html#/devtools); a retired page has no redirect stub.');
});
