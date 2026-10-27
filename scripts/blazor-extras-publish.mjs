// The Blazor option model, end to end (#1656 phase 2): publishes a tiny app that references the PlainKit.Blazor package once per option set and asserts
// which static web assets land in the published output, then measures the payload (gzip bytes of everything the package serves).
//
//   node scripts/blazor-extras-publish.mjs                      pack, publish four apps, check the files and the payload ceilings
//   node scripts/blazor-extras-publish.mjs --package <dir>      use the PlainKit.Blazor nupkg already in <dir> (verify.mjs's pack check does)
//   node scripts/blazor-extras-publish.mjs --write              also record the measured payload in packages.json (blazorPayload; it only ever goes down)
//   PK_EXTRAS_JOBS=<n>                                          how many option sets publish at once (default by free memory; 1 = one after another)
//
// Option sets: none declared and `full` (everything), `core` (no extra), `dock` (one extra, so no gallery: the Gallery option is its own). The ceilings are packages.json "blazorPayload" { coreOnly, full }:
// the measured gzip bytes plus 1 percent when first recorded, then a one-way ratchet like the npm ceilings. Exit 0 ok, 1 a problem (each says what to change), 2 could not run.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { claims, loadPackages } from './packages.mjs';
import { makeTempDir } from '../core/tools/tempdir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVED = '_content/PlainKit.Blazor/plainkit/';

export const SETS = [
    { id: 'default', extras: null, declared: 'all' },
    { id: 'full', extras: 'full', declared: 'all' },
    { id: 'core', extras: 'core', declared: [] },
    { id: 'dock', extras: 'dock', declared: ['dock'] },
];

/** How many option sets publish at once (#speed): each `dotnet publish` of the tiny app is one MSBuild process, ~700 MB at worst; never more than the sets, never under 1. PK_EXTRAS_JOBS overrides (1 = one after another, as before). */
export const publishJobs = ({ freeBytes = os.freemem(), env = process.env } = {}) => {
    const forced = Number(env.PK_EXTRAS_JOBS);
    if (Number.isInteger(forced) && forced > 0) return Math.min(forced, SETS.length);
    return Math.max(1, Math.min(SETS.length, Math.floor(freeBytes / 2 ** 20 / 700)));
};

/** Runs `worker(item, index)` over `items` with at most `limit` at once; resolves the results in the order of `items`. A rejection rejects the whole run after the running ones settle. */
export async function pool(items, limit, worker) {
    const out = new Array(items.length);
    let next = 0, failed = null;
    const lane = async () => { while (next < items.length && !failed) { const i = next++; try { out[i] = await worker(items[i], i); } catch (e) { failed ??= e; } } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
    if (failed) throw failed;
    return out;
}

const claimed = (claim, file) => (claim.endsWith('/') ? file.startsWith(claim) : file === claim);

/** The files of `universe` (paths relative to plainkit/) that the Blazor option `name` covers. A file can be covered by two options (the gallery option covers gallery/, and dock names its own gallery/elements/dock.data.js): it is served only when both are declared, as the Remove lines of the targets file drop it when either is not. */
export function filesOfExtra(name, packages, universe) {
    const pkg = packages.find(p => p.blazorOption === name);
    const cs = pkg ? claims(pkg) : [];
    return universe.filter(f => cs.some(c => claimed(c, f)));
}

/** Problems with what a set published: an extra's files must be there when declared and absent when not; core files always. `published` and `universe` are paths relative to plainkit/. Pure. */
export function checkSet(set, published, universe, packages) {
    const problems = [];
    const have = new Set(published);
    const options = packages.filter(p => p.blazorOption).map(p => p.blazorOption);
    const owned = new Set();
    const covers = f => options.filter(n => filesOfExtra(n, packages, [f]).length);
    const wanted = f => covers(f).every(n => set.declared === 'all' || set.declared.includes(n));
    for (const name of options) {
        const files = filesOfExtra(name, packages, universe);
        files.forEach(f => owned.add(f));
        const declared = set.declared === 'all' || set.declared.includes(name);
        const missing = files.filter(f => wanted(f) && !have.has(f)), present = files.filter(f => have.has(f));
        if (declared && missing.length) problems.push(`${set.id}: the ${name} extra is declared but ${missing.length} of its files were not published (first: ${missing[0]})`);
        if (!declared && present.length) problems.push(`${set.id}: the ${name} extra is not declared but ${present.length} of its files were published (first: ${present[0]}); check the Remove lines of Generated/PlainKit.Blazor.targets (node scripts/generate-blazor.mjs)`);
    }
    const lost = universe.filter(f => !owned.has(f) && !have.has(f));
    if (lost.length) problems.push(`${set.id}: ${lost.length} core file(s) were not published (first: ${lost[0]}); an extra's Remove pattern is too wide`);
    return problems;
}

/** Problems with the measured payload against packages.json blazorPayload. Pure. */
export function checkPayload(measured, ceilings) {
    const problems = [];
    for (const k of ['coreOnly', 'full']) {
        if (!ceilings || typeof ceilings[k] !== 'number') problems.push(`packages.json has no blazorPayload.${k}: run node scripts/blazor-extras-publish.mjs --write (measured ${measured[k]} bytes)`);
        else if (measured[k] > ceilings[k]) problems.push(`the ${k} payload is ${measured[k]} gzip bytes, over the ceiling ${ceilings[k]} (packages.json blazorPayload): make the source smaller; ceilings are never raised`);
    }
    if (!(measured.coreOnly < measured.full)) problems.push(`the core-only payload (${measured.coreOnly}) is not smaller than the full payload (${measured.full}): the extras' files are not being dropped`);
    return problems;
}

const run = (cmd, args, cwd) => {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'dotnet' });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(-4000));
    return r.stdout;
};

