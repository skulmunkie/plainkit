// What is generated in this repository, in one place: not tracked by git, produced by `node scripts/bootstrap.mjs`. Node only, no dependencies.
//
// Used by scripts/bootstrap.mjs (--if-missing), by core/tools/serve.mjs and the other entry points (they bootstrap when a file is missing), by the
// tests (a missing file says "run node scripts/bootstrap.mjs") and by CI:
//
//   node scripts/generated.mjs check     exit 1 unless every generated path is untracked and no tracked file differs from HEAD (CI: "Bootstrap leaves the tree clean")
//   node scripts/generated.mjs list      print the generated globs
//
// Keep GENERATED_PATTERNS in step with .gitignore (scripts/tests/generated-paths.test.mjs checks both directions).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BOOTSTRAP_MESSAGE = 'Generated files are missing: run node scripts/bootstrap.mjs from the repository root';

// [glob as written in .gitignore, regex over repository-relative paths with forward slashes, the script that writes it]
export const GENERATED_PATTERNS = [
    ['/core/dist/', /^core\/dist\//, 'core/tools/build.mjs (dist/skills/ by scripts/build-skills.mjs; dist/AGENTS.md, dist/llms.txt, dist/llms-full.txt by scripts/build-agent-refs.mjs)'],
    ['/core/plainkit.css', /^core\/plainkit\.css$/, 'core/tools/build.mjs'],
    ['/core/elements/elements.css', /^core\/elements\/elements\.css$/, 'core/tools/build.mjs'],
    ['/core/elements/registry.js', /^core\/elements\/registry\.js$/, 'core/tools/build.mjs'],
    ['/core/elements/*/*.element.js', /^core\/elements\/[^/]+\/[^/]+\.element\.js$/, 'core/tools/build.mjs'],
    ['/core/js/version.js', /^core\/js\/version\.js$/, 'core/tools/build.mjs (from core/VERSION)'],
    ['/core/site/gallery/gallery.data.js', /^core\/site\/gallery\/gallery\.data\.js$/, 'core/tools/build.mjs'],
    ['/core/site/gallery/elements/*.data.js', /^core\/site\/gallery\/elements\/[^/]+\.data\.js$/, 'core/tools/build.mjs'],
    ['/core/site/guides/guides.data.js', /^core\/site\/guides\/guides\.data\.js$/, 'core/tools/build.mjs (from core/site/guides/content/*.md)'],
    ['/core/site/files/snapshot.json', /^core\/site\/files\/snapshot\.json$/, 'core/tools/build.mjs'],
    ['/core/site/files/index.json', /^core\/site\/files\/index\.json$/, 'core/tools/build.mjs'],
    ['/core/site/scorecard/api.current.json', /^core\/site\/scorecard\/api\.current\.json$/, 'core/tools/build.mjs'],
    ['/core/icons.svg', /^core\/icons\.svg$/, 'core/icons/build.mjs (from core/icons/src/*.svg)'],
    ['/core/icons/icons.json', /^core\/icons\/icons\.json$/, 'core/icons/build.mjs (from core/icons/src/*.svg)'],
    ['/core/icons/icons.d.ts', /^core\/icons\/icons\.d\.ts$/, 'core/icons/build.mjs (from core/icons/src/*.svg)'],
    ['/blazor/src/PlainKit.Blazor/Generated/', /^blazor\/src\/PlainKit\.Blazor\/Generated\//, 'scripts/generate-blazor.mjs'],
    ['/blazor/src/PlainKit.Blazor/wwwroot/PlainKit.Blazor.lib.module.js', /^blazor\/src\/PlainKit\.Blazor\/wwwroot\/PlainKit\.Blazor\.lib\.module\.js$/, 'scripts/generate-blazor.mjs'],
    ['/blazor/src/PlainKit.Blazor/wwwroot/plainkit/', /^blazor\/src\/PlainKit\.Blazor\/wwwroot\/plainkit\//, 'scripts/publish-dist.mjs (a copy of core/dist)'],
];

export const isGenerated = rel => GENERATED_PATTERNS.some(([, re]) => re.test(rel.replaceAll('\\', '/')));

// One file from each step: when they all exist the bootstrap has run to the end. (publish-dist writes its manifest last.)
export const SENTINELS = [
    'core/icons.svg',
    'core/plainkit.css',
    'core/dist/manifest.json',
    'core/dist/skills/plainkit-sdk/SKILL.md',
    'core/dist/AGENTS.md',
    'core/dist/llms.txt',
    'core/dist/llms-full.txt',
    'blazor/src/PlainKit.Blazor/Generated/generated.manifest.json',
    'blazor/src/PlainKit.Blazor/wwwroot/PlainKit.Blazor.lib.module.js',
    'blazor/src/PlainKit.Blazor/wwwroot/plainkit/manifest.json',
];

export const missingGenerated = (rootDir = root) => SENTINELS.filter(f => !fs.existsSync(path.join(rootDir, f)));

/** Throws with the one-line instruction when a generated file is missing. */
export function requireGenerated(rootDir = root) {
    const missing = missingGenerated(rootDir);
    if (missing.length) throw new Error(`${BOOTSTRAP_MESSAGE} (missing ${missing[0]}${missing.length > 1 ? ` and ${missing.length - 1} more` : ''})`);
}

// Source folders and files the generators read. A generated file older than the newest of these is stale (used by bootstrap --if-missing).
const SOURCE_DIRS = ['core/elements', 'core/js', 'core/base', 'core/tokens', 'core/modules', 'core/samples', 'core/layouts', 'core/tools', 'core/site/gallery', 'core/site/guides', 'core/icons/src',
    'blazor/mappings', 'blazor/src/PlainKit.Blazor/Components', 'scripts/skills'];
const SOURCE_FILES = ['core/VERSION', 'core/STANDARDS.md', 'core/README.md', 'PUBLISHING.md', 'CHANGELOG.md'];
const SOURCE_SCRIPTS = ['scripts/generate-blazor.mjs', 'scripts/build-skills.mjs', 'scripts/build-agent-refs.mjs', 'scripts/publish-dist.mjs', 'scripts/bootstrap.mjs', 'scripts/generated.mjs', 'core/icons/build.mjs'];

function newestMtime(rootDir) {
    let newest = 0;
    const consider = f => { try { const m = fs.statSync(f).mtimeMs; if (m > newest) newest = m; } catch { /* a listed source that does not exist (yet) cannot be newer */ } };
    const walk = dir => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
            if (/\.test\.mjs$/.test(e.name) || isGenerated(path.relative(rootDir, p))) continue;
            consider(p);
        }
    };
    for (const d of SOURCE_DIRS) walk(path.join(rootDir, d));
    for (const f of [...SOURCE_FILES, ...SOURCE_SCRIPTS]) consider(path.join(rootDir, f));
    return newest;
}

/** True when every sentinel exists and none is older than the newest source. */
export function generatedCurrent(rootDir = root) {
    if (missingGenerated(rootDir).length) return false;
    const oldest = Math.min(...SENTINELS.map(f => fs.statSync(path.join(rootDir, f)).mtimeMs));
    return oldest >= newestMtime(rootDir);
}

/** Runs the bootstrap when a generated file is missing (dev entry points call this so a fresh clone just works). */
export function ensureGenerated(rootDir = root) {
    if (missingGenerated(rootDir).length === 0) return;
    console.log(`${BOOTSTRAP_MESSAGE}\nrunning it now ...`);
    const r = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'bootstrap.mjs'), '--quiet'], { cwd: rootDir, stdio: 'inherit' });
    if (r.status !== 0) { console.error('bootstrap failed'); process.exit(r.status ?? 1); }
}

