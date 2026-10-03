// Asserts what is inside the PlainKit.Blazor NuGet package. Node only, no dependencies (it reads the .nupkg zip itself).
//
//   node scripts/check-package.mjs <folder-or-.nupkg>     e.g. after: dotnet pack blazor/src/PlainKit.Blazor -c Release -o <folder>
//
// The package must have: the DLL and its XML docs, the README, the toolkit as static web assets (staticwebassets/plainkit/, the runtime, with the dev-tool modules as their own
// unit under modules/, which the Blazor wrappers import) with both agent skills,
// and the version of core/VERSION (in the file name and in the nuspec). It must NOT declare a frameworkReference (Blazor WebAssembly cannot use one) and must NOT have content/ or contentFiles/ entries (they would be copied
// into a consumer's project; the generator manifest belongs to the repository, see PlainKit.Blazor.csproj).
// Exit code: 0 ok, 1 the package is wrong (each problem says what to change), 2 could not read it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED = [
    [/^lib\/[^/]+\/PlainKit\.Blazor\.dll$/, 'the assembly (lib/<tfm>/PlainKit.Blazor.dll)'],
    [/^lib\/[^/]+\/PlainKit\.Blazor\.xml$/, 'the XML docs (GenerateDocumentationFile)'],
    [/^README\.md$/, 'README.md (PackageReadmeFile)'],
    [/^staticwebassets\/plainkit\/manifest\.json$/, 'the toolkit as static web assets (run node scripts/bootstrap.mjs before packing: wwwroot/plainkit is generated)'],
    [/^staticwebassets\/plainkit\/plainkit\.css$/, 'staticwebassets/plainkit/plainkit.css'],
    // The dev tools (dock, theme editor, log viewer, layout builder) are the modules unit, dist/modules/ with its own manifest: the wrappers import them from here.
    [/^staticwebassets\/plainkit\/modules\/manifest\.json$/, 'the modules unit manifest (staticwebassets/plainkit/modules/manifest.json)'],
    ...['devtools/devtools.js', 'theme-editor/theme-editor.js', 'logs/logs.js', 'layout-builder/layout-builder.js', 'scorecard/scorecard.js'].map(f => [new RegExp(`^staticwebassets/plainkit/modules/${f.replace(/[.]/g, '\\.')}$`), `the ${f.split('/')[0]} module (staticwebassets/plainkit/modules/${f})`]),
    [/^staticwebassets\/plainkit\/skills\/plainkit-sdk\/SKILL\.md$/, 'the plainkit-sdk skill'],
    [/^staticwebassets\/plainkit\/skills\/plainkit-blazor\/SKILL\.md$/, 'the plainkit-blazor skill'],
    // #768: the tier namespaces and the old-name aliases as <Using> items (generated into Generated/PlainKit.Blazor.targets; see PlainKit.Blazor.csproj). buildTransitive only: both folders would import two copies.
    [/^buildTransitive\/PlainKit\.Blazor\.targets$/, 'buildTransitive/PlainKit.Blazor.targets (the tier <Using> items; run node scripts/bootstrap.mjs before packing, and keep the None Include in PlainKit.Blazor.csproj)'],
];
export const FORBIDDEN = [
    [/^content\//, 'content/ (an MSBuild Content item is being packed; see the Content Remove in PlainKit.Blazor.csproj)'],
    [/^contentFiles\//, 'contentFiles/ (an MSBuild Content item is being packed; see the Content Remove in PlainKit.Blazor.csproj)'],
    [/^build\/PlainKit\.Blazor\.targets$/, 'build/PlainKit.Blazor.targets (a second copy of the buildTransitive targets: its <Using> aliases would be imported twice, an error)'],
    // Design-time/editor files (#186): IDE tooling metadata and the exported agent docs are useful to npm/CDN consumers' editors and are shipped
    // separately as skills/dist release assets (#36), but nothing at runtime (no Blazor component, PkRuntime or dev tool) ever fetches them, so
    // scripts/publish-dist.mjs excludes them from the wwwroot/plainkit copy entirely; they must never come back as static web assets here.
    ...['custom-elements.json', 'web-types.json', 'vscode.html-custom-data.json', 'elements.d.ts', 'elements.vue.d.ts', 'AGENTS.md', 'llms.txt', 'llms-full.txt']
        .map(f => [new RegExp(`^staticwebassets/plainkit/${f.replace(/[.]/g, '\\.')}$`), `staticwebassets/plainkit/${f} (design-time/editor file, must be excluded by scripts/publish-dist.mjs; see #186)`]),
    // The `plainkit audit` CLI is a Node program shipped through npm's `bin` entry (core/package.json); the design
    // (2026-09-28-conformance-audit-cli-design.md, "Blazor package") says the NuGet package does not ship it - the Blazor skill
    // documents `npx plainkit audit` instead. scripts/publish-dist.mjs excludes dist/tools/** from wwwroot/plainkit for this (#518 A-10a).
    [/^staticwebassets\/plainkit\/tools\//, 'staticwebassets/plainkit/tools/ (the audit CLI must not ship in the Blazor package; see scripts/publish-dist.mjs)'],
];

/** The tier namespaces the targets file must import (#768); the generator's TIER_NAMESPACES without the root. */
export const TIER_USINGS = ['PlainKit.Blazor.Components', 'PlainKit.Blazor.Pages', 'PlainKit.Blazor.Shells'];

/** Problems with a package, from its entry names, its nuspec text, its file name, the expected version and (when known) the text of buildTransitive/PlainKit.Blazor.targets. Pure. */
export function checkPackage({ entries, nuspec, fileName, version, targets }) {
    const problems = [];
    if (targets !== undefined) for (const ns of TIER_USINGS) if (!targets.includes(`<Using Include="${ns}" />`)) problems.push(`buildTransitive/PlainKit.Blazor.targets has no <Using Include="${ns}" /> (the tier namespaces are generated by node scripts/generate-blazor.mjs)`);
    for (const [re, what] of REQUIRED) if (!entries.some(e => re.test(e))) problems.push(`missing ${what}`);
    for (const [re, what] of FORBIDDEN) { const hit = entries.find(e => re.test(e)); if (hit) problems.push(`must not contain ${what}: found ${hit}`); }
    const m = /<version>([^<]+)<\/version>/.exec(nuspec ?? '');
    if (!m) problems.push('the nuspec has no <version>');
    else if (m[1].trim() !== version) problems.push(`the nuspec version is ${m[1].trim()} but core/VERSION is ${version} (Directory.Build.props reads core/VERSION)`);
    // A FrameworkReference in the nuspec makes a Blazor WebAssembly app fail to restore (NETSDK1082: no runtime pack for Microsoft.AspNetCore.App on browser-wasm).
    // The server framework stays a private compile-time reference (PrivateAssets=all in PlainKit.Blazor.csproj); a Blazor Server app has it from its own SDK.
    if (/<frameworkReference/i.test(nuspec ?? '')) problems.push('the nuspec declares a frameworkReference: a Blazor WebAssembly app cannot restore it (keep <FrameworkReference Include="Microsoft.AspNetCore.App" PrivateAssets="all" /> in PlainKit.Blazor.csproj)');
    if (fileName && !fileName.endsWith(`.${version}.nupkg`)) problems.push(`the file name ${fileName} does not end with .${version}.nupkg`);
    return problems;
}

/** Entries of a zip: [{ name, method, csize, offset }] from the central directory. Enough for a .nupkg (no zip64, no encryption). */
export function listZip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
        const offset = buf.readUInt32LE(p + 42);
        out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), method, csize, offset });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

