// The Blazor option model, end to end (#1656 phase 2): publishes a tiny app that references the PlainKit.Blazor package once per option set and asserts
// which static web assets land in the published output, then measures the payload (gzip bytes of everything the package serves).
//
//   node scripts/blazor-extras-publish.mjs                      pack, publish four apps, check the files and the payload ceilings
//   node scripts/blazor-extras-publish.mjs --package <dir>      use the PlainKit.Blazor nupkg already in <dir> (verify.mjs's pack check does)
//   node scripts/blazor-extras-publish.mjs --write              also record the measured payload in packages.json (blazorPayload; it only ever goes down)
//
// Option sets: none declared and `full` (everything), `core` (no extra), `dock` (one extra). The ceilings are packages.json "blazorPayload" { coreOnly, full }:
// the measured gzip bytes plus 1 percent when first recorded, then a one-way ratchet like the npm ceilings. Exit 0 ok, 1 a problem (each says what to change), 2 could not run.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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

const claimed = (claim, file) => (claim.endsWith('/') ? file.startsWith(claim) : file === claim);

/** The files of `universe` (paths relative to plainkit/) that belong to the Blazor option `name`. */
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
    for (const name of options) {
        const files = filesOfExtra(name, packages, universe);
        files.forEach(f => owned.add(f));
        const declared = set.declared === 'all' || set.declared.includes(name);
        const missing = files.filter(f => !have.has(f)), present = files.filter(f => have.has(f));
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

const walk = (dir, rel = '') => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name]) : [];

function publishSet(set, tmp, feed, version) {
    const app = path.join(tmp, set.id);
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'app.csproj'), `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    ${set.extras ? `<PlainKitExtras>${set.extras}</PlainKitExtras>` : ''}
    <RestoreSources>${feed}</RestoreSources>
    <RestorePackagesPath>${path.join(tmp, 'packages')}</RestorePackagesPath>
  </PropertyGroup>
  <ItemGroup><PackageReference Include="PlainKit.Blazor" Version="${version}" /></ItemGroup>
</Project>
`);
    fs.writeFileSync(path.join(app, 'Program.cs'), 'var app = WebApplication.CreateBuilder(args).Build();\napp.Run();\n');
    run('dotnet', ['publish', '-c', 'Release', '-o', 'out', '--nologo', '-v', 'q'], app);
    const served = path.join(app, 'out', 'wwwroot', '_content', 'PlainKit.Blazor');
    const files = walk(served).filter(f => !/\.(br|gz)$/.test(f));
    const gzip = files.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(served, f)), { level: 9 }).length, 0);
    return { published: files.filter(f => f.startsWith('plainkit/')).map(f => f.slice('plainkit/'.length)), gzip };
}

export function main(argv) {
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
        for (const set of SETS) {
            const r = publishSet(set, tmp, feed, version);
            sizes[set.id] = r.gzip;
            problems.push(...checkSet(set, r.published, universe, packages));
            console.log(`${set.id.padEnd(8)} ${String(r.published.length).padStart(4)} files under plainkit/, ${r.gzip} gzip bytes`);
        }
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
