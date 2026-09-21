#!/usr/bin/env node
// Changelog fragments: one small file per change in changelog/unreleased/, compiled into CHANGELOG.md by the release pull request.
// Fragments exist so that pull requests never edit the same lines of CHANGELOG.md (a merge-conflict magnet). See changelog/README.md.
//
//   node scripts/changelog.mjs new <type> <slug> [--issue N]
//   node scripts/changelog.mjs check
//   node scripts/changelog.mjs check-pr --base <ref>        (PK_NO_CHANGELOG=1 skips it: CI sets it for the `no-changelog` label)
//   node scripts/changelog.mjs compile --version X.Y.Z [--date YYYY-MM-DD]
//
// No dependencies. Text is handled with LF internally; a file is written with CRLF when .gitattributes says so or when it already used CRLF.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TYPES = ['added', 'changed', 'fixed', 'removed', 'breaking', 'notes'];
/** Section order in CHANGELOG.md, and the heading of each type. */
export const SECTIONS = [['breaking', 'Breaking'], ['added', 'Added'], ['changed', 'Changed'], ['fixed', 'Fixed'], ['removed', 'Removed'], ['notes', 'Notes']];
const PLACEHOLDER = 'Describe the change';
export const FRAGMENT_DIR = 'changelog/unreleased';

const lf = s => s.replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- fragments

/**
 * Parse a fragment. Two forms: front matter (`---`, `type: fixed`, optional `issue: 12`, `---`, then the entry) or, with no front matter,
 * a first line `type: fixed` followed by the entry. Returns { type, issue, text, errors }; text is the entry on one line.
 */