const git = (args, rootDir = root) => { const r = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.error}`); return r.stdout; };

/** Problems with the working tree after a bootstrap: generated paths that are tracked, tracked files that changed. */
export function treeProblems(rootDir = root) {
    const problems = [];
    const tracked = git(['ls-files'], rootDir).split('\n').filter(Boolean).filter(isGenerated);
    if (tracked.length) problems.push(`${tracked.length} generated file(s) are tracked by git (first: ${tracked[0]})`);
    const changed = git(['status', '--porcelain', '--untracked-files=no'], rootDir).split('\n').filter(Boolean);
    if (changed.length) problems.push(`the bootstrap changed ${changed.length} tracked file(s) (first: ${changed[0].trim()})`);
    return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const cmd = process.argv[2];
    if (cmd === 'list') { for (const [glob, , writer] of GENERATED_PATTERNS) console.log(`${glob.padEnd(78)} ${writer}`); }
    else if (cmd === 'check') {
        const problems = treeProblems();
        if (problems.length) {
            console.error(`Bootstrap does not leave the tree clean:\n- ${problems.join('\n- ')}\nFIX: never commit generated files (git rm -r --cached the generated paths; they are listed by node scripts/generated.mjs list and gitignored), and do not change tracked files by hand-editing what the build writes.`);
            process.exit(1);
        }
        console.log('the tree is clean after the bootstrap and no generated path is tracked');
    } else { console.error('usage: node scripts/generated.mjs check | list'); process.exit(2); }
}
