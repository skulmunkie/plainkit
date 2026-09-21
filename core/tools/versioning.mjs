// Versioning: one version for the SDK and PlainKit.Blazor, kept in core/VERSION (SemVer). Everything else is stamped from it or checked
// against it. Dependency-free. See CONTRIBUTING.md (release pull request) and issue #23.
//
//   node core/tools/versioning.mjs check                 every place the version appears agrees with core/VERSION
//   node core/tools/versioning.mjs check --release       ...and the API baseline was refreshed for this version (a release PR)
//   node core/tools/versioning.mjs check --tag v0.1.0    ...and the tag names exactly that version (the release workflow)
//   node core/tools/versioning.mjs set 0.2.0             write core/VERSION and core/package.json, then run the build to stamp the rest
//   node core/tools/versioning.mjs bump [--baseline f]   what the API changes since the last release need, and whether core/VERSION covers them
//                                                        (--baseline: the baseline file of the base branch, for a release PR; --require exits 1 when not covered)
//
// Deprecation (meta `deprecated: { since, remove, message }`, see element-api.mjs): an item the last release marked deprecated may leave the API only in
// the release its `remove` names, which is at least one minor version after `since`; `check` fails when it is gone earlier. Removing it is still a breaking
// change for the bump (`bump` labels it as announced).
//
// Rules: a breaking change (anything in the previous release's API baseline that is gone or changed) needs a major bump, or a minor bump
// while the major is 0; a new public item needs at least a minor bump; anything else at least a patch (or a pre-release step).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');

import { SEMVER, parseVersion, isPrerelease, compareVersions, changeLevel } from './semver.mjs';
export { SEMVER, parseVersion, isPrerelease, compareVersions, changeLevel };

const LEVELS = ['none', 'prerelease', 'patch', 'minor', 'major'];
const rank = l => LEVELS.indexOf(l);

// What an API diff needs, from two surfaces { classes, tokens, exports, elements } (see api-surface.mjs): the items in `before` that are
// missing from `after` are breaking (a changed default, type or enum value shows up as one removed and one added item), items only in `after`
// are new. Returns { required: 'breaking' | 'feature' | 'fix', removed: [...], added: [...] }.
export function requiredBump(before, after, keys = ['classes', 'tokens', 'exports', 'elements']) {
    const removed = [], added = [];
    for (const k of keys) {
        const b = new Set(before[k] ?? []), a = new Set(after[k] ?? []);
        for (const x of b) if (!a.has(x)) removed.push(`${k}: ${x}`);
        for (const x of a) if (!b.has(x)) added.push(`${k}: ${x}`);
    }
    return { required: removed.length ? 'breaking' : added.length ? 'feature' : 'fix', removed, added };
}

// The least change level a bump of the given kind must be, for a release whose previous version is `previous`.
export function minimumLevel(required, previous) {
    const major = parseVersion(previous)?.major ?? 0;
    if (required === 'breaking') return major === 0 ? 'minor' : 'major';
    if (required === 'feature') return 'minor';
    return 'prerelease';
}

// Does `next` cover what the API changes need over `previous`? { ok, level, minimum, reason }.
export function coversBump(previous, next, required) {
    const level = changeLevel(previous, next);
    const minimum = minimumLevel(required, previous);
    if (level === 'downgrade' || level === 'none') return { ok: false, level, minimum, reason: `${next} is not newer than the previous release ${previous}` };
    const ok = rank(level) >= rank(minimum);
    return { ok, level, minimum, reason: ok ? '' : `${required === 'breaking' ? 'breaking changes' : 'new public items'} since ${previous} need at least a ${minimum} bump; ${previous} to ${next} is a ${level} bump` };
}

// The deprecation policy against the last release: baseline.deprecated lists [{ item, since, remove }] (api-surface.mjs writes it with the baseline);
// an item that is gone from `current.elements` while `version` is older than its `remove` was removed too early. Returns the problems (strings).
export function deprecationProblems(baseline, current, version) {
    const here = new Set(current.elements ?? []);
    return (baseline.deprecated ?? []).filter(d => !here.has(d.item) && compareVersions(version, d.remove) < 0)
        .map(d => `${d.item} was deprecated in ${baseline.release ?? 'the last release'} for removal in ${d.remove}, but it is already gone at ${version}: keep it (with its deprecated meta) until ${d.remove}`);
}

// Items marked deprecated whose removal release has come: [{ item, since, remove }] still to be removed.
export const dueForRemoval = (deprecated, version) => deprecated.filter(d => compareVersions(version, d.remove) >= 0);

// ---- the files the version appears in --------------------------------------------------------------------------------------------------
const readText = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
export const readVersion = (dir = root) => readText(path.join(dir, 'VERSION')).trim();

