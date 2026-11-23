// Measures every size ceiling the checks enforce and applies the owner's rule (#1656 follow-up, 2026-10-25): an OPTIONAL package's zip/unpacked ceiling and
// blazorPayload.full may be set to measured + 1% when the measurement is over; page-weight pages only when named with --allow-page-weight; every other ceiling
// over its measurement is REFUSED (nothing written, exit 1). Never lowers a ceiling. Node only, no dependencies.
// RELEASE mode (#1985 step 3, owner decision 2026-11-23): `--release` sets every release-class ceiling to measured + 5 percent instead (see planRelease).
//   node scripts/set-ceilings.mjs --measure [--no-payload] [--out <file>]                  measure this tree (needs the bootstrap; the payload needs the .NET SDK, about a minute)
//   node scripts/set-ceilings.mjs --from <file> [--allow-page-weight table,form] [--dry-run]  apply a measurement (the --out file, or a gate result with a `measured` field)
//   node scripts/set-ceilings.mjs --release --from <file> [--percent 5] [--allow-page-weight button,form,table] [--dry-run]
//       the release rule: page weight, core packed/unpacked, the optional packages (zip and unpacked), the app entry (appEntryGzKb) and blazorPayload.coreOnly and .full are
//       set to measured + 5 percent (up or down; page-weight requests exactly). The only writer of those ceilings; run it in the release pull request.
// Exit: 0 written or nothing to do, 1 a refused ceiling (nothing written), 2 bad input or the measurement is of another tree.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { REF_PAGES } from './bench/ref-pages.mjs';
import { pageGraph } from './bench/wire-graph.mjs';
import { write } from './build-packages.mjs';
import { treeId } from './verify-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Owner rule 2026-10-25: these may be set to measured + 1%. A new built package must be added to this list or to ONE_WAY (the test fails otherwise). */
export const OPTIONAL = ['plainkit.tools', 'plainkit.markdown', 'plainkit.dock', 'plainkit.canvas', 'plainkit.ide', 'plainkit.icons'];
export const ONE_WAY = ['plainkit', 'plainkit.audit', 'plainkit.blazor'];
export const plusOne = n => Math.ceil(n * 1.01);
/** measured + pct percent, rounded up (integer arithmetic: 100 at 5 percent is 105, not 106). */
export const plusPct = (n, pct = 5) => Math.ceil((n * (10000 + Math.round(pct * 100))) / 10000);
/** The app entry ceiling is in KB with one decimal: measured gzip bytes + pct percent, rounded up to 0.1 KB. */
export const entryLimitKb = (bytes, pct = 5) => Math.ceil(plusPct(bytes, pct) / 102.4) / 10;

/** { coreOnly, full } from the gzip lines blazor-extras-publish prints, or null when either is missing. */
export function parsePayload(text) {
    const got = {};
    for (const m of String(text).matchAll(/^(core|full)\s+\d+ files under plainkit\/, (\d+) gzip bytes\s*$/gm)) got[m[1]] = +m[2];
    return got.core && got.full ? { coreOnly: got.core, full: got.full } : null;
}

