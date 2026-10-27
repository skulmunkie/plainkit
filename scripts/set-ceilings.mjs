// Measures every size ceiling the checks enforce and applies the owner's rule (#1656 follow-up, 2026-10-25): an OPTIONAL package's zip/unpacked ceiling and
// blazorPayload.full may be set to measured + 1% when the measurement is over; page-weight pages only when named with --allow-page-weight; every other ceiling
// over its measurement is REFUSED (nothing written, exit 1). Never lowers a ceiling. Node only, no dependencies.
//   node scripts/set-ceilings.mjs --measure [--no-payload] [--out <file>]                  measure this tree (needs the bootstrap; the payload needs the .NET SDK, about a minute)
//   node scripts/set-ceilings.mjs --from <file> [--allow-page-weight table,form] [--dry-run]  apply a measurement (the --out file, or a gate result with a `measured` field)
// Exit: 0 written or nothing to do, 1 a refused ceiling (nothing written), 2 bad input or the measurement is of another tree.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REF_PAGES } from './bench/ref-pages.mjs';
import { pageGraph } from './bench/wire-graph.mjs';
import { write } from './build-packages.mjs';
import { treeId } from './verify-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Owner rule 2026-10-25: these may be set to measured + 1%. A new built package must be added to this list or to ONE_WAY (the test fails otherwise). */
export const OPTIONAL = ['plainkit.tools', 'plainkit.markdown', 'plainkit.dock', 'plainkit.canvas', 'plainkit.ide'];
export const ONE_WAY = ['plainkit', 'plainkit.audit', 'plainkit.blazor'];
export const plusOne = n => Math.ceil(n * 1.01);

/** { coreOnly, full } from the gzip lines blazor-extras-publish prints, or null when either is missing. */
export function parsePayload(text) {
    const got = {};
    for (const m of String(text).matchAll(/^(core|full)\s+\d+ files under plainkit\/, (\d+) gzip bytes\s*$/gm)) got[m[1]] = +m[2];
    return got.core && got.full ? { coreOnly: got.core, full: got.full } : null;
}

export async function measure(rootDir, { payload = true } = {}) {
    if (!fs.existsSync(path.join(rootDir, 'core', 'dist', 'manifest.json'))) throw new Error('core/dist is missing: run node scripts/bootstrap.mjs first');
    const packages = Object.fromEntries((await write({ repo: rootDir })).map(r => [r.id, { zip: r.zipBytes, unpacked: r.rawBytes }]));
    const pageWeight = Object.fromEntries(Object.entries(REF_PAGES).map(([k, p]) => { const g = pageGraph(p.html, p.path); return [k, { requests: g.requests, gzip: g.gzip, brotli: g.brotli }]; }));
    let blazorPayload = null;
    if (payload) { const r = spawnSync(process.execPath, ['scripts/blazor-extras-publish.mjs'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 1 << 26 }); blazorPayload = parsePayload(`${r.stdout}\n${r.stderr}`); }
    return { tree: treeId(rootDir), packages, pageWeight, blazorPayload };
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
    if (!arg('--from')) { console.error('usage: node scripts/set-ceilings.mjs --measure [--no-payload] [--out <file>] | --from <file> [--allow-page-weight a,b] [--dry-run]'); return 2; }
    const packagesFile = path.join(root, 'packages.json'), pagesFile = path.join(root, 'core', 'tests', 'page-weight.ceiling.json');
    let plan, measured;
    try {
        const j = JSON.parse(fs.readFileSync(path.resolve(arg('--from')), 'utf8'));
        measured = j.measured ?? j;
        if (measured.tree !== treeId(root)) { console.error(`the measurement is of tree ${measured.tree}, this checkout is ${treeId(root)}: measure again`); return 2; }
        plan = planCeilings({ packagesData: JSON.parse(fs.readFileSync(packagesFile, 'utf8')), pageCeilings: JSON.parse(fs.readFileSync(pagesFile, 'utf8')), measured, allowPageWeight: (arg('--allow-page-weight') ?? '').split(',').filter(Boolean) });
    } catch (e) { console.error(e.message); return 2; }
    for (const c of plan.changes) console.log(`set-ceilings: ${c.path} ${c.from} -> ${c.to} (measured ${c.measured}, +1%)`);
    for (const r of plan.refused) console.error(`REFUSED ${r.path}: measured ${r.measured} > ceiling ${r.ceiling} (owner rule: only optional packages, blazorPayload.full and pages named by --allow-page-weight)`);
    if (plan.refused.length) return 1;
    if (!plan.changes.length) { console.log('set-ceilings: every measurement is within its ceiling'); return 0; }
    if (argv.includes('--dry-run')) return 0;
    try {
        for (const [file, apply] of [[packagesFile, applyPackages], [pagesFile, applyPageWeight]]) {
            const rel = path.relative(root, file).replace(/\\/g, '/'), mine = plan.changes.filter(c => c.file === rel);
            if (mine.length) fs.writeFileSync(file, apply(fs.readFileSync(file, 'utf8'), mine));
        }
    } catch (e) { console.error(e.message); return 2; }
    console.log(`set-ceilings: wrote ${plan.changes.length} change(s); put these lines in the pull request body`);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
