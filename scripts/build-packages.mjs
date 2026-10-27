// Assembles the release packages declared in packages.json from core/dist (spec 2026-10-20-separate-packages-design.md, #1656, phase 1). A package is a folder
// (the same relative layout as dist/, so unzipping an extra over the core folder reproduces the full tree), a zip and a manifest. Node only, no dependencies;
// nothing here publishes anything. Phase 1 builds `plainkit` (core) and `plainkit.tools`; a package whose packages.json entry has "built": false is
// still shipped inside core (its files are folded in), until the phase that builds it.
//
//   node scripts/build-packages.mjs                       write the folders to dist-packages/<id>/ (generated, not in git)
//   node scripts/build-packages.mjs --zips <dir>          also write <dir>/<zip name> and <dir>/<id>-manifest-<version>.json for every package (the release assets)
//   node scripts/build-packages.mjs --pages <siteDir>     copy every extra (not core, which Pages serves as dist/) to <siteDir>/packages/<id>/ (scripts/build-pages.mjs calls this)
//   node scripts/check-package.mjs --zips <dir>          (the checker) the zips in <dir> against core/dist and packages.json
//
// Each package carries <id>.manifest.json at its root: every file of the package with its size and SRI hash, and (for an extra) `requires` core at the exact version.
// It is named by the id, not manifest.json, so unzipping an extra over the core folder never replaces core's own manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTempDir } from '../core/tools/tempdir.mjs';
import { REPO, CORE_ID, loadPackages, distFiles, ownersOf } from './packages.mjs';

const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01: a zip of the same files is the same bytes
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip (deflate, sorted, fixed timestamp) of entries [{ path, data: Buffer }]; no zip64. */
export function zipDeflate(entries) {
    const locals = [], centrals = []; let offset = 0;
    for (const { path: p, data } of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) {
        const name = Buffer.from(p, 'utf8'), crc = crc32(data);
        let body = zlib.deflateRawSync(data, { level: 9 }), method = 8;
        if (body.length >= data.length) { body = data; method = 0; }
        const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(method, 8); l.writeUInt16LE(0, 10); l.writeUInt16LE(DOS_DATE, 12);
        l.writeUInt32LE(crc, 14); l.writeUInt32LE(body.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(name.length, 26);
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(DOS_DATE, 14);
        c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
        locals.push(l, name, body); centrals.push(c, name); offset += 30 + name.length + body.length;
    }
    const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
}

export const readVersion = repo => fs.readFileSync(path.join(repo, 'core', 'VERSION'), 'utf8').trim();
export const zipName = (id, version) => (id === CORE_ID ? `plainkit-${version}.zip` : `${id}-${version}.zip`);
export const manifestName = (id, version) => `${id}-manifest-${version}.json`;

const sri = data => 'sha256-' + crypto.createHash('sha256').update(data).digest('base64');

/** The built packages and the dist files each carries: [{ id, files: [dist-relative paths] }]. A file owned by a package that is not built yet stays in core. */
export function plan(repo = REPO) {
    const { data, packages } = loadPackages(repo);
    const built = new Set(packages.filter(p => p.built).map(p => p.id));
    const files = distFiles(path.join(repo, 'core', 'dist'));
    const own = new Map([...built].map(id => [id, []]));
    for (const f of files) { const o = ownersOf(f, packages)[0]; own.get(built.has(o) ? o : CORE_ID).push(f); }
    return { data, packages, built, artifacts: packages.filter(p => built.has(p.id)).map(p => ({ id: p.id, files: own.get(p.id) })) };
}

/** The artifacts with their bytes, generated files included: [{ id, entries: [{ path, data }], manifest }]. */
export async function assemble(repo = REPO) {
    const { manifestText } = await import(pathToFileURL(path.join(repo, 'core', 'js', 'custom-sdk-files.js')).href);
    const dist = path.join(repo, 'core', 'dist'), version = readVersion(repo), { artifacts } = plan(repo);
    return artifacts.map(({ id, files }) => {
        let entries = files.map(f => ({ path: f, data: fs.readFileSync(path.join(dist, f)) }));
        {
            // manifest.extras.json lists the release's extra files (gallery, docs, and the tool helpers). plainkit.tools claims it (a core-only Blazor app does not serve it): a zip's copy lists only what that zip carries.
            const have = new Set(files), i = entries.findIndex(e => e.path === 'manifest.extras.json');
            if (i >= 0) {
                const m = JSON.parse(entries[i].data.toString('utf8')), keep = m.files.filter(f => have.has(f.path));
                entries[i] = { path: 'manifest.extras.json', data: Buffer.from(manifestText({ version, files: keep, name: m.name, requires: m.requires })) };
            }
        }
        const list = entries.map(e => ({ path: e.path, bytes: e.data.length, integrity: sri(e.data) }));
        const requires = id === CORE_ID ? undefined : `plainkit ${version} (exact): the files import the core runtime by relative path; unzip this over the plainkit folder, or load both from the same dist/ prefix`;
        const manifest = Buffer.from(manifestText({ version, files: list, name: id, requires }));
        entries.push({ path: `${id}.manifest.json`, data: manifest });
        return { id, entries: entries.sort((a, b) => (a.path < b.path ? -1 : 1)), manifest };
    });
}

/** Write the folders (outDir/<id>/) and, with zipDir, the release assets. Returns [{ id, files, zipBytes, rawBytes }]. */
export async function write({ repo = REPO, outDir, zipDir }) {
    const version = readVersion(repo), report = [];
    for (const a of await assemble(repo)) {
        if (outDir) { const root = path.join(outDir, a.id); fs.rmSync(root, { recursive: true, force: true }); for (const e of a.entries) { const t = path.join(root, e.path); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.data); } }
        const zip = zipDeflate(a.entries);
        if (zipDir) { fs.mkdirSync(zipDir, { recursive: true }); fs.writeFileSync(path.join(zipDir, zipName(a.id, version)), zip); fs.writeFileSync(path.join(zipDir, manifestName(a.id, version)), a.manifest); }
        report.push({ id: a.id, files: a.entries.length, rawBytes: a.entries.reduce((n, e) => n + e.data.length, 0), zipBytes: zip.length });
    }
    return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : path.resolve(process.argv[i + 1] ?? ''); };
    if (!fs.existsSync(path.join(REPO, 'core', 'dist', 'manifest.json'))) { console.error('core/dist is missing: run node scripts/bootstrap.mjs first'); process.exit(2); }
    {
        const site = arg('--pages');
        const outDir = site ? makeTempDir('pk-pkg-') : (arg('--out') ?? path.join(REPO, 'dist-packages'));
        const report = await write({ outDir, zipDir: arg('--zips') });
        if (site) {
            for (const r of report.filter(x => x.id !== CORE_ID)) fs.cpSync(path.join(outDir, r.id), path.join(site, 'packages', r.id), { recursive: true });
            fs.rmSync(outDir, { recursive: true, force: true });
        }
        for (const r of report) console.log(`${r.id.padEnd(16)} ${String(r.files).padStart(4)} files  ${String(r.rawBytes).padStart(9)} bytes  zip ${r.zipBytes}`);
    }
}