/** { packed, unpacked } of the npm tarball (npm pack --dry-run in core/, what core/tests/package-size.test.mjs checks). */
export function measureCore(rootDir) {
    const r = spawnSync('npm pack --dry-run --json', { cwd: path.join(rootDir, 'core'), encoding: 'utf8', shell: true, maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error('npm pack --dry-run failed in core/');
    const info = JSON.parse(r.stdout)[0];
    return { packed: info.size, unpacked: info.unpackedSize };
}

/** Gzip bytes of the app entry graph, measured as core/tests/app-budgets.test.mjs does (static import graph of js/app.js, comments stripped). */
export function measureAppEntry(rootDir) {
    const coreDir = path.join(rootDir, 'core'), seen = new Set();
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n');
    const walk = f => {
        if (seen.has(f)) return;
        seen.add(f);
        for (const m of fs.readFileSync(path.join(coreDir, f), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    };
    walk('js/app.js');
    return zlib.gzipSync(Buffer.from([...seen].map(f => strip(fs.readFileSync(path.join(coreDir, f), 'utf8').replace(/\r\n/g, '\n'))).join('\n'))).length;
}

export async function measure(rootDir, { payload = true } = {}) {
    if (!fs.existsSync(path.join(rootDir, 'core', 'dist', 'manifest.json'))) throw new Error('core/dist is missing: run node scripts/bootstrap.mjs first');
    const packages = Object.fromEntries((await write({ repo: rootDir })).map(r => [r.id, { zip: r.zipBytes, unpacked: r.rawBytes }]));
    const pageWeight = Object.fromEntries(Object.entries(REF_PAGES).map(([k, p]) => { const g = pageGraph(p.html, p.path); return [k, { requests: g.requests, gzip: g.gzip, brotli: g.brotli }]; }));
    const core = measureCore(rootDir), appEntryGzBytes = measureAppEntry(rootDir);
    let blazorPayload = null;
    if (payload) { const r = spawnSync(process.execPath, ['scripts/blazor-extras-publish.mjs'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 1 << 26 }); blazorPayload = parsePayload(`${r.stdout}\n${r.stderr}`); }
    return { tree: treeId(rootDir), packages, core, pageWeight, appEntryGzBytes, blazorPayload };
}

/** What to write and what to refuse. `path` is a readable key (plainkit.canvas.maxZipBytes, blazorPayload.full, table.gzip). */
export function planCeilings({ packagesData, pageCeilings, measured, allowPageWeight = [] }) {
    const changes = [], refused = [];
    for (const p of packagesData.packages.filter(x => x.built && measured.packages[x.id])) {
        const m = measured.packages[p.id], optional = OPTIONAL.includes(p.id);
        if (!optional && !ONE_WAY.includes(p.id)) { refused.push({ file: 'packages.json', path: `${p.id} (not classified in scripts/set-ceilings.mjs)`, ceiling: null, measured: null }); continue; }
        for (const [key, value] of [['maxZipBytes', m.zip], ['maxUnpackedBytes', m.unpacked]]) {
            if (p.id === 'plainkit' && key === 'maxUnpackedBytes') continue;
            if (!Number.isInteger(p[key]) || value <= p[key]) continue;
            if (optional) changes.push({ file: 'packages.json', path: `${p.id}.${key}`, from: p[key], to: plusOne(value), measured: value });
            else refused.push({ file: 'packages.json', path: `${p.id}.${key}`, ceiling: p[key], measured: value });
        }
    }
    const bp = measured.blazorPayload;
    if (bp) {
        if (bp.full > packagesData.blazorPayload.full) changes.push({ file: 'packages.json', path: 'blazorPayload.full', from: packagesData.blazorPayload.full, to: plusOne(bp.full), measured: bp.full });
        if (bp.coreOnly > packagesData.blazorPayload.coreOnly) refused.push({ file: 'packages.json', path: 'blazorPayload.coreOnly', ceiling: packagesData.blazorPayload.coreOnly, measured: bp.coreOnly });
    }
    for (const name of allowPageWeight) if (!measured.pageWeight[name]) throw new Error(`--allow-page-weight: ${name} is not a reference page`);
    for (const [page, m] of Object.entries(measured.pageWeight)) {
        for (const key of ['requests', 'gzip', 'brotli']) {
            const ceiling = pageCeilings[page]?.[key];
            if (!Number.isInteger(ceiling) || m[key] <= ceiling) continue;
            if (allowPageWeight.includes(page)) changes.push({ file: 'core/tests/page-weight.ceiling.json', path: `${page}.${key}`, from: ceiling, to: key === 'requests' ? m[key] : plusOne(m[key]), measured: m[key] });
            else refused.push({ file: 'core/tests/page-weight.ceiling.json', path: `${page}.${key}`, ceiling, measured: m[key] });
        }
    }
    return { changes, refused };
}

/**
 * The release rule (policy 2026-11-23, #1985 step 3): every release-class ceiling = measured + pct percent, up or down (a lighter release lowers it); page-weight requests exactly.
 * Release class: the optional packages (zip, unpacked), core packed and unpacked, the app entry (appEntryGzKb, KB), blazorPayload.coreOnly and .full, page weight.
 * A page-weight page whose ceiling would move and that is not named in allowPageWeight is refused. plainkit.audit and plainkit.blazor stay one-way (planCeilings).
 * A measurement without core, appEntryGzBytes or blazorPayload leaves those ceilings alone.
 */
export function planRelease({ packagesData, pageCeilings, appEntryKb, measured, allowPageWeight = [], pct = 5 }) {
    const changes = [], refused = [];
    const add = (file, p, from, to, m) => { if (from !== to) changes.push({ file, path: p, from, to, measured: m }); };
    for (const p of packagesData.packages.filter(x => x.built && measured.packages[x.id] && OPTIONAL.includes(x.id)))
        for (const [key, value] of [['maxZipBytes', measured.packages[p.id].zip], ['maxUnpackedBytes', measured.packages[p.id].unpacked]])
            if (Number.isInteger(p[key])) add('packages.json', `${p.id}.${key}`, p[key], plusPct(value, pct), value);
    const core = packagesData.packages.find(x => x.id === 'plainkit');
    if (measured.core) {
        for (const [key, cnst, value] of [['maxPackedBytes', 'MAX_PACKED_BYTES', measured.core.packed], ['maxUnpackedBytes', 'MAX_UNPACKED_BYTES', measured.core.unpacked]]) {
            add('packages.json', `plainkit.${key}`, core[key], plusPct(value, pct), value);
            add('core/tests/package-size.test.mjs', cnst, core[key], plusPct(value, pct), value);
        }
    }
    if (measured.appEntryGzBytes) add('core/site/scorecard/scoring.data.js', 'appEntryGzKb', appEntryKb, entryLimitKb(measured.appEntryGzBytes, pct), measured.appEntryGzBytes);
    const bp = measured.blazorPayload;
    if (bp) for (const key of ['coreOnly', 'full']) add('packages.json', `blazorPayload.${key}`, packagesData.blazorPayload[key], plusPct(bp[key], pct), bp[key]);
    for (const name of allowPageWeight) if (!measured.pageWeight[name]) throw new Error(`--allow-page-weight: ${name} is not a reference page`);
    for (const [page, m] of Object.entries(measured.pageWeight)) {
        for (const key of ['requests', 'gzip', 'brotli']) {
            const ceiling = pageCeilings[page]?.[key], to = key === 'requests' ? m[key] : plusPct(m[key], pct);
            if (!Number.isInteger(ceiling) || ceiling === to) continue;
            if (allowPageWeight.includes(page)) add('core/tests/page-weight.ceiling.json', `${page}.${key}`, ceiling, to, m[key]);
            else refused.push({ file: 'core/tests/page-weight.ceiling.json', path: `${page}.${key}`, ceiling, measured: m[key] });
        }
    }
    return { changes, refused };
}

/** Text of core/tests/package-size.test.mjs (a constant, written with digit grouping) or core/site/scorecard/scoring.data.js (an app budget limit) with one number replaced. */
export function applyScalar(text, change) {
    let n = 0, out;
    if (change.file === 'core/tests/package-size.test.mjs') {
        const grouped = String(change.to).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
        out = text.replace(new RegExp(`(const ${change.path} = )[0-9_]+`), (_, head) => { n++; return `${head}${grouped}`; });
    } else out = text.replace(new RegExp(`(${change.path}: \\{ target: \\d+, limit: )[0-9.]+`), (_, head) => { n++; return `${head}${change.to}`; });
    if (n !== 1) throw new Error(`no ceiling ${change.path} in ${change.file}`);
    return out;
}

/** packages.json text with the changes set; keeps its line endings and refuses a file that is not in canonical form. */
export function applyPackages(text, changes) {
    const crlf = text.includes('\r\n'), lf = text.replace(/\r\n/g, '\n'), data = JSON.parse(lf);
    if (`${JSON.stringify(data, null, 2)}\n` !== lf) throw new Error('packages.json is not in canonical form');
    for (const c of changes) {
        const keys = c.path.split('.'), key = keys.pop(), owner = keys.join('.') === 'blazorPayload' ? data.blazorPayload : data.packages.find(p => p.id === keys.join('.'));
        if (!owner || !(key in owner)) throw new Error(`no ceiling ${c.path} in packages.json`);
        owner[key] = c.to;
    }
    const out = `${JSON.stringify(data, null, 2)}\n`;
    return crlf ? out.replace(/\n/g, '\r\n') : out;
}

/** page-weight.ceiling.json text with only the changed numbers replaced. */
export function applyPageWeight(text, changes) {
    let out = text;
    for (const c of changes) {
        const [page, key] = c.path.split('.'), re = new RegExp(`("${page}": \\{[^}\\n]*"${key}": )\\d+`, 'g');
        if ((out.match(re) ?? []).length !== 1) throw new Error(`no ceiling ${c.path} in page-weight.ceiling.json`);
        out = out.replace(re, (_, head) => `${head}${c.to}`);
    }
    return out;
}

async function main(argv) {
    const arg = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
    if (argv.includes('--measure')) {
        let measured;
        try { measured = await measure(root, { payload: !argv.includes('--no-payload') }); } catch (e) { console.error(e.message); return 2; }
        const text = JSON.stringify(measured, null, 2);
        if (arg('--out')) fs.writeFileSync(path.resolve(arg('--out')), `${text}\n`); else console.log(text);
        return 0;
    }
    if (!arg('--from')) { console.error('usage: node scripts/set-ceilings.mjs --measure [--no-payload] [--out <file>] | [--release [--percent 5]] --from <file> [--allow-page-weight a,b] [--dry-run]'); return 2; }
    const release = argv.includes('--release'), pct = arg('--percent') === null ? 5 : Number(arg('--percent'));
    if (!(pct > 0 && pct < 50)) { console.error('--percent must be a number between 0 and 50'); return 2; }
    const packagesFile = path.join(root, 'packages.json'), pagesFile = path.join(root, 'core', 'tests', 'page-weight.ceiling.json');
    const sizeFile = path.join(root, 'core', 'tests', 'package-size.test.mjs'), scoringFile = path.join(root, 'core', 'site', 'scorecard', 'scoring.data.js');
    let plan, measured;
    try {
        const j = JSON.parse(fs.readFileSync(path.resolve(arg('--from')), 'utf8'));
        measured = j.measured ?? j;
        if (measured.tree !== treeId(root)) { console.error(`the measurement is of tree ${measured.tree}, this checkout is ${treeId(root)}: measure again`); return 2; }
        const packagesData = JSON.parse(fs.readFileSync(packagesFile, 'utf8')), pageCeilings = JSON.parse(fs.readFileSync(pagesFile, 'utf8')), allowPageWeight = (arg('--allow-page-weight') ?? '').split(',').filter(Boolean);
        if (release) {
            const appEntryKb = Number(/appEntryGzKb: \{ target: \d+, limit: ([0-9.]+)/.exec(fs.readFileSync(scoringFile, 'utf8'))?.[1]);
            plan = planRelease({ packagesData, pageCeilings, appEntryKb, measured, allowPageWeight, pct });
        } else plan = planCeilings({ packagesData, pageCeilings, measured, allowPageWeight });
    } catch (e) { console.error(e.message); return 2; }
    for (const c of plan.changes) console.log(`set-ceilings: ${c.path} ${c.from} -> ${c.to} (measured ${c.measured}, +${release ? pct : 1}%)`);
    for (const r of plan.refused) console.error(`REFUSED ${r.path}: measured ${r.measured} vs ceiling ${r.ceiling} (${release ? 'name the page in --allow-page-weight to move a page-weight ceiling' : 'owner rule: only optional packages, blazorPayload.full and pages named by --allow-page-weight'})`);
    if (plan.refused.length) return 1;
    if (!plan.changes.length) { console.log('set-ceilings: every measurement is within its ceiling'); return 0; }
    if (argv.includes('--dry-run')) return 0;
    try {
        for (const [file, apply] of [[packagesFile, applyPackages], [pagesFile, applyPageWeight]]) {
            const rel = path.relative(root, file).replace(/\\/g, '/'), mine = plan.changes.filter(c => c.file === rel);
            if (mine.length) fs.writeFileSync(file, apply(fs.readFileSync(file, 'utf8'), mine));
        }
        for (const file of [sizeFile, scoringFile]) {
            const rel = path.relative(root, file).replace(/\\/g, '/'), mine = plan.changes.filter(c => c.file === rel);
            if (mine.length) fs.writeFileSync(file, mine.reduce((t, c) => applyScalar(t, c), fs.readFileSync(file, 'utf8')));
        }
    } catch (e) { console.error(e.message); return 2; }
    console.log(`set-ceilings: wrote ${plan.changes.length} change(s); put these lines in the pull request body`);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
