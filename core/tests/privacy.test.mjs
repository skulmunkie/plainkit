// The repository is public: nothing in it may carry a private tracker reference, a personal absolute path, a real-looking email address or
// stale "proprietary" licence text. This scans every text file under core/ (generated dist and the Files snapshot included, because they
// are published too) and the repository's own docs. Generic patterns only: naming a private project here would leak it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(core, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'bin', 'obj']);
const TEXT = /\.(html|css|js|mjs|json|md|svg|yml|yaml|cs|razor|csproj|props|slnx|txt)$/;
// Files that must name these patterns to police them.
const SELF = new Set(['core/tests/privacy.test.mjs', 'core/tools/security.mjs', 'core/tests/security.test.mjs', 'core/tests/carveout.test.mjs']);

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
}
const files = [...walk(core), ...fs.readdirSync(repo).filter(f => /\.(md|props|slnx)$/.test(f)).map(f => path.join(repo, f))]
    .filter(f => TEXT.test(f) && !SELF.has(path.relative(repo, f).split(path.sep).join('/')));

function scan(pattern, allow = () => false) {
    const hits = [];
    for (const f of files) {
        const lines = fs.readFileSync(f, 'utf8').split('\n');
        lines.forEach((l, i) => { for (const m of l.matchAll(pattern)) if (!allow(m[0], l)) hits.push(`${path.relative(repo, f).split(path.sep).join('/')}:${i + 1}: ${m[0]}`); });
    }
    return hits;
}

test('no internal tracker references (a letter T, a hyphen and a number)', () => {
    assert.deepEqual(scan(/\bT-\d{2,4}\b/g), []);
});

test('no personal absolute paths', () => {
    assert.deepEqual(scan(/[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}[A-Za-z]|\/Users\/[a-z][\w.-]*\/|\/home\/[a-z][\w.-]*\//g), []);
});

test('no real-looking email addresses (example, localhost and noreply placeholders are fine)', () => {
    const ok = m => /@(example\.(com|org|net)|localhost|plainkit\.invalid|w3\.org)$/i.test(m) || /^(name|user|you|me|hello|info|test)@/i.test(m);
    assert.deepEqual(scan(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, ok), []);
});

test('no stale proprietary licence text: the repository is MIT', () => {
    assert.deepEqual(scan(/proprietary, part of the reposito[r]y/gi), []);
});