const runAsync = (cmd, args, cwd) => new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' && cmd === 'dotnet', windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('error', e => reject(new Error(`${cmd} ${args.join(' ')} failed:\n${e.message}`)));
    p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out}`.slice(-4000)))));
});

const walk = (dir, rel = '') => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name]) : [];

async function publishSet(set, tmp, feed, version, gzipOf) {
    const app = path.join(tmp, set.id);
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'app.csproj'), `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    ${set.extras ? `<PlainKitExtras>${set.extras}</PlainKitExtras>` : ''}
    <RestoreSources>${feed}</RestoreSources>
    <RestorePackagesPath>${path.join(tmp, set.id, 'packages')}</RestorePackagesPath>
  </PropertyGroup>
  <ItemGroup><PackageReference Include="PlainKit.Blazor" Version="${version}" /></ItemGroup>
</Project>
`);
    fs.writeFileSync(path.join(app, 'Program.cs'), 'var app = WebApplication.CreateBuilder(args).Build();\napp.Run();\n');
    await runAsync('dotnet', ['publish', '-c', 'Release', '-o', 'out', '--nologo', '-v', 'q'], app);
    const served = path.join(app, 'out', 'wwwroot', '_content', 'PlainKit.Blazor');
    const files = walk(served).filter(f => !/\.(br|gz)$/.test(f));
    const gzip = files.reduce((n, f) => n + gzipOf(fs.readFileSync(path.join(served, f))), 0);
    return { published: files.filter(f => f.startsWith('plainkit/')).map(f => f.slice('plainkit/'.length)), gzip };
}

export async function main(argv) {
    const write = argv.includes('--write');
    const pi = argv.indexOf('--package');
    const { data, packages } = loadPackages(root);
    const universe = walk(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit'));
    const version = fs.readFileSync(path.join(root, 'core', 'VERSION'), 'utf8').trim();
    const tmp = makeTempDir('pk-extras-');
    try {
        let feed = pi >= 0 ? path.resolve(argv[pi + 1]) : path.join(tmp, 'feed');
        if (pi < 0) run('dotnet', ['pack', 'blazor/src/PlainKit.Blazor', '-c', 'Release', '-o', feed, '--nologo'], root);
        const problems = [], sizes = {};
        const sizesByHash = new Map(); // the sets publish mostly identical files: the same bytes give the same gzip length
        const gzipOf = bytes => { const h = createHash('sha256').update(bytes).digest('hex'); if (!sizesByHash.has(h)) sizesByHash.set(h, zlib.gzipSync(bytes, { level: 9 }).length); return sizesByHash.get(h); };
        const jobs = publishJobs();
        if (jobs > 1) console.log(`publishing ${SETS.length} option sets, ${jobs} at a time`);
        const results = await pool(SETS, jobs, set => publishSet(set, tmp, feed, version, gzipOf));
        SETS.forEach((set, i) => {
            const r = results[i];
            sizes[set.id] = r.gzip;
            problems.push(...checkSet(set, r.published, universe, packages));
            console.log(`${set.id.padEnd(8)} ${String(r.published.length).padStart(4)} files under plainkit/, ${r.gzip} gzip bytes`);
        });
        const measured = { coreOnly: sizes.core, full: sizes.full };
        if (sizes.default !== sizes.full) problems.push(`no declaration (${sizes.default} bytes) is not the same as full (${sizes.full}): nothing declared must mean everything`);
        if (write) {
            const old = data.blazorPayload ?? {};
            const next = {};
            for (const k of ['coreOnly', 'full']) {
                const want = Math.ceil(measured[k] * 1.01);
                next[k] = typeof old[k] === 'number' ? Math.min(old[k], want) : want;
            }
            data.blazorPayload = next;
            const file = path.join(root, 'packages.json');
            const text = fs.readFileSync(file, 'utf8');
            const crlf = text.includes('\r\n');
            const out = JSON.stringify(data, null, 2) + '\n';
            fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
            console.log(`packages.json blazorPayload: ${JSON.stringify(next)}`);
        } else problems.push(...checkPayload(measured, data.blazorPayload));
        if (problems.length) { console.error(`FIX:\n- ${problems.join('\n- ')}`); return 1; }
        console.log(`blazor extras publish: ${SETS.length} option sets ok, payload core-only ${measured.coreOnly} / full ${measured.full} gzip bytes`);
        return 0;
    } catch (e) { console.error(e.message); return 2; } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