/** The bytes of one entry. */
export function readEntry(buf, entry) {
    const p = entry.offset;
    const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    const raw = buf.subarray(start, start + entry.csize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return zlib.inflateRawSync(raw);
    throw new Error(`unsupported zip method ${entry.method} for ${entry.name}`);
}

export function inspectNupkg(file, version) {
    const buf = fs.readFileSync(file);
    const zipEntries = listZip(buf);
    const nuspecEntry = zipEntries.find(e => /^[^/]+\.nuspec$/.test(e.name));
    const nuspec = nuspecEntry ? readEntry(buf, nuspecEntry).toString('utf8') : '';
    const targetsEntry = zipEntries.find(e => e.name === 'buildTransitive/PlainKit.Blazor.targets');
    const targets = targetsEntry ? readEntry(buf, targetsEntry).toString('utf8') : undefined;
    return { entries: zipEntries.map(e => e.name), nuspec, fileName: path.basename(file), version, targets };
}

/** The one .nupkg in a folder (or the file itself). */
export function findNupkg(target) {
    if (fs.statSync(target).isFile()) return target;
    const files = fs.readdirSync(target).filter(f => f.endsWith('.nupkg') && !f.endsWith('.symbols.nupkg'));
    if (files.length !== 1) throw new Error(`expected exactly one .nupkg in ${target}, found ${files.length}`);
    return path.join(target, files[0]);
}

// The npm package (`plainkit`, published from core/) is the CLI's real home: core/package.json's `bin` points at
// dist/tools/audit/cli.mjs and `files` is `["dist", ...]`. Nothing checked this before #518 A-10a - a step that stopped
// building dist/tools (or a files/bin edit that dropped it) would only surface once a consumer ran `npx plainkit audit`.
export const NPM_REQUIRED = [
    [/^dist\/tools\/audit\/cli\.mjs$/, 'the audit CLI entry point (dist/tools/audit/cli.mjs; core/package.json "bin")'],
    [/^dist\/tools\/audit\/rules\.mjs$/, 'the audit rule table (dist/tools/audit/rules.mjs)'],
    [/^dist\/tools\/strict\/engine\.mjs$/, 'the engine the audit CLI is built on (dist/tools/strict/engine.mjs)'],
];

/** Problems with the npm package's file list (as `npm pack --dry-run` reports it): the CLI's own files, and the `bin` field pointing at one of them. Pure. */
export function checkNpmPackage(files, pkg) {
    const problems = [];
    for (const [re, what] of NPM_REQUIRED) if (!files.some(f => re.test(f))) problems.push(`missing ${what}`);
    const bin = typeof pkg?.bin === 'object' ? Object.values(pkg.bin)[0] : pkg?.bin;
    if (!bin) problems.push('core/package.json has no "bin" entry for the audit CLI');
    else if (!files.includes(bin)) problems.push(`"bin" points at ${bin}, which is not in the packed files`);
    return problems;
}

/** The file list npm would publish for core/ ({@link checkNpmPackage}'s `files`), via `npm pack --dry-run --json`. */
export function npmPackFiles(coreDir) {
    // `npm` itself is a .cmd/shell script on Windows, so it needs a shell to resolve via PATH; passed as one string (no interpolated
    // arguments) so there is nothing to inject and no need for the array-plus-shell form node warns about.
    const r = spawnSync('npm pack --dry-run --json --loglevel=silent', { cwd: coreDir, encoding: 'utf8', shell: true });
    if (r.error) throw new Error(`npm pack --dry-run failed to run: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`npm pack --dry-run failed: ${r.stderr || r.stdout}`);
    const [{ files }] = JSON.parse(r.stdout);
    return files.map(f => f.path);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const target = process.argv[2];
    if (!target) { console.error('usage: node scripts/check-package.mjs <folder-or-.nupkg>   (after: dotnet pack blazor/src/PlainKit.Blazor -c Release -o <folder>)'); process.exit(2); }
    let info;
    try {
        const version = fs.readFileSync(path.join(root, 'core', 'VERSION'), 'utf8').trim();
        info = inspectNupkg(findNupkg(target), version);
    } catch (e) { console.error(`check-package: ${e.message}`); process.exit(2); }
    const problems = checkPackage(info);
    if (problems.length) { console.error(`${info.fileName} is not right:\n- ${problems.join('\n- ')}`); process.exit(1); }

    let npmProblems;
    try {
        const files = npmPackFiles(path.join(root, 'core'));
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'core', 'package.json'), 'utf8'));
        npmProblems = checkNpmPackage(files, pkg);
    } catch (e) { console.error(`check-package: npm package check failed: ${e.message}`); process.exit(2); }
    if (npmProblems.length) { console.error(`the npm package (core/) is not right:\n- ${npmProblems.join('\n- ')}`); process.exit(1); }

    console.log(`${info.fileName}: ${info.entries.length} entries, version ${info.version}, no content/ or contentFiles/, static web assets and skills present`);
    console.log('npm package (core/): audit CLI entry point and files present');
}