export function parseFragment(raw) {
    const errors = [];
    let lines = lf(raw).replace(/^\uFEFF/, '').split('\n');
    const meta = {};
    const takeMeta = line => { const m = /^([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(line); if (m) meta[m[1].toLowerCase()] = m[2]; return !!m; };
    if (lines[0].trim() === '---') {
        const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
        if (end < 0) errors.push('front matter is not closed with ---');
        else {
            lines.slice(1, end).forEach(l => { if (l.trim() && !takeMeta(l)) errors.push(`front matter line is not "key: value": ${l.trim()}`); });
            lines = lines.slice(end + 1);
        }
    } else if (/^type\s*:/i.test(lines[0])) {
        takeMeta(lines[0]);
        lines = lines.slice(1);
    }
    const type = (meta.type || '').toLowerCase();
    if (!type) errors.push('no type (front matter `type:` or a first line `type: <type>`)');
    else if (!TYPES.includes(type)) errors.push(`unknown type "${type}" (one of ${TYPES.join(', ')})`);
    const issue = meta.issue === undefined ? null : meta.issue.replace(/^#/, '');
    if (issue !== null && !/^\d+$/.test(issue)) errors.push(`issue must be a number, got "${meta.issue}"`);
    const body = lines.join('\n').trim();
    if (!body) errors.push('the entry is empty');
    else {
        if (body.startsWith(PLACEHOLDER)) errors.push('the placeholder text is still there: write the entry');
        if (/\n\s*\n/.test(body)) errors.push('more than one paragraph: one entry per file (split it into two fragments)');
        if (body.split('\n').filter(l => /^\s*([-*+]|\d+\.)\s/.test(l)).length > 1) errors.push('more than one list item: one entry per file (split it into two fragments)');
        if (/^\s*#/m.test(body)) errors.push('a heading inside the entry: fragments hold one entry, the sections are added on compile');
    }
    const text = body.split('\n').map(l => l.trim()).filter(Boolean).join(' ').replace(/^([-*+])\s+/, '');
    return { type, issue, text, errors };
}

/** The fragment file names that are allowed: `<issue-or-timestamp>-<slug>.md`, and .gitkeep to keep the folder. */
export const FRAGMENT_NAME = /^[0-9][0-9a-z]*-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Render a fragment file for `new`. */
export function renderFragment(type, issue) {
    return `---\ntype: ${type}${issue ? `\nissue: ${issue}` : ''}\n---\nDescribe the change in one entry: what a user sees, in the present tense.\n`;
}

/** The problems with the fragments folder: [{ file, message }]. `files` is [{ name, text }] (text is null for a directory). */
export function checkFragments(files) {
    const problems = [];
    for (const { name, text } of files) {
        if (name === '.gitkeep') continue;
        if (text === null) { problems.push({ file: name, message: 'a folder: only fragment files belong here' }); continue; }
        if (!FRAGMENT_NAME.test(name)) { problems.push({ file: name, message: 'not a fragment name: <issue-or-timestamp>-<slug>.md (lowercase, hyphens)' }); continue; }
        for (const message of parseFragment(text).errors) problems.push({ file: name, message });
    }
    return problems;
}

// ---------------------------------------------------------------- pull request check

/** A path that does not need a changelog entry: markdown anywhere, docs under .github, the changelog folder itself, and the browser attestation report (evidence, not a change). */
export function isDocsOnly(p) {
    p = p.replace(/\\/g, '/');
    return /\.md$/i.test(p) || p.startsWith('changelog/') || (p.startsWith('.github/') && /\.md$/i.test(p)) || p === 'core/tests/browser/report.json';
}

/**
 * `changed` is [{ status, path }] from `git diff --name-status`. Fails (ok: false) when something outside the docs-only paths changed and the
 * pull request adds no fragment.
 */
export function checkPr(changed, env = {}) {
    if (env.PK_NO_CHANGELOG) return { ok: true, reason: 'PK_NO_CHANGELOG is set (label no-changelog)' };
    const code = changed.filter(c => !isDocsOnly(c.path));
    if (!code.length) return { ok: true, reason: 'docs-only change' };
    const added = changed.some(c => c.status.startsWith('A') && c.path.startsWith(FRAGMENT_DIR + '/') && !c.path.endsWith('.gitkeep'));
    if (added) return { ok: true, reason: 'adds a fragment' };
    return { ok: false, reason: `changes ${code.length} file(s) outside the docs-only paths (first: ${code[0].path}) and adds no fragment in ${FRAGMENT_DIR}/. Run: node scripts/changelog.mjs new <type> <slug> --issue N, or label the pull request no-changelog with the reason.` };
}

// ---------------------------------------------------------------- compile

/**
 * The type of a legacy bullet under [Unreleased], by the prefix the maintainers used when regrouping 0.1.0-alpha.1: "Changed (breaking):" and
 * "Removed (breaking):" (any "(breaking)") are Breaking; "Added:", "Changed:", "Fixed:" (also "Fixed (docs):"), "Removed:" go to their section;
 * a bullet with no such prefix ("Alpha status of ...", "Initial import ...") is a Note.
 */
export function classifyLegacy(bullet) {
    const m = /^-\s+(Added|Changed|Fixed|Removed)\b([^:\n]{0,40}):/.exec(bullet);
    if (!m) return 'notes';
    if (/\(breaking\)/i.test(m[2])) return 'breaking';
    return m[1].toLowerCase();
}

/** Split the text under a heading into bullets (a bullet continues over following lines that are not another bullet or a heading). */
export function splitBullets(body) {
    const bullets = [];
    for (const line of lf(body).split('\n')) {
        if (/^-\s/.test(line)) bullets.push(line.replace(/\s+$/, ''));
        else if (/^#{1,6}\s/.test(line)) continue;
        else if (line.trim() && bullets.length) bullets[bullets.length - 1] += ' ' + line.trim();
    }
    return bullets;
}

/** The entry line for a fragment. */
export function fragmentBullet({ text, issue }) {
    const tagged = issue && !new RegExp(`#${issue}\\b`).test(text) ? ` (#${issue})` : '';
    return `- ${text}${tagged}`;
}

/** Build the text of a version section from bullets by type ({ breaking: [...], ... }). */
export function renderSection(version, date, byType) {
    const out = [`## [${version}] - ${date}`, ''];
    for (const [type, heading] of SECTIONS) {
        if (!byType[type] || !byType[type].length) continue;
        out.push(`### ${heading}`, '', ...byType[type], '');
    }
    return out.join('\n');
}

/**
 * Compile: `text` is CHANGELOG.md (LF), `fragments` is [{ name, type, issue, text }] (in file-name order). Returns the new CHANGELOG text: an empty
 * [Unreleased], then the new section (legacy bullets first, in their order, then the fragments), then the older versions untouched.
 */
export function compileChangelog(text, fragments, version, date) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`"${version}" is not a SemVer version`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a date (YYYY-MM-DD)`);
    text = lf(text);
    if (new RegExp(`^## \\[${version.replace(/[.+]/g, '\\$&')}\\]`, 'm').test(text)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
    const start = text.search(/^## \[Unreleased\][^\n]*$/m);
    if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading');
    const afterHeading = text.indexOf('\n', start) + 1;
    const rest = text.slice(afterHeading);
    const nextRel = rest.search(/^## \[/m);
    const legacyBody = nextRel < 0 ? rest : rest.slice(0, nextRel);
    const older = nextRel < 0 ? '' : rest.slice(nextRel);
    const byType = Object.fromEntries(TYPES.map(t => [t, []]));
    for (const b of splitBullets(legacyBody)) byType[classifyLegacy(b)].push(b);
    for (const f of fragments) byType[f.type].push(fragmentBullet(f));
    if (!TYPES.some(t => byType[t].length)) throw new Error('nothing to release: no fragments and nothing under [Unreleased]');
    const head = text.slice(0, start);
    return `${head}## [Unreleased]\n\n${renderSection(version, date, byType)}`.replace(/\n*$/, '\n') + (older ? '\n' + older : '');
}

// ---------------------------------------------------------------- files

/** Does .gitattributes require CRLF for this repo-relative path? (only simple `dir/**` and `*.ext` patterns, which is all the repo uses) */
export function requiresCrlf(attributesText, rel) {
    rel = rel.replace(/\\/g, '/');
    for (const line of lf(attributesText).split('\n')) {
        const m = /^(\S+)\s+.*\beol=crlf\b/.exec(line);
        if (!m) continue;
        const pat = m[1];
        if (pat.endsWith('/**') ? rel.startsWith(pat.slice(0, -2)) : pat.startsWith('*.') ? rel.endsWith(pat.slice(1)) : rel === pat) return true;
    }
    return false;
}

function writeText(root, rel, text, previous) {
    const attrs = fs.existsSync(path.join(root, '.gitattributes')) ? fs.readFileSync(path.join(root, '.gitattributes'), 'utf8') : '';
    const crlf = requiresCrlf(attrs, rel) || (previous !== undefined && /\r\n/.test(previous));
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), crlf ? lf(text).replace(/\n/g, '\r\n') : lf(text));
}

export function readFragments(root) {
    const dir = path.join(root, FRAGMENT_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map(e => ({ name: e.name, text: e.isDirectory() ? null : fs.readFileSync(path.join(dir, e.name), 'utf8') }));
}

function args(argv) {
    const flags = {}; const pos = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) { const k = argv[i].slice(2); flags[k] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else pos.push(argv[i]);
    }
    return { flags, pos };
}

const stamp = d => d.toISOString().replace(/\D/g, '').slice(0, 14);

/** Run a command; returns { code, out, err } (for the tests, `root` and `env` are injectable). */
export function run(argv, { root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), env = process.env, now = new Date() } = {}) {
    const { flags, pos } = args(argv);
    const [cmd, ...rest] = pos;
    const out = []; const err = [];
    const done = code => ({ code, out: out.join('\n'), err: err.join('\n') });
    try {
        if (cmd === 'new') {
            const [type, slugArg] = rest;
            if (!TYPES.includes(type) || !slugArg) { err.push(`usage: changelog.mjs new <${TYPES.join('|')}> <slug> [--issue N]`); return done(2); }
            const issue = flags.issue === undefined ? null : String(flags.issue).replace(/^#/, '');
            if (issue !== null && !/^\d+$/.test(issue)) { err.push('--issue takes a number'); return done(2); }
            const slug = slugify(slugArg);
            if (!slug) { err.push('the slug has no letters or digits'); return done(2); }
            const rel = `${FRAGMENT_DIR}/${issue || stamp(now)}-${slug}.md`;
            if (fs.existsSync(path.join(root, rel))) { err.push(`${rel} exists already`); return done(1); }
            writeText(root, rel, renderFragment(type, issue));
            out.push(`created ${rel}: replace the placeholder with the entry`);
            return done(0);
        }
        if (cmd === 'check') {
            const files = readFragments(root);
            const problems = checkFragments(files);
            problems.forEach(p => err.push(`${FRAGMENT_DIR}/${p.file}: ${p.message}`));
            out.push(`${files.filter(f => f.name !== '.gitkeep').length} fragment(s), ${problems.length} problem(s)`);
            return done(problems.length ? 1 : 0);
        }
        if (cmd === 'check-pr') {
            const base = flags.base;
            if (!base || base === true) { err.push('usage: changelog.mjs check-pr --base <ref>'); return done(2); }
            const git = spawnSync('git', ['diff', '--name-status', '--no-renames', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
            if (git.status !== 0) { err.push(`git diff failed: ${git.stderr.trim()}`); return done(2); }
            const changed = git.stdout.split('\n').filter(Boolean).map(l => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; });
            const r = checkPr(changed, env);
            (r.ok ? out : err).push(r.ok ? `changelog ok: ${r.reason}` : `changelog fragment missing: ${r.reason}`);
            return done(r.ok ? 0 : 1);
        }
        if (cmd === 'compile') {
            const version = flags.version;
            if (!version || version === true) { err.push('usage: changelog.mjs compile --version X.Y.Z [--date YYYY-MM-DD]'); return done(2); }
            const date = typeof flags.date === 'string' ? flags.date : now.toISOString().slice(0, 10);
            const files = readFragments(root);
            const problems = checkFragments(files);
            if (problems.length) { problems.forEach(p => err.push(`${FRAGMENT_DIR}/${p.file}: ${p.message}`)); return done(1); }
            const fragments = files.filter(f => f.name !== '.gitkeep').map(f => ({ name: f.name, ...parseFragment(f.text) }));
            const prev = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
            writeText(root, 'CHANGELOG.md', compileChangelog(prev, fragments, version, date), prev);
            fragments.forEach(f => fs.unlinkSync(path.join(root, FRAGMENT_DIR, f.name)));
            out.push(`CHANGELOG.md: [${version}] - ${date} written, ${fragments.length} fragment(s) compiled and removed`);
            return done(0);
        }
        err.push('usage: changelog.mjs <new|check|check-pr|compile> ...');
        return done(2);
    } catch (e) {
        err.push(e.message);
        return done(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const r = run(process.argv.slice(2));
    if (r.out) console.log(r.out);
    if (r.err) console.error(r.err);
    process.exit(r.code);
}
