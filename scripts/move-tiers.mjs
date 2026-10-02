// Moves one composition tier's elements out of core/elements into its tier folder (#767, spec phases 5-6):
//   node scripts/move-tiers.mjs --tier <shell|page|component> [--dry-run]   print every folder that would move and every reference that would be rewritten (default)
//   node scripts/move-tiers.mjs --tier <tier> --apply                       git mv the folders, rewrite the references, then print what is left for a human
// Folders: shell -> core/shells, page -> core/pages, component -> core/components; base elements stay in core/elements. The shipped shape does not change:
// dist/elements/<name>.js is named by the element, not by its folder (core/tests/dist-elements.test.mjs), so the rewrite never touches `dist/elements/` or `plainkit/elements/`.
//
// What a reference is (the planner scans every tracked text file except CHANGELOG.md, changelog/ and docs/):
//   mechanical      `elements/<name>/...` or `core/elements/<name>` for a moving <name>  ->  `<folder>/<name>/...`; and a sibling import `'../<other>/` from a file inside
//                   a moved or staying element folder whose target now lives in another tier folder  ->  `'../../<folder>/<other>/`.
//   non-mechanical  anything that names `elements/` without one moving name: globs (`elements/*`), the folder itself (`core/elements`), loops over the directory
//                   (readdirSync of elements), and strings built from parts. The report lists them per file with the line; a human reads each before the batch lands.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FOLDER = { shell: 'shells', page: 'pages', component: 'components' };
const SKIP = /^(CHANGELOG\.md|changelog\/|docs\/|core\/site\/scorecard\/report\.json$|package-lock\.json$)/;
const TEXT = /\.(mjs|js|json|md|yml|yaml|html|css|cs|csproj|razor|txt|cmd)$/;
export const CATEGORIES = [
    ['core/elements/', 'moved element sources (sibling imports, own tests)'], ['core/tools/', 'build, API, tiers, security, serve, usage and audit tooling'],
    ['core/tests/', 'tests, browser cases and review scenarios'], ['core/js/', 'imports in core/js/**'], ['core/site/', 'gallery, scorecard, files and guides'],
    ['core/modules/', 'modules'], ['core/samples/', 'samples'], ['blazor/', 'Blazor mappings and sources'], ['scripts/', 'scripts, verify globs, skills'],
    ['.github/', 'CI workflows and templates'], ['', 'root docs and config (AGENTS.md, CONTRIBUTING.md, ...)'],
];
const category = f => CATEGORIES.find(([p]) => f.startsWith(p))[1];

/** { name, tier } of every element folder under core/elements, from its meta file. */
export function listElements(rootDir = root) {
    const dir = path.join(rootDir, 'core/elements');
    return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => ({ name: d.name, tier: JSON.parse(fs.readFileSync(path.join(dir, d.name, `${d.name}.meta.json`), 'utf8')).tier })).sort((a, b) => a.name.localeCompare(b.name));
}

