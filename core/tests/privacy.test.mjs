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

// Names from the application these components were extracted from. Element metadata, the Blazor mappings and the docs must use the toolkit's own
// names (Pk prefix, the element's prop values); a type that only ever existed in that application must not come back (issue #9).
const OLD_APP_NAMES = /\b(DataGrid\w*|ModalTheme|InfoTip[A-Z]\w*|NoticeKind|StatCardVariant|PageActions)\b/g;

test('no type names from the old application in core, the Blazor package sources, mappings, tests or docs', () => {
    const blazorFiles = walk(path.join(repo, 'blazor')).filter(f => TEXT.test(f) && !f.split(path.sep).includes('wwwroot'));
    const hits = [];
    for (const f of [...files, ...blazorFiles]) {
        const rel = path.relative(repo, f).split(path.sep).join('/');
        if (rel === 'CHANGELOG.md' || rel === 'core/site/files/snapshot.json') continue; // the snapshot is a copy of the sources this test already reads
        fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { for (const m of l.matchAll(OLD_APP_NAMES)) hits.push(`${rel}:${i + 1}: ${m[0]}`); });
    }
    assert.deepEqual(hits, []);
});

// Token and selector names from the old application (issue #78). They were renamed to the toolkit's own (--shadow-pop, --color-critical,
// --color-positive, --color-warning) and must not come back. Only the API baseline (the previous release's surface, refreshed by the release
// pull request) and the changelog may still name them; there are no deprecated aliases.
const OLD_APP_TOKENS = /--infotip-panel-shadow|--stat-card-(?:critical|positive|warning)-fg|\.infotip__icon/g;

test('no token or selector names from the old application in core, the Blazor package sources, mappings, tests or docs', () => {
    const blazorFiles = walk(path.join(repo, 'blazor')).filter(f => TEXT.test(f));
    const hits = [];
    for (const f of [...files, ...blazorFiles]) {
        const rel = path.relative(repo, f).split(path.sep).join('/');
        if (rel === 'CHANGELOG.md' || rel === 'core/site/files/snapshot.json' || rel === 'core/site/scorecard/api.baseline.json') continue; // the snapshot is a copy of the sources (this test and the changelog fragment included)
        fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { for (const m of l.matchAll(OLD_APP_TOKENS)) hits.push(`${rel}:${i + 1}: ${m[0]}`); });
    }
    assert.deepEqual(hits, []);
});

test('the renamed tokens exist in both themes', () => {
    const css = fs.readFileSync(path.join(core, 'tokens/tokens.css'), 'utf8');
    for (const theme of ['dark', 'light']) {
        const block = css.split('\n').find(l => l.startsWith(`[data-theme="${theme}"] { color-scheme`)) ?? '';
        for (const t of ['--color-critical', '--color-warning', '--color-positive']) assert.match(block, new RegExp(`${t}: #[0-9a-f]{6}`), `${t} in ${theme}`);
    }
    assert.match(css, /--shadow-pop: 0 4px 16px/);
});