// Every place that must agree with core/VERSION: [{ file, found }] for the ones that do not. Missing files are skipped (a fresh checkout before
// the first build has no dist).
export function versionMismatches(dir = root, repoDir = path.resolve(dir, '..')) {
    const expected = readVersion(dir);
    const found = [];
    const at = (rel, base, extract) => {
        const f = path.join(base, rel);
        if (!fs.existsSync(f)) return;
        const got = extract(readText(f));
        if (got !== expected) found.push({ file: path.relative(repoDir, f).split(path.sep).join('/'), found: got ?? '(not found)' });
    };
    at('package.json', dir, t => JSON.parse(t).version);
    at('js/version.js', dir, t => /PK_VERSION = '([^']+)'/.exec(t)?.[1]);
    at('dist/js/version.js', dir, t => /PK_VERSION = '([^']+)'/.exec(t)?.[1]);
    at('dist/manifest.json', dir, t => JSON.parse(t).version);
    return found;
}

// A release tag names exactly the version: v0.1.0-alpha.1 for core/VERSION 0.1.0-alpha.1.
export const tagMatches = (tag, version) => tag === `v${version}`;

// ---- command line ----------------------------------------------------------------------------------------------------------------------
async function main(argv) {
    const [cmd, arg] = argv;
    if (cmd === 'check') {
        const version = readVersion();
        const problems = [];
        if (!parseVersion(version)) problems.push(`core/VERSION is not a SemVer version: "${version}"`);
        for (const m of versionMismatches()) problems.push(`${m.file} says ${m.found}, core/VERSION says ${version}`);
        const props = readText(path.join(repo, 'Directory.Build.props'));
        if (!/ReadAllText\(.*core\/VERSION/.test(props)) problems.push('Directory.Build.props does not read the version from core/VERSION');
        if (argv.includes('--release')) {
            // A release pull request refreshes the API baseline last: it must describe exactly the version being released.
            const baseline = JSON.parse(readText(path.join(root, 'site', 'scorecard', 'api.baseline.json')));
            if (baseline.release !== version) problems.push(`site/scorecard/api.baseline.json is for ${baseline.release ?? 'no release'}, not ${version}: run node core/tools/api-surface.mjs --write --release ${version}`);
        }
        const { surface } = await import('./api-surface.mjs');
        const baselineFile = JSON.parse(readText(path.join(root, 'site', 'scorecard', 'api.baseline.json')));
        problems.push(...deprecationProblems(baselineFile, surface(), version));
        const tagAt = argv.indexOf('--tag');
        if (tagAt >= 0 && !tagMatches(argv[tagAt + 1], version)) problems.push(`the tag ${argv[tagAt + 1]} is not v${version}`);
        if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
        console.log(`version ${version}: consistent${isPrerelease(version) ? ' (pre-release)' : ''}`);
    } else if (cmd === 'set') {
        if (!parseVersion(arg)) { console.error(`not a SemVer version: ${arg}`); process.exit(2); }
        fs.writeFileSync(path.join(root, 'VERSION'), `${arg}\r\n`);
        const pkgFile = path.join(root, 'package.json');
        const raw = readText(pkgFile);
        const eol = fs.readFileSync(pkgFile, 'utf8').includes('\r\n') ? '\r\n' : '\n';
        fs.writeFileSync(pkgFile, raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${arg}$2`).replace(/\n/g, eol));
        console.log(`core/VERSION and core/package.json are ${arg}. Run node scripts/bootstrap.mjs to stamp the generated files.`);
    } else if (cmd === 'bump') {
        const { surface } = await import('./api-surface.mjs');
        const from = argv.indexOf('--baseline');
        const baseline = JSON.parse(readText(from >= 0 ? path.resolve(argv[from + 1]) : path.join(root, 'site', 'scorecard', 'api.baseline.json')));
        const version = readVersion();
        const now = surface();
        const r = requiredBump(baseline, now);
        const announced = (baseline.deprecated ?? []).filter(d => r.removed.some(x => x === `elements: ${d.item}` || x.startsWith(`elements: ${d.item}:`)));
        for (const d of announced) console.log(`removed as announced: ${d.item} (deprecated since ${d.since}, remove in ${d.remove})`);
        const { deprecations } = await import('./api-surface.mjs');
        for (const d of dueForRemoval(deprecations(), version)) console.log(`due for removal in ${version}: ${d.item} (deprecated since ${d.since}, remove in ${d.remove})`);
        console.log(`API changes since the last release${baseline.release ? ` (${baseline.release})` : ''}: ${r.required} (${r.removed.length} removed or changed, ${r.added.length} added)`);
        if (baseline.release) {
            const c = coversBump(baseline.release, version, r.required);
            console.log(c.ok ? `${version} covers it (${c.level} bump, needs at least ${c.minimum})` : `NOT COVERED: ${c.reason}`);
            if (!c.ok && argv.includes('--require')) process.exit(1);
        } else console.log('No previous release: nothing to compare against yet.');
    } else {
        console.error('usage: versioning.mjs check [--tag vX.Y.Z] | set <version> | bump [--require]');
        process.exit(2);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