// A whole-folder reference: a glob, `core/elements` ending the path, or `elements/${...}` built from a variable.
const WHOLE = /(?<![\w-])(core\/)?elements\/(\*|\$\{)|core\/elements(?![\w/-])|\.\.\/elements\/(?![\w-])/;
const PATHY = /path\.|join\(|resolve\(|readdir|walk\(|files\(|URL\(|\bdir\b/;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The plan for moving `tier`: { moves: [from, to], edits: [{ file, line, before, after }], manual: [{ file, line, text }] }. `files` = { path: text } (default: tracked text files). */
export function plan(tier, { elements = listElements(), files = trackedFiles() } = {}) {
    if (!FOLDER[tier]) throw new Error(`--tier must be one of ${Object.keys(FOLDER).join(', ')}`);
    const where = Object.fromEntries(elements.map(e => [e.name, e.tier === tier ? FOLDER[tier] : 'elements']));
    const dest = Object.fromEntries(elements.map(e => [e.name, e.tier === tier ? FOLDER[tier] : null]));
    const movers = elements.filter(e => e.tier === tier).map(e => e.name);
    const moves = [];
    for (const f of Object.keys(files)) { const m = /^core\/elements\/([^/]+)\/(.+)$/.exec(f); if (m && dest[m[1]]) moves.push([f, `core/${dest[m[1]]}/${m[1]}/${m[2]}`]); }
    const names = movers.length ? movers.map(escape).join('|') : null;
    const direct = names && new RegExp(`(?<![\\w-]|dist/|plainkit/)elements/(${names})(?![\\w.-])`, 'g');
    const sibling = /(['"`])\.\.\/([a-z][a-z0-9-]*)\//g;
    const edits = [], manual = [];
    for (const [file, text] of Object.entries(files)) {
        if (SKIP.test(file)) continue;
        const own = /^core\/elements\/([^/]+)\//.exec(file)?.[1]; // the folder this file is in (before the move)
        text.split(/\r?\n/).forEach((line, i) => {
            let after = line;
            if (direct) after = after.replace(direct, (_, n) => `${FOLDER[tier]}/${n}`);
            if (own && !/^\s*(\/\/|\*)/.test(after)) after = after.replace(sibling, (all, q, other) => {
                if (!(other in where) || other === own) return all;
                const from = dest[own] ?? 'elements', to = where[other];
                return from === to ? all : `${q}../../${to}/${other}/`;
            });
            if (after !== line) edits.push({ file, line: i + 1, before: line.trim(), after: after.trim() });
            const shipped = after.replace(/dist\/elements|'(?:dist|plainkit)',\s*'elements'/g, '');
            // Leftovers: still names the folder as a whole, by wildcard or by a built string, so only a human knows what it should become.
            if (!/^\s*(\/\/|\*|#)/.test(after) && (WHOLE.test(shipped) || (/['"`]elements['"`]/.test(shipped) && PATHY.test(shipped)))) manual.push({ file, line: i + 1, text: line.trim() });
        });
    }
    return { tier, folder: FOLDER[tier], movers, moves, edits, manual };
}

export function trackedFiles(rootDir = root) {
    const ls = spawnSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\n').filter(f => f && TEXT.test(f) && !SKIP.test(f));
    return Object.fromEntries(ls.filter(f => fs.existsSync(path.join(rootDir, f))).map(f => [f, fs.readFileSync(path.join(rootDir, f), 'utf8')]));
}

export function report(p, verbose = true) {
    const out = [`move-tiers: tier ${p.tier} -> core/${p.folder}/  (${p.movers.length} element folders: ${p.movers.join(', ')})`, `files to move: ${p.moves.length}`];
    if (verbose) for (const [a, b] of p.moves) out.push(`  mv ${a} -> ${b}`);
    const by = (list, key) => { const m = new Map(); for (const x of list) { const c = category(x.file); (m.get(c) ?? m.set(c, []).get(c)).push(x); } return m; };
    out.push(`references to rewrite: ${p.edits.length} in ${new Set(p.edits.map(e => e.file)).size} files`);
    for (const [c, list] of by(p.edits)) { out.push(` [${c}] ${list.length}`); if (verbose) for (const e of list) out.push(`  ${e.file}:${e.line}  ${e.before}  =>  ${e.after}`); }
    out.push(`non-mechanical (read by a human; the script leaves them alone): ${p.manual.length}`);
    for (const [c, list] of by(p.manual)) { out.push(` [${c}] ${list.length}`); if (verbose) for (const e of list) out.push(`  ${e.file}:${e.line}  ${e.text}`); }
    return out.join('\n');
}

export function apply(p, rootDir = root) {
    if (!p.movers.length) throw new Error(`no ${p.tier} elements to move`);
    const byFile = new Map();
    for (const e of p.edits) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e);
    for (const [file, list] of byFile) {
        const f = path.join(rootDir, file), text = fs.readFileSync(f, 'utf8'), eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/);
        const plain = plan(p.tier, { elements: listElements(rootDir), files: { [file]: text } }).edits; // same rewrite, line by line, on the current text
        for (const e of plain) lines[e.line - 1] = lines[e.line - 1].replace(e.before, e.after);
        fs.writeFileSync(f, lines.join(eol));
    }
    fs.mkdirSync(path.join(rootDir, 'core', p.folder), { recursive: true });
    for (const name of p.movers) {
        const r = spawnSync('git', ['mv', `core/elements/${name}`, `core/${p.folder}/${name}`], { cwd: rootDir, encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`git mv ${name} failed: ${r.stderr}`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const args = process.argv.slice(2), tier = args[args.indexOf('--tier') + 1];
    if (!args.includes('--tier') || !FOLDER[tier]) { console.error(`usage: node scripts/move-tiers.mjs --tier <${Object.keys(FOLDER).join('|')}> [--dry-run | --apply] [--summary]`); process.exit(2); }
    const p = plan(tier);
    console.log(report(p, !args.includes('--summary')));
    if (args.includes('--apply')) { apply(p); console.log('\napplied: now run node scripts/bootstrap.mjs, fix the non-mechanical list above, then node scripts/verify.mjs'); }
}
