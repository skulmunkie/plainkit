// Asserts what is inside the PlainKit.Blazor NuGet package. Node only, no dependencies (it reads the .nupkg zip itself).
//
//   node scripts/check-package.mjs <folder-or-.nupkg>     e.g. after: dotnet pack blazor/src/PlainKit.Blazor -c Release -o <folder>
//
// The package must have: the DLL and its XML docs, the README, the toolkit as static web assets (staticwebassets/plainkit/) with both agent skills,
// and the version of core/VERSION (in the file name and in the nuspec). It must NOT declare a frameworkReference (Blazor WebAssembly cannot use one) and must NOT have content/ or contentFiles/ entries (they would be copied
// into a consumer's project; the generator manifest belongs to the repository, see PlainKit.Blazor.csproj).
// Exit code: 0 ok, 1 the package is wrong (each problem says what to change), 2 could not read it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED = [
    [/^lib\/[^/]+\/PlainKit\.Blazor\.dll$/, 'the assembly (lib/<tfm>/PlainKit.Blazor.dll)'],
    [/^lib\/[^/]+\/PlainKit\.Blazor\.xml$/, 'the XML docs (GenerateDocumentationFile)'],
    [/^README\.md$/, 'README.md (PackageReadmeFile)'],
    [/^staticwebassets\/plainkit\/manifest\.json$/, 'the toolkit as static web assets (run node scripts/bootstrap.mjs before packing: wwwroot/plainkit is generated)'],
    [/^staticwebassets\/plainkit\/plainkit\.css$/, 'staticwebassets/plainkit/plainkit.css'],
    [/^staticwebassets\/plainkit\/skills\/plainkit-sdk\/SKILL\.md$/, 'the plainkit-sdk skill'],
    [/^staticwebassets\/plainkit\/skills\/plainkit-blazor\/SKILL\.md$/, 'the plainkit-blazor skill'],
];
export const FORBIDDEN = [
    [/^content\//, 'content/ (an MSBuild Content item is being packed; see the Content Remove in PlainKit.Blazor.csproj)'],
    [/^contentFiles\//, 'contentFiles/ (an MSBuild Content item is being packed; see the Content Remove in PlainKit.Blazor.csproj)'],
];

/** Problems with a package, from its entry names, its nuspec text, its file name and the expected version. Pure. */
export function checkPackage({ entries, nuspec, fileName, version }) {
    const problems = [];
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
    return { entries: zipEntries.map(e => e.name), nuspec, fileName: path.basename(file), version };
}

/** The one .nupkg in a folder (or the file itself). */
export function findNupkg(target) {
    if (fs.statSync(target).isFile()) return target;
    const files = fs.readdirSync(target).filter(f => f.endsWith('.nupkg') && !f.endsWith('.symbols.nupkg'));
    if (files.length !== 1) throw new Error(`expected exactly one .nupkg in ${target}, found ${files.length}`);
    return path.join(target, files[0]);
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
    console.log(`${info.fileName}: ${info.entries.length} entries, version ${info.version}, no content/ or contentFiles/, static web assets and skills present`);
}
